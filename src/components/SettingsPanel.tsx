import { useSettingsStore } from '../stores/settingsStore';

export function SettingsPanel() {
  const setView = useSettingsStore((s) => s.setView);
  const { gatewayUrl, authMode, authToken, authPassword, theme, hideOnClickOutside, updateSetting } = useSettingsStore();

  const inputStyle = {
    backgroundColor: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  };

  return (
    <div
      className="absolute inset-0 z-10 overflow-y-auto"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--color-border-secondary)' }}
      >
        <button
          onClick={() => setView('chat')}
          className="text-sm px-2 py-1 rounded-md"
          style={{ color: 'var(--color-text-link)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          ← 返回
        </button>
        <span
          className="flex-1 text-center text-sm font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          设置
        </span>
        <div className="w-12" />
      </div>

      <div className="p-4 space-y-5">
        {/* Gateway Connection */}
        <section>
          <h3
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            OpenClaw 网关
          </h3>
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Gateway URL
              </span>
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => updateSetting('gatewayUrl', e.target.value)}
                placeholder="http://localhost:18789"
                className="w-full text-sm px-2 py-1.5 rounded outline-none"
                style={inputStyle}
              />
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                本地默认 http://localhost:18789，远程填入服务器地址
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                认证方式
              </span>
              <select
                value={authMode}
                onChange={(e) => updateSetting('authMode', e.target.value)}
                className="w-full text-sm px-2 py-1.5 rounded outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                }}
              >
                <option value="none">无需认证（本地连接）</option>
                <option value="token">Token</option>
                <option value="password">密码</option>
              </select>
            </div>

            {authMode === 'token' && (
              <div className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Gateway Token
                </span>
                <input
                  type="password"
                  value={authToken}
                  onChange={(e) => updateSetting('authToken', e.target.value)}
                  placeholder="粘贴 gateway token..."
                  className="w-full text-sm px-2 py-1.5 rounded outline-none"
                  style={inputStyle}
                />
              </div>
            )}

            {authMode === 'password' && (
              <div className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  密码
                </span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => updateSetting('authPassword', e.target.value)}
                  placeholder="输入 gateway 密码..."
                  className="w-full text-sm px-2 py-1.5 rounded outline-none"
                  style={inputStyle}
                />
              </div>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h3
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            外观
          </h3>
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                主题
              </span>
              <select
                value={theme}
                onChange={(e) => updateSetting('theme', e.target.value)}
                className="text-sm px-2 py-1 rounded outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                }}
              >
                <option value="system">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            </div>
          </div>
        </section>

        {/* Behavior */}
        <section>
          <h3
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            行为
          </h3>
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                点击外部隐藏
              </span>
              <button
                onClick={() => updateSetting('hideOnClickOutside', !hideOnClickOutside)}
                className="w-10 h-5 rounded-full relative transition-colors"
                style={{
                  backgroundColor: hideOnClickOutside
                    ? 'var(--color-status-connected)'
                    : 'var(--color-text-tertiary)',
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm"
                  style={{
                    left: hideOnClickOutside ? '22px' : '2px',
                  }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <div className="text-center space-y-1 pt-2">
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              🦞 ClawBar v1.0.0
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              macOS menu bar client for OpenClaw
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
