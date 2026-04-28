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

  // Surface the CLI's init event so the renderer can populate slash-command
  // autocomplete with the user's actual installed commands and skills.
  if (type === 'system' && ev.subtype === 'init') {
    const slashCommands = Array.isArray(ev.slash_commands) ? ev.slash_commands as string[] : [];
    const skills = Array.isArray(ev.skills) ? ev.skills as string[] : [];
    out.push({ type: 'init', slashCommands, skills });
    return out;
  }

  if (type === 'stream_event') {
    const inner = ev.event as Record<string, unknown> | undefined;
    if (!inner) return out;
    // Tool / thinking activity — surface as compact status events the UI can
    // render as inline pills above the streaming bubble.
    if (inner.type === 'content_block_start') {
      const block = inner.content_block as { type?: string; name?: string } | undefined;
      if (block?.type === 'thinking') {
        out.push({ type: 'activity', kind: 'thinking', label: 'Thinking…' });
      } else if (block?.type === 'tool_use') {
        out.push({ type: 'activity', kind: 'tool', label: block.name ?? 'tool' });
      }
      return out;
    }
    if (inner.type === 'content_block_delta') {
      const delta = inner.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        out.push({ state: 'delta', message: { role: 'assistant', content: delta.text } });
      }
      // thinking_delta and input_json_delta are intentionally dropped at the
      // bridge — the UI only needs the start signal to show "Thinking…" /
      // "Running Bash" pills, not the full thinking text or tool input JSON.
      return out;
    }
    if (inner.type === 'content_block_stop') {
      out.push({ type: 'activity', kind: 'end' });
      return out;
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
    '--include-partial-messages',
    '--verbose',
  ];

  let proc: ChildProcess;
  try {
    proc = spawn('claude', args, {
      cwd: state.projectDir,
      env: process.env,
      shell: false,
      // Put the child in its own process group so we can kill the whole tree
      // on interrupt — the Claude CLI may have spawned helpers / be blocked
      // inside an HTTPS request that ignores a single SIGINT.
      detached: true,
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

function killProcessTree(proc: ChildProcess) {
  const pid = proc.pid;
  if (typeof pid === 'number') {
    try { process.kill(-pid, 'SIGTERM'); }
    catch {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  } else {
    try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
}

function killChannel(channelId: string) {
  const state = channels.get(channelId);
  if (!state) return;
  if (state.proc) killProcessTree(state.proc.proc);
  channels.delete(channelId);
}

/**
 * Interrupt the in-flight turn for a channel without un-registering it. The
 * channel can immediately accept the next `claude:send` once the killed
 * process has exited.
 *
 * The CLI is spawned `detached: true` so it lives in its own process group;
 * SIGTERM on the negative pid kills the whole tree (including the HTTPS
 * request a single SIGINT to the parent might miss).
 */
function interruptChannel(channelId: string) {
  const state = channels.get(channelId);
  if (!state || !state.proc) return;
  const proc = state.proc.proc;
  killProcessTree(proc);
  // Hard-kill follow-up if the tree refuses to exit within 2s.
  const pid = proc.pid;
  setTimeout(() => {
    if (channels.get(channelId)?.proc?.proc === proc && !proc.killed) {
      if (typeof pid === 'number') {
        try { process.kill(-pid, 'SIGKILL'); } catch { /* ignore */ }
      }
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }, 2000);
  // Optimistically signal turn-end so the UI flips back to the send button —
  // the real exit handler will fire shortly with proc.on('exit').
  emit(channelId, { type: 'turn-end' });
  emit(channelId, { type: 'error', message: 'Interrupted by user' });
}

export function killAllClaudeChannels() {
  for (const [, s] of channels) {
    if (s.proc) killProcessTree(s.proc.proc);
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
      const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp as string) : Date.now();

      if (t === 'user') {
        // Skip Claude's internal envelopes — we don't want to render them as
        // user bubbles.
        if (obj.isMeta) return;
        const m = obj.message as { content?: unknown } | undefined;
        if (!m) return;
        let content = '';
        if (typeof m.content === 'string') content = m.content;
        else if (Array.isArray(m.content)) {
          content = m.content
            .filter((p: { type?: string }) => p.type === 'text')
            .map((p: { text?: string }) => p.text ?? '')
            .join('');
        }
        const trimmed = content.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('<local-command-caveat>')) return;
        if (trimmed.startsWith('<command-output>')) return;
        // Slash command echo: `<command-name>/foo</command-name>...`. Render
        // a clean bubble like "/foo" instead of the raw envelope.
        if (trimmed.startsWith('<command-name>')) {
          const m2 = /<command-name>([^<]+)<\/command-name>/.exec(trimmed);
          const slash = m2 ? m2[1] : trimmed;
          turns.push({ role: 'user', content: slash, timestamp: ts || Date.now() });
          return;
        }
        if (trimmed === 'Continue from where you left off.') return;
        turns.push({ role: 'user', content: trimmed, timestamp: ts || Date.now() });
        return;
      }

      if (t === 'assistant') {
        const m = obj.message as { content?: unknown } | undefined;
        if (!m || !Array.isArray(m.content)) return;
        const content = m.content
          .filter((p: { type?: string }) => p.type === 'text')
          .map((p: { text?: string }) => p.text ?? '')
          .join('');
        if (content) {
          turns.push({ role: 'assistant', content, timestamp: ts || Date.now() });
        }
        return;
      }

      // Slash command output: written as type:"system", subtype:"local_command",
      // content="<local-command-stdout>...</local-command-stdout>". Render it
      // as an assistant message (the slash command's response, not user-typed).
      if (t === 'system' && obj.subtype === 'local_command') {
        const raw = typeof obj.content === 'string' ? (obj.content as string) : '';
        const inner = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(raw);
        const text = (inner ? inner[1] : raw).trim();
        if (text) {
          turns.push({ role: 'assistant', content: text, timestamp: ts || Date.now() });
        }
        return;
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

  ipcMain.handle('claude:interrupt', (_e, channelId: string) => {
    interruptChannel(channelId);
  });

  ipcMain.handle('claude:load-history', async (_e, projectKey: string, sessionId: string) => {
    return loadHistory(projectKey, sessionId);
  });
}
