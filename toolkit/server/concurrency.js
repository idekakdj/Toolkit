// Legacy records start at revision zero. Check before changing any stored field.
function revision(record) {
  return Number.isSafeInteger(record.revision) && record.revision >= 0 ? record.revision : 0;
}
function checkRevision(req, res, record) {
  const base = req.body?.baseRevision;
  if (base !== undefined && (!Number.isSafeInteger(base) || base < 0)) {
    res.status(400).json({ error: 'baseRevision must be a nonnegative safe integer.' });
    return false;
  }
  if (base !== undefined && base !== revision(record)) {
    res.status(409).json({ error: 'This document was changed elsewhere (another tab, device or an AI assistant) since it was loaded. Load it again, then reapply your change.', code: 'conflict', revision: revision(record) });
    return false;
  }
  if (revision(record) === Number.MAX_SAFE_INTEGER) {
    res.status(409).json({ error: 'Revision limit reached. Save a new copy.' });
    return false;
  }
  return true;
}
module.exports = { revision, checkRevision };
