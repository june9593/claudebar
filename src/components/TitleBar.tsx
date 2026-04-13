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
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        backgroundColor: 'var(--color-surface-title-bar)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--color-border-secondary)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: status dot + icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '15px', lineHeight: 1 }}>🦞</span>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em',
        }}>
          ClawBar
        </span>
      </div>

      {/* Right: Pin + Settings */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <button
          onClick={handleTogglePin}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            color: pinned ? 'var(--color-text-link)' : 'var(--color-text-secondary)',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={pinned ? '取消置顶' : '置顶窗口'}
        >
          📌
        </button>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            background: view === 'settings' ? 'var(--color-surface-active)' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            if (view !== 'settings') e.currentTarget.style.background = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            if (view !== 'settings') e.currentTarget.style.background = 'transparent';
          }}
          title="设置"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}
