import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { spawn } from 'child_process';

interface Project {
  key: string;            // dir name under ~/.claude/projects, e.g. "-Users-yueliu-edge-clawbar"
  decodedPath: string;    // e.g. "/Users/yueliu/edge/clawbar"
  sessionCount: number;
}

interface Session {
  sessionId: string;
  preview: string;        // first user message, truncated to 80 chars; '' if no user msg yet
  mtime: number;          // ms since epoch
}

function projectsRoot(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/** Decode "-Users-yueliu-edge-clawbar" → "/Users/yueliu/edge/clawbar" */
function decodePath(key: string): string {
  if (!key.startsWith('-')) return key;
  return '/' + key.slice(1).replace(/-/g, '/');
}

/**
 * Extract a clean first user prompt for a session preview / title.
 *
 * Skips Claude Code's internal envelopes that the UI shouldn't show:
 *   - {isMeta: true}                              (system-injected continuations)
 *   - content starting with "<local-command-caveat>"  (slash command preface)
 *   - content starting with "<command-name>"      (slash command echo)
 *   - content === "Continue from where you left off." (resume bootstrap)
 */
function extractUserText(msg: { content?: unknown } | undefined): string {
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((p: { type?: string }) => p.type === 'text')
      .map((p: { text?: string }) => p.text ?? '')
      .join('');
  }
  return '';
}

function isUserEnvelope(text: string): boolean {
  if (!text) return true;
  if (text.startsWith('<local-command-caveat>')) return true;
  if (text.startsWith('<command-name>')) return true;
  if (text.startsWith('<command-output>')) return true;
  if (text === 'Continue from where you left off.') return true;
  return false;
}

async function readFirstUserMessage(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let resolved = false;
    const finish = (s: string) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      stream.destroy();
      resolve(s.length > 80 ? s.slice(0, 80) : s);
    };
    rl.on('line', (line) => {
      if (resolved) return;
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'user') return;
        if (obj.isMeta) return;
        const text = extractUserText(obj.message).trim();
        if (!text) return;
        if (isUserEnvelope(text)) return;
        finish(text);
      } catch { /* skip malformed line */ }
    });
    rl.on('close', () => finish(''));
    stream.on('error', () => finish(''));
  });
}

/** Resolve the absolute path of `claude` on the user's PATH. Uses a
 *  login (non-interactive) shell so PATH set in `~/.zprofile` (where
 *  Homebrew, npm-global, and the native installer typically live) is
 *  honoured even when Electron is launched by Finder with a minimal
 *  PATH. We deliberately omit `-i` because Node's spawn has no TTY,
 *  and an interactive shell hangs forever waiting for one. */
function resolveCliPath(): Promise<string | null> {
  return new Promise((resolve) => {
    // -lc (login + command, NOT interactive). `-i` interactive without
    // a TTY hangs indefinitely under Node's spawn — Electron's spawn is
    // non-TTY, so -i would never return. Login shell still sources
    // ~/.zprofile (where Homebrew / npm-global / native installers
    // typically extend PATH), which is enough to find `claude`. PATH
    // set only in `~/.zshrc` interactive rc would be missed, but that
    // is rare for tools meant to be available outside interactive use.
    const proc = spawn(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], { shell: false });
    let out = '';
    let settled = false;
    const settle = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    // 5-second cap: a heavy or input-blocking shell init must not hang the
    // app's CLI-detection forever.
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      settle(null);
    }, 5000);
    proc.stdout?.on('data', (c) => (out += c.toString()));
    proc.on('error', () => { clearTimeout(timer); settle(null); });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      // zsh login shells print 'Restored session: ...' to stdout before
      // command output; shell functions can print multiple lines too. We
      // want only `command -v`'s real output, which is the LAST non-empty
      // line of stdout. Then sanity-check it's an absolute path before
      // trusting it (anything else — function body, alias, builtin name —
      // would fail later when we try to spawn it).
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (code === 0 && last.startsWith('/')) settle(last);
      else settle(null);
    });
  });
}

/** Returns whether the user has `claude` installed, plus its absolute path
 *  and reported version. The path is what the SDK needs as
 *  `pathToClaudeCodeExecutable`. */
async function checkCli(): Promise<{ found: boolean; version?: string; path?: string }> {
  const cliPath = await resolveCliPath();
  if (!cliPath) return { found: false };
  return new Promise((resolve) => {
    const proc = spawn(cliPath, ['--version'], { shell: false });
    let out = '';
    proc.stdout?.on('data', (c) => (out += c.toString()));
    proc.on('error', () => resolve({ found: false }));
    proc.on('exit', (code) => {
      if (code === 0) resolve({ found: true, version: out.trim(), path: cliPath });
      else resolve({ found: false });
    });
  });
}

export function setupClaudeSessionsIPC() {
  ipcMain.handle('claude:check-cli', async () => {
    return checkCli();
  });

  ipcMain.handle('claude:scan-projects', async (): Promise<Project[]> => {
    const root = projectsRoot();
    if (!fs.existsSync(root)) return [];
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch { return []; }
    const projects: Project[] = [];
    for (const key of entries) {
      const dir = path.join(root, key);
      let stat;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      let count = 0;
      try {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.jsonl')) count++;
        }
      } catch { /* ignore */ }
      projects.push({ key, decodedPath: decodePath(key), sessionCount: count });
    }
    projects.sort((a, b) => b.sessionCount - a.sessionCount);
    return projects;
  });

  ipcMain.handle('claude:list-sessions', async (_e, projectKey: string): Promise<Session[]> => {
    if (typeof projectKey !== 'string' || !projectKey) return [];
    const dir = path.join(projectsRoot(), projectKey);
    if (!fs.existsSync(dir)) return [];
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch { return []; }
    const sessions: Session[] = [];
    for (const file of files) {
      const full = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      const sessionId = file.replace(/\.jsonl$/, '');
      const preview = await readFirstUserMessage(full);
      sessions.push({ sessionId, preview, mtime: stat.mtimeMs });
    }
    sessions.sort((a, b) => b.mtime - a.mtime);
    return sessions;
  });
}
