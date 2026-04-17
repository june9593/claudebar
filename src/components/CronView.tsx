import { useState, useEffect, useCallback } from 'react';
import { ViewShell } from './views/ViewShell';
import { LoadingState, ErrorState, EmptyState } from './views/ViewStates';

interface CronSchedule {
  kind: string;
  expr: string;
  tz?: string;
}

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronSchedule;
  sessionTarget?: string;
  wakeMode?: string;
  payload?: { kind: string; [key: string]: unknown };
}

interface CronStatus {
  enabled: boolean;
  storePath?: string;
  jobs: number;
  nextWakeAtMs?: number;
}

export function CronView() {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    let statusReqId = '';
    let listReqId = '';
    let gotStatus = false;
    let gotList = false;

    const unsub = api.onResponse((resp) => {
      if (resp.id === statusReqId && resp.ok) {
        const p = resp.payload as CronStatus | undefined;
        if (p) setStatus(p);
        gotStatus = true;
      }
      if (resp.id === listReqId && resp.ok) {
        const p = resp.payload as { jobs?: CronJob[] } | undefined;
        if (p?.jobs) setJobs(p.jobs);
        gotList = true;
      }
      if (gotStatus && gotList) {
        setLoading(false);
        unsub();
      }
    });

    api.send('cron.status', {}).then(r => {
      if (r.ok && r.id) statusReqId = r.id;
      else { gotStatus = true; }
    }).catch(() => { gotStatus = true; });

    api.send('cron.list', {}).then(r => {
      if (r.ok && r.id) listReqId = r.id;
      else { gotList = true; }
    }).catch(() => { gotList = true; });

    const timer = setTimeout(() => {
      if (!gotStatus || !gotList) {
        setLoading(false);
        if (!gotStatus && !gotList) setError('Timeout fetching cron data');
      }
      unsub();
    }, 8000);

    return () => { clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    const cleanup = fetchData();
    return () => cleanup?.();
  }, [fetchData]);

  if (loading) return <ViewShell title="Cron Jobs" onRefresh={fetchData}><LoadingState /></ViewShell>;
  if (error) return <ViewShell title="Cron Jobs" onRefresh={fetchData}><ErrorState message={error} /></ViewShell>;

  return (
    <ViewShell title="Cron Jobs" onRefresh={fetchData}>
      {/* Status header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 14px 8px',
      }}>
        <StatusBadge enabled={status?.enabled ?? false} />
        {status?.nextWakeAtMs != null && (
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
          }}>
            Next: {new Date(status.nextWakeAtMs).toLocaleString()}
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
        {jobs.length === 0 ? (
          <EmptyState message="No cron jobs configured" />
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
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
              {job.description && (
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-text-secondary)',
                }}>
                  {job.description}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'var(--color-bg-tertiary)',
                }}>
                  {job.schedule.kind}: {job.schedule.expr}
                </span>
                {job.schedule.tz && (
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'var(--color-bg-tertiary)',
                  }}>
                    {job.schedule.tz}
                  </span>
                )}
                {job.sessionTarget && (
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-tertiary)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'var(--color-bg-tertiary)',
                  }}>
                    {job.sessionTarget}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </ViewShell>
  );
}

/* ── Shared helpers ── */

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

