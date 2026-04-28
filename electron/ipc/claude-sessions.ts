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

/** Read first JSON line whose type === 'user'; return its message.content as string. */
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
        if (obj.type === 'user' && obj.message && typeof obj.message.content === 'string') {
          finish(obj.message.content);
        }
      } catch { /* skip malformed line */ }
    });
    rl.on('close', () => finish(''));
    stream.on('error', () => finish(''));
  });
}

/** Returns true if `claude` resolves on PATH. */
function checkCli(): Promise<{ found: boolean; version?: string; path?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version'], { shell: false });
    let out = '';
    proc.stdout?.on('data', (c) => (out += c.toString()));
    proc.on('error', () => resolve({ found: false }));
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ found: true, version: out.trim() });
      } else {
        resolve({ found: false });
      }
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
