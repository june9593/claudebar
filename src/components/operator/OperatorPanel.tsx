import { useState } from 'react';
import { LayoutGrid, MessageSquare, Package, Sparkles, Terminal, BarChart3, Settings as SettingsIcon } from 'lucide-react';

type Tab = 'overview' | 'sessions' | 'plugins' | 'skills' | 'commands' | 'stats' | 'settings';

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

// Stub bodies — Tasks 20-26 fill these in.
function OverviewTab() { return <Stub label="Overview" />; }
function SessionsTab() { return <Stub label="Sessions" />; }
function PluginsTab() { return <Stub label="Plugins" />; }
function SkillsTab() { return <Stub label="Skills" />; }
function CommandsTab() { return <Stub label="Commands" />; }
function StatsTab() { return <Stub label="Stats" />; }
function SettingsTab() { return <Stub label="Settings" />; }

function Stub({ label }: { label: string }) {
  return (
    <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      {label} — pending Phase 3 implementation.
    </div>
  );
}
