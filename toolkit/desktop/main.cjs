const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startRuntime } = require('./runtime.cjs');

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
let window, runtime;
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const dataDir = path.join(app.getPath('userData'), 'data');
    const assetRoot = app.isPackaged ? path.join(process.resourcesPath, 'workspace') : path.resolve(__dirname, '../..');
    const connectionFile = path.join(app.getPath('userData'), 'connection.json');
    let serverUrl = process.env.TOOLKIT_SERVER_URL;
    if (!serverUrl && fs.existsSync(connectionFile)) serverUrl = JSON.parse(fs.readFileSync(connectionFile, 'utf8')).serverUrl;
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
    window.webContents.on('will-navigate', (event, url) => { if (!isLocal(url)) event.preventDefault(); });
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
        { type: 'separator' }, { role: 'quit' },
      ] },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: 'Help', submenu: [{ label: 'About Toolkit', click: () => dialog.showMessageBox(window, {
        title: 'Toolkit', message: 'Toolkit ' + app.getVersion(),
        detail: 'Sigma • Pigment • ImageVendor • Placeholder\n' + (runtime.remote ? 'Shared server: ' + runtime.origin + '\nSaved accounts and artwork are shared across devices. Internet access is required.' : 'Accounts and artwork are stored locally. Connect to a shared server for cross-device access.'),
      }) }] },
    ]));
    window.once('ready-to-show', () => { if (!process.env.TOOLKIT_DESKTOP_TEST_DIR) window.show(); });
    window.on('closed', () => { window = null; });
    await window.loadURL(runtime.origin);
  }).catch(err => {
    dialog.showErrorBox('Toolkit could not start', err.message + '\nYour existing data has not been replaced.');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', event => {
    if (!runtime) return;
    event.preventDefault();
    const closing = runtime; runtime = null;
    closing.close().finally(() => app.exit(0));
  });
}
