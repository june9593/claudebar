import { ChatView, type SlashCommand } from './ChatView';
import { useClaudeSession } from '../hooks/useClaudeSession';
import { ClaudeInstallGuide } from './claude/ClaudeInstallGuide';
import { ToolApprovalPrompt } from './claude/ToolApprovalPrompt';
import { AskUserQuestionPrompt } from './claude/AskUserQuestionPrompt';
import type { ClaudeChannelDef } from '../types';

interface Props {
  channel: ClaudeChannelDef;
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

function ClaudeMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#cc785c" aria-hidden="true">
      <path d="M12 2 L13.2 9 L19.5 5.5 L16 11.8 L23 12 L16 12.2 L19.5 18.5 L13.2 15 L12 22 L10.8 15 L4.5 18.5 L8 12.2 L1 12 L8 11.8 L4.5 5.5 L10.8 9 Z" />
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
