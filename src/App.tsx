import { useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useSessionStore } from './stores/sessionStore';
import { useApprovalsStore } from './stores/approvalsStore';
import { TitleBar } from './components/TitleBar';
import { ClaudeChannel } from './components/ClaudeChannel';
import { OperatorPanel } from './components/operator/OperatorPanel';
import { SessionRail } from './components/SessionRail';
import { AddSessionWizard } from './components/add-session/AddSessionWizard';

export default function App() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const syncFromSettings = useSessionStore((s) => s.syncFromSettings);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelInitialTab, setPanelInitialTab] = useState<'overview' | 'settings'>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);

  const openPanel = () => { setPanelInitialTab('overview'); setPanelOpen(true); };
  const openSettings = () => { setPanelInitialTab('settings'); setPanelOpen(true); };

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const pendingApprovalsBySessionId = useApprovalsStore((s) => s.countBySession);

  const onNewSession = () => setWizardOpen(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <SessionRail
          onOpenPanel={openPanel}
          onOpenSettings={openSettings}
          onNewSession={onNewSession}
          pendingApprovalsBySessionId={pendingApprovalsBySessionId}
        />
        <div style={{ flex: 1, position: 'relative' }}>
          {activeSession
            ? <ClaudeChannel channel={activeSession} isActive />
            : <EmptyState />}
          {panelOpen && <OperatorPanel initialTab={panelInitialTab} onClose={() => setPanelOpen(false)} />}
          {wizardOpen && <AddSessionWizard onClose={() => setWizardOpen(false)} />}
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
