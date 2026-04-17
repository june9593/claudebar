import { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface ViewShellProps {
  title: string;
  children: ReactNode;
  onRefresh?: () => void;
}

/**
 * Shared view scaffold: background, padded header with title, optional refresh button.
 * Matches the inline pattern originally duplicated across SkillsView/CronView/AgentsView.
 */
export function ViewShell({ title, children, onRefresh }: ViewShellProps) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{
        padding: '12px 14px 8px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          {title}
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-tertiary)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
