import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChatStore } from '../stores/chatStore';

export function ChatInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isSending = useChatStore((s) => s.isSending);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  const isDisabled = connectionStatus !== 'connected' || isSending;
  const canSend = text.trim().length > 0 && !isDisabled;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSend = async () => {
    if (!canSend) return;
    const msg = text;
    setText('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder = connectionStatus !== 'connected'
    ? '请先在设置中配置 OpenClaw CLI'
    : isSending
      ? '等待回复中...'
      : '输入消息，Enter 发送...';

  return (
    <div
      className="flex items-end gap-2 px-3 py-2.5 shrink-0"
      style={{
        borderTop: '1px solid var(--color-border-secondary)',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
        className="flex-1 resize-none outline-none text-sm py-2 px-3 rounded-lg"
        style={{
          backgroundColor: 'var(--color-bg-input)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-primary)',
          fontFamily: 'var(--font-sans)',
          maxHeight: '120px',
          minHeight: '36px',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-focus)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-primary)')}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 text-white text-sm transition-opacity"
        style={{
          backgroundColor: canSend ? 'var(--color-surface-user-bubble)' : 'var(--color-text-tertiary)',
          opacity: canSend ? 1 : 0.5,
          cursor: canSend ? 'pointer' : 'default',
        }}
      >
        ↑
      </button>
    </div>
  );
}
