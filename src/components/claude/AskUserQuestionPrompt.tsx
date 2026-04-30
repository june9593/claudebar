import { useEffect, useRef, useState } from 'react';
import type { AskQuestion } from '../../../shared/claude-events';

interface Props {
  questions: AskQuestion[];
  onSubmit: (answers: string[][]) => void;
}

export function AskUserQuestionPrompt({ questions, onSubmit }: Props) {
  const [qIdx, setQIdx] = useState(0);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<string[][]>(questions.map(() => []));
  const containerRef = useRef<HTMLDivElement>(null);

  const q = questions[qIdx];

  useEffect(() => {
    containerRef.current?.focus();
    setIdx(0);
    setPicked(new Set());
  }, [qIdx]);

  const advance = (chosen: string[]) => {
    const next = answers.map((a, i) => i === qIdx ? chosen : a);
    setAnswers(next);
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
    } else {
      onSubmit(next);
    }
  };

  if (!q) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Digit direct-select
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const i = parseInt(e.key, 10) - 1;
      if (i < 0 || i >= q.options.length) return;
      const label = q.options[i].label;
      if (q.multiSelect) {
        const next = new Set(picked);
        if (next.has(label)) next.delete(label); else next.add(label);
        setPicked(next);
      } else {
        advance([label]);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, q.options.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (q.multiSelect) {
        advance(Array.from(picked));
      } else {
        advance([q.options[idx].label]);
      }
      return;
    }
    if (e.key === ' ' && q.multiSelect) {
      e.preventDefault();
      const label = q.options[idx].label;
      const next = new Set(picked);
      if (next.has(label)) next.delete(label); else next.add(label);
      setPicked(next);
      return;
    }
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
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <div style={{
          fontSize: 12,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}>
          {q.question}
        </div>
        {questions.length > 1 && (
          <div style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
          }}>
            {qIdx + 1} / {questions.length}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {q.options.map((opt, i) => {
          const sel = picked.has(opt.label);
          return (
            <button
              key={opt.label}
              onClick={() => {
                if (q.multiSelect) {
                  const next = new Set(picked);
                  if (next.has(opt.label)) next.delete(opt.label); else next.add(opt.label);
                  setPicked(next);
                } else {
                  advance([opt.label]);
                }
              }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '6px 8px', borderRadius: 6,
                border: 'none',
                background: i === idx ? 'var(--color-surface-active)' : 'transparent',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)', fontSize: 12.5,
                textAlign: 'left', cursor: 'pointer',
              }}
            >
              <span style={{
                color: i === idx ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 14, marginTop: 1,
              }}>
                {i === idx ? '❯' : ' '}
              </span>
              <span style={{
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 1,
              }}>{i + 1}.</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {q.multiSelect && (
                    <span style={{
                      width: 12, height: 12, borderRadius: 3,
                      border: '1px solid var(--color-border-primary)',
                      background: sel ? 'var(--color-accent)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-bubble-user-text)', fontSize: 10, fontWeight: 700,
                    }}>{sel ? '✓' : ''}</span>
                  )}
                  <span>{opt.label}</span>
                </span>
                {opt.description && (
                  <span style={{
                    color: 'var(--color-text-tertiary)', fontSize: 11,
                  }}>{opt.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {q.multiSelect && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-tertiary)',
          letterSpacing: 0.04, paddingTop: 2,
        }}>
          ↑↓ navigate · space/digit toggle · ⏎ submit
        </div>
      )}
    </div>
  );
}
