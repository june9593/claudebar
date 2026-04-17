import { useState } from 'react';
import { useWsRequest } from '../hooks/useWsRequest';

type DateRange = 'today' | '7d' | '30d';

interface SessionUsage {
  key: string;
  kind: string;
  usage: {
    totalTokens: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    messageCounts: { total: number; errors: number };
    toolUsage: { totalCalls: number };
    durationMs: number;
  };
}

interface UsagePayload {
  sessions?: SessionUsage[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n: number): string {
  return '$' + n.toFixed(4);
}

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatSessionKey(key: string): string {
  const parts = key.split(':');
  return parts[parts.length - 1] || key;
}

export function UsageView() {
  const [range, setRange] = useState<DateRange>('7d');
  const { startDate, endDate } = getDateRange(range);

  const { data: payload, loading } = useWsRequest<UsagePayload>(
    'sessions.usage',
    { startDate, endDate, limit: 100 },
    [startDate, endDate],
  );

  const sessions = payload?.sessions ?? [];
  const totalTokens = sessions.reduce((s, x) => s + (x.usage?.totalTokens ?? 0), 0);
  const totalCost = sessions.reduce((s, x) => s + (x.usage?.totalCost ?? 0), 0);
  const data = payload ? { sessions, totalTokens, totalCost } : null;

  const handleRangeChange = (r: DateRange) => {
    setRange(r);
  };

  const ranges: { id: DateRange; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7d' },
    { id: '30d', label: '30d' },
  ];

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      background: 'var(--color-bg-chat)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          Usage
        </span>
        {/* Date range pills */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => handleRangeChange(r.id)}
              style={{
                padding: '3px 10px',
                borderRadius: '12px',
                border: 'none',
                background: range === r.id ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: range === r.id ? 'var(--color-bubble-user-text)' : 'var(--color-text-secondary)',
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '13px',
        }}>
          Loading usage data…
        </div>
      ) : data ? (
        <>
          {/* Total summary cards */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <StatCard label="Total Cost" value={formatCost(data.totalCost)} />
            <StatCard label="Total Tokens" value={formatTokens(data.totalTokens)} />
          </div>

          {/* Per-session breakdown */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <span style={{
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              letterSpacing: '0.3px',
            }}>
              Sessions ({data.sessions.length})
            </span>

            {data.sessions.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: '12px',
              }}>
                No usage data for this period
              </div>
            ) : (
              data.sessions.map((session) => (
                <div key={session.key} style={{
                  background: 'var(--color-surface-card)',
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}>
                  {/* Session header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {formatSessionKey(session.key)}
                      </span>
                      {session.kind && (
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-tertiary)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'var(--color-bg-tertiary)',
                          flexShrink: 0,
                        }}>
                          {session.kind}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}>
                      {formatCost(session.usage?.totalCost ?? 0)}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <MiniStat label="Tokens" value={formatTokens(session.usage?.totalTokens ?? 0)} />
                    <MiniStat label="In" value={formatTokens(session.usage?.inputTokens ?? 0)} />
                    <MiniStat label="Out" value={formatTokens(session.usage?.outputTokens ?? 0)} />
                    <MiniStat label="Msgs" value={String(session.usage?.messageCounts?.total ?? 0)} />
                    <MiniStat label="Tools" value={String(session.usage?.toolUsage?.totalCalls ?? 0)} />
                    {(session.usage?.durationMs ?? 0) > 0 && (
                      <MiniStat label="Time" value={formatDuration(session.usage.durationMs)} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '13px',
        }}>
          Failed to load usage data
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--color-surface-card)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <span style={{
        fontSize: '12px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-tertiary)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '20px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        lineHeight: 1.2,
      }}>
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
      <span style={{
        fontSize: '10px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-tertiary)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-primary)',
      }}>
        {value}
      </span>
    </div>
  );
}
