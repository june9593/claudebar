import { useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useSessionStore } from './stores/sessionStore';
import { TitleBar } from './components/TitleBar';
import { ClaudeChannel } from './components/ClaudeChannel';
import { SettingsPanel } from './components/SettingsPanel';
import { SessionRail } from './components/SessionRail';

export default function App() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const syncFromSettings = useSessionStore((s) => s.syncFromSettings);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Stub — Task 14 will populate this from useClaudeSession's pendingApproval
  // aggregated across all active sessions.
  const pendingApprovalsBySessionId: Record<string, number> = {};

  const onNewSession = () => {
    // Stub — Task 17 wires up the new-session wizard
    // eslint-disable-next-line no-console
    console.log('TODO: open new-session wizard');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <SessionRail
          onOpenPanel={() => setPanelOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewSession={onNewSession}
          pendingApprovalsBySessionId={pendingApprovalsBySessionId}
        />
        <div style={{ flex: 1, position: 'relative' }}>
          {activeSession
            ? <ClaudeChannel channel={activeSession} isActive />
            : <EmptyState />}
          {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
          {panelOpen && (
            <div
              onClick={() => setPanelOpen(false)}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 50,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 280, height: '100%',
                  background: 'var(--color-bg-primary)',
                  borderRight: '0.5px solid var(--color-border-primary)',
                  padding: 16,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                }}
              >
                Operator panel — Phase 3 fills the 7 view tabs here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: 13, padding: 24, textAlign: 'center',
    }}>
      No active session. Click + on the rail to start one.
    </div>
  );
}
