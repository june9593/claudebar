import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface Channel {
  id: string;
  kind: 'openclaw' | 'web';
  name: string;
  builtin: boolean;
  enabled: boolean;
  url?: string;
  icon?: string;
}

interface AppSettings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  channels: Channel[];
  activeChannelId: string;
  petVisible: boolean;
  /** Which mascot the desktop pet shows. 'lobster' = OpenClaw lobster
   *  (default, preserves existing behaviour); 'claude' = pixel-art
   *  Claude Code critter. Set via tray / pet right-click "Switch Pet"
   *  submenu; persisted across launches. */
  petKind: 'lobster' | 'claude';
  alwaysOnTop?: boolean;
  windowSize?: { w: number; h: number };
  windowPosition?: { x: number; y: number } | null;
  globalShortcut?: string;
}

const defaultChannels: Channel[] = [
  { id: 'openclaw', kind: 'openclaw', name: 'OpenClaw',  builtin: true, enabled: true },
  { id: 'telegram', kind: 'web',      name: 'Telegram',  builtin: true, enabled: true, url: 'https://web.telegram.org/', icon: '✈️' },
  { id: 'discord',  kind: 'web',      name: 'Discord',   builtin: true, enabled: true, url: 'https://discord.com/app',   icon: '💬' },
  { id: 'feishu',   kind: 'web',      name: '飞书',      builtin: true, enabled: true, url: 'https://accounts.feishu.cn/accounts/page/login?app_id=1&no_trap=1&redirect_uri=https%3A%2F%2Fwww.feishu.cn%2Fmessages',     icon: '🪶' },
  { id: 'lark',     kind: 'web',      name: 'Lark',      builtin: true, enabled: true, url: 'https://accounts.larksuite.com/accounts/page/login?app_id=1&no_trap=1&redirect_uri=https%3A%2F%2Fwww.larksuite.com%2Fmessages', icon: '🐦' },
];

const defaults: AppSettings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'none',
  authToken: '',
  authPassword: '',
  theme: 'system',
  chatMode: 'compact',
  hideOnClickOutside: false,
  autoLaunch: false,
  channels: defaultChannels,
  activeChannelId: 'openclaw',
  petVisible: true,
  petKind: 'lobster',
};

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.claudebar', 'settings.json');
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

type Listener = (value: unknown) => void;
const listeners = new Map<string, Listener[]>();

export function onSettingChanged(key: string, fn: Listener): void {
  const arr = listeners.get(key) ?? [];
  arr.push(fn);
  listeners.set(key, arr);
}

export function setSetting(key: keyof AppSettings, value: unknown): void {
  const settings = readStore();
  (settings as unknown as Record<string, unknown>)[key as string] = value;
  writeStore(settings);
  const arr = listeners.get(key as string) ?? [];
  for (const fn of arr) fn(value);
}

export function setupSettingsIPC() {
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    if (typeof key !== 'string' || !key) return;

    const allowedKeys = [
      'gatewayUrl', 'authMode', 'authToken', 'authPassword',
      'theme', 'chatMode', 'hideOnClickOutside', 'autoLaunch',
      'channels', 'activeChannelId', 'petVisible', 'petKind',
      'globalShortcut',
    ];
    if (!allowedKeys.includes(key)) return;

    const settings = readStore();
    (settings as unknown as Record<string, unknown>)[key] = value;
    writeStore(settings);
    const arr = listeners.get(key) ?? [];
    for (const fn of arr) fn(value);
  });
}
