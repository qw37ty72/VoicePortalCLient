const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: (opts) => ipcRenderer.invoke('get-sources', opts),
  getDisplaySize: () => ipcRenderer.invoke('get-display-size'),
  setDisplaySource: (sourceId) => ipcRenderer.invoke('set-display-source', sourceId),
});
