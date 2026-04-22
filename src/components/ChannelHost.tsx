import { useChannelStore } from '../stores/channelStore';
import { OpenClawChannel } from './OpenClawChannel';
import { WebChannel } from './WebChannel';

export function ChannelHost() {
  const channels = useChannelStore((s) => s.channels);
  const activeId = useChannelStore((s) => s.activeChannelId);

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      {channels
        .filter((c) => c.enabled)
        .map((c) => {
          const isActive = c.id === activeId;
          if (c.kind === 'openclaw') {
            return <OpenClawChannel key={c.id} isActive={isActive} />;
          }
          return <WebChannel key={c.id} channel={c} isActive={isActive} />;
        })
      }
    </div>
  );
}
