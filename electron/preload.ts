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
    setSize: (w: number, h: number) => ipcRenderer.invoke('window:set-size', w, h),
    onNavigate: (cb: (view: string) => void) => {
      const handler = (_e: unknown, view: string) => cb(view);
      ipcRenderer.on('navigate', handler);
      return () => ipcRenderer.removeListener('navigate', handler);
    },
  },
  theme: {
    getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
      const handler = (_event: unknown, theme: 'light' | 'dark') => callback(theme);
      ipcRenderer.on('theme:changed', handler);
      return () => ipcRenderer.removeListener('theme:changed', handler);
    },
  },
  ws: {
    connect: (gatewayUrl: string, authToken: string) => ipcRenderer.invoke('ws:connect', gatewayUrl, authToken),
    disconnect: () => ipcRenderer.invoke('ws:disconnect'),
    send: (method: string, params: Record<string, unknown>) => ipcRenderer.invoke('ws:send', method, params),
    isConnected: () => ipcRenderer.invoke('ws:is-connected'),
    onStatus: (cb: (status: { connected: boolean; error: string | null }) => void) => {
      const handler = (_e: unknown, status: { connected: boolean; error: string | null }) => cb(status);
      ipcRenderer.on('ws:status', handler);
      return () => ipcRenderer.removeListener('ws:status', handler);
    },
    onHistory: (cb: (payload: unknown) => void) => {
      const handler = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('ws:history', handler);
      return () => ipcRenderer.removeListener('ws:history', handler);
    },
    onChatEvent: (cb: (payload: unknown) => void) => {
      const handler = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('ws:chat-event', handler);
      return () => ipcRenderer.removeListener('ws:chat-event', handler);
    },
    onApproval: (cb: (payload: unknown) => void) => {
      const handler = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('ws:approval', handler);
      return () => ipcRenderer.removeListener('ws:approval', handler);
    },
    onResponse: (cb: (data: { id: string; ok: boolean; payload?: unknown; error?: unknown }) => void) => {
      const handler = (_e: unknown, data: { id: string; ok: boolean; payload?: unknown; error?: unknown }) => cb(data);
      ipcRenderer.on('ws:response', handler);
      return () => ipcRenderer.removeListener('ws:response', handler);
    },
  },
  pet: {
    onClick: () => ipcRenderer.send('pet:click'),
    onDrag: (x: number, y: number) => ipcRenderer.send('pet:drag', x, y),
    onDragEnd: () => ipcRenderer.send('pet:drag-end'),
    onRightClick: () => ipcRenderer.send('pet:right-click'),
  },
  claude: {
    checkCli: () => ipcRenderer.invoke('claude:check-cli'),
    scanProjects: () => ipcRenderer.invoke('claude:scan-projects'),
    listSessions: (projectKey: string) => ipcRenderer.invoke('claude:list-sessions', projectKey),
    start: (channelId: string, projectDir: string, projectKey: string, sessionId: string | null, cliPath: string) =>
      ipcRenderer.invoke('claude:start', channelId, projectDir, projectKey, sessionId, cliPath),
    send: (channelId: string, text: string) =>
      ipcRenderer.invoke('claude:send', channelId, text),
    abort: (channelId: string) => ipcRenderer.invoke('claude:abort', channelId),
    close: (channelId: string) => ipcRenderer.invoke('claude:close', channelId),
    approve: (channelId: string, requestId: string, decision: 'allow' | 'allow-session' | 'deny') =>
      ipcRenderer.invoke('claude:approve', channelId, requestId, decision),
    answer: (channelId: string, requestId: string, answers: string[][]) =>
      ipcRenderer.invoke('claude:answer', channelId, requestId, answers),
    loadHistory: (projectKey: string, sessionId: string) =>
      ipcRenderer.invoke('claude:load-history', projectKey, sessionId),
    onEvent: (cb: (envelope: { channelId: string; event: unknown }) => void) => {
      const handler = (_e: unknown, envelope: { channelId: string; event: unknown }) => cb(envelope);
      ipcRenderer.on('claude:event', handler);
      return () => ipcRenderer.removeListener('claude:event', handler);
    },
  },
});
