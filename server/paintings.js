// Pigment painting CRUD routes. Mirrors projects.js: every route checks
// ownership, and all paintings belong to the shared Toolkit account.
const express = require('express');
const crypto = require('crypto');
const { db, save } = require('./store');
const { requireAuth, validProjectName } = require('./security');

// The shared store only pre-creates users/sessions/projects.
db.paintings = db.paintings || [];

const router = express.Router();
router.use(requireAuth);

const MAX_PAINTINGS_PER_USER = 100;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;   // 2 MB of document JSON
const MAX_THUMB_CHARS = 300 * 1024;           // ~225 KB image
const MAX_ITEMS = 5000;

function summary(p) {
  return {
    id: p.id, name: p.name, createdAt: p.createdAt,
    updatedAt: p.updatedAt, thumbnail: p.thumbnail || null,
  };
}

function findOwned(req, res) {
  const p = db.paintings.find(x => x.id === req.params.id);
  if (!p || p.ownerId !== req.user.id) {
    res.status(404).json({ error: 'Painting not found' });
    return null;
  }
  return p;
}

function emptyDocument() {
  return {
    version: 1,
    canvas: { w: 1600, h: 1000, bg: '#ffffff' },
    items: [],
  };
}

function validDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const c = doc.canvas;
  if (!c || typeof c !== 'object') return false;
  if (typeof c.w !== 'number' || typeof c.h !== 'number') return false;
  if (!(c.w >= 16 && c.w <= 8000 && c.h >= 16 && c.h <= 8000)) return false;
  if (!Array.isArray(doc.items)) return false;
  if (doc.items.length > MAX_ITEMS) return false;
  let size;
  try { size = Buffer.byteLength(JSON.stringify(doc)); } catch { return false; }
  return size <= MAX_DOCUMENT_BYTES;
}

function validThumbnail(t) {
  return typeof t === 'string' && t.length <= MAX_THUMB_CHARS &&
    (t.startsWith('data:image/png;base64,') || t.startsWith('data:image/jpeg;base64,'));
}

router.get('/', (req, res) => {
  const mine = db.paintings
    .filter(p => p.ownerId === req.user.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ paintings: mine.map(summary) });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!validProjectName(name)) {
    return res.status(400).json({ error: 'Painting name must be 1-80 characters.' });
  }
  const count = db.paintings.filter(p => p.ownerId === req.user.id).length;
  if (count >= MAX_PAINTINGS_PER_USER) {
    return res.status(400).json({ error: 'Painting limit reached.' });
  }
  const now = Date.now();
  const painting = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    thumbnail: null,
    document: emptyDocument(),
  };
  db.paintings.push(painting);
  save();
  res.status(201).json({ painting: summary(painting) });
});

router.get('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  res.json({ painting: { ...summary(p), document: p.document } });
});

router.put('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  const { name, document, thumbnail } = req.body || {};
  if (name !== undefined) {
    if (!validProjectName(name)) {
      return res.status(400).json({ error: 'Painting name must be 1-80 characters.' });
    }
    p.name = name.trim();
  }
  if (document !== undefined) {
    if (!validDocument(document)) {
      return res.status(400).json({ error: 'Document is invalid or too large.' });
    }
    p.document = document;
  }
  if (thumbnail !== undefined && thumbnail !== null) {
    if (!validThumbnail(thumbnail)) {
      return res.status(400).json({ error: 'Thumbnail is invalid or too large.' });
    }
    p.thumbnail = thumbnail;
  }
  p.updatedAt = Date.now();
  save();
  res.json({ painting: summary(p) });
});

router.delete('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  db.paintings = db.paintings.filter(x => x.id !== p.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
