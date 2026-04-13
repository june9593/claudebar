import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export function ChatWebView() {
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const authMode = useSettingsStore((s) => s.authMode);
  const authToken = useSettingsStore((s) => s.authToken);
  const authPassword = useSettingsStore((s) => s.authPassword);
  const setView = useSettingsStore((s) => s.setView);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!gatewayUrl) {
    return <WelcomeState onOpenSettings={() => setView('settings')} />;
  }

  // Build the URL — OpenClaw Control UI serves at the root
  let chatUrl = gatewayUrl.replace(/\/+$/, '');

  // Pass auth via URL fragment (fragments aren't sent to server — secure)
  if (authMode === 'token' && authToken) {
    chatUrl += `#token=${encodeURIComponent(authToken)}`;
  } else if (authMode === 'password' && authPassword) {
    chatUrl += `#password=${encodeURIComponent(authPassword)}`;
  }

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-4 px-8"
        style={{ backgroundColor: 'var(--color-bg-chat)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <span className="text-3xl">⚠️</span>
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            无法连接到 OpenClaw
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            请确认 Gateway 已启动并检查地址配置
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
            {gatewayUrl}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setLoadError(false); setLoading(true); }}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: 'var(--color-text-link)', border: '1px solid var(--color-border-primary)' }}
          >
            重试
          </button>
          <button
            onClick={() => setView('settings')}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--color-surface-user-bubble)', color: '#fff' }}
          >
            打开设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-bg-chat)' }}>
          <div className="text-center space-y-2">
            <span className="text-2xl">🦞</span>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>连接中...</p>
          </div>
        </div>
      )}
      <iframe
        key={chatUrl}
        src={chatUrl}
        className="w-full h-full border-0"
        style={{ borderRadius: '0 0 12px 12px' }}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setLoadError(true); }}
      />
    </div>
  );
}

function WelcomeState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '40px 32px',
        background: 'var(--color-bg-primary)',
      }}
    >
      <div style={{
        width: '72px',
        height: '72px',
        borderRadius: '20px',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '36px',
      }}>
        🦞
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: '8px',
        }}>
          欢迎使用 ClawBar
        </p>
        <p style={{
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
          maxWidth: '260px',
        }}>
          请在设置中配置 Gateway 地址以连接到 OpenClaw 实例
        </p>
      </div>
      <button
        onClick={onOpenSettings}
        style={{
          marginTop: '4px',
          padding: '9px 24px',
          borderRadius: '8px',
          border: 'none',
          background: 'var(--color-text-link)',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
      >
        打开设置
      </button>
    </div>
  );
}
