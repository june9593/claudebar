import { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
  level: string;
  msg: string;
  time?: string;
  [key: string]: unknown;
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const LEVEL_COLORS: Record<string, string> = {
  trace: 'var(--color-text-tertiary)',
  debug: 'var(--color-text-tertiary)',
  info: 'var(--color-text-secondary)',
  warn: '#e6a700',
  error: 'var(--color-status-disconnected)',
  fatal: 'var(--color-status-disconnected)',
};

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Set<LogLevel>>(new Set(['info', 'warn', 'error', 'fatal']));
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  const toggleLevel = useCallback((level: LogLevel) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Subscribe to logs
  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api) return;

    let cancelled = false;

    const unsub = api.onResponse((resp) => {
      if (cancelled) return;
      if (!resp.ok) return;

      const p = resp.payload as Record<string, unknown> | undefined;
      if (!p) return;

      // Handle streaming log entries
      if ('level' in p && 'msg' in p) {
        setLogs((prev) => {
          const next = [...prev, p as unknown as LogEntry];
          // Keep at most 500 entries
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
      // Handle batch of entries
      if ('entries' in p && Array.isArray(p.entries)) {
        setLogs((prev) => {
          const next = [...prev, ...(p.entries as LogEntry[])];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    });

    api.send('logs.tail', { level: 'trace' })
      .then((r) => {
        if (!cancelled && r.ok) setSubscribed(true);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to subscribe to logs');
      });

    return () => { cancelled = true; unsub(); };
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScroll.current = atBottom;
  }, []);

  const filteredLogs = logs.filter((l) => filter.has(l.level as LogLevel));

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 8px',
        flexShrink: 0,
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
          Logs
        </span>
        {!subscribed && !error && (
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-tertiary)',
          }}>
            Connecting…
          </span>
        )}
      </div>

      {/* Level filter pills */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '0 14px 8px',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {LOG_LEVELS.map((level) => {
          const active = filter.has(level);
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 8px',
                borderRadius: '10px',
                border: '1px solid var(--color-border-secondary)',
                background: active ? 'var(--color-surface-active)' : 'transparent',
                color: active ? LEVEL_COLORS[level] : 'var(--color-text-tertiary)',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                transition: 'background 0.15s',
              }}
            >
              {level}
            </button>
          );
        })}
      </div>

      {error ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'var(--color-text-tertiary)',
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          padding: '0 14px',
          textAlign: 'center',
        }}>
          <span>{error}</span>
          <a
            href="http://localhost:18789/logs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px',
              color: 'var(--color-accent)',
              textDecoration: 'underline',
            }}
          >
            View in browser
          </a>
        </div>
      ) : (
        /* Log entries */
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0 10px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: 1.6,
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{
              color: 'var(--color-text-tertiary)',
              padding: '20px 4px',
              textAlign: 'center',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
            }}>
              {logs.length === 0 ? 'Waiting for log entries…' : 'No logs match filters'}
            </div>
          ) : (
            filteredLogs.map((entry, i) => (
              <div
                key={i}
                style={{
                  color: LEVEL_COLORS[entry.level] || 'var(--color-text-secondary)',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <span style={{ opacity: 0.6 }}>
                  {entry.time ? new Date(entry.time).toLocaleTimeString() : ''}
                </span>
                {' '}
                <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '10px' }}>
                  {entry.level}
                </span>
                {' '}
                {entry.msg}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
