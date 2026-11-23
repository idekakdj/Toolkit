// Serialize saves and acknowledge only the exact document sent successfully.
export function createSaver({ state, thumbnail, write, status, retry, signedOut }) {
  let running = false;
  let queued = false;
  return async function save() {
    if (state.saveConflict) return;
    if (running) { queued = true; return; }
    if (!state.dirty) return;
    running = true;
    const sent = JSON.stringify(state.doc);     // one serialization is both the snapshot and the comparison baseline
    const document = JSON.parse(sent);
    status('Saving…', 'saving');
    try {
      // Thumbnail failures must never prevent document persistence.
      let preview = null;
      try { preview = await thumbnail(); } catch { /* optional preview */ }
      await write({ document, ...(preview ? { thumbnail: preview } : {}) });
      // A queued rename may have discovered a conflict while this save completed.
      if (state.saveConflict) { state.dirty = true; return; }
      state.dirty = JSON.stringify(state.doc) !== sent;
      status(state.dirty ? 'Edited' : 'Saved', state.dirty ? 'saving' : '');
    } catch (err) {
      state.dirty = true;
      if (err.status === 409) {
        state.saveConflict = true; queued = false;
        status('Save conflict: changed in another tab. Local edits kept; use Export, then reload to resume saving.', 'error');
        return;
      }
      status('Save failed: ' + err.message, 'error');
      if (!signedOut(err) && (!err.status || err.status >= 500 || err.status === 429)) retry(save);
    } finally {
      running = false;
      if (queued) { queued = false; if (state.dirty) void save(); }
    }
  };
}
