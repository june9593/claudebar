// Hydrates auth-related env vars from the user's shell rc files so the
// SDK-spawned `claude` binary works when ClawBar is launched from Finder.
//
// Why this exists: macOS launchd starts GUI apps with a minimal env — it
// does NOT source ~/.zshrc / ~/.zprofile / ~/.bash_profile. Users who put
// `export ANTHROPIC_AUTH_TOKEN=...` (or similar) in their shell rc see
// `claude` work fine from a terminal but get "Not logged in" from the
// menu-bar app.
//
// We parse the rc files DIRECTLY rather than spawning a shell. Earlier
// attempts to `zsh -c 'source ~/.zshrc; env'` worked from a terminal-
// inherited env but hung indefinitely from launchd's clean env (compinit,
// nvm hooks, brew completion, etc. behave differently when SHLVL=0 and
// PATH is minimal — diagnostics on the actual failing machine showed a
// 5+ second hang). The shell-spawn approach is also slow even when it
// works.
//
// Direct parsing is bounded by an allowlist (ANTHROPIC_* / CLAUDE_*) so
// we don't try to interpret arbitrary shell logic — only the simple
// `export KEY=value` lines that 99% of rc files use for these keys.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let cached: Record<string, string> | null = null;

const ALLOW_PREFIXES = ['ANTHROPIC_', 'CLAUDE_'];

const DIAG_DIR = path.join(os.homedir(), '.clawbar');
const DIAG_FILE = path.join(DIAG_DIR, 'auth-debug.log');

/** Append a diagnostic line to ~/.clawbar/auth-debug.log so we can inspect
 *  what hydration actually did, even when stdout is swallowed by launchd.
 *  Values are NEVER written — only key names and counts. */
function diag(msg: string): void {
  try {
    fs.mkdirSync(DIAG_DIR, { recursive: true });
    fs.appendFileSync(DIAG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* diagnostics must never crash the app */ }
}

function isAllowedKey(key: string): boolean {
  return ALLOW_PREFIXES.some((p) => key.startsWith(p));
}

/** rc files we'll scan, in source order (later wins, mirroring shell semantics).
 *  zsh and bash both end up reading these on a normal interactive setup. */
const RC_FILES = [
  '.profile',
  '.bash_profile',
  '.bashrc',
  '.zshenv',
  '.zprofile',
  '.zshrc',
];

/** Parse a single rc file for `export KEY=VALUE` lines on our allowlist.
 *  Handles:
 *    - comments (`# ...`)
 *    - surrounding double or single quotes
 *    - lines like `[[ -f ... ]] && export FOO=bar` (we only key off the
 *      `export FOO=...` tail; the guard is ignored)
 *  Does NOT handle:
 *    - `$VAR` / `${VAR}` expansion
 *    - heredocs / multi-line strings
 *    - dynamic exports via `eval`
 *  Acceptable trade-off: ANTHROPIC_* / CLAUDE_* values are almost always
 *  literal strings (URLs, tokens, model names, "true"). */
function parseRcFile(filePath: string): Record<string, string> {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  // Match `export KEY=VAL` anywhere on a line (so `... && export X=y` works).
  // VAL is one of: "double-quoted", 'single-quoted', or non-whitespace.
  const re = /\bexport\s+([A-Z_][A-Z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*'|[^\s;#]+)/g;
  for (const rawLine of content.split('\n')) {
    // Strip line comments (but not `#` inside quoted strings — naïve, but
    // good enough for typical rc files).
    const codePart = rawLine.replace(/(^|\s)#.*$/, '$1');
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(codePart)) !== null) {
      const key = m[1];
      if (!isAllowedKey(key)) continue;
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
        if (m[2].startsWith('"')) {
          // Unescape the standard backslash sequences inside double quotes.
          value = value.replace(/\\(["\\$`])/g, '$1');
        }
      }
      result[key] = value;
    }
  }
  return result;
}

function readRcFilesAuthEnv(): Record<string, string> {
  const home = os.homedir();
  const merged: Record<string, string> = {};
  const stats: string[] = [];
  for (const name of RC_FILES) {
    const p = path.join(home, name);
    if (!fs.existsSync(p)) continue;
    const parsed = parseRcFile(p);
    const keys = Object.keys(parsed);
    stats.push(`${name}=${keys.length}`);
    Object.assign(merged, parsed); // later files override earlier
  }
  diag(`readRcFilesAuthEnv: scanned [${stats.join(', ') || '(none)'}], total=${Object.keys(merged).length}`);
  return merged;
}

/** Populate the cache. Call once at app boot, before any claude:start.
 *  Safe to call repeatedly — only the first call does work. */
export async function hydrateShellEnv(): Promise<void> {
  if (cached !== null) return;
  diag(`hydrateShellEnv: starting (process.env keys with ANTHROPIC/CLAUDE: ${
    Object.keys(process.env).filter(isAllowedKey).join(',') || '(none)'
  })`);
  // Windows: GUI launches inherit the user env, no rc-file mining needed.
  if (os.platform() === 'win32') {
    cached = {};
    return;
  }
  cached = readRcFilesAuthEnv();
  // eslint-disable-next-line no-console
  console.log(`[shell-env] hydrated ${Object.keys(cached).length} auth/config vars from rc files`);
  diag(`hydrateShellEnv: done, cache size ${Object.keys(cached).length}, keys=${Object.keys(cached).sort().join(',') || '(none)'}`);
}

/** Returns the cached vars (empty object until hydrated). */
export function getShellAuthEnv(): Record<string, string> {
  return cached ?? {};
}

/** Diagnostic: log what env will actually be passed to a child process.
 *  Call right before spawning so the log captures whether the merge
 *  retained ANTHROPIC_AUTH_TOKEN etc. Values are NEVER logged. */
export function logChildEnvKeys(label: string, env: Record<string, string | undefined>): void {
  const present = Object.keys(env)
    .filter((k) => isAllowedKey(k) && env[k] !== undefined && env[k] !== '')
    .sort();
  diag(`childEnv[${label}]: ${present.length} keys: ${present.join(',') || '(none)'}`);
}
