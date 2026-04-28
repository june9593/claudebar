// Shared event / decision / question types for the Claude SDK bridge.
// Imported by both the main process (electron/claude-bridge.ts) and the
// renderer (src/hooks/useClaudeSession.ts, src/components/claude/*).

export type ApprovalDecision = 'allow' | 'allow-session' | 'deny';

export interface AskQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
}

export type ClaudeEvent =
  | { kind: 'cli-missing' }
  | { kind: 'cli-found'; path: string; version: string }
  | { kind: 'session-started'; sessionId: string }
  | { kind: 'message-delta'; messageId: string; text: string }
  | { kind: 'thinking-delta'; messageId: string; text: string }
  | { kind: 'tool-call'; callId: string; tool: string; input: unknown; startedAt: number }
  | { kind: 'tool-result'; callId: string; output: unknown; isError: boolean; durationMs: number }
  | { kind: 'turn-end'; messageId: string; usage: { input: number; output: number } }
  | { kind: 'approval-request'; requestId: string; tool: string; input: unknown }
  | { kind: 'ask-question'; requestId: string; questions: AskQuestion[] }
  | { kind: 'error'; message: string; recoverable: boolean }
  | { kind: 'aborted' };

// Wrapped at the IPC boundary so the renderer can demux per-channel.
export interface ClaudeEventEnvelope {
  channelId: string;
  event: ClaudeEvent;
}
