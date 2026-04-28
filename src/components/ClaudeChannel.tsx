import { ChatView } from './ChatView';
import { useClaudeSession } from '../hooks/useClaudeSession';
import type { ClaudeChannelDef } from '../types';

interface Props {
  channel: ClaudeChannelDef;
  isActive: boolean;
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
      />
    </div>
  );
}
