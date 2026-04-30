import { useState } from 'react';
import type { Channel } from '../types';
import { LobsterIcon } from './LobsterIcon';
import { claudePetVariant, type ClaudePetVariant } from '../utils/claude-icon';

interface Props {
  channel: Channel;
  active: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** Tiny version of the Claude pet, parametrised by per-session variant.
 *  Same silhouette as src/pet/ClaudePet.tsx but smaller, no animation
 *  groups, and using the variant's body / hand / eye colour + eye style. */
function ClaudePetIcon({ v }: { v: ClaudePetVariant }) {
  const eye = v.eyeColor;
  const renderEye = (cx: number, cy: number) => {
    switch (v.eyeStyle) {
      case 'square':
        return <rect x={cx - 4} y={cy - 4} width="8" height="8" fill={eye} />;
      case 'round':
        return <circle cx={cx} cy={cy} r="4" fill={eye} />;
      case 'sleepy':
        return <rect x={cx - 5} y={cy - 1} width="10" height="2" fill={eye} />;
      case 'sparkle':
        return (
          <g fill={eye}>
            <rect x={cx - 1} y={cy - 5} width="2" height="10" />
            <rect x={cx - 5} y={cy - 1} width="10" height="2" />
          </g>
        );
    }
  };
  return (
    <svg width="22" height="22" viewBox="0 0 100 100" shapeRendering="crispEdges">
      {/* Body */}
      <rect x="22" y="32" width="56" height="40" fill={v.bodyColor} rx="2" />
      {/* Inner shadow on the right edge */}
      <rect x="72" y="36" width="6" height="32" fill={v.shadowColor} opacity="0.5" />
      {/* Hands */}
      <rect x="14" y="48" width="10" height="10" fill={v.handColor} />
      <rect x="76" y="48" width="10" height="10" fill={v.handColor} />
      {/* Four legs */}
      <rect x="26" y="72" width="9" height="14" fill={v.legColor} />
      <rect x="38" y="72" width="9" height="14" fill={v.legColor} />
      <rect x="53" y="72" width="9" height="14" fill={v.legColor} />
      <rect x="65" y="72" width="9" height="14" fill={v.legColor} />
      {/* Eyes */}
      {renderEye(40, 50)}
      {renderEye(60, 50)}
    </svg>
  );
}

export function ChannelIcon({ channel, active, onClick, onContextMenu }: Props) {
  const [hover, setHover] = useState(false);

  const renderGlyph = () => {
    if (channel.kind === 'openclaw') {
      return <LobsterIcon size={26} />;
    }
    if (channel.kind === 'claude') {
      const v = claudePetVariant(channel.projectKey + ':' + channel.sessionId);
      return <ClaudePetIcon v={v} />;
    }
    // kind === 'web'
    const icon = channel.icon;
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
      return <img src={icon} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />;
    }
    return <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>;
  };

  const tooltip = channel.kind === 'claude'
    ? `${channel.name}\n${channel.projectDir}`
    : channel.name;

  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={tooltip}
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
