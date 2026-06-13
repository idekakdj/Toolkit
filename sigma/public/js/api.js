// Shared API helper. Adds the CSRF header and normalizes errors.
export async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'X-Requested-With': 'sigma' },
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

export function redirectIfSignedOut(err) {
  if (err && err.status === 401) {
    window.location.href = '/auth?next=' + encodeURIComponent(window.location.pathname);
    return true;
  }
  return false;
}
