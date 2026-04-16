import { useState, useEffect } from 'react';

interface Agent {
  agentId: string;
  enabled: boolean;
  every?: string;
  everyMs?: number;
}

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    let cancelled = false;

    const unsub = api.onResponse((resp) => {
      if (cancelled) return;
      const p = resp.payload as Record<string, unknown> | undefined;
      if (resp.ok && p && 'heartbeat' in p) {
        const hb = p.heartbeat as { agents?: Agent[] };
        setAgents(hb.agents ?? []);
        setLoading(false);
      }
    });

    api.send('status', {}).catch(() => {
      if (!cancelled) {
        setError('Failed to send status');
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  return (
    <ViewShell title="Agents">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : agents.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {agents.map((agent) => (
            <div
              key={agent.agentId}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                borderLeft: `3px solid ${agent.enabled ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '13px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}>
                    {agent.agentId}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: agent.enabled ? 'var(--color-status-connected)' : 'var(--color-bg-tertiary)',
                    color: agent.enabled ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
                  }}>
                    {agent.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                {agent.every && (
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    heartbeat: {agent.every}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ViewShell>
  );
}

function ViewShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: '13px', fontFamily: 'var(--font-sans)',
    }}>
      Loading…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-status-disconnected)', fontSize: '13px', fontFamily: 'var(--font-sans)',
      padding: '0 14px', textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: '13px', fontFamily: 'var(--font-sans)',
    }}>
      No agents found
    </div>
  );
}
