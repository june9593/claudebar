import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';

interface ProcEntry {
  proc: ChildProcess;
  buffer: string;
}

const procs = new Map<string, ProcEntry>();

function sendToRenderer(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

function emit(channelId: string, ev: Record<string, unknown>) {
  sendToRenderer('claude:event', { channelId, ...ev });
}

/**
 * Translate a single Claude stream-json event into either an OpenClaw-shaped
 * chat event ({ state, message }) or a control event ({ type }).
 * Returns null for events we silently drop in MVP.
 */
function translate(ev: Record<string, unknown>): Record<string, unknown> | null {
  const type = ev.type as string | undefined;
  switch (type) {
    case 'message_delta': {
      const delta = (ev.delta ?? {}) as { text?: string };
      const text = delta.text ?? '';
      return { state: 'delta', message: { role: 'assistant', content: text } };
    }
    case 'message_stop': {
      const message = (ev.message ?? {}) as { content?: unknown };
      const content = typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((p: { type?: string }) => p.type === 'text')
              .map((p: { text?: string }) => p.text ?? '')
              .join('')
          : '';
      return { state: 'final', message: { role: 'assistant', content } };
    }
    case 'tool_use': {
      const name = (ev.name as string) || 'tool';
      return { state: 'delta', message: { role: 'assistant', content: `\n[tool: ${name}]\n` } };
    }
    case 'error': {
      return { type: 'error', message: (ev.message as string) || 'Claude error' };
    }
    default:
      return null;
  }
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
    } catch (e) {
      console.warn('[claude-bridge] malformed json line:', line.slice(0, 200));
      continue;
    }
    const out = translate(parsed);
    if (out) emit(channelId, out);
  }
}

function spawnClaude(channelId: string, projectDir: string, sessionId: string | null) {
  if (procs.has(channelId)) return;
  const args = sessionId
    ? ['--resume', sessionId, '--output-format', 'stream-json']
    : ['--output-format', 'stream-json'];
  let proc: ChildProcess;
  try {
    proc = spawn('claude', args, {
      cwd: projectDir,
      env: process.env,
      shell: false,
    });
  } catch (e) {
    emit(channelId, { type: 'error', message: `spawn failed: ${(e as Error).message}` });
    return;
  }
  const entry: ProcEntry = { proc, buffer: '' };
  procs.set(channelId, entry);

  proc.stdout?.on('data', (chunk) => consumeStdout(channelId, entry, chunk));
  proc.stderr?.on('data', (chunk) => {
    console.warn(`[claude-bridge ${channelId}] stderr:`, chunk.toString());
  });
  proc.on('error', (err) => {
    emit(channelId, { type: 'error', message: err.message });
  });
  proc.on('exit', (code) => {
    procs.delete(channelId);
    emit(channelId, { type: 'exit', code });
  });
  emit(channelId, { type: 'spawned' });
}

function sendUserMessage(channelId: string, message: string) {
  const entry = procs.get(channelId);
  if (!entry || !entry.proc.stdin || entry.proc.stdin.destroyed) {
    emit(channelId, { type: 'error', message: 'channel not connected' });
    return;
  }
  emit(channelId, { state: 'final', message: { role: 'user', content: message } });
  entry.proc.stdin.write(JSON.stringify({ role: 'user', content: message }) + '\n');
}

function killChannel(channelId: string) {
  const entry = procs.get(channelId);
  if (!entry) return;
  try { entry.proc.kill('SIGTERM'); } catch { /* ignore */ }
  procs.delete(channelId);
}

export function killAllClaudeChannels() {
  for (const [, entry] of procs) {
    try { entry.proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  procs.clear();
}

export function setupClaudeBridge() {
  ipcMain.handle('claude:spawn', (_e, channelId: string, projectDir: string, sessionId: string | null) => {
    spawnClaude(channelId, projectDir, sessionId);
  });
  ipcMain.handle('claude:send', (_e, channelId: string, message: string) => {
    sendUserMessage(channelId, message);
  });
  ipcMain.handle('claude:kill', (_e, channelId: string) => {
    killChannel(channelId);
  });
}
