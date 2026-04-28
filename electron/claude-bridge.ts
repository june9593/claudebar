import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

interface ProcEntry {
  proc: ChildProcess;
  buffer: string;
}

interface ChannelState {
  projectDir: string;
  sessionId: string;
  proc?: ProcEntry;
}

const channels = new Map<string, ChannelState>();

function sendToRenderer(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

function emit(channelId: string, ev: Record<string, unknown>) {
  sendToRenderer('claude:event', { channelId, ...ev });
}

/**
 * Translate one stream-json line from the Claude CLI into renderer-facing events.
 * Verified empirically against `claude -p --input-format stream-json
 * --output-format stream-json --verbose`:
 *   - {type:"stream_event", event:{type:"content_block_delta",
 *       delta:{type:"text_delta", text:"..."}}}    -> delta text
 *   - {type:"result", subtype:"success", result:"..."}  -> final + turn-end
 *   - {type:"result", subtype:"error_*", ... }     -> error + turn-end
 *   - all other types: dropped
 */
function translate(ev: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const type = ev.type as string | undefined;

  if (type === 'stream_event') {
    const inner = ev.event as Record<string, unknown> | undefined;
    if (inner && inner.type === 'content_block_delta') {
      const delta = inner.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        out.push({ state: 'delta', message: { role: 'assistant', content: delta.text } });
      }
    }
    return out;
  }

  if (type === 'result') {
    const subtype = ev.subtype as string | undefined;
    const result = ev.result;
    if (subtype === 'success' && typeof result === 'string') {
      out.push({ state: 'final', message: { role: 'assistant', content: result } });
    } else if (subtype && subtype.startsWith('error')) {
      const msg = (typeof result === 'string' && result) || 'Claude CLI error';
      out.push({ type: 'error', message: msg });
    }
    out.push({ type: 'turn-end' });
    return out;
  }

  return out;
}

function consumeStdout(channelId: string, entry: ProcEntry, chunk: Buffer) {
  entry.buffer += chunk.toString('utf-8');
  let nl: number;
  // eslint-disable-next-line no-cond-assign
  while ((nl = entry.buffer.indexOf('\n')) !== -1) {
    const line = entry.buffer.slice(0, nl).trim();
    entry.buffer = entry.buffer.slice(nl + 1);
    if (!line) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn('[claude-bridge] malformed json line:', line.slice(0, 200));
      continue;
    }
    for (const out of translate(parsed)) emit(channelId, out);
  }
}

/**
 * Spawn `claude -p --resume <sessionId>` for one turn. Writes the user message
 * to stdin and closes it; CLI processes the turn, streams output, then exits.
 * If a turn is already in flight for this channel, the new one is rejected.
 */
function spawnTurn(channelId: string, message: string) {
  const state = channels.get(channelId);
  if (!state) {
    emit(channelId, { type: 'error', message: 'channel not registered' });
    return;
  }
  if (state.proc) {
    emit(channelId, { type: 'error', message: 'previous turn still running' });
    return;
  }

  const args = [
    '-p',
    '--resume', state.sessionId,
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
  ];

  let proc: ChildProcess;
  try {
    proc = spawn('claude', args, {
      cwd: state.projectDir,
      env: process.env,
      shell: false,
    });
  } catch (e) {
    emit(channelId, { type: 'error', message: `spawn failed: ${(e as Error).message}` });
    emit(channelId, { type: 'turn-end' });
    return;
  }

  const entry: ProcEntry = { proc, buffer: '' };
  state.proc = entry;

  proc.stdout?.on('data', (chunk) => consumeStdout(channelId, entry, chunk));
  proc.stderr?.on('data', (chunk) => {
    console.warn(`[claude-bridge ${channelId}] stderr:`, chunk.toString());
  });
  proc.on('error', (err) => {
    emit(channelId, { type: 'error', message: err.message });
  });
  proc.on('exit', () => {
    state.proc = undefined;
  });

  const payload = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: message }] },
  }) + '\n';
  proc.stdin?.write(payload);
  proc.stdin?.end();
}

function killChannel(channelId: string) {
  const state = channels.get(channelId);
  if (!state) return;
  if (state.proc) {
    try { state.proc.proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  channels.delete(channelId);
}

export function killAllClaudeChannels() {
  for (const [, s] of channels) {
    if (s.proc) {
      try { s.proc.proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }
  channels.clear();
}

/**
 * Load all (user, assistant) text turns from a session's .jsonl on disk so the
 * channel can show conversation history immediately on mount, even though the
 * CLI in --print mode doesn't replay history through stream-json on resume.
 */
async function loadHistory(projectKey: string, sessionId: string): Promise<Array<{
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}>> {
  const filePath = path.join(os.homedir(), '.claude', 'projects', projectKey, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = [];
    rl.on('line', (line) => {
      let obj: Record<string, unknown>;
      try { obj = JSON.parse(line); } catch { return; }
      const t = obj.type as string | undefined;
      if (t === 'user') {
        const m = obj.message as { role?: string; content?: unknown } | undefined;
        if (!m) return;
        let content = '';
        if (typeof m.content === 'string') content = m.content;
        else if (Array.isArray(m.content)) {
          content = m.content
            .filter((p: { type?: string }) => p.type === 'text')
            .map((p: { text?: string }) => p.text ?? '')
            .join('');
        }
        if (content) {
          const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : Date.now();
          turns.push({ role: 'user', content, timestamp: ts || Date.now() });
        }
      } else if (t === 'assistant') {
        const m = obj.message as { content?: unknown } | undefined;
        if (!m || !Array.isArray(m.content)) return;
        const content = m.content
          .filter((p: { type?: string }) => p.type === 'text')
          .map((p: { text?: string }) => p.text ?? '')
          .join('');
        if (content) {
          const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : Date.now();
          turns.push({ role: 'assistant', content, timestamp: ts || Date.now() });
        }
      }
    });
    rl.on('close', () => resolve(turns));
    stream.on('error', () => resolve(turns));
  });
}

export function setupClaudeBridge() {
  ipcMain.handle('claude:spawn', (_e, channelId: string, projectDir: string, sessionId: string | null) => {
    if (!sessionId) {
      emit(channelId, { type: 'error', message: 'new session not yet supported (resume only)' });
      return;
    }
    channels.set(channelId, { projectDir, sessionId });
    emit(channelId, { type: 'spawned' });
  });

  ipcMain.handle('claude:send', (_e, channelId: string, message: string) => {
    const state = channels.get(channelId);
    if (!state) {
      emit(channelId, { type: 'error', message: 'channel not connected' });
      return;
    }
    emit(channelId, { state: 'final', message: { role: 'user', content: message } });
    spawnTurn(channelId, message);
  });

  ipcMain.handle('claude:kill', (_e, channelId: string) => {
    killChannel(channelId);
  });

  ipcMain.handle('claude:load-history', async (_e, projectKey: string, sessionId: string) => {
    return loadHistory(projectKey, sessionId);
  });
}
