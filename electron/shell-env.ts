// Hydrates auth-related env vars from the user's interactive shell so the
// SDK-spawned `claude` binary works when ClawBar is launched from Finder.
//
// Why this exists: macOS launchd starts GUI apps with a minimal env — it
// does NOT source ~/.zshrc / ~/.zprofile / ~/.bash_profile. Users who put
// `export ANTHROPIC_AUTH_TOKEN=...` (or similar) in their shell rc see
// `claude` work fine from a terminal but get "Not logged in" from the
// menu-bar app. Same root cause as VS Code, Cursor, Warp etc. all dealt
// with — they all source the user's shell once at startup.
//
// We use an allowlist (ANTHROPIC_* / CLAUDE_*) rather than copying the
// full env so we don't accidentally leak unrelated user state into spawned
// child processes.
import { spawn } from 'child_process';
import os from 'os';

let cached: Record<string, string> | null = null;

const ALLOW_PREFIXES = ['ANTHROPIC_', 'CLAUDE_'];

function isAllowedKey(key: string): boolean {
  return ALLOW_PREFIXES.some((p) => key.startsWith(p));
}

/** Run `zsh -lc env` (or the user's $SHELL equivalent), parse, return only
 *  the auth/config keys we care about. Resolves to an empty object on any
 *  failure — we never want shell startup hiccups to block the app. */
async function readShellAuthEnv(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh';
    // -lc, NOT -ilc: -i requires a TTY which spawn doesn't give us. The
    // login flag (-l) is what makes zsh source .zshrc / .zprofile. Same
    // pattern as the existing CLI-locator in claude-sessions.ts.
    const proc = spawn(shell, ['-lc', 'env'], { shell: false });
    let out = '';
    let err = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch { /* ignore */ }
      // eslint-disable-next-line no-console
      console.warn('[shell-env] timed out reading shell env, continuing without');
      resolve({});
    }, 5000);

    proc.stdout.on('data', (b: Buffer) => { out += b.toString(); });
    proc.stderr.on('data', (b: Buffer) => { err += b.toString(); });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({});
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        // eslint-disable-next-line no-console
        console.warn(`[shell-env] ${shell} -lc env exited ${code}: ${err.trim()}`);
        resolve({});
        return;
      }
      const parsed: Record<string, string> = {};
      for (const line of out.split('\n')) {
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq);
        if (!isAllowedKey(key)) continue;
        parsed[key] = line.slice(eq + 1);
      }
      resolve(parsed);
    });
  });
}

/** Populate the cache. Call once at app boot, before any claude:start.
 *  Safe to call repeatedly — only the first call does work. */
export async function hydrateShellEnv(): Promise<void> {
  if (cached !== null) return;
  // Guard against running on Windows where `zsh -lc env` is meaningless;
  // on Windows the user's env is already inherited by the GUI process.
  if (os.platform() === 'win32') {
    cached = {};
    return;
  }
  cached = await readShellAuthEnv();
  // eslint-disable-next-line no-console
  console.log(`[shell-env] hydrated ${Object.keys(cached).length} auth/config vars from shell`);
}

/** Returns the cached vars (empty object until hydrated). */
export function getShellAuthEnv(): Record<string, string> {
  return cached ?? {};
}
