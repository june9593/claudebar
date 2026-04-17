import { useState } from 'react';
import type { Session } from '../hooks/useClawChat';
import { formatSessionName, timeAgo } from '../utils/format';

interface SessionsViewProps {
  sessions: Session[];
  currentSessionKey: string;
  onSwitchSession: (key: string) => void;
  onNewChat: () => void;
  onNavigateToChat: () => void;
}

function extractAgentFromKey(key: string): string {
  // Keys look like "agent:daily:main" or "agent:jiaming:clawbar-123"
  const parts = key.split(':');
  if (parts.length >= 2) return parts[1];
  return '';
}

export function SessionsView({
  sessions,
  currentSessionKey,
  onSwitchSession,
  onNewChat,
  onNavigateToChat,
}: SessionsViewProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const handleSelect = (key: string) => {
    onSwitchSession(key);
    onNavigateToChat();
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px 8px',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          Sessions
        </span>
        <button
          onClick={onNewChat}
          style={{
            padding: '4px 12px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--color-accent)',
            color: 'var(--color-bubble-user-text)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          + New
        </button>
      </div>

      {/* Sessions list */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {sessions.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
          }}>
            No sessions found
          </div>
        ) : (
          sessions.map((session) => {
            const isCurrent = session.key === currentSessionKey;
            const isHovered = hoveredKey === session.key;
            const agent = session.kind || extractAgentFromKey(session.key);

            return (
              <div
                key={session.key}
                onClick={() => handleSelect(session.key)}
                onMouseEnter={() => setHoveredKey(session.key)}
                onMouseLeave={() => { setHoveredKey(null); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isCurrent
                    ? 'var(--color-surface-active)'
                    : isHovered
                      ? 'var(--color-surface-hover)'
                      : 'transparent',
                  borderLeft: isCurrent ? '3px solid var(--color-accent)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Session info */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: isCurrent ? 600 : 400,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {formatSessionName(session)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {agent && (
                      <span style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-tertiary)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'var(--color-bg-tertiary)',
                      }}>
                        {agent}
                      </span>
                    )}
                    {session.updatedAt && (
                      <span style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--color-text-tertiary)',
                      }}>
                        {timeAgo(session.updatedAt)}
                      </span>
                    )}
                  </div>
                  {/* Session key in small mono */}
                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: 0.7,
                  }}>
                    {session.key}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
