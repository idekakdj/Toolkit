// Project CRUD routes. Every route checks ownership.
const express = require('express');
const { revision, checkRevision } = require('./concurrency');
const { dimensions, safeTree, validThumbnail, cleanName } = require('./validation');
const crypto = require('crypto');
const { db, save } = require('./store');
const { requireAuth, validProjectName } = require('./security');
const { withinQuota, recordBytes } = require('./quota');
const { audit } = require('./audit');

const router = express.Router();
router.use(requireAuth);

const MAX_PROJECTS_PER_USER = 100;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;   // 8 MB of document JSON (supports imported raster image nodes)
const MAX_THUMB_CHARS = 300 * 1024;           // ~225 KB image

function summary(p) {
  return {
    id: p.id, name: p.name, createdAt: p.createdAt,
    revision: revision(p), updatedAt: p.updatedAt, thumbnail: p.thumbnail || null,
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

// Returns the serialized size in bytes when valid, or 0 when not.
function validDocument(doc) {
  if (!doc || typeof doc !== 'object' || !safeTree(doc)) return 0;
  if (!dimensions(doc.artboard)) return 0;
  if (!Array.isArray(doc.nodes)) return 0;
  if (doc.nodes.length > 5000) return 0;
  let size;
  try { size = Buffer.byteLength(JSON.stringify(doc)); } catch { return 0; }
  return size <= MAX_DOCUMENT_BYTES ? size : 0;
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
    name: cleanName(name),
    createdAt: now,
    updatedAt: now,
    revision: 0,
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

// Cheap freshness check for open editor tabs: lets them notice a change made elsewhere
// (another tab, device or an AI assistant using an access token) without downloading the document.
router.get('/:id/revision', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  res.json({ revision: revision(p), updatedAt: p.updatedAt });
});

router.put('/:id', (req, res) => {
  const p = findOwned(req, res);
  if (!p) return;
  if (!checkRevision(req, res, p)) return;
  const { name, document, thumbnail } = req.body || {};
  if (name !== undefined) {
    if (!validProjectName(name)) {
      return res.status(400).json({ error: 'Project name must be 1-80 characters.' });
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
    audit('quota.exceeded', { req, userId: req.user.id, detail: { app: 'sigma' }, throttleKey: 'quota:' + req.user.id });
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
