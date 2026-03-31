import { ipcMain } from 'electron';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSettings } from './settings';

/** Resolve openclaw command */
function resolveClawCommand(): string {
  const settings = getSettings();
  return settings.clawPath || 'openclaw';
}

/** Get shell PATH */
function getShellPath(): string {
  try {
    return execSync('echo $PATH', { shell: '/bin/zsh', encoding: 'utf-8' }).trim() || process.env.PATH || '';
  } catch {
    return process.env.PATH || '';
  }
}

/** Strip ANSI codes */
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
}

/** Execute openclaw CLI */
function execOpenClaw(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const cmd = resolveClawCommand();
    const child = spawn(cmd, ['--no-color', ...args], {
      env: { ...process.env, PATH: getShellPath(), NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) resolve({ success: true, output: stripAnsi(stdout) });
      else resolve({ success: false, output: stripAnsi(stdout), error: stripAnsi(stderr) || `Exit code ${code}` });
    });

    child.on('error', (err) => resolve({ success: false, output: '', error: err.message }));
  });
}

/** Parse JSONL transcript file */
function parseJsonlMessages(filePath: string): Array<{ role: string; content: string; timestamp?: string; _ts: number }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const messages: Array<{ role: string; content: string; timestamp?: string; _ts: number }> = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'message' || !obj.message) continue;

        const msg = obj.message;
        const role = msg.role || 'unknown';

        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((item: { type?: string; text?: string }) => item?.type === 'text' && item?.text)
            .map((item: { text: string }) => item.text)
            .join('\n');
        }

        // Strip runtime timestamp prefix
        text = text.replace(/^\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/m, '');

        if (!text.trim()) continue;

        const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;
        messages.push({
          role,
          content: text,
          timestamp: obj.timestamp ? new Date(obj.timestamp).toLocaleString() : undefined,
          _ts: ts,
        });
      } catch { /* skip malformed lines */ }
    }

    return messages;
  } catch {
    return [];
  }
}

/** Scan filesystem for session stores */
function scanStores(): Array<{ agentId: string; path: string }> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const agentsDir = path.join(homeDir, '.openclaw', 'agents');

  if (!fs.existsSync(agentsDir)) return [];

  const stores: Array<{ agentId: string; path: string }> = [];
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionsJsonPath = path.join(agentsDir, entry.name, 'sessions', 'sessions.json');
      if (fs.existsSync(sessionsJsonPath)) {
        stores.push({ agentId: entry.name, path: sessionsJsonPath });
      }
    }
  } catch { /* ignore */ }

  return stores;
}

