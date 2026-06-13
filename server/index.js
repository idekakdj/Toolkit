// Toolkit - one channel for every app. Express server entry point.
// Hosts the Toolkit shell plus the Sigma and Placeholder apps behind
// a single shared sign-in.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { apiLimiter, csrfProtect, getSessionUser, safeNextPath } = require('./security');
const authRoutes = require('./auth');
const projectRoutes = require('./projects');
const paintingRoutes = require('./paintings');

const app = express();
const PORT = process.env.PORT || 4310;
const TOOLKIT_PUBLIC = path.join(__dirname, '..', 'public');
const SIGMA_PUBLIC = path.join(__dirname, '..', '..', 'sigma', 'public');
const PLACEHOLDER_DIR = path.join(__dirname, '..', '..', 'placeholder');
const PIGMENT_DIR = path.join(__dirname, '..', '..', 'pigment');

app.disable('x-powered-by');

// ---------- security headers ----------
// Two Content-Security-Policies: a strict default for Toolkit + Sigma, and a
// Placeholder-only variant that additionally allows the CDNs its converter
// libraries and fonts load from. Everything else from helmet applies globally.
const baseHelmet = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

const strictCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // inline style attrs on SVG nodes
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

const placeholderCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    mediaSrc: ["'self'", 'blob:'],          // video/audio decoding for conversions
    connectSrc: ["'self'"],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

app.use(baseHelmet);
app.use((req, res, next) => {
  (req.path.startsWith('/placeholder') ? placeholderCsp : strictCsp)(req, res, next);
});

app.use(express.json({ limit: '3mb' }));

// ---------- shared API: rate limited + CSRF checked ----------
app.use('/api', apiLimiter, csrfProtect);
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/paintings', paintingRoutes);

// ---------- page helpers ----------
function gate(req, res, file, dir) {
  if (!getSessionUser(req)) {
    return res.redirect('/auth?next=' + encodeURIComponent(safeNextPath(req.originalUrl)));
  }
  res.sendFile(path.join(dir, file));
}

// ---------- Toolkit shell ----------
app.get('/', (req, res) => res.sendFile(path.join(TOOLKIT_PUBLIC, 'index.html')));
app.get('/auth', (req, res) => {
  if (getSessionUser(req)) return res.redirect(safeNextPath(req.query.next));
  res.sendFile(path.join(TOOLKIT_PUBLIC, 'auth.html'));
});

// ---------- Sigma (design studio) ----------
app.get('/sigma', (req, res) => res.sendFile(path.join(SIGMA_PUBLIC, 'index.html')));
app.get('/sigma/dashboard', (req, res) => gate(req, res, 'dashboard.html', SIGMA_PUBLIC));
app.get('/sigma/editor/:id', (req, res) => gate(req, res, 'editor.html', SIGMA_PUBLIC));
app.use('/sigma', express.static(SIGMA_PUBLIC, { index: false }));

// ---------- Placeholder (file converter) ----------
app.get('/placeholder/convert.html', (req, res) => gate(req, res, 'convert.html', PLACEHOLDER_DIR));
app.use('/placeholder', express.static(PLACEHOLDER_DIR)); // serves index.html, redirects /placeholder -> /placeholder/

// ---------- Pigment (paint & coloring studio) ----------
app.get('/pigment', (req, res) => res.sendFile(path.join(PIGMENT_DIR, 'index.html')));
app.get('/pigment/app', (req, res) => gate(req, res, 'app.html', PIGMENT_DIR));
app.use('/pigment', express.static(PIGMENT_DIR, { index: false }));

// Toolkit shell assets (css/js/img for the landing + auth pages).
app.use(express.static(TOOLKIT_PUBLIC, { index: false }));

// JSON 404 for unknown API routes, page 404 otherwise.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(TOOLKIT_PUBLIC, '404.html'));
});

// Never leak stack traces.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large.' });
  }
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Toolkit running at http://localhost:${PORT}`);
});
