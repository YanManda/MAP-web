const REQUIRED_SHEETS = ['Confluence_Sequence', 'Physicochemical_para', 'Annual_para', 'Application'];
const MODEL_CONFIGS = {
  media9: {
    label: '5种农业土壤/自然土壤/水体/沉积物/大气',
    media: [
      ['AsP', '水田土壤'], ['AsD', '旱田土壤'], ['AsV', '菜地土壤'],
      ['AsO', '果园土壤'], ['AsT', '茶园土壤'], ['Ns', '自然土壤'], ['W', '水体'], ['Sed', '沉积物'], ['A', '大气'],
    ],
    requiredColumns: {
      Annual_para: ['Year', 'WR_ID', 'FraW_S', 'FraG_S', 'u_wd', 'Area_A', 'Area_W/Sed', 'Area_Ns', 'Area_AsP', 'Area_AsD', 'Area_AsV', 'Area_AsO', 'Area_AsT', 'FraS_W', 'OC_Ns', 'OC_AsX', 'pHW_Ns', 'pHW_AsX', 'QW', 'Depth_W', 'ε_sur', 'ε_inf', 'u_eros'],
      Application: ['Compound', 'Year', 'WR_ID', 'AppS_AsP', 'AppS_AsD', 'AppS_AsV', 'AppS_AsO', 'AppS_AsT', 'AppA', 'AppW'],
    },
    guide: '9介质方案将农业土壤细分为水田、旱田、菜地、果园和茶园土壤。请使用9介质字段与示例文件。',
  },
  media6: {
    label: '农业/自然/城市土壤/水体/沉积物/大气',
    media: [['As', '农业土壤'], ['Ns', '自然土壤'], ['Us', '城市土壤'], ['W', '水体'], ['Sed', '沉积物'], ['A', '大气']],
    requiredColumns: {
      Annual_para: ['Year', 'WR_ID', 'FraW_S', 'FraG_S', 'u_wd', 'Area_A', 'Area_W/Sed', 'Area_Ns', 'Area_As', 'Area_Us', 'OC_Ns', 'OC_As', 'OC_Us', 'pHW_Ns', 'pHW_As', 'pHW_Us', 'ε_sur_Ns/As', 'ε_inf_Ns/As', 'u_eros_Ns/As', 'ε_sur_Us', 'ε_inf_Us', 'u_eros_Us', 'FraS_W', 'QW', 'Depth_W'],
      Application: ['Compound', 'Year', 'WR_ID', 'AppS_As', 'AppS_Us', 'AppA', 'AppW'],
    },
    guide: '6介质方案使用自然土壤、农业土壤和城市土壤三类土壤。请使用6介质字段与示例文件。',
  },
};
const APP_VERSION = '20261030-1';

const elements = {
  modelType: document.querySelector('#model-type'),
  mediaRiver: document.querySelector('#media-river'),
  example9: document.querySelector('#example9-link'),
  example6: document.querySelector('#example6-link'),
  workbook: document.querySelector('#workbook'),
  dropZone: document.querySelector('#drop-zone'),
  uploadTitle: document.querySelector('#upload-title'),
  uploadDetail: document.querySelector('#upload-detail'),
  uploadMessage: document.querySelector('#upload-message'),
  inputCompounds: document.querySelector('#input-compounds'),
  inputSpaces: document.querySelector('#input-spaces'),
  inputYears: document.querySelector('#input-years'),
  run: document.querySelector('#run-button'),
  cancel: document.querySelector('#cancel-button'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progress-label'),
  progressValue: document.querySelector('#progress-value'),
  progressBar: document.querySelector('#progress-bar'),
  progressNote: document.querySelector('#progress-note'),
  empty: document.querySelector('#empty-state'),
  error: document.querySelector('#error-state'),
  errorMessage: document.querySelector('#error-message'),
  content: document.querySelector('#result-content'),
  download: document.querySelector('#download-button'),
  resultCompound: document.querySelector('#result-compound'),
  metricSpaces: document.querySelector('#metric-spaces'),
  metricYears: document.querySelector('#metric-years'),
  metricMedia: document.querySelector('#metric-media'),
  finalYearLabel: document.querySelector('#final-year-label'),
  pie: document.querySelector('#mass-pie'),
  fluxYear: document.querySelector('#flux-year-label'),
  flux: document.querySelector('#flux-chart'),
  chart: document.querySelector('#mass-chart'),
};

let selectedFile = null;
let selectedMetadata = null;
let worker = null;
let outputUrl = null;
let resultSummary = null;
let chartData = null;
let fluxChartData = null;
let inputRevision = 0;
let isRunning = false;

elements.modelType.addEventListener('change', changeModelType);
elements.workbook.addEventListener('change', () => chooseFile(elements.workbook.files[0]));
['dragenter', 'dragover'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove('dragging');
}));
elements.dropZone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files[0]));
elements.run.addEventListener('click', runModel);
elements.cancel.addEventListener('click', cancelRun);
elements.resultCompound.addEventListener('change', () => renderCompound(elements.resultCompound.value));
elements.download.addEventListener('click', downloadResults);
window.addEventListener('resize', () => {
  if (chartData) drawMassChart(chartData);
  if (fluxChartData) drawFluxChart(fluxChartData);
});
renderModelType();

