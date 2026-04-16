import { useState } from 'react';
import { Menu, Pin, PinOff, Settings } from 'lucide-react';
import { LobsterIcon } from './LobsterIcon';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '100%' }}>
        {/* Hamburger menu button */}
        {onToggleSidebar && (
          <div className="titlebar-no-drag">
            <TitleButton
              onClick={onToggleSidebar}
              title="Menu"
            >
              <Menu size={16} strokeWidth={1.75} />
            </TitleButton>
          </div>
        )}
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
          flexShrink: 0,
          display: 'inline-block',
        }} />
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <LobsterIcon size={18} />
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          lineHeight: 1,
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
          {pinned
            ? <PinOff size={14} strokeWidth={1.75} />
            : <Pin size={14} strokeWidth={1.75} />
          }
        </TitleButton>
        <TitleButton
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          active={view === 'settings'}
          title="设置"
        >
          <Settings size={15} strokeWidth={1.75} />
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
