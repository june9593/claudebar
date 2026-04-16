import { useEffect, useRef } from 'react';

export type NavId = 'chat' | 'sessions' | 'usage';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeNav: NavId;
  onNavChange: (nav: NavId) => void;
  onOpenSettings: () => void;
}

const navItems: { id: NavId; icon: string; label: string }[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'sessions', icon: '📋', label: 'Sessions' },
  { id: 'usage', icon: '📊', label: 'Usage' },
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
          inset: 0,
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
          left: 0,
          bottom: 0,
          width: '200px',
          background: 'var(--color-bg-secondary)',
          borderRight: '0.5px solid var(--color-border-secondary)',
          zIndex: 100,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 200ms ease-out',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
        }}
      >
        {/* Nav items */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
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
                {/* Active indicator */}
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
                <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>
                  {item.icon}
                </span>
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
          })}
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
            <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>⚙️</span>
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
