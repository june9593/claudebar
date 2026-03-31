import { useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { ChatWebView } from './components/ChatWebView';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ borderRadius: '12px' }}>
      <TitleBar />
      <div className="flex-1 min-h-0 relative">
        {view === 'settings' ? <SettingsPanel /> : <ChatWebView />}
      </div>
    </div>
  );
}
