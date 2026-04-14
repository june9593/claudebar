import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useClawChat } from '../hooks/useClawChat';

export function CompactChat() {
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const authToken = useSettingsStore((s) => s.authToken);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const { messages, isConnected, isTyping, sendMessage, error } = useClawChat(gatewayUrl, authToken);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; // max ~4 lines
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--color-bg-chat)',
    }}>
      {/* Connection status bar */}
      {error && (
        <div style={{
          padding: '6px 12px',
          fontSize: '11px',
          color: 'var(--color-status-disconnected)',
          background: 'var(--color-bg-secondary)',
          textAlign: 'center',
          letterSpacing: '-0.08px',
        }}>
          {error}
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        padding: '12px 14px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} formatTime={formatTime} />
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '8px 12px 10px',
        borderTop: '0.5px solid var(--color-border-primary)',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
      }}>
        {/* Classic toggle pill */}
        <button
          onClick={() => updateSetting('chatMode', 'classic')}
          style={{
            padding: '4px 10px',
            borderRadius: '12px',
            border: '1px solid var(--color-border-primary)',
            background: 'transparent',
            color: 'var(--color-text-tertiary)',
            fontSize: '11px',
            fontFamily: 'inherit',
            letterSpacing: '-0.08px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            marginBottom: '2px',
            transition: 'color 0.15s',
          }}
          title="切换到经典界面"
        >
          Classic ↗
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--color-border-primary)',
            borderRadius: '18px',
            padding: '8px 14px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-primary)',
            background: 'var(--color-bg-input)',
            outline: 'none',
            lineHeight: 1.4,
            letterSpacing: '-0.16px',
            overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-primary)')}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: input.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            color: input.trim() ? '#fff' : 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() ? 'pointer' : 'default',
            flexShrink: 0,
            marginBottom: '2px',
            transition: 'background 0.15s, color 0.15s',
            fontSize: '16px',
          }}
          title="发送"
        >
          ↑
        </button>
      </div>

      {/* Status dot */}
      {!error && (
        <div style={{
          position: 'absolute',
          bottom: '14px',
          right: '58px',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isConnected
            ? 'var(--color-status-connected)'
            : 'var(--color-status-disconnected)',
          transition: 'background 0.3s',
        }} />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '10px',
      opacity: 0.7,
    }}>
      <span style={{ fontSize: '40px' }}>🦞</span>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        letterSpacing: '-0.2px',
      }}>
        Start a conversation
      </span>
      <span style={{
        fontSize: '13px',
        color: 'var(--color-text-tertiary)',
        letterSpacing: '-0.08px',
      }}>
        Send a message to your OpenClaw agent
      </span>
    </div>
  );
}

function MessageBubble({ message, formatTime }: {
  message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string };
  formatTime: (ts: string) => string;
}) {
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '6px',
        maxWidth: '85%',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {/* Avatar for assistant */}
        {!isUser && (
          <span style={{
            fontSize: '18px',
            lineHeight: 1,
            flexShrink: 0,
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            🦞
          </span>
        )}

        {/* Bubble */}
        <div
          className={isUser ? undefined : 'prose message-content'}
          style={{
            padding: '8px 14px',
            borderRadius: '18px',
            background: isUser
              ? 'var(--color-bubble-user)'
              : 'var(--color-bubble-assistant)',
            color: isUser
              ? 'var(--color-bubble-user-text)'
              : 'var(--color-bubble-assistant-text)',
            fontSize: '14px',
            lineHeight: 1.45,
            letterSpacing: '-0.16px',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </div>

      {/* Timestamp */}
      <span style={{
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        marginTop: '2px',
        padding: isUser ? '0 4px 0 0' : '0 0 0 30px',
        letterSpacing: '-0.08px',
      }}>
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '6px',
    }}>
      <span style={{
        fontSize: '18px', lineHeight: 1, flexShrink: 0,
        width: '24px', height: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        🦞
      </span>
      <div style={{
        padding: '10px 16px',
        borderRadius: '18px',
        background: 'var(--color-bubble-assistant)',
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--color-text-tertiary)',
              animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