function currentModel() {
  return MODEL_CONFIGS[elements.modelType.value];
}

function changeModelType() {
  cancelRun();
  resetInputState();
  elements.workbook.value = '';
  elements.uploadTitle.textContent = '选择输入文件';
  elements.uploadDetail.textContent = '支持自定义文件名 · 文件不会离开浏览器';
  setUploadMessage();
  elements.error.hidden = true;
  elements.content.hidden = true;
  elements.empty.hidden = false;
  elements.download.hidden = true;
  resultSummary = null;
  chartData = null;
  fluxChartData = null;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  renderModelType();
}

function renderModelType() {
  const config = currentModel();
  elements.modelType.title = config.label;
  elements.mediaRiver.style.setProperty('--media-count', config.media.length);
  elements.mediaRiver.setAttribute('aria-label', `模型覆盖的${config.media.length}种环境介质`);
  elements.mediaRiver.innerHTML = '<div class="river-line" aria-hidden="true"></div>' + config.media.map(([code, label], index) =>
    `<span style="--media-color:${mediaColor(index / (config.media.length - 1))}">${escapeHtml(code)}<small>${escapeHtml(label)}</small></span>`
  ).join('');
  elements.example9.classList.toggle('is-current', elements.modelType.value === 'media9');
  elements.example6.classList.toggle('is-current', elements.modelType.value === 'media6');
}

function mediaColor(position) {
  const stops = [[0,[196,102,67]], [.48,[152,170,120]], [.82,[86,146,160]], [1,[21,63,58]]];
  const upper = stops.findIndex((stop, index) => index > 0 && position <= stop[0]);
  const [start, left] = stops[upper - 1];
  const [end, right] = stops[upper];
  const ratio = (position - start) / (end - start);
  return `rgb(${left.map((channel, index) => Math.round(channel + (right[index] - channel) * ratio)).join(',')})`;
}

async function chooseFile(file) {
  if (!file) return;
  if (isRunning) return;
  const revision = ++inputRevision;
  setUploadMessage();
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    resetInputState();
    const message = '请选择 .xlsx 格式的输入文件。';
    setUploadMessage(message);
    showError(message);
    return;
  }

  selectedFile = file;
  selectedMetadata = null;
  resultSummary = null;
  chartData = null;
  fluxChartData = null;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  elements.run.disabled = true;
  elements.content.hidden = true;
  elements.empty.hidden = false;
  elements.download.hidden = true;
  elements.uploadTitle.textContent = file.name;
  elements.uploadDetail.textContent = `${formatBytes(file.size)} · 正在读取工作簿结构`;
  elements.dropZone.classList.add('has-file');
  elements.error.hidden = true;
  resetInputStats();

  try {
    const metadata = await inspectWorkbook(file);
    if (revision !== inputRevision) return;
    selectedMetadata = metadata;
    updateInputStats(selectedMetadata);
    elements.uploadDetail.textContent = `${formatBytes(file.size)} · 已在本机完成结构校验`;
    elements.run.disabled = false;
  } catch (error) {
    if (revision !== inputRevision) return;
    selectedFile = null;
    elements.dropZone.classList.remove('has-file');
    elements.uploadDetail.textContent = '文件未通过结构校验，请参照输入指引';
    const message = error?.message || '无法读取输入文件。';
    setUploadMessage(message);
    showError(message);
  }
}

