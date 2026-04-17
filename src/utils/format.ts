/**
 * Shared formatters. Semantics preserved from the original callsites —
 * see SessionsView.tsx / ChatHistory.tsx / OverviewView.tsx history.
 */

export interface SessionNameable {
  key: string;
  displayName?: string;
}

/** Prefer displayName; else derive from last `:`-segment of key (clawbar-* → "New Chat"). */
export function formatSessionName(session: SessionNameable): string {
  if (session.displayName) return session.displayName;
  const parts = session.key.split(':');
  const last = parts[parts.length - 1];
  if (last.startsWith('clawbar-')) return 'New Chat';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Past-only relative time. Accepts ISO string / undefined. '' if undefined. */
export function timeAgo(ts: string | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Handles past and future ms timestamps with rounding (`just now` / `in <1m`). */
export function formatRelative(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  if (abs < 60_000) return future ? 'in <1m' : 'just now';
  if (abs < 3600_000) {
    const m = Math.round(abs / 60_000);
    return future ? `in ${m}m` : `${m}m ago`;
  }
  if (abs < 86400_000) {
    const h = Math.round(abs / 3600_000);
    return future ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.round(abs / 86400_000);
  return future ? `in ${d}d` : `${d}d ago`;
}
