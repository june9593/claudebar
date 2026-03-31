import { useSettingsStore } from '../stores/settingsStore';

export function TitleBar() {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);

  const handleTogglePin = async () => {
    try { await window.electronAPI?.window?.togglePin(); } catch { /* browser mode */ }
  };

  const hasGateway = !!gatewayUrl;

  return (
    <div
      className="titlebar-drag flex items-center justify-between px-3 shrink-0"
      style={{
        height: 'var(--title-bar-height)',
        backgroundColor: 'var(--color-surface-title-bar)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--color-border-secondary)',
      }}
    >
      {/* Left: App identity */}
      <div className="titlebar-no-drag flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
          style={{ color: 'var(--color-text-primary)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)' }}
          />
          <span style={{ fontSize: '14px' }}>🦞</span>
          <span className="font-semibold">ClawBar</span>
        </div>
      </div>

      {/* Right: Pin + Settings */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <button
          onClick={handleTogglePin}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title="Pin window"
        >
          📌
        </button>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: '12px',
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
