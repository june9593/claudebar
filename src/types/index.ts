// A single ClaudeBar session: a project + a Claude Code session id, with
// presentation metadata (icon hash inputs, preview text). No more channel
// kinds — ClaudeBar only hosts Claude sessions.
export interface ClaudeSession {
  id: string;            // stable internal id (cl-<timestamp>-<rand>); placeholder UUID for new sessions, real session id for resumed
  name: string;          // display name "shortProjectName · preview"
  enabled: boolean;
  projectDir: string;    // absolute path
  projectKey: string;    // ~/.claude/projects/<key>/ slug
  sessionId: string;     // either placeholder UUID (new) or real Claude session id (resumed)
  preview: string;       // last assistant message snippet
  iconLetter: string;    // first letter of project shortName (kept for backward compat with hash inputs)
  iconColor: string;     // accent color hash (kept for backward compat)
}

export interface Settings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  sessions: ClaudeSession[];
  activeSessionId: string | null;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type ViewState = 'chat' | 'settings';
