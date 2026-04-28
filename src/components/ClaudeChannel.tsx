import { ChatView, type SlashCommand } from './ChatView';
import { useClaudeSession } from '../hooks/useClaudeSession';
import type { ClaudeChannelDef } from '../types';

interface Props {
  channel: ClaudeChannelDef;
  isActive: boolean;
}

// Built-in Claude Code slash commands. Static — there's no public API to
// enumerate them at runtime. Keep this list in sync with `claude` releases.
const CLAUDE_SLASH_COMMANDS: SlashCommand[] = [
  { name: '/clear',           description: 'Start a new conversation' },
  { name: '/compact',         description: 'Summarise + truncate conversation history' },
  { name: '/context',         description: 'Show context-window usage breakdown' },
  { name: '/cost',            description: 'Show session cost' },
  { name: '/help',            description: 'List built-in slash commands' },
  { name: '/init',            description: 'Generate or update CLAUDE.md for this project' },
  { name: '/model',           description: 'Show or change the model' },
  { name: '/review',          description: 'Run code review on the current branch' },
  { name: '/security-review', description: 'Run a security audit on pending changes' },
  { name: '/usage',           description: 'Show token / API usage' },
];

// Claude brand sparkle — used as the assistant avatar inside the chat.
function ClaudeSparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="#cc785c" aria-hidden="true">
      <path d="M16 2 L19 13 L30 16 L19 19 L16 30 L13 19 L2 16 L13 13 Z" />
    </svg>
  );
}

export function ClaudeChannel({ channel, isActive }: Props) {
  const chat = useClaudeSession(channel.id, channel.projectDir, channel.sessionId, channel.projectKey);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      visibility: isActive ? 'visible' : 'hidden',
      pointerEvents: isActive ? 'auto' : 'none',
      zIndex: isActive ? 1 : 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <ChatView
        messages={chat.messages}
        isConnected={chat.isConnected}
        isTyping={chat.isTyping}
        sendMessage={chat.sendMessage}
        sessions={chat.sessions}
        currentSessionKey={chat.currentSessionKey}
        switchSession={chat.switchSession}
        createSession={chat.createSession}
        deleteSession={chat.deleteSession}
        pendingApprovals={chat.pendingApprovals}
        resolveApproval={chat.resolveApproval}
        assistantAvatar={<ClaudeSparkle size={16} />}
        emptyStateGlyph={<ClaudeSparkle size={36} />}
        slashCommands={CLAUDE_SLASH_COMMANDS}
        onInterrupt={() => {
          window.electronAPI?.claude?.interrupt(channel.id).catch(() => { /* ignore */ });
        }}
      />
    </div>
  );
}
