import { useState } from 'react';
import { ArrowLeft, Menu, Pin, PinOff, RotateCw, Settings } from 'lucide-react';
import { LobsterIcon } from './LobsterIcon';
import { useSettingsStore } from '../stores/settingsStore';
import { useWebViewStore } from '../stores/webviewStore';
import { useChannelStore } from '../stores/channelStore';

interface TitleBarProps {
  onToggleSidebar?: () => void;
}

// Electron <webview> exposes goBack / canGoBack / reload as element methods.
type WebviewEl = HTMLElement & {
  goBack?: () => void;
  canGoBack?: () => boolean;
  reload?: () => void;
};

export function TitleBar({ onToggleSidebar }: TitleBarProps) {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
  const chatMode = useSettingsStore((s) => s.chatMode);
  const reloadWebView = useWebViewStore((s) => s.reload);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const activeWebview = useChannelStore((s) => s.activeWebview) as WebviewEl | null;
  const [pinned, setPinned] = useState(false);

  const handleTogglePin = async () => {
    try {
      const newState = await window.electronAPI?.window?.togglePin();
      setPinned(!!newState);
    } catch {
      setPinned(!pinned);
    }
  };

  const hasGateway = !!gatewayUrl;
  const isWebChannel = activeChannelId !== 'openclaw';

  const goBack = () => {
    try {
      if (activeWebview?.canGoBack?.()) activeWebview.goBack?.();
    } catch { /* ignore */ }
  };
  const reloadWeb = () => {
    try { activeWebview?.reload?.(); } catch { /* ignore */ }
  };

  return (
    <div
      className="titlebar-drag"
      style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 14px',
        background: 'var(--color-surface-title-bar)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '0.5px solid var(--color-border-primary)',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Left: hamburger + status + identity */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '44px',
      }}>
        {/* Hamburger menu button */}
        {onToggleSidebar && (
          <div className="titlebar-no-drag">
            <TitleButton
              onClick={onToggleSidebar}
              title="Menu"
            >
              <Menu size={16} strokeWidth={1.75} />
            </TitleButton>
          </div>
        )}
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: hasGateway ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
          flexShrink: 0,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', height: '44px', flexShrink: 0 }}>
          <LobsterIcon size={18} />
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
        }}>
          ClawBar
        </div>
        {isWebChannel && (
          <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '1px', marginLeft: 4 }}>
            <TitleButton onClick={goBack} title="后退">
              <ArrowLeft size={14} strokeWidth={1.75} />
            </TitleButton>
            <TitleButton onClick={reloadWeb} title="刷新">
              <RotateCw size={14} strokeWidth={1.75} />
            </TitleButton>
          </div>
        )}
      </div>

      {/* Right buttons */}
      <div className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '1px', height: '44px' }}>
        {chatMode === 'classic' && view === 'chat' && !isWebChannel && (
          <TitleButton
            onClick={reloadWebView}
            title="重新加载"
          >
            <RotateCw size={14} strokeWidth={1.75} />
          </TitleButton>
        )}
        <TitleButton
          onClick={handleTogglePin}
          active={pinned}
          title={pinned ? '取消置顶' : '置顶'}
        >
          {pinned
            ? <PinOff size={14} strokeWidth={1.75} />
            : <Pin size={14} strokeWidth={1.75} />
          }
        </TitleButton>
        <TitleButton
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          active={view === 'settings'}
          title="设置"
        >
          <Settings size={15} strokeWidth={1.75} />
        </TitleButton>
      </div>
    </div>
  );
}

function TitleButton({ children, onClick, active, title }: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--color-surface-active)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--color-surface-hover)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-tertiary)';
        }
      }}
    >
      {children}
    </button>
  );
}
