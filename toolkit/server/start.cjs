const { startLocalRuntime } = require('./local-runtime');
startLocalRuntime().then(runtime => {
  console.log(`Toolkit ${runtime.reused ? 'already running' : 'running'} at ${runtime.origin}`);
  if (runtime.reused) process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
