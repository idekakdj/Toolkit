'use strict';
// Licence report for production dependencies and vendored libraries. No dependencies.
// Writes toolkit/license-report.md; exits 1 on a missing/UNKNOWN or strong-copyleft licence.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const BAD = /AGPL|(?<!L)GPL-[23]\.0(?!.*with)/i;
const WEAK = /LGPL/i;

function licenceOf(pkg) {
  let l = pkg.license;
  if (!l && Array.isArray(pkg.licenses)) l = pkg.licenses.map(x => x.type || x).join(' OR ');
  if (l && typeof l === 'object') l = l.type;
  return (l ? String(l) : '').trim();
}

// The Toolkit server and the separate MCP server package (toolkit/mcp, kept out of the
// desktop installer) are both reported. Each tree is read with `npm ls`.
const found = new Map();
function scan(dir, label) {
  const res = spawnSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
    cwd: dir, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
  });
  let tree;
  try { tree = JSON.parse(res.stdout); } catch (e) {
    console.error(`Could not parse \`npm ls\` output for ${label}:`, res.stderr || e.message);
    process.exit(1);
  }
  (function walk(deps, base) {
    for (const [name, info] of Object.entries(deps || {})) {
      // An optional peer dependency that is not installed shows up as an empty entry: nothing ships.
      if (info && typeof info === 'object' && !Object.keys(info).length) continue;
      const nested = path.join(base, 'node_modules', name);
      const installed = fs.existsSync(nested) ? nested : path.join(dir, 'node_modules', name);
      const key = name + '@' + (info.version || '?');
      if (!found.has(key)) {
        let lic = '', version = info.version || '';
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
          lic = licenceOf(pkg); version = pkg.version || version;
        } catch (_) { /* not installed where expected; reported as UNKNOWN */ }
        found.set(key, { name, version, licence: lic || 'UNKNOWN', source: label });
      }
      walk(info.dependencies, fs.existsSync(nested) ? nested : base);
    }
  })(tree.dependencies, dir);
}
scan(root, 'npm');
const mcpDir = path.join(root, 'mcp');
if (fs.existsSync(path.join(mcpDir, 'package.json'))) {
  if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) {
    console.error('toolkit/mcp dependencies are not installed: run "npm install" in toolkit/mcp, then run this report again.');
    process.exit(1);
  }
  scan(mcpDir, 'npm (mcp)');
}

const rows = [...found.values()];

try {
  const md = fs.readFileSync(path.join(repo, 'placeholder', 'vendor', 'VENDOR.md'), 'utf8');
  for (const line of md.split(/\r?\n/)) {
    const c = line.split('|').map(s => s.trim());
    // | File | Library | Version | License | SHA-256 | Original source |
    if (c.length >= 7 && /\.(js|css)$/.test(c[1])) {
      rows.push({ name: c[2], version: c[3], licence: c[4] || 'UNKNOWN', source: 'placeholder/vendor/' + c[1] });
    }
  }
} catch (e) {
  console.error('Could not read placeholder/vendor/VENDOR.md:', e.message);
  process.exit(1);
}

rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const blocked = rows.filter(r => r.licence === 'UNKNOWN' || BAD.test(r.licence));
const attention = rows.filter(r => WEAK.test(r.licence));

const esc = s => String(s).replace(/\|/g, '\\|');
const table = list => ['| Package | Version | Licence | Source |', '|---|---|---|---|']
  .concat(list.map(r => `| ${esc(r.name)} | ${esc(r.version)} | ${esc(r.licence)} | ${esc(r.source)} |`)).join('\n');

const counts = {};
for (const r of rows) counts[r.licence] = (counts[r.licence] || 0) + 1;

const out = [
  '# Licence report',
  '',
  `Generated ${new Date().toISOString()} by \`scripts/license-report.cjs\`.`,
  `Production npm packages: ${rows.filter(r => r.source.startsWith('npm')).length} (MCP server: ${rows.filter(r => r.source === 'npm (mcp)').length}); vendored libraries: ${rows.filter(r => !r.source.startsWith('npm')).length}.`,
  '',
  '## Needs attention',
  '',
];
if (blocked.length) out.push('Blocked (missing, UNKNOWN or strong copyleft):', '', table(blocked), '');
if (attention.length) out.push('Weak copyleft (LGPL) is allowed but needs a notice and a replaceable library (see `placeholder/vendor/VENDOR.md`):', '', table(attention), '');
if (!blocked.length && !attention.length) out.push('Nothing.', '');
out.push('## Summary by licence', '', '| Licence | Count |', '|---|---|',
  ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${esc(k)} | ${v} |`), '',
  '## All components', '', table(rows), '');

fs.writeFileSync(path.join(root, 'license-report.md'), out.join('\n'));
console.log(`licence report: ${rows.length} components, ${attention.length} flagged (LGPL), ${blocked.length} blocked`);
for (const r of attention) console.log(`  attention: ${r.name}@${r.version} ${r.licence} (${r.source})`);
for (const r of blocked) console.error(`  BLOCKED: ${r.name}@${r.version} ${r.licence} (${r.source})`);
process.exit(blocked.length ? 1 : 0);
