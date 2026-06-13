// Toolkit landing page: rainbow drag trail + signed-in nav state.
import { api } from './api.js';

// ---------------- rainbow trail ----------------
// Click and drag on the background to wipe a streak of dark rainbow
// through the grime. Points age out, so the streak fades behind you.
const canvas = document.getElementById('trail');
const ctx = canvas.getContext('2d');

const TRAIL_LIFE = 1500;   // ms before a point fully fades
let points = [];           // { x, y, hue, t, stroke }
let drawing = false;
let hue = Math.random() * 360;
let strokeId = 0;
let rafActive = false;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

function interactive(target) {
  return target.closest && target.closest('a, button, input, select, textarea, details, summary, label, .nav');
}

window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || interactive(e.target)) return;
  e.preventDefault();
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
  drawing = true;
  strokeId++;
  addPoint(e.clientX, e.clientY);
});

window.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  addPoint(e.clientX, e.clientY);
});

for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  window.addEventListener(ev, () => {
    drawing = false;
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  });
}

function addPoint(x, y) {
  const last = points[points.length - 1];
  if (last && last.stroke === strokeId) {
    const d = Math.hypot(x - last.x, y - last.y);
    if (d < 3) return;
    hue = (hue + Math.min(10, d * 0.22)) % 360;   // rainbow advances with travel
  }
  points.push({ x, y, hue, t: performance.now(), stroke: strokeId });
  if (points.length > 600) points.shift();
  if (!rafActive) { rafActive = true; requestAnimationFrame(frame); }
}

// Dark gradient shades of each rainbow hue.
function dark(h, l, a) { return `hsla(${h}, 85%, ${l}%, ${a})`; }

function frame() {
  const now = performance.now();
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  points = points.filter(p => now - p.t < TRAIL_LIFE);

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.stroke !== b.stroke) continue;
    const age = (now - b.t) / TRAIL_LIFE;
    const alpha = (1 - age) * 0.9;
    const width = 3 + 15 * (1 - age);

    // each segment is its own dark gradient, hue rolling along the streak
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, dark(a.hue, 30, alpha));
    grad.addColorStop(1, dark(b.hue, 22, alpha));

    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = dark(b.hue, 32, alpha * 0.8);
    ctx.shadowBlur = 16 * (1 - age);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // smooth through the midpoint for a hand-wiped feel
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.quadraticCurveTo(a.x, a.y, mx, my);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if (points.length || drawing) {
    requestAnimationFrame(frame);
  } else {
    rafActive = false;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

// ---------------- nav: session state ----------------
const navUser = document.getElementById('nav-user');
const navSignin = document.getElementById('nav-signin');
const navSignout = document.getElementById('nav-signout');

(async () => {
  try {
    const me = await api('/api/auth/me');
    navUser.textContent = me.user.name;
    navUser.hidden = false;
    navSignout.hidden = false;
    navSignin.hidden = true;
  } catch { /* signed out: keep the Sign in button */ }
})();

navSignout.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  window.location.reload();
});
