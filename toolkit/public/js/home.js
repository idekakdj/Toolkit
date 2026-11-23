// Toolkit shell: tab bar, app iframes and the dashboard. Vanilla ES module, DOM APIs only.

const APPS = {
  sigma: {
    name: 'Sigma', desc: 'Vector design', icon: '/sigma/img/favicon.svg',
    re: /^\/sigma\/editor\/[A-Za-z0-9_-]{1,64}$/,
    list: '/api/projects', listKey: 'projects', createKey: 'project',
    newLabel: 'New design', newName: 'Untitled design', noun: 'design',
    pathFor: id => '/sigma/editor/' + id,
  },
  pigment: {
    name: 'Pigment', desc: 'Painting and colouring', icon: '/pigment/img/icon.svg',
    re: /^\/pigment\/app(\?id=[A-Za-z0-9_-]{1,64})?$/,
    list: '/api/paintings', listKey: 'paintings', createKey: 'painting',
    newLabel: 'New painting', newName: 'Untitled painting', noun: 'painting',
    pathFor: id => '/pigment/app?id=' + id,
  },
  imagevendor: {
    name: 'ImageVendor', desc: 'Photo and raster editing', icon: '/imagevendor/img/icon.svg',
    re: /^\/imagevendor\/app(\?id=[A-Za-z0-9_-]{1,64})?$/,
    list: '/api/images', listKey: 'images', createKey: 'image',
    newLabel: 'New image', newName: 'Untitled image', noun: 'image',
    pathFor: id => '/imagevendor/app?id=' + id,
  },
  placeholder: {
    name: 'Placeholder', desc: 'File conversion', icon: null,
    re: /^\/placeholder\/convert\.html$/,
    path: '/placeholder/convert.html',
  },
};
const APP_ORDER = ['sigma', 'pigment', 'imagevendor', 'placeholder'];
const MAX_TABS = 24;
const RECENT = 6;

const $ = id => document.getElementById(id);
const els = {
  topbar: $('topbar'), homeBtn: $('home-btn'), strip: $('tab-strip'), newTab: $('new-tab-btn'),
  userBtn: $('user-btn'), userPop: $('user-pop'), userName: $('user-name'), userAvatar: $('user-avatar'),
  signout: $('signout-btn'), content: $('content'), homeView: $('home-view'), frames: $('frames'),
  greeting: $('greeting'), sections: $('sections'), toast: $('toast'),
};

const state = { user: null, tabs: [], activeId: null, sections: {} };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

// ---------- helpers ----------
function appForPath(path) {
  if (typeof path !== 'string') return null;
  return APP_ORDER.find(k => APPS[k].re.test(path)) || null;
}

function goAuth() { location.href = '/auth?next=/'; }

async function request(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401) { goAuth(); throw new Error('Signed out'); }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  return data;
}

let toastTimer = 0;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 4000);
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }) : null;
function relTime(ts) {
  const t = Number(ts);
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'Edited just now';
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, secs] of units) {
    if (s >= secs * 0.95 || u === 'minute') {
      const n = Math.max(1, Math.round(s / secs));
      return 'Edited ' + (rtf ? rtf.format(-n, u) : n + ' ' + u + (n > 1 ? 's' : '') + ' ago');
    }
  }
  return '';
}

// ---------- persistence ----------
function storageKey() { return 'toolkit.tabs.v1:' + state.user.id; }
function saveState() {
  try { localStorage.setItem(storageKey(), JSON.stringify({ tabs: state.tabs, activeId: state.activeId })); } catch { /* storage unavailable */ }
}
function newId() {
  let id;
  do { id = 't' + Math.random().toString(36).slice(2, 9); } while (state.tabs.some(t => t.id === id));
  return id;
}
// First visit (nothing saved yet): start with the Placeholder converter open in a tab, behind Home.
function defaultTabs() {
  state.tabs.push({ id: newId(), app: 'placeholder', path: APPS.placeholder.path, title: APPS.placeholder.name });
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    if (!raw || !Array.isArray(raw.tabs)) { defaultTabs(); return; }
    const seen = new Set();
    for (const t of raw.tabs) {
      if (!t || typeof t.id !== 'string' || !/^[A-Za-z0-9]{1,16}$/.test(t.id) || seen.has(t.id)) continue;
      const app = appForPath(t.path);
      if (!app) continue;
      seen.add(t.id);
      state.tabs.push({ id: t.id, app, path: t.path, title: typeof t.title === 'string' && t.title ? t.title.slice(0, 120) : APPS[app].name });
      if (state.tabs.length >= MAX_TABS) break;
    }
    if (typeof raw.activeId === 'string' && state.tabs.some(t => t.id === raw.activeId)) state.activeId = raw.activeId;
  } catch { /* corrupt or unavailable */ }
}

