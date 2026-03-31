import type { Message, Session, Agent, Settings } from '../src/types';

export interface ElectronAPI {
  openclaw: {
    checkConnection(): Promise<{ connected: boolean; version?: string; error?: string }>;
    getAgents(): Promise<{ success: boolean; agents?: Agent[]; error?: string }>;
    getSessions(): Promise<{ success: boolean; sessions?: Session[]; error?: string }>;
    createSession(agentId: string): Promise<{ success: boolean; sessionId?: string; error?: string }>;
    sendMessage(sessionId: string, agentId: string, message: string): Promise<{ success: boolean; error?: string }>;
    getTranscript(agentId: string, sessionKey: string): Promise<{ success: boolean; messages?: Message[]; error?: string }>;
    closeSession(sessionId: string): Promise<{ success: boolean; error?: string }>;
  };
  settings: {
    get(): Promise<Settings>;
    set(key: string, value: unknown): Promise<void>;
    getClawPath(): Promise<string>;
    setClawPath(path: string): Promise<void>;
  };
  window: {
    togglePin(): Promise<boolean>;
    hide(): void;
    isPinned(): Promise<boolean>;
  };
  theme: {
    getSystemTheme(): Promise<'light' | 'dark'>;
    onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
