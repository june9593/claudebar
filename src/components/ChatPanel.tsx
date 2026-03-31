import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SessionSwitcher } from './SessionSwitcher';
import { useChatStore } from '../stores/chatStore';

export function ChatPanel() {
  const view = useChatStore((s) => s.view);

  return (
    <div className="flex flex-col h-full">
      {view === 'session-switcher' && <SessionSwitcher />}
      <MessageList />
      <ChatInput />
    </div>
  );
}
