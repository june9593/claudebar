const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
  window: {
    togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
    hide: () => ipcRenderer.send('window:hide'),
    isPinned: () => ipcRenderer.invoke('window:is-pinned'),
  },
  theme: {
    getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
      const handler = (_event: unknown, theme: 'light' | 'dark') => callback(theme);
      ipcRenderer.on('theme:changed', handler);
      return () => ipcRenderer.removeListener('theme:changed', handler);
    },
  },
});
