import { useState } from 'react';
import { ChevronRight, ChevronDown, Check, X } from 'lucide-react';

interface ToolMeta {
  callId: string;
  name: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
  durationMs?: number;
  startedAt: number;
}

interface Props {
  tool: ToolMeta;
}

const MAX_OUTPUT_PREVIEW = 4096;

function summarize(tool: ToolMeta): string {
  const input = tool.input as Record<string, unknown> | undefined;
  if (!input) return '';
  switch (tool.name) {
    case 'Bash':
      return typeof input.command === 'string' ? `$ ${input.command}` : '';
    case 'Edit':
    case 'Write':
      return typeof input.file_path === 'string' ? input.file_path : '';
    case 'Read':
      return typeof input.file_path === 'string' ? input.file_path : '';
    case 'Glob':
      return typeof input.pattern === 'string' ? input.pattern : '';
    case 'Grep':
      return typeof input.pattern === 'string' ? input.pattern : '';
    case 'Thinking': {
      // Show first ~60 chars of thinking text as a preview
      const t = (input.thinking ?? '') as string;
      const oneLine = t.replace(/\s+/g, ' ').trim();
      return oneLine.length > 60 ? oneLine.slice(0, 60) + '…' : oneLine;
    }
    default:
      return '';
  }
}

function tail(tool: ToolMeta): string {
  if (tool.output === undefined) return '';
  if (tool.name === 'Edit' || tool.name === 'Write') {
    const i = tool.input as { old_string?: string; new_string?: string; content?: string } | undefined;
    if (i) {
      const oldLines = i.old_string?.split('\n').length ?? 0;
      const newLines = (i.new_string ?? i.content)?.split('\n').length ?? 0;
      if (oldLines || newLines) return `+${newLines} -${oldLines}`;
    }
  }
  if (typeof tool.output === 'string' && tool.name === 'Glob') {
    const matches = tool.output.split('\n').filter(Boolean).length;
    return `${matches} matches`;
  }
  if (typeof tool.durationMs === 'number') {
    return `${(tool.durationMs / 1000).toFixed(1)}s`;
  }
  return '';
}

function statusIcon(tool: ToolMeta) {
  if (tool.output === undefined) {
    return <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'inline-block',
      animation: 'cl-pulse 1.4s ease-in-out infinite',
    }} />;
  }
  if (tool.isError) {
    return <X size={12} strokeWidth={2.5} style={{ color: 'var(--color-status-disconnected)' }} />;
  }
  return <Check size={12} strokeWidth={2.5} style={{ color: 'var(--color-status-connected)' }} />;
}

function jsonOrText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try {
    const s = JSON.stringify(v, null, 2);
    return s ?? String(v);
  } catch { return String(v); }
}

export function ToolCallPill({ tool }: Props) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(tool);
  const t = tail(tool);
  const out = jsonOrText(tool.output);
  const truncated = out.length > MAX_OUTPUT_PREVIEW;
  const shown = truncated ? out.slice(0, MAX_OUTPUT_PREVIEW) : out;

  return (
    <div style={{
      alignSelf: 'flex-start',
      maxWidth: '100%',
      minWidth: 240,
      marginLeft: 34,
      border: '1px solid var(--color-border-primary)',
      borderRadius: 10,
      background: 'var(--color-bg-tertiary)',
      // No minHeight when expanded — let the panel grow. Keep a small
      // floor only when collapsed so an empty-summary pill stays visible.
      minHeight: expanded ? undefined : 28,
      // overflow hidden so border-radius clips children, but only when
      // collapsed; expanded panel might exceed the floor and get clipped.
      overflow: 'visible',
    }}>      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--color-text-secondary)',
          textAlign: 'left',
        }}
      >
        {expanded
          ? <ChevronDown size={12} strokeWidth={2} />
          : <ChevronRight size={12} strokeWidth={2} />}
        <span style={{
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}>{tool.name}</span>
        <span title={summary} style={{
          flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{summary}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {statusIcon(tool)}
          {t && <span style={{ color: 'var(--color-text-tertiary)' }}>{t}</span>}
        </span>
      </button>
      {expanded && (
        <div style={{
          padding: '6px 10px 10px',
          borderTop: '0.5px solid var(--color-border-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 4 }}>input</div>
          <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto' }}>{jsonOrText(tool.input)}</pre>
          {tool.output !== undefined && (
            <>
              <div style={{ color: 'var(--color-text-tertiary)', margin: '8px 0 4px' }}>
                output{tool.isError ? ' (error)' : ''}
              </div>
              <pre style={{ margin: 0, maxHeight: 320, overflow: 'auto' }}>{shown}</pre>
              {truncated && (
                <div style={{ color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  … truncated, {out.length - MAX_OUTPUT_PREVIEW} more chars
                </div>
              )}
            </>
          )}
        </div>
      )}
      <style>{`@keyframes cl-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
