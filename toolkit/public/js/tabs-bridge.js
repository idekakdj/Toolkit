/* Toolkit tabs bridge: classic script loaded first in every app page.
 *  - Embedded in a shell tab (iframe named tk-tab-*): talks to the shell by postMessage.
 *  - Opened top-level: redirects into the shell so app pages always show inside a tab. */
(function () {
  'use strict';
  var embedded = false;
  try { embedded = window.parent !== window && String(window.name || '').indexOf('tk-tab-') === 0; } catch (e) { embedded = false; }

  var HOME_PATHS = ['/', '/home.html', '/sigma', '/sigma/', '/sigma/dashboard', '/sigma/dashboard.html',
    '/pigment', '/pigment/', '/imagevendor', '/imagevendor/', '/placeholder', '/placeholder/'];

  function appKey() {
    var p = location.pathname;
    var keys = ['sigma', 'pigment', 'imagevendor', 'placeholder'];
    for (var i = 0; i < keys.length; i++) if (p.indexOf('/' + keys[i] + '/') === 0) return keys[i];
    return '';
  }

  if (!embedded) {
    try {
      var standalone = navigator.webdriver && /(^|[?&])tk-standalone=1(&|$)/.test(location.search);
      if (window.top === window && !standalone) {
        location.replace('/?open=' + encodeURIComponent(location.pathname + location.search));
      }
    } catch (e) { /* ignore */ }
    window.ToolkitTabs = {
      embedded: false,
      goHome: function () { location.href = '/'; },
      open: function (path) { location.href = path; }
    };
    return;
  }

  function post(msg) {
    try {
      msg.source = 'toolkit-tab';
      window.parent.postMessage(msg, location.origin);
    } catch (e) { /* ignore */ }
  }

  window.ToolkitTabs = {
    embedded: true,
    goHome: function () { post({ type: 'home' }); },
    open: function (path) { post({ type: 'open', path: String(path) }); }
  };

  try { document.documentElement.classList.add('tk-embedded'); } catch (e) { /* ignore */ }

  // ---- meta ----
  var lastMeta = '';
  function sendMeta() {
    try {
      var title = String(document.title || '').split(' — ')[0].trim();
      var path = location.pathname + location.search;
      var key = path + '\n' + title;
      if (key === lastMeta) return;
      lastMeta = key;
      post({ type: 'meta', app: appKey(), path: path, title: title });
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('DOMContentLoaded', function () {
    sendMeta();
    try {
      var obs = new MutationObserver(sendMeta);
      var t = document.querySelector('head > title');
      if (t) obs.observe(t, { childList: true, characterData: true, subtree: true });
      obs.observe(document.head, { childList: true });
    } catch (e) { /* ignore */ }
  });

  // ---- keyboard ----
  function inKeepZone(el) {
    try {
      if (!el || !el.closest) return false;
      if (el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-tk-keep-arrows]')) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  window.addEventListener('keydown', function (e) {
    try {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var dir = e.key === 'ArrowRight' ? 1 : -1;
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
        e.preventDefault();
        post({ type: 'switch', direction: dir });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      if (inKeepZone(e.target)) return;
      post({ type: 'switch', direction: dir });
    } catch (err) { /* ignore */ }
  });

  // ---- swipe ----
  var sum = 0, lastWheel = 0, blockedUntil = 0;
  function blockedTarget(el) {
    try {
      if (!el || !el.closest) return false;
      if (el.closest('canvas, svg, [data-tk-no-swipe]')) return true;
      for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth) {
          var ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  window.addEventListener('wheel', function (e) {
    try {
      if (e.ctrlKey || e.defaultPrevented || !(Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5)) return;
      var now = Date.now();
      if (now < blockedUntil) return;
      if (blockedTarget(e.target)) return;
      if (now - lastWheel > 200) sum = 0;
      lastWheel = now;
      sum += e.deltaX;
      if (Math.abs(sum) >= 120) {
        post({ type: 'switch', direction: sum > 0 ? 1 : -1 });
        sum = 0;
        blockedUntil = now + 600;
      }
    } catch (err) { /* ignore */ }
  }, { passive: true });

  // ---- home links ----
  document.addEventListener('click', function (e) {
    try {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self')) return;
      var u = new URL(a.getAttribute('href'), location.href);
      if (u.origin !== location.origin) return;
      if (HOME_PATHS.indexOf(u.pathname) === -1) return;
      e.preventDefault();
      post({ type: 'home' });
    } catch (err) { /* ignore */ }
  }, true);
})();
