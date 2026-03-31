import { useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const setView = useChatStore((s) => s.setView);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const isDisconnected = connectionStatus !== 'connected';

  return (
    <div
      className="flex-1 overflow-y-auto py-3 space-y-2"
      style={{ backgroundColor: 'var(--color-bg-chat)' }}
    >
      {messages.length === 0 && !isTyping && (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <span className="text-3xl">🦞</span>
          </div>

          {isDisconnected ? (
            <>
              <div className="text-center space-y-1.5">
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  未连接到 OpenClaw
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  请确保已安装 OpenClaw CLI 并在设置中配置正确的路径
                </p>
              </div>
              <button
                onClick={() => setView('settings')}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-surface-user-bubble)',
                  color: '#fff',
                }}
              >
                打开设置
              </button>
            </>
          ) : (
            <div className="text-center space-y-1">
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                欢迎使用 ClawBar
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                发送一条消息开始对话
              </p>
            </div>
          )}
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
