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

function parseLogLine(raw: unknown): LogEntry | null {
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return { level: 'info', msg: raw, time: undefined }; }
  } else if (typeof raw === 'object' && raw !== null) {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }

  const meta = obj._meta as { logLevelName?: string; date?: string } | undefined;
  const level = (meta?.logLevelName || '').toLowerCase() || (typeof obj.level === 'string' ? obj.level.toLowerCase() : 'info');
  const time = meta?.date || (typeof obj.time === 'string' ? obj.time : undefined);

  // Extract message: try common fields, then numeric keys
  let msg = '';
  if (typeof obj.msg === 'string') msg = obj.msg;
  else if (typeof obj.message === 'string') msg = obj.message;
  else if (typeof obj['1'] === 'string') msg = obj['1'];
  else if (typeof obj['0'] === 'string') msg = `[${obj['0']}]${typeof obj['1'] === 'string' ? ' ' + obj['1'] : ''}`;
  else {
    // Last resort: find any string value
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_meta') continue;
      if (typeof v === 'string' && v.length > 0) { msg = v; break; }
    }
  }
  if (!msg) msg = JSON.stringify(obj).slice(0, 200);

  return { level, msg: String(msg).slice(0, 300), time };
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
    let received = false;

    const unsub = api.onResponse((resp) => {
      if (received) return;
      const p = resp.payload as Record<string, unknown> | undefined;
      if (resp.ok && p && 'lines' in p && Array.isArray(p.lines)) {
        received = true;
        unsub();
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
    });

    api.send('logs.tail', {}).catch(() => setError('Failed to send logs.tail'));

    const timer = setTimeout(() => { if (!received) { unsub(); setLoaded(true); } }, 6000);
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
