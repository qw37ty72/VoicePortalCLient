const { app, BrowserWindow, desktopCapturer, screen, session, Menu, dialog } = require('electron');
const path = require('path');

let pendingDisplaySourceId = null;

let mainWindow;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const isFirstRunWin = process.platform === 'win32' && process.argv.includes('--squirrel-firstrun');

function initAutoUpdater() {
  if (isDev || isFirstRunWin) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoDownload = true;

    autoUpdater.on('update-available', () => {
      if (mainWindow) mainWindow.webContents.send('update-status', 'downloading');
    });
    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) mainWindow.webContents.send('update-status', 'ready');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновление готово',
        message: 'Установлена новая версия. Перезапустите приложение, чтобы применить обновление.',
        buttons: ['Перезапустить сейчас', 'Позже'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      });
    });
    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater]', err.message);
    });

    // Проверка при каждом запуске; небольшая задержка на Windows после установки
    const delay = isFirstRunWin ? 10000 : 3000;
    setTimeout(() => autoUpdater.checkForUpdates(), delay);
  } catch (e) {
    console.error('[AutoUpdater] init failed', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    show: false,
  });

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools не открываем по умолчанию (F12 при необходимости)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    if (code !== -3) console.error('[Electron] did-fail-load', code, desc, url);
  });

  // Показать окно после загрузки; в dev через 2 сек открыть DevTools для отладки
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.show();
    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  const { ipcMain } = require('electron');

  ipcMain.handle('get-sources', async (_, opts) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: opts?.thumbnailSize || { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.handle('get-display-size', async () => {
    const primary = screen.getPrimaryDisplay();
    const size = primary.size;
    const scale = primary.scaleFactor || 1;
    return { width: size.width * scale, height: size.height * scale };
  });

  ipcMain.handle('set-display-source', (_, sourceId) => {
    pendingDisplaySourceId = sourceId;
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request) => {
    const sourceId = pendingDisplaySourceId;
    pendingDisplaySourceId = null;
    if (sourceId) {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 } });
      const src = sources.find((s) => s.id === sourceId);
      if (src) request.approve({ videoSourceId: sourceId });
      else request.cancel();
    } else {
      request.cancel();
    }
  });

  createWindow();
  initAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
