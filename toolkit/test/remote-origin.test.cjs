const { test } = require('node:test');
const assert = require('node:assert/strict');
const { remoteOrigin } = require('../server/remote-origin');
test('shared destinations require HTTPS and cannot smuggle credentials or paths', () => {
  assert.equal(remoteOrigin('https://toolkit.example.com/'), 'https://toolkit.example.com');
  for (const value of ['http://example.com', 'file:///C:/test', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=abc', 'https://example.com/#abc', '', null]) assert.throws(() => remoteOrigin(value));
});
test('remote desktop never opens or changes the local account database', async () => {
  const runtime = await require('../desktop/runtime.cjs').startRuntime({ serverUrl: 'https://toolkit.example.com', dataDir: 'not-used' });
  assert.equal(runtime.origin, 'https://toolkit.example.com');
  assert.equal(runtime.remote, true);
  assert.equal(require.cache[require.resolve('../server/store')], undefined);
  await runtime.close();
});
