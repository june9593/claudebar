import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

interface TitleBarProps {
  onToggleSidebar?: () => void;
}

export function TitleBar({ onToggleSidebar }: TitleBarProps) {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const [pinned, setPinned] = useState(false);

  const handleTogglePin = async () => {
    try {
      const newState = await window.electronAPI?.window?.togglePin();
      setPinned(!!newState);
    } catch {
      setPinned(!pinned);
    }
  };

  const hasGateway = !!gatewayUrl;

  return (
    <div
      className="titlebar-drag"
      style={{
        height: 'var(--title-bar-height)',
        minHeight: 'var(--title-bar-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        background: 'var(--color-surface-title-bar)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '0.5px solid var(--color-border-primary)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: hamburger + status + identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Hamburger menu button */}
        {onToggleSidebar && (
          <div className="titlebar-no-drag">
            <TitleButton
              onClick={onToggleSidebar}
              title="Menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </TitleButton>
          </div>
        )}
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '16px', lineHeight: 1 }}>🦞</span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          ClawBar
        </span>
      </div>

      {/* Right buttons */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
        <TitleButton
          onClick={handleTogglePin}
          active={pinned}
          title={pinned ? '取消置顶' : '置顶'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z" />
          </svg>
        </TitleButton>
        <TitleButton
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          active={view === 'settings'}
          title="设置"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </TitleButton>
      </div>
    </div>
  );
}

function TitleButton({ children, onClick, active, title }: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--color-surface-active)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--color-surface-hover)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-tertiary)';
        }
      }}
    >
      {children}
    </button>
  );
}
