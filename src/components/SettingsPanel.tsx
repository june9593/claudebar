import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const theme = useSettingsStore((s) => (s as unknown as { theme: 'light' | 'dark' | 'system' }).theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--color-bg-primary)',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Settings</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          Close
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Phase 3 will fully populate this panel per spec §6.
      </div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
        Theme:
        <select
          value={theme}
          onChange={(e) => updateSetting('theme', e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
    </div>
  );
}
