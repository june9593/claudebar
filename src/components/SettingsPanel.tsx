import { useSettingsStore } from '../stores/settingsStore';

export function SettingsPanel() {
  const { gatewayUrl, authMode, authToken, authPassword, theme, chatMode, hideOnClickOutside, updateSetting } = useSettingsStore();

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      overflowY: 'auto',
      background: 'var(--color-bg-primary)',
      padding: '24px 16px 32px',
      display: 'flex', flexDirection: 'column', gap: '28px',
    }}>
      {/* Connection */}
      <Section title="连接">
        <Card>
          <Row>
            <Label>Gateway URL</Label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                value={gatewayUrl}
                onChange={(v) => updateSetting('gatewayUrl', v)}
                placeholder="http://localhost:18789"
              />
            </div>
          </Row>
          <RowSep />
          <Row>
            <Label>认证方式</Label>
            <Select
              value={authMode}
              onChange={(v) => updateSetting('authMode', v)}
              options={[
                { value: 'none', label: '无需认证' },
                { value: 'token', label: 'Token' },
                { value: 'password', label: '密码' },
              ]}
            />
          </Row>
          {authMode === 'token' && (
            <>
              <RowSep />
              <Row>
                <Label>Token</Label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    type="password"
                    value={authToken}
                    onChange={(v) => updateSetting('authToken', v)}
                    placeholder="粘贴 token..."
                  />
                </div>
              </Row>
            </>
          )}
          {authMode === 'password' && (
            <>
              <RowSep />
              <Row>
                <Label>密码</Label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    type="password"
                    value={authPassword}
                    onChange={(v) => updateSetting('authPassword', v)}
                    placeholder="输入密码..."
                  />
                </div>
              </Row>
            </>
          )}
        </Card>
      </Section>

      {/* Appearance */}
      <Section title="外观">
        <Card>
          <Row>
            <Label>主题</Label>
            <SegmentedControl
              value={theme}
              options={[
                { value: 'system', label: '自动' },
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
              onChange={(v) => updateSetting('theme', v)}
            />
          </Row>
        </Card>
      </Section>

      {/* Behavior */}
      <Section title="行为">
        <Card>
          <Row>
            <Label>聊天界面</Label>
            <SegmentedControl
              value={chatMode}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'classic', label: 'Classic' },
              ]}
              onChange={(v) => updateSetting('chatMode', v)}
            />
          </Row>
          <RowSep />
          <Row>
            <Label>点击外部隐藏窗口</Label>
            <Toggle
              value={hideOnClickOutside}
              onChange={(v) => updateSetting('hideOnClickOutside', v)}
            />
          </Row>
        </Card>
      </Section>

      {/* About */}
      <div style={{
        textAlign: 'center',
        padding: '8px 0',
        display: 'flex', flexDirection: 'column', gap: '3px',
      }}>
        <span style={{ fontSize: '24px' }}>🦞</span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.16px',
        }}>
          ClawBar
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.08px',
        }}>
          v1.0.0 · macOS menu bar client for OpenClaw
        </span>
      </div>
    </div>
  );
}

/* ── Primitives ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--color-text-tertiary)',
        letterSpacing: '0.3px',
        textTransform: 'uppercase',
        padding: '0 4px',
      }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface-card)',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      minHeight: '40px',
      gap: '8px',
    }}>
      {children}
    </div>
  );
}

function RowSep() {
  return <div style={{ height: '0.5px', background: 'var(--color-border-primary)', margin: '0 14px' }} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: '14px',
      color: 'var(--color-text-primary)',
      letterSpacing: '-0.16px',
      flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid var(--color-border-primary)',
        background: 'var(--color-bg-input)',
        color: 'var(--color-text-primary)',
        fontSize: '14px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '-0.08px',
        outline: 'none',
        transition: 'border-color 0.15s',
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-focus)')}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-primary)')}
    />
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '6px 28px 6px 10px',
        borderRadius: '8px',
        border: 'none',
        background: 'var(--color-surface-hover)',
        color: 'var(--color-text-primary)',
        fontSize: '13px',
        fontFamily: 'inherit',
        letterSpacing: '-0.08px',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236E6E73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SegmentedControl({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--color-surface-hover)',
      borderRadius: '8px',
      padding: '2px',
    }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '5px 12px',
            borderRadius: '6px',
            border: 'none',
            background: value === o.value ? 'var(--color-bg-primary)' : 'transparent',
            color: value === o.value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontSize: '12px',
            fontWeight: value === o.value ? 600 : 400,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.08px',
            transition: 'all 0.2s',
            boxShadow: value === o.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative',
        width: '44px',
        height: '26px',
        borderRadius: '13px',
        border: 'none',
        background: value ? 'var(--color-status-connected)' : 'var(--color-bg-tertiary)',
        cursor: 'pointer',
        transition: 'background 0.25s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: value ? '21px' : '3px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: '#ffffff',
        transition: 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}
