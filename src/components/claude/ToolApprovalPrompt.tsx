import { useEffect, useRef, useState } from 'react';
import type { ApprovalDecision } from '../../../shared/claude-events';

interface Props {
  tool: string;
  input: unknown;
  onResolve: (decision: ApprovalDecision) => void;
}

interface Option {
  label: string;
  decision: ApprovalDecision;
}

function summarize(tool: string, input: unknown): string {
  const i = input as Record<string, unknown> | undefined;
  if (!i) return '';
  if (tool === 'Bash' && typeof i.command === 'string') return `$ ${i.command}`;
  if ((tool === 'Edit' || tool === 'Write') && typeof i.file_path === 'string') return i.file_path;
  if (tool === 'Read' && typeof i.file_path === 'string') return i.file_path;
  return '';
}

export function ToolApprovalPrompt({ tool, input, onResolve }: Props) {
  const options: Option[] = [
    { label: 'Yes, once', decision: 'allow' },
    { label: `Yes, allow ${tool} for this session`, decision: 'allow-session' },
    { label: 'No (esc)', decision: 'deny' },
  ];
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const summary = summarize(tool, input);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      const i = parseInt(e.key, 10) - 1;
      if (i >= 0 && i < options.length) onResolve(options[i].decision);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); onResolve(options[idx].decision); return; }
    if (e.key === 'Escape') { e.preventDefault(); onResolve('deny'); return; }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{
        outline: 'none',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 12,
        background: 'var(--color-surface-card)',
        padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{
        fontSize: 12,
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
      }}>
        Allow {tool}?
      </div>
      {summary && (
        <div style={{
          padding: '6px 10px',
          background: 'var(--color-bg-tertiary)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--color-text-primary)',
          maxHeight: 120, overflow: 'auto',
          wordBreak: 'break-all', whiteSpace: 'pre-wrap',
        }}>
          {summary}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {options.map((opt, i) => (
          <button
            key={opt.decision}
            onClick={() => onResolve(opt.decision)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 6,
              border: 'none', background: i === idx ? 'var(--color-surface-active)' : 'transparent',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)', fontSize: 12.5,
              textAlign: 'left', cursor: 'pointer',
            }}
          >
            <span style={{
              color: i === idx ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              minWidth: 14,
            }}>
              {i === idx ? '❯' : ' '}
            </span>
            <span style={{
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>{i + 1}.</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
