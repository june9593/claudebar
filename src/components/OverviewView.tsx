import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatRelative } from '../utils/format';

interface HealthData {
  ok: boolean;
  durationMs?: number;
  ts?: number;
}

interface ChannelInfo {
  id: string;
  configured: boolean;
  running: boolean;
  [key: string]: unknown;
}

interface AgentInfo {
  agentId: string;
  enabled: boolean;
  [key: string]: unknown;
}

interface CronData {
  enabled: boolean;
  nextWakeAtMs?: number;
}

export function OverviewView() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [cron, setCron] = useState<CronData | null>(null);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    setLoading(true);

    type ReqKey = 'health' | 'channels' | 'status' | 'sessions' | 'cron';
    const reqIds: Partial<Record<ReqKey, string>> = {};
    const got: Record<ReqKey, boolean> = { health: false, channels: false, status: false, sessions: false, cron: false };

    const requests: { key: ReqKey; method: string; onPayload: (p: unknown) => void }[] = [
      {
        key: 'health', method: 'health',
        onPayload: (p) => {
          const hp = p as { ok?: boolean; durationMs?: number; duration?: number; ts?: number } | undefined;
          if (hp) setHealth({ ok: hp.ok ?? true, durationMs: hp.durationMs ?? hp.duration, ts: hp.ts });
          setLastCheck(Date.now());
        },
      },
      {
        key: 'channels', method: 'channels.status',
        onPayload: (p) => {
          const cp = p as { channels?: Record<string, { configured?: boolean; running?: boolean }> } | undefined;
          if (cp?.channels && typeof cp.channels === 'object' && !Array.isArray(cp.channels)) {
            setChannels(Object.entries(cp.channels).map(([id, info]) => ({
              id, configured: info.configured ?? false, running: info.running ?? false,
            })));
          }
        },
      },
      {
        key: 'status', method: 'status',
        onPayload: (p) => {
          const sp = p as { heartbeat?: { agents?: AgentInfo[] } } | undefined;
          if (sp?.heartbeat?.agents) setAgents(sp.heartbeat.agents);
        },
      },
      {
        key: 'sessions', method: 'sessions.list',
        onPayload: (p) => {
          const ep = p as { count?: number; sessions?: unknown[] } | undefined;
          if (ep) setSessionCount(ep.count ?? ep.sessions?.length ?? null);
        },
      },
      {
        key: 'cron', method: 'cron.status',
        onPayload: (p) => {
          const rp = p as { enabled?: boolean; nextWakeAtMs?: number } | undefined;
          if (rp) setCron({ enabled: rp.enabled ?? false, nextWakeAtMs: rp.nextWakeAtMs });
        },
      },
    ];

    const checkDone = () => {
      if (requests.every(r => got[r.key])) { setLoading(false); unsub(); }
    };

    const unsub = api.onResponse((resp) => {
      for (const req of requests) {
        if (resp.id && resp.id === reqIds[req.key]) {
          if (resp.ok) req.onPayload(resp.payload);
          got[req.key] = true;
          checkDone();
          break;
        }
      }
    });

    for (const req of requests) {
      api.send(req.method, {})
        .then(r => { if (r.ok && r.id) reqIds[req.key] = r.id; else got[req.key] = true; })
        .catch(() => { got[req.key] = true; });
    }

    const timer = setTimeout(() => { setLoading(false); unsub(); }, 8000);
    return () => { clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    const cleanup = fetchData();
    return () => cleanup?.();
  }, [fetchData]);

  const channelCount = channels.filter(c => c.configured).length;

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{ padding: '12px 14px 4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '17px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}>
            Overview
          </span>
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-tertiary)',
          }}>
            Gateway status, entry points, and a fast health read.
          </span>
        </div>
        <button
          onClick={fetchData}
          title="Refresh"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <RefreshCw size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {loading ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
          }}>
            Loading…
          </div>
        ) : (
          <>
            {/* Snapshot grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px',
            }}>
              <StatCard
                label="Status"
                value={health?.ok ? 'OK' : 'Error'}
                valueColor={health?.ok ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)'}
                sub={lastCheck ? `Checked ${formatRelative(lastCheck)}` : undefined}
              />
              <StatCard
                label="Sessions"
                value={sessionCount != null ? String(sessionCount) : '—'}
                sub="Tracked session keys"
              />
              <StatCard
                label="Agents"
                value={agents.length > 0 ? String(agents.length) : '—'}
                sub={agents.length > 0 ? `${agents.filter(a => a.enabled).length} with heartbeat` : undefined}
              />
              <StatCard
                label="Channels"
                value={channelCount > 0 ? String(channelCount) : '—'}
                sub={channels.length > 0 ? `${channels.filter(c => c.running).length} running` : undefined}
              />
              <StatCard
                label="Cron"
                value={cron ? (cron.enabled ? 'Enabled' : 'Disabled') : '—'}
                valueColor={cron?.enabled ? 'var(--color-status-connected)' : undefined}
                sub={cron?.nextWakeAtMs ? `Next: ${formatRelative(cron.nextWakeAtMs)}` : undefined}
              />
            </div>

            {/* Channels */}
            {channels.length > 0 && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}>
                  Channels
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {channels.map((ch) => (
                    <div key={ch.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--color-bg-tertiary)',
                    }}>
                      <span style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--color-text-primary)',
                      }}>
                        {ch.id}
                      </span>
                      <ChannelBadge running={ch.running} configured={ch.configured} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agents */}
            {agents.length > 0 && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}>
                  Agents
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {agents.map((a) => (
                    <span key={a.agentId} style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border-secondary)',
                      background: a.enabled ? 'var(--color-surface-active)' : 'transparent',
                      color: a.enabled ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                    }}>
                      {a.agentId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor, sub }: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '8px',
      background: 'var(--color-bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <span style={{
        fontSize: '10px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '15px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: valueColor || 'var(--color-text-primary)',
      }}>
        {value}
      </span>
      {sub && (
        <span style={{
          fontSize: '9px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.2,
        }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function ChannelBadge({ running, configured }: { running: boolean; configured: boolean }) {
  const status = running ? 'running' : configured ? 'stopped' : 'unconfigured';
  const isGood = running;
  return (
    <span style={{
      fontSize: '10px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      padding: '2px 6px',
      borderRadius: '4px',
      background: isGood ? 'var(--color-status-connected)' : 'var(--color-bg-tertiary)',
      color: isGood ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
    }}>
      {status}
    </span>
  );
}
