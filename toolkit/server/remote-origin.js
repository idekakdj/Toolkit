// Only a bare HTTPS origin may become an account/server destination.
function remoteOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter the HTTPS address of your Toolkit server.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Invalid Toolkit server address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Toolkit servers require a bare HTTPS address, without credentials, paths or query strings.');
  }
  return url.origin;
}
module.exports = { remoteOrigin };
