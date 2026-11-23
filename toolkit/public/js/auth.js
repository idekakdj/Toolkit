// Shared sign in / sign up for every app under Toolkit.
// Honors ?next=<same-site path> so each app can send users back where they were headed.
//
// Two ways in:
//   - Continue with Google (shown only when the server has Google keys in toolkit/.env).
//   - Email and password. Sign-up asks for a name, an email address at an established
//     provider (the server checks it), a password that reaches "Strong" on the meter,
//     the same password again and privacy consent; the account is then confirmed with a
//     6-digit code emailed to the address before it can be used.
import { api, safeNext } from './api.js';
import { attachMeter, attachMatch, weakReason, MIN_LENGTH } from './password-strength.js';

const params = new URLSearchParams(window.location.search);
const nextPath = safeNext(params.get('next'));

const $ = id => document.getElementById(id);
const form = $('auth-form');
const title = $('auth-title');
const sub = $('auth-sub');
const nameField = $('name-field');
const nameInput = $('name');
const emailInput = $('email');
const emailHint = $('email-hint');
const passwordInput = $('password');
const pwHint = $('pw-hint');
const confirmField = $('confirm-field');
const confirmInput = $('confirm');
const confirmHint = $('confirm-hint');
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
const pausedBox = $('signup-paused');
const googleWrap = $('google-wrap');
const googleBtn = $('google-btn');
const googleLabel = $('google-label');
const dividerText = $('divider-text');

const mfaForm = $('mfa-form');
const mfaInput = $('mfa-code');
const mfaLabel = $('mfa-label');
const mfaHint = $('mfa-hint');
const mfaBtn = $('mfa-btn');
const mfaLinks = $('mfa-links');
const mfaSwitchBtn = $('mfa-switch-btn');
const mfaCancelBtn = $('mfa-cancel-btn');
let useRecovery = false;

let mode = params.get('mode') === 'signup' ? 'signup' : 'signin';   // 'signup' | 'signin' | 'code' | 'mfa'
let codeFrom = 'signup';                                              // where "Use a different email" returns to
let config = { emailEnabled: false, passwordMinLength: MIN_LENGTH, signupsOpen: true, googleEnabled: false };
let pendingEmail = '';

const meter = attachMeter(passwordInput, { minLength: MIN_LENGTH });
const match = attachMatch(passwordInput, confirmInput, confirmHint);

const GOOGLE_ERRORS = {
  cancelled: 'Google sign-in was cancelled.',
  failed: 'Google sign-in did not complete. Please try again.',
  expired: 'That Google sign-in expired or was started in another tab. Please try again.',
  unverified: 'Your Google account email address is not verified, so it cannot be used here.',
  conflict: 'That email address is already linked to a different Google account.',
  wrong_account: 'You picked a different Google account from the one that is signed in.',
  disabled: 'Google sign-in is not set up on this Toolkit.',
  desktop_unavailable: 'Google sign-in from the desktop app works with the local Toolkit only. Sign in with your email and password, or open this server in a web browser.',
};

