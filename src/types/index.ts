export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface Session {
  id: string;
  key: string;
  agent: string;
  model: string;
  channel: string;
  sessionId?: string;
  status: 'active' | 'idle' | 'inactive';
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  workspace?: string;
}

export interface Settings {
  gatewayUrl: string;       // e.g. "http://localhost:18789"
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type ViewState = 'chat' | 'settings';