async function inspectWorkbook(file) {
  if (!globalThis.XLSX) throw new Error('工作簿解析组件加载失败，请刷新页面后重试。');
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: 'array' });
  const modelKey = elements.modelType.value;
  const config = MODEL_CONFIGS[modelKey];
  const missingSheets = REQUIRED_SHEETS.filter((name) => !workbook.SheetNames.includes(name));
  if (missingSheets.length) throw new Error(`缺少工作表：${missingSheets.join('、')}`);
  validateWorkbookColumns(workbook, config);

  const compounds = uniqueColumnValues(workbook, 'Physicochemical_para', 'Compound');
  const spaces = uniqueColumnValues(workbook, 'Annual_para', 'WR_ID');
  const years = uniqueColumnValues(workbook, 'Annual_para', 'Year');
  if (!compounds.length) throw new Error('Physicochemical_para 中没有有效的 Compound。');
  if (!spaces.length) throw new Error('Annual_para 中没有有效的 WR_ID。');
  if (!years.length) throw new Error('Annual_para 中没有有效的 Year。');

  return {
    modelKey,
    modelLabel: config.label,
    compounds: compounds.map(String),
    compoundCount: compounds.length,
    spaceCount: spaces.length,
    years: years.map(Number),
    yearCount: years.length,
  };
}

function validateWorkbookColumns(workbook, config) {
  Object.entries(config.requiredColumns).forEach(([sheetName, requiredColumns]) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
    const headers = new Set((rows[0] || []).map((value) => String(value).trim()));
    const missing = requiredColumns.filter((column) => !headers.has(column));
    if (missing.length) {
      throw new Error(`${config.label}方案的 ${sheetName} 缺少字段：${missing.join('、')}`);
    }
  });
}

function uniqueColumnValues(workbook, sheetName, columnName) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  return [...new Set(rows.map((row) => row[columnName]).filter((value) => value !== null && value !== ''))];
}

function updateInputStats(metadata) {
  elements.inputCompounds.textContent = `${metadata.compoundCount} 种`;
  elements.inputSpaces.textContent = `${metadata.spaceCount} 个`;
  elements.inputYears.textContent = `${metadata.yearCount} 年`;
}

function resetInputStats() {
  elements.inputCompounds.textContent = '—';
  elements.inputSpaces.textContent = '—';
  elements.inputYears.textContent = '—';
}

function resetInputState() {
  inputRevision += 1;
  selectedFile = null;
  selectedMetadata = null;
  elements.run.disabled = true;
  elements.dropZone.classList.remove('has-file');
  resetInputStats();
}

function setUploadMessage(message = '') {
  elements.uploadMessage.hidden = !message;
  elements.uploadMessage.textContent = message;
}

async function runModel() {
  if (!selectedFile || !selectedMetadata) return;
  setRunning(true);
  elements.empty.hidden = true;
  elements.error.hidden = true;
  elements.content.hidden = true;
  elements.download.hidden = true;
  setProgress(3, '正在读取参数工作簿…', '所有数据都留在当前浏览器标签页。');

  try {
    const workbook = await selectedFile.arrayBuffer();
    worker = new Worker(`./model-worker.js?v=${APP_VERSION}`, { type: 'module' });
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', (event) => finishWithError(event.message || '后台计算线程意外停止。'));
    worker.postMessage({ type: 'run', workbook, metadata: selectedMetadata }, [workbook]);
  } catch (error) {
    finishWithError(error.message);
  }
}

function handleWorkerMessage({ data }) {
  if (data.type === 'progress') {
    setProgress(data.value, data.label, data.note);
    return;
  }
  if (data.type === 'complete') {
    const bytes = data.workbook instanceof Uint8Array ? data.workbook : new Uint8Array(data.workbook);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    renderResults(data.summary);
    setRunning(false);
    elements.progress.hidden = true;
    elements.download.hidden = false;
    worker?.terminate();
    worker = null;
    return;
  }
  if (data.type === 'error') finishWithError(data.message);
}

function downloadResults() {
  if (!outputUrl) return;
  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = `MAP_results_${selectedMetadata?.modelKey || elements.modelType.value}.xlsx`;
  link.click();
}

function cancelRun() {
  worker?.terminate();
  worker = null;
  setRunning(false);
  elements.progress.hidden = true;
  elements.empty.hidden = false;
}

function finishWithError(message) {
  worker?.terminate();
  worker = null;
  setRunning(false);
  elements.progress.hidden = true;
  showError(message || '未知错误');
}

function setRunning(running) {
  isRunning = running;
  elements.run.disabled = running || !selectedFile || !selectedMetadata;
  elements.cancel.hidden = !running;
  elements.workbook.disabled = running;
  elements.modelType.disabled = running;
  elements.progress.hidden = !running;
}

function setProgress(value, label, note) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  elements.progressValue.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;
  if (label) elements.progressLabel.textContent = label;
  if (note) elements.progressNote.textContent = note;
}

function showError(message) {
  elements.empty.hidden = true;
  elements.content.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = cleanError(message);
}

