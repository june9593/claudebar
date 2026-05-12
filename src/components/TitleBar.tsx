import * as React from 'react';
import { Settings } from 'lucide-react';

interface Props { onOpenSettings: () => void; }

export function TitleBar({ onOpenSettings }: Props) {
  return (
    <div style={{
      height: 36,
      WebkitAppRegion: 'drag',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      borderBottom: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
    } as React.CSSProperties}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        ClaudeBar
      </span>
      <button
        onClick={onOpenSettings}
        style={{
          WebkitAppRegion: 'no-drag',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', padding: 4,
        } as React.CSSProperties}
        aria-label="Settings"
      >
        <Settings size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
