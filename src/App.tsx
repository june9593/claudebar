import { useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { ChatPanel } from './components/ChatPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useChatStore } from './stores/chatStore';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  const view = useChatStore((s) => s.view);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const checkConnection = useChatStore((s) => s.checkConnection);

  useEffect(() => {
    loadSettings();
    checkConnection();
  }, [loadSettings, checkConnection]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ borderRadius: '12px' }}>
      <TitleBar />
      <div className="flex-1 min-h-0 relative">
        {view === 'settings' ? <SettingsPanel /> : <ChatPanel />}
      </div>
    </div>
  );
}