// ---------- tab strip ----------
const tabEls = new Map();

function tabById(id) { return state.tabs.find(t => t.id === id) || null; }

function renderTabs() {
  els.strip.textContent = '';
  tabEls.clear();
  for (const tab of state.tabs) {
    const active = tab.id === state.activeId;
    const el = h('div', 'tab app-' + tab.app);
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    el.tabIndex = active ? 0 : -1;
    el.dataset.id = tab.id;
    el.title = tab.title;
    el.append(h('span', 'tab-dot'), h('span', 'tab-title', tab.title));
    const close = h('button', 'tab-close');
    close.type = 'button';
    close.tabIndex = -1;
    close.setAttribute('aria-label', 'Close ' + tab.title);
    close.append(xIcon());
    close.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
    el.append(close);
    wireTab(el, tab);
    els.strip.append(el);
    tabEls.set(tab.id, el);
  }
  els.homeBtn.classList.toggle('is-active', state.activeId === null);
  if (state.activeId === null) els.homeBtn.setAttribute('aria-current', 'page');
  else els.homeBtn.removeAttribute('aria-current');
}

function xIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M2.5 2.5l7 7M9.5 2.5l-7 7');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
}

let suppressClick = false;

function wireTab(el, tab) {
  el.addEventListener('click', () => {
    if (suppressClick) return;
    activate(tab.id, { focus: 'content' });
  });
  el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  el.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
  el.addEventListener('keydown', e => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(tab.id, { focus: 'content' }); }
    else if (e.key === 'Delete') { e.preventDefault(); closeTab(tab.id); }
  });
  wireDrag(el, tab);
}

// Pointer-based drag to reorder.
function wireDrag(el, tab) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.tab-close')) return;
    const startX = e.clientX;
    const grab = startX - el.getBoundingClientRect().left;
    const pid = e.pointerId;
    let dragging = false;

    const place = x => {
      el.style.transform = 'none';
      let natural = el.getBoundingClientRect().left;
      const center = () => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 + (x - grab - natural); };
      for (let guard = 0; guard < 50; guard++) {
        const prev = el.previousElementSibling;
        const next = el.nextElementSibling;
        const c = center();
        if (prev) { const r = prev.getBoundingClientRect(); if (c < r.left + r.width / 2) { els.strip.insertBefore(el, prev); natural = el.getBoundingClientRect().left; continue; } }
        if (next) { const r = next.getBoundingClientRect(); if (c > r.left + r.width / 2) { els.strip.insertBefore(el, next.nextSibling); natural = el.getBoundingClientRect().left; continue; } }
        break;
      }
      el.style.transform = 'translateX(' + Math.round(x - grab - natural) + 'px)';
    };
    const move = ev => {
      if (ev.pointerId !== pid) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 6) return;
        dragging = true;
        try { el.setPointerCapture(pid); } catch { /* ignore */ }
        el.classList.add('is-dragging');
      }
      place(ev.clientX);
    };
    const end = ev => {
      if (ev.pointerId !== pid) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      if (!dragging) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      el.style.transform = '';
      el.classList.remove('is-dragging');
      const order = [...els.strip.children].map(c => c.dataset.id);
      state.tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      saveState();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}

// ---------- activation, frames ----------
function frameFor(tab) { return els.frames.querySelector('iframe[name="tk-tab-' + tab.id + '"]'); }

function ensureFrame(tab) {
  let f = frameFor(tab);
  if (f) return f;
  f = document.createElement('iframe');
  f.name = 'tk-tab-' + tab.id;
  f.className = 'tab-frame';
  f.title = tab.title;
  f.setAttribute('allow', 'clipboard-read; clipboard-write');
  f.addEventListener('load', () => { if (state.activeId === tab.id && pendingFocus === tab.id) { pendingFocus = null; focusFrame(f); } });
  f.src = tab.path;
  els.frames.append(f);
  return f;
}

let pendingFocus = null;
function focusFrame(f) { try { f.contentWindow.focus(); } catch { /* ignore */ } }

