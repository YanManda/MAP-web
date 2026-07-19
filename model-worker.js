import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs';

const ROOT = new URL('./', self.location.href);
let modelSourcePromise;

self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    postProgress(7, '正在启动 Python 科学计算环境…', '首次加载通常需要一些时间。');
    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/' });
    pyodide.setStdout({ batched: handleOutput });
    pyodide.setStderr({ batched: (message) => console.warn(message) });

    postProgress(16, '正在加载 NumPy、pandas 与 Excel 组件…', '计算组件由 Pyodide 官方发行版提供。');
    await pyodide.loadPackage(['numpy', 'pandas', 'micropip']);
    await pyodide.runPythonAsync("import micropip\nawait micropip.install('openpyxl==3.1.5')");
    postProgress(25, '正在校验参数工作簿…', '即将开始 9 个年度的流域迭代。');

    pyodide.FS.writeFile('ParaWR3.xlsx', new Uint8Array(data.workbook));
    pyodide.globals.set('TARGET_PESTICIDE', data.pesticide);
    const modelSource = await getModelSource();
    await pyodide.runPythonAsync(modelSource);

    postProgress(95, '正在整理图表和 Excel 结果…', '计算已经完成，正在生成下载文件。');
    const summaryProxy = pyodide.globals.get('RESULT_SUMMARY');
    const summary = summaryProxy.toJs({ dict_converter: Object.fromEntries });
    summaryProxy.destroy();
    const output = pyodide.FS.readFile('Env_results.xlsx');
    const transferable = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ type: 'complete', summary, workbook: transferable }, [transferable]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};

async function getModelSource() {
  if (!modelSourcePromise) {
    modelSourcePromise = fetch(new URL('MAP_WR3.py', ROOT)).then((response) => {
      if (!response.ok) throw new Error('无法读取 MAP_WR3.py。');
      return response.text();
    }).then(prepareModel);
  }
  return modelSourcePromise;
}

function prepareModel(source) {
  const summaryCode = `
\n# Browser visualization summary
_media_columns = ['A', 'Ns', 'AsP', 'AsD', 'AsV', 'AsO', 'AsT', 'W', 'Sed']
_mass_year = massdata.groupby('1year')[_media_columns].sum().sum(axis=1)
_final_year = int(condata['1year'].max())
_final_con = condata[condata['1year'] == _final_year][_media_columns].mean()
_flux_columns = [c for c in Fluxdata.columns if c not in ('1year', '3WR_ID')]
_flux_totals = Fluxdata[_flux_columns].abs().sum().sort_values(ascending=False).head(6)
RESULT_SUMMARY = {
    'pesticide': TARGET_PESTICIDE,
    'massByYear': [{'year': int(year), 'value': float(value)} for year, value in _mass_year.items()],
    'concentrationByMedia': [{'media': key, 'value': float(value)} for key, value in _final_con.items()],
    'topFluxes': [{'path': key, 'value': float(value)} for key, value in _flux_totals.items()],
}
`;
  return source + summaryCode;
}

function handleOutput(message) {
  const match = message.match(/(201\d|202[01]): Completed/);
  if (!match) return;
  const year = Number(match[1]);
  const completed = year - 2012;
  postProgress(25 + completed / 9 * 66, `${year} 年计算完成`, `已完成 ${completed} / 9 个模拟年度。`);
}

function postProgress(value, label, note) {
  self.postMessage({ type: 'progress', value, label, note });
}
