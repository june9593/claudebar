import { useEffect, useRef } from 'react';
import {
  MessageSquare, MessagesSquare, BarChart3,
  Clock, Bot, Puzzle, ScrollText, Settings as SettingsIcon,
  LayoutDashboard, Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavId = 'overview' | 'chat' | 'approvals' | 'sessions' | 'usage' | 'cron' | 'agents' | 'skills' | 'logs';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeNav: NavId;
  onNavChange: (nav: NavId) => void;
  onOpenSettings: () => void;
}

const ICON_PROPS = { size: 18, strokeWidth: 1.75 } as const;

const topNavItems: { id: NavId; Icon: LucideIcon; label: string }[] = [
  { id: 'overview', Icon: LayoutDashboard, label: 'Overview' },
  { id: 'chat', Icon: MessageSquare, label: 'Chat' },
  { id: 'approvals', Icon: Shield, label: 'Approvals' },
  { id: 'sessions', Icon: MessagesSquare, label: 'Sessions' },
];

const bottomNavItems: { id: NavId; Icon: LucideIcon; label: string }[] = [
  { id: 'usage', Icon: BarChart3, label: 'Usage' },
  { id: 'cron', Icon: Clock, label: 'Cron' },
  { id: 'agents', Icon: Bot, label: 'Agents' },
  { id: 'skills', Icon: Puzzle, label: 'Skills' },
  { id: 'logs', Icon: ScrollText, label: 'Logs' },
];

export function Sidebar({ isOpen, onClose, activeNav, onNavChange, onOpenSettings }: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close on click outside (backdrop)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleNavClick = (id: NavId) => {
    onNavChange(id);
    onClose();
  };

  const handleSettingsClick = () => {
    onOpenSettings();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 'var(--title-bar-height)',
          left: 48,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 90,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
        }}
      />

      {/* Sidebar panel */}
      <div
        ref={sidebarRef}
        style={{
          position: 'fixed',
          top: 'var(--title-bar-height)',
          left: 48,
          bottom: 0,
          width: '200px',
          background: 'var(--color-bg-secondary)',
          borderRight: '0.5px solid var(--color-border-secondary)',
          zIndex: 100,
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% - 48px))',
          transition: 'transform 200ms ease-out',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
        }}
      >
        {/* Nav items */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
          {topNavItems.map((item) => (
            <NavButton key={item.id} item={item} isActive={activeNav === item.id} onClick={() => handleNavClick(item.id)} />
          ))}

          {/* Divider between data and config sections */}
          <div style={{
            height: '0.5px',
            background: 'var(--color-border-secondary)',
            margin: '6px 10px',
          }} />

          {bottomNavItems.map((item) => (
            <NavButton key={item.id} item={item} isActive={activeNav === item.id} onClick={() => handleNavClick(item.id)} />
          ))}
        </div>

        {/* Bottom: Settings */}
        <div style={{ padding: '0 8px', borderTop: '0.5px solid var(--color-border-secondary)', paddingTop: '8px' }}>
          <button
            onClick={handleSettingsClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              width: '100%',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <SettingsIcon {...ICON_PROPS} style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
            <span style={{
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.33,
            }}>
              Settings
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

function NavButton({ item, isActive, onClick }: {
  item: { id: NavId; Icon: LucideIcon; label: string };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '8px',
        border: 'none',
        background: isActive ? 'var(--color-surface-active)' : 'transparent',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      {isActive && (
        <div style={{
          position: 'absolute',
          left: '-8px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '3px',
          height: '20px',
          borderRadius: '0 3px 3px 0',
          background: 'var(--color-accent)',
        }} />
      )}
      <item.Icon
        {...ICON_PROPS}
        style={{
          flexShrink: 0,
          color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        }}
      />
      <span style={{
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        lineHeight: 1.33,
      }}>
        {item.label}
      </span>
    </button>
  );
}
