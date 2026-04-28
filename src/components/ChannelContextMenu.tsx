import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Channel } from '../types';
import { useChannelStore } from '../stores/channelStore';

interface Props {
  channel: Channel;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelContextMenu({ channel, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rename = useChannelStore((s) => s.rename);
  const setIcon = useChannelStore((s) => s.setIcon);
  const moveUp = useChannelStore((s) => s.moveUp);
  const moveDown = useChannelStore((s) => s.moveDown);
  const remove = useChannelStore((s) => s.remove);
  const disableBuiltin = useChannelStore((s) => s.disableBuiltin);
  const [editing, setEditing] = useState<'name' | 'icon' | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const startEdit = (mode: 'name' | 'icon') => {
    setDraft(mode === 'name' ? channel.name : (channel.kind === 'web' ? channel.icon : ''));
    setEditing(mode);
  };

  const commit = () => {
    if (!editing) return;
    if (editing === 'name') rename(channel.id, draft);
    else if (editing === 'icon' && draft.trim()) setIcon(channel.id, draft.trim());
    setEditing(null);
    onClose();
  };

  const isOpenClaw = channel.kind === 'openclaw';

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y,
        minWidth: 160,
        background: 'var(--color-bg-primary)',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 8, boxShadow: 'var(--shadow-card)',
        padding: 4, zIndex: 200, fontSize: 13,
      }}
    >
      {editing ? (
        <div style={{ padding: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
            autoFocus
            placeholder={editing === 'icon' ? 'emoji or favicon URL' : ''}
            style={{
              width: '100%', padding: '4px 6px', borderRadius: 4,
              border: '0.5px solid var(--color-border-primary)',
              background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
              fontSize: 13, fontFamily: 'inherit',
            }}
          />
        </div>
      ) : (
        <>
          {!isOpenClaw && <Item label="Rename"      onClick={() => startEdit('name')} />}
          {channel.kind === 'web' && <Item label="Change icon" onClick={() => startEdit('icon')} />}
          {!isOpenClaw && <Item label="Move up"     onClick={() => { moveUp(channel.id); onClose(); }} />}
          {!isOpenClaw && <Item label="Move down"   onClick={() => { moveDown(channel.id); onClose(); }} />}
          {channel.kind === 'web' && channel.builtin && (
            <Item label="Hide" onClick={() => { disableBuiltin(channel.id); onClose(); }} />
          )}
          {channel.kind === 'web' && !channel.builtin && (
            <Item label="Delete" danger onClick={() => { remove(channel.id); onClose(); }} />
          )}
          {channel.kind === 'claude' && (
            <Item label="Remove from bar" danger onClick={() => { remove(channel.id); onClose(); }} />
          )}
          {isOpenClaw && (
            <div style={{ padding: '6px 10px', color: 'var(--color-text-tertiary)' }}>
              OpenClaw cannot be removed
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

function Item({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '6px 10px', borderRadius: 4,
        border: 'none', background: 'transparent',
        color: danger ? 'var(--color-status-disconnected)' : 'var(--color-text-primary)',
        cursor: 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