function activate(id, opts = {}) {
  const tab = id === null ? null : tabById(id);
  if (id !== null && !tab) return;
  const wasHome = state.activeId === null;
  state.activeId = tab ? tab.id : null;
  for (const f of els.frames.querySelectorAll('iframe')) f.classList.remove('is-active');
  if (tab) {
    const created = !frameFor(tab);
    const f = ensureFrame(tab);
    f.classList.add('is-active');
    if (opts.focus === 'content') { if (created) pendingFocus = tab.id; else focusFrame(f); }
  }
  els.content.classList.toggle('show-frames', !!tab);
  renderTabs();
  saveState();
  updateTitle();
  if (opts.focus === 'tab') {
    const target = tab ? tabEls.get(tab.id) : els.homeBtn;
    if (target) target.focus();
  } else if (!tab && opts.focus === 'content') {
    els.homeView.focus({ preventScroll: true });
  }
  scrollActiveIntoView();
  if (opts.initial) refreshAll(true);
  else if (!tab && !wasHome) refreshAll(false);
}

function scrollActiveIntoView() {
  const el = state.activeId ? tabEls.get(state.activeId) : null;
  if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  else els.strip.scrollTo({ left: 0 });
}

function updateTitle() {
  const tab = state.activeId ? tabById(state.activeId) : null;
  document.title = tab ? tab.title + ' — Toolkit' : 'Toolkit';
}

function showHome() { activate(null, { focus: 'content' }); }

function openPath(path, title) {
  const app = appForPath(path);
  if (!app) return null;
  const hasProject = /id=|\/editor\//.test(path);
  // Placeholder has no projects: one converter tab is reused rather than duplicated.
  if (hasProject || app === 'placeholder') {
    const existing = state.tabs.find(t => t.path === path);
    if (existing) { activate(existing.id, { focus: 'content' }); return existing; }
  }
  if (state.tabs.length >= MAX_TABS) { toast('You have reached the limit of ' + MAX_TABS + ' open tabs. Close one to open another.'); return null; }
  const tab = { id: newId(), app, path, title: (title && String(title).slice(0, 120)) || APPS[app].name };
  state.tabs.push(tab);
  activate(tab.id, { focus: 'content' });
  return tab;
}

function closeTab(id) {
  const i = state.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const wasActive = state.activeId === id;
  const [tab] = state.tabs.splice(i, 1);
  const f = frameFor(tab);
  if (f) f.remove();
  if (wasActive) {
    const next = state.tabs[i] || state.tabs[i - 1] || null;
    activate(next ? next.id : null, { focus: 'content' });
  } else {
    renderTabs();
    saveState();
  }
}

function switchBy(dir, focus) {
  const order = [null, ...state.tabs.map(t => t.id)];
  const i = order.indexOf(state.activeId);
  const j = Math.min(order.length - 1, Math.max(0, i + dir));
  if (j === i) return;
  activate(order[j], { focus });
}

// ---------- keyboard and swipe ----------
function isEditable(t) {
  return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable], [data-tk-keep-arrows]'));
}

window.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const dir = e.key === 'ArrowRight' ? 1 : -1;
  const focus = els.topbar.contains(e.target) ? 'tab' : 'content';
  if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) { e.preventDefault(); switchBy(dir, focus); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented || isEditable(e.target)) return;
  if (e.target === els.userBtn || els.userPop.contains(e.target)) return;
  e.preventDefault();
  switchBy(dir, focus);
});

let wheelSum = 0, wheelLast = 0, wheelBlockedUntil = 0;
function inNoSwipe(t) {
  for (let n = t; n && n.nodeType === 1; n = n.parentElement) {
    const tag = n.tagName.toLowerCase();
    if (tag === 'canvas' || tag === 'svg' || n.hasAttribute('data-tk-no-swipe')) return true;
    if (n.scrollWidth > n.clientWidth) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}
window.addEventListener('wheel', e => {
  const now = performance.now();
  if (e.ctrlKey || e.defaultPrevented || !(Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5)) return;
  if (now < wheelBlockedUntil || inNoSwipe(e.target)) return;
  if (now - wheelLast > 200) wheelSum = 0;
  wheelLast = now;
  wheelSum += e.deltaX;
  if (Math.abs(wheelSum) >= 120) {
    const dir = wheelSum > 0 ? 1 : -1;
    wheelSum = 0;
    wheelBlockedUntil = now + 600;
    switchBy(dir, 'none');
  }
}, { passive: true });

// ---------- messages from app tabs ----------
window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const msg = e.data;
  if (!msg || typeof msg !== 'object' || msg.source !== 'toolkit-tab') return;
  const frame = [...els.frames.querySelectorAll('iframe')].find(f => f.contentWindow === e.source);
  if (!frame) return;
  const tab = tabById(frame.name.replace(/^tk-tab-/, ''));
  if (!tab) return;
  switch (msg.type) {
    case 'meta': {
      const app = appForPath(msg.path);
      if (!app) return;
      const title = typeof msg.title === 'string' && msg.title.trim() ? msg.title.trim().slice(0, 120) : APPS[app].name;
      if (tab.path === msg.path && tab.title === title && tab.app === app) return;
      tab.path = msg.path; tab.title = title; tab.app = app;
      frame.title = title;
      renderTabs(); saveState(); updateTitle(); scrollActiveIntoView();
      break;
    }
    case 'switch':
      if (msg.direction === 1 || msg.direction === -1) {
        if (state.activeId === tab.id) switchBy(msg.direction, 'content');
      }
      break;
    case 'home':
      showHome();
      break;
    case 'open':
      if (typeof msg.path === 'string') openPath(msg.path);
      break;
  }
});

