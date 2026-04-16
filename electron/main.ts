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
  // 🦞 emoji as black silhouette PNG 32x32, resized to 22px for menu bar
  const lobsterDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAD/klEQVR4AeyWR6hUVxjHT6oxvRcTQhIeQdIImISYhCRgNrEvVFQQGzasKC4Unw6WjeBGF5aNImJHEUXcWFaKYkER67Oi2EWfvfv7DdznnZk7Z0ZB3Dj8//f7Tr3fOV+582J4xr9qDPgUG8fBb+HjoAuTB8MoKhnwBqvnwRxsCt30PWQMvzHYGv4Op8LhsCwqGTCMlS3gFfgl7A6bwBj+YLAzvA3FRB7NYSZiBnzBioFQuNm/KD/Dt2AMHzDo3B+QojGP3jATMQN+YcVnUOiKv1HehHdhAttv574KryUdyJvwc9gMJtDwRC+QMQM+Ss30BbZP07cPfgj/gZ62Pnc0fI+u7xFhhw/ofEQe7+afGY+YAecy5p+k70fYDQ6CusjANNr7024PX4bXYRqX0o20HjPAk5xJT0Z/H/4FV8FG0AivRXaFe+FZ2AregmnsTjfSesyAY0ycDxPcRzkKTcuDSE/1EtL68AqyHm6Ey+BFmMAAXpA0imXMAOcu5HEPigc81sNTKC8gX4dCI5T5+jCzWVhHI33iHTNDvo/uUkQNyIWwnSWeGBF80WiUFrzd7PgfPY22q2tqGvXbFibT2RIKb21qvxDu2MhiJQNMOQNsOovNAKN+Arp5ndwAzTyatKyrc8zipUv20+u8tBvpKkTMgD+ZOhR2gJfhUrgZWh/GIPEEz0ewcI2keQEugrrCVOyD3gtmImaABcW0s6hYSr9hBwNzC9IrxRNoj6CLDFID0ZszXf9j2JtyH9RSxAwwzX5iiUXItDIFLSjn6fOUiAJ4I9YO/e4X1OppNnzMrO9gJmIG/MqKndBaYD03xz2NhllsGCqAN+ItaPCrjOi2d5DGwgFkJsoawHd0Biu8fmNhObqbH0Jugl4zogA3aOn3rUiN1R3GQkfarkWUoqwBQ0Lw49OGJaOgp9ENg7hnI30tfcWw4MwldccyMAJ+AjV0CrIHzERZA5jt1Q9AHoFGvh+hq9wzNgTjQMlQA66i1WOAMaDvr9E2CDcg6eaZgZgBu5hfB8U0HrYNRNRgGS42wKzRDYHf19DyuxIpXKssYcyA9GQ/NJ466duDchymsTuXy6XnHGbwBIyiWgNMpQeLQzAWwsq+fb2B+qKdL2KA12+3VdNsUY+yogE4zzkacLhTCH6YmraZNcvyWlO0s/W/dnHH5o1Z403oEgOxaFph080Le0pbzvFEppWjfpDaoVgTEA3wZeM7LdnUGgO8CVNW2TAhS3HzrP6GPjazrHqipM90TPQsaZm236ywMqqXZUUDMlZOos+/2iuQRvkc5Bpo1Pei5q5GrxpPYoCuqOUN/v9ri+wJ/W/g37LZpIcFia7q8CQGVLdzlbOeG/DUb6CSJx4CAAD//5XH/7MAAAAGSURBVAMA+CvOQZUKd+EAAAAASUVORK5CYII=';
  let icon = nativeImage.createFromDataURL(lobsterDataUri);
  icon = icon.resize({ width: 18, height: 18 });
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
