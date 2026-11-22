// Outbound mail for account verification and password reset.
//
// Configured by either:
//   - TOOLKIT_SMTP_URL (+ optional TOOLKIT_MAIL_FROM) environment variables (hosted), or
//   - a mail.json file in the data folder: { "smtpUrl": "...", "from": "..." }
//     (desktop/local; written by `node scripts/setup-mail.cjs`).
// The environment wins when both exist.
//
// Links in messages are built ONLY from TOOLKIT_PUBLIC_URL (hosted) or the loopback
// origin (local), never from a request's Host header, so a forged Host cannot poison
// a reset link ("password reset poisoning").
const fs = require('fs');
const path = require('path');
const { dataDirectory } = require('./storage-path');

let injected = null;          // test transport
let cached = { key: null, transport: null };
let fileCache = { at: 0, value: null };

function fileConfig() {
  // Re-read at most every 5 s so running setup-mail.cjs takes effect without a restart.
  if (Date.now() - fileCache.at < 5000) return fileCache.value;
  let value = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDirectory(), 'mail.json'), 'utf8'));
    if (raw && typeof raw.smtpUrl === 'string' && raw.smtpUrl.trim()) {
      value = { smtpUrl: raw.smtpUrl.trim(), from: typeof raw.from === 'string' ? raw.from.trim() : '' };
    }
  } catch { /* no file, or unreadable: not configured */ }
  fileCache = { at: Date.now(), value };
  return value;
}

function settings() {
  const env = (process.env.TOOLKIT_SMTP_URL || '').trim();
  if (env) return { smtpUrl: env, from: (process.env.TOOLKIT_MAIL_FROM || '').trim() };
  return fileConfig();
}

function configured() { return !!(injected || settings()); }

function getTransport(s) {
  if (injected) return injected;
  if (cached.key !== s.smtpUrl) {
    // Loaded lazily so installs that never send mail do not need the module at runtime.
    cached = { key: s.smtpUrl, transport: require('nodemailer').createTransport(s.smtpUrl) };
  }
  return cached.transport;
}

// Tests inject a fake transport that records messages instead of sending them.
function setTransport(t) { injected = t; }

async function send({ to, subject, text }) {
  const s = settings();
  if (!injected && !s) throw new Error('Mail is not configured.');
  if (typeof to !== 'string' || /[\r\n,;<>]/.test(to)) throw new Error('Refusing to mail an unsafe address.');
  await getTransport(s).sendMail({
    from: (s && s.from) || 'Toolkit <no-reply@localhost>',
    to, subject, text,
  });
}

function baseUrl(req) {
  if (process.env.TOOLKIT_PUBLIC_URL) return process.env.TOOLKIT_PUBLIC_URL.replace(/\/+$/, '');
  const port = req && req.socket && req.socket.localPort;
  return port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1';
}

module.exports = { configured, send, setTransport, baseUrl };
