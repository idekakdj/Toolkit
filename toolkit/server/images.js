// ImageVendor image CRUD routes. Mirrors paintings.js: every route checks
// ownership, and all images belong to the shared Toolkit account.
const express = require('express');
const { revision, checkRevision } = require('./concurrency');
const { dimensions, safeTree, validLayers, validThumbnail, cleanName } = require('./validation');
const crypto = require('crypto');
const { db, save } = require('./store');
const { requireAuth, validProjectName } = require('./security');
const { withinQuota, recordBytes } = require('./quota');
const { audit } = require('./audit');

// The shared store only pre-creates users/sessions/projects/paintings.
db.images = db.images || [];

const router = express.Router();
router.use(requireAuth);

const MAX_IMAGES_PER_USER = 100;
const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;  // 24 MB of document JSON
const MAX_THUMB_CHARS = 300 * 1024;            // ~225 KB image
const MAX_LAYERS = 64;

function summary(p) {
  return {
    id: p.id, name: p.name, createdAt: p.createdAt,
    revision: revision(p), updatedAt: p.updatedAt, thumbnail: p.thumbnail || null,
  };
}

function findOwned(req, res) {
  const p = db.images.find(x => x.id === req.params.id);
  if (!p || p.ownerId !== req.user.id) {
    res.status(404).json({ error: 'Image not found' });
    return null;
  }
  return p;
}

function emptyDocument() {
  return {
    version: 1,
    canvas: { w: 1280, h: 800, bg: '#ffffff' },
    layers: [],
  };
}

// Returns the serialized size in bytes when valid, or 0 when not.
function validDocument(doc) {
  if (!doc || typeof doc !== 'object' || !safeTree(doc)) return 0;
  if (!dimensions(doc.canvas)) return 0;
  if (!Array.isArray(doc.layers)) return 0;
  if (doc.layers.length > MAX_LAYERS || !validLayers(doc.layers)) return 0;
  let size;
  try { size = Buffer.byteLength(JSON.stringify(doc)); } catch { return 0; }
  return size <= MAX_DOCUMENT_BYTES ? size : 0;
}

router.get('/', (req, res) => {
  const mine = db.images
    .filter(p => p.ownerId === req.user.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ images: mine.map(summary) });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!validProjectName(name)) {
    return res.status(400).json({ error: 'Image name must be 1-80 characters.' });
  }
  const count = db.images.filter(p => p.ownerId === req.user.id).length;
  if (count >= MAX_IMAGES_PER_USER) {
    return res.status(400).json({ error: 'Image limit reached.' });
  }
  const now = Date.now();
  const image = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    name: cleanName(name),
    createdAt: now,
    updatedAt: now,
    revision: 0,
    thumbnail: null,
    document: emptyDocument(),
  };
  db.images.push(image);
  save();
  res.status(201).json({ image: summary(image) });
});

router.get('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  res.json({ image: { ...summary(p), document: p.document } });
});

router.put('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  if (!checkRevision(req, res, p)) return;
  const { name, document, thumbnail } = req.body || {};
  if (name !== undefined) {
    if (!validProjectName(name)) {
      return res.status(400).json({ error: 'Image name must be 1-80 characters.' });
    }

  }
  let documentBytes = 0;
  if (document !== undefined) {
    documentBytes = validDocument(document);
    if (!documentBytes) {
      return res.status(400).json({ error: 'Document is invalid or too large.' });
    }
  }
  if (thumbnail !== undefined && thumbnail !== null) {
    if (!validThumbnail(thumbnail, MAX_THUMB_CHARS)) {
      return res.status(400).json({ error: 'Thumbnail is invalid or too large.' });
    }
  }
  // Storage quota: judged on the record's total size after this update.
  const nextThumb = thumbnail !== undefined ? thumbnail : p.thumbnail;
  const nextBytes = (document !== undefined ? documentBytes : recordBytes(p) - (p.thumbnail ? p.thumbnail.length : 0)) + (nextThumb ? nextThumb.length : 0);
  if (!withinQuota(req.user.id, p, nextBytes)) {
    audit('quota.exceeded', { req, userId: req.user.id, detail: { app: 'imagevendor' }, throttleKey: 'quota:' + req.user.id });
    return res.status(413).json({ error: 'Storage quota exceeded. Delete unused projects, paintings or images to free space.' });
  }
  // Commit only after the entire update has passed validation.
  if (name !== undefined) p.name = cleanName(name);
  if (document !== undefined) p.document = document;
  if (thumbnail !== undefined) p.thumbnail = thumbnail;
  p.docBytes = nextBytes;
  p.revision = revision(p) + 1;
  p.updatedAt = Date.now();
  save();
  res.json({ image: summary(p) });
});

router.delete('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  db.images = db.images.filter(x => x.id !== p.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
