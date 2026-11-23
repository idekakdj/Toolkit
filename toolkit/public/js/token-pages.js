// Landing page for the one-time password-reset link in emails (/reset).
// The token travels in the URL fragment (#token=...): fragments are never sent to the
// server, never appear in access logs and are not leaked through the Referer header.
// It is removed from the address bar immediately and sent only in a POST body.
import { api } from './api.js';
import { attachMeter, attachMatch, weakReason } from './password-strength.js';

const mode = document.querySelector('script[data-mode]')?.dataset.mode;
const $ = id => document.getElementById(id);
const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const token = hash.get('token') || '';
history.replaceState(null, '', window.location.pathname);

function fail(msg) {
  const box = $('error');
  box.textContent = msg;
  box.classList.add('show');
}
function done(title, message) {
  $('title').textContent = title;
  $('message').textContent = message;
  $('error').classList.remove('show');
  const form = $('reset-form');
  if (form) form.hidden = true;
  $('next').hidden = false;
}

if (!token) {
  $('title').textContent = 'Link not valid';
  $('message').textContent = 'This link is incomplete. Open the link from your email again, or request a new one.';
  const form = $('reset-form'); if (form) form.hidden = true;
  $('next').hidden = false;
} else if (mode === 'reset') {
  attachMeter($('password'));
  attachMatch($('password'), $('confirm'), $('confirm-hint'));
  $('reset-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('error').classList.remove('show');
    const password = $('password').value;
    const weak = weakReason(password);
    if (weak) return fail(weak);
    if (password !== $('confirm').value) return fail('The two passwords do not match.');
    $('submit-btn').disabled = true;
    try {
      await api('/api/auth/reset', { method: 'POST', body: { token, password } });
      done('Password changed', 'Sign in with your new password. Every other device has been signed out.');
    } catch (err) {
      fail(err.message);
      $('submit-btn').disabled = false;
    }
  });
}
