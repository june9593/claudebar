// One-shot migration: if a user previously ran ClawBar and is now installing
// ClaudeBar for the first time, copy the small set of personal preferences
// that still apply. Runs at most once per machine; gated by a flag file.
//
// What we migrate: theme, petKind, petVisible.
// What we DON'T migrate: window size (ClawBar's narrow popover dims would
// be wrong for ClaudeBar's float window), gateway/auth/channel settings
// (OpenClaw-only — meaningless here), device-identity.json (Ed25519
// keypair was for OpenClaw WebSocket auth).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLAWBAR_DIR = path.join(os.homedir(), '.clawbar');
const CLAUDEBAR_DIR = path.join(os.homedir(), '.claudebar');
const MIGRATED_FLAG = path.join(CLAUDEBAR_DIR, '.migrated-from-clawbar');

interface MigratableSettings {
  theme?: 'light' | 'dark' | 'system';
  petKind?: 'lobster' | 'claude';
  petVisible?: boolean;
}

export function maybeMigrateFromClawbar(): void {
  if (fs.existsSync(MIGRATED_FLAG)) return;
  const oldSettingsPath = path.join(CLAWBAR_DIR, 'settings.json');
  if (!fs.existsSync(oldSettingsPath)) return;

  let oldSettings: MigratableSettings;
  try {
    oldSettings = JSON.parse(fs.readFileSync(oldSettingsPath, 'utf8'));
  } catch {
    // Unreadable or malformed — skip the settings copy but still mark as attempted
    // so we don't retry on every launch.
    try { fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true }); } catch { /* ignore */ }
    try { fs.writeFileSync(MIGRATED_FLAG, new Date().toISOString() + ' (parse-failed)'); } catch { /* ignore */ }
    return;
  }

  // ClaudeBar default petKind is 'claude' (per spec §10), but if the user
  // had explicitly chosen 'lobster' in ClawBar we preserve that intent.
  const newSettings = {
    theme: oldSettings.theme ?? 'system',
    petKind: oldSettings.petKind ?? 'claude',
    petVisible: oldSettings.petVisible ?? true,
  };

  fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true });
  const newSettingsPath = path.join(CLAUDEBAR_DIR, 'settings.json');
  // Don't overwrite if the user has already started using ClaudeBar.
  if (!fs.existsSync(newSettingsPath)) {
    fs.writeFileSync(newSettingsPath, JSON.stringify(newSettings, null, 2));
  }
  fs.writeFileSync(MIGRATED_FLAG, new Date().toISOString());
  // eslint-disable-next-line no-console
  console.log('[migration] migrated theme/petKind/petVisible from ~/.clawbar/');
}
