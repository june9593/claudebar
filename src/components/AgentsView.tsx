import { useState, useEffect, useCallback } from 'react';

interface AgentInfo {
  id: string;
  name?: string;
  enabled: boolean;
  every?: string;
  avatar?: string;
  emoji?: string;
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    let listReqId = '';
    let statusReqId = '';
    let listAgents: { id: string; name?: string }[] = [];
    let heartbeatAgents: { agentId: string; enabled: boolean; every?: string }[] = [];
    let gotList = false;
    let gotStatus = false;
    const identityMap = new Map<string, { avatar?: string; emoji?: string }>();
    let pendingIdentity = 0;

    const unsub = api.onResponse((resp) => {
      if (resp.id === listReqId && resp.ok) {
        const p = resp.payload as { agents?: { id: string; name?: string }[] } | undefined;
        if (p?.agents) listAgents = p.agents;
        gotList = true;
      }
      if (resp.id === statusReqId && resp.ok) {
        const p = resp.payload as { heartbeat?: { agents?: { agentId: string; enabled: boolean; every?: string }[] } } | undefined;
        if (p?.heartbeat?.agents) heartbeatAgents = p.heartbeat.agents;
        gotStatus = true;
      }
      // Identity responses
      if (resp.ok && resp.payload) {
        const ip = resp.payload as { agentId?: string; avatar?: string; emoji?: string };
        if (ip.agentId && (ip.avatar !== undefined || ip.emoji !== undefined)) {
          identityMap.set(ip.agentId, { avatar: ip.avatar, emoji: ip.emoji });
          pendingIdentity--;
        }
      }

      if (gotList && gotStatus) {
        // Merge data
        const hbMap = new Map(heartbeatAgents.map(a => [a.agentId, a]));
        const merged: AgentInfo[] = listAgents.map(a => {
          const hb = hbMap.get(a.id);
          const ident = identityMap.get(a.id);
          return {
            id: a.id,
            name: a.name,
            enabled: hb?.enabled ?? false,
            every: hb?.every,
            avatar: ident?.avatar,
            emoji: ident?.emoji,
          };
        });
        setAgents(merged);
        if (pendingIdentity <= 0) {
          setLoading(false);
          unsub();
        }
      }
    });

    api.send('agents.list', {}).then(r => {
      if (r.ok && r.id) listReqId = r.id;
      else { gotList = true; }
    }).catch(() => { gotList = true; });

    api.send('status', {}).then(r => {
      if (r.ok && r.id) statusReqId = r.id;
      else { gotStatus = true; }
    }).catch(() => { gotStatus = true; });

    // Timeout: fetch identities after list+status, or bail
    const timer = setTimeout(() => {
      setLoading(false);
      unsub();
    }, 8000);

    return () => { clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    const cleanup = fetchAgents();
    return () => cleanup?.();

    // After initial load, fetch identities
  }, [fetchAgents]);

  // Fetch identities after agents loaded
  useEffect(() => {
    if (agents.length === 0 || loading) return;
    const api = window.electronAPI?.ws;
    if (!api) return;

    const needIdentity = agents.filter(a => !a.avatar && !a.emoji);
    if (needIdentity.length === 0) return;

    const identReqIds = new Map<string, string>();

    const unsub = api.onResponse((resp) => {
      if (!resp.ok) return;
      // Find which agent this identity response is for
      for (const [agentId, reqId] of identReqIds) {
        if (resp.id === reqId) {
          const p = resp.payload as { avatar?: string; emoji?: string } | undefined;
          if (p) {
            setAgents(prev => prev.map(a =>
              a.id === agentId ? { ...a, avatar: p.avatar, emoji: p.emoji } : a
            ));
          }
          identReqIds.delete(agentId);
          break;
        }
      }
      if (identReqIds.size === 0) unsub();
    });

    for (const a of needIdentity) {
      api.send('agent.identity.get', { agentId: a.id }).then(r => {
        if (r.ok && r.id) identReqIds.set(a.id, r.id);
      });
    }

    const timer = setTimeout(() => unsub(), 6000);
    return () => { clearTimeout(timer); unsub(); };
  }, [agents.length, loading]);

  const resolveEmoji = (agent: AgentInfo): string => {
    // If avatar is a URL path (starts with /), it needs auth — use emoji instead
    if (agent.emoji) return agent.emoji;
    if (agent.avatar && !agent.avatar.startsWith('/')) return agent.avatar;
    return '🦞';
  };

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
          {agents.map((agent) => {
            const emoji = resolveEmoji(agent);
            return (
              <div
                key={agent.id}
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
                {/* Avatar */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                  fontSize: '18px',
                  lineHeight: 1,
                }}>
                  {emoji}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      color: 'var(--color-text-primary)',
                    }}>
                      {agent.name || agent.id}
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
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    {agent.id}{agent.every ? ` · heartbeat: ${agent.every}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
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


