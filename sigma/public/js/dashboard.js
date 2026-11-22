// Dashboard: list, create, rename, delete and open projects.
import { api, redirectIfSignedOut } from './api.js';
import { initDialogs, showDialog, hideDialog } from './dialogs.js';
initDialogs();

const grid = document.getElementById('project-grid');
const emptyState = document.getElementById('empty-state');
const countEl = document.getElementById('project-count');
const userNameEl = document.getElementById('user-name');

const projectModal = document.getElementById('project-modal');
const projectModalTitle = document.getElementById('project-modal-title');
const projectModalError = document.getElementById('project-modal-error');
const projectNameInput = document.getElementById('project-name-input');
const projectModalSave = document.getElementById('project-modal-save');

const deleteModal = document.getElementById('delete-modal');
const deleteModalText = document.getElementById('delete-modal-text');

let projects = [];
let renamingId = null;   // null = creating
let deletingId = null;

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function render() {
  grid.replaceChildren();
  emptyState.hidden = projects.length > 0;
  countEl.textContent = projects.length === 1 ? '1 project' : `${projects.length} projects`;

  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const thumb = document.createElement('div');
    thumb.className = 'project-thumb';
    thumb.tabIndex = 0;
    thumb.setAttribute('role', 'link');
    thumb.setAttribute('aria-label', 'Open ' + p.name);
    thumb.addEventListener('keydown', e => {
      if (e.key === 'Enter') window.location.href = `/sigma/editor/${p.id}`;
    });
    if (p.thumbnail) {
      const img = document.createElement('img');
      img.src = p.thumbnail;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      const mark = document.createElement('span');
      mark.className = 'empty-mark';
      mark.textContent = '▱';
      thumb.appendChild(mark);
    }

    const meta = document.createElement('div');
    meta.className = 'project-meta';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'pname';
    name.textContent = p.name;
    const date = document.createElement('div');
    date.className = 'pdate';
    date.textContent = `Edited ${fmtDate(p.updatedAt)}`;
    info.append(name, date);

    const actions = document.createElement('div');
    actions.className = 'project-actions';
    const renameBtn = document.createElement('button');
    renameBtn.className = 'icon-btn';
    renameBtn.title = 'Rename';
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (e) => { e.stopPropagation(); openRename(p); });
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); openDelete(p); });
    actions.append(renameBtn, delBtn);

    meta.append(info, actions);
    card.append(thumb, meta);
    card.addEventListener('click', () => { window.location.href = `/sigma/editor/${p.id}`; });
    grid.appendChild(card);
  }
}

function showModalError(msg) {
  projectModalError.textContent = msg;
  projectModalError.classList.add('show');
}

function openCreate() {
  renamingId = null;
  projectModalTitle.textContent = 'New project';
  projectModalSave.textContent = 'Create';
  projectNameInput.value = '';
  projectModalError.classList.remove('show');
  showDialog(projectModal);
  projectNameInput.focus();
}

function openRename(p) {
  renamingId = p.id;
  projectModalTitle.textContent = 'Rename project';
  projectModalSave.textContent = 'Save';
  projectNameInput.value = p.name;
  projectModalError.classList.remove('show');
  showDialog(projectModal);
  projectNameInput.focus();
  projectNameInput.select();
}

function openDelete(p) {
  deletingId = p.id;
  deleteModalText.textContent = `"${p.name}" and its contents will be permanently deleted.`;
  showDialog(deleteModal);
}

async function saveProject() {
  if (projectModalSave.disabled) return;
  const name = projectNameInput.value.trim();
  if (!name) return showModalError('Please enter a name.');
  projectModalSave.disabled = true;
  try {
    if (renamingId) {
      await api(`/api/projects/${renamingId}`, { method: 'PUT', body: { name } });
      hideDialog(projectModal);
      await load();
    } else {
      const data = await api('/api/projects', { method: 'POST', body: { name } });
      window.location.href = `/sigma/editor/${data.project.id}`;
    }
  } catch (err) {
    if (!redirectIfSignedOut(err)) showModalError(err.message);
  } finally {
    projectModalSave.disabled = false;
  }
}

async function load() {
  try {
    const [me, list] = await Promise.all([api('/api/auth/me'), api('/api/projects')]);
    userNameEl.textContent = me.user.name;
    projects = list.projects;
    render();
  } catch (err) {
    if (!redirectIfSignedOut(err)) countEl.textContent = 'Could not load projects: ' + err.message;
  }
}

document.getElementById('new-project-btn').addEventListener('click', openCreate);
projectModalSave.addEventListener('click', saveProject);
projectNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveProject(); });
document.getElementById('project-modal-cancel').addEventListener('click', () => hideDialog(projectModal));

document.getElementById('delete-modal-cancel').addEventListener('click', () => {
  deletingId = null;
  hideDialog(deleteModal);
});
document.getElementById('delete-modal-confirm').addEventListener('click', async () => {
  const confirm = document.getElementById('delete-modal-confirm');
  if (!deletingId || confirm.disabled) return;
  const id = deletingId;
  confirm.disabled = true;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    hideDialog(deleteModal);
    deletingId = null;
    await load();
  } catch (err) {
    if (!redirectIfSignedOut(err)) alert('Could not delete project: ' + err.message);
  } finally { confirm.disabled = false; }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  window.location.href = '/';
});

for (const backdrop of [projectModal, deleteModal]) {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) hideDialog(backdrop);
  });
}

load();
