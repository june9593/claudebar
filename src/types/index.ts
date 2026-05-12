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
  // Claude CLI
  claudePath: string;
  defaultModel: 'default' | 'opus' | 'sonnet' | 'haiku';
  defaultPermissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
  defaultProjectDir: string | null;
  idleCloseMinutes: number;

  // Window
  theme: 'light' | 'dark' | 'system';
  windowSize: { w: number; h: number };
  windowPosition: { x: number; y: number } | null;
  alwaysOnTop: boolean;
  hideOnClickOutside: boolean;
  globalShortcut: string;
  petVisible: boolean;
  petKind: 'claude' | 'lobster';

  // Diagnostics
  enableSdkTrace: boolean;

  // Sessions (persisted across launches)
  sessions: ClaudeSession[];
  activeSessionId: string | null;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type ViewState = 'chat' | 'settings';
