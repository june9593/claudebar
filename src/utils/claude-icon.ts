// Pure helpers for deriving a stable visual identity from a Claude project key.

/** Extract the last non-empty segment of a /-separated path. */
export function shortName(decodedPath: string): string {
  const parts = decodedPath.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : decodedPath || '?';
}

/** First letter of `shortName`, uppercased. Falls back to '?' for empty input. */
export function firstLetter(name: string): string {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

/** Hash a key string into a stable HSL colour string (mid-saturation, mid-lightness). */
export function colorFromKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  }
  return `hsl(${h % 360}, 55%, 55%)`;
}

// 32-bit FNV-1a hash for identicon seeding.
function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 5×5 symmetric identicon (left half mirrored to right half) — a tiny GitHub-
 * style block. Returns the cell pattern (true = filled) plus a stable accent
 * colour. With 5×5 + vertical symmetry there are 15 independent cells, so
 * 2^15 = 32k unique patterns per colour bucket — collisions are rare across
 * the typical handful of channels in the bar.
 */
export interface Identicon {
  cells: boolean[][];   // 5 rows × 5 cols
  color: string;        // HSL string for filled cells
}

export function identiconFromKey(key: string): Identicon {
  const h = hash32(key);
  // Use 15 bits for left-half cells (3 cols × 5 rows = 15). Top bits → hue.
  const rows = 5;
  const halfCols = 3; // includes the centre column
  const cells: boolean[][] = [];
  let bit = 0;
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = new Array(5);
    for (let c = 0; c < halfCols; c++) {
      const filled = ((h >> bit) & 1) === 1;
      bit++;
      row[c] = filled;
      row[4 - c] = filled; // mirror
    }
    cells.push(row);
  }
  // Hue from the top 9 bits we haven't used (bits 15..23).
  const hue = (h >> 15) & 0x1ff;
  const color = `hsl(${hue % 360}, 60%, 50%)`;
  return { cells, color };
}

/**
 * Variant of the Claude pet for use as a per-session channel icon. Stable
 * given the same `key`; collisions are rare across the handful of sessions
 * a user keeps in the bar. All variants stay in the Claude orange family
 * so the icons remain visually identifiable as "a Claude session" at a
 * glance.
 *
 * Hashed dimensions:
 *  - body hue   — 6 buckets in ±36° around Claude orange (hue ~18°)
 *  - body shade — 3 buckets (lighter / base / deeper)
 *  - hand colour — sibling shade of body
 *  - leg colour — independent shade of body (different bits)
 *  - eye style  — square / round / sleepy line / sparkle
 *  - eye colour — black / very dark blue / very dark red
 */
export interface ClaudePetVariant {
  bodyColor: string;
  shadowColor: string;
  handColor: string;
  legColor: string;
  eyeColor: string;
  eyeStyle: 'square' | 'round' | 'sleepy' | 'sparkle';
}

export function claudePetVariant(key: string): ClaudePetVariant {
  const h = hash32(key);

  // Body hue: 6 buckets across 18° ± 36° (so 342° → 54°), keeps it in
  // the warm-orange / red-orange / amber band.
  const hueBucket = h & 0x7;
  const hueOffset = ((hueBucket % 6) - 3) * 12;
  const baseHue = (18 + hueOffset + 360) % 360;

  // Body lightness shade: 3 buckets.
  const lightBucket = (h >> 3) & 0x3;
  const lightness = [40, 48, 56][lightBucket % 3];

  // Compose body / shadow / hand from the same hue.
  const bodyColor = `hsl(${baseHue}, 50%, ${lightness}%)`;
  const shadowColor = `hsl(${baseHue}, 50%, ${Math.max(20, lightness - 18)}%)`;

  // Hands: shift hue slightly + go a touch redder for contrast.
  const handHue = (baseHue + 350) % 360;
  const handColor = `hsl(${handHue}, 55%, ${Math.max(30, lightness - 6)}%)`;

  // Legs: independent hue/shade pick. Use bits 9..11 for a separate
  // 8-bucket hue offset around the same warm band, and bits 12..13 for
  // lightness. Keeps legs visually consistent with the rest but lets
  // them be a distinct identifying signal.
  const legHueBucket = (h >> 9) & 0x7;
  const legHueOffset = ((legHueBucket % 6) - 3) * 12;
  const legHue = (18 + legHueOffset + 360) % 360;
  const legLightBucket = (h >> 12) & 0x3;
  const legLightness = [36, 46, 56][legLightBucket % 3];
  const legColor = `hsl(${legHue}, 55%, ${legLightness}%)`;

  // Eye style: 4 buckets.
  const eyeStyles: ClaudePetVariant['eyeStyle'][] = ['square', 'round', 'sleepy', 'sparkle'];
  const eyeStyle = eyeStyles[(h >> 5) & 0x3];

  // Eye colour: 3 buckets.
  const eyeColors = ['#0a0a0a', '#0a1a3a', '#3a0a0a'];
  const eyeColor = eyeColors[((h >> 7) & 0x3) % 3];

  return { bodyColor, shadowColor, handColor, legColor, eyeColor, eyeStyle };
}

// Smoke checks (dev only). console.assert never throws — safe even when assertions fail.
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
  console.assert(shortName('/Users/yueliu/edge/clawbar') === 'clawbar', 'shortName');
  console.assert(shortName('') === '?', 'shortName empty');
  console.assert(firstLetter('clawbar') === 'C', 'firstLetter');
  console.assert(firstLetter('') === '?', 'firstLetter empty');
  console.assert(colorFromKey('foo') === colorFromKey('foo'), 'colorFromKey stable');
  console.assert(colorFromKey('a').startsWith('hsl('), 'colorFromKey hsl');
  const a = identiconFromKey('foo');
  const b = identiconFromKey('foo');
  console.assert(a.color === b.color, 'identicon stable colour');
  console.assert(a.cells.length === 5 && a.cells[0].length === 5, 'identicon 5x5');
  console.assert(a.cells[0][0] === a.cells[0][4], 'identicon symmetric');
}
