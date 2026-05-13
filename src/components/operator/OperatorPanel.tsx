import { useEffect, useState } from 'react';
import { LayoutGrid, MessageSquare, Package, Sparkles, Terminal, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useApprovalsStore } from '../../stores/approvalsStore';
import { useClaudeSessionsStore } from '../../stores/claudeSessionsStore';
import { shortName, firstLetter, colorFromKey } from '../../utils/session-icon';

export type Tab = 'overview' | 'sessions' | 'plugins' | 'skills' | 'commands' | 'stats' | 'settings';

interface Props {
  onClose: () => void;
  initialTab?: Tab;
}

const TABS: Array<{ id: Tab; label: string; Icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutGrid },
  { id: 'sessions', label: 'Sessions', Icon: MessageSquare },
  { id: 'plugins', label: 'Plugins', Icon: Package },
  { id: 'skills', label: 'Skills', Icon: Sparkles },
  { id: 'commands', label: 'Commands', Icon: Terminal },
  { id: 'stats', label: 'Stats', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function OperatorPanel({ onClose, initialTab = 'overview' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320, height: '100%',
          background: 'var(--color-bg-primary)',
          borderRight: '0.5px solid var(--color-border-primary)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <TabStrip tab={tab} setTab={setTab} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'sessions' && <SessionsTab />}
          {tab === 'plugins' && <PluginsTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'commands' && <CommandsTab />}
          {tab === 'stats' && <StatsTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

function TabStrip({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
      padding: '4px 8px',
      gap: 2,
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={label}
            aria-label={label}
            style={{
              background: active ? 'var(--color-surface-hover)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              padding: '6px 8px', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11,
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

// Stub bodies — Tasks 21-26 fill these in.
interface CliStatus { found: boolean; path?: string; version?: string }

function OverviewTab() {
  const sessions = useSessionStore((s) => s.sessions);
  const pending = useApprovalsStore((s) => Object.values(s.countBySession).reduce((a, b) => a + b, 0));

  const [cli, setCli] = useState<CliStatus | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [tokensToday, setTokensToday] = useState<{ input: number; output: number; cache_creation: number; cache_read: number } | null>(null);

  useEffect(() => {
    void window.electronAPI?.claude?.checkCli().then((r: CliStatus) => setCli(r));
    void window.electronAPI?.claude?.scanProjects?.()
      .then((r) => setProjectCount(r.length))
      .catch(() => setProjectCount(null));
    void window.electronAPI.stats.today()
      .then(setTokensToday)
      .catch(() => setTokensToday(null));
  }, []);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="Claude CLI">
        {!cli && <Skel />}
        {cli && cli.found && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <div>Path: <code style={{ fontSize: 11 }}>{cli.path}</code></div>
            <div>Version: {cli.version || '(unknown)'}</div>
          </div>
        )}
        {cli && !cli.found && (
          <div style={{ fontSize: 12, color: 'var(--color-status-disconnected, #e53)' }}>
            Not found. Install with <code>npm install -g @anthropic-ai/claude-code</code>.
          </div>
        )}
      </Card>

      <Card title="Workspace">
        <Row label="Projects" value={projectCount ?? '…'} />
        <Row label="Active sessions" value={sessions.length} />
        <Row label="Pending approvals" value={pending} highlight={pending > 0} />
      </Card>

      <Card title="Today's tokens">
        {!tokensToday && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>(no usage data yet)</div>}
        {tokensToday && (
          <>
            <Row label="Input" value={tokensToday.input.toLocaleString()} />
            <Row label="Output" value={tokensToday.output.toLocaleString()} />
            {(tokensToday.cache_read > 0 || tokensToday.cache_creation > 0) && (
              <Row label="Cache read" value={tokensToday.cache_read.toLocaleString()} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
function SessionsTab() {
  const projects = useClaudeSessionsStore((s) => s.projects);
  const projectsState = useClaudeSessionsStore((s) => s.projectsState);
  const sessionsByKey = useClaudeSessionsStore((s) => s.sessionsByKey);
  const sessionsState = useClaudeSessionsStore((s) => s.sessionsState);
  const loadProjects = useClaudeSessionsStore((s) => s.loadProjects);
  const loadSessions = useClaudeSessionsStore((s) => s.loadSessions);
  const addClaude = useSessionStore((s) => s.addClaude);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  if (projectsState === 'loading' || projectsState === 'idle') {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Scanning…</div>;
  }
  if (projects.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No projects.</div>;
  }

  const onToggle = (key: string) => {
    const newExpanded = !expanded[key];
    setExpanded((s) => ({ ...s, [key]: newExpanded }));
    if (newExpanded && !sessionsByKey[key]) void loadSessions(key);
  };

  const onResume = (projectKey: string, decodedPath: string, sessionId: string, preview: string) => {
    addClaude({
      projectDir: decodedPath,
      projectKey,
      sessionId,
      preview,
      iconLetter: firstLetter(shortName(decodedPath)),
      iconColor: colorFromKey(projectKey),
    });
  };

  return (
    <div style={{ padding: 8 }}>
      {projects.map((p) => (
        <div key={p.key} style={{ marginBottom: 4 }}>
          <button
            onClick={() => onToggle(p.key)}
            style={{
              width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: 6,
              fontSize: 12, color: 'var(--color-text-primary)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {expanded[p.key] ? '▾ ' : '▸ '}{p.decodedPath.split('/').pop()}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{p.sessionCount}</span>
          </button>
          {expanded[p.key] && (
            <div style={{ paddingLeft: 16 }}>
              {sessionsState[p.key] === 'loading' && <div style={{ fontSize: 11, padding: 6, color: 'var(--color-text-tertiary)' }}>loading…</div>}
              {(sessionsByKey[p.key] ?? []).map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => onResume(p.key, p.decodedPath, s.sessionId, s.preview)}
                  style={{
                    display: 'block', width: '100%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6,
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {s.preview || '(empty session)'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
type PluginsData = Awaited<ReturnType<typeof window.electronAPI.plugins.list>>;

function PluginsTab() {
  const [data, setData] = useState<PluginsData | null>(null);

  useEffect(() => {
    void window.electronAPI.plugins.list().then(setData);
  }, []);

  if (!data) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  if (data.plugins.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No plugins installed.</div>;
  }

  // Group by marketplace
  const byMarket: Record<string, typeof data.plugins> = {};
  for (const p of data.plugins) {
    (byMarket[p.marketplace] ??= []).push(p);
  }

  return (
    <div style={{ padding: 12 }}>
      {Object.entries(byMarket).map(([market, plugins]) => (
        <div key={market} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 6, letterSpacing: 0.5 }}>
            {market}
          </div>
          {plugins.map((p) => {
            const shortPluginName = p.name.split('@')[0];
            return (
              <div
                key={p.name + ':' + p.installPath}
                style={{
                  padding: '8px 10px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 6, marginBottom: 4,
                  border: '0.5px solid var(--color-border-primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{shortPluginName}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>v{p.version}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {p.scope} · installed {new Date(p.installedAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
type SkillsList = Awaited<ReturnType<typeof window.electronAPI.skills.list>>;
type CommandsList = Awaited<ReturnType<typeof window.electronAPI.commands.list>>;

const SOURCE_COLORS: Record<'user' | 'project' | 'plugin', string> = {
  user: 'var(--color-accent, #7c6af7)',
  project: 'var(--color-status-connected, #3a9)',
  plugin: 'var(--color-text-tertiary)',
};

function SourceBadge({ source }: { source: 'user' | 'project' | 'plugin' }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
      color: SOURCE_COLORS[source],
      border: `0.5px solid ${SOURCE_COLORS[source]}`,
      borderRadius: 3, padding: '1px 4px',
    }}>
      {source}
    </span>
  );
}

function SkillsTab() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((x) => x.id === activeSessionId) ?? null;
  const projectDir = activeSession?.projectDir;

  const [items, setItems] = useState<SkillsList | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void window.electronAPI.skills.list(projectDir).then(setItems);
  }, [projectDir]);

  if (!items) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;

  const visible = filter
    ? items.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter skills…"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--color-bg-input)', border: '0.5px solid var(--color-border-primary)',
          borderRadius: 6, padding: '5px 8px',
          fontSize: 12, color: 'var(--color-text-primary)', outline: 'none',
        }}
      />
      {visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {items.length === 0 ? 'No skills found.' : 'No matches.'}
        </div>
      )}
      {visible.map((s) => (
        <div
          key={s.dir}
          style={{
            padding: '8px 10px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 6,
            border: '0.5px solid var(--color-border-primary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</span>
            <SourceBadge source={s.source} />
          </div>
          {s.description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.description}</div>
          )}
          {s.pluginName && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>via {s.pluginName}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CommandsTab() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((x) => x.id === activeSessionId) ?? null;
  const projectDir = activeSession?.projectDir;

  const [items, setItems] = useState<CommandsList | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void window.electronAPI.commands.list(projectDir).then(setItems);
  }, [projectDir]);

  if (!items) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;

  const visible = filter
    ? items.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) || c.description.toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter commands…"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--color-bg-input)', border: '0.5px solid var(--color-border-primary)',
          borderRadius: 6, padding: '5px 8px',
          fontSize: 12, color: 'var(--color-text-primary)', outline: 'none',
        }}
      />
      {visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {items.length === 0 ? 'No commands found.' : 'No matches.'}
        </div>
      )}
      {visible.map((c) => (
        <div
          key={c.filePath}
          style={{
            padding: '8px 10px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 6,
            border: '0.5px solid var(--color-border-primary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>/{c.name}</span>
            <SourceBadge source={c.source} />
          </div>
          {c.description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.description}</div>
          )}
          {c.pluginName && (
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>via {c.pluginName}</div>
          )}
        </div>
      ))}
    </div>
  );
}

type StatsPayload = Awaited<ReturnType<typeof window.electronAPI.stats.get>>;

function StatsTab() {
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    void window.electronAPI.stats.get().then(setData);
  }, []);

  if (!data) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading stats…</div>;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Build last 14 days array
  // Per spec: input column lumps cache_read in (cache reads are user-attributable
  // input volume even though they're not billed at the same rate).
  const days: Array<{ date: string; input: number; output: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = data.tokensByDay[key];
    days.push({
      date: key,
      input: (bucket?.input ?? 0) + (bucket?.cache_read ?? 0),
      output: bucket?.output ?? 0,
    });
  }

  const maxTokens = Math.max(...days.map((d) => d.input + d.output), 1);

  const todayBucket = data.tokensByDay[today];
  const models = Object.entries(data.byModel).sort((a, b) => {
    const ta = a[1].input + a[1].output;
    const tb = b[1].input + b[1].output;
    return tb - ta;
  });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="All-time totals">
        <Row label="Input tokens" value={data.totals.input.toLocaleString()} />
        <Row label="Output tokens" value={data.totals.output.toLocaleString()} />
        <Row label="Cache read" value={data.totals.cache_read.toLocaleString()} />
        <Row label="Cache creation" value={data.totals.cache_creation.toLocaleString()} />
      </Card>

      <Card title="Today">
        {!todayBucket && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No usage today yet.</div>}
        {todayBucket && (
          <>
            <Row label="Input" value={todayBucket.input.toLocaleString()} />
            <Row label="Output" value={todayBucket.output.toLocaleString()} />
          </>
        )}
      </Card>

      <Card title="Last 14 days">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginBottom: 4 }}>
          {days.map((d) => {
            const total = d.input + d.output;
            const heightPct = total / maxTokens;
            const isToday = d.date === today;
            return (
              <div
                key={d.date}
                title={`${d.date}: ${total.toLocaleString()} tokens`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
              >
                <div style={{
                  width: '100%',
                  height: `${Math.max(heightPct * 100, total > 0 ? 4 : 1)}%`,
                  background: isToday ? 'var(--color-accent, #7c6af7)' : 'var(--color-text-tertiary)',
                  borderRadius: '2px 2px 0 0',
                  opacity: isToday ? 1 : 0.5,
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--color-text-tertiary)' }}>
          <span>{days[0].date.slice(5)}</span>
          <span>today</span>
        </div>
      </Card>

      {models.length > 0 && (
        <Card title="By model">
          {models.map(([model, bucket]) => {
            const shortModel = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
            return (
              <div key={model} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={model}>{shortModel}</div>
                <Row label="In" value={(bucket.input).toLocaleString()} />
                <Row label="Out" value={(bucket.output).toLocaleString()} />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
function SettingsTab() { return <Stub label="Settings" />; }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '0.5px solid var(--color-border-primary)',
      borderRadius: 8,
      padding: 10,
      background: 'var(--color-bg-secondary)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--color-status-disconnected, #e53)' : 'var(--color-text-primary)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function Skel() {
  return (
    <>
      <div style={{ height: 18, background: 'var(--color-bg-input)', borderRadius: 4, animation: 'cw-pulse 1.4s ease-in-out infinite' }} />
      <style>{`@keyframes cw-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
    </>
  );
}

function Stub({ label }: { label: string }) {
  return (
    <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      {label} — pending Phase 3 implementation.
    </div>
  );
}
