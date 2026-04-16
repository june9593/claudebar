import { useState, useEffect } from 'react';

interface CronJob {
  name: string;
  every: string;
  agent: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: string;
}

interface CronData {
  enabled: boolean;
  nextWake?: string;
  jobs: CronJob[];
}

export function CronView() {
  const [data, setData] = useState<CronData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    let cancelled = false;

    const unsub = api.onResponse((resp) => {
      if (cancelled) return;
      const p = resp.payload as Record<string, unknown> | undefined;
      if (resp.ok && p && ('jobs' in p || 'enabled' in p)) {
        setData(p as unknown as CronData);
        setLoading(false);
      }
    });

    api.send('cron.status', {}).catch(() => {
      if (!cancelled) {
        setError('Failed to send cron.status');
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  if (loading) return <ViewShell title="Cron Jobs"><LoadingState /></ViewShell>;
  if (error) return <ViewShell title="Cron Jobs"><ErrorState message={error} /></ViewShell>;
  if (!data) return <ViewShell title="Cron Jobs"><EmptyState message="No cron data" /></ViewShell>;

  return (
    <ViewShell title="Cron Jobs">
      {/* Status header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 14px 8px',
      }}>
        <StatusBadge enabled={data.enabled} />
        {data.nextWake && (
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
          }}>
            Next: {data.nextWake}
          </span>
        )}
      </div>

      {/* Job list */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {data.jobs.length === 0 ? (
          <EmptyState message="No cron jobs configured" />
        ) : (
          data.jobs.map((job) => (
            <div
              key={job.name}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                borderLeft: `3px solid ${job.enabled ? 'var(--color-accent)' : 'var(--color-border-secondary)'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}>
                  {job.name}
                </span>
                <StatusBadge enabled={job.enabled} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'var(--color-bg-tertiary)',
                }}>
                  every {job.every}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'var(--color-bg-tertiary)',
                }}>
                  {job.agent}
                </span>
              </div>
              {job.lastRun && (
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-text-tertiary)',
                }}>
                  Last: {job.lastRun} {job.lastStatus ? `(${job.lastStatus})` : ''}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </ViewShell>
  );
}

/* ── Shared helpers ── */

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

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span style={{
      fontSize: '10px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      padding: '2px 6px',
      borderRadius: '4px',
      background: enabled ? 'var(--color-status-connected)' : 'var(--color-bg-tertiary)',
      color: enabled ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
    }}>
      {enabled ? 'enabled' : 'disabled'}
    </span>
  );
}

function LoadingState() {
  return (
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
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-status-disconnected)',
      fontSize: '13px',
      fontFamily: 'var(--font-sans)',
      padding: '0 14px',
      textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-text-tertiary)',
      fontSize: '13px',
      fontFamily: 'var(--font-sans)',
    }}>
      {message}
    </div>
  );
}
