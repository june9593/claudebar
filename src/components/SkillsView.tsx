import { useState, useEffect } from 'react';

interface Skill {
  name: string;
  description?: string;
  emoji?: string;
  source?: string;
  bundled?: boolean;
  disabled?: boolean;
  eligible?: boolean;
  requirements?: string[];
  missing?: string[];
}

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api) { setLoading(false); return; }

    let cancelled = false;

    const unsub = api.onResponse((resp) => {
      if (cancelled) return;
      const p = resp.payload as Record<string, unknown> | undefined;
      if (resp.ok && p && 'skills' in p) {
        setSkills((p.skills as Skill[]) ?? []);
        setLoading(false);
      }
    });

    api.send('skills.status', {}).catch(() => {
      if (!cancelled) {
        setError('Failed to send skills.status');
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  return (
    <ViewShell title="Skills">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : skills.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {skills.map((skill) => (
            <div
              key={skill.name}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {skill.emoji && (
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{skill.emoji}</span>
                )}
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}>
                  {skill.name}
                </span>

                {/* Badges */}
                {skill.bundled && <Badge label="bundled" />}
                {skill.disabled && <Badge label="disabled" variant="muted" />}
                {skill.missing && skill.missing.length > 0 && (
                  <Badge label="missing deps" variant="warn" />
                )}
              </div>

              {skill.description && (
                <span style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.4,
                }}>
                  {skill.description}
                </span>
              )}

              {skill.source && (
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                }}>
                  {skill.source}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </ViewShell>
  );
}

function Badge({ label, variant }: { label: string; variant?: 'muted' | 'warn' }) {
  const bg = variant === 'warn'
    ? 'var(--color-status-disconnected)'
    : variant === 'muted'
      ? 'var(--color-bg-tertiary)'
      : 'var(--color-accent)';
  const color = variant === 'muted'
    ? 'var(--color-text-tertiary)'
    : 'var(--color-bubble-user-text)';

  return (
    <span style={{
      fontSize: '10px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      padding: '1px 5px',
      borderRadius: '4px',
      background: bg,
      color,
    }}>
      {label}
    </span>
  );
}

function ViewShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: '13px', fontFamily: 'var(--font-sans)',
    }}>
      Loading…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-status-disconnected)', fontSize: '13px', fontFamily: 'var(--font-sans)',
      padding: '0 14px', textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: '13px', fontFamily: 'var(--font-sans)',
    }}>
      No skills found
    </div>
  );
}