function renderResults(summary) {
  resultSummary = summary;
  elements.error.hidden = true;
  elements.empty.hidden = true;
  elements.content.hidden = false;
  elements.metricSpaces.textContent = String(summary.spaceCount);
  elements.metricYears.textContent = formatYearRange(summary.years);
  elements.metricMedia.textContent = String(summary.mediaCount);
  elements.resultCompound.innerHTML = summary.compounds.map((compound) =>
    `<option value="${escapeHtml(compound)}">${escapeHtml(compound)}</option>`
  ).join('');
  renderCompound(summary.compounds[0]);
}

function renderCompound(compound) {
  if (!resultSummary) return;
  const data = resultSummary.byCompound[compound];
  if (!data) return;
  elements.resultCompound.value = compound;
  elements.finalYearLabel.textContent = `最终年份 · ${data.finalYear}`;
  chartData = data.massByYear;
  drawMassChart(chartData);

  renderMassPie(data);
  elements.fluxYear.textContent = `最终年份 · ${data.finalYear}`;

  fluxChartData = data.topFluxes.slice(0, 10);
  drawFluxChart(fluxChartData);
}

function renderMassPie(data) {
  const colors = ['#153f3a', '#718d6b', '#c46643', '#477f92', '#b8a362', '#8f799c', '#6b9991', '#d59a75', '#8d939c'];
  elements.pie.setAttribute('aria-label', `最终年份${data.finalYear}各介质质量占比：` + data.massByMedia.map(x => `${x.media} ${(x.share * 100).toFixed(2)}%`).join('，'));
  if (!(data.finalTotalMass > 0)) {
    elements.pie.innerHTML = '<svg viewBox="0 0 340 310" aria-hidden="true"><circle cx="170" cy="155" r="90" fill="#e5e9e6"/><text x="170" y="160" text-anchor="middle">无残留</text></svg>';
    return;
  }
  const cx = 170, cy = 155, radius = 90;
  let angle = -Math.PI / 2;
  const labels = [];
  const slices = data.massByMedia.map((item, index) => {
    const start = angle;
    angle += item.share * Math.PI * 2;
    const mid = (start + angle) / 2;
    const right = Math.cos(mid) >= 0;
    labels.push({text: `${item.media} ${(item.share * 100).toFixed(2)}%`, right, mid,
      desiredY: cy + Math.sin(mid) * 105});
    if (item.share <= 0) return '';
    if (item.share >= 1 - 1e-10) return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${colors[index]}"/>`;
    const x1 = cx + radius * Math.cos(start), y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(angle), y2 = cy + radius * Math.sin(angle);
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${item.share > .5 ? 1 : 0} 1 ${x2} ${y2} Z" fill="${colors[index]}"/>`;
  }).join('');
  // Spread small adjacent slices' labels vertically, without dropping any medium.
  for (const right of [false, true]) {
    const side = labels.filter(item => item.right === right).sort((a,b) => a.desiredY - b.desiredY);
    side.forEach((item,index) => { item.y = Math.max(20, item.desiredY, index ? side[index-1].y + 23 : 20); });
    for (let index=side.length-1; index>=0; index--) side[index].y = Math.min(side[index].y, index === side.length-1 ? 290 : side[index+1].y-23);
  }
  const annotations = labels.map(item => {
    const x1 = cx + radius * Math.cos(item.mid), y1 = cy + radius * Math.sin(item.mid);
    const shoulder = item.right ? 263 : 77;
    const end = item.right ? 268 : 72;
    const textX = item.right ? 271 : 69;
    return `<path d="M ${x1} ${y1} L ${shoulder} ${item.y} L ${end} ${item.y}" fill="none" stroke="#7c8981" stroke-width=".8"/><text x="${textX}" y="${item.y + 4}" text-anchor="${item.right ? 'start' : 'end'}">${escapeHtml(item.text)}</text>`;
  }).join('');
  elements.pie.innerHTML = `<svg viewBox="0 0 340 310" aria-hidden="true">${slices}${annotations}</svg>`;
}

