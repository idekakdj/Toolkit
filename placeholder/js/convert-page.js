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

  let currentFile = null;
  let currentDet = null;
  let conversions = [];
  let downloadUrl = null;

  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  function showError(msg) {
    errorBox.textContent = msg;
    show(errorBox);
  }

  function clearError() {
    hide(errorBox);
    errorBox.textContent = '';
  }

  function resetAll() {
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
  }

  function selectedConversion() {
    return conversions[parseInt(targetSelect.value, 10)] || null;
  }

  function refreshOptionUI() {
    const conv = selectedConversion();
    if (!conv) return;
    if (conv.needsQuality) show(qualityControl); else hide(qualityControl);
    if (conv.hint) {
      optHint.textContent = conv.hint;
      show(optHint);
    } else {
      hide(optHint);
    }
  }

  async function acceptFile(file) {
    if (!file) return;
    clearError();
    hide(resultView);
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }

    let det;
    try {
      det = await E.detectFile(file);
    } catch (err) {
      showError('Could not read that file: ' + err.message);
      return;
    }

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
    if (!conv || !currentFile) return;

    clearError();
    convertBtn.disabled = true;
    statusText.textContent = 'Converting ' + currentDet.label + ' → ' + conv.label.replace(/\s*\(.*\)$/, '') + '…';
    show(statusEl);

    // let the spinner paint before heavy synchronous work starts
    await new Promise((r) => setTimeout(r, 50));

    const started = performance.now();
    try {
      const blob = await conv.run(currentFile, currentDet, {
        quality: parseFloat(qualityRange.value),
      });
      const secs = (performance.now() - started) / 1000;
      const elapsed = secs < 0.1 ? 'under 0.1' : secs.toFixed(1);

      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);

      const outName = E.baseName(currentFile.name) + '.' + conv.ext;
      downloadBtn.href = downloadUrl;
      downloadBtn.setAttribute('download', outName);
      resultName.textContent = outName;
      resultSize.textContent = E.formatBytes(blob.size) + ' · done in ' + elapsed + 's';

      hide(statusEl);
      hide(workspace);
      show(resultView);
    } catch (err) {
      hide(statusEl);
      convertBtn.disabled = false;
      showError(err && err.message ? err.message : 'The conversion failed unexpectedly.');
    }
  }

  /* ---------------- events ---------------- */

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
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
    if (!dropzone.classList.contains('hidden') && e.target !== dropzone &&
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
