// Shared sign in / sign up for every app under Toolkit.
// Honors ?next=<same-site path> so each app can send users back where
// they were headed. New accounts confirm their email with a 6-digit code
// before they can be used.
import { api, safeNext } from './api.js';

const params = new URLSearchParams(window.location.search);
const nextPath = safeNext(params.get('next'));

const $ = id => document.getElementById(id);
const form = $('auth-form');
const title = $('auth-title');
const sub = $('auth-sub');
const nameField = $('name-field');
const nameInput = $('name');
const emailInput = $('email');
const passwordInput = $('password');
const pwHint = $('pw-hint');
const consentField = $('consent-field');
const consentBox = $('consent');
const submitBtn = $('submit-btn');
const toggleBtn = $('toggle-btn');
const toggleWrap = $('auth-toggle');
const forgotWrap = $('forgot-wrap');
const forgotBtn = $('forgot-btn');
const resendWrap = $('resend-wrap');
const resendBtn = $('resend-btn');
const codeForm = $('code-form');
const codeInput = $('code');
const codeBtn = $('code-btn');
const backWrap = $('back-wrap');
const backBtn = $('back-btn');
const errorBox = $('auth-error');
const noticeBox = $('auth-notice');

let mode = params.get('mode') === 'signup' ? 'signup' : 'signin';   // 'signup' | 'signin' | 'code'
let config = { emailEnabled: false, passwordMinLength: 12, signupsOpen: true };
let pendingEmail = '';

function render() {
  const signup = mode === 'signup';
  const code = mode === 'code';
  title.textContent = code ? 'Confirm your email' : signup ? 'Create your account' : 'Sign in';
  sub.textContent = code
    ? 'Enter the 6-digit code we sent to ' + pendingEmail + '.'
    : signup ? 'One account, every tool on the wall.' : 'One key opens every tool in the box.';
  form.hidden = code;
  codeForm.hidden = !code;
  resendWrap.hidden = !code;
  backWrap.hidden = !code;
  toggleWrap.hidden = code;
  nameField.hidden = !signup;
  nameInput.required = signup;
  pwHint.hidden = !signup;
  pwHint.textContent = 'At least ' + config.passwordMinLength + ' characters. Longer is better; avoid common words, your name and your email.';
  consentField.hidden = !signup;
  forgotWrap.hidden = mode !== 'signin' || !config.emailEnabled;
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  submitBtn.textContent = signup ? 'Create account' : 'Sign in';
  submitBtn.disabled = signup && !config.signupsOpen;
  toggleWrap.firstChild.textContent = signup ? 'Already have a key? ' : 'New around the bench? ';
  toggleBtn.textContent = signup ? 'Sign in instead' : 'Create an account';
  errorBox.classList.remove('show');
  if (signup && !config.signupsOpen) {
    showError('Sign-ups are paused: this Toolkit cannot send email yet, so it cannot confirm new addresses. Existing accounts can still sign in.');
  }
  if (code) setTimeout(() => codeInput.focus(), 0);
}

function showError(msg) {
  noticeBox.classList.remove('show');
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}
function showNotice(msg) {
  errorBox.classList.remove('show');
  noticeBox.textContent = msg;
  noticeBox.classList.add('show');
}

function askForCode(email, message) {
  pendingEmail = email;
  mode = 'code';
  codeInput.value = '';
  passwordInput.value = '';
  render();
  showNotice(message);
}

api('/api/auth/config').then(c => { config = { ...config, ...c }; render(); }).catch(() => { /* defaults are fine */ });

toggleBtn.addEventListener('click', () => {
  mode = mode === 'signup' ? 'signin' : 'signup';
  noticeBox.classList.remove('show');
  render();
});

backBtn.addEventListener('click', () => {
  mode = 'signup';
  noticeBox.classList.remove('show');
  render();
});

forgotBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) return showError('Enter your email address above first.');
  forgotBtn.disabled = true;
  try {
    await api('/api/auth/forgot', { method: 'POST', body: { email } });
    showNotice('If an account exists for that address, a reset link is on its way. It is valid for one hour.');
  } catch (err) {
    showError(err.message);
  } finally { forgotBtn.disabled = false; }
});

resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  try {
    await api('/api/auth/resend-verification', { method: 'POST', body: { email: pendingEmail } });
    showNotice('A new code is on its way to ' + pendingEmail + ' (codes can be resent once a minute). Use the newest one.');
  } catch (err) {
    showError(err.message);
  } finally { resendBtn.disabled = false; }
});

// Keep only digits as the code is typed or pasted.
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) return showError('Enter the 6-digit code from the email.');
  codeBtn.disabled = true;
  try {
    await api('/api/auth/verify-email', { method: 'POST', body: { email: pendingEmail, code } });
    window.location.href = nextPath;
  } catch (err) {
    showError(err.message);
  } finally { codeBtn.disabled = false; }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');
  noticeBox.classList.remove('show');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return showError('Email and password are required.');
  if (mode === 'signup') {
    if (!nameInput.value.trim()) return showError('Please enter your name.');
    if ([...password].length < config.passwordMinLength) {
      return showError('Password must be at least ' + config.passwordMinLength + ' characters.');
    }
    if (!consentBox.checked) return showError('Please accept the privacy notice to create an account.');
  }

  submitBtn.disabled = true;
  try {
    if (mode === 'signup') {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: { name: nameInput.value.trim(), email, password, acceptTerms: consentBox.checked },
      });
      if (res && res.verificationRequired) {
        // The account cannot be used until the code from the mailbox is entered.
        askForCode(email, 'We sent a 6-digit code to ' + email + '. Enter it below to finish creating your account.');
        return;
      }
    } else {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
    }
    window.location.href = nextPath;
  } catch (err) {
    if (err.data && err.data.code === 'email_not_verified') {
      askForCode(email, 'Confirm your email to finish signing in. We sent a 6-digit code to ' + email + '.');
      return;
    }
    if (err.data && err.data.code === 'signups_paused') config.signupsOpen = false;
    showError(err.message);
  } finally {
    submitBtn.disabled = mode === 'signup' && !config.signupsOpen;
  }
});

render();
