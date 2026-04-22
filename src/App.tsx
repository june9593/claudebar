import { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { SettingsPanel } from './components/SettingsPanel';
import { ChannelDock } from './components/ChannelDock';
import { ChannelHost } from './components/ChannelHost';
import { useSettingsStore } from './stores/settingsStore';
import { useChannelStore } from './stores/channelStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const syncFromSettings = useChannelStore((s) => s.syncFromSettings);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const unsub = window.electronAPI?.window?.onNavigate?.((v: string) => {
      if (v === 'settings') setView('settings');
      else if (v === 'chat') setView('chat');
    });
    return () => unsub?.();
  }, [setView]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fix = () => { if (el.scrollTop !== 0) el.scrollTop = 0; };
    fix();
    el.addEventListener('scroll', fix, { passive: true });
    return () => el.removeEventListener('scroll', fix);
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full"
      style={{ borderRadius: '12px', overflow: 'clip' }}
    >
      <TitleBar />
      <div className="flex-1 min-h-0 relative" style={{ display: 'flex' }}>
        <ChannelDock />
        <ChannelHost />
        {view === 'settings' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--color-bg-primary)',
            zIndex: 200,
          }}>
            <SettingsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
