import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsIPC } from './ipc/settings';
import { setupWsBridge } from './ws-bridge';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = false;
let lastHideTime = 0; // Track when window was last hidden (for tray click debounce)

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
    }
    if (input.key === 'w' && input.meta && !isPinned && mainWindow?.isVisible()) {
      mainWindow.hide();
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
  });

  mainWindow.on('moved', saveWindowBounds);
  mainWindow.on('resized', saveWindowBounds);
}

function createTray() {
  // Create lobster claw tray icon as a template image (black on transparent)
  // macOS template images: black pixels become white in dark menu bar, stay black in light
  const lobsterSvg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.5C5.5 1.5 4 3.5 4 5.5C4 7.5 5.5 9.5 6.5 10L6.5 11.5L7.5 11.5L7.5 10C7.5 10 8 10.2 8.5 10L8.5 11.5L9.5 11.5L9.5 10C10.5 9.5 12 7.5 12 5.5C12 3.5 10.5 1.5 8 1.5Z" fill="black"/>
    <path d="M4 5C3 4.5 2.5 5.5 2.8 6.2C3.1 7 4 6.8 4.3 6C4.5 5.5 4.3 5 4 5Z" fill="black"/>
    <path d="M12 5C13 4.5 13.5 5.5 13.2 6.2C12.9 7 12 6.8 11.7 6C11.5 5.5 11.7 5 12 5Z" fill="black"/>
    <path d="M6.5 2.5Q5.5 1.5 5 1.8" stroke="black" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M9.5 2.5Q10.5 1.5 11 1.8" stroke="black" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <circle cx="6.5" cy="4.5" r="0.8" fill="white"/>
    <circle cx="9.5" cy="4.5" r="0.8" fill="white"/>
  </svg>`;

  // Convert SVG to data URI and create nativeImage
  const svgBase64 = Buffer.from(lobsterSvg).toString('base64');
  const dataUri = `data:image/svg+xml;base64,${svgBase64}`;
  let icon = nativeImage.createFromDataURL(dataUri);
  icon = icon.resize({ width: 16, height: 16 });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('ClawBar');

  tray.on('click', () => {
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
      mainWindow.hide();
      lastHideTime = Date.now();
    } else {
      // Debounce: if window was just hidden (e.g. by blur racing with tray click),
      // don't immediately re-show it. 300ms threshold.
      if (Date.now() - lastHideTime < 300) return;

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
    }
  });

  tray.on('right-click', () => {
    const { Menu } = require('electron');
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show/Hide',
        click: () => {
          if (mainWindow?.isVisible()) mainWindow.hide();
          else { mainWindow?.show(); mainWindow?.focus(); }
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
