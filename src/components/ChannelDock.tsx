import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Channel } from '../types';
import { useChannelStore } from '../stores/channelStore';
import { ChannelIcon } from './ChannelIcon';
import { AddChannelMenu } from './AddChannelMenu';
import { ChannelContextMenu } from './ChannelContextMenu';

export function ChannelDock() {
  const channels = useChannelStore((s) => s.channels);
  const activeId = useChannelStore((s) => s.activeChannelId);
  const setActive = useChannelStore((s) => s.setActive);
  const sidebarOpen = useChannelStore((s) => s.openclawSidebarOpen);
  const setSidebarOpen = useChannelStore((s) => s.setOpenclawSidebarOpen);
  const [adding, setAdding] = useState(false);
  const [ctx, setCtx] = useState<{ channel: Channel; x: number; y: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const visible = channels.filter((c) => c.enabled);

  // Anchor the AddChannelMenu near the + button, clamped inside the viewport.
  // The menu is ~280px wide and ~330px tall.
  const MENU_W = 280;
  const MENU_H = 340;
  let addAnchor = { x: 56, y: 16 };
  if (adding && addBtnRef.current) {
    const r = addBtnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = r.right + 8;
    let y = r.top - MENU_H + r.height;     // align bottom of menu near button
    if (x + MENU_W > vw - 8) x = Math.max(8, vw - MENU_W - 8);
    if (y + MENU_H > vh - 8) y = Math.max(8, vh - MENU_H - 8);
    if (y < 8) y = 8;
    addAnchor = { x, y };
  }

  return (
    <div
      style={{
        width: 48, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0',
        borderRight: '0.5px solid var(--color-border-primary)',
        background: 'var(--color-bg-secondary)',
        position: 'relative',
        zIndex: 95,  // above OpenClaw sidebar backdrop (z=90) so dock stays clickable
      }}
    >
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 6,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        {visible.map((c) => (
          <ChannelIcon
            key={c.id}
            channel={c}
            active={c.id === activeId}
            onClick={() => {
              if (c.kind === 'openclaw') {
                if (activeId === 'openclaw') {
                  setSidebarOpen(!sidebarOpen);
                } else {
                  setActive('openclaw');
                  setSidebarOpen(true);
                }
              } else {
                setActive(c.id);
                if (sidebarOpen) setSidebarOpen(false);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtx({ channel: c, x: e.clientX, y: e.clientY });
            }}
          />
        ))}
      </div>

      <button
        ref={addBtnRef}
        onClick={() => setAdding((v) => !v)}
        title="Add channel"
        style={{
          width: 36, height: 36, borderRadius: 10, border: 'none', marginTop: 6,
          background: adding ? 'var(--color-surface-active)' : 'transparent',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (!adding) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
        onMouseLeave={(e) => { if (!adding) e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={18} strokeWidth={1.75} />
      </button>

      {adding && <AddChannelMenu x={addAnchor.x} y={addAnchor.y} onClose={() => setAdding(false)} />}
      {ctx && <ChannelContextMenu channel={ctx.channel} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />}
    </div>
  );
}
