import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsIPC } from './ipc/settings';
import { setupWsBridge } from './ws-bridge';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = false;
// Track window visibility via events (not isVisible() which races on macOS)
let windowVisible = false;

function showWindow() {
  if (!mainWindow) return;
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
      positionNearTray();
    }
  } else {
    positionNearTray();
  }
  mainWindow.show();
  mainWindow.focus();
  windowVisible = true;
}

function positionNearTray() {
  if (!tray || !mainWindow) return;
  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = trayBounds.y + trayBounds.height + 4;
  mainWindow.setPosition(x, y);
}

function hideWindow() {
  mainWindow?.hide();
  windowVisible = false;
}

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
      hideWindow();
    }
    if (input.key === 'w' && input.meta && !isPinned && mainWindow?.isVisible()) {
      hideWindow();
    }
  });

  mainWindow.on('blur', () => {
    // No auto-hide on blur
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    hideWindow();
  });

  mainWindow.on('moved', saveWindowBounds);
  mainWindow.on('resized', saveWindowBounds);
}

function createTray() {
  // 🦞 emoji as black silhouette PNG, 44x44px = 22pt @2x Retina (exact integer ratio = crisp)
  // +2px vertical offset for visual centering in macOS menu bar
  const lobsterDataUri = 'data:image/png;base64,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';
  let icon = nativeImage.createFromDataURL(lobsterDataUri);
  // No resize needed: 44px source = 22pt on Retina, exact 2x ratio = pixel-perfect
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('ClawBar');
  // macOS treats rapid double-click on tray as a single double-click event,
  // not two click events. This makes rapid toggle impossible. Fix:
  tray.setIgnoreDoubleClickEvents(true);

  // Toggle: track desired state to avoid async isVisible() race conditions
  let wantVisible = false;

  tray.on('click', () => {
    if (!mainWindow) return;
    // Use event-tracked flag, not isVisible() (which races with blur on macOS)
    if (windowVisible) {
      hideWindow();
    } else {
      showWindow();
    }
  });

  tray.on('right-click', () => {
    const { Menu } = require('electron');
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show/Hide',
        click: () => {
          if (mainWindow?.isVisible()) hideWindow();
          else showWindow();
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
    hideWindow();
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
