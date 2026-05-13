import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClaudeSessionsStore } from '../../stores/claudeSessionsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { shortName, firstLetter, colorFromKey } from '../../utils/session-icon';

interface Props {
  onClose: () => void;
}

type Step = 'projects' | 'sessions';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AddSessionWizard({ onClose }: Props) {
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

  const addClaude = useSessionStore((s) => s.addClaude);

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
    finish(crypto.randomUUID(), '');
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 360, maxHeight: '80vh', overflowY: 'auto',
          background: 'var(--color-bg-primary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 16, zIndex: 100,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>
          {step === 'projects' ? 'Pick a project' : `Pick a session — ${shortName(pickedProject?.decodedPath ?? '')}`}
        </div>

        {(cliCheckState === 'loading' || cliCheckState === 'idle') && <Spinner label="Checking for Claude CLI…" />}
        {cliStatus && !cliStatus.found && (
          <div style={{ padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Claude CLI not found</div>
            <pre style={{ background: 'var(--color-bg-input)', padding: 8, borderRadius: 6, fontSize: 11 }}>npm install -g @anthropic-ai/claude-code</pre>
          </div>
        )}

        {cliStatus?.found && step === 'projects' && (
          <>
            {projectsState === 'loading' && <Spinner label="Scanning projects…" />}
            {projectsState === 'error' && <ErrorBox msg={errorMsg ?? 'unknown error'} />}
            {projectsState === 'ready' && projects.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                No projects yet. Run <code>claude</code> in a directory first.
              </div>
            )}
            {projectsState === 'ready' && projects.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPickedProject({ key: p.key, decodedPath: p.decodedPath }); setStep('sessions'); loadSessions(p.key); }}
                style={rowStyle}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.decodedPath}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}</div>
                </div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>
              </button>
            ))}
          </>
        )}

        {cliStatus?.found && step === 'sessions' && pickedProject && (
          <>
            <button
              onClick={() => { setStep('projects'); setPickedProject(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, marginBottom: 8 }}
            >
              ← Projects
            </button>
            <button onClick={newSession} style={{ ...rowStyle, color: 'var(--color-accent)' }}>
              <span style={{ fontSize: 18, marginRight: 4 }}>+</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>New session in this directory</span>
            </button>
            {(() => {
              const state = sessionsState[pickedProject.key];
              const list = sessionsByKey[pickedProject.key] ?? [];
              if (state === 'loading') return <Spinner label="Loading sessions…" inline />;
              if (state === 'error') return <ErrorBox msg={errorMsg ?? 'unknown error'} />;
              if (state === 'ready' && list.length === 0) {
                return <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No sessions yet.</div>;
              }
              return list.map((s) => (
                <button key={s.sessionId} onClick={() => finish(s.sessionId, s.preview)} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview || '(empty session)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{relativeTime(s.mtime)}</div>
                  </div>
                </button>
              ));
            })()}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12, padding: '4px 10px' }}
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
    <div style={{ padding: inline ? '8px 0' : '20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      <span style={{ width: 12, height: 12, border: '2px solid var(--color-border-primary)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'cw-spin 0.8s linear infinite' }} />
      <span>{label}</span>
      <style>{`@keyframes cw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ padding: 10, fontSize: 12, color: 'var(--color-status-disconnected, #e53)', background: 'var(--color-bg-input)', borderRadius: 6, margin: '6px 0' }}>{msg}</div>;
}
