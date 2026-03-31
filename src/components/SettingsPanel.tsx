import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';

export function SettingsPanel() {
  const setView = useChatStore((s) => s.setView);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const checkConnection = useChatStore((s) => s.checkConnection);
  const { clawPath, theme, hideOnClickOutside, fontSize, updateSetting } = useSettingsStore();

  const statusLabel =
    connectionStatus === 'connected'
      ? '🟢 已连接'
      : connectionStatus === 'connecting'
        ? '🟡 连接中...'
        : '🔴 已断开';

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
        <div className="w-12" /> {/* spacer for centering */}
      </div>

      <div className="p-4 space-y-5">
        {/* Connection */}
        <section>
          <h3
            className="text-xs font-semibold uppercase mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            连接
          </h3>
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                CLI 路径
              </span>
              <input
                type="text"
                value={clawPath}
                onChange={(e) => updateSetting('clawPath', e.target.value)}
                className="text-sm text-right px-2 py-1 rounded outline-none w-40"
                style={{
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                状态
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm">{statusLabel}</span>
                <button
                  onClick={() => checkConnection()}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    color: 'var(--color-text-link)',
                    border: '1px solid var(--color-border-primary)',
                  }}
                >
                  重试
                </button>
              </div>
            </div>
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
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                字号
              </span>
              <select
                value={fontSize}
                onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
                className="text-sm px-2 py-1 rounded outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-primary)',
                }}
              >
                <option value={11}>11px</option>
                <option value={12}>12px</option>
                <option value={13}>13px</option>
                <option value={14}>14px</option>
                <option value={16}>16px</option>
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
