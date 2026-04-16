import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

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

function parseLogLine(raw: string): LogEntry | null {
  try {
    const obj = JSON.parse(raw);
    const meta = obj._meta as { logLevelName?: string; date?: string } | undefined;
    const level = (meta?.logLevelName || obj.level || 'info').toLowerCase();
    const time = meta?.date || obj.time;

    // Extract first meaningful string value as message
    let msg = obj.msg || obj.message || '';
    if (!msg) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === '_meta' || k === 'level' || k === 'time') continue;
        if (typeof v === 'string' && v.length > 0) { msg = v; break; }
      }
    }
    if (!msg) msg = raw.slice(0, 200);

    return { level, msg, time };
  } catch {
    return { level: 'info', msg: raw, time: undefined };
  }
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Set<LogLevel>>(new Set(['info', 'warn', 'error', 'fatal']));
  const [loaded, setLoaded] = useState(false);
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

  const fetchLogs = useCallback(() => {
    const api = window.electronAPI?.ws;
    if (!api) return;

    setError(null);
    let reqId = '';

    const unsub = api.onResponse((resp) => {
      if (resp.id !== reqId) return;
      if (!resp.ok) {
        setError(String(resp.error || 'Failed to fetch logs'));
        unsub();
        return;
      }

      const p = resp.payload as { lines?: string[]; file?: string; cursor?: unknown } | undefined;
      if (p?.lines && Array.isArray(p.lines)) {
        const entries: LogEntry[] = [];
        for (const line of p.lines) {
          const entry = parseLogLine(line);
          if (entry) entries.push(entry);
        }
        setLogs(prev => {
          const next = [...prev, ...entries];
          return next.length > 500 ? next.slice(-500) : next;
        });
        setLoaded(true);
      }
      unsub();
    });

    api.send('logs.tail', { level: 'trace' })
      .then((r) => {
        if (r.ok && r.id) reqId = r.id;
        else { setError(r.error || 'Failed to send logs.tail'); }
      })
      .catch(() => setError('Failed to send logs.tail'));

    const timer = setTimeout(() => { unsub(); setLoaded(true); }, 6000);
    return () => { clearTimeout(timer); unsub(); };
  }, []);

  useEffect(() => {
    const cleanup = fetchLogs();
    return () => cleanup?.();
  }, [fetchLogs]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScroll.current = atBottom;
  }, []);

  const handleRefresh = useCallback(() => {
    setLogs([]);
    setLoaded(false);
    fetchLogs();
  }, [fetchLogs]);

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
        <button
          onClick={handleRefresh}
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
              {logs.length === 0 ? (loaded ? 'No log entries' : 'Loading…') : 'No logs match filters'}
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
