import { useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useSessionStore } from './stores/sessionStore';
import { TitleBar } from './components/TitleBar';
import { ClaudeChannel } from './components/ClaudeChannel';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const syncFromSettings = useSessionStore((s) => s.syncFromSettings);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {activeSession
          ? <ClaudeChannel channel={activeSession} isActive />
          : <EmptyState />}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
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
      No session active. Phase 2 adds the session rail; for now use Settings to seed a session.
    </div>
  );
}
