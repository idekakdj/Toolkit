// Project CRUD routes. Every route checks ownership.
const express = require('express');
const crypto = require('crypto');
const { db, save } = require('./store');
const { requireAuth, validProjectName } = require('./security');

const router = express.Router();
router.use(requireAuth);

const MAX_PROJECTS_PER_USER = 100;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;   // 2 MB of document JSON
const MAX_THUMB_CHARS = 300 * 1024;           // ~225 KB image

function summary(p) {
  return {
    id: p.id, name: p.name, createdAt: p.createdAt,
    updatedAt: p.updatedAt, thumbnail: p.thumbnail || null,
  };
}

function findOwned(req, res) {
  const p = db.projects.find(x => x.id === req.params.id);
  if (!p || p.ownerId !== req.user.id) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return p;
}

function emptyDocument() {
  return {
    version: 1,
    artboard: { name: 'Artboard', w: 1280, h: 800, bg: '#ffffff' },
    nodes: [],
  };
}

function validDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.artboard || typeof doc.artboard !== 'object') return false;
  if (!Array.isArray(doc.nodes)) return false;
  if (doc.nodes.length > 5000) return false;
  let size;
  try { size = Buffer.byteLength(JSON.stringify(doc)); } catch { return false; }
  return size <= MAX_DOCUMENT_BYTES;
}

function validThumbnail(t) {
  return typeof t === 'string' && t.length <= MAX_THUMB_CHARS &&
    (t.startsWith('data:image/png;base64,') || t.startsWith('data:image/jpeg;base64,'));
}

router.get('/', (req, res) => {
  const mine = db.projects
    .filter(p => p.ownerId === req.user.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ projects: mine.map(summary) });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!validProjectName(name)) {
    return res.status(400).json({ error: 'Project name must be 1-80 characters.' });
  }
  const count = db.projects.filter(p => p.ownerId === req.user.id).length;
  if (count >= MAX_PROJECTS_PER_USER) {
    return res.status(400).json({ error: 'Project limit reached.' });
  }
  const now = Date.now();
  const project = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    thumbnail: null,
    document: emptyDocument(),
  };
  db.projects.push(project);
  save();
  res.status(201).json({ project: summary(project) });
});

router.get('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  res.json({ project: { ...summary(p), document: p.document } });
});

router.put('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  const { name, document, thumbnail } = req.body || {};
  if (name !== undefined) {
    if (!validProjectName(name)) {
      return res.status(400).json({ error: 'Project name must be 1-80 characters.' });
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
  res.json({ project: summary(p) });
});

router.delete('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  db.projects = db.projects.filter(x => x.id !== p.id);
  save();
  res.json({ ok: true });
});

module.exports = router;
