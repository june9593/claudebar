import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CommandEntry {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  filePath: string;
}

/** Extract description from frontmatter `description:` or first non-empty line. */
function extractDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^description:\s*(.+)$/m);
    if (match) return match[1].trim();
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (t && t !== '---' && !t.startsWith('#')) return t;
    }
  } catch {
    // ignore
  }
  return '';
}

function walkCommandsDir(dir: string, source: CommandEntry['source'], pluginName?: string): CommandEntry[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => {
        const filePath = path.join(dir, d.name);
        const name = d.name.replace(/\.md$/, '');
        return {
          name,
          description: extractDescription(filePath),
          source,
          pluginName,
          filePath,
        };
      });
  } catch {
    return [];
  }
}

function listCommands(projectDir?: string): CommandEntry[] {
  const entries: CommandEntry[] = [];

  // User-level commands
  entries.push(...walkCommandsDir(path.join(os.homedir(), '.claude', 'commands'), 'user'));

  // Project-level commands
  if (projectDir) {
    entries.push(...walkCommandsDir(path.join(projectDir, '.claude', 'commands'), 'project'));
  }

  // Plugin commands
  const installedFile = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (fs.existsSync(installedFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(installedFile, 'utf8')) as {
        plugins?: Record<string, Array<{ installPath: string }>>;
      };
      for (const [name, installs] of Object.entries(data.plugins ?? {})) {
        for (const inst of installs) {
          const commandsDir = path.join(inst.installPath, 'commands');
          entries.push(...walkCommandsDir(commandsDir, 'plugin', name));
        }
      }
    } catch {
      // ignore
    }
  }

  return entries;
}

export function setupCommandsIPC(): void {
  ipcMain.handle('commands:list', (_event, projectDir?: string) => listCommands(projectDir));

  ipcMain.handle('commands:read', (_event, filePath: string) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  });
}
