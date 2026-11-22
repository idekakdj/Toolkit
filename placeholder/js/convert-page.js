/* ============================================================
   Placeholder — converter page UI
   ============================================================ */

(function () {
  'use strict';

  const E = window.PlaceholderEngine;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const workspace = document.getElementById('workspace');
  const fileBadge = document.getElementById('fileBadge');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const fileType = document.getElementById('fileType');
  const removeBtn = document.getElementById('removeBtn');
  const targetSelect = document.getElementById('targetSelect');
  const qualityControl = document.getElementById('qualityControl');
  const qualityRange = document.getElementById('qualityRange');
  const qualityVal = document.getElementById('qualityVal');
  const resizeControl = document.getElementById('resizeControl');
  const resizeWidth = document.getElementById('resizeWidth');
  const resizeHeight = document.getElementById('resizeHeight');
  const resizeAspect = document.getElementById('resizeAspect');
  const optHint = document.getElementById('optHint');
  const convertBtn = document.getElementById('convertBtn');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const errorBox = document.getElementById('errorBox');
  const resultView = document.getElementById('resultView');
  const resultName = document.getElementById('resultName');
  const resultSize = document.getElementById('resultSize');
  const downloadBtn = document.getElementById('downloadBtn');
  const againBtn = document.getElementById('againBtn');

  let revision = 0;
  let busy = false;
  let currentFile = null;
  let currentDet = null;
  let conversions = [];
  let downloadUrl = null;

  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');
  function lockOptions(locked) {
    targetSelect.disabled = qualityRange.disabled = locked;
    resizeWidth.disabled = resizeHeight.disabled = resizeAspect.disabled = locked;
  }
  function resetSize() {
    resizeWidth.value = resizeHeight.value = '';
    resizeAspect.checked = true;
  }

  function showError(msg) {
    errorBox.textContent = msg;
    show(errorBox);
  }

  function clearError() {
    hide(errorBox);
    errorBox.textContent = '';
  }

  function resetAll() {
    revision++;
    busy = false;
    lockOptions(false);
    resetSize();
    currentFile = null;
    currentDet = null;
    conversions = [];
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
    fileInput.value = '';
    clearError();
    hide(workspace);
    hide(resultView);
    hide(statusEl);
    show(dropzone);
    convertBtn.disabled = false;
    document.getElementById('browseBtn').focus();
  }

  function selectedConversion() {
    return conversions[parseInt(targetSelect.value, 10)] || null;
  }

  function refreshOptionUI() {
    const conv = selectedConversion();
    if (!conv) return;
    if (conv.needsQuality) show(qualityControl); else hide(qualityControl);
    if (conv.resize) show(resizeControl); else hide(resizeControl);
    if (conv.hint) {
      optHint.textContent = conv.hint;
      show(optHint);
    } else {
      hide(optHint);
    }
  }

  // Everything is converted in this tab's memory; a very large file would only freeze the
  // browser, so it is refused up front with a clear message.
  const MAX_INPUT_BYTES = 300 * 1024 * 1024;

  async function acceptFile(file) {
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      showError('That file is too large (' + E.formatBytes(file.size) + '). The limit is ' + E.formatBytes(MAX_INPUT_BYTES) + '.');
      return;
    }
    const token = ++revision;
    busy = false;
    currentFile = null;
    conversions = [];
    convertBtn.disabled = true;
    lockOptions(false);
    resetSize();
    hide(statusEl);
    clearError();
    hide(resultView);
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }

    let det;
    try {
      det = await E.detectFile(file);
    } catch (err) {
      if (token !== revision) return;
      showError('Could not read that file: ' + err.message);
      return;
    }

    if (token !== revision) return;
    currentFile = file;
    currentDet = det;
    conversions = E.getConversions(det);

    // file card
    const badge = det.id === 'binary' ? (det.ext ? det.ext.slice(0, 4) : 'FILE') : det.id;
    fileBadge.textContent = badge.toUpperCase().slice(0, 4);
    fileName.textContent = file.name;
    fileSize.textContent = E.formatBytes(file.size);
    fileType.textContent = 'Detected: ' + det.label;

    // dropdown
    targetSelect.innerHTML = '';
    conversions.forEach((conv, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = conv.label;
      targetSelect.appendChild(opt);
    });

    hide(dropzone);
    show(workspace);
    targetSelect.focus();
    convertBtn.disabled = conversions.length === 0;

    if (conversions.length === 0) {
      showError('No client-side conversions are available for this file type.');
      hide(qualityControl);
      hide(optHint);
    } else {
      refreshOptionUI();
    }
  }

  async function runConversion() {
    const conv = selectedConversion();
    if (!conv || !currentFile || busy) return;
    const token = revision;
    const file = currentFile, det = currentDet;
    const quality = parseFloat(qualityRange.value);
    const sizeOptions = conv.resize ? {
      width: resizeWidth.value.trim() ? Number(resizeWidth.value) : undefined,
      height: resizeHeight.value.trim() ? Number(resizeHeight.value) : undefined,
      keepAspect: resizeAspect.checked,
    } : {};
    if ([sizeOptions.width, sizeOptions.height].some(n => n !== undefined && (!Number.isInteger(n) || n < 1 || n > 8000))) {
      showError('Image dimensions must be whole numbers from 1 to 8000.');
      return;
    }
    busy = true;
    lockOptions(true);

    clearError();
    convertBtn.disabled = true;
    statusText.textContent = 'Converting ' + currentDet.label + ' → ' + conv.label.replace(/\s*\(.*\)$/, '') + '…';
    show(statusEl);

    // let the spinner paint before heavy synchronous work starts
    await new Promise((r) => setTimeout(r, 50));

    if (token !== revision) return;
    const started = performance.now();
    try {
      const blob = await conv.run(file, det, {
        quality,
        ...sizeOptions,
      });
      if (token !== revision) return;
      busy = false;
      lockOptions(false);
      const secs = (performance.now() - started) / 1000;
      const elapsed = secs < 0.1 ? 'under 0.1' : secs.toFixed(1);

      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);

      const outName = E.baseName(file.name) + '.' + conv.ext;
      downloadBtn.href = downloadUrl;
      downloadBtn.setAttribute('download', outName);
      resultName.textContent = outName;
      resultSize.textContent = E.formatBytes(blob.size) + ' · done in ' + elapsed + 's';

      hide(statusEl);
      hide(workspace);
      show(resultView);
      downloadBtn.focus();
    } catch (err) {
      if (token !== revision) return;
      busy = false;
      lockOptions(false);
      hide(statusEl);
      convertBtn.disabled = false;
      showError(err && err.message ? err.message : 'The conversion failed unexpectedly.');
    }
  }

  /* ---------------- events ---------------- */

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => acceptFile(fileInput.files[0]));

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }));
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }));
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length) acceptFile(e.dataTransfer.files[0]);
  });

  // also accept drops anywhere on the page while the dropzone is visible
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dropzone.classList.contains('hidden') && !dropzone.contains(e.target) &&
        e.dataTransfer.files && e.dataTransfer.files.length) {
      acceptFile(e.dataTransfer.files[0]);
    }
  });

  targetSelect.addEventListener('change', () => { clearError(); refreshOptionUI(); });
  qualityRange.addEventListener('input', () => {
    qualityVal.textContent = Math.round(parseFloat(qualityRange.value) * 100) + '%';
  });
  convertBtn.addEventListener('click', runConversion);
  removeBtn.addEventListener('click', resetAll);
  againBtn.addEventListener('click', resetAll);

  // Allow companion scripts (e.g. design-import.js) to push a file into the
  // pipeline as if the user had dropped it.
  window.PlaceholderConvert = { acceptFile, resetAll };
})();