function render() {
  const signup = mode === 'signup';
  const mfa = mode === 'mfa';
  const code = mode === 'code';
  title.textContent = mfa ? 'Two-step sign-in' : code ? 'Confirm your email' : signup ? 'Create your account' : 'Sign in';
  sub.textContent = mfa
    ? (useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.')
    : code
    ? 'Enter the 6-digit code we sent to ' + pendingEmail + '.'
    : signup ? 'One account, every tool on the wall.' : 'One key opens every tool in the box.';
  form.hidden = code || mfa;
  codeForm.hidden = !code;
  mfaForm.hidden = !mfa;
  mfaLinks.hidden = !mfa;
  resendWrap.hidden = !code;
  backWrap.hidden = !code;
  toggleWrap.hidden = code || mfa;
  if (mfa) {
    mfaLabel.textContent = useRecovery ? 'Recovery code' : 'Authenticator code';
    mfaHint.textContent = useRecovery
      ? 'Each recovery code works once. Format: abcd-efgh.'
      : 'Open your authenticator app and enter the current code.';
    mfaInput.inputMode = useRecovery ? 'text' : 'numeric';
    mfaInput.placeholder = useRecovery ? 'abcd-efgh' : '123456';
    mfaSwitchBtn.textContent = useRecovery ? 'Use an authenticator code instead' : 'Use a recovery code instead';
  }
  nameField.hidden = !signup;
  nameInput.required = signup;
  meter.element.hidden = !signup;
  pwHint.hidden = !signup;
  confirmField.hidden = !signup;
  confirmInput.required = signup;
  consentField.hidden = !signup;
  emailHint.hidden = !signup || !emailHint.textContent;
  forgotWrap.hidden = mode !== 'signin' || !config.emailEnabled;  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  submitBtn.textContent = signup ? 'Create account' : 'Sign in';
  submitBtn.disabled = signup && !config.signupsOpen;
  toggleWrap.firstChild.textContent = signup ? 'Already have a key? ' : 'New around the bench? ';
  toggleBtn.textContent = signup ? 'Sign in instead' : 'Create an account';

  googleWrap.hidden = code || mfa || !config.googleEnabled;
  googleLabel.textContent = signup ? 'Sign up with Google' : 'Sign in with Google';
  dividerText.textContent = signup ? 'or sign up with email' : 'or sign in with email';
  googleBtn.href = '/api/auth/google/start' + (nextPath !== '/' ? '?next=' + encodeURIComponent(nextPath) : '');

  pausedBox.hidden = !(signup && !config.signupsOpen);
  pausedBox.textContent = 'Email sign-ups are paused: this Toolkit cannot send email yet, so it cannot confirm new addresses. '
    + (config.googleEnabled ? 'You can still sign up with Google above.' : 'Existing accounts can still sign in.');
  if (code) setTimeout(() => codeInput.focus(), 0);
  if (mfa) setTimeout(() => mfaInput.focus(), 0);
}

function enterMfa() {
  mode = 'mfa';
  useRecovery = false;
  mfaInput.value = '';
  passwordInput.value = '';
  confirmInput.value = '';
  meter.update();
  match.update();
  clearMessages();
  render();
}

function clearMessages() {
  errorBox.classList.remove('show');
  noticeBox.classList.remove('show');
}
function showError(msg, field) {
  noticeBox.classList.remove('show');
  errorBox.textContent = msg;
  errorBox.classList.add('show');
  if (field) field.focus();
}
function showNotice(msg) {
  errorBox.classList.remove('show');
  noticeBox.textContent = msg;
  noticeBox.classList.add('show');
}

// ---------- email feedback (the server makes the final provider decision) ----------
function emailProblem(value) {
  if (!value) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/.test(value)) return 'Enter the full address, like name@gmail.com.';
  return null;
}
function setEmailHint(text, state, suggestion) {
  emailHint.replaceChildren();
  emailHint.dataset.state = state || '';
  if (text) emailHint.append(text);
  if (suggestion) {
    const fix = document.createElement('button');
    fix.type = 'button';
    fix.className = 'link-btn';
    fix.textContent = 'Use ' + suggestion;
    fix.addEventListener('click', () => {
      emailInput.value = suggestion;
      setEmailHint('', '');
      clearMessages();
      emailInput.focus();
    });
    emailHint.append(' ', fix);
  }
  emailHint.hidden = mode !== 'signup' || !emailHint.textContent;
}
// Only adds a warning: it must never clear the hint, because clicking the hint's own
// "Use ..." button blurs the field first and would remove the button mid-click.
emailInput.addEventListener('blur', () => {
  if (mode !== 'signup' || !emailInput.value.trim()) return;
  const problem = emailProblem(emailInput.value.trim());
  if (problem) setEmailHint(problem, 'bad');
});
emailInput.addEventListener('input', () => { if (emailHint.dataset.state) setEmailHint('', ''); });

function askForCode(email, message) {
  codeFrom = mode === 'signin' ? 'signin' : 'signup';
  pendingEmail = email;
  mode = 'code';
  codeInput.value = '';
  passwordInput.value = '';
  confirmInput.value = '';
  meter.update();
  match.update();
  render();
  showNotice(message);
}

api('/api/auth/config').then(c => {
  config = { ...config, ...c };
  meter.setMinLength(config.passwordMinLength);
  render();
}).catch(() => { /* defaults are fine */ });

// After Google sign-in the server sends people needing a code to /auth?mfa=1.
if (params.get('mfa') === '1') {
  params.delete('mfa');
  const rest = params.toString();
  history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''));
  mode = 'mfa';
}

// Errors handed back by the Google sign-in callback (?google=<reason>).
if (params.get('google')) {
  showError(GOOGLE_ERRORS[params.get('google')] || GOOGLE_ERRORS.failed);
  params.delete('google');
  const rest = params.toString();
  history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''));
}

