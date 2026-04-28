import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useChannelStore } from '../stores/channelStore';
import type { WebChannelDef } from '../types';
import { ClaudeWizard } from './add-channel/ClaudeWizard';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
}

export function AddChannelMenu({ x, y, onClose }: Props) {
  const channels = useChannelStore((s) => s.channels);
  const enableBuiltin = useChannelStore((s) => s.enableBuiltin);
  const setActive = useChannelStore((s) => s.setActive);
  const addCustom = useChannelStore((s) => s.addCustom);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showClaude, setShowClaude] = useState(false);

  const builtinWeb = channels.filter((c): c is WebChannelDef => c.kind === 'web' && c.builtin);

  const handleAdd = () => {
    const id = addCustom(url);
    if (!id) {
      setError('Invalid URL');
      return;
    }
    onClose();
  };

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
      />
      <div
        style={{
          position: 'fixed', left: x, top: y,
          width: 280,
          background: 'var(--color-bg-primary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 12,
          zIndex: 100,
        }}
        onClick={(e) => e.stopPropagation()}
      >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
        Add a channel
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '8px 0 4px' }}>
        Built-in
      </div>
      {builtinWeb.map((c) => (
        <button
          key={c.id}
          onClick={() => {
            if (c.enabled) setActive(c.id);
            else enableBuiltin(c.id);
            onClose();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '6px 8px', borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 18 }}>{c.icon}</span>
          <span style={{ flex: 1 }}>{c.name}</span>
          <span style={{ color: c.enabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
            {c.enabled ? '✓' : '+'}
          </span>
        </button>
      ))}

      <div style={{ borderTop: '0.5px solid var(--color-border-primary)', margin: '10px 0 6px' }} />
      <button
        onClick={() => setShowClaude(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '6px 8px', borderRadius: 6,
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'left',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#cc785c" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2 L13.2 9 L19.5 5.5 L16 11.8 L23 12 L16 12.2 L19.5 18.5 L13.2 15 L12 22 L10.8 15 L4.5 18.5 L8 12.2 L1 12 L8 11.8 L4.5 5.5 L10.8 9 Z" />
        </svg>
        <span style={{ flex: 1 }}>Claude Code session</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>
      </button>

      <div style={{ borderTop: '0.5px solid var(--color-border-primary)', margin: '10px 0 6px' }} />
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Custom
      </div>
      <input
        type="text"
        placeholder="https://..."
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        autoFocus
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6,
          border: '0.5px solid var(--color-border-primary)',
          background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
          fontSize: 13, fontFamily: 'inherit',
        }}
      />
      {error && (
        <div style={{ color: 'var(--color-status-disconnected)', fontSize: 11, marginTop: 4 }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 6 }}>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!url.trim()}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: url.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            color: url.trim() ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
            cursor: url.trim() ? 'pointer' : 'default', fontSize: 12,
          }}
        >
          Add
        </button>
      </div>
    </div>
    {showClaude && (
      <ClaudeWizard
        x={x}
        y={y}
        onClose={() => { setShowClaude(false); onClose(); }}
      />
    )}
    </>,
    document.body,
  );
}
