const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: (opts) => ipcRenderer.invoke('get-sources', opts),
  getDisplaySize: () => ipcRenderer.invoke('get-display-size'),
  setDisplaySource: (sourceId) => ipcRenderer.invoke('set-display-source', sourceId),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowUnmaximize: () => ipcRenderer.invoke('window-unmaximize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
});
