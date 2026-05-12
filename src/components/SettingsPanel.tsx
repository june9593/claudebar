import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const theme = useSettingsStore((s) => (s as unknown as { theme: 'light' | 'dark' | 'system' }).theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 99,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 320, maxHeight: '80vh', overflowY: 'auto',
          background: 'var(--color-bg-primary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 16, zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          Phase 3 will fully populate this panel per spec §6.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Theme:
          <select
            value={theme}
            onChange={(e) => updateSetting('theme', e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '0.5px solid var(--color-border-primary)',
              background: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
      </div>
    </>,
    document.body,
  );
}
