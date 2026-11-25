// Account self-service: profile, password, sessions, access tokens, data export and deletion.
// All server text is written with textContent; nothing here builds HTML from data.
// Accounts created with Google have no password: they can set one here, and confirm
// sensitive actions by continuing with Google again instead of typing a password.
import { api } from './api.js';
import { attachMeter, attachMatch, weakReason, MIN_LENGTH } from './password-strength.js';
import { drawQr } from './qr-canvas.js';

const $ = id => document.getElementById(id);
const errorBox = $('acct-error');
const noticeBox = $('acct-notice');
let hasPassword = true;

const meter = attachMeter($('pw-new'), { minLength: MIN_LENGTH });
const match = attachMatch($('pw-new'), $('pw-confirm'), $('pw-confirm-hint'));
// Two-step sign-in state. view: 'idle' (status + start/manage forms) | 'enrol' (QR step) | 'codes' (recovery codes).
const mfa = { enabled: false, view: 'idle', setupRequired: new URLSearchParams(window.location.search).get('setup-mfa') === '1', operatorRequires: false, codes: [] };
api('/api/auth/config').then(c => {
  meter.setMinLength(c.passwordMinLength);
  mfa.operatorRequires = !!c.mfaRequired;
  updateMfaView();
}).catch(() => { /* default is fine */ });

function showError(msg, code) {
  noticeBox.classList.remove('show');
  errorBox.textContent = msg;
  if (code === 'reauth_google') {
    // No password to retype: a fresh Google sign-in confirms it is the account owner.
    const link = document.createElement('a');
    link.className = 'btn btn-sm';
    link.href = '/api/auth/google/start?intent=reauth&next=' + encodeURIComponent('/account');
    link.textContent = 'Continue with Google';
    const row = document.createElement('p');
    row.style.marginTop = '10px';
    row.append(link);
    errorBox.append(row);
  }
  errorBox.classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
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
  $('acct-methods').textContent = [account.hasPassword && 'Email and password', account.google && 'Google'].filter(Boolean).join(', ') || 'Email and password';
  setPasswordMode(account.hasPassword);
  renderMfa(account);
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

// Google-only accounts "set" a first password instead of changing one.
function setPasswordMode(withPassword) {
  hasPassword = withPassword;
  $('h-password').textContent = withPassword ? 'Change password' : 'Set a password';
  $('pw-intro').textContent = withPassword
    ? 'Changing your password signs you out everywhere else.'
    : 'You sign in with Google. Add a password to also sign in with your email address. This signs you out everywhere else.';
  $('pw-current-field').hidden = !withPassword;
  $('pw-submit').textContent = withPassword ? 'Change password' : 'Set password';
  $('del-password-field').hidden = !withPassword;
  $('del-password').required = withPassword;
  $('del-google-note').hidden = withPassword;
  for (const id of ['mfa-start-pw-field', 'mfa-regen-pw-field', 'mfa-disable-pw-field', 'token-pw-field']) $(id).hidden = !withPassword;
}

// ---------- two-step sign-in ----------
let mfaScrolled = false;
function renderMfa(account) {
  const m = account.mfa || { enabled: false, enrolledAt: null, recoveryRemaining: 0 };
  mfa.enabled = !!m.enabled;
  if (account.mfaSetupRequired) mfa.setupRequired = true;
  const n = m.recoveryRemaining || 0;
  $('mfa-status').textContent = m.enabled
    ? 'On since ' + (m.enrolledAt ? new Date(m.enrolledAt).toLocaleDateString() : 'earlier') + '. ' + n + ' recovery code' + (n === 1 ? '' : 's') + ' left.'
    : 'Off. Add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, ...) when you sign in.';
  if (m.enabled) mfa.setupRequired = false;
  updateMfaView();
  if (mfa.setupRequired && !mfaScrolled) {
    mfaScrolled = true;
    $('mfa-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateMfaView() {
  const idle = mfa.view === 'idle';
  $('mfa-required-note').hidden = !mfa.setupRequired;
  $('mfa-start-form').hidden = !(idle && !mfa.enabled);
  $('mfa-manage').hidden = !(idle && mfa.enabled);
  $('mfa-disable-form').hidden = mfa.operatorRequires;
  $('mfa-enrol').hidden = mfa.view !== 'enrol';
  $('mfa-codes').hidden = mfa.view !== 'codes';
}

function showCodes(codes, afterSetup) {
  mfa.codes = codes;
  mfa.view = 'codes';
  const list = $('mfa-code-list');
  list.replaceChildren();
  for (const c of codes) {
    const li = document.createElement('li');
    li.textContent = c;
    list.append(li);
  }
  $('mfa-continue').hidden = !(afterSetup && mfa.setupRequired);
  updateMfaView();
  $('mfa-codes').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showNotice('Copied.'); } catch { /* clipboard may be blocked */ }
}

const needsPassword = () => hasPassword;
function reauthBody(inputId) {
  return needsPassword() ? { currentPassword: $(inputId).value } : {};
}
function checkPassword(inputId) {
  if (needsPassword() && !$(inputId).value) { $(inputId).focus(); showError('Enter your current password.'); return false; }
  return true;
}
function cleanCode(v) { return v.trim(); }
function mfaFail(err, input) {
  const code = err.data && err.data.code;
  if (code === 'mfa_no_setup') {
    mfa.view = 'idle';
    updateMfaView();
    return showError('Your setup expired. Start again.', code);
  }
  if (code === 'mfa_already_enabled') { mfa.view = 'idle'; loadAccount().catch(() => {}); }
  if (code === 'mfa_required') { mfa.operatorRequires = true; updateMfaView(); }
  if (input && code === 'mfa_invalid') input.focus();
  showError(err.message, code);
}

$('mfa-start-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  if (!checkPassword('mfa-start-pw')) return;
  const btn = $('mfa-start-btn'); btn.disabled = true;
  try {
    const res = await call('/api/account/mfa/setup', { method: 'POST', body: reauthBody('mfa-start-pw') });
    $('mfa-start-pw').value = '';
    drawQr($('mfa-qr'), res.qr);
    $('mfa-secret').textContent = res.secret;
    $('mfa-enable-code').value = '';
    mfa.view = 'enrol';
    updateMfaView();
    $('mfa-enable-code').focus();
  } catch (err) { mfaFail(err); }
  finally { btn.disabled = false; }
});

$('mfa-copy-key').addEventListener('click', () => copyText($('mfa-secret').textContent));

$('mfa-enable-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  const input = $('mfa-enable-code');
  const code = cleanCode(input.value);
  if (!code) { input.focus(); return showError('Enter the 6-digit code from your authenticator app.'); }
  const btn = $('mfa-enable-btn'); btn.disabled = true;
  try {
    const res = await call('/api/account/mfa/enable', { method: 'POST', body: { code } });
    input.value = '';
    $('mfa-secret').textContent = '';
    const wasRequired = mfa.setupRequired;
    showCodes(res.recoveryCodes || [], true);
    mfa.setupRequired = wasRequired;
    $('mfa-continue').hidden = !wasRequired;
    const { account } = await call('/api/account');
    mfa.enabled = !!(account.mfa && account.mfa.enabled);
    const n = (account.mfa && account.mfa.recoveryRemaining) || 0;
    $('mfa-status').textContent = 'On since ' + new Date((account.mfa && account.mfa.enrolledAt) || Date.now()).toLocaleDateString() + '. ' + n + ' recovery code' + (n === 1 ? '' : 's') + ' left.';
  } catch (err) { mfaFail(err, input); }
  finally { btn.disabled = false; }
});

