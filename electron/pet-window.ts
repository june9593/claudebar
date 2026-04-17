import { BrowserWindow, ipcMain, Menu, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let petWindow: BrowserWindow | null = null;

// Drag offset tracking
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

export function createPetWindow(
  showMainWindow: () => void,
  hideMainWindow: () => void,
  isMainWindowVisible: () => boolean,
  quitApp: () => void,
) {
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

  // --- IPC handlers for pet ---

  ipcMain.on('pet:click', () => {
    if (isMainWindowVisible()) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });

  ipcMain.on('pet:drag', (_event, screenX: number, screenY: number) => {
    if (!petWindow) return;
    // On first drag event, calculate offset from window position to mouse
    const [winX, winY] = petWindow.getPosition();
    if (dragOffset.x === 0 && dragOffset.y === 0) {
      dragOffset.x = winX - screenX;
      dragOffset.y = winY - screenY;
    }
    petWindow.setPosition(screenX + dragOffset.x, screenY + dragOffset.y);
    savePetBounds();
  });

  ipcMain.on('pet:right-click', () => {
    if (!petWindow) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Chat',
        click: () => showMainWindow(),
      },
      {
        label: 'Settings',
        click: () => {
          showMainWindow();
          // Send IPC to main window to switch to settings view
          const mainWin = BrowserWindow.getAllWindows().find(w => w !== petWindow);
          mainWin?.webContents.send('navigate', 'settings');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit ClawBar',
        click: () => quitApp(),
      },
    ]);
    contextMenu.popup({ window: petWindow! });
  });
}
