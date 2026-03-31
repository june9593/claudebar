import { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div
      className="flex-1 overflow-y-auto py-3 space-y-2"
      style={{ backgroundColor: 'var(--color-bg-chat)' }}
    >
      {messages.length === 0 && !isTyping && (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
          <span className="text-4xl">🦞</span>
          <p
            className="text-center text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            欢迎使用 ClawBar
          </p>
          <p
            className="text-center text-xs"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            发送一条消息开始对话
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isTyping && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
