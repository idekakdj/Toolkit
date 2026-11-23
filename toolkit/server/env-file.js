// Loads local secrets (Google sign-in keys, optional SMTP settings) from toolkit/.env.
//
// The file is listed in the root .gitignore and is never copied into a desktop
// installer (desktop/builder.cjs packs an explicit allow-list), so the keys stay on
// this machine. Variables that are already set in the real environment always win,
// so a hosted deployment's systemd EnvironmentFile still has the final say.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const DEFAULT_FILE = path.join(__dirname, '..', '.env');

function loadEnvFile(file = process.env.TOOLKIT_ENV_FILE || DEFAULT_FILE) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { loaded: false, file, keys: [] }; }
  const values = parseEnv(text.replace(/^\uFEFF/, ''));
  const keys = [];
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined && value !== '') { process.env[key] = value; keys.push(key); }
  }
  return { loaded: true, file, keys };
}

module.exports = { loadEnvFile, DEFAULT_FILE };
