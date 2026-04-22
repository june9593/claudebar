import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { CompactChat } from './CompactChat';
import { ChatWebView } from './ChatWebView';

interface Props {
  isActive: boolean;
}

export function OpenClawChannel({ isActive }: Props) {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', display: isActive ? 'block' : 'none' }}>
      {chatMode === 'compact'
        ? <CompactChat sidebarOpen={sidebarOpen} onSidebarClose={() => setSidebarOpen(false)} />
        : <ChatWebView />
      }
    </div>
  );
}
