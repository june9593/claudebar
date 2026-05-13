import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { setupSettingsIPC, getSettings, setSetting, onSettingChanged } from './ipc/settings';
import { setupClaudeSessionsIPC } from './ipc/claude-sessions';
import { setupPluginsIPC } from './ipc/plugins';
import { setupSkillsIPC } from './ipc/skills';
import { setupCommandsIPC } from './ipc/commands';
import { setupClaudeBridge, killAllClaudeChannels } from './claude-bridge';
import { hydrateShellEnv } from './shell-env';
import { maybeMigrateFromClawbar } from './migration';
import { createPetWindow, isPetVisible, showPet, hidePet } from './pet-window';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = false;
let isQuitting = false;
// Track window visibility via events (not isVisible() which races on macOS)
let windowVisible = false;

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  mainWindow?.hide();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (windowVisible) hideWindow();
  else showWindow();
}

function createWindow() {
  const settings = getSettings() as {
    windowSize?: { w: number; h: number };
    windowPosition?: { x: number; y: number } | null;
    alwaysOnTop?: boolean;
    hideOnClickOutside?: boolean;
  };
  const size = settings.windowSize ?? { w: 400, h: 800 };
  const pos = settings.windowPosition ?? null;

  mainWindow = new BrowserWindow({
    width: size.w,
    height: size.h,
    minWidth: 320,
    minHeight: 500,
    x: pos?.x,
    y: pos?.y,
    frame: false,
    transparent: false,
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#1a1a1a',
    titleBarStyle: 'hidden',
    show: false,
    skipTaskbar: false,
    alwaysOnTop: settings.alwaysOnTop ?? false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Track visibility for tray toggle
  mainWindow.on('show', () => { windowVisible = true; });
  mainWindow.on('hide', () => { windowVisible = false; });
  mainWindow.on('close', (e) => {
    // Hide instead of quit; user must use tray Quit menu
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Persist size + position on user resize/drag
  const persistBounds = () => {
    if (!mainWindow) return;
    const [w, h] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    setSetting('windowSize', { w, h });
    setSetting('windowPosition', { x, y });
  };
  mainWindow.on('resized', persistBounds);
  mainWindow.on('moved', persistBounds);

  // Optional: hide on blur (off by default — float windows shouldn't auto-hide)
  mainWindow.on('blur', () => {
    const s = getSettings() as { hideOnClickOutside?: boolean };
    if (s.hideOnClickOutside) mainWindow?.hide();
  });
}

function createTray() {
  const isMac = process.platform === 'darwin';
  let icon: Electron.NativeImage;

  if (isMac) {
    // 🦞 Apple Color Emoji → black silhouette 32x32 PNG, lobster shifted +2px down for visual centering.
    const lobsterPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAESElEQVR4AeyWWYhWZRjHnzNpm06lLeCUZRFjCxVlC0bLV9mi0AozEAYtFxpUA0FFRMSxmyCCKIj6ClqIimYuojKCsvQqL8qLsKTIJqVmKlMMt3Hcf7/Dd8aPOefMfArijcPz//7Pu//f533e90xbHOa/IwLGjcDeiAmc0lxwN5hEOYGrLKG9jcZzwNOgE4xpdq7skEa0JRE30uE9UAN3UD6fRSBKRWun4SaqxaPwi2A6qLTxBJzJyKfAqWAy6AKXLavVjoLL7AQqbwfXgS3gTjA/jdqxcKlVCkgjtW02o9wNm45L8K8GU9s7OxM4jBCYEPv/HKPo66maArR70lh2sk4ZHFBWHwg4LiIuArldgHMa2DirXt8NT2bxSbACTnr13DgGfyvYDAz7VFg7m58DjwCD3KWT4oa+gjZQGEiS5Dy4G1yOiFPgeT2rw0R1oX7KmsJydrx+AZUR6O3qHaL3T6DZtlMwGU+H54DXGngWVtQV8ExghKDM1vI7DEqtUkB3X7eTfM+olSC3nTi/g+/AP8BFb4OngZ/BCrAeNC/4LeX/QalVCrB32tFhOL/Qb8AFvsL3rBUojqZsknoz/sT/GAwCbRM/n9PojcAt2tgCBge3MWQxcNdQmN21x2d3mQ/XUuGiUJiM3hCv4X1UnAE0x64kAdBgsYgxBdid27Ac7gG/At+DJ15e3vcwvq8dc+NFKEQBiyg9ACaCt8FzwCOByq1SwNIZYUbfjICHGOq1+hoWM+DnQX7NcDMBV+IobA3cC/4CPkj3wyeCUqsU4CyMMJkM38X4vgOe6Q/43pCysb/R9iM4Hnhb/BbY11yhqmhlk2S91q4J23x4vHKKMCLeea+iYd2Tddz/4w3ZSNH88Kjs59EYMROVpqK5SLGWGh4Yz9HJvAnuwMnlhGYXUxTuiNlmxHyAbDeBFWECWz/SsdmpFEAnw204r8L3zg/APkx9sNltaHFH7G+8j8Bn4BdgH8V6fAcegXpHuPtLmcjs/wS2/D4svoHdHTRi6+v1um/A69QsAe3gLbALmBNQ0aojMC0M4xKO4g2GGV6PIn9QfIhGH8HW4enDu+nvEfhBcvfyK0sj/mWOUqsUsHBFJmCACXex0mpG5yF14j8oG3IoM8X298x9bAf93a3H9wEtPsGbbogwChSLVimgueuiNPsaWpXvfB0F7zna8CIT2x9JsvediB3UKEDO26kqt5YEpGl4nk64ob4gdYePMN2FwGhA2f8Ct+Jc82CEueFne8qCWeFNorraWhLAcO+8b9O2hW+m91J+BpwFcvO++214gYqZPIP/wUNzhiIXSLHcWhJAHE0+w4obfniMyOjJ3a0P1UT+UzEZ13WvCnOjfOVGbUsCWMmFG0PCu+634FMqvgQfAr8R78JPphGr4ICNWvO4KPtrScCogYb3JeruAvPAfHAL4PhjcWNhiq3ZwQhobeYWex0RcMgjMN5J7AMAAP//U56jygAAAAZJREFUAwC7xPZBqYqrVAAAAABJRU5ErkJggg==';
    icon = nativeImage.createFromDataURL(lobsterPng);
    icon = icon.resize({ width: 18, height: 18, quality: 'best' });
    icon.setTemplateImage(true);
  } else {
    // Windows: use the colored lobster icon from resources/ so it's visible on
    // both light and dark taskbars. Template images are macOS-only.
    const iconPath = path.join(__dirname, '../resources/icon.png');
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback: use a 1x1 transparent icon so tray() doesn't throw.
      icon = nativeImage.createEmpty();
    } else {
      icon = icon.resize({ width: 16, height: 16, quality: 'best' });
    }
  }

  tray = new Tray(icon);
  tray.setToolTip('ClaudeBar');
  // macOS treats rapid double-click on tray as a single double-click event,
  // not two click events. This makes rapid toggle impossible. Fix:
  tray.setIgnoreDoubleClickEvents(true);

  tray.on('click', toggleWindow);

  tray.on('right-click', () => {
    const { Menu } = require('electron');
    const petShown = isPetVisible();
    const currentPet = (getSettings() as { petKind?: 'lobster' | 'claude' }).petKind ?? 'lobster';
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
        label: petShown ? 'Hide Pet' : 'Show Pet',
        click: () => {
          if (petShown) hidePet(); else showPet();
        },
      },
      {
        label: 'Switch Pet',
        submenu: [
          {
            label: 'OpenClaw 🦞',
            type: 'radio',
            checked: currentPet === 'lobster',
            click: () => setSetting('petKind', 'lobster'),
          },
          {
            label: 'Claude Code ✦',
            type: 'radio',
            checked: currentPet === 'claude',
            click: () => setSetting('petKind', 'claude'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Quit ClaudeBar',
        click: () => {
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

app.whenReady().then(async () => {
  // Run migration BEFORE anything reads settings — settings IPC needs
  // ~/.claudebar/settings.json to exist if the user is migrating from ClawBar.
  maybeMigrateFromClawbar();

  // Hydrate the user's shell auth env BEFORE the Claude bridge starts
  // taking IPC calls — when launched from Finder/Dock on macOS, launchd
  // does not source ~/.zshrc, so without this the spawned `claude` binary
  // sees no ANTHROPIC_AUTH_TOKEN and reports "Not logged in".
  await hydrateShellEnv();

  createWindow();

  const shortcutSettings = getSettings() as { globalShortcut?: string };
  const shortcut = shortcutSettings.globalShortcut ?? (process.platform === 'darwin' ? 'CommandOrControl+Shift+C' : 'Control+Shift+C');
  const ok = globalShortcut.register(shortcut, toggleWindow);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[shortcut] failed to register ${shortcut}`);
  }

  onSettingChanged('globalShortcut', (value) => {
    if (typeof value !== 'string' || !value) return;
    globalShortcut.unregisterAll();
    const reok = globalShortcut.register(value, toggleWindow);
    if (!reok) {
      // eslint-disable-next-line no-console
      console.warn(`[shortcut] failed to re-register ${value}`);
    }
  });

  createTray();
  setupWindowIPC();
  setupSettingsIPC();
  setupClaudeSessionsIPC();
  setupPluginsIPC();
  setupSkillsIPC();
  setupCommandsIPC();
  setupClaudeBridge();
  createPetWindow(
    showWindow,
    hideWindow,
    () => windowVisible,
    () => { mainWindow?.destroy(); app.quit(); },
  );
});

app.on('before-quit', () => {
  isQuitting = true;
  killAllClaudeChannels();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep app running in tray — do nothing
});

app.on('activate', () => {
  mainWindow?.show();
});
