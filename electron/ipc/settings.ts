import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  clawPath: string;
  theme: 'light' | 'dark' | 'system';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  fontSize: number;
}

const defaults: AppSettings = {
  clawPath: 'openclaw',
  theme: 'system',
  hideOnClickOutside: false,
  autoLaunch: false,
  fontSize: 13,
};

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.clawbar', 'settings.json');
}

function readStore(): AppSettings {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaults, ...data };
    }
  } catch { /* ignore */ }
  return { ...defaults };
}

function writeStore(settings: AppSettings): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getSettings(): AppSettings {
  return readStore();
}

export function setupSettingsIPC() {
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    if (typeof key !== 'string' || !key) return;

    // Whitelist allowed keys
    const allowedKeys = ['clawPath', 'theme', 'hideOnClickOutside', 'autoLaunch', 'fontSize'];
    if (!allowedKeys.includes(key)) return;

    const settings = readStore();
    (settings as unknown as Record<string, unknown>)[key] = value;
    writeStore(settings);
  });

  ipcMain.handle('settings:get-claw-path', () => {
    return readStore().clawPath;
  });

  ipcMain.handle('settings:set-claw-path', (_, clawPath: string) => {
    if (typeof clawPath !== 'string') return;
    const settings = readStore();
    settings.clawPath = clawPath;
    writeStore(settings);
  });
}
