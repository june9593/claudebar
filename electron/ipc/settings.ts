import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
}

const defaults: AppSettings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'none',
  authToken: '',
  authPassword: '',
  theme: 'system',
  chatMode: 'compact',
  hideOnClickOutside: false,
  autoLaunch: false,
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

    const allowedKeys = ['gatewayUrl', 'authMode', 'authToken', 'authPassword', 'theme', 'chatMode', 'hideOnClickOutside', 'autoLaunch'];
    if (!allowedKeys.includes(key)) return;

    const settings = readStore();
    (settings as unknown as Record<string, unknown>)[key] = value;
    writeStore(settings);
  });
}
