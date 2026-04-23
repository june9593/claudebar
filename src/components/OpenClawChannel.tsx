import { useSettingsStore } from '../stores/settingsStore';
import { useChannelStore } from '../stores/channelStore';
import { CompactChat } from './CompactChat';
import { ChatWebView } from './ChatWebView';

interface Props {
  isActive: boolean;
}

export function OpenClawChannel({ isActive }: Props) {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const sidebarOpen = useChannelStore((s) => s.openclawSidebarOpen);
  const setSidebarOpen = useChannelStore((s) => s.setOpenclawSidebarOpen);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      visibility: isActive ? 'visible' : 'hidden',
      pointerEvents: isActive ? 'auto' : 'none',
      zIndex: isActive ? 1 : 0,
    }}>
      {chatMode === 'compact'
        ? <CompactChat sidebarOpen={sidebarOpen} onSidebarClose={() => setSidebarOpen(false)} />
        : <ChatWebView />
      }
    </div>
  );
}
