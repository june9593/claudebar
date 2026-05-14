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
  plugins: {
    list(): Promise<{
      plugins: Array<{
        name: string;
        marketplace: string;
        scope: 'user' | 'project';
        version: string;
        installedAt: string;
        lastUpdated: string;
        installPath: string;
      }>;
      marketplaces: string[];
    }>;
  };
  skills: {
    list(projectDir?: string): Promise<Array<{
      name: string;
      description: string;
      source: 'user' | 'project' | 'plugin';
      pluginName?: string;
      dir: string;
    }>>;
    read(skillDir: string): Promise<string | null>;
  };
  commands: {
    list(projectDir?: string): Promise<Array<{
      name: string;
      description: string;
      source: 'user' | 'project' | 'plugin';
      pluginName?: string;
      filePath: string;
    }>>;
    read(filePath: string): Promise<string | null>;
  };
  stats: {
    get(): Promise<{
      dailyActivity: Array<{ date: string; totalRequests?: number; totalTokensUsed?: number }>;
      tokensByDay: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
      totals: { input: number; output: number; cache_creation: number; cache_read: number };
      byModel: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
    }>;
    today(): Promise<{ input: number; output: number; cache_creation: number; cache_read: number }>;
  };
  peers: {
    list(): Promise<Array<{
      id: string;
      label: string;
      publicKeyPem: string;
      lastSeenAt: string;
      lastAddress: string;
    }>>;
    remove(peerId: string): Promise<void>;
    setLabel(peerId: string, label: string): Promise<void>;
    getMachineName(): Promise<string>;
    setMachineName(name: string): Promise<void>;
    generatePin(): Promise<{ pin: string; expiresAt: number }>;
    cancelPin(): Promise<void>;
    activePin(): Promise<{ pin: string; expiresAt: number } | null>;
    claimPin(args: { pin: string; label: string }): Promise<
      | { ok: true; peer: { id: string; label: string; publicKeyPem: string; lastSeenAt: string; lastAddress: string } }
      | { ok: false; error: 'no-active-pin' | 'pin-expired' | 'wrong-pin' | 'too-many-attempts'; attemptsRemaining?: number }
    >;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
