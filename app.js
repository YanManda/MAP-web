const elements = {
  workbook: document.querySelector('#workbook'),
  dropZone: document.querySelector('#drop-zone'),
  uploadTitle: document.querySelector('#upload-title'),
  uploadDetail: document.querySelector('#upload-detail'),
  pesticide: document.querySelector('#pesticide'),
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
  metricPesticide: document.querySelector('#metric-pesticide'),
  bars: document.querySelector('#concentration-bars'),
  flux: document.querySelector('#flux-list'),
  chart: document.querySelector('#mass-chart'),
};

const pesticideNames = { IMI: 'IMI · 吡虫啉', ACE: 'ACE · 啶虫脒', THM: 'THM · 噻虫嗪' };
let selectedFile = null;
let worker = null;
let outputUrl = null;
let chartData = null;

function chooseFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    showError('请选择 .xlsx 格式的 ParaWR3 工作簿。');
    return;
  }
  selectedFile = file;
  elements.uploadTitle.textContent = file.name;
  elements.uploadDetail.textContent = `${formatBytes(file.size)} · 已准备在本机读取`;
  elements.dropZone.classList.add('has-file');
  elements.run.disabled = false;
  elements.error.hidden = true;
}

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
elements.download.addEventListener('click', () => {
  if (!outputUrl) return;
  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = `Env_results_${elements.pesticide.value}.xlsx`;
  link.click();
});
window.addEventListener('resize', () => chartData && drawMassChart(chartData));

async function runModel() {
  if (!selectedFile) return;
  setRunning(true);
  elements.empty.hidden = true;
  elements.error.hidden = true;
  elements.content.hidden = true;
  elements.download.hidden = true;
  setProgress(3, '正在读取参数工作簿…', '所有数据都留在当前浏览器标签页。');

  try {
    const workbook = await selectedFile.arrayBuffer();
    worker = new Worker('./model-worker.js', { type: 'module' });
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', (event) => finishWithError(event.message || '后台计算线程意外停止。'));
    worker.postMessage({ type: 'run', workbook, pesticide: elements.pesticide.value }, [workbook]);
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
  elements.run.disabled = running || !selectedFile;
  elements.cancel.hidden = !running;
  elements.pesticide.disabled = running;
  elements.workbook.disabled = running;
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
  elements.error.hidden = true;
  elements.empty.hidden = true;
  elements.content.hidden = false;
  elements.metricPesticide.textContent = pesticideNames[summary.pesticide] || summary.pesticide;
  chartData = summary.massByYear;
  drawMassChart(chartData);

  const maxConcentration = Math.max(...summary.concentrationByMedia.map((item) => Math.abs(item.value)), Number.EPSILON);
  elements.bars.innerHTML = summary.concentrationByMedia.map((item) => `
    <div class="bar-row">
      <span>${escapeHtml(item.media)}</span>
      <div class="bar-track"><i style="width:${Math.max(1, Math.abs(item.value) / maxConcentration * 100)}%"></i></div>
      <span class="bar-value">${scientific(item.value)}</span>
    </div>`).join('');

  elements.flux.innerHTML = summary.topFluxes.map((item, index) => `
    <li><b>${String(index + 1).padStart(2, '0')}</b><span title="${escapeHtml(item.path)}">${escapeHtml(formatPath(item.path))}</span><strong>${scientific(item.value)}</strong></li>`).join('');
}

function drawMassChart(data) {
  const canvas = elements.chart;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const width = bounds.width;
  const height = bounds.height;
  const pad = { top: 22, right: 18, bottom: 30, left: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = data.map((item) => Number(item.value) || 0);
  const max = Math.max(...values, Number.EPSILON) * 1.1;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '9px SFMono-Regular, monospace';
  ctx.fillStyle = '#6c7773';
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
  gradient.addColorStop(0, 'rgba(21,63,58,.20)'); gradient.addColorStop(1, 'rgba(21,63,58,0)');
  ctx.beginPath(); ctx.moveTo(points[0].x, height - pad.bottom); points.forEach((p) => ctx.lineTo(p.x, p.y)); ctx.lineTo(points.at(-1).x, height - pad.bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = '#153f3a'; ctx.lineWidth = 2; ctx.stroke();
  points.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#c46643'; ctx.fill(); ctx.fillStyle = '#6c7773'; ctx.textAlign = 'center'; ctx.fillText(String(p.year), p.x, height - 10); });
}

function cleanError(message) {
  return String(message).replace(/^PythonError:\s*/i, '').split('\n').slice(-10).join('\n').slice(0, 1800);
}
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function scientific(value) { return Number(value).toExponential(2); }
function compact(value) { return Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < .01) ? Number(value).toExponential(1) : Number(value).toPrecision(3); }
function formatPath(path) { return path.replaceAll('_', ' · ').replace('T · ', '').replace('D · ', '扩散 · ').replace('R · ', '降解 · '); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
