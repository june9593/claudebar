import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SkillEntry {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  dir: string;
}

/** Extract `description:` from SKILL.md frontmatter (first occurrence). */
function extractDescription(mdPath: string): string {
  try {
    const content = fs.readFileSync(mdPath, 'utf8');
    const match = content.match(/^description:\s*(.+)$/m);
    if (match) return match[1].trim();
    // Fallback: first non-empty line that isn't a YAML fence or heading marker
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (t && t !== '---' && !t.startsWith('#')) return t;
    }
  } catch {
    // ignore
  }
  return '';
}

function walkSkillsDir(dir: string, source: SkillEntry['source'], pluginName?: string): SkillEntry[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const skillDir = path.join(dir, d.name);
        const mdPath = path.join(skillDir, 'SKILL.md');
        return {
          name: d.name,
          description: extractDescription(mdPath),
          source,
          pluginName,
          dir: skillDir,
        };
      });
  } catch {
    return [];
  }
}

function listSkills(projectDir?: string): SkillEntry[] {
  const entries: SkillEntry[] = [];

  // User-level skills
  entries.push(...walkSkillsDir(path.join(os.homedir(), '.claude', 'skills'), 'user'));

  // Project-level skills
  if (projectDir) {
    entries.push(...walkSkillsDir(path.join(projectDir, '.claude', 'skills'), 'project'));
  }

  // Plugin skills
  const installedFile = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (fs.existsSync(installedFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(installedFile, 'utf8')) as {
        plugins?: Record<string, Array<{ installPath: string }>>;
      };
      for (const [name, installs] of Object.entries(data.plugins ?? {})) {
        for (const inst of installs) {
          const skillsDir = path.join(inst.installPath, 'skills');
          entries.push(...walkSkillsDir(skillsDir, 'plugin', name));
        }
      }
    } catch {
      // ignore
    }
  }

  return entries;
}

export function setupSkillsIPC(): void {
  ipcMain.handle('skills:list', (_event, projectDir?: string) => listSkills(projectDir));

  ipcMain.handle('skills:read', (_event, skillDir: string) => {
    const mdPath = path.join(skillDir, 'SKILL.md');
    try {
      return fs.readFileSync(mdPath, 'utf8');
    } catch {
      return null;
    }
  });
}
