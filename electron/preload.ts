const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openclaw: {
    checkConnection: () => ipcRenderer.invoke('openclaw:check-connection'),
    getAgents: () => ipcRenderer.invoke('openclaw:get-agents'),
    getSessions: () => ipcRenderer.invoke('openclaw:get-sessions'),
    createSession: (agentId: string) => ipcRenderer.invoke('openclaw:create-session', agentId),
    sendMessage: (sessionId: string, agentId: string, message: string) =>
      ipcRenderer.invoke('openclaw:send-message', sessionId, agentId, message),
    getTranscript: (agentId: string, sessionKey: string) =>
      ipcRenderer.invoke('openclaw:get-transcript', agentId, sessionKey),
    closeSession: (sessionId: string) => ipcRenderer.invoke('openclaw:close-session', sessionId),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getClawPath: () => ipcRenderer.invoke('settings:get-claw-path'),
    setClawPath: (p: string) => ipcRenderer.invoke('settings:set-claw-path', p),
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
