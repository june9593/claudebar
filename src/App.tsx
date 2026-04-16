import { useEffect, useRef, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { ChatWebView } from './components/ChatWebView';
import { CompactChat } from './components/CompactChat';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  const chatMode = useSettingsStore((s) => s.chatMode);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Prevent phantom scroll on the root container
  // (overflow:hidden containers can still be scrolled by focus/autoscroll)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fix = () => { if (el.scrollTop !== 0) el.scrollTop = 0; };
    fix();
    // Fix on any scroll event (catches focus-induced scroll)
    el.addEventListener('scroll', fix, { passive: true });
    return () => el.removeEventListener('scroll', fix);
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full"
      style={{ borderRadius: '12px', overflow: 'clip' }}
    >
      <TitleBar onToggleSidebar={chatMode === 'compact' && view === 'chat' ? () => setSidebarOpen(prev => !prev) : undefined} />
      <div className="flex-1 min-h-0 relative">
        <div style={{
          position: 'absolute', inset: 0,
          opacity: view === 'settings' ? 1 : 0,
          pointerEvents: view === 'settings' ? 'auto' : 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          transform: view === 'settings' ? 'translateY(0)' : 'translateY(8px)',
          zIndex: view === 'settings' ? 2 : 1,
        }}>
          <SettingsPanel />
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          opacity: view === 'chat' ? 1 : 0,
          pointerEvents: view === 'chat' ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
          zIndex: view === 'chat' ? 2 : 1,
        }}>
          {chatMode === 'compact' ? <CompactChat sidebarOpen={sidebarOpen} onSidebarClose={() => setSidebarOpen(false)} /> : <ChatWebView />}
        </div>
      </div>
    </div>
  );
}
