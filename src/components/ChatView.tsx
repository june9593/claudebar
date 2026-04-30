import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, ChevronDown, Square } from 'lucide-react';
import { ChatHistory } from './ChatHistory';
import { ApprovalCard, type ApprovalRequest, type ApprovalDecision } from './ApprovalCard';
import { LobsterIcon } from './LobsterIcon';
import { ToolCallPill } from './claude/ToolCallPill';
import type { Session } from '../hooks/useClawChat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  tool?: {
    callId: string;
    name: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
    durationMs?: number;
    startedAt: number;
  };
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
  /** Optional override for the assistant avatar; if set, the OpenClaw
   *  agent-identity fetch is skipped and this glyph is rendered instead.
   *  Used by the Claude channel to show a Claude sparkle rather than 🦞. */
  assistantAvatar?: React.ReactNode;
  /** Optional override for the empty-state badge; mirrors `assistantAvatar`. */
  emptyStateGlyph?: React.ReactNode;
  /** When provided AND `isTyping` is true, the send button becomes a stop
   *  button that calls this handler instead of sending. */
  onInterrupt?: () => void;
  /** When set, typing `/` at the start of the input shows an autocomplete
   *  popover with these commands. Used by the Claude channel to surface
   *  Claude Code's built-in slash commands. */
  slashCommands?: SlashCommand[];
  /** Optional inline status pill rendered just above the typing indicator
   *  (e.g. "Thinking…" or "Running Bash"). Used by Claude channel. */
  activity?: { kind: 'thinking' | 'tool'; label: string } | null;
  /** Inline interactive prompt rendered above the composer. When set, the
   *  composer is disabled. Used by the Claude channel for tool approval and
   *  AskUserQuestion prompts. */
  pendingPrompt?: React.ReactNode;
}

export interface SlashCommand {
  name: string;       // e.g. "/context"
  description: string;
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
  assistantAvatar, emptyStateGlyph, onInterrupt,
  slashCommands, activity, pendingPrompt,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);

  // Slash autocomplete: only triggers when channel provided commands AND
  // the input starts with `/` and contains no whitespace yet. Matching is
  // fuzzy: a query is a *subsequence* of the command name in order, so
  // typing "power" matches "/superpower" or "/superpowers:writing-plans".
  const slashMatches = (() => {
    if (!slashCommands || slashCommands.length === 0) return [];
    if (!input.startsWith('/')) return [];
    if (/\s/.test(input)) return [];
    const q = input.slice(1).toLowerCase();
    if (q.length === 0) return slashCommands.slice(0, 12);
    const scored = slashCommands
      .map((c) => {
        const name = c.name.slice(1).toLowerCase();
        // Score: -∞ if not a subsequence; otherwise lower (better) for tighter
        // matches (later last-match position penalised; prefix bonus).
        let i = 0, j = 0, lastMatch = -1;
        while (i < q.length && j < name.length) {
          if (q[i] === name[j]) {
            if (lastMatch === -1) lastMatch = j;
            i++;
          }
          j++;
        }
        if (i < q.length) return { c, score: -1 };
        const prefixBonus = name.startsWith(q) ? -1000 : 0;
        return { c, score: prefixBonus + lastMatch + name.length * 0.1 };
      })
      .filter((x) => x.score >= 0 || x.score < -500)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((x) => x.c);
    return scored;
  })();
  const slashOpen = slashMatches.length > 0;

  // Reset highlighted index when the match list changes shape.
  useEffect(() => {
    setSlashIdx(0);
  }, [slashMatches.length, input.startsWith('/')]);
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
    // If the embedding channel supplied its own avatar (e.g. Claude), skip the
    // OpenClaw-specific agent-identity WebSocket fetch entirely.
    if (assistantAvatar !== undefined) return;
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
  }, [isConnected, currentSessionKey, assistantAvatar]);

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
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIdx((i) => Math.min(i + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const picked = slashMatches[slashIdx];
        if (picked) setInput(picked.name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }
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
          <EmptyState glyph={emptyStateGlyph} />
        ) : (
          <>
            {messages.map((msg) => (
              msg.role === 'tool' && msg.tool ? (
                <ToolCallPill key={msg.id} tool={msg.tool} />
              ) : (
                <MessageBubble key={msg.id} message={msg} agentEmoji={agentEmoji} avatarOverride={assistantAvatar} />
              )
            ))}
            {activity && (
              <div style={{
                display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                borderRadius: 12,
                background: 'var(--color-bg-secondary)',
                border: '0.5px solid var(--color-border-secondary)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                marginLeft: 34,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6, height: 6, borderRadius: '50%',
                  background: activity.kind === 'thinking' ? 'var(--color-status-warning, #c96442)' : 'var(--color-accent)',
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
                <span>{activity.kind === 'thinking' ? 'Thinking…' : `Running ${activity.label}`}</span>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
              </div>
            )}
            {isTyping && <TypingIndicator avatarOverride={assistantAvatar} />}
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

      {pendingPrompt && (
        <div style={{
          padding: '8px 14px 0',
          borderTop: '0.5px solid var(--color-border-primary)',
        }}>
          {pendingPrompt}
        </div>
      )}

      <div style={{
        padding: '8px 12px 10px',
        borderTop: '0.5px solid var(--color-border-primary)',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        position: 'relative',
      }}>
        {slashOpen && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 'calc(100% + 4px)',
              background: 'var(--color-bg-primary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-card)',
              padding: 4,
              zIndex: 50,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {slashMatches.map((cmd, i) => (
              <button
                key={cmd.name}
                onMouseDown={(e) => { e.preventDefault(); setInput(cmd.name); textareaRef.current?.focus(); }}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  width: '100%', padding: '6px 10px', borderRadius: 5,
                  border: 'none',
                  background: i === slashIdx ? 'var(--color-surface-active)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-accent)',
                  fontWeight: 500,
                }}>{cmd.name}</span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{cmd.description}</span>
              </button>
            ))}
            <div style={{
              padding: '4px 10px 2px',
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: 0.04,
            }}>
              ↑↓ navigate · ⏎/⇥ select · esc cancel
            </div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          disabled={!!pendingPrompt}
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
            opacity: pendingPrompt ? 0.5 : 1,
            outline: 'none',
            lineHeight: 1.47,
            overflow: 'hidden',
            transition: 'background 0.15s',
          }}
        />

        {isTyping && onInterrupt ? (
          <button
            onClick={onInterrupt}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'var(--color-status-disconnected)',
              color: 'var(--color-bubble-user-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginBottom: '3px',
              transition: 'background 0.2s, color 0.2s, transform 0.1s',
            }}
            title="Stop"
          >
            <Square size={12} strokeWidth={0} fill="currentColor" />
          </button>
        ) : (
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
        )}
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

function EmptyState({ glyph }: { glyph?: React.ReactNode }) {
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
        {glyph ?? <LobsterIcon size={36} />}
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

function MessageBubble({ message, agentEmoji, avatarOverride }: {
  message: ChatMessage;
  agentEmoji?: string;
  avatarOverride?: React.ReactNode;
}) {
  if (message.role === 'tool') return null; // rendered by ToolCallPill instead
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
            {avatarOverride ?? agentEmoji ?? '🦞'}
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

function TypingIndicator({ avatarOverride }: { avatarOverride?: React.ReactNode }) {
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
        {avatarOverride ?? <LobsterIcon size={18} />}
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
