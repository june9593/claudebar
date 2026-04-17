import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, ChevronDown } from 'lucide-react';
import { ChatHistory } from './ChatHistory';
import { ApprovalCard, type ApprovalRequest, type ApprovalDecision } from './ApprovalCard';
import { LobsterIcon } from './LobsterIcon';
import type { Session } from '../hooks/useClawChat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatViewProps {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  sessions: Session[];
  currentSessionKey: string;
  switchSession: (key: string) => void;
  createSession: () => void;
  deleteSession: (key: string) => void;
  pendingApprovals: ApprovalRequest[];
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function ChatView({
  messages, isConnected, isTyping, sendMessage,
  sessions, currentSessionKey, switchSession, createSession, deleteSession,
  pendingApprovals, resolveApproval,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [agentEmoji, setAgentEmoji] = useState<string>('🦞');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch agent identity for avatar
  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api || !isConnected) return;

    let reqId = '';
    const unsub = api.onResponse((resp) => {
      if (resp.id !== reqId || !resp.ok) return;
      const p = resp.payload as { avatar?: string; emoji?: string } | undefined;
      if (p) {
        if (p.emoji) setAgentEmoji(p.emoji);
        else if (p.avatar && !p.avatar.startsWith('/')) setAgentEmoji(p.avatar);
      }
      unsub();
    });

    const parts = currentSessionKey.split(':');
    const agentId = parts.length >= 2 ? parts[1] : 'daily';
    api.send('agent.identity.get', { agentId }).then(r => {
      if (r.ok && r.id) reqId = r.id;
      else unsub();
    }).catch(() => unsub());

    const timer = setTimeout(unsub, 5000);
    return () => { clearTimeout(timer); unsub(); };
  }, [isConnected, currentSessionKey]);

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

  const isEmpty = messages.length === 0;
  const hasInput = input.trim().length > 0;

  return (
    <>
      <ChatHistory
        sessions={sessions}
        currentSessionKey={currentSessionKey}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
        onNewChat={createSession}
      />

      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px 14px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          position: 'relative',
        }}
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} agentEmoji={agentEmoji} />
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {pendingApprovals.length > 0 && (
        <div style={{
          padding: '8px 14px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderTop: '0.5px solid var(--color-border-primary)',
        }}>
          {pendingApprovals.map(a => (
            <ApprovalCard key={a.id} approval={a} onResolve={resolveApproval} />
          ))}
        </div>
      )}

      <div style={{
        padding: '8px 12px 10px',
        borderTop: '0.5px solid var(--color-border-primary)',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
      }}>
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
            overflow: 'hidden',
            transition: 'background 0.15s',
          }}
        />

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
          }}
          title="Send"
        >
          <ArrowUp size={18} strokeWidth={2} />
        </button>
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: '58px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-secondary)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'background 0.15s',
          }}
          title="Scroll to bottom"
        >
          <ChevronDown size={18} strokeWidth={2} />
        </button>
      )}
    </>
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
        <LobsterIcon size={36} />
      </div>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: '17px',
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        lineHeight: 1.20,
      }}>
        Start a conversation
      </span>
      <span style={{
        fontSize: '13px',
        color: 'var(--color-text-secondary)',
        lineHeight: 1.33,
      }}>
        Send a message to your OpenClaw agent
      </span>
      <span style={{
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        lineHeight: 1.33,
        marginTop: '4px',
      }}>
        ⏎ send · ⇧⏎ newline
      </span>
    </div>
  );
}

function MessageBubble({ message, agentEmoji }: {
  message: ChatMessage;
  agentEmoji?: string;
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
            overflow: 'hidden',
          }}>
            {agentEmoji || '🦞'}
          </div>
        )}

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
            fontFamily: 'var(--font-sans)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </div>

      <span style={{
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        marginTop: '3px',
        paddingLeft: isUser ? undefined : '34px',
        paddingRight: isUser ? '4px' : undefined,
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
        <LobsterIcon size={18} />
      </div>
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
