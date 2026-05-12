// Stub — Phase 2 will implement the full session history panel
import type { Session } from '../hooks/useClaudeSession';

interface ChatHistoryProps {
  sessions: Session[];
  currentSessionKey: string;
  onSwitchSession: (key: string) => void;
  onDeleteSession: (key: string) => void;
  onNewChat: () => void;
}

export function ChatHistory(_props: ChatHistoryProps) {
  return null;
}
