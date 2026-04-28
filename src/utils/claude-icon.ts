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

/** 32-bit FNV-1a hash for identicon seeding. */
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
