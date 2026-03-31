export function TypingIndicator() {
  return (
    <div className="flex justify-start px-3">
      <div
        className="flex items-center gap-1 px-3 py-2"
        style={{
          backgroundColor: 'var(--color-surface-assistant-bubble)',
          borderRadius: 'var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) 4px',
        }}
      >
        <span className="text-sm">🦞</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--color-text-tertiary)',
                animation: `bounce 1.4s infinite ${i * 0.2}s`,
              }}
            />
          ))}
        </span>
        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
          }
        `}</style>
      </div>
    </div>
  );
}
