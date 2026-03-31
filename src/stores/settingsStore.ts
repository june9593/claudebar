import { create } from 'zustand';
import type { Settings } from '../types';

interface SettingsState extends Settings {
  resolvedTheme: 'light' | 'dark';
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
}

const defaults: Settings = {
  clawPath: 'openclaw',
  theme: 'system',
  hideOnClickOutside: false,
  autoLaunch: false,
  fontSize: 13,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  resolvedTheme: 'light',

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.settings.get();
      const merged = { ...defaults, ...settings };

      let resolvedTheme: 'light' | 'dark' = 'light';
      if (merged.theme === 'system') {
        resolvedTheme = await window.electronAPI.theme.getSystemTheme();
        // Listen for system theme changes
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
      await window.electronAPI.settings.set(key, value);
      set((s) => {
        const next = { ...s, [key]: value };
        // Recalculate resolved theme
        if (key === 'theme') {
          if (value === 'light' || value === 'dark') {
            next.resolvedTheme = value as 'light' | 'dark';
          }
          // 'system' case handled by the listener
        }
        return next;
      });
    } catch { /* ignore */ }
  },
}));
