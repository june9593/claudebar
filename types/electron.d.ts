import type { Settings } from '../src/types';

export interface ElectronAPI {
  settings: {
    get(): Promise<Settings>;
    set(key: string, value: unknown): Promise<void>;
  };
  window: {
    togglePin(): Promise<boolean>;
    hide(): void;
    isPinned(): Promise<boolean>;
    setSize(width: number, height: number): Promise<void>;
    onNavigate(cb: (view: string) => void): () => void;
  };
  theme: {
    getSystemTheme(): Promise<'light' | 'dark'>;
    onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void;
  };
  ws: {
    connect(gatewayUrl: string, authToken: string): Promise<void>;
    disconnect(): Promise<void>;
    send(method: string, params: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }>;
    isConnected(): Promise<boolean>;
    onStatus(cb: (status: { connected: boolean; error: string | null }) => void): () => void;
    onHistory(cb: (payload: unknown) => void): () => void;
    onChatEvent(cb: (payload: unknown) => void): () => void;
    onApproval(cb: (payload: unknown) => void): () => void;
    onResponse(cb: (data: { id: string; ok: boolean; payload?: unknown; error?: unknown }) => void): () => void;
  };
  pet: {
    onClick(): void;
    onDrag(x: number, y: number): void;
    onDragEnd(): void;
    onRightClick(): void;
  };
  claude: {
    checkCli(): Promise<{ found: boolean; version?: string; path?: string }>;
    scanProjects(): Promise<Array<{ key: string; decodedPath: string; sessionCount: number }>>;
    listSessions(projectKey: string): Promise<Array<{ sessionId: string; preview: string; mtime: number }>>;
    start(channelId: string, projectDir: string, projectKey: string, sessionId: string | null, cliPath: string): Promise<void>;
    send(channelId: string, text: string): Promise<void>;
    abort(channelId: string): Promise<void>;
    close(channelId: string): Promise<void>;
    approve(channelId: string, requestId: string, decision: 'allow' | 'allow-session' | 'deny'): Promise<void>;
    answer(channelId: string, requestId: string, answers: string[][]): Promise<void>;
    loadHistory(projectKey: string, sessionId: string): Promise<Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>>;
    onEvent(cb: (envelope: import('../shared/claude-events').ClaudeEventEnvelope) => void): () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
