#!/usr/bin/env node
// Turn on outgoing email (sign-up confirmation codes and password resets).
//
//   cd toolkit
//   node scripts/setup-mail.cjs
//
// Asks which email address Toolkit should send from and works out the mail provider from
// that address (Gmail, Outlook/Hotmail, Yahoo, iCloud, AOL and Google Workspace domains
// are recognised; for anything else it asks for the SMTP server). Then it asks for an app
// password, sends a test message, and only if that succeeds saves mail.json in the Toolkit
// data folder (the same folder the desktop app uses).
//
// Use an app password, never your normal password: it is created in the provider's account
// security settings and can be revoked without changing your login.
//
// The password is stored in mail.json in your data folder. Keep that folder private.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const dns = require('node:dns').promises;
const { dataDirectory } = require('../server/storage-path');

const PROVIDERS = {
  gmail: {
    name: 'Gmail', host: 'smtp.gmail.com', port: 465,
    help: 'Gmail needs 2-Step Verification turned on, then an App password: Google Account > Security > App passwords.',
  },
  outlook: {
    name: 'Outlook / Hotmail', host: 'smtp-mail.outlook.com', port: 587,
    help: 'If your account uses two-step verification, create an app password in your Microsoft account security settings.',
  },
  yahoo: {
    name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 465,
    help: 'Create an app password: Yahoo Account Security > Generate app password.',
  },
  icloud: {
    name: 'iCloud', host: 'smtp.mail.me.com', port: 587,
    help: 'Create an app-specific password at account.apple.com > Sign-In and Security.',
  },
  aol: {
    name: 'AOL', host: 'smtp.aol.com', port: 465,
    help: 'Create an app password in AOL Account Security (Generate app password).',
  },
};

// A real top-level domain such as com, net, fr, co.uk or com.au; not an arbitrary subdomain.
const TLD = '(?:com|net|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})';

// Provider key for a well-known mail domain, or null.
function providerForDomain(domain) {
  const d = String(domain || '').toLowerCase();
  if (d === 'gmail.com' || d === 'googlemail.com') return 'gmail';
  if (new RegExp(`^(outlook|hotmail|live|msn)\\.${TLD}$`).test(d)) return 'outlook';
  if (new RegExp(`^yahoo\\.${TLD}$`).test(d) || d === 'ymail.com' || d === 'rocketmail.com') return 'yahoo';
  if (d === 'icloud.com' || d === 'me.com' || d === 'mac.com') return 'icloud';
  if (d === 'aol.com') return 'aol';
  return null;
}

// Known domain first; otherwise a custom domain whose mail is hosted by Google Workspace.
async function detectProvider(domain) {
  const known = providerForDomain(domain);
  if (known) return known;
  try {
    const hosts = (await dns.resolveMx(domain)).map(r => r.exchange.toLowerCase());
    if (hosts.some(h => /(^|\.)(google|googlemail)\.com$/.test(h))) return 'gmail';
  } catch { /* no MX records or DNS unavailable: fall back to asking for the server */ }
  return null;
}

function ask(rl, question, { hidden = false } = {}) {
  return new Promise(resolve => {
    if (!hidden) return rl.question(question, a => resolve(a.trim()));
    // Do not echo the password to the terminal.
    const out = rl.output;
    rl.output = { write: s => { if (s.includes(question)) out.write(question); } };
    rl.question(question, a => { rl.output = out; out.write('\n'); resolve(a.trim()); });
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const file = path.join(dataDirectory(), 'mail.json');
  console.log('Toolkit email setup');
  console.log('Settings will be saved to: ' + file + '\n');

  const user = await ask(rl, 'Email address Toolkit should send from: ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    rl.close();
    console.error('Enter a full email address, like name@gmail.com.');
    process.exit(1);
  }
  const domain = user.split('@')[1].toLowerCase();

  let host, port;
  const key = await detectProvider(domain);
  if (key) {
    const p = PROVIDERS[key];
    console.log(`Detected ${p.name} (${p.host}).`);
    const answer = (await ask(rl, 'Use these settings? [Y/n]: ')).toLowerCase();
    if (answer !== 'n' && answer !== 'no') {
      host = p.host;
      port = p.port;
      console.log(p.help + '\n');
    }
  } else {
    console.log(`Could not recognise the mail provider for ${domain}.`);
  }
  if (!host) {
    host = await ask(rl, 'SMTP server (e.g. smtp.example.com): ');
    port = Number(await ask(rl, 'Port [465]: ')) || 465;
  }

  const pass = await ask(rl, 'App password (input hidden): ', { hidden: true });
  const testTo = (await ask(rl, `Send a test message to [${user}]: `)) || user;
  rl.close();
  if (!host || !user || !pass) { console.error('Server, address and password are all required.'); process.exit(1); }

  const scheme = port === 465 ? 'smtps' : 'smtp';
  const smtpUrl = `${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  const from = `Toolkit <${user}>`;

  console.log('\nSending a test message...');
  try {
    const transport = require('nodemailer').createTransport(smtpUrl);
    await transport.sendMail({ from, to: testTo, subject: 'Toolkit email is working',
      text: 'This test message confirms Toolkit can send sign-up confirmation codes and password resets.\n' });
  } catch (err) {
    console.error('Could not send: ' + err.message);
    console.error('Nothing was saved. Check the address and app password and try again.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ smtpUrl, from }, null, 2), { mode: 0o600 });
  console.log(`Sent to ${testTo}. Saved ${file}.`);
  console.log('Sign-ups are open again; new accounts confirm their email with a 6-digit code.');
  console.log('A running Toolkit picks this up within a few seconds (no restart needed).');
}

if (require.main === module) main().catch(err => { console.error(err.message); process.exit(1); });

module.exports = { providerForDomain, detectProvider, PROVIDERS };