// ---------- dashboard ----------
function buildDashboard() {
  els.sections.textContent = '';
  for (const key of APP_ORDER) {
    const app = APPS[key];
    const sec = h('section', 'app-section app-' + key);
    sec.setAttribute('aria-labelledby', 'sec-' + key);
    const head = h('div', 'app-head');
    const tile = h('div', 'app-tile');
    if (app.icon) {
      const img = h('img');
      img.src = app.icon; img.alt = ''; img.width = 44; img.height = 44;
      tile.append(img);
    } else {
      tile.textContent = app.name.charAt(0);
    }
    const meta = h('div', 'app-meta');
    const name = h('h2', 'app-name', app.name);
    name.id = 'sec-' + key;
    meta.append(name, h('p', 'app-desc', app.desc));
    head.append(tile, meta);
    const body = h('div', 'app-body');
    const s = { key, body, status: 'loading', items: [], expanded: false, token: 0, newBtn: null };
    state.sections[key] = s;
    if (app.list) {
      const btn = h('button', 'btn btn-primary', '+ ' + app.newLabel);
      btn.type = 'button';
      btn.addEventListener('click', () => createProject(s));
      s.newBtn = btn;
      head.append(btn);
    }
    sec.append(head, body);
    els.sections.append(sec);
    renderSection(s);
  }
}

function renderSection(s) {
  const app = APPS[s.key];
  const body = s.body;
  body.textContent = '';
  if (!app.list) {
    const grid = h('div', 'card-grid');
    const card = h('button', 'project-card converter-card');
    card.type = 'button';
    card.append(h('div', 'card-thumb', 'P'), cardInfo('Open converter', 'Convert files right in your browser'));
    card.addEventListener('click', () => openPath(app.path));
    grid.append(card);
    body.append(grid);
    return;
  }
  if (s.status === 'loading') {
    const grid = h('div', 'card-grid');
    grid.setAttribute('aria-busy', 'true');
    for (let i = 0; i < 3; i++) grid.append(h('div', 'card-skel'));
    body.append(grid);
    return;
  }
  if (s.status === 'error') {
    const box = h('div', 'inline-error');
    box.setAttribute('role', 'alert');
    box.append(h('span', '', 'Could not load your ' + app.noun + 's. Please try again.'));
    const retry = h('button', 'btn', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', () => loadSection(s, true));
    box.append(retry);
    body.append(box);
    return;
  }
  if (!s.items.length) {
    const box = h('div', 'empty');
    box.append(h('span', '', 'No projects yet'));
    const btn = h('button', 'btn btn-primary', '+ ' + app.newLabel);
    btn.type = 'button';
    btn.addEventListener('click', () => createProject(s));
    box.append(btn);
    body.append(box);
    return;
  }
  const shown = s.expanded ? s.items : s.items.slice(0, RECENT);
  const grid = h('div', 'card-grid');
  for (const p of shown) {
    const card = h('button', 'project-card');
    card.type = 'button';
    const thumb = h('div', 'card-thumb');
    if (typeof p.thumbnail === 'string' && p.thumbnail.startsWith('data:image/')) {
      const img = h('img');
      img.src = p.thumbnail; img.alt = ''; img.loading = 'lazy';
      thumb.append(img);
    } else {
      thumb.textContent = (String(p.name || '?').trim().charAt(0) || '?').toUpperCase();
    }
    card.append(thumb, cardInfo(p.name || 'Untitled', relTime(p.updatedAt || p.createdAt)));
    card.addEventListener('click', () => openPath(app.pathFor(p.id), p.name));
    grid.append(card);
  }
  body.append(grid);
  if (s.items.length > RECENT) {
    const wrap = h('div', 'section-more');
    const more = h('button', 'btn btn-link', s.expanded ? 'Show fewer' : 'Show all (' + s.items.length + ')');
    more.type = 'button';
    more.setAttribute('aria-expanded', s.expanded ? 'true' : 'false');
    more.addEventListener('click', () => { s.expanded = !s.expanded; renderSection(s); });
    wrap.append(more);
    body.append(wrap);
  }
}

function cardInfo(name, sub) {
  const info = h('div', 'card-info');
  info.append(h('span', 'card-name', name), h('span', 'card-time', sub));
  return info;
}

async function loadSection(s, showSkeleton) {
  const app = APPS[s.key];
  if (!app.list) return;
  const token = ++s.token;
  if (showSkeleton || s.status === 'error') { s.status = 'loading'; renderSection(s); }
  try {
    const data = await request(app.list);
    if (token !== s.token) return;
    const list = data && Array.isArray(data[app.listKey]) ? data[app.listKey] : [];
    s.items = list.filter(p => p && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.id))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    s.status = 'ok';
  } catch (err) {
    if (token !== s.token) return;
    s.status = 'error';
  }
  renderSection(s);
}

