// Toolkit - one channel for every app. Express server entry point.
if (require.main === module) {
  console.error('Use npm start (server/start.cjs) to share the browser/desktop runtime safely.');
  process.exit(1);
}
// Hosts the Toolkit shell plus the Sigma and Placeholder apps behind
// a single shared sign-in.
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const {
  apiLimiter, writeLimiter, pageLimiter, csrfProtect, requireAuth, getSessionUser, safeNextPath, mfaSetupPending,
} = require('./security');
const mfa = require('./mfa');
const authRoutes = require('./auth');
const accountRoutes = require('./account');
const projectRoutes = require('./projects');
const paintingRoutes = require('./paintings');
const imageRoutes = require('./images');

const app = express();
const ASSET_ROOT = process.env.TOOLKIT_ASSET_ROOT || path.join(__dirname, '..', '..');
const TOOLKIT_PUBLIC = path.join(ASSET_ROOT, 'toolkit', 'public');
const SIGMA_PUBLIC = path.join(ASSET_ROOT, 'sigma', 'public');
const PLACEHOLDER_DIR = path.join(ASSET_ROOT, 'placeholder');
const PIGMENT_DIR = path.join(ASSET_ROOT, 'pigment');
const IMAGEVENDOR_DIR = path.join(ASSET_ROOT, 'imagevendor');

app.disable('x-powered-by');
// Hosted mode is reached only through a reverse proxy on this machine.
if (process.env.TOOLKIT_LOCAL_ONLY === '0') app.set('trust proxy', 'loopback');

// ---------- security headers ----------
// One strict Content-Security-Policy for every app: scripts, styles, fonts and
// images come from this origin only (Placeholder's libraries and fonts are
// self-hosted under placeholder/vendor). Everything else from helmet applies globally.
const baseHelmet = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  // The tab shell (home.html) embeds app pages in same-origin iframes, so framing is
  // limited to this origin (X-Frame-Options SAMEORIGIN plus CSP frame-ancestors 'self')
  // instead of denied outright. Other sites still cannot frame Toolkit.
  xFrameOptions: { action: 'sameorigin' },
});

const strictCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    // No 'unsafe-inline': pages and apps use stylesheets and classes; scripts set only
    // individual CSSOM properties (el.style.x = ...), which CSP allows.
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    mediaSrc: ["'self'", 'blob:'],           // video/audio decoding for conversions
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],   // same-origin only: the tab shell frames app pages (see baseHelmet)
  },
});

app.use(baseHelmet);
app.use((req, res, next) => {
  // None of the apps need device APIs; deny them so injected code could not use them either.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()');
  next();
});
app.use((req, res, next) => {
  strictCsp(req, res, next);
});

// Liveness probe for monitoring: reveals nothing about the system.
app.get('/healthz', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true }); });

// ---------- shared API: rate limited + CSRF checked ----------
// Every limit and the CSRF check run before a body is read. Data routes also require a
// signed-in session BEFORE the body parser, so anonymous clients cannot make the server
// buffer large payloads. Each route gets a body limit matching its real maximum.
app.use('/api', apiLimiter, writeLimiter, csrfProtect, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const json = limit => express.json({ limit });
app.use('/api/auth', json('16kb'), authRoutes);
app.use('/api/account', requireAuth, json('16kb'), accountRoutes);
app.use('/api/projects', requireAuth, json('10mb'), projectRoutes);
app.use('/api/paintings', requireAuth, json('10mb'), paintingRoutes);
app.use('/api/images', requireAuth, json('27mb'), imageRoutes);

// ---------- page helpers ----------
// Pages (not the API) share one generous limiter to blunt scraping and request floods.
app.use((req, res, next) => (req.path.startsWith('/api/') ? next() : pageLimiter(req, res, next)));

function gate(req, res, file, dir) {
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect('/auth?next=' + encodeURIComponent(safeNextPath(req.originalUrl)));
  }
  // TOOLKIT_REQUIRE_MFA=1: until two-step sign-in is set up, only the account page opens.
  if (file !== 'account.html' && mfaSetupPending(req, user)) return res.redirect('/account?setup-mfa=1');
  // Signed-in pages must never be kept by a shared browser's cache.
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(dir, file));
}

// Signed-in people never see landing pages: "/" is the tab shell (home.html) for them.
// Falls back to the landing page only if the shell file is missing from the install.
function home(req, res) {
  const user = getSessionUser(req);
  if (!user) return res.sendFile(path.join(TOOLKIT_PUBLIC, 'index.html'));
  if (mfaSetupPending(req, user)) return res.redirect('/account?setup-mfa=1');
  res.set('Cache-Control', 'no-store');
  const shell = path.join(TOOLKIT_PUBLIC, 'home.html');
  res.sendFile(fs.existsSync(shell) ? shell : path.join(TOOLKIT_PUBLIC, 'index.html'));
}
// An app's landing page is for signed-out visitors; signed-in people are sent to the shell.
function landing(dir) {
  return (req, res) => {
    if (getSessionUser(req)) return res.redirect('/');
    res.sendFile(path.join(dir, 'index.html'));
  };
}

