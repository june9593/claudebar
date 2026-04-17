import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useClawChat } from '../hooks/useClawChat';
import { Sidebar, type NavId } from './Sidebar';
import { UsageView } from './UsageView';
import { SessionsView } from './SessionsView';
import { CronView } from './CronView';
import { AgentsView } from './AgentsView';
import { SkillsView } from './SkillsView';
import { LogsView } from './LogsView';
import { ApprovalsView } from './ApprovalsView';
import { OverviewView } from './OverviewView';
import { ChatView } from './ChatView';

interface CompactChatProps {
  sidebarOpen: boolean;
  onSidebarClose: () => void;
}

export function CompactChat({ sidebarOpen, onSidebarClose }: CompactChatProps) {
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const authToken = useSettingsStore((s) => s.authToken);
  const setView = useSettingsStore((s) => s.setView);
  const chat = useClawChat(gatewayUrl, authToken);
  const [activeNav, setActiveNav] = useState<NavId>('chat');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg-chat)',
      position: 'relative',
    }}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={onSidebarClose}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onOpenSettings={() => setView('settings')}
      />

      {/* Connection status banner */}
      {chat.error ? (
        <ConnectionBanner color="var(--color-status-disconnected)" text={chat.error} />
      ) : !chat.isConnected ? (
        <ConnectionBanner color="var(--color-status-connecting)" text="正在连接 Gateway..." />
      ) : null}

      <ViewRouter
        activeNav={activeNav}
        onNavigateToChat={() => setActiveNav('chat')}
        chat={chat}
      />
    </div>
  );
}

function ConnectionBanner({ color, text }: { color: string; text: string }) {
  return (
    <div style={{
      padding: '8px 14px',
      fontSize: '12px',
      fontFamily: 'var(--font-sans)',
      color,
      background: 'var(--color-bg-secondary)',
      textAlign: 'center',
      lineHeight: 1.33,
      borderBottom: '0.5px solid var(--color-border-primary)',
    }}>
      {text}
    </div>
  );
}

function ViewRouter({
  activeNav,
  onNavigateToChat,
  chat,
}: {
  activeNav: NavId;
  onNavigateToChat: () => void;
  chat: ReturnType<typeof useClawChat>;
}) {
  switch (activeNav) {
    case 'chat':
      return (
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
      );
    case 'approvals':
      return (
        <ApprovalsView
          pendingApprovals={chat.pendingApprovals}
          resolvedApprovals={chat.resolvedApprovals}
          resolveApproval={chat.resolveApproval}
        />
      );
    case 'sessions':
      return (
        <SessionsView
          sessions={chat.sessions}
          currentSessionKey={chat.currentSessionKey}
          onSwitchSession={chat.switchSession}
          onNewChat={chat.createSession}
          onNavigateToChat={onNavigateToChat}
        />
      );
    case 'usage': return <UsageView />;
    case 'cron': return <CronView />;
    case 'agents': return <AgentsView />;
    case 'skills': return <SkillsView />;
    case 'logs': return <LogsView />;
    case 'overview':
    default:
      return <OverviewView />;
  }
}
