import { Plus, Menu, Settings as SettingsIcon } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import type { ClaudeSession } from '../types';

interface Props {
  onOpenPanel: () => void;
  onOpenSettings: () => void;
  onNewSession: () => void;
  pendingApprovalsBySessionId: Record<string, number>;
}

export function SessionRail({ onOpenPanel, onOpenSettings, onNewSession, pendingApprovalsBySessionId }: Props) {
  // Select the raw array, then filter in render. Filtering inside the
  // selector returns a fresh array each call, which makes useSyncExternalStore
  // believe the store changed and triggers an infinite render loop (React #185).
  const allSessions = useSessionStore((s) => s.sessions);
  const sessions = allSessions.filter((x) => x.enabled);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActive = useSessionStore((s) => s.setActive);

  return (
    <div style={{
      width: 32,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderRight: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
      paddingTop: 6,
      paddingBottom: 6,
    }}>
      <RailButton label="Operator panel" onClick={onOpenPanel}>
        <Menu size={16} strokeWidth={1.75} />
      </RailButton>
      <RailButton label="New session" onClick={onNewSession}>
        <Plus size={16} strokeWidth={1.75} />
      </RailButton>

      <div style={{ height: 8 }} />
      <div style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
        {sessions.map((s) => (
          <SessionRailIcon
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            pendingApprovals={pendingApprovalsBySessionId[s.id] ?? 0}
            onClick={() => setActive(s.id)}
          />
        ))}
      </div>

      <RailButton label="Settings" onClick={onOpenSettings}>
        <SettingsIcon size={16} strokeWidth={1.75} />
      </RailButton>
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 28, height: 28,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        margin: '2px 0',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function SessionRailIcon({ session, active, pendingApprovals, onClick }: {
  session: ClaudeSession;
  active: boolean;
  pendingApprovals: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={session.name}
      aria-label={session.name}
      style={{
        position: 'relative',
        width: 28, height: 28,
        background: active ? 'var(--color-surface-hover)' : 'transparent',
        border: 'none', cursor: 'pointer',
        borderRadius: 6,
        margin: '2px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        fontSize: 11, fontWeight: 600,
      }}
    >
      {/* Phase 3 swaps this letter for the ClaudePet variant icon
         hashed from project + session id. */}
      {session.iconLetter || '?'}
      {pendingApprovals > 0 && (
        <span style={{
          position: 'absolute',
          top: 0, right: 0,
          background: 'var(--color-status-disconnected, #e53)',
          color: 'white',
          borderRadius: 8,
          minWidth: 14, height: 14,
          padding: '0 3px',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {pendingApprovals > 9 ? '9+' : pendingApprovals}
        </span>
      )}
    </button>
  );
}
