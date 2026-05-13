import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface PluginInstall {
  name: string;
  marketplace: string;
  scope: 'user' | 'project';
  version: string;
  installedAt: string;
  lastUpdated: string;
  installPath: string;
}

interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, Array<{
    scope: 'user' | 'project';
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated: string;
    gitCommitSha?: string;
  }>>;
}

function readInstalled(): PluginInstall[] {
  const file = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as InstalledPluginsFile;
    const result: PluginInstall[] = [];
    for (const [name, installs] of Object.entries(data.plugins ?? {})) {
      if (installs.length === 0) continue;
      // Keep only the most-recently-installed version per plugin name to avoid
      // listing the same plugin multiple times when it has been updated (each
      // update creates a new entry with a fresh SHA install path).
      const latest = installs.reduce((a, b) => (a.installedAt > b.installedAt ? a : b));
      const marketplace = name.includes('@') ? name.split('@').slice(1).join('@') : '(unknown)';
      result.push({
        name,
        marketplace,
        scope: latest.scope,
        version: latest.version,
        installedAt: latest.installedAt,
        lastUpdated: latest.lastUpdated,
        installPath: latest.installPath,
      });
    }
    return result;
  } catch {
    return [];
  }
}

function readMarketplaces(): string[] {
  const dir = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces');
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function setupPluginsIPC(): void {
  ipcMain.handle('plugins:list', () => ({
    plugins: readInstalled(),
    marketplaces: readMarketplaces(),
  }));
}
