import { useEffect, useRef } from 'react';
import type { WebChannelDef } from '../types';
import { useChannelStore } from '../stores/channelStore';

interface Props {
  channel: WebChannelDef;
  isActive: boolean;
}

// Electron webview is a custom element — declare it minimally for TS/React.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.4 Mobile/15E148 Safari/604.1';

export function WebChannel({ channel, isActive }: Props) {
  const webviewRef = useRef<HTMLElement | null>(null);
  const setIcon = useChannelStore((s) => s.setIcon);
  const setActiveWebview = useChannelStore((s) => s.setActiveWebview);

  // `allowpopups` is a boolean in HTMLAttributes typing; set imperatively
  // (also runs in time because the webview hasn't navigated yet — Electron
  // reads it on the dom-ready event).
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    el.setAttribute('allowpopups', '');
  }, []);

  // Expose this webview to the TitleBar back / reload buttons while active.
  useEffect(() => {
    if (!isActive) return;
    const el = webviewRef.current;
    if (!el) return;
    setActiveWebview(el);
    return () => setActiveWebview(null);
  }, [isActive, setActiveWebview]);

  // Capture favicon updates for user-added channels.
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || channel.builtin) return;
    const onFavicon = (e: Event) => {
      const ev = e as Event & { favicons?: string[] };
      const url = ev.favicons?.[0];
      if (url) setIcon(channel.id, url);
    };
    el.addEventListener('page-favicon-updated', onFavicon as EventListener);
    return () => el.removeEventListener('page-favicon-updated', onFavicon as EventListener);
  }, [channel.id, channel.builtin, setIcon]);

  return (
    <webview
      ref={(el) => { webviewRef.current = el; }}
      src={channel.url}
      partition={`persist:channel-${channel.id}`}
      useragent={MOBILE_UA}
      style={{
        width: '100%',
        height: '100%',
        display: isActive ? 'flex' : 'none',
        background: 'var(--color-bg-primary)',
      }}
    />
  );
}
