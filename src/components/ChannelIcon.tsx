import { useState } from 'react';
import type { Channel } from '../types';
import { LobsterIcon } from './LobsterIcon';

interface Props {
  channel: Channel;
  active: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function ChannelIcon({ channel, active, onClick, onContextMenu }: Props) {
  const [hover, setHover] = useState(false);

  const renderGlyph = () => {
    if (channel.kind === 'openclaw') {
      return <LobsterIcon size={26} />;
    }
    const icon = channel.icon;
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
      return <img src={icon} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />;
    }
    return <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>;
  };

  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={channel.name}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: 'none',
          background: active ? 'var(--color-surface-active)' : (hover ? 'var(--color-surface-hover)' : 'transparent'),
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {renderGlyph()}
      </button>
      {/* Active indicator pill on the left edge of the icon */}
      {active && (
        <span style={{
          position: 'absolute', left: -2, top: 8, width: 3, height: 20,
          borderRadius: 2, background: 'var(--color-accent)',
        }} />
      )}
    </div>
  );
}