toggleBtn.addEventListener('click', () => {
  mode = mode === 'signup' ? 'signin' : 'signup';
  clearMessages();
  setEmailHint('', '');
  render();
});

backBtn.addEventListener('click', () => {
  mode = codeFrom;
  clearMessages();
  render();
});

forgotBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) return showError('Enter your email address above first.', emailInput);
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

mfaSwitchBtn.addEventListener('click', () => {
  useRecovery = !useRecovery;
  mfaInput.value = '';
  clearMessages();
  render();
});

mfaCancelBtn.addEventListener('click', async () => {
  mfaCancelBtn.disabled = true;
  try { await api('/api/auth/mfa/cancel', { method: 'POST' }); } catch { /* the challenge expires on its own */ }
  finally { mfaCancelBtn.disabled = false; }
  mode = 'signin';
  useRecovery = false;
  mfaInput.value = '';
  clearMessages();
  render();
});

// Authenticator codes and recovery codes (letters, digits, dashes); drop everything else.
mfaInput.addEventListener('input', () => {
  mfaInput.value = mfaInput.value.replace(/[^0-9A-Za-z\- ]/g, '').slice(0, 20);
});

mfaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  const code = mfaInput.value.trim();
  if (!code) return showError(useRecovery ? 'Enter a recovery code.' : 'Enter the 6-digit code from your authenticator app.', mfaInput);
  mfaBtn.disabled = true;
  try {
    await api('/api/auth/mfa/verify', { method: 'POST', body: { code } });
    window.location.href = nextPath;
  } catch (err) {
    const data = err.data || {};
    if (data.code === 'mfa_expired') {
      mode = 'signin';
      useRecovery = false;
      render();
      showError(err.message || 'That sign-in expired. Please sign in again.');
    } else if (data.code === 'mfa_invalid') {
      const left = Number(data.attemptsLeft);
      mfaInput.value = '';
      showError(err.message + (Number.isFinite(left) ? ' (' + left + (left === 1 ? ' attempt' : ' attempts') + ' left)' : ''), mfaInput);
    } else {
      showError(err.message, mfaInput);
    }
  } finally { mfaBtn.disabled = false; }
});

// Keep only digits as the code is typed or pasted.
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) return showError('Enter the 6-digit code from the email.', codeInput);
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
  clearMessages();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (mode === 'signup') {
    if (!nameInput.value.trim()) return showError('Please enter your name.', nameInput);
    const badEmail = emailProblem(email);
    if (badEmail) { setEmailHint(badEmail, 'bad'); return showError(badEmail, emailInput); }
    const weak = weakReason(password, config.passwordMinLength);
    if (weak) return showError(weak, passwordInput);
    if (password !== confirmInput.value) return showError('The two passwords do not match.', confirmInput);
    if (!consentBox.checked) return showError('Please accept the privacy notice to create an account.', consentBox);
  } else if (!email || !password) {
    return showError('Email and password are required.', email ? passwordInput : emailInput);
  }

  submitBtn.disabled = true;
  try {
    if (mode === 'signup') {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: { name: nameInput.value.trim(), email, password, confirmPassword: confirmInput.value, acceptTerms: consentBox.checked },
      });
      if (res && res.verificationRequired) {
        // The account cannot be used until the code from the mailbox is entered.
        askForCode(email, 'We sent a 6-digit code to ' + email + '. Enter it below to finish creating your account.');
        return;
      }
    } else {
      const res = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      if (res && res.mfaRequired) { enterMfa(); return; }
      if (res && res.mfaSetupRequired) { window.location.href = '/account?setup-mfa=1'; return; }
    }
    window.location.href = nextPath;
  } catch (err) {
    const data = err.data || {};
    if (data.code === 'email_not_verified') {
      askForCode(email, 'Confirm your email to finish signing in. We sent a 6-digit code to ' + email + '.');
      return;
    }
    if (data.code === 'signups_paused') { config.signupsOpen = false; render(); }
    if (data.field === 'email') setEmailHint(err.message, 'bad', data.suggestion);
    const field = { email: emailInput, password: passwordInput, confirm: confirmInput }[data.field];
    showError(err.message, field);
  } finally {
    submitBtn.disabled = mode === 'signup' && !config.signupsOpen;
  }
});

render();
