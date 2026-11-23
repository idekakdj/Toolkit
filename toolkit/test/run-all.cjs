// Run every app's isolated regression suite with one command.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const suites = [
  ['--test', 'toolkit/test/remote-origin.test.cjs'],
  ['--test', 'toolkit/test/hosted.test.cjs'],
  ['--test', 'toolkit/test/server.test.js'],
  ['--test', 'toolkit/test/security.test.cjs'],
  ['--test', 'toolkit/test/shell.test.cjs'],
  ['--test', 'toolkit/test/mail.test.cjs'],
  ['--test', 'toolkit/test/google.test.cjs'],
  ['--test', 'toolkit/test/mfa.test.cjs'],
  ['--test', 'toolkit/test/upload-guard.test.cjs'],
  ['--test', 'toolkit/test/local-runtime.test.cjs'],
  ['--test', 'toolkit/test/migration.test.cjs'],
  ['--test', 'toolkit/test/data-integrity.test.cjs'],
  ['--test', 'toolkit/test/app-saves.test.cjs'],
  ['--test', 'sigma/tests/regression.test.js'],
  ['--test', 'sigma/tests/distribution.test.js'],
  ['pigment/tests/regression.cjs'],
  ['pigment/tests/raster.cjs'],
  ['pigment/tests/integration.cjs'],
  ['pigment/tests/text-import.cjs'],
  ['pigment/tests/shapes.cjs'],
  ['imagevendor/regression.cjs'],
  ['imagevendor/handoff-regression.cjs'],
  ['imagevendor/history-regression.cjs'],
  ['placeholder/tests/regression.cjs'],
  ['placeholder/tests/ui-regression.cjs'],
  ['placeholder/tests/resize.cjs'],
];
let failed = false;
for (const args of suites) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
