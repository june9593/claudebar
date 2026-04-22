import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsIPC } from './ipc/settings';
import { setupWsBridge } from './ws-bridge';
import { createPetWindow } from './pet-window';

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
    width: savedBounds?.width ?? 390,
    height: savedBounds?.height ?? 720,
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
      webviewTag: true,
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
  // 🦞 Apple Color Emoji → black silhouette 32x32 PNG, lobster shifted +2px down for visual centering.
  const lobsterPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAESElEQVR4AeyWWYhWZRjHnzNpm06lLeCUZRFjCxVlC0bLV9mi0AozEAYtFxpUA0FFRMSxmyCCKIj6ClqIimYuojKCsvQqL8qLsKTIJqVmKlMMt3Hcf7/Dd8aPOefMfArijcPz//7Pu//f533e90xbHOa/IwLGjcDeiAmc0lxwN5hEOYGrLKG9jcZzwNOgE4xpdq7skEa0JRE30uE9UAN3UD6fRSBKRWun4SaqxaPwi2A6qLTxBJzJyKfAqWAy6AKXLavVjoLL7AQqbwfXgS3gTjA/jdqxcKlVCkgjtW02o9wNm45L8K8GU9s7OxM4jBCYEPv/HKPo66maArR70lh2sk4ZHFBWHwg4LiIuArldgHMa2DirXt8NT2bxSbACTnr13DgGfyvYDAz7VFg7m58DjwCD3KWT4oa+gjZQGEiS5Dy4G1yOiFPgeT2rw0R1oX7KmsJydrx+AZUR6O3qHaL3T6DZtlMwGU+H54DXGngWVtQV8ExghKDM1vI7DEqtUkB3X7eTfM+olSC3nTi/g+/AP8BFb4OngZ/BCrAeNC/4LeX/QalVCrB32tFhOL/Qb8AFvsL3rBUojqZsknoz/sT/GAwCbRM/n9PojcAt2tgCBge3MWQxcNdQmN21x2d3mQ/XUuGiUJiM3hCv4X1UnAE0x64kAdBgsYgxBdid27Ac7gG/At+DJ15e3vcwvq8dc+NFKEQBiyg9ACaCt8FzwCOByq1SwNIZYUbfjICHGOq1+hoWM+DnQX7NcDMBV+IobA3cC/4CPkj3wyeCUqsU4CyMMJkM38X4vgOe6Q/43pCysb/R9iM4Hnhb/BbY11yhqmhlk2S91q4J23x4vHKKMCLeea+iYd2Tddz/4w3ZSNH88Kjs59EYMROVpqK5SLGWGh4Yz9HJvAnuwMnlhGYXUxTuiNlmxHyAbDeBFWECWz/SsdmpFEAnw204r8L3zg/APkx9sNltaHFH7G+8j8Bn4BdgH8V6fAcegXpHuPtLmcjs/wS2/D4svoHdHTRi6+v1um/A69QsAe3gLbALmBNQ0aojMC0M4xKO4g2GGV6PIn9QfIhGH8HW4enDu+nvEfhBcvfyK0sj/mWOUqsUsHBFJmCACXex0mpG5yF14j8oG3IoM8X298x9bAf93a3H9wEtPsGbbogwChSLVimgueuiNPsaWpXvfB0F7zna8CIT2x9JsvediB3UKEDO26kqt5YEpGl4nk64ob4gdYePMN2FwGhA2f8Ct+Jc82CEueFne8qCWeFNorraWhLAcO+8b9O2hW+m91J+BpwFcvO++214gYqZPIP/wUNzhiIXSLHcWhJAHE0+w4obfniMyOjJ3a0P1UT+UzEZ13WvCnOjfOVGbUsCWMmFG0PCu+634FMqvgQfAr8R78JPphGr4ICNWvO4KPtrScCogYb3JeruAvPAfHAL4PhjcWNhiq3ZwQhobeYWex0RcMgjMN5J7AMAAP//U56jygAAAAZJREFUAwC7xPZBqYqrVAAAAABJRU5ErkJggg==';
  let icon = nativeImage.createFromDataURL(lobsterPng);
  icon = icon.resize({ width: 18, height: 18, quality: 'best' });
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
        label: 'Settings',
        click: () => {
          showWindow();
          mainWindow?.webContents.send('navigate', 'settings');
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
  createPetWindow(
    showWindow,
    hideWindow,
    () => windowVisible,
    () => { mainWindow?.destroy(); app.quit(); },
  );
});

app.on('window-all-closed', () => {
  // Keep app running in tray — do nothing
});

app.on('activate', () => {
  mainWindow?.show();
});
