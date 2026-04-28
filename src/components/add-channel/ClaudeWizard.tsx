import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClaudeSessionsStore } from '../../stores/claudeSessionsStore';
import { useChannelStore } from '../../stores/channelStore';
import { shortName, firstLetter, colorFromKey } from '../../utils/claude-icon';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
}

type Step = 'projects' | 'sessions';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ClaudeWizard({ x, y, onClose }: Props) {
  const cliStatus = useClaudeSessionsStore((s) => s.cliStatus);
  const cliCheckState = useClaudeSessionsStore((s) => s.cliCheckState);
  const projects = useClaudeSessionsStore((s) => s.projects);
  const projectsState = useClaudeSessionsStore((s) => s.projectsState);
  const sessionsByKey = useClaudeSessionsStore((s) => s.sessionsByKey);
  const sessionsState = useClaudeSessionsStore((s) => s.sessionsState);
  const errorMsg = useClaudeSessionsStore((s) => s.errorMsg);
  const checkCli = useClaudeSessionsStore((s) => s.checkCli);
  const loadProjects = useClaudeSessionsStore((s) => s.loadProjects);
  const loadSessions = useClaudeSessionsStore((s) => s.loadSessions);
  const reset = useClaudeSessionsStore((s) => s.reset);

  const addClaude = useChannelStore((s) => s.addClaude);

  const [step, setStep] = useState<Step>('projects');
  const [pickedProject, setPickedProject] = useState<{ key: string; decodedPath: string } | null>(null);

  useEffect(() => {
    reset();
    (async () => {
      await checkCli();
      const status = useClaudeSessionsStore.getState().cliStatus;
      if (status?.found) await loadProjects();
    })();
  }, [reset, checkCli, loadProjects]);

  const finish = (sessionId: string, preview: string) => {
    if (!pickedProject) return;
    const sn = shortName(pickedProject.decodedPath);
    addClaude({
      projectDir: pickedProject.decodedPath,
      projectKey: pickedProject.key,
      sessionId,
      preview,
      iconLetter: firstLetter(sn),
      iconColor: colorFromKey(pickedProject.key),
    });
    onClose();
  };

  const newSession = () => {
    if (!pickedProject) return;
    const id = crypto.randomUUID();
    finish(id, '');
  };

  const renderBody = () => {
    if (cliCheckState === 'loading' || cliCheckState === 'idle') {
      return <Spinner label="Checking for Claude CLI…" />;
    }
    if (cliStatus && !cliStatus.found) {
      return (
        <div style={{ padding: '12px 8px', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Claude CLI not found</div>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            ClawBar drives the <code>claude</code> command. Install it first:
          </div>
          <pre style={{
            background: 'var(--color-bg-input)', padding: 8, borderRadius: 6,
            fontSize: 12, fontFamily: 'var(--font-mono)', overflowX: 'auto',
          }}>npm install -g @anthropic-ai/claude-code</pre>
        </div>
      );
    }
    if (step === 'projects') {
      if (projectsState === 'loading') return <Spinner label="Scanning Claude projects…" />;
      if (projectsState === 'error') return <ErrorBox msg={errorMsg ?? 'unknown error'} />;
      if (projects.length === 0) {
        return (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            No Claude projects yet. Run <code>claude</code> in a directory first.
          </div>
        );
      }
      return (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {projects.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setPickedProject({ key: p.key, decodedPath: p.decodedPath });
                setStep('sessions');
                loadSessions(p.key);
              }}
              style={rowStyle}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.decodedPath}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}
                </div>
              </div>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>›</span>
            </button>
          ))}
        </div>
      );
    }
    // step === 'sessions'
    if (!pickedProject) return null;
    const state = sessionsState[pickedProject.key];
    const list = sessionsByKey[pickedProject.key] ?? [];
    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary)',
        }}>
          <button
            onClick={() => { setStep('projects'); setPickedProject(null); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 12 }}
          >
            ← Projects
          </button>
          <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortName(pickedProject.decodedPath)}
          </span>
        </div>
        <button onClick={newSession} style={{ ...rowStyle, color: 'var(--color-accent)' }}>
          <span style={{ fontSize: 18, marginRight: 4 }}>+</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>New session in this directory</span>
        </button>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
          {state === 'loading' && <Spinner label="Loading sessions…" inline />}
          {state === 'error' && <ErrorBox msg={errorMsg ?? 'unknown error'} />}
          {state === 'ready' && list.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No sessions in this project yet.
            </div>
          )}
          {state === 'ready' && list.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => finish(s.sessionId, s.preview)}
              style={rowStyle}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.preview || '(empty session)'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {relativeTime(s.mtime)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: x, top: y,
          width: 320,
          background: 'var(--color-bg-primary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 12,
          zIndex: 100,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>
          Add a Claude Code session
        </div>
        {renderBody()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)', fontSize: 12, padding: '4px 10px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '8px 8px', borderRadius: 6,
  border: 'none', background: 'transparent', cursor: 'pointer',
  textAlign: 'left',
};

function Spinner({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div style={{
      padding: inline ? '12px 0' : '24px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, color: 'var(--color-text-tertiary)', fontSize: 12,
    }}>
      <span style={{
        width: 12, height: 12, border: '2px solid var(--color-border-primary)',
        borderTopColor: 'var(--color-accent)', borderRadius: '50%',
        animation: 'cw-spin 0.8s linear infinite',
      }} />
      <span>{label}</span>
      <style>{`@keyframes cw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: 10, fontSize: 12, color: 'var(--color-status-disconnected)',
      background: 'var(--color-bg-input)', borderRadius: 6, margin: '6px 0',
    }}>
      {msg}
    </div>
  );
}
