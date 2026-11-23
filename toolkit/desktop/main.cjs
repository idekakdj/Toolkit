const { app, BrowserWindow, Menu, Tray, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { startRuntime } = require('./runtime.cjs');
const { loadEnvFile } = require('../server/env-file');

// Google sign-in keys for the desktop app live in a .env file in the Toolkit user folder
// (%APPDATA%\Toolkit\.env), never in the installer. Template written by the
// "Set up Google sign-in" menu item.
const ENV_TEMPLATE = [
  '# Toolkit desktop settings. Keep this file private: it holds secrets.',
  '# Google sign-in: Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web application),',
  '# with this Authorized redirect URI:  http://127.0.0.1:4310/api/auth/google/callback',
  '# Paste the values after the = signs, save, then quit and reopen Toolkit.',
  'GOOGLE_CLIENT_ID=',
  'GOOGLE_CLIENT_SECRET=',
  '',
].join('\r\n');

app.setName('Toolkit');
// Test launches never touch the normal desktop profile or web-project database.
if (process.env.TOOLKIT_DESKTOP_TEST_DIR) {
  fs.mkdirSync(process.env.TOOLKIT_DESKTOP_TEST_DIR, { recursive: true });
  app.setPath('userData', path.resolve(process.env.TOOLKIT_DESKTOP_TEST_DIR));
}
// Defence in depth: no window of this app may ever embed a <webview> (a way to load
// remote content with elevated privileges), whatever its own preferences say.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', event => event.preventDefault());
});
const hasLock = app.requestSingleInstanceLock();
let window, runtime, tray;
let quitting = false;          // true once a real quit starts; until then closing the window only hides it
function showWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
// Toolkit lives in the Windows notification area (system tray): closing the window hides it
// there, so open tabs and unsaved work stay as they were; "Quit Toolkit" really exits.
function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip('Toolkit');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Toolkit', click: showWindow },
    { type: 'separator' },
    { label: 'Quit Toolkit', click: () => app.quit() },
  ]));
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}
// The first time the window is closed to the tray, say so once (remembered per profile).
function trayNoticeOnce() {
  const flag = path.join(app.getPath('userData'), 'tray-notice-shown');
  if (fs.existsSync(flag)) return;
  try { fs.writeFileSync(flag, new Date().toISOString()); } catch { /* best effort */ }
  if (tray && process.platform === 'win32') {
    tray.displayBalloon({ iconType: 'info', title: 'Toolkit is still running',
      content: 'Toolkit keeps running in the system tray. Click the icon to open it, or right-click it and choose Quit Toolkit.' });
  }
}
if (!hasLock) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(async () => {
    const dataDir = path.join(app.getPath('userData'), 'data');
    const assetRoot = app.isPackaged ? path.join(process.resourcesPath, 'workspace') : path.resolve(__dirname, '../..');
    const connectionFile = path.join(app.getPath('userData'), 'connection.json');
    let serverUrl = process.env.TOOLKIT_SERVER_URL;
    if (!serverUrl && fs.existsSync(connectionFile)) serverUrl = JSON.parse(fs.readFileSync(connectionFile, 'utf8')).serverUrl;
    const envFile = path.join(app.getPath('userData'), '.env');
    loadEnvFile(envFile);
    // Running from a source checkout (npm run desktop) also picks up toolkit/.env; test
    // launches never do, so they cannot see the developer's real keys.
    if (!app.isPackaged && !process.env.TOOLKIT_DESKTOP_TEST_DIR) loadEnvFile();
    runtime = await startRuntime({ dataDir, assetRoot, serverUrl });
    const desktopSession = session.fromPartition('persist:toolkit');
    desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    desktopSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      title: 'Toolkit', width: 1440, height: 960, minWidth: 980, minHeight: 680,
      backgroundColor: '#151515', show: false, autoHideMenuBar: false,
      icon: path.join(__dirname, 'icon.ico'),
      webPreferences: {
        session: desktopSession, nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, spellcheck: false,
      },
    });
    const isLocal = value => { try { return new URL(value).origin === runtime.origin; } catch { return false; } };
    const navigate = url => window.loadURL(url).catch(err => {
      // A user choosing Stay in the unsaved-work dialog aborts navigation.
      if (err.code !== 'ERR_ABORTED') console.error('[desktop] navigation failed:', err.message);
    });
    // Google does not allow sign-in inside an app window, so "Continue with Google" runs in
    // the person's normal web browser and this window waits for the result (see the
    // desktop handoff in server/google.js). Test launches record the URL instead of opening it.
    const openInBrowser = url => {
      if (process.env.TOOLKIT_DESKTOP_TEST_DIR) {
        fs.appendFileSync(path.join(process.env.TOOLKIT_DESKTOP_TEST_DIR, 'opened-urls.txt'), url + '\n');
        return Promise.resolve();
      }
      return shell.openExternal(url);
    };
    async function googleSignIn(url) {
      const link = new URL(url);
      if (runtime.remote) {
        // A shared server would let anyone who sends this person a link take the session.
        return navigate(new URL('/auth?google=desktop_unavailable', runtime.origin).href);
      }
      if (link.searchParams.has('handoff')) {
        // "Open the browser again". Cancelling the click's navigation also cancels the waiting
        // page's scheduled refresh, so reload it to keep checking.
        await openInBrowser(link.href);
        window.webContents.reload();
        return;
      }
      const id = crypto.randomBytes(32).toString('base64url');
      const secret = crypto.randomBytes(32).toString('base64url');                  // never leaves this app and the server
      const begin = new URL('/api/auth/google/desktop/begin', runtime.origin);
      for (const key of ['next', 'intent']) if (link.searchParams.has(key)) begin.searchParams.set(key, link.searchParams.get(key));
      begin.searchParams.set('id', id);
      begin.searchParams.set('secret', secret);
      await navigate(begin.href);
      // Only once the server has registered the sign-in (the window shows the waiting page).
      if (window && new URL(window.webContents.getURL()).pathname === '/api/auth/google/desktop/wait') {
        await openInBrowser(new URL('/api/auth/google/start?handoff=' + id, runtime.origin).href);
      }
    }
    // While the person is in their browser this window is in the background, where page
    // timers (the waiting page's auto-refresh) are throttled: check again the moment they return.
    window.on('focus', () => {
      try {
        if (new URL(window.webContents.getURL()).pathname === '/api/auth/google/desktop/wait') window.webContents.reload();
      } catch { /* no page yet */ }
    });
    window.webContents.on('will-navigate', (event, url) => {
      let target;
      try { target = new URL(url); } catch { event.preventDefault(); return; }
      if (target.origin === runtime.origin && target.pathname === '/api/auth/google/start') {
        event.preventDefault();
        googleSignIn(url).catch(err => dialog.showErrorBox('Google sign-in', err.message));
        return;
      }
      if (!isLocal(url)) event.preventDefault();
    });
    window.webContents.on('will-redirect', (event, url) => { if (!isLocal(url)) event.preventDefault(); });
    window.webContents.setWindowOpenHandler(({ url }) => {
      // Local target=_blank links stay inside the authenticated shell.
      if (isLocal(url)) void navigate(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-prevent-unload', event => {
      const choice = dialog.showMessageBoxSync(window, {
        type: 'warning', title: 'Unsaved artwork',
        message: 'This editor has unsaved changes.',
        detail: 'Stay to save or export your artwork, or leave and discard the unsaved changes.',
        buttons: ['Stay', 'Discard changes'], defaultId: 0, cancelId: 0,
      });
      if (choice === 1) event.preventDefault();
      else quitting = false;      // "Stay" cancels a quit: closing the window hides it to the tray again
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Toolkit', submenu: [
        { label: 'Toolkit home', accelerator: 'CmdOrCtrl+Shift+X', click: () => navigate(runtime.origin) },
        { label: 'Connect to shared server…', click: async () => {
          const selected = await dialog.showOpenDialog(window, { title: 'Select Toolkit connection file', properties: ['openFile'], filters: [{ name: 'Toolkit connection', extensions: ['json'] }] });
          if (selected.canceled) return;
          try {
            if (fs.statSync(selected.filePaths[0]).size > 4096) throw new Error('Connection file is too large.');
            const origin = require('../server/remote-origin').remoteOrigin(JSON.parse(fs.readFileSync(selected.filePaths[0], 'utf8')).serverUrl);
            const choice = await dialog.showMessageBox(window, { title: 'Connect to shared Toolkit', message: 'Connect to ' + origin + '?', detail: 'Sign in on this server to share saved projects across devices. Local accounts and artwork stay on this PC; this does not upload them. Save your work before restarting.', buttons: ['Cancel', 'Connect and restart'], defaultId: 0, cancelId: 0 });
            if (choice.response !== 1) return;
            fs.writeFileSync(connectionFile + '.tmp', JSON.stringify({ serverUrl: origin }));
            fs.renameSync(connectionFile + '.tmp', connectionFile);
            app.relaunch(); app.quit();
          } catch (err) { dialog.showErrorBox('Cannot connect to Toolkit', err.message); }
        } },
        { label: 'Use local Toolkit', click: async () => {
          if (!runtime.remote) return;
          const choice = await dialog.showMessageBox(window, { message: 'Return to local Toolkit?', detail: 'Save your work first. Shared projects remain on the server. Restart without TOOLKIT_SERVER_URL if it is set.', buttons: ['Cancel', 'Restart locally'], defaultId: 0, cancelId: 0 });
          if (choice.response === 1) { if (fs.existsSync(connectionFile)) fs.unlinkSync(connectionFile); app.relaunch(); app.quit(); }
        } },
        { label: 'Open data folder', click: () => { fs.mkdirSync(dataDir, { recursive: true }); void shell.openPath(dataDir); } },
        { label: 'Set up Google sign-in…', click: async () => {
          const choice = await dialog.showMessageBox(window, {
            title: 'Set up Google sign-in', message: 'Add your Google sign-in keys',
            detail: 'Toolkit opens its private settings file:\n' + envFile + '\n\nPaste your Google OAuth client ID and secret after the = signs, save the file, then quit and reopen Toolkit. The file stays on this PC; it is never part of the installer or any upload.',
            buttons: ['Cancel', 'Open settings file'], defaultId: 1, cancelId: 0,
          });
          if (choice.response !== 1) return;
          if (!fs.existsSync(envFile)) fs.writeFileSync(envFile, ENV_TEMPLATE, { mode: 0o600 });
          const failed = await shell.openPath(envFile);
          if (failed) void shell.showItemInFolder(envFile);
        } },
        { type: 'separator' }, { role: 'quit' },
      ] },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: 'Help', submenu: [{ label: 'About Toolkit', click: () => dialog.showMessageBox(window, {
        title: 'Toolkit', message: 'Toolkit ' + app.getVersion(),
        detail: 'Sigma • Pigment • ImageVendor • Placeholder\n' + (runtime.remote ? 'Shared server: ' + runtime.origin + '\nSaved accounts and artwork are shared across devices. Internet access is required.' : 'Accounts and artwork are stored locally. Connect to a shared server for cross-device access.'),
      }) }] },
    ]));
    window.once('ready-to-show', () => { if (!process.env.TOOLKIT_DESKTOP_TEST_DIR) window.show(); });
    createTray();
    window.on('close', event => {
      if (quitting) return;
      event.preventDefault();
      window.hide();
      trayNoticeOnce();
    });
    window.on('closed', () => { window = null; });
    await window.loadURL(runtime.origin);
  }).catch(err => {
    dialog.showErrorBox('Toolkit could not start', err.message + '\nYour existing data has not been replaced.');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', event => {
    if (tray) { tray.destroy(); tray = null; }
    if (!runtime) return;
    event.preventDefault();
    const closing = runtime; runtime = null;
    closing.close().finally(() => app.exit(0));
  });
}
