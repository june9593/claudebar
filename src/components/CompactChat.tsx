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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
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
  const hasInput = input.trim().length > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg-chat)',
      position: 'relative',
    }}>
      {/* Error banner — subtle, non-blocking */}
      {error && (
        <div style={{
          padding: '5px 14px',
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-status-disconnected)',
          background: 'var(--color-bg-secondary)',
          textAlign: 'center',
          letterSpacing: '-0.08px',
          lineHeight: 1.33,
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}>
          {error}
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '14px 14px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
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
        {/* Classic toggle pill — Apple 980px radius */}
        <button
          onClick={() => updateSetting('chatMode', 'classic')}
          style={{
            padding: '3px 10px',
            borderRadius: '980px',
            border: '1px solid var(--color-border-primary)',
            background: 'transparent',
            color: 'var(--color-text-tertiary)',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.08px',
            lineHeight: 1.33,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            marginBottom: '3px',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          title="Switch to classic view"
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
            border: 'none',
            borderRadius: '18px',
            padding: '8px 14px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-primary)',
            background: 'var(--color-bg-input)',
            outline: 'none',
            lineHeight: 1.47,
            letterSpacing: '-0.16px',
            overflow: 'hidden',
            transition: 'background 0.15s',
          }}
        />

        {/* Send button — 32px circle */}
        <button
          onClick={handleSend}
          disabled={!hasInput}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: hasInput ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            color: hasInput ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: hasInput ? 'pointer' : 'default',
            flexShrink: 0,
            marginBottom: '3px',
            transition: 'background 0.2s, color 0.2s, transform 0.1s',
            fontSize: '16px',
            fontWeight: 600,
            letterSpacing: '-0.16px',
          }}
          title="Send"
        >
          ↑
        </button>
      </div>

      {/* Connection status dot */}
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
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    }}>
      {/* 🦞 in a 64px rounded container */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '18px',
        background: 'var(--color-bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        marginBottom: '4px',
      }}>
        🦞
      </div>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: '17px',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        letterSpacing: '-0.374px',
        lineHeight: 1.24,
      }}>
        Start a conversation
      </span>
      <span style={{
        fontSize: '13px',
        color: 'var(--color-text-secondary)',
        letterSpacing: '-0.08px',
        lineHeight: 1.33,
      }}>
        Send a message to your OpenClaw agent
      </span>
      <span style={{
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        letterSpacing: '-0.08px',
        lineHeight: 1.33,
        marginTop: '4px',
      }}>
        ⏎ send · ⇧⏎ newline
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
        {/* Assistant avatar — 🦞 in 28px circle */}
        {!isUser && (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--color-bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '15px',
            lineHeight: 1,
          }}>
            🦞
          </div>
        )}

        {/* Bubble */}
        <div
          className={isUser ? 'message-content' : 'prose message-content'}
          style={{
            padding: '10px 14px',
            borderRadius: isUser
              ? '18px 18px 4px 18px'
              : '18px 18px 18px 4px',
            background: isUser
              ? 'var(--color-bubble-user)'
              : 'var(--color-bubble-assistant)',
            color: isUser
              ? 'var(--color-bubble-user-text)'
              : 'var(--color-bubble-assistant-text)',
            fontSize: '14px',
            lineHeight: 1.47,
            letterSpacing: '-0.16px',
            fontFamily: 'var(--font-sans)',
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
        marginTop: '3px',
        paddingLeft: isUser ? undefined : '34px',
        paddingRight: isUser ? '4px' : undefined,
        letterSpacing: '-0.08px',
        lineHeight: 1.33,
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
      {/* Avatar */}
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'var(--color-bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '15px',
        lineHeight: 1,
      }}>
        🦞
      </div>
      {/* Typing bubble — assistant style */}
      <div style={{
        padding: '10px 16px',
        borderRadius: '18px 18px 18px 4px',
        background: 'var(--color-bubble-assistant)',
        display: 'flex',
        gap: '5px',
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
