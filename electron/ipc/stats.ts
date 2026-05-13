import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenBucket {
  input: number;
  output: number;
  cache_creation: number;
  cache_read: number;
}

interface PerFileEntry {
  lastByteOffset: number;
  tokens: TokenBucket;
  byModel: Record<string, TokenBucket>;
}

interface OurUsageCache {
  version: 1;
  perFile: Record<string, PerFileEntry>;
  byDay: Record<string, TokenBucket>;
}

// Claude's own stats-cache format (subset we care about)
interface ClaudeStatsCache {
  dailyActivity?: Array<{ date: string; totalRequests?: number; totalTokensUsed?: number }>;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CLAUDEBAR_DIR = path.join(os.homedir(), '.claudebar');
const OUR_CACHE_PATH = path.join(CLAUDEBAR_DIR, 'usage-cache.json');
const CLAUDE_STATS_PATH = path.join(os.homedir(), '.claude', 'stats-cache.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyBucket(): TokenBucket {
  return { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
}

function addBucket(a: TokenBucket, b: TokenBucket): TokenBucket {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_creation: a.cache_creation + b.cache_creation,
    cache_read: a.cache_read + b.cache_read,
  };
}

function loadOurCache(): OurUsageCache {
  try {
    const raw = fs.readFileSync(OUR_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OurUsageCache>;
    if (parsed.version === 1 && parsed.perFile && parsed.byDay) {
      return parsed as OurUsageCache;
    }
  } catch {
    // missing or corrupt — start fresh
  }
  return { version: 1, perFile: {}, byDay: {} };
}

function saveOurCache(cache: OurUsageCache): void {
  try {
    if (!fs.existsSync(CLAUDEBAR_DIR)) fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true });
    fs.writeFileSync(OUR_CACHE_PATH, JSON.stringify(cache), 'utf8');
  } catch {
    // best-effort
  }
}

function loadClaudeStatsCache(): ClaudeStatsCache {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_STATS_PATH, 'utf8')) as ClaudeStatsCache;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Incremental parsing
// ---------------------------------------------------------------------------

/**
 * Open filePath, read bytes from fromOffset to EOF, split into complete lines,
 * accumulate token counts into the entry and byDay map.
 *
 * Returns the new byte offset (fromOffset + bytes consumed for COMPLETE lines).
 * Trailing partial line bytes are NOT consumed — critical for mid-write safety.
 */
function parseAndAccumulate(
  filePath: string,
  fromOffset: number,
  entry: PerFileEntry,
  byDay: Record<string, TokenBucket>,
): number {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return fromOffset;
  }

  const fileSize = stat.size;
  if (fileSize <= fromOffset) return fromOffset;

  const toRead = fileSize - fromOffset;
  const buf = Buffer.allocUnsafe(toRead);
  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return fromOffset;
  }

  try {
    fs.readSync(fd, buf, 0, toRead, fromOffset);
  } finally {
    fs.closeSync(fd);
  }

  const raw = buf.toString('utf8');
  const lines = raw.split('\n');

  // The last element after split is either '' (file ends with \n) or a partial
  // line. Either way we only process [0..lines.length-2] as "complete" lines.
  // We count consumed bytes as the sum of (line.length + 1) for each complete line.
  let consumed = 0;
  const completeLines = lines.slice(0, lines.length - 1);

  for (const line of completeLines) {
    consumed += line.length + 1; // +1 for the '\n'
    if (!line.trim()) continue;

    let msg: {
      message?: {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
        model?: string;
      };
      timestamp?: string;
    };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      continue;
    }

    const u = msg.message?.usage;
    if (!u) continue;

    const bucket: TokenBucket = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cache_creation: u.cache_creation_input_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
    };

    // Accumulate into per-file entry
    entry.tokens = addBucket(entry.tokens, bucket);

    // Accumulate by model
    const model = msg.message?.model ?? 'unknown';
    entry.byModel[model] = addBucket(entry.byModel[model] ?? emptyBucket(), bucket);

    // Accumulate by day
    const date = (msg.timestamp ?? '').slice(0, 10);
    if (date) {
      byDay[date] = addBucket(byDay[date] ?? emptyBucket(), bucket);
    }
  }

  return fromOffset + consumed;
}

// ---------------------------------------------------------------------------
// Cache refresh
// ---------------------------------------------------------------------------

// Throttle full-disk rescans: each call to stats:get / stats:today on a heavy
// projects dir does a full walk + per-file tail read. If the user opens the
// operator panel and both Overview + Stats tabs render, two rescans land
// back-to-back. Cache the most recent refresh result for ~3s so subsequent
// IPC calls inside that window reuse it. The byte-offset incremental scan is
// still cheap for hot files; this just collapses redundant directory walks.
const REFRESH_TTL_MS = 3000;
let lastRefresh: { at: number; cache: OurUsageCache } | null = null;

function refreshCache(): OurUsageCache {
  const now = Date.now();
  if (lastRefresh && now - lastRefresh.at < REFRESH_TTL_MS) {
    return lastRefresh.cache;
  }
  const cache = loadOurCache();

  // Walk ~/.claude/projects/*/  for *.jsonl files
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return cache;

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(CLAUDE_PROJECTS_DIR, d.name));
  } catch {
    return cache;
  }

  for (const dir of projectDirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      const key = filePath; // use absolute path as key

      if (!cache.perFile[key]) {
        cache.perFile[key] = {
          lastByteOffset: 0,
          tokens: emptyBucket(),
          byModel: {},
        };
      }

      const entry = cache.perFile[key];
      const newOffset = parseAndAccumulate(filePath, entry.lastByteOffset, entry, cache.byDay);
      entry.lastByteOffset = newOffset;
    }
  }

  saveOurCache(cache);
  lastRefresh = { at: now, cache };
  return cache;
}

// ---------------------------------------------------------------------------
// IPC setup
// ---------------------------------------------------------------------------

export interface StatsSnapshot {
  /** From ~/.claude/stats-cache.json */
  dailyActivity: Array<{ date: string; totalRequests?: number; totalTokensUsed?: number }>;
  /** Our incremental aggregates */
  tokensByDay: Record<string, TokenBucket>;
  totals: TokenBucket;
  byModel: Record<string, TokenBucket>;
}

function buildSnapshot(cache: OurUsageCache): StatsSnapshot {
  const claudeCache = loadClaudeStatsCache();

  // Compute overall totals and by-model from perFile entries
  const totals = emptyBucket();
  const byModel: Record<string, TokenBucket> = {};

  for (const entry of Object.values(cache.perFile)) {
    Object.assign(totals, addBucket(totals, entry.tokens));
    for (const [model, bucket] of Object.entries(entry.byModel)) {
      byModel[model] = addBucket(byModel[model] ?? emptyBucket(), bucket);
    }
  }

  return {
    dailyActivity: claudeCache.dailyActivity ?? [],
    tokensByDay: cache.byDay,
    totals,
    byModel,
  };
}

export function setupStatsIPC(): void {
  ipcMain.handle('stats:get', (): StatsSnapshot => {
    const cache = refreshCache();
    return buildSnapshot(cache);
  });

  ipcMain.handle('stats:today', (): TokenBucket => {
    const cache = refreshCache();
    const today = new Date().toISOString().slice(0, 10);
    return cache.byDay[today] ?? emptyBucket();
  });
}
