import { create } from 'zustand';
import type { Settings, ViewState } from '../types';

interface SettingsState extends Settings {
  resolvedTheme: 'light' | 'dark';
  view: ViewState;
  hydrated: boolean;
  setView: (view: ViewState) => void;
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
}

const defaults: Settings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'none',
  authToken: '',
  authPassword: '',
  theme: 'system',
  chatMode: 'compact',
  hideOnClickOutside: false,
  autoLaunch: false,
  channels: [
    { id: 'openclaw', kind: 'openclaw', name: 'OpenClaw',  builtin: true, enabled: true },
    { id: 'telegram', kind: 'web',      name: 'Telegram',  builtin: true, enabled: true, url: 'https://web.telegram.org/', icon: '✈️' },
    { id: 'discord',  kind: 'web',      name: 'Discord',   builtin: true, enabled: true, url: 'https://discord.com/app',   icon: '💬' },
    { id: 'feishu',   kind: 'web',      name: '飞书',      builtin: true, enabled: true, url: 'https://www.feishu.cn/messenger/',     icon: '🪶' },
    { id: 'lark',     kind: 'web',      name: 'Lark',      builtin: true, enabled: true, url: 'https://www.larksuite.com/messenger/', icon: '🐦' },
  ],
  activeChannelId: 'openclaw',
};

const LS_KEY = 'clawbar-settings';

function loadFromLocalStorage(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveToLocalStorage(settings: Settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  resolvedTheme: 'light',
  view: 'chat',
  hydrated: false,

  setView: (view: ViewState) => set({ view }),

  loadSettings: async () => {
    if (!window.electronAPI?.settings) {
      // Browser mode: use localStorage as fallback
      const saved = loadFromLocalStorage();
      const merged = { ...defaults, ...saved };
      set({ ...merged, resolvedTheme: merged.theme === 'dark' ? 'dark' : 'light', hydrated: true });
      return;
    }
    try {
      const settings = await window.electronAPI.settings.get();
      const merged = { ...defaults, ...settings };

      let resolvedTheme: 'light' | 'dark' = 'light';
      if (merged.theme === 'system') {
        resolvedTheme = await window.electronAPI.theme.getSystemTheme();
        window.electronAPI.theme.onThemeChange((t) => {
          if (get().theme === 'system') {
            set({ resolvedTheme: t });
          }
        });
      } else {
        resolvedTheme = merged.theme;
      }

      set({ ...merged, resolvedTheme, hydrated: true });
    } catch {
      set({ ...defaults, resolvedTheme: 'light', hydrated: true });
    }
  },

  updateSetting: async (key: string, value: unknown) => {
    try {
      if (window.electronAPI?.settings) {
        await window.electronAPI.settings.set(key, value);
      }
      if (key === 'chatMode') {
        if (value === 'classic') {
          window.electronAPI?.window?.setSize(800, 700);
        } else {
          window.electronAPI?.window?.setSize(390, 720);
        }
      }
      set((s) => {
        const next = { ...s, [key]: value };
        if (key === 'theme') {
          if (value === 'light' || value === 'dark') {
            next.resolvedTheme = value as 'light' | 'dark';
          }
        }
        // Persist to localStorage (browser fallback)
        const { resolvedTheme: _r, view: _v, hydrated: _h, setView: _sv, loadSettings: _ls, updateSetting: _us, ...settingsOnly } = next;
        saveToLocalStorage(settingsOnly as Settings);
        return next;
      });
    } catch { /* ignore */ }
  },
}));
