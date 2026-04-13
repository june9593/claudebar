import { create } from 'zustand';
import type { Settings, ViewState } from '../types';

interface SettingsState extends Settings {
  resolvedTheme: 'light' | 'dark';
  view: ViewState;
  setView: (view: ViewState) => void;
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
}

const defaults: Settings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'token',
  authToken: '',
  authPassword: '',
  theme: 'system',
  hideOnClickOutside: false,
  autoLaunch: false,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  resolvedTheme: 'light',
  view: 'chat',

  setView: (view: ViewState) => set({ view }),

  loadSettings: async () => {
    if (!window.electronAPI?.settings) {
      set({ ...defaults, resolvedTheme: 'light' });
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

      set({ ...merged, resolvedTheme });
    } catch {
      set({ ...defaults, resolvedTheme: 'light' });
    }
  },

  updateSetting: async (key: string, value: unknown) => {
    try {
      if (window.electronAPI?.settings) {
        await window.electronAPI.settings.set(key, value);
      }
      set((s) => {
        const next = { ...s, [key]: value };
        if (key === 'theme') {
          if (value === 'light' || value === 'dark') {
            next.resolvedTheme = value as 'light' | 'dark';
          }
        }
        return next;
      });
    } catch { /* ignore */ }
  },
}));
