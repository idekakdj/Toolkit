// Shared sign in / sign up for every app under Toolkit.
// Honors ?next=<same-site path> so each app can send users back where
// they were headed.
import { api, safeNext } from './api.js';

const params = new URLSearchParams(window.location.search);
const nextPath = safeNext(params.get('next'));

const form = document.getElementById('auth-form');
const title = document.getElementById('auth-title');
const sub = document.getElementById('auth-sub');
const nameField = document.getElementById('name-field');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const pwHint = document.getElementById('pw-hint');
const submitBtn = document.getElementById('submit-btn');
const toggleBtn = document.getElementById('toggle-btn');
const toggleWrap = document.getElementById('auth-toggle');
const errorBox = document.getElementById('auth-error');

let mode = params.get('mode') === 'signup' ? 'signup' : 'signin';

function render() {
  const signup = mode === 'signup';
  title.textContent = signup ? 'Create your account' : 'Sign in';
  sub.textContent = signup
    ? 'One account, every tool on the wall.'
    : 'One key opens every tool in the box.';
  nameField.hidden = !signup;
  pwHint.hidden = !signup;
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  submitBtn.textContent = signup ? 'Create account' : 'Sign in';
  toggleWrap.firstChild.textContent = signup ? 'Already have a key? ' : 'New around the bench? ';
  toggleBtn.textContent = signup ? 'Sign in instead' : 'Create an account';
  errorBox.classList.remove('show');
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

toggleBtn.addEventListener('click', () => {
  mode = mode === 'signup' ? 'signin' : 'signup';
  render();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return showError('Email and password are required.');
  if (mode === 'signup') {
    if (!nameInput.value.trim()) return showError('Please enter your name.');
    if (password.length < 8) return showError('Password must be at least 8 characters.');
  }

  submitBtn.disabled = true;
  try {
    if (mode === 'signup') {
      await api('/api/auth/register', {
        method: 'POST',
        body: { name: nameInput.value.trim(), email, password },
      });
    } else {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
    }
    window.location.href = nextPath;
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

render();
