import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';

const INSTALL_CMD = 'npm install -g @anthropic-ai/claude-code';

interface Props {
  onRecheck: () => void;
}

export function ClaudeInstallGuide({ onRecheck }: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked, ignore */ }
  };

  const handleRecheck = () => {
    setBusy(true);
    onRecheck();
    setTimeout(() => setBusy(false), 800);
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      textAlign: 'center',
      gap: '14px',
    }}>
      <div style={{
        fontSize: '14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
      }}>
        Claude Code CLI not found
      </div>

      <div style={{
        fontSize: '12px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-secondary)',
        lineHeight: 1.5,
        maxWidth: 280,
      }}>
        ClawBar drives your installed <code>claude</code> binary.
        Install it once with:
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--color-bg-tertiary)',
        border: '0.5px solid var(--color-border-primary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11.5px',
        color: 'var(--color-text-primary)',
        maxWidth: '100%',
      }}>
        <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {INSTALL_CMD}
        </code>
        <button
          onClick={handleCopy}
          aria-label="Copy install command"
          title={copied ? 'Copied!' : 'Copy'}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: copied ? 'var(--color-status-connected)' : 'var(--color-text-tertiary)',
            display: 'flex', alignItems: 'center', padding: 2,
          }}
        >
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
        </button>
      </div>

      <button
        onClick={handleRecheck}
        disabled={busy}
        style={{
          marginTop: 4,
          padding: '7px 16px',
          borderRadius: 8,
          border: '0.5px solid var(--color-border-primary)',
          background: 'var(--color-surface-card)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          cursor: busy ? 'default' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <RefreshCw size={13} strokeWidth={1.75} style={{ animation: busy ? 'cl-spin 0.8s linear infinite' : undefined }} />
        Recheck
        <style>{`@keyframes cl-spin { to { transform: rotate(360deg); } }`}</style>
      </button>
    </div>
  );
}
