// Account self-service: profile, password, sessions, data export and deletion.
// All server text is written with textContent; nothing here builds HTML from data.
import { api } from './api.js';

const $ = id => document.getElementById(id);
const errorBox = $('acct-error');
const noticeBox = $('acct-notice');

function showError(msg) { noticeBox.classList.remove('show'); errorBox.textContent = msg; errorBox.classList.add('show'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showNotice(msg) { errorBox.classList.remove('show'); noticeBox.textContent = msg; noticeBox.classList.add('show'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function clearMessages() { errorBox.classList.remove('show'); noticeBox.classList.remove('show'); }

// A 401 anywhere means the session ended (idle timeout, password change elsewhere, revoked).
async function call(path, options) {
  try { return await api(path, options); }
  catch (err) {
    if (err.status === 401) { window.location.href = '/auth?next=' + encodeURIComponent('/account'); }
    throw err;
  }
}

const when = ts => (ts ? new Date(ts).toLocaleString() : 'never');
function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

async function loadAccount() {
  const { account } = await call('/api/account');
  $('acct-email').textContent = account.email;
  $('acct-created').textContent = when(account.createdAt);
  $('acct-last').textContent = when(account.lastLoginAt);
  $('acct-consent').textContent = account.consent
    ? 'version ' + account.consent.version + ', ' + when(account.consent.at)
    : 'before consent was recorded';
  $('acct-name').value = account.name;
  const s = account.storage, c = s.counts;
  $('storage-line').textContent = 'Storing ' + c.projects + ' Sigma project(s), ' + c.paintings + ' Pigment painting(s) and '
    + c.images + ' ImageVendor image(s): ' + bytes(s.usedBytes) + (s.limitBytes ? ' of ' + bytes(s.limitBytes) : '') + ' used.';
}

async function loadSessions() {
  const { sessions } = await call('/api/account/sessions');
  const list = $('sessions-list');
  list.replaceChildren();
  for (const s of sessions) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const agent = document.createElement('strong');
    agent.textContent = s.agent || 'Unknown browser';
    const detail = document.createElement('span');
    detail.className = 'muted';
    detail.textContent = ' · ' + (s.ip || 'unknown address') + ' · last active ' + when(s.lastSeen);
    info.append(agent, detail);
    li.append(info);
    if (s.current) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'this device';
      li.append(badge);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = 'End session';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await call('/api/account/sessions/' + encodeURIComponent(s.id), { method: 'DELETE' }); await loadSessions(); }
        catch (err) { showError(err.message); btn.disabled = false; }
      });
      li.append(btn);
    }
    list.append(li);
  }
}

$('name-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  try {
    await call('/api/account', { method: 'PATCH', body: { name: $('acct-name').value } });
    showNotice('Name updated.');
  } catch (err) { showError(err.message); }
});

$('password-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  try {
    const res = await call('/api/account/password', { method: 'POST', body: { currentPassword: $('pw-current').value, newPassword: $('pw-new').value } });
    $('pw-current').value = ''; $('pw-new').value = '';
    showNotice('Password changed.' + (res.otherSessionsRevoked ? ' ' + res.otherSessionsRevoked + ' other session(s) signed out.' : ''));
    await loadSessions();
  } catch (err) { showError(err.message); }
});

$('revoke-others-btn').addEventListener('click', async () => {
  clearMessages();
  try {
    const res = await call('/api/account/sessions/revoke-others', { method: 'POST' });
    showNotice(res.revoked + ' other session(s) signed out.');
    await loadSessions();
  } catch (err) { showError(err.message); }
});

$('export-btn').addEventListener('click', async () => {
  clearMessages();
  const btn = $('export-btn'); btn.disabled = true;
  try {
    const res = await fetch('/api/account/export', { credentials: 'same-origin', headers: { 'X-Requested-With': 'toolkit' } });
    if (res.status === 401) { window.location.href = '/auth?next=' + encodeURIComponent('/account'); return; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = 'toolkit-account-export.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showNotice('Your data was downloaded.');
  } catch (err) { showError(err.message); }
  finally { btn.disabled = false; }
});

$('delete-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  if ($('del-confirm').value !== 'DELETE') return showError('Type DELETE (capital letters) to confirm.');
  if (!window.confirm('Permanently delete your account and everything in it?')) return;
  try {
    await call('/api/account', { method: 'DELETE', body: { currentPassword: $('del-password').value, confirm: $('del-confirm').value } });
    window.location.href = '/';
  } catch (err) { showError(err.message); }
});

$('signout-btn').addEventListener('click', async e => {
  e.preventDefault();
  try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; }
});

Promise.all([loadAccount(), loadSessions()]).catch(err => { if (err.status !== 401) showError(err.message); });
