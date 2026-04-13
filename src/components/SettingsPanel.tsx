import { useSettingsStore } from '../stores/settingsStore';

export function SettingsPanel() {
  const { gatewayUrl, authMode, authToken, authPassword, theme, hideOnClickOutside, updateSetting } = useSettingsStore();

  const sectionTitle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '0 2px',
  };

  const groupStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)',
    borderRadius: '10px',
    border: '1px solid var(--color-border-secondary)',
    overflow: 'hidden',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    minHeight: '40px',
    gap: '8px',
  };

  const rowFullStyle: React.CSSProperties = {
    ...rowStyle,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border-primary)',
    background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', monospace",
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    padding: '6px 28px 6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border-primary)',
    background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  };

  const rowSep: React.CSSProperties = {
    borderTop: '1px solid var(--color-border-secondary)',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        overflowY: 'auto',
        background: 'var(--color-bg-primary)',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Connection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={sectionTitle}>连接</span>
        <div style={groupStyle}>
          <div style={rowFullStyle}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>Gateway URL</span>
            <input
              type="text"
              value={gatewayUrl}
              onChange={(e) => updateSetting('gatewayUrl', e.target.value)}
              placeholder="http://localhost:18789"
              style={inputStyle}
            />
          </div>
          <div style={{ ...rowStyle, ...rowSep }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>认证方式</span>
            <select
              value={authMode}
              onChange={(e) => updateSetting('authMode', e.target.value)}
              style={selectStyle}
            >
              <option value="none">无需认证</option>
              <option value="token">Token</option>
              <option value="password">密码</option>
            </select>
          </div>
          {authMode === 'token' && (
            <div style={{ ...rowFullStyle, ...rowSep }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>Token</span>
              <input
                type="password"
                value={authToken}
                onChange={(e) => updateSetting('authToken', e.target.value)}
                placeholder="粘贴 gateway token..."
                style={inputStyle}
              />
            </div>
          )}
          {authMode === 'password' && (
            <div style={{ ...rowFullStyle, ...rowSep }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>密码</span>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => updateSetting('authPassword', e.target.value)}
                placeholder="输入 gateway 密码..."
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </div>

      {/* Appearance */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={sectionTitle}>外观</span>
        <div style={groupStyle}>
          <div style={rowStyle}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>主题</span>
            <div style={{
              display: 'flex',
              gap: 0,
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid var(--color-border-primary)',
            }}>
              {(['system', 'light', 'dark'] as const).map((t, i) => (
                <button
                  key={t}
                  onClick={() => updateSetting('theme', t)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    border: 'none',
                    borderLeft: i > 0 ? '1px solid var(--color-border-primary)' : 'none',
                    background: theme === t ? 'var(--color-text-link)' : 'var(--color-bg-primary)',
                    color: theme === t ? '#FFFFFF' : 'var(--color-text-secondary)',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t === 'system' ? '跟随系统' : t === 'light' ? '亮色' : '暗色'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={sectionTitle}>行为</span>
        <div style={groupStyle}>
          <div style={rowStyle}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>点击外部隐藏</span>
            <button
              onClick={() => updateSetting('hideOnClickOutside', !hideOnClickOutside)}
              style={{
                position: 'relative',
                width: '42px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                background: hideOnClickOutside ? 'var(--color-status-connected)' : 'var(--color-bg-tertiary)',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: hideOnClickOutside ? '19px' : '3px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#FFFFFF',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '15px' }}>🦞</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>ClawBar v1.0.0</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>macOS menu bar client for OpenClaw</span>
      </div>
    </div>
  );
}
