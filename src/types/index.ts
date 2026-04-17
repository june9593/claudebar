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
