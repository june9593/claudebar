import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export function TitleBar() {
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
      {/* Left: status + identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
          flexShrink: 0,
          boxShadow: hasGateway
            ? '0 0 6px rgba(52, 199, 89, 0.4)'
            : '0 0 6px rgba(255, 59, 48, 0.4)',
        }} />
        <span style={{ fontSize: '16px', lineHeight: 1 }}>🦞</span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.16px',
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.828 3.172a.5.5 0 0 0-.707 0l-.586.586L6.95 2.172a.5.5 0 0 0-.707.707l.586.586-2.829 2.829a.5.5 0 0 0 0 .707l2 2a.5.5 0 0 0 .707 0L9.536 6.17l.586.586a.5.5 0 0 0 .707-.707L9.243 4.464l.585-.585a.5.5 0 0 0 0-.707zM5.5 10.5l-2 2" />
            {pinned && <circle cx="5" cy="11" r="1.5" />}
          </svg>
        </TitleButton>
        <TitleButton
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          active={view === 'settings'}
          title="设置"
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="3" />
            <path d="M10 1.5v2M10 16.5v2M3.05 3.05l1.414 1.414M15.536 15.536l1.414 1.414M1.5 10h2M16.5 10h2M3.05 16.95l1.414-1.414M15.536 4.464l1.414-1.414" />
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