export function setupSessionsIPC() {
  // Get sessions list
  ipcMain.handle('openclaw:get-sessions', async () => {
    try {
      const result = await execOpenClaw(['sessions', '--all-agents', '--json']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const jsonStart = result.output.search(/[{[]/);
      if (jsonStart === -1) return { success: true, sessions: [] };

      const parsed = JSON.parse(result.output.slice(jsonStart));
      const rawSessions = parsed?.sessions || [];

      const sessions = rawSessions
        .filter((item: { key?: string }) => {
          const key = String(item.key || '');
          return !key.includes(':run:');
        })
        .map((item: { key?: string; agentId?: string; model?: string }) => {
          const key = String(item.key || '');
          const parts = key.split(':');
          return {
            id: key,
            key,
            agent: String(item.agentId || 'unknown'),
            model: String(item.model || 'unknown'),
            channel: parts.length >= 3 ? parts[2] : 'unknown',
            status: 'active' as const,
          };
        });

      return { success: true, sessions };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Create session
  ipcMain.handle('openclaw:create-session', async (_, agentId: string) => {
    if (!agentId || typeof agentId !== 'string') {
      return { success: false, error: 'Invalid agentId' };
    }

    try {
      const result = await execOpenClaw(['sessions', 'create', '--agent', agentId, '--json']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const jsonStart = result.output.search(/[{[]/);
      if (jsonStart === -1) return { success: true };

      const parsed = JSON.parse(result.output.slice(jsonStart));
      return { success: true, sessionId: parsed?.key || parsed?.sessionId || parsed?.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Send message (async, non-blocking)
  ipcMain.handle('openclaw:send-message', async (_, sessionId: string, agentId: string, message: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      return { success: false, error: 'Invalid sessionId' };
    }
    if (!message || typeof message !== 'string') {
      return { success: false, error: 'Invalid message' };
    }

    try {
      const cmd = resolveClawCommand();
      const shellPath = getShellPath();

      // Fire and forget — spawn CLI and don't wait
      const child = spawn(cmd, [
        '--no-color', 'agent',
        '--agent', agentId,
        '--session-id', sessionId,
        '--message', message,
      ], {
        env: { ...process.env, PATH: shellPath, NO_COLOR: '1' },
        detached: true,
        stdio: 'ignore',
      });

      child.unref();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Get transcript
  ipcMain.handle('openclaw:get-transcript', async (_, agentId: string, sessionKey: string) => {
    if (!agentId || typeof agentId !== 'string') {
      return { success: false, error: 'Invalid agentId' };
    }
    if (!sessionKey || typeof sessionKey !== 'string') {
      return { success: false, error: 'Invalid sessionKey' };
    }

    try {
      const stores = scanStores();
      const store = stores.find((s) => s.agentId === agentId);

      if (!store || !fs.existsSync(store.path)) {
        return { success: true, messages: [] };
      }

      // Validate that store.path is within ~/.openclaw/
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const openclawRoot = path.resolve(homeDir, '.openclaw');
      const resolvedStorePath = path.resolve(store.path);
      if (!resolvedStorePath.startsWith(openclawRoot)) {
        return { success: false, error: 'Invalid store path' };
      }

      const indexData = JSON.parse(fs.readFileSync(store.path, 'utf-8'));
      const sessionMeta = indexData[sessionKey];

      if (!sessionMeta) {
        return { success: true, messages: [] };
      }

      // Collect JSONL files for this session
      const candidateFiles = new Set<string>();

      const extractFiles = (meta: Record<string, unknown>) => {
        if (meta?.sessionId && typeof meta.sessionId === 'string') {
          const sessionsDir = path.dirname(store.path);
          const jsonlPath = path.join(sessionsDir, `${meta.sessionId}.jsonl`);
          if (fs.existsSync(jsonlPath)) {
            // Validate path
            const resolved = path.resolve(jsonlPath);
            if (resolved.startsWith(openclawRoot)) {
              candidateFiles.add(resolved);
            }
          }
        }
        if (meta?.sessionFile && typeof meta.sessionFile === 'string' && fs.existsSync(meta.sessionFile as string)) {
          const resolved = path.resolve(meta.sessionFile as string);
          if (resolved.startsWith(openclawRoot)) {
            candidateFiles.add(resolved);
          }
        }
      };

      extractFiles(sessionMeta);

      // Also check sub-entries
      const prefix = sessionKey + ':';
      for (const [k, v] of Object.entries(indexData)) {
        if (k.startsWith(prefix)) {
          extractFiles(v as Record<string, unknown>);
        }
      }

      if (candidateFiles.size === 0) {
        return { success: true, messages: [] };
      }

      // Parse and merge all files
      const allMessages: Array<{ role: string; content: string; timestamp?: string; _ts: number }> = [];
      for (const filePath of Array.from(candidateFiles)) {
        allMessages.push(...parseJsonlMessages(filePath));
      }

      // Sort by timestamp
      allMessages.sort((a, b) => a._ts - b._ts);

      // Deduplicate adjacent identical messages
      const deduped: Array<{ role: string; content: string; timestamp?: string }> = [];
      for (const msg of allMessages) {
        const last = deduped[deduped.length - 1];
        if (last && last.role === msg.role && last.content === msg.content) continue;
        deduped.push({ role: msg.role, content: msg.content, timestamp: msg.timestamp });
      }

      // Convert to Message format
      const messages = deduped.map((msg, i) => ({
        id: `${sessionKey}-${i}`,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      return { success: true, messages };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Close session
  ipcMain.handle('openclaw:close-session', async (_, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      return { success: false, error: 'Invalid sessionId' };
    }

    try {
      const result = await execOpenClaw(['sessions', 'close', sessionId]);
      return { success: result.success, error: result.error };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