// Static files are served from an allow-list: only web asset types, never tests,
// reports, scripts (.cjs), source notes (.md) or anything under a tests/ folder. An
// application directory also contains developer files that must not be public.
const PUBLIC_EXT = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']);
function assets(dir, options = {}) {
  const serve = express.static(dir, { index: options.index === true ? 'index.html' : false, dotfiles: 'deny', fallthrough: true });
  return (req, res, next) => {
    let p;
    try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
    if (/(^|[\\/])(tests?|node_modules|\.[^\\/]*)([\\/]|$)/i.test(p) || p.includes('\0')) return next();
    const ext = path.extname(p).toLowerCase();
    if (ext && !PUBLIC_EXT.has(ext)) return next();
    serve(req, res, next);
  };
}

// ---------- Toolkit shell ----------
app.get('/', home);
app.get('/home.html', (req, res) => (getSessionUser(req) ? home(req, res) : res.redirect('/')));
app.get('/auth', (req, res) => {
  // During a two-step challenge the person may still hold an older session; keep the page open for the code.
  const challenged = req.query.mfa === '1' && mfa.hasChallengeCookie(req);
  if (!challenged && getSessionUser(req)) return res.redirect(safeNextPath(req.query.next));
  res.sendFile(path.join(TOOLKIT_PUBLIC, 'auth.html'));
});
app.get('/privacy', (req, res) => res.sendFile(path.join(TOOLKIT_PUBLIC, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(TOOLKIT_PUBLIC, 'terms.html')));
app.get('/reset', (req, res) => res.sendFile(path.join(TOOLKIT_PUBLIC, 'reset.html')));
app.get('/account', (req, res) => gate(req, res, 'account.html', TOOLKIT_PUBLIC));

// ---------- Sigma (design studio) ----------
app.get(['/sigma', '/sigma/index.html'], landing(SIGMA_PUBLIC));
// The central dashboard in the shell replaces the old Sigma project list; "/" handles signed-out visitors.
app.get(['/sigma/dashboard', '/sigma/dashboard.html'], (req, res) => res.redirect('/'));
app.get('/sigma/editor.html', (req, res) => gate(req, res, 'editor.html', SIGMA_PUBLIC));
app.get('/sigma/editor/:id', (req, res) => gate(req, res, 'editor.html', SIGMA_PUBLIC));
app.use('/sigma', assets(SIGMA_PUBLIC));

// ---------- Placeholder (file converter) ----------
app.get('/placeholder/convert.html', (req, res) => gate(req, res, 'convert.html', PLACEHOLDER_DIR));
// The Placeholder landing page uses relative links, so it must be served from "/placeholder/".
app.get('/placeholder', (req, res, next) => {
  if (req.path !== '/placeholder') return next();
  const q = req.originalUrl.indexOf('?');
  res.redirect(301, '/placeholder/' + (q >= 0 ? req.originalUrl.slice(q) : ''));
});
app.get(['/placeholder/', '/placeholder/index.html'], landing(PLACEHOLDER_DIR));
app.use('/placeholder', assets(PLACEHOLDER_DIR));

// ---------- Pigment (paint & coloring studio) ----------
app.get(['/pigment', '/pigment/index.html'], landing(PIGMENT_DIR));
app.get('/pigment/app.html', (req, res) => gate(req, res, 'app.html', PIGMENT_DIR));
app.get('/pigment/app', (req, res) => gate(req, res, 'app.html', PIGMENT_DIR));
app.use('/pigment', assets(PIGMENT_DIR));

// ---------- ImageVendor (raster image editor) ----------
app.get(['/imagevendor', '/imagevendor/index.html'], landing(IMAGEVENDOR_DIR));
app.get('/imagevendor/app.html', (req, res) => gate(req, res, 'app.html', IMAGEVENDOR_DIR));
app.get('/imagevendor/app', (req, res) => gate(req, res, 'app.html', IMAGEVENDOR_DIR));
app.use('/imagevendor', assets(IMAGEVENDOR_DIR));

// Toolkit shell assets (css/js/img for the landing + auth pages). The gated account
// page is also reachable by file name, so it is excluded here and served via gate().
app.use((req, res, next) => (/^\/account\.html$/i.test(req.path) ? res.redirect('/account') : next()));
app.use(assets(TOOLKIT_PUBLIC));

// JSON 404 for unknown API routes, page 404 otherwise.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(TOOLKIT_PUBLIC, '404.html'));
});

// Never leak stack traces. Client errors keep their 4xx status; everything else is a generic 500.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', req.method, req.path, err && err.message);
  if (res.headersSent) return res.destroy();
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong.' : 'Invalid request.' });
});

module.exports = app;
