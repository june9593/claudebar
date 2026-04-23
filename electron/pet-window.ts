import { BrowserWindow, ipcMain, Menu, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getSettings, setSetting } from './ipc/settings';

let petWindow: BrowserWindow | null = null;
let createArgs: {
  showMainWindow: () => void;
  hideMainWindow: () => void;
  isMainWindowVisible: () => boolean;
  quitApp: () => void;
} | null = null;

let dragOffset = { x: 0, y: 0 };

function getPetBoundsPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.clawbar', 'pet-bounds.json');
}

function savePetBounds() {
  if (!petWindow) return;
  try {
    const pos = petWindow.getPosition();
    const boundsPath = getPetBoundsPath();
    const dir = path.dirname(boundsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(boundsPath, JSON.stringify({ x: pos[0], y: pos[1] }), 'utf-8');
  } catch { /* ignore */ }
}

function loadPetBounds(): { x: number; y: number } | null {
  try {
    const boundsPath = getPetBoundsPath();
    if (fs.existsSync(boundsPath)) {
      return JSON.parse(fs.readFileSync(boundsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function getDefaultPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  return { x: width - 120, y: height - 130 };
}

function spawnPetWindow() {
  if (petWindow) return;
  const saved = loadPetBounds();
  const pos = saved || getDefaultPosition();

  petWindow = new BrowserWindow({
    width: 100,
    height: 110,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  petWindow.setIgnoreMouseEvents(false);
  petWindow.setVisibleOnAllWorkspaces(true);

  if (process.env.VITE_DEV_SERVER_URL) {
    petWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}pet.html`);
  } else {
    petWindow.loadFile(path.join(__dirname, '../dist/pet.html'));
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

export function isPetVisible(): boolean {
  return !!petWindow;
}

export function hidePet() {
  if (petWindow) {
    petWindow.destroy();
    petWindow = null;
  }
  setSetting('petVisible', false);
}

export function showPet() {
  if (!petWindow) spawnPetWindow();
  setSetting('petVisible', true);
}

export function createPetWindow(
  showMainWindow: () => void,
  hideMainWindow: () => void,
  isMainWindowVisible: () => boolean,
  quitApp: () => void,
) {
  createArgs = { showMainWindow, hideMainWindow, isMainWindowVisible, quitApp };

  // --- IPC handlers (registered once, regardless of pet visibility) ---

  ipcMain.on('pet:click', () => {
    if (isMainWindowVisible()) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });

  ipcMain.on('pet:drag', (_event, screenX: number, screenY: number) => {
    if (!petWindow) return;
    const [winX, winY] = petWindow.getPosition();
    if (dragOffset.x === 0 && dragOffset.y === 0) {
      dragOffset.x = winX - screenX;
      dragOffset.y = winY - screenY;
    }
    petWindow.setPosition(screenX + dragOffset.x, screenY + dragOffset.y);
    savePetBounds();
  });

  // Reset offset when a drag ends so the next drag re-anchors against the
  // mouse-down position (otherwise the pet snaps to a stale offset).
  ipcMain.on('pet:drag-end', () => {
    dragOffset = { x: 0, y: 0 };
  });

  ipcMain.on('pet:right-click', () => {
    if (!petWindow || !createArgs) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Chat',
        click: () => createArgs!.showMainWindow(),
      },
      {
        label: 'Settings',
        click: () => {
          createArgs!.showMainWindow();
          const mainWin = BrowserWindow.getAllWindows().find(w => w !== petWindow);
          mainWin?.webContents.send('navigate', 'settings');
        },
      },
      { type: 'separator' },
      {
        label: 'Hide Pet',
        click: () => hidePet(),
      },
      { type: 'separator' },
      {
        label: 'Quit ClawBar',
        click: () => createArgs!.quitApp(),
      },
    ]);
    contextMenu.popup({ window: petWindow! });
  });

  // Spawn the pet window only if persisted settings say it should be visible.
  // Default (first launch) is true.
  const visible = getSettings().petVisible !== false;
  if (visible) spawnPetWindow();
}
