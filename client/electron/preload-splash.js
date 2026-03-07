const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  onUpdateStatus: (cb) => {
    ipcRenderer.on('splash-update-status', (_, status) => cb(status));
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.on('splash-download-progress', (_, percent) => cb(percent));
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.on('splash-update-downloaded', () => cb());
  },
  splashCountdownDone: () => ipcRenderer.send('splash-countdown-done'),
  notifyInstallDone: () => ipcRenderer.send('splash-install-done'),
});
