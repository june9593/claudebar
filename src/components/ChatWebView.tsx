import { useSettingsStore } from '../stores/settingsStore';

export function ChatWebView() {
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const authMode = useSettingsStore((s) => s.authMode);
  const authToken = useSettingsStore((s) => s.authToken);
  const authPassword = useSettingsStore((s) => s.authPassword);
  const setView = useSettingsStore((s) => s.setView);

  if (!gatewayUrl) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-4 px-8"
        style={{ backgroundColor: 'var(--color-bg-chat)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <span className="text-3xl">🦞</span>
        </div>
        <div className="text-center space-y-1.5">
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            欢迎使用 ClawBar
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            请在设置中配置 OpenClaw Gateway 地址
          </p>
        </div>
        <button
          onClick={() => setView('settings')}
          className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--color-surface-user-bubble)',
            color: '#fff',
          }}
        >
          打开设置
        </button>
      </div>
    );
  }

  // Build the chat URL from gateway URL
  // OpenClaw Control UI chat is at the root path, we load /chat
  let chatUrl = gatewayUrl.replace(/\/+$/, '');

  // For remote gateways, pass auth via URL fragment (not query — fragments aren't sent to server)
  if (authMode === 'token' && authToken) {
    chatUrl += `#token=${encodeURIComponent(authToken)}`;
  } else if (authMode === 'password' && authPassword) {
    chatUrl += `#password=${encodeURIComponent(authPassword)}`;
  }

  return (
    <div className="flex-1 h-full" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <iframe
        src={chatUrl}
        className="w-full h-full border-0"
        style={{ borderRadius: '0 0 12px 12px' }}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
