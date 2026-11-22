const { startLocalRuntime } = require('../server/local-runtime');

async function startRuntime({ dataDir, assetRoot, serverUrl }) {
  process.env.NODE_ENV = 'production';
  if (serverUrl) {
    const origin = require('../server/remote-origin').remoteOrigin(serverUrl);
    return { origin, remote: true, close: async () => {} };
  }
  return startLocalRuntime({ dataDir, assetRoot, port: process.env.TOOLKIT_DESKTOP_TEST_DIR ? 0 : 4310 });
}
module.exports = { startRuntime };
