import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsIPC } from './ipc/settings';
import { setupWsBridge } from './ws-bridge';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = false;
let windowShown = false; // Track show/hide state explicitly (not via isVisible which has race conditions)

function getWindowBoundsPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.clawbar', 'window-bounds.json');
}

function saveWindowBounds() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    const boundsPath = getWindowBoundsPath();
    const dir = path.dirname(boundsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(boundsPath, JSON.stringify(bounds), 'utf-8');
  } catch { /* ignore */ }
}

function loadWindowBounds(): Electron.Rectangle | null {
  try {
    const boundsPath = getWindowBoundsPath();
    if (fs.existsSync(boundsPath)) {
      return JSON.parse(fs.readFileSync(boundsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function createWindow() {
  const savedBounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 380,
    height: savedBounds?.height ?? 560,
    minWidth: 320,
    minHeight: 400,
    maxWidth: 800,
    maxHeight: 900,
    frame: false,
    transparent: false,
    resizable: true,
    movable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // --- Network interceptors (MUST be registered BEFORE loadURL) ---

  // Strip frame-ancestors / X-Frame-Options from OpenClaw responses (for classic iframe mode)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    delete headers['x-frame-options'];
    delete headers['X-Frame-Options'];
    const cspKeys = Object.keys(headers).filter(k => k.toLowerCase() === 'content-security-policy');
    for (const key of cspKeys) {
      if (headers[key]) {
        headers[key] = headers[key].map(v =>
          v.replace(/frame-ancestors\s+[^;]+;?/gi, '')
           .replace(/script-src\s+/gi, "script-src 'unsafe-inline' ")
        );
      }
    }
    callback({ responseHeaders: headers });
  });

  // Load the app (after interceptors are ready)
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && !isPinned && mainWindow?.isVisible()) {
      mainWindow.hide();
      windowShown = false;
    }
    if (input.key === 'w' && input.meta && !isPinned && mainWindow?.isVisible()) {
      mainWindow.hide();
      windowShown = false;
    }
  });

  mainWindow.on('blur', () => {
    if (!isPinned && mainWindow?.isVisible()) {
      // Optionally hide on blur — controlled by settings
    }
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
    windowShown = false;
  });

  mainWindow.on('moved', saveWindowBounds);
  mainWindow.on('resized', saveWindowBounds);
}

function createTray() {
  // Load lobster template PNG icon (black on transparent)
  // macOS auto-renders template images: black→white in dark menu bar
  const icon2xPath = path.join(__dirname, '../resources/iconTemplate@2x.png');
  const iconPath = path.join(__dirname, '../resources/iconTemplate.png');
  let icon: Electron.NativeImage;

  try {
    if (fs.existsSync(icon2xPath)) {
      icon = nativeImage.createFromPath(icon2xPath);
    } else {
      icon = nativeImage.createFromPath(iconPath);
    }
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('ClawBar');

  tray.on('click', () => {
    if (!mainWindow) return;

    // Use our own state flag — mainWindow.isVisible() has race conditions on macOS
    // because blur/hide events fire asynchronously relative to tray click
    if (windowShown) {
      mainWindow.hide();
      windowShown = false;
    } else {
      // Restore saved position or center below tray
      const saved = loadWindowBounds();
      if (saved) {
        const displays = screen.getAllDisplays();
        const isOnScreen = displays.some(d => {
          const db = d.bounds;
          return saved.x >= db.x && saved.x < db.x + db.width &&
                 saved.y >= db.y && saved.y < db.y + db.height;
        });
        if (isOnScreen) {
          mainWindow.setBounds(saved);
        } else {
          const trayBounds = tray!.getBounds();
          const windowBounds = mainWindow.getBounds();
          const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
          const y = trayBounds.y + trayBounds.height + 4;
          mainWindow.setPosition(x, y);
        }
      } else {
        const trayBounds = tray!.getBounds();
        const windowBounds = mainWindow.getBounds();
        const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
        const y = trayBounds.y + trayBounds.height + 4;
        mainWindow.setPosition(x, y);
      }
      mainWindow.show();
      mainWindow.focus();
      windowShown = true;
    }
  });

  tray.on('right-click', () => {
    const { Menu } = require('electron');
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show/Hide',
        click: () => {
          if (windowShown) { mainWindow?.hide(); windowShown = false; }
          else { mainWindow?.show(); mainWindow?.focus(); windowShown = true; }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit ClawBar',
        click: () => {
          mainWindow?.destroy();
          app.quit();
        },
      },
    ]);
    tray?.popUpContextMenu(contextMenu);
  });
}

function setupWindowIPC() {
  ipcMain.handle('window:toggle-pin', () => {
    isPinned = !isPinned;
    mainWindow?.setAlwaysOnTop(isPinned);
    return isPinned;
  });

  ipcMain.on('window:hide', () => {
    mainWindow?.hide();
    windowShown = false;
  });

  ipcMain.handle('window:is-pinned', () => isPinned);

  ipcMain.handle('window:set-size', (_, width: number, height: number) => {
    if (mainWindow) {
      mainWindow.setSize(width, height, true);
      mainWindow.center();
    }
  });

  ipcMain.handle('theme:get-system', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainWindow?.webContents.send('theme:changed', theme);
  });
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// Hide from Dock
app.dock?.hide();

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupWindowIPC();
  setupSettingsIPC();
  setupWsBridge();
});

app.on('window-all-closed', () => {
  // Keep app running in tray — do nothing
});

app.on('activate', () => {
  mainWindow?.show();
});
