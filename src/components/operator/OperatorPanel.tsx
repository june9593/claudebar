import { useEffect, useState } from 'react';
import { LayoutGrid, MessageSquare, Package, Sparkles, Terminal, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useApprovalsStore } from '../../stores/approvalsStore';

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
  const [tokensToday, setTokensToday] = useState<{ input: number; output: number } | null>(null);

  useEffect(() => {
    void window.electronAPI?.claude?.checkCli().then((r: CliStatus) => setCli(r));
    void window.electronAPI?.claude?.scanProjects?.()
      .then((r) => setProjectCount(r.length))
      .catch(() => setProjectCount(null));
    // Stats IPC added in Task 24 — try, gracefully skip if not yet wired
    void (window.electronAPI as unknown as { stats?: { today: () => Promise<{ input: number; output: number }> } }).stats?.today?.()
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
          </>
        )}
      </Card>
    </div>
  );
}
function SessionsTab() { return <Stub label="Sessions" />; }
function PluginsTab() { return <Stub label="Plugins" />; }
function SkillsTab() { return <Stub label="Skills" />; }
function CommandsTab() { return <Stub label="Commands" />; }
function StatsTab() { return <Stub label="Stats" />; }
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
