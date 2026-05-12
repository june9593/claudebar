// Stub — LobsterIcon removed; ClaudeBar uses ClaudeMark instead
export function LobsterIcon({ size = 18 }: { size?: number }) {
  // Minimal orange circle as placeholder
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" fill="#cc785c" opacity={0.6} />
    </svg>
  );
}
