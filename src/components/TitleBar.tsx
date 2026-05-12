import * as React from 'react';

// `process` is not exposed in our sandboxed renderer (contextIsolation +
// sandbox: true), so detect via the renderer's userAgentData / platform.
const isMac = typeof navigator !== 'undefined' && /mac/i.test(
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent
);

export function TitleBar() {
  return (
    <div style={{
      height: 36,
      WebkitAppRegion: 'drag',
      display: 'flex', alignItems: 'center',
      // Leave space for macOS traffic-light buttons in the top-left.
      paddingLeft: isMac ? 76 : 12,
      paddingRight: 12,
      borderBottom: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
    } as React.CSSProperties}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        ClaudeBar
      </span>
    </div>
  );
}