function refreshAll(showSkeleton) {
  for (const key of APP_ORDER) if (APPS[key].list) loadSection(state.sections[key], showSkeleton);
}

async function createProject(s) {
  const app = APPS[s.key];
  const btns = [...s.body.parentElement.querySelectorAll('.btn-primary')];
  btns.forEach(b => { b.disabled = true; });
  try {
    const data = await request(app.list, { method: 'POST', body: { name: app.newName } });
    const p = data && data[app.createKey];
    if (!p || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id)) throw new Error('Unexpected response');
    s.items.unshift(p);
    s.status = 'ok';
    renderSection(s);
    openPath(app.pathFor(p.id), p.name);
  } catch (err) {
    if (err.message !== 'Signed out') toast(err.message || 'Could not create a new ' + app.noun + '.');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

// ---------- chrome wiring ----------
function setUserMenu(open) {
  els.userPop.hidden = !open;
  els.userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

els.homeBtn.addEventListener('click', showHome);
els.newTab.addEventListener('click', showHome);
els.userBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = els.userPop.hidden;
  setUserMenu(open);
  if (open) { const first = els.userPop.querySelector('[role="menuitem"]'); if (first) first.focus(); }
});
document.addEventListener('click', e => { if (!els.userPop.hidden && !$('user-menu').contains(e.target)) setUserMenu(false); });
// A click inside an iframe never reaches this document, so close the menu on blur too.
window.addEventListener('blur', () => setUserMenu(false));
els.userPop.addEventListener('keydown', e => {
  const items = [...els.userPop.querySelectorAll('[role="menuitem"]')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); setUserMenu(false); els.userBtn.focus(); }
  else if (e.key === 'Tab') setUserMenu(false);
});
els.signout.addEventListener('click', async () => {
  els.signout.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }); } catch { /* go home regardless */ }
  location.href = '/';
});

// ---------- start ----------
async function init() {
  // Loaded inside a frame (frame-escape.js is handling it): never run a second shell,
  // which would overwrite the real shell's saved tabs.
  if (window.top !== window) return;
  let me;
  try { me = await request('/api/auth/me'); } catch { return; }
  if (!me || !me.user || !me.user.id) { goAuth(); return; }
  state.user = me.user;
  const full = String(me.user.name || '').trim();
  const label = full || String(me.user.email || '').split('@')[0] || 'Account';
  els.userName.textContent = label;
  els.userAvatar.textContent = (label.charAt(0) || '?').toUpperCase();
  els.greeting.textContent = 'Welcome back, ' + (label.split(/\s+/)[0]);
  buildDashboard();
  loadState();

  // /?open=<path>
  let openParam = null;
  try {
    openParam = new URLSearchParams(location.search).get('open');
    if (openParam !== null) history.replaceState(null, '', '/');
  } catch { /* ignore */ }

  renderTabs();
  activate(state.activeId, { initial: true });
  if (openParam && appForPath(openParam)) openPath(openParam);
}
init();
