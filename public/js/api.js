// Shared API helper for the Toolkit shell. Adds the CSRF header.
export async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'X-Requested-With': 'toolkit' },
    credentials: 'same-origin',
  };
  if (options.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Mirrors the server's safeNextPath: same-site relative paths only.
export function safeNext(value) {
  if (typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(value)) return value;
  return '/';
}
