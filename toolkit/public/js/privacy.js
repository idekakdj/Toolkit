// Fills the operator-specific parts of the privacy notice from the server's configuration.
import { api } from './api.js';

api('/api/auth/config').then(config => {
  if (config.privacyContact) document.getElementById('privacy-contact').textContent = config.privacyContact;
  if (config.privacyVersion) document.getElementById('privacy-version').textContent = config.privacyVersion;
}).catch(() => { /* the static text is still correct */ });