$('mfa-regen-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  if (!checkPassword('mfa-regen-pw')) return;
  const input = $('mfa-regen-code');
  const code = cleanCode(input.value);
  if (!code) { input.focus(); return showError('Enter the 6-digit code from your authenticator app.'); }
  try {
    const res = await call('/api/account/mfa/recovery-codes', { method: 'POST', body: { ...reauthBody('mfa-regen-pw'), code } });
    $('mfa-regen-pw').value = ''; input.value = '';
    showCodes(res.recoveryCodes || [], false);
  } catch (err) { mfaFail(err, input); }
});

$('mfa-disable-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  if (!checkPassword('mfa-disable-pw')) return;
  const input = $('mfa-disable-code');
  const code = cleanCode(input.value);
  if (!code) { input.focus(); return showError('Enter an authenticator code or a recovery code.'); }
  try {
    await call('/api/account/mfa/disable', { method: 'POST', body: { ...reauthBody('mfa-disable-pw'), code } });
    $('mfa-disable-pw').value = ''; input.value = '';
    showNotice('Two-step sign-in is off.');
    await loadAccount();
  } catch (err) { mfaFail(err, input); }
});

function codesText() {
  return 'Toolkit recovery codes\nEach code works once.\n\n' + mfa.codes.join('\n') + '\n';
}
$('mfa-download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([codesText()], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'toolkit-recovery-codes.txt';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
$('mfa-copy-codes').addEventListener('click', () => copyText(mfa.codes.join('\n')));
$('mfa-saved').addEventListener('click', async () => {
  mfa.codes = [];
  $('mfa-code-list').replaceChildren();
  mfa.view = 'idle';
  updateMfaView();
  try { await loadAccount(); } catch { /* shown elsewhere */ }
});

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
    detail.textContent = ' · ' + (s.ip || 'unknown address') + ' · last active ' + when(s.lastSeen)
      + (s.method === 'google' ? ' · signed in with Google' : '');
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

// ---------- access tokens ----------
const SCOPE_LABEL = { 'read': 'read', 'read,write': 'read and change', 'write': 'change' };
async function loadTokens() {
  const { tokens } = await call('/api/account/tokens');
  const list = $('tokens-list');
  list.replaceChildren();
  $('tokens-empty').hidden = tokens.length > 0;
  for (const t of tokens) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = t.name;
    const meta = document.createElement('span');
    meta.className = 'muted token-meta';
    meta.textContent = t.hint + '… · ' + (SCOPE_LABEL[t.scopes.join(',')] || t.scopes.join(', '))
      + ' · created ' + when(t.createdAt) + ' · last used ' + when(t.lastUsedAt)
      + ' · ' + (t.expiresAt ? (t.expired ? 'expired ' : 'expires ') + new Date(t.expiresAt).toLocaleDateString() : 'never expires');
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'token-row-actions';
    if (t.expired) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-warn';
      badge.textContent = 'expired';
      actions.append(badge);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = 'Revoke';
    btn.setAttribute('aria-label', 'Revoke token ' + t.name);
    btn.addEventListener('click', async () => {
      if (!window.confirm('Revoke "' + t.name + '"? Tools using it stop working at once.')) return;
      btn.disabled = true; clearMessages();
      try { await call('/api/account/tokens/' + encodeURIComponent(t.id), { method: 'DELETE' }); showNotice('Token revoked.'); await loadTokens(); }
      catch (err) { showError(err.message); btn.disabled = false; }
    });
    actions.append(btn);
    li.append(info, actions);
    list.append(li);
  }
}

