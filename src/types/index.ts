export interface Settings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  channels: Channel[];
  activeChannelId: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type ViewState = 'chat' | 'settings';

export type ChannelKind = 'openclaw' | 'web' | 'claude';

interface BaseChannel {
  id: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
}

export interface OpenClawChannelDef extends BaseChannel {
  kind: 'openclaw';
  builtin: true;
  enabled: true;
}

export interface WebChannelDef extends BaseChannel {
  kind: 'web';
  url: string;
  icon: string;
}

export interface ClaudeChannelDef extends BaseChannel {
  kind: 'claude';
  builtin: false;
  enabled: true;
  projectDir: string;
  projectKey: string;
  sessionId: string;
  preview: string;
  iconLetter: string;
  iconColor: string;
}

export type Channel = OpenClawChannelDef | WebChannelDef | ClaudeChannelDef;
