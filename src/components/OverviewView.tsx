import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface HealthData {
  ok: boolean;
  duration?: number;
  version?: string;
}

interface ChannelStatus {
  channel: string;
  status: string;
  [key: string]: unknown;
}

export function OverviewView() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    setLoading(true);

    let healthReqId = '';
    let channelsReqId = '';
    let statusReqId = '';
    let got = { health: false, channels: false, status: false };

    const checkDone = () => {
      if (got.health && got.channels && got.status) {
        setLoading(false);
        unsub();
      }
    };

    const unsub = api.onResponse((resp) => {
      if (resp.id === healthReqId) {
        if (resp.ok) {
          const p = resp.payload as { ok?: boolean; duration?: number; version?: string } | undefined;
          if (p) setHealth({ ok: p.ok ?? true, duration: p.duration, version: p.version });
        }
        got.health = true;
        checkDone();
      }
      if (resp.id === channelsReqId) {
        if (resp.ok) {
          const p = resp.payload as { channels?: ChannelStatus[] } | undefined;
          if (p?.channels) setChannels(p.channels);
        }
        got.channels = true;
        checkDone();
      }
      if (resp.id === statusReqId) {
        if (resp.ok) {
          const p = resp.payload as { version?: string; heartbeat?: { agents?: unknown[] } } | undefined;
          if (p?.version) setVersion(p.version);
          if (p?.heartbeat?.agents) setAgentCount(p.heartbeat.agents.length);
        }
        got.status = true;
        checkDone();
      }
    });

    api.send('health', {}).then(r => { if (r.ok && r.id) healthReqId = r.id; else got.health = true; }).catch(() => { got.health = true; });
    api.send('channels.status', {}).then(r => { if (r.ok && r.id) channelsReqId = r.id; else got.channels = true; }).catch(() => { got.channels = true; });
    api.send('status', {}).then(r => { if (r.ok && r.id) statusReqId = r.id; else got.status = true; }).catch(() => { got.status = true; });

    const timer = setTimeout(() => { setLoading(false); unsub(); }, 8000);
    return () => { clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    const cleanup = fetchData();
    return () => cleanup?.();
  }, [fetchData]);

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{ padding: '12px 14px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          Overview
        </span>
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
            {/* Health card */}
            <div style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--color-bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}>
                  Gateway Health
                </span>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: health?.ok ? 'var(--color-status-connected)' : 'var(--color-status-disconnected)',
                  color: 'var(--color-bubble-user-text)',
                }}>
                  {health?.ok ? 'OK' : 'Error'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {version && (
                  <InfoPill label="Version" value={version} />
                )}
                {health?.duration != null && (
                  <InfoPill label="Latency" value={`${health.duration}ms`} />
                )}
                {agentCount != null && (
                  <InfoPill label="Agents" value={String(agentCount)} />
                )}
              </div>
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
                    <div key={ch.channel} style={{
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
                        {ch.channel}
                      </span>
                      <ChannelBadge status={ch.status} />
                    </div>
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{
        fontSize: '11px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-tertiary)',
      }}>
        {label}:
      </span>
      <span style={{
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-secondary)',
      }}>
        {value}
      </span>
    </div>
  );
}

function ChannelBadge({ status }: { status: string }) {
  const isGood = status === 'running' || status === 'configured' || status === 'connected';
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
