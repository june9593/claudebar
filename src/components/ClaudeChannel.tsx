import { ChatView, type SlashCommand } from './ChatView';
import { useClaudeSession } from '../hooks/useClaudeSession';
import { ClaudeInstallGuide } from './claude/ClaudeInstallGuide';
import { ToolApprovalPrompt } from './claude/ToolApprovalPrompt';
import { AskUserQuestionPrompt } from './claude/AskUserQuestionPrompt';
import type { ClaudeSession } from '../types';

interface Props {
  channel: ClaudeSession;
  isActive: boolean;
}

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

// Anthropic's Claude Code mark — orange 12-rayed sunburst.
function ClaudeMark({ size = 16 }: { size?: number }) {
  // 12 rays, 30° apart, tapered. Rendered via rotated rectangles around (50,50).
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="#cc785c" aria-hidden="true">
      {rays.map((deg) => (
        <path
          key={deg}
          // A pointed petal: wide at the center, tapered at the tip.
          // Coordinates are in the "vertical, pointing up from center" frame
          // and rotated into place around (50,50).
          d="M 47 50 L 49 8 L 51 8 L 53 50 Z"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      {/* Filled center disc to anchor the rays */}
      <circle cx="50" cy="50" r="6" />
    </svg>
  );
}

export function ClaudeChannel({ channel, isActive }: Props) {
  const chat = useClaudeSession(channel.id, channel.projectDir, channel.sessionId, channel.projectKey);

  const slashCommands: SlashCommand[] = (chat.availableCommands.length > 0
    ? chat.availableCommands
    : Object.keys(BUILTIN_DESCRIPTIONS)
  ).map((name) => ({
    name,
    description: BUILTIN_DESCRIPTIONS[name] ?? '',
  }));

  const containerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    visibility: isActive ? 'visible' : 'hidden',
    pointerEvents: isActive ? 'auto' : 'none',
    zIndex: isActive ? 1 : 0,
    display: 'flex', flexDirection: 'column',
  };

  if (chat.cliMissing) {
    return (
      <div style={containerStyle}>
        <ClaudeInstallGuide onRecheck={chat.recheckCli} />
      </div>
    );
  }

  const pendingPrompt = chat.pendingApproval ? (
    <ToolApprovalPrompt
      tool={chat.pendingApproval.tool}
      input={chat.pendingApproval.input}
      onResolve={chat.approve}
    />
  ) : chat.pendingAsk ? (
    <AskUserQuestionPrompt
      questions={chat.pendingAsk.questions}
      onSubmit={chat.answer}
    />
  ) : null;

  return (
    <div style={containerStyle}>
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
        pendingApprovals={[]}
        resolveApproval={() => {}}
        assistantAvatar={<ClaudeMark size={16} />}
        emptyStateGlyph={<ClaudeMark size={36} />}
        slashCommands={slashCommands}
        pendingPrompt={pendingPrompt}
        onInterrupt={chat.abort}
      />
    </div>
  );
}
