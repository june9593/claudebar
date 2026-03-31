import { useChatStore } from '../stores/chatStore';

export function TitleBar() {
  const view = useChatStore((s) => s.view);
  const setView = useChatStore((s) => s.setView);
  const currentAgent = useChatStore((s) => s.currentAgent);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  const handleTogglePin = async () => {
    try { await window.electronAPI?.window?.togglePin(); } catch { /* browser mode */ }
  };

  const statusColor =
    connectionStatus === 'connected'
      ? 'var(--color-status-connected)'
      : connectionStatus === 'connecting'
        ? 'var(--color-status-connecting)'
        : 'var(--color-status-disconnected)';

  return (
    <div
      className="titlebar-drag flex items-center justify-between px-3 shrink-0"
      style={{
        height: 'var(--title-bar-height)',
        backgroundColor: 'var(--color-surface-title-bar)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--color-border-secondary)',
      }}
    >
      {/* Left: Agent selector */}
      <div className="titlebar-no-drag flex items-center gap-2">
        <button
          onClick={() => setView(view === 'session-switcher' ? 'chat' : 'session-switcher')}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
          style={{
            color: 'var(--color-text-primary)',
            backgroundColor: view === 'session-switcher' ? 'var(--color-surface-active)' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (view !== 'session-switcher')
              e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            if (view !== 'session-switcher')
              e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span style={{ fontSize: '14px' }}>🦞</span>
          <span className="font-semibold">{currentAgent?.name || 'ClawBar'}</span>
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px' }}>▾</span>
        </button>
      </div>

      {/* Right: Pin + Settings */}
      <div className="titlebar-no-drag flex items-center gap-1">
        <button
          onClick={handleTogglePin}
          className="w-7 h-7 flex items-center justify-center rounded-md text-sm"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title="Pin window"
        >
          📌
        </button>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className="w-7 h-7 flex items-center justify-center rounded-md text-sm"
          style={{
            color: 'var(--color-text-secondary)',
            backgroundColor: view === 'settings' ? 'var(--color-surface-active)' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (view !== 'settings')
              e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
          }}
          onMouseLeave={(e) => {
            if (view !== 'settings')
              e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}
