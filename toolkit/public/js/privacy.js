// Fills the operator-specific parts of the privacy policy and terms from the server's
// configuration. Each page has only some of these elements.
import { api } from './api.js';

const fill = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
api('/api/auth/config').then(config => {
  fill('privacy-contact', config.privacyContact);
  fill('privacy-version', config.privacyVersion);
}).catch(() => { /* the static text is still correct */ });
