#!/usr/bin/env node
// Turn on outgoing email (sign-up confirmation codes and password resets).
//
//   cd toolkit
//   node scripts/setup-mail.cjs
//
// Asks for an SMTP account, sends a test message, and only then saves mail.json in
// the Toolkit data folder (the same folder the desktop app uses). For Gmail, turn on
// 2-Step Verification and create an "App password" (Google Account > Security >
// App passwords); use that 16-character password here, never your normal password.
//
// The password is stored in mail.json in your data folder. Keep that folder private.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { dataDirectory } = require('../server/storage-path');

const PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: 465 },
  outlook: { host: 'smtp-mail.outlook.com', port: 587 },
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465 },
};

function ask(rl, question, { hidden = false } = {}) {
  return new Promise(resolve => {
    if (!hidden) return rl.question(question, a => resolve(a.trim()));
    // Do not echo the password to the terminal.
    const out = rl.output;
    rl.output = { write: s => { if (s.includes(question)) out.write(question); } };
    rl.question(question, a => { rl.output = out; out.write('\n'); resolve(a.trim()); });
  });
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const file = path.join(dataDirectory(), 'mail.json');
  console.log('Toolkit email setup');
  console.log('Settings will be saved to: ' + file + '\n');

  const provider = (await ask(rl, 'Provider (gmail / outlook / yahoo / other) [gmail]: ')).toLowerCase() || 'gmail';
  let { host, port } = PRESETS[provider] || {};
  if (!host) {
    host = await ask(rl, 'SMTP server (e.g. smtp.example.com): ');
    port = Number(await ask(rl, 'Port [465]: ')) || 465;
  }
  const user = await ask(rl, 'Email address to send from: ');
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
})().catch(err => { console.error(err.message); process.exit(1); });
