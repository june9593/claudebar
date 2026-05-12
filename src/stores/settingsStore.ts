import { create } from 'zustand';
import type { Settings, ViewState, ClaudeSession } from '../types';

interface SettingsState extends Settings {
  resolvedTheme: 'light' | 'dark';
  view: ViewState;
  hydrated: boolean;
  setView: (view: ViewState) => void;
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
}

const defaults: Settings = {
  // Claude CLI
  claudePath: '',
  defaultModel: 'default',
  defaultPermissionMode: 'default',
  defaultProjectDir: null,
  idleCloseMinutes: 30,

  // Window
  theme: 'system',
  windowSize: { w: 400, h: 800 },
  windowPosition: null,
  alwaysOnTop: false,
  hideOnClickOutside: false,
  globalShortcut: typeof process !== 'undefined' && process.platform === 'darwin' ? 'Cmd+Shift+C' : 'Ctrl+Shift+C',
  petVisible: true,
  petKind: 'claude',

  // Diagnostics
  enableSdkTrace: false,

  // Sessions (persisted across launches)
  sessions: [] as ClaudeSession[],
  activeSessionId: null,
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
