module.exports = {
  appId: 'com.toolkit.desktop', productName: 'Toolkit',
  extraMetadata: { main: 'desktop/main.cjs' },
  directories: { output: '../dist', buildResources: 'desktop' },
  files: ['desktop/main.cjs', 'desktop/runtime.cjs', 'desktop/icon.ico', 'server/**/*.js', 'server/**/*.cjs', 'package.json'],
  extraResources: [
    { from: 'public', to: 'workspace/toolkit/public' },
    { from: '../sigma/public', to: 'workspace/sigma/public' },
    { from: '../pigment', to: 'workspace/pigment', filter: ['index.html', 'app.html', 'css/**/*', 'js/**/*', 'img/**/*'] },
    { from: '../imagevendor', to: 'workspace/imagevendor', filter: ['index.html', 'app.html', 'css/**/*', 'js/**/*', 'img/**/*'] },
    // vendor/ holds the self-hosted converter libraries and fonts (the CSP allows no CDN); VENDOR.md is documentation only.
    { from: '../placeholder', to: 'workspace/placeholder', filter: ['index.html', 'convert.html', 'css/**/*', 'js/**/*', 'img/**/*', 'vendor/**/*', '!vendor/VENDOR.md'] },
  ],
  asar: true,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'desktop/icon.ico', artifactName: 'Toolkit-Setup-${version}-${arch}.${ext}' },
  nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'Toolkit',
    deleteAppDataOnUninstall: false, runAfterFinish: false },
};
