const path = require('node:path');
const os = require('node:os');
function dataDirectory() {
  if (process.env.TOOLKIT_DATA_DIR) return path.resolve(process.env.TOOLKIT_DATA_DIR);
  const home = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(home, 'Toolkit', 'data');
}
module.exports = { dataDirectory };
