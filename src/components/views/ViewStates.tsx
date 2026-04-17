/**
 * Shared loading / error / empty placeholders used by view components.
 * Behavior preserved from the original duplicates in SkillsView/CronView/AgentsView.
 */

const baseStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
};

export function LoadingState({ label = 'Loading…' }: { label?: string } = {}) {
  return (
    <div style={{ ...baseStyle, color: 'var(--color-text-tertiary)' }}>
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      ...baseStyle,
      color: 'var(--color-status-disconnected)',
      padding: '0 14px',
      textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...baseStyle, color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  );
}
