interface ChatHistoryProps {
  onNewChat: () => void;
}

export function ChatHistory({ onNewChat }: ChatHistoryProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '32px',
      padding: '0 14px',
      borderBottom: '0.5px solid var(--color-border-secondary)',
      background: 'var(--color-bg-secondary)',
      flexShrink: 0,
    }}>
      {/* Session label */}
      <span style={{
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-secondary)',
        lineHeight: 1.33,
        cursor: 'default',
      }}>
        Main
      </span>

      {/* New chat button */}
      <button
        onClick={onNewChat}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          border: 'none',
          background: 'var(--color-bg-tertiary)',
          color: '#4d4c48',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 400,
          fontFamily: 'var(--font-sans)',
          transition: 'background 0.15s, color 0.15s',
        }}
        title="New chat"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-hover)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-bg-tertiary)';
          e.currentTarget.style.color = '#4d4c48';
        }}
      >
        +
      </button>
    </div>
  );
}
