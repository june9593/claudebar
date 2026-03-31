import { ipcMain } from 'electron';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSettings } from './settings';

/** Resolve the openclaw CLI command path */
function resolveClawCommand(): string {
  const settings = getSettings();
  const configured = settings.clawPath || 'openclaw';

  // If it's an absolute path, use directly
  if (path.isAbsolute(configured) && fs.existsSync(configured)) {
    return configured;
  }

  // Try to find in PATH
  try {
    const resolved = execSync(`which ${configured}`, { encoding: 'utf-8' }).trim();
    if (resolved) return resolved;
  } catch { /* not found */ }

  return configured;
}

/** Get shell PATH including version managers */
function getShellPath(): string {
  try {
    const shellPath = execSync('echo $PATH', {
      shell: '/bin/zsh',
      encoding: 'utf-8',
    }).trim();
    return shellPath || process.env.PATH || '';
  } catch {
    return process.env.PATH || '';
  }
}

/** Strip ANSI escape codes */
function stripAnsi(s: string): string {
  return s
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\r/g, '');
}

/** Execute an openclaw CLI command */
function execOpenClaw(
  args: string[],
  options?: { timeout?: number },
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const cmd = resolveClawCommand();
    const shellPath = getShellPath();
    const timeout = options?.timeout ?? 30000;

    const child = spawn(cmd, ['--no-color', ...args], {
      env: { ...process.env, PATH: shellPath, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
      resolve({ success: false, output: '', error: 'Command timed out' });
    }, timeout);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code === 0) {
        resolve({ success: true, output: stripAnsi(stdout) });
      } else {
        resolve({
          success: false,
          output: stripAnsi(stdout),
          error: stripAnsi(stderr) || `Exit code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (killed) return;
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

/** Try to parse JSON from possibly messy CLI output */
function tryParseJson<T>(output: string): T | null {
  // Find the first { or [ and try to parse from there
  const jsonStart = output.search(/[{[]/);
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(output.slice(jsonStart));
  } catch {
    return null;
  }
}

export function setupOpenClawIPC() {
  // Check connection
  ipcMain.handle('openclaw:check-connection', async () => {
    try {
      const result = await execOpenClaw(['--version'], { timeout: 5000 });
      if (result.success) {
        return { connected: true, version: result.output.trim() };
      }
      return { connected: false, error: result.error };
    } catch (err) {
      return { connected: false, error: String(err) };
    }
  });

  // Get agents list
  ipcMain.handle('openclaw:get-agents', async () => {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');

      if (!fs.existsSync(configPath)) {
        return { success: false, error: 'openclaw.json not found' };
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const agentsList = config?.agents?.list || [];

      const agents = agentsList.map((agent: Record<string, unknown>) => ({
        id: agent.id || 'unknown',
        name: agent.name || 'Unnamed',
        model: typeof agent.model === 'object' && agent.model !== null
          ? (agent.model as Record<string, unknown>).primary || 'unknown'
          : String(agent.model || 'unknown'),
        workspace: agent.workspace,
      }));

      return { success: true, agents };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
