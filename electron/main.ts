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
  // 🦞 Apple Color Emoji → black silhouette 32x32 PNG data URI (Playwright-rendered).
  // 32px = 16pt @2x Retina = standard macOS menu bar icon size. No resize = crisp.
  // macOS template image: auto-inverts black → white on dark menu bar.
  const lobsterPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAE8klEQVR4AeyXW4ydUxTH14y7GpcxboOaxKAmEh2NukRCPUjVncy4JCVUWhEdl3oRoh8JQkSY8dKGNKiIOe0DiVZcoiJuERHEuHTaDmXEpa2WMYoav985c25zzvnOePDWk/X/1lp7r72/tddee+3vNEb93z6YLACzkojGsYiGqPPTDpNDwEJwHKhJqQ70trfvwch7wMOgk4ln8/YjkdOoCbszMTgK9IBnwDGgKqU60DM4eBmjnORv+O7ASHTA06iZzrlgGvgTnAxchJFELKc0Bw7F9FawK2DhMT0inOxAeBrtQufx4DywJ5DO53ERqKA0BzqxzofbrTgJ/SBAGozpUCyJ2A19ypLW1r3h2TY4/dEIPxUcAKQmHui5ccgF0rCgTBBMovwKdOBo+reBjf1dDY5rYT/akrbYsWB42BdNXXVuNmd+1QYcAfYHeTosxioT2InyBhP5dhp2AMnVabsZZbQ7E7Ph94MrkqFoh58OFs9ZPXgzfD8wDLR3HGKWtoeZkBWLD42KWrm0HnUElNLvKHOA+fE1/AbwEHBqVzyEfCkY3yqkHP0DWx9JgzxKfzUd6O/q+gjDV0HpoL3Q1yURT8E3glZwNjDp6EtWIL8MzI3S1X9F20pQQTUd6M5kPEIZRpRGoT/piAwOeCz/oG8MmB+wGOltX+6LP0VZCjYBSZt3GPOJykTUdGDc8H34xyBPs5KBmB6ROM6taIjibyZ141hUj+kFcHMBFlt5rMSB0kjSlCMnyknVn1tovgu8DUaByfYADpyIfBoopX1RZoArwU1A+oaHyboKXpXSHPAY+iKdeJrRr4ANwD1/HG4/rEDO5Sm4gxbHvA43J1bDrSHT+jvCaopaJAcVtXHpjQir3zmo88DV4EJgTpiYXyKfAvIhRsyS28H2hKF+jxZPifqNyNeAud0D4elALFJjUSxKZ0V2ktdo0Xv3cAqyR88VDCB/BkwuWBlZJ3TyL1rbgBXQ0uyYFcvaIp+YdOWoqgN97WE2X47JJcDKtg2uE0bGyS1SNFWQq7ffaDiHJ+RbrA4H864dCjlikao60DMYDjSMD2J6MHAVX8ANobedL6gWAdsc24Ktzn4OPwF8AB4DHl1Ykao6QLcrtnjcjey9fh/cCLwFfx48CzwVsAL58jfRvP9NPiNBOkU/bVbKmfDvQBnVckCjM3j4ktvg7n8zm2qGP4H+EjApYWWk0zr4CK0vAsuyp4GjG9yG4SJoLlKaA579RSzrR8z9mHiXQm94UcNQGiXlPDCN71Xmz8jm0AZkE9KXZpDv5RgaFcQipTmwCbMRNtuJX0B2RRYbxDAJJzrgzfmLnUs/DB314uqlAv5gG/iJY1gRtTQHGJOjhe3ZF6qY5fDkZx5rQCnpkMkWrNQXOfcoDnhvlNqVyRqVNVRT+gbDLx5XZU3AJPFk5KOBniUj0JIkSeP4SnVIu2xnrUddB1iBNs1M4P7+Bp8KHgUmGKxAXkJ9OHBxxBg7FyZk07KI/FdVwbBUcPJSvUJenGvZgiNrc2LMh1ukrHKIBbJWdKLdGdHgPWFVXBscnUj51XWApbjvm3Egv5cchjDBak3rDZj/hthK9fPE1LLNfr3W7KzWwT2xnPbrgJXtuXH+JNz2RfDbgeUbVp/qRmDiFGsiXJHF5hb6rgLy6+H+GbEArUOeNP1nByY98yQNdzrwv0eg3k78CwAA//9drIMAAAAABklEQVQDAIDrC1B2E2orAAAAAElFTkSuQmCC';
  let icon = nativeImage.createFromDataURL(lobsterPng);
  // Resize to 16x16pt — macOS standard tray icon size.
  // 'best' quality uses Lanczos interpolation for crisp downscaling.
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
