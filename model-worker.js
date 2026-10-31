import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs';

const ROOT = new URL('./', self.location.href);
const APP_VERSION = '20261029-1';
const MODEL_CONFIGS = {
  media9: { file: 'MAP_WR_Media9.py', media: ['A', 'Ns', 'AsP', 'AsD', 'AsV', 'AsO', 'AsT', 'W', 'Sed'] },
  media6: { file: 'MAP_WR_Media6.py', media: ['A', 'Ns', 'As', 'Us', 'W', 'Sed'] },
};
const modelSourcePromises = new Map();
let runMetadata = { compoundCount: 1, yearCount: 1 };
let activeCompound = '';
let completedSteps = 0;
let stderrLines = [];

self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    runMetadata = data.metadata || runMetadata;
    const modelKey = runMetadata.modelKey || 'media9';
    if (!MODEL_CONFIGS[modelKey]) throw new Error(`未知的介质方案：${modelKey}`);
    completedSteps = 0;
    activeCompound = '';
    stderrLines = [];

    postProgress(7, '正在启动 Python 科学计算环境…', '首次加载通常需要一些时间。');
    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/' });
    pyodide.setStdout({ batched: handleOutput });
    pyodide.setStderr({ batched: (message) => { stderrLines.push(String(message)); stderrLines = stderrLines.slice(-15); console.warn(message); } });

    postProgress(16, '正在准备计算组件…', '首次准备可能需要一些时间，请稍候。');
    await pyodide.loadPackage(['numpy', 'pandas', 'micropip']);
    await pyodide.runPythonAsync("import micropip\nawait micropip.install('openpyxl==3.1.5')");
    postProgress(
      25,
      '正在校验参数工作簿…',
      `即将计算 ${runMetadata.compoundCount} 种成分、${runMetadata.yearCount} 个时间单元。`,
    );

    pyodide.FS.writeFile(modelKey === 'media6' ? 'Input_Para_6.xlsx' : 'Input_Para_9.xlsx', new Uint8Array(data.workbook));
    const modelSource = await getModelSource(modelKey);
    await pyodide.runPythonAsync(modelSource);

    postProgress(95, '正在整理图表和结果文件…', '计算已经完成，正在生成下载文件。');
    const summaryProxy = pyodide.globals.get('RESULT_SUMMARY');
    const summary = summaryProxy.toJs({ dict_converter: Object.fromEntries });
    summaryProxy.destroy();
    const output = pyodide.FS.readFile(modelKey === 'media6' ? 'Env_results_6.xlsx' : 'Env_results_9.xlsx');
    const transferable = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ type: 'complete', summary, workbook: transferable }, [transferable]);
  } catch (error) {
    console.error(error);
    const detail = error?.message || String(error);
    self.postMessage({ type: 'error', message: detail === '[object Object]' ? (stderrLines.join('\n') || '计算环境异常，请重新计算；若持续发生，请重新打开页面。') : detail });
  }
};

async function getModelSource(modelKey) {
  if (!modelSourcePromises.has(modelKey)) {
    const config = MODEL_CONFIGS[modelKey];
    const promise = fetch(new URL(`${config.file}?v=${APP_VERSION}`, ROOT)).then((response) => {
      if (!response.ok) throw new Error(`无法读取 ${config.file}。`);
      return response.text();
    }).then((source) => prepareModel(source, config.media));
    modelSourcePromises.set(modelKey, promise);
  }
  return modelSourcePromises.get(modelKey);
}

function prepareModel(source, mediaColumns) {
  const summaryCode = `
\n# Browser visualization summary
_media_columns = ${JSON.stringify(mediaColumns)}
_compounds = list(dict.fromkeys(massdata['Compound'].astype(str).tolist()))
_years = [int(value) for value in massdata['Year'].drop_duplicates().tolist()]
_by_compound = {}

for _compound in _compounds:
    _compound_mass = massdata[massdata['Compound'].astype(str) == _compound]
    _compound_flux = Fluxdata[Fluxdata['Compound'].astype(str) == _compound]
    _mass_year = _compound_mass.groupby('Year')[_media_columns].sum().sum(axis=1)
    _final_year = int(_compound_mass['Year'].max())
    _final_mass = _compound_mass[_compound_mass['Year'] == _final_year][_media_columns].sum()
    _final_total = float(_final_mass.sum())
    _flux_columns = [column for column in _compound_flux.columns if column not in ('Compound', 'Year', 'WR_ID')]
    _flux_totals = _compound_flux[_compound_flux['Year'] == _final_year][_flux_columns].sum().sort_values(ascending=False).head(10)
    _by_compound[_compound] = {
        'finalYear': _final_year,
        'massByYear': [{'year': int(year), 'value': float(value)} for year, value in _mass_year.items()],
        'finalTotalMass': _final_total,
        'massByMedia': [{'media': key, 'value': float(value), 'share': float(value / _final_total) if _final_total > 0 else 0.0} for key, value in _final_mass.items()],
        'topFluxes': [{'path': key, 'value': float(value)} for key, value in _flux_totals.items()],
    }

RESULT_SUMMARY = {
    'compounds': _compounds,
    'spaceCount': int(massdata['WR_ID'].nunique()),
    'years': _years,
    'mediaCount': len(_media_columns),
    'byCompound': _by_compound,
}
`;
  return source + summaryCode;
}

function handleOutput(message) {
  const compoundMatch = message.match(/Active ingredient[：:]\s*(.+)/);
  if (compoundMatch) {
    activeCompound = compoundMatch[1].trim();
    return;
  }

  const yearMatch = message.match(/(-?\d+(?:\.\d+)?): Completed/);
  if (!yearMatch) return;
  completedSteps += 1;
  const totalSteps = Math.max(1, runMetadata.compoundCount * runMetadata.yearCount);
  const year = yearMatch[1];
  const label = activeCompound ? `${activeCompound} · ${year} 年计算完成` : `${year} 年计算完成`;
  postProgress(
    25 + completedSteps / totalSteps * 66,
    label,
    `已完成 ${completedSteps} / ${totalSteps} 个成分—时间单元。`,
  );
}

function postProgress(value, label, note) {
  self.postMessage({ type: 'progress', value, label, note });
}
