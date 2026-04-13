import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export function ChatWebView() {
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const authMode = useSettingsStore((s) => s.authMode);
  const authToken = useSettingsStore((s) => s.authToken);
  const authPassword = useSettingsStore((s) => s.authPassword);
  const setView = useSettingsStore((s) => s.setView);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Block iframe when auth is required but credentials missing
  const authIncomplete = (authMode === 'token' && !authToken) || (authMode === 'password' && !authPassword);

  // Timeout fallback: if iframe hasn't loaded after 10s, show error
  useEffect(() => {
    if (!loading || !gatewayUrl || authIncomplete) return;
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setLoadError(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading, gatewayUrl, authIncomplete]);

  if (!gatewayUrl || authIncomplete) {
    return <WelcomeState onOpenSettings={() => setView('settings')} needsAuth={authIncomplete} />;
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
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '20px', padding: '40px 32px',
        background: 'var(--color-bg-primary)',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px',
          background: 'var(--color-surface-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px',
        }}>
          ⚠️
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: '17px', fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.2px', marginBottom: '6px',
          }}>
            无法连接到 OpenClaw
          </p>
          <p style={{
            fontSize: '14px', color: 'var(--color-text-secondary)',
            letterSpacing: '-0.16px', lineHeight: 1.47,
          }}>
            请确认 Gateway 已启动
          </p>
          <p style={{
            fontSize: '12px', color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)', marginTop: '4px',
          }}>
            {gatewayUrl}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setLoadError(false); setLoading(true); }}
            style={{
              padding: '8px 20px', borderRadius: '980px',
              border: '1px solid var(--color-accent)',
              background: 'transparent',
              color: 'var(--color-accent)',
              fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '-0.16px',
            }}
          >
            重试
          </button>
          <button
            onClick={() => setView('settings')}
            style={{
              padding: '8px 20px', borderRadius: '8px',
              border: 'none',
              background: 'var(--color-accent)',
              color: '#ffffff',
              fontSize: '14px', fontWeight: 400,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '-0.16px',
            }}
          >
            打开设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative" style={{ backgroundColor: 'var(--color-bg-chat)' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'var(--color-bg-primary)' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>🦞</span>
            <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', letterSpacing: '-0.08px' }}>连接中...</p>
          </div>
        </div>
      )}
      <iframe
        key={chatUrl}
        src={chatUrl}
        className="w-full h-full border-0"
        style={{
          borderRadius: '0 0 var(--radius-window) var(--radius-window)',
          background: 'var(--color-bg-primary)',
        }}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setLoadError(true); }}
      />
    </div>
  );
}

function WelcomeState({ onOpenSettings, needsAuth }: { onOpenSettings: () => void; needsAuth?: boolean }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '24px', padding: '40px 32px',
      background: 'var(--color-bg-primary)',
    }}>
      <div style={{
        width: '72px', height: '72px', borderRadius: '18px',
        background: 'var(--color-surface-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '36px',
      }}>
        🦞
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: '21px', fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.28px', lineHeight: 1.19,
          marginBottom: '8px',
        }}>
          {needsAuth ? '需要配置认证' : '欢迎使用 ClawBar'}
        </p>
        <p style={{
          fontSize: '14px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.47, letterSpacing: '-0.16px',
          maxWidth: '260px',
        }}>
          {needsAuth
            ? '请在设置中填写 Gateway Token 或密码\n以连接到 OpenClaw 实例'
            : '请在设置中配置 Gateway 地址\n以连接到 OpenClaw 实例'
          }
        </p>
      </div>
      <button
        onClick={onOpenSettings}
        style={{
          padding: '9px 28px', borderRadius: '8px',
          border: 'none',
          background: 'var(--color-accent)',
          color: '#ffffff',
          fontSize: '15px', fontWeight: 400,
          cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '-0.16px',
          transition: 'filter 0.12s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
      >
        打开设置
      </button>
    </div>
  );
}
