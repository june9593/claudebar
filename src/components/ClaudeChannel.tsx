import { ChatView, type SlashCommand } from './ChatView';
import { useClaudeSession } from '../hooks/useClaudeSession';
import type { ClaudeChannelDef } from '../types';

interface Props {
  channel: ClaudeChannelDef;
  isActive: boolean;
}

// Friendly descriptions for the well-known built-in commands. Anything not
// in this map (custom skills, plugin commands) shows the bare command name.
const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  '/clear':           'Start a new conversation',
  '/compact':         'Summarise + truncate conversation history',
  '/context':         'Show context-window usage breakdown',
  '/cost':            'Show session cost',
  '/help':            'List built-in slash commands',
  '/init':            'Generate or update CLAUDE.md for this project',
  '/model':           'Show or change the model',
  '/review':          'Run code review on the current branch',
  '/security-review': 'Run a security audit on pending changes',
  '/usage':           'Show token / API usage',
  '/insights':        'Show session insights',
  '/heapdump':        'Capture a V8 heap dump',
};

// Anthropic / Claude brand mark — eight-pointed asterisk in Claude orange.
function ClaudeMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#cc785c" aria-hidden="true">
      <path d="M12 2 L13.2 9 L19.5 5.5 L16 11.8 L23 12 L16 12.2 L19.5 18.5 L13.2 15 L12 22 L10.8 15 L4.5 18.5 L8 12.2 L1 12 L8 11.8 L4.5 5.5 L10.8 9 Z" />
    </svg>
  );
}

export function ClaudeChannel({ channel, isActive }: Props) {
  const chat = useClaudeSession(channel.id, channel.projectDir, channel.sessionId, channel.projectKey);

  // Build the SlashCommand list from whatever the CLI advertised in its init
  // event; falls back to a small hard-coded set so the popover isn't empty
  // before the first turn has run.
  const slashCommands: SlashCommand[] = (chat.availableCommands.length > 0
    ? chat.availableCommands
    : Object.keys(BUILTIN_DESCRIPTIONS)
  ).map((name) => ({
    name,
    description: BUILTIN_DESCRIPTIONS[name] ?? '',
  }));

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
        assistantAvatar={<ClaudeMark size={16} />}
        emptyStateGlyph={<ClaudeMark size={36} />}
        slashCommands={slashCommands}
        activity={chat.activity}
        onInterrupt={() => {
          window.electronAPI?.claude?.interrupt(channel.id).catch(() => { /* ignore */ });
        }}
      />
    </div>
  );
}