$('token-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  const name = $('token-name').value.trim();
  if (!name) { $('token-name').focus(); return showError('Give the token a name, such as the tool and computer it is for.'); }
  if (!checkPassword('token-pw')) return;
  const btn = $('token-create-btn'); btn.disabled = true;
  try {
    const res = await call('/api/account/tokens', { method: 'POST', body: {
      ...reauthBody('token-pw'), name,
      scopes: $('token-access').value.split(','),
      expiresInDays: Number($('token-expiry').value),
    } });
    $('token-pw').value = ''; $('token-name').value = '';
    $('token-secret').textContent = res.token;
    $('token-created').hidden = false;
    $('token-form').hidden = true;
    $('token-created').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await loadTokens();
  } catch (err) { showError(err.message, err.data && err.data.code); }
  finally { btn.disabled = false; }
});
$('token-copy').addEventListener('click', () => copyText($('token-secret').textContent));
$('token-done').addEventListener('click', () => {
  $('token-secret').textContent = '';
  $('token-created').hidden = true;
  $('token-form').hidden = false;
});

$('name-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  try {
    await call('/api/account', { method: 'PATCH', body: { name: $('acct-name').value } });
    showNotice('Name updated.');
  } catch (err) { showError(err.message); }
});

$('password-form').addEventListener('submit', async e => {
  e.preventDefault(); clearMessages();
  const next = $('pw-new').value;
  if (hasPassword && !$('pw-current').value) { $('pw-current').focus(); return showError('Enter your current password.'); }
  const weak = weakReason(next);
  if (weak) { $('pw-new').focus(); return showError(weak); }
  if (next !== $('pw-confirm').value) { $('pw-confirm').focus(); return showError('The two new passwords do not match.'); }
  try {
    const body = { newPassword: next };
    if (hasPassword) body.currentPassword = $('pw-current').value;
    const res = await call('/api/account/password', { method: 'POST', body });
    $('pw-current').value = ''; $('pw-new').value = ''; $('pw-confirm').value = '';
    meter.update(); match.update();
    showNotice((res.firstPassword ? 'Password set. You can now also sign in with your email address and password.' : 'Password changed.')
      + (res.otherSessionsRevoked ? ' ' + res.otherSessionsRevoked + ' other session(s) signed out.' : ''));
    await Promise.all([loadAccount(), loadSessions()]);
  } catch (err) { showError(err.message, err.data && err.data.code); }
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
    const body = { confirm: $('del-confirm').value };
    if (hasPassword) body.currentPassword = $('del-password').value;
    await call('/api/account', { method: 'DELETE', body });
    window.location.href = '/';
  } catch (err) { showError(err.message, err.data && err.data.code); }
});

$('signout-btn').addEventListener('click', async e => {
  e.preventDefault();
  try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; }
});

Promise.all([loadAccount(), loadSessions(), loadTokens()]).catch(err => { if (err.status !== 401) showError(err.message); });
