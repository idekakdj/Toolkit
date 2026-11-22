const { startLocalRuntime } = require('./local-runtime');
const { remoteOrigin } = require('./remote-origin');
async function start() {
  const publicOrigin = remoteOrigin(process.env.TOOLKIT_PUBLIC_URL);
  if (!process.env.TOOLKIT_DATA_DIR) throw new Error('Hosted Toolkit requires TOOLKIT_DATA_DIR pointing to durable storage.');
  const runtime = await startLocalRuntime({ publicOrigin });
  console.log(`Toolkit hosted backend ready for ${publicOrigin}`);
  if (runtime.reused) throw new Error('This data directory is already in use. Stop its server before starting hosted mode.');

  // Say plainly when a recommended safeguard is off, and record the security-relevant
  // configuration (never any secret value) in the audit trail for later review.
  const { encryptionEnabled } = require('./store');
  const mail = require('./mailer').configured();
  const contact = !!(process.env.TOOLKIT_PRIVACY_CONTACT || '').trim();
  const warnings = [];
  if (!encryptionEnabled) warnings.push('TOOLKIT_DATA_KEY is not set: stored accounts and artwork are NOT encrypted at rest.');
  if (!mail) warnings.push('Email is not configured (TOOLKIT_SMTP_URL or mail.json): NEW SIGN-UPS ARE PAUSED, because addresses cannot be confirmed, and passwords cannot be reset by email.');
  if (!contact) warnings.push('TOOLKIT_PRIVACY_CONTACT is not set: the privacy notice shows no contact for access, correction or complaint requests.');
  for (const w of warnings) console.warn('[security] ' + w);
  require('./audit').audit('server.start', { detail: { mode: 'hosted', encryptionAtRest: encryptionEnabled, emailVerification: mail, privacyContact: contact, node: process.version } });
}
start().catch(err => { console.error(err.message); process.exit(1); });