function drawMassChart(data) {
  if (!data?.length) return;
  const canvas = elements.chart;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const width = bounds.width;
  const height = bounds.height;
  ctx.font = '12px Arial';
  const max = Math.max(...data.map(item => Number(item.value) || 0), Number.EPSILON) * 1.1;
  const tickWidth = Math.max(...Array.from({length:5}, (_, i) => ctx.measureText(compact(max * i / 4)).width));
  const pad = { top: 18, right: 20, bottom: 32, left: Math.ceil(tickWidth) + 12 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = data.map((item) => Number(item.value) || 0);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px Arial';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#dbe3de';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + innerH * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(compact(max * (1 - i / 4)), pad.left - 9, y + 3);
  }

  const points = data.map((item, index) => ({
    x: pad.left + (data.length === 1 ? innerW / 2 : innerW * index / (data.length - 1)),
    y: pad.top + innerH * (1 - (Number(item.value) || 0) / max),
    year: item.year,
  }));
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, 'rgba(21,63,58,.20)');
  gradient.addColorStop(1, 'rgba(21,63,58,0)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - pad.bottom);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = '#153f3a';
  ctx.lineWidth = 2;
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#c46643';
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    if (index % 2 === 0) ctx.fillText(String(point.year), point.x, height - 10);
  });
  drawAxes(ctx, pad.left, height - pad.bottom, width - 7, 7);
  canvas.setAttribute('aria-label', '区域残留总量折线图。横坐标标签：' + data.filter((_, index) => index % 2 === 0).map(item => item.year).join('、'));
}

function drawAxes(ctx, left, bottom, right, top) {
  ctx.save();
  ctx.strokeStyle = '#153f3a'; ctx.fillStyle = '#153f3a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(right, bottom); ctx.lineTo(right-7, bottom-4); ctx.lineTo(right-7, bottom+4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left-4, top+7); ctx.lineTo(left+4, top+7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawFluxChart(data) {
  const canvas = elements.flux;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const width = bounds.width, height = bounds.height;
  ctx.font = '11px Arial';
  const max = Math.max(...data.map(item => Number(item.value) || 0), Number.EPSILON) * 1.1;
  const min = Math.min(0, ...data.map(item => Number(item.value) || 0));
  const tickValue = index => min + (max-min) * index / 4;
  const tickWidth = Math.max(...Array.from({length:5}, (_, i) => ctx.measureText(compact(tickValue(i))).width));
  const labelWidth = Math.max(0, ...data.map(item => ctx.measureText(item.path).width));
  const pad = {left: Math.ceil(tickWidth)+10, top:18, right:18, bottom:Math.ceil(labelWidth)+20};
  const plotWidth = width-pad.left-pad.right, plotHeight = height-pad.top-pad.bottom;
  const y = value => pad.top + plotHeight*(1-(value-min)/(max-min));
  ctx.clearRect(0,0,width,height);
  ctx.strokeStyle = '#dbe3de'; ctx.lineWidth = 1; ctx.fillStyle = '#000'; ctx.textAlign = 'right';
  for (let i=0;i<=4;i++) {
    const value = tickValue(i), pos = y(value);
    ctx.beginPath(); ctx.moveTo(pad.left,pos); ctx.lineTo(width-pad.right,pos); ctx.stroke();
    ctx.fillText(compact(value),pad.left-6,pos+3);
  }
  const step = plotWidth / Math.max(1,data.length);
  data.forEach((item,index) => {
    const x = pad.left+step*(index+.5), barWidth = step*.65;
    ctx.fillStyle = '#477f70';
    ctx.fillRect(x-barWidth/2,Math.min(y(item.value),y(0)),barWidth,Math.max(1,Math.abs(y(0)-y(item.value))));
    ctx.save(); ctx.translate(x,height-pad.bottom+9); ctx.rotate(Math.PI/2);
    ctx.textAlign = 'left'; ctx.fillStyle = '#000'; ctx.fillText(item.path,0,3); ctx.restore();
  });
  drawAxes(ctx,pad.left,height-pad.bottom,width-6,7);
  canvas.setAttribute('aria-label','最终年份迁移转化通量前10名（kg/yr）：' + data.map(item => `${item.path} ${item.value}`).join('；'));
}

function formatYearRange(years) {
  if (!years?.length) return '—';
  return years.length === 1 ? String(years[0]) : `${years[0]}—${years.at(-1)} · ${years.length}年`;
}

function cleanError(message) {
  return String(message).replace(/^PythonError:\s*/i, '').split('\n').slice(-12).join('\n').slice(0, 1800);
}
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function scientific(value) {
  if (!Number(value)) return '0';
  const [coefficient, exponent] = Number(value).toExponential(2).split('e');
  return `${coefficient} × 10<sup>${Number(exponent)}</sup>`;
}
function compact(value) {
  if (!value) return '0';
  if (Math.abs(value) < 1e3 && Math.abs(value) >= .01) return Number(value).toPrecision(3);
  const [coefficient, exponent] = Number(value).toExponential(1).split('e');
  const superscript = {'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
  return `${coefficient} × 10${String(Number(exponent)).split('').map(x => superscript[x]).join('')}`;
}
function formatPath(path) { return path.replaceAll('_', ' · ').replace('T · ', '').replace('D · ', '扩散 · ').replace('R · ', '降解 · '); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

