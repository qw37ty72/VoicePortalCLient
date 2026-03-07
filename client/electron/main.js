const { app, BrowserWindow, desktopCapturer, screen, session, Menu, dialog, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// До app.ready(): даём протоколу app:// доступ к localStorage и другим API
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let pendingDisplaySourceId = null;

let mainWindow;
let splashWindow = null;
let autoUpdaterInstance = null;
let userRequestedCheck = false;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const isFirstRunWin = process.platform === 'win32' && process.argv.includes('--squirrel-firstrun');
const useSplash = !isDev && app.isPackaged;

let updateCheckDone = false;
let noUpdate = true;

function sendSplash(channel, ...args) {
  if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents) {
    splashWindow.webContents.send(channel, ...args);
  }
}

function initAutoUpdater() {
  if (isDev || !app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdaterInstance = autoUpdater;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoDownload = true;

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] update-available', info?.version);
      noUpdate = false;
      updateCheckDone = true;
      sendSplash('splash-update-status', 'downloading');
    });
    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] update-not-available', info?.version || 'current');
      updateCheckDone = true;
      if (userRequestedCheck && mainWindow) {
        userRequestedCheck = false;
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Обновления',
          message: 'Установлена последняя версия.',
          buttons: ['OK'],
        });
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      const percent = progress.percent ?? 0;
      sendSplash('splash-download-progress', percent);
    });
    autoUpdater.on('update-downloaded', () => {
      sendSplash('splash-update-downloaded');
    });
    const releasesUrl = 'https://github.com/qw37ty72/VoicePortalCLient/releases';
    const updateErrorMessage = (err) =>
      'Обновления проверяются автоматически при каждом запуске.\n\n' +
      'Сейчас проверка не удалась: ' + (err?.message || String(err)) + '\n\n' +
      'Скачать вручную: ' + releasesUrl;

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater]', err.message);
      updateCheckDone = true;
      if (userRequestedCheck && mainWindow) {
        userRequestedCheck = false;
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Проверка обновлений',
          message: updateErrorMessage(err),
          buttons: ['OK'],
        });
      }
    });

    Menu.setApplicationMenu(null);
    const delay = isFirstRunWin ? 500 : 0;
    console.log('[AutoUpdater] check in', delay, 'ms');
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => console.error('[AutoUpdater] check failed', e.message));
    }, delay);
  } catch (e) {
    console.error('[AutoUpdater] init failed', e.message);
    Menu.setApplicationMenu(null);
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-splash.js'),
    },
    backgroundColor: '#0a0a0f',
    show: false,
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.center();
      splashWindow.show();
    }
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  const isWin = process.platform === 'win32';
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
    titleBarStyle: isWin ? 'hidden' : 'hiddenInset',
    backgroundColor: '#0a0a0f',
    show: false,
  });

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools не открываем по умолчанию (F12 при необходимости)
  } else {
    // В production загружаем через app://, чтобы ES-модули и ассеты работали из asar
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    if (code !== -3) {
      console.error('[Electron] did-fail-load', code, desc, url);
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Ошибка загрузки окна',
        message: `Код: ${code}\nОписание: ${desc}\nURL: ${url}`,
      });
    }
  });

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

  // В production раздаём dist через app://, чтобы корректно работало из asar
  if (!isDev) {
    const distDir = path.resolve(__dirname, '..', 'dist');
    protocol.handle('app', (request) => {
      const pathname = new URL(request.url).pathname.replace(/^\//, '') || 'index.html';
      const filePath = path.normalize(path.join(distDir, pathname));
      if (!filePath.startsWith(distDir)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(filePath).href);
    });
  }

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

  ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.handle('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.maximize();
  });
  ipcMain.handle('window-unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.unmaximize();
  });
  ipcMain.handle('window-toggle-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  ipcMain.handle('window-is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized();
  });

  // Обработчик демонстрации экрана на defaultSession (до создания окна)
  const displayHandler = (request, callback) => {
    const sourceId = pendingDisplaySourceId;
    pendingDisplaySourceId = null;
    const reject = () => {
      if (typeof callback === 'function') callback(null);
      else if (request.cancel) request.cancel();
    };
    if (!sourceId) {
      reject();
      return;
    }
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 } })
      .then((sources) => {
        const src = sources.find((s) => s.id === sourceId);
        if (src) {
          if (typeof callback === 'function') {
            callback({ video: src });
          } else if (request.approve) {
            request.approve({ videoSourceId: sourceId });
          } else {
            reject();
          }
        } else {
          reject();
        }
      })
      .catch((e) => {
        console.error('[DisplayMedia]', e);
        reject();
      });
  };
  session.defaultSession.setDisplayMediaRequestHandler(displayHandler);

  if (useSplash) {
    createSplashWindow();
    initAutoUpdater();
    ipcMain.on('splash-countdown-done', () => {
      if (noUpdate) {
        createWindow();
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      }
    });
    ipcMain.on('splash-install-done', () => {
      if (autoUpdaterInstance) autoUpdaterInstance.quitAndInstall(false, true);
    });
  } else {
    createWindow();
    initAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
