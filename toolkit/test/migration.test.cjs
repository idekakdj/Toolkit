const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
test('migration preserves hashes/ownership, backs up, is repeatable and refuses conflicting data or active server', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-migration-'));
  const source = path.join(root, 'legacy.json'), destination = path.join(root, 'shared/data');
  const fixture = { users: [{ id: 'u', email: 'fixture@example.com', passwordHash: '$2b$11$' + 'a'.repeat(53) }], sessions: {},
    projects: [{ id: 'p', ownerId: 'u', document: { artboard: { w: 100, h: 100 }, nodes: [] } }], paintings: [], images: [] };
  const bytes = JSON.stringify(fixture); fs.writeFileSync(source, bytes);
  const run = () => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/migrate-local.cjs'), source],
    { env: { ...process.env, TOOLKIT_DATA_DIR: destination }, encoding: 'utf8', windowsHide: true });
  let result = run(); assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.accounts, 1); assert.equal(report.projects, 1);
  assert.equal(fs.readFileSync(path.join(destination, 'db.json'), 'utf8'), bytes);
  assert.equal(fs.readFileSync(path.join(report.backupDir, 'web-db.json'), 'utf8'), bytes);
  assert.equal(fs.readFileSync(source, 'utf8'), bytes);
  assert.equal(fs.existsSync(path.join(destination, 'runtime.json')), false);
  result = run(); assert.equal(result.status, 0); assert.match(result.stdout, /already matches/);
  fixture.users[0].email = 'changed@example.com'; fs.writeFileSync(source, JSON.stringify(fixture));
  result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /refusing to replace/);
  assert.equal(fs.readFileSync(path.join(destination, 'db.json'), 'utf8'), bytes);
  fs.writeFileSync(path.join(destination, 'runtime.json'), '{}');
  result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /Close the shared/);
  assert.equal(fs.readFileSync(path.join(destination, 'db.json'), 'utf8'), bytes);
});
