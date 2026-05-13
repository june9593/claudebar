// Shared helpers for session-row metadata. Used by AddSessionWizard
// (when picking a project) and by SessionsTab (when resuming via the
// operator panel) — keeping them in one place ensures the rail icons
// match across entry points.

export function shortName(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

export function firstLetter(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}

export function colorFromKey(key: string): string {
  // Cheap 32-bit-truncated hash → hue; saturation/lightness fixed for legibility.
  // The `| 0` keeps the accumulator inside int32 range each iteration; without
  // it long project keys overflow JS's 53-bit float mantissa and the hash drifts.
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 60% 50%)`;
}
