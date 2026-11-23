/* Pages that must never appear inside a Toolkit tab (the shell, landing, sign-in, 404).
 * If one loads inside a tab frame (an app's session expired, or it navigated to "/"),
 * the shell is told to show Home and the tab goes back to where it was; anywhere else
 * the page takes over the whole window. */
(function () {
  'use strict';
  try {
    if (window.top === window) return;
    var inTab = String(window.name || '').indexOf('tk-tab-') === 0;
    var isShell = location.pathname === '/' || location.pathname === '/home.html';
    if (inTab && isShell && document.documentElement.getAttribute('data-shell') === '1') {
      window.parent.postMessage({ source: 'toolkit-tab', type: 'home' }, location.origin);
      history.back();
      return;
    }
    window.top.location.href = location.href;
  } catch (e) { /* cross-origin parent: framing is already refused by CSP */ }
})();
