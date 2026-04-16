import { useState, useEffect } from 'react';

export interface ApprovalRequest {
  id: string;
  request: {
    command: string;
    cwd: string | null;
    host: string | null;
    security: string | null;
    ask: string | null;
    agentId: string | null;
    resolvedPath: string | null;
    sessionKey: string | null;
  };
  createdAtMs: number;
  expiresAtMs: number;
}

export type ApprovalDecision = 'allow' | 'deny' | 'always-allow';

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onResolve: (id: string, decision: ApprovalDecision) => void;
}

function formatExpiry(expiresAtMs: number): string {
  const remaining = expiresAtMs - Date.now();
  if (remaining <= 0) return 'expired';
  const secs = Math.floor(remaining / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m`;
}

export function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  const [resolving, setResolving] = useState<ApprovalDecision | null>(null);
  const [expired, setExpired] = useState(false);
  const [, setTick] = useState(0);

  // Auto-expire + countdown tick
  useEffect(() => {
    const remaining = approval.expiresAtMs - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const interval = setInterval(() => {
      if (Date.now() >= approval.expiresAtMs) {
        setExpired(true);
        clearInterval(interval);
      } else {
        setTick(t => t + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.expiresAtMs]);

  const handleResolve = (decision: ApprovalDecision) => {
    setResolving(decision);
    onResolve(approval.id, decision);
  };

  if (expired) return null;

  const { request } = approval;
  const details: [string, string | null][] = [
    ['Host', request.host],
    ['Agent', request.agentId],
    ['Session', request.sessionKey],
    ['CWD', request.cwd],
    ['Resolved', request.resolvedPath],
    ['Security', request.security],
    ['Ask', request.ask],
  ];

  return (
    <div style={{
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-border-primary)',
      borderRadius: '12px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      opacity: resolving ? 0.6 : 1,
      transition: 'opacity 0.2s',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}>
          Exec approval needed
        </span>
        <span style={{
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-tertiary)',
        }}>
          expires in {formatExpiry(approval.expiresAtMs)}
        </span>
      </div>

      {/* Command */}
      <div style={{
        background: 'var(--color-bg-tertiary)',
        borderRadius: '8px',
        padding: '8px 12px',
      }}>
        <code style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          color: 'var(--color-text-primary)',
          lineHeight: 1.5,
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
        }}>
          {request.command}
        </code>
      </div>

      {/* Details table */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        fontSize: '11px',
        fontFamily: 'var(--font-sans)',
      }}>
        {details.map(([label, value]) => value ? (
          <div key={label} style={{ display: 'flex', gap: '8px' }}>
            <span style={{
              color: 'var(--color-text-tertiary)',
              minWidth: '60px',
              flexShrink: 0,
            }}>
              {label}
            </span>
            <span style={{
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {value}
            </span>
          </div>
        ) : null)}
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginTop: '2px',
      }}>
        <button
          onClick={() => handleResolve('allow')}
          disabled={resolving !== null}
          style={{
            padding: '6px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--color-accent)',
            color: 'var(--color-bubble-user-text)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            cursor: resolving ? 'default' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {resolving === 'allow' ? 'Allowing…' : 'Allow once'}
        </button>
        <button
          onClick={() => handleResolve('always-allow')}
          disabled={resolving !== null}
          style={{
            padding: '6px 16px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            cursor: resolving ? 'default' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {resolving === 'always-allow' ? '…' : 'Always allow'}
        </button>
        <button
          onClick={() => handleResolve('deny')}
          disabled={resolving !== null}
          style={{
            padding: '6px 16px',
            borderRadius: '8px',
            border: '1px solid var(--color-status-disconnected)',
            background: 'transparent',
            color: 'var(--color-status-disconnected)',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            cursor: resolving ? 'default' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {resolving === 'deny' ? 'Denying…' : 'Deny'}
        </button>
      </div>
    </div>
  );
}
