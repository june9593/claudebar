import { useState, useRef, useEffect } from 'react';
import type { Session } from '../hooks/useClawChat';
import { formatSessionName } from '../utils/format';

interface ChatHistoryProps {
  sessions: Session[];
  currentSessionKey: string;
  onSwitchSession: (key: string) => void;
  onDeleteSession: (key: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({
  sessions,
  currentSessionKey,
  onSwitchSession,
  onDeleteSession,
  onNewChat,
}: ChatHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const currentLabel = formatSessionName(
    sessions.find(s => s.key === currentSessionKey) || { key: currentSessionKey },
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '32px',
        padding: '0 14px',
        borderBottom: '0.5px solid var(--color-border-secondary)',
        background: 'var(--color-bg-secondary)',
      }}>
        {/* Session label — clickable */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.33,
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: '2px 4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
          }}
        >
          {currentLabel}
          <span style={{
            fontSize: '10px',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}>▾</span>
        </button>

        {/* New chat button */}
        <button
          onClick={onNewChat}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 400,
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s, color 0.15s',
          }}
          title="New chat"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-hover)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-tertiary)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
        >
          +
        </button>
      </div>

      {/* Session dropdown */}
      {isOpen && sessions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '32px',
          left: '8px',
          right: '8px',
          background: 'var(--color-bg-secondary)',
          borderRadius: '8px',
          border: '1px solid var(--color-border-secondary)',
          boxShadow: '0px 0px 0px 1px var(--color-border-primary), var(--shadow-card)',
          zIndex: 100,
          maxHeight: '240px',
          overflowY: 'auto',
          padding: '4px',
        }}>
          {sessions.map(session => {
            const isActive = session.key === currentSessionKey;
            const isHovered = session.key === hoveredKey;

            return (
              <div
                key={session.key}
                onMouseEnter={() => setHoveredKey(session.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: isActive
                    ? 'var(--color-surface-active)'
                    : isHovered
                      ? 'var(--color-surface-hover)'
                      : 'transparent',
                  transition: 'background 0.12s',
                  gap: '6px',
                }}
                onClick={() => {
                  onSwitchSession(session.key);
                  setIsOpen(false);
                }}
              >
                {/* Active indicator dot */}
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: isActive ? 'var(--color-accent)' : 'transparent',
                  flexShrink: 0,
                }} />

                {/* Session name */}
                <span style={{
                  flex: 1,
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  color: isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  lineHeight: 1.33,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {formatSessionName(session)}
                </span>

                {/* Delete button — visible on hover */}
                {isHovered && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.key);
                      if (sessions.length <= 1) setIsOpen(false);
                    }}
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'color 0.12s, background 0.12s',
                    }}
                    title="Delete session"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--color-status-disconnected)';
                      e.currentTarget.style.background = 'var(--color-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
