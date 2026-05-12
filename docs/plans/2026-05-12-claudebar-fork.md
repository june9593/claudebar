# ClaudeBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork ClawBar into ClaudeBar — a Claude-Code-only desktop floating window with slim session rail + slide-out operator panel for plugins / skills / commands / stats.

**Architecture:** New repo `june9593/claudebar` cloned from ClawBar with full git history. Three sequenced phases, each independently shippable: P1 strips OpenClaw and re-brands (v0.5.0), P2 reshapes the UI to floating window + rail + overlay + markdown chat (v0.6.0), P3 lights up the 7 operator views (v0.7.0).

**Tech Stack:** Electron 35, React 19, TypeScript, Zustand, `@anthropic-ai/claude-agent-sdk` (BYO-CLI), Vite, electron-builder. New deps in P2: `react-markdown`, `remark-gfm`, `react-syntax-highlighter` (chosen over shiki for bundle size — locked here so later tasks don't relitigate).

**Source spec:** [`docs/specs/2026-05-12-claudebar-fork-design.md`](../specs/2026-05-12-claudebar-fork-design.md). Read the spec first; this plan implements it.

**Working directory:** All P1 tasks happen in the NEW repo `~/edge/claudebar` (created in Task 1). Commands assume cwd is repo root unless noted.

---

## Phase 1 — Bootstrap & Strip (v0.5.0)

Goal of phase: a working ClaudeBar app that's "ClawBar minus OpenClaw" — same shell + same Claude bridge + same chat UI, but no IM channels, no OpenClaw, renamed binary, new bundle id, new config dir. Confirms the fork compiles + runs end-to-end before any UI redesign.

### Task 1: Clone ClawBar to new repo

**Files:**
- Create: `~/edge/claudebar/` (new directory, full clone of ClawBar)
- New GitHub repo: `june9593/claudebar` (empty, created via `gh repo create`)

- [ ] **Step 1: Create the empty GitHub repo**

```bash
gh repo create june9593/claudebar --public --description "Floating-window Claude Code desktop app (BYO-CLI)" --homepage "https://june9593.github.io/claudebar"
```

Expected: GitHub returns the new repo URL. No code pushed yet.

- [ ] **Step 2: Clone ClawBar into new local directory**

```bash
cd ~/edge
git clone https://github.com/june9593/clawbar.git claudebar
cd claudebar
```

Expected: full ClawBar history present. `git log --oneline | head` should show recent ClawBar commits.

- [ ] **Step 3: Re-point origin to the new repo**

```bash
git remote set-url origin https://github.com/june9593/claudebar.git
git remote -v
```

Expected: both fetch and push point to `june9593/claudebar`.

- [ ] **Step 4: Initial push (preserves history)**

```bash
git push -u origin main
```

Expected: `* [new branch] main -> main`. GitHub repo now has full commit history.

- [ ] **Step 5: Sanity verify**

```bash
git log --oneline | wc -l          # should match ClawBar's commit count
git remote -v                       # should be claudebar, not clawbar
```

No commit needed — Task 1 is bootstrap only.

---

### Task 2: Rename package + bundle ids

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Update package.json identity fields**

Edit `package.json`. Replace lines 1-12 with:

```json
{
  "name": "claudebar",
  "version": "0.5.0",
  "description": "Floating-window desktop app for local Claude Code CLI sessions (BYO-CLI)",
  "main": "dist-electron/electron/main.js",
  "homepage": "https://github.com/june9593/claudebar",
  "repository": {
    "type": "git",
    "url": "https://github.com/june9593/claudebar.git"
  },
  "bugs": {
    "url": "https://github.com/june9593/claudebar/issues"
  },
```

Also update `keywords` to:

```json
  "keywords": [
    "claude-code",
    "claude",
    "anthropic",
    "menu-bar",
    "macos",
    "windows",
    "electron"
  ],
```

- [ ] **Step 2: Update package-lock top-level name + version**

Edit `package-lock.json` lines 1-9, change both `"clawbar"` → `"claudebar"` and the version field to `"0.5.0"`. There are usually two places (root + the empty-string `packages.""` entry).

- [ ] **Step 3: Update electron-builder.yml**

Edit `electron-builder.yml`. Replace the first three lines and the `nsis.shortcutName` field:

```yaml
appId: com.june9593.claudebar
productName: ClaudeBar
copyright: Copyright © 2026 june9593
```

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: ClaudeBar
```

- [ ] **Step 4: Verify build still passes**

```bash
npm install
npm run build
```

Expected: clean build, no type errors. (At this point the app is still functionally ClawBar — only names changed.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "chore: rebrand package + bundle id to ClaudeBar (com.june9593.claudebar)"
```

---

### Task 3: Add config-dir migration shim

**Files:**
- Create: `electron/migration.ts`
- Modify: `electron/ipc/settings.ts` (constants only — change `~/.clawbar` → `~/.claudebar`)
- Modify: `electron/shell-env.ts` (constants only — change `~/.clawbar` → `~/.claudebar`)
- Modify: `electron/claude-bridge.ts` (constants only — change `~/.clawbar/sdk-trace.jsonl` → `~/.claudebar/sdk-trace.jsonl` for `CLAWBAR_TRACE` path)
- Modify: `electron/main.ts` (call `maybeMigrateFromClawbar()` first thing in `whenReady`)

- [ ] **Step 1: Create migration module**

Create `electron/migration.ts`:

```ts
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
    return; // unreadable — give up silently
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
```

- [ ] **Step 2: Repoint settings.json path**

In `electron/ipc/settings.ts`, find the `~/.clawbar` reference (currently around line 59 — the `getSettingsPath` helper) and change it to `~/.claudebar`. Search the file for any other `clawbar` string and update.

```bash
grep -n "clawbar" electron/ipc/settings.ts
```

Replace each `clawbar` → `claudebar` in that file.

- [ ] **Step 3: Repoint shell-env diagnostic path**

In `electron/shell-env.ts`, find:

```ts
const DIAG_DIR = path.join(os.homedir(), '.clawbar');
```

Change to:

```ts
const DIAG_DIR = path.join(os.homedir(), '.claudebar');
```

- [ ] **Step 4: Repoint SDK trace + CLAWBAR_TRACE env var**

In `electron/claude-bridge.ts`, find the `CLAWBAR_TRACE` env var read and the `~/.clawbar/sdk-trace.jsonl` path. Update both:

```bash
grep -n "CLAWBAR_TRACE\|.clawbar" electron/claude-bridge.ts
```

Change `process.env.CLAWBAR_TRACE` → `process.env.CLAUDEBAR_TRACE` and the trace file path to `~/.claudebar/sdk-trace.jsonl`.

- [ ] **Step 5: Wire migration into main.ts**

In `electron/main.ts`, edit the `app.whenReady().then(async () => {` block. Add the migration call as the very first line, before `hydrateShellEnv()`:

```ts
import { maybeMigrateFromClawbar } from './migration';

// (existing imports continue above)

app.whenReady().then(async () => {
  // Run migration BEFORE anything reads settings — settings IPC needs
  // ~/.claudebar/settings.json to exist if the user is migrating from ClawBar.
  maybeMigrateFromClawbar();

  await hydrateShellEnv();
  // ... rest of existing whenReady body
```

- [ ] **Step 6: Type-check + build**

```bash
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add electron/migration.ts electron/main.ts electron/ipc/settings.ts electron/shell-env.ts electron/claude-bridge.ts
git commit -m "feat(migration): one-shot copy of theme/petKind from ~/.clawbar/ to ~/.claudebar/

Switches all internal paths from ~/.clawbar to ~/.claudebar (settings,
shell-env diagnostic log, SDK trace). CLAWBAR_TRACE env var renamed to
CLAUDEBAR_TRACE."
```

---

### Task 4: Remove OpenClaw IPC + WebSocket bridge

**Files:**
- Delete: `electron/ws-bridge.ts`
- Modify: `electron/main.ts` (remove `setupWsBridge` import + call)
- Modify: `electron/preload.ts` (remove WS-related IPC exposures)
- Modify: `types/electron.d.ts` (remove WS types)

- [ ] **Step 1: Identify all WS-bridge integration points**

```bash
grep -rn "ws-bridge\|setupWsBridge\|wsService" electron/ src/ types/ shared/ 2>/dev/null
```

Save the output mentally — every callsite needs to either be deleted or stubbed out depending on whether the rest of the file survives. (Most won't survive — they're OpenClaw-only.)

- [ ] **Step 2: Delete the bridge file**

```bash
rm electron/ws-bridge.ts
```

- [ ] **Step 3: Remove the import + call from main.ts**

Open `electron/main.ts`. Delete the line:

```ts
import { setupWsBridge } from './ws-bridge';
```

And in `whenReady`, delete the line:

```ts
setupWsBridge();
```

- [ ] **Step 4: Strip WS exposures from preload.ts**

```bash
grep -n "ws:\|ws[A-Z]" electron/preload.ts
```

Remove every `ws:*` IPC channel exposure (`ws:connect`, `ws:disconnect`, `ws:send`, `ws:event` listeners, etc). The Claude bridge IPC (`claude:*`) and settings IPC (`settings:*`) MUST stay.

- [ ] **Step 5: Strip WS types from types/electron.d.ts**

Open `types/electron.d.ts`. Remove the `ws` field from the `electronAPI` interface and any `Ws*` types that are no longer referenced.

- [ ] **Step 6: Type-check (renderer will still fail — that's expected, deleted in Task 5)**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: passes for the main process. Renderer `tsc --noEmit` will fail — don't run it yet. Tasks 5+ delete the renderer-side WS consumers.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(strip): remove OpenClaw WebSocket bridge

ws-bridge.ts deleted; preload + main.ts no longer expose ws:* IPC.
Renderer-side consumers (CompactChat, ChatWebView, etc.) deleted in
follow-up tasks."
```

---

### Task 5: Delete OpenClaw + IM channel components

**Files:**
- Delete: `src/components/OpenClawChannel.tsx`, `CompactChat.tsx`, `ChatWebView.tsx`, `ChatHistory.tsx`, `WebChannel.tsx`, `LobsterIcon.tsx`, `Sidebar.tsx`, `AddChannelMenu.tsx`, `ChannelContextMenu.tsx`, `add-channel/` (whole directory)
- Delete: `src/components/AgentsView.tsx`, `CronView.tsx`, `LogsView.tsx`, `UsageView.tsx`, `ApprovalsView.tsx` (Approvals → red badge per spec §4; rest dropped)
- Delete: `src/hooks/useClawChat.ts`, `useWsRequest.ts`
- Delete: `src/stores/webviewStore.ts`

(Surviving views: `OverviewView.tsx`, `SessionsView.tsx`, `SkillsView.tsx`, `SettingsPanel.tsx`. They get rewritten in Phase 3 — keep their files for now even though their content is OpenClaw-flavored.)

- [ ] **Step 1: Delete the components**

```bash
cd src/components
rm OpenClawChannel.tsx CompactChat.tsx ChatWebView.tsx ChatHistory.tsx \
   WebChannel.tsx LobsterIcon.tsx Sidebar.tsx \
   AddChannelMenu.tsx ChannelContextMenu.tsx \
   AgentsView.tsx CronView.tsx LogsView.tsx UsageView.tsx ApprovalsView.tsx
rm -rf add-channel
cd ../..
```

- [ ] **Step 2: Delete the OpenClaw hooks + store**

```bash
rm src/hooks/useClawChat.ts src/hooks/useWsRequest.ts
rm src/stores/webviewStore.ts
```

- [ ] **Step 3: Renderer type-check (will fail — that's the point, surfaces remaining references)**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors pointing at imports of deleted files. Likely from `App.tsx`, `ChannelHost.tsx`, `ChannelDock.tsx`, `OverviewView.tsx`, `SessionsView.tsx`, `SkillsView.tsx`, `SettingsPanel.tsx`, `TitleBar.tsx`. Note them — fixed in Tasks 6-9.

- [ ] **Step 4: Commit (broken state is fine — it's a single phase)**

```bash
git add -A
git commit -m "feat(strip): delete OpenClaw + IM channel components

Removes OpenClawChannel, CompactChat, ChatWebView, WebChannel, lobster
icon, OpenClaw sidebar, channel-add wizard, channel context menu,
useClawChat / useWsRequest hooks, webviewStore. Plus the operator views
that don't fit ClaudeBar (Agents/Cron/Logs/Usage/Approvals — Approvals
becomes a red badge on session icons per spec §4).

Renderer doesn't compile yet; restored in Tasks 6-9."
```

---

### Task 6: Collapse channelStore to sessionStore

**Files:**
- Rename + rewrite: `src/stores/channelStore.ts` → `src/stores/sessionStore.ts`
- Modify: `src/types/index.ts` (remove `WebChannelDef` and `OpenClawChannelDef` from the discriminated union — keep only `ClaudeChannelDef`, rename `Channel` → `ClaudeSession`)

- [ ] **Step 1: Inspect current channelStore + types**

```bash
cat src/stores/channelStore.ts | head -50
cat src/types/index.ts
```

- [ ] **Step 2: Simplify the type definitions**

In `src/types/index.ts`, replace the channel discriminated union with:

```ts
// A single ClaudeBar session: a project + a Claude Code session id, with
// presentation metadata (icon hash inputs, preview text). No more channel
// kinds — ClaudeBar only hosts Claude sessions.
export interface ClaudeSession {
  id: string;            // stable internal id (cl-<timestamp>-<rand>); placeholder UUID for new sessions, real session id for resumed
  name: string;          // display name "shortProjectName · preview"
  enabled: boolean;
  projectDir: string;    // absolute path
  projectKey: string;    // ~/.claude/projects/<key>/ slug
  sessionId: string;     // either placeholder UUID (new) or real Claude session id (resumed)
  preview: string;       // last assistant message snippet
  iconLetter: string;    // first letter of project shortName (kept for backward compat with hash inputs)
  iconColor: string;     // accent color hash (kept for backward compat)
}
```

Delete `WebChannelDef`, `OpenClawChannelDef`, `Channel` (the union). Anywhere that imported those types from `src/types/index.ts` will fail compile — fixed in subsequent tasks.

- [ ] **Step 3: Rewrite channelStore as sessionStore**

```bash
git mv src/stores/channelStore.ts src/stores/sessionStore.ts
```

Then open `src/stores/sessionStore.ts` and replace the entire contents with:

```ts
import { create } from 'zustand';
import type { ClaudeSession } from '../types';
import { useSettingsStore } from './settingsStore';

interface SessionState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;

  syncFromSettings: () => void;
  setActive: (id: string) => void;

  addClaude: (input: {
    projectDir: string;
    projectKey: string;
    sessionId: string;
    preview: string;
    iconLetter: string;
    iconColor: string;
  }) => string;

  /** Hard switch: tear down the bridge session before persisting. */
  switchClaudeSession: (sessionRowId: string, newSessionId: string, newPreview: string) => void;

  /** Soft mirror from bridge's system/init — swap sessionId in place,
   *  no claude:close, no remount. (See claude-bridge-new-session-id-mirror
   *  memory for the four-file invariant.) */
  setRealSessionId: (sessionRowId: string, realSessionId: string) => void;

  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
}

function persist(sessions: ClaudeSession[], activeSessionId: string | null) {
  const api = useSettingsStore.getState();
  api.updateSetting('sessions', sessions);
  api.updateSetting('activeSessionId', activeSessionId);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  syncFromSettings: () => {
    const s = useSettingsStore.getState();
    set({
      sessions: (s as unknown as { sessions?: ClaudeSession[] }).sessions ?? [],
      activeSessionId: (s as unknown as { activeSessionId?: string | null }).activeSessionId ?? null,
    });
  },

  setActive: (id) => {
    set({ activeSessionId: id });
    persist(get().sessions, id);
  },

  addClaude: ({ projectDir, projectKey, sessionId, preview, iconLetter, iconColor }) => {
    const existing = get().sessions.find((s) => s.sessionId === sessionId);
    if (existing) {
      get().setActive(existing.id);
      return existing.id;
    }
    const id = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const shortName = (() => {
      const parts = projectDir.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : projectDir;
    })();
    const trimmedPreview = preview.length > 28 ? preview.slice(0, 28) + '…' : preview || '(empty session)';
    const newSession: ClaudeSession = {
      id,
      name: `${shortName} · ${trimmedPreview}`,
      enabled: true,
      projectDir,
      projectKey,
      sessionId,
      preview,
      iconLetter,
      iconColor,
    };
    const sessions = [...get().sessions, newSession];
    set({ sessions, activeSessionId: id });
    persist(sessions, id);
    return id;
  },

  switchClaudeSession: (sessionRowId, newSessionId, newPreview) => {
    const list = get().sessions;
    const target = list.find((c) => c.id === sessionRowId);
    if (!target) return;
    if (target.sessionId === newSessionId) return;

    window.electronAPI?.claude?.close(sessionRowId).catch(() => { /* ignore */ });

    const trimmedPreview = newPreview.length > 28
      ? newPreview.slice(0, 28) + '…'
      : newPreview || '(empty session)';
    const projectShort = (() => {
      const parts = target.projectDir.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : target.projectDir;
    })();

    const sessions = list.map((c) =>
      c.id === sessionRowId
        ? { ...c, sessionId: newSessionId, preview: newPreview, name: `${projectShort} · ${trimmedPreview}` }
        : c
    );
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  setRealSessionId: (sessionRowId, realSessionId) => {
    const list = get().sessions;
    const target = list.find((c) => c.id === sessionRowId);
    if (!target) return;
    if (target.sessionId === realSessionId) return;
    const sessions = list.map((c) =>
      c.id === sessionRowId ? { ...c, sessionId: realSessionId } : c
    );
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  remove: (id) => {
    const list = get().sessions;
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    window.electronAPI?.claude?.close(id).catch(() => { /* ignore */ });
    const sessions = list.filter((c) => c.id !== id);
    let next = get().activeSessionId;
    if (next === id) {
      const fallback = sessions[Math.max(0, idx - 1)] ?? sessions[0];
      next = fallback?.id ?? null;
    }
    set({ sessions, activeSessionId: next });
    persist(sessions, next);
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const sessions = get().sessions.map((c) => c.id === id ? { ...c, name: trimmed } : c);
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  moveUp: (id) => {
    const list = [...get().sessions];
    const i = list.findIndex((c) => c.id === id);
    if (i <= 0) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    set({ sessions: list });
    persist(list, get().activeSessionId);
  },

  moveDown: (id) => {
    const list = [...get().sessions];
    const i = list.findIndex((c) => c.id === id);
    if (i < 0 || i >= list.length - 1) return;
    [list[i], list[i + 1]] = [list[i + 1], list[i]];
    set({ sessions: list });
    persist(list, get().activeSessionId);
  },
}));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors now point at App.tsx / TitleBar / ChannelHost / ChannelDock importing the old `useChannelStore` or the deleted types. Fixed in Tasks 7-9.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(stores): collapse channelStore to sessionStore (Claude-only)

Drop the channel discriminated union; ClaudeBar only hosts Claude
sessions. switchClaudeSession + setRealSessionId invariants preserved
verbatim — see claude-bridge-new-session-id-mirror memory for the
four-file constraint these participate in."
```

---

### Task 7: Reduce settingsStore to ClaudeBar settings

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Inspect current shape**

```bash
cat src/stores/settingsStore.ts | head -80
```

Note the current settings field list. ClaudeBar's spec §6 lists a different set.

- [ ] **Step 2: Replace settings field defaults**

Open `src/stores/settingsStore.ts`. Find the default-settings object and replace its body with the ClaudeBar set (from spec §6). Keep the existing `loadSettings` / `updateSetting` / `hydrated` machinery intact — only the field list changes.

The replacement default object:

```ts
const defaultSettings = {
  // Claude CLI
  claudePath: '',
  defaultModel: 'default' as 'default' | 'opus' | 'sonnet' | 'haiku',
  defaultPermissionMode: 'default' as 'default' | 'acceptEdits' | 'bypassPermissions',
  defaultProjectDir: null as string | null,
  idleCloseMinutes: 30,

  // Window
  theme: 'system' as 'light' | 'dark' | 'system',
  windowSize: { w: 400, h: 800 },
  windowPosition: null as { x: number; y: number } | null,
  alwaysOnTop: false,
  hideOnClickOutside: false,
  globalShortcut: process.platform === 'darwin' ? 'Cmd+Shift+C' : 'Ctrl+Shift+C',
  petVisible: true,
  petKind: 'claude' as 'claude' | 'lobster',

  // Diagnostics
  enableSdkTrace: false,

  // Sessions (persisted across launches)
  sessions: [] as ClaudeSession[],
  activeSessionId: null as string | null,
};
```

Update the imports at the top of the file to add:

```ts
import type { ClaudeSession } from '../types';
```

Remove any references to the old OpenClaw fields: `gatewayUrl`, `authMode`, `chatMode`, `channels`, `activeChannelId`, `channelOrder`, etc. Search for them:

```bash
grep -n "gatewayUrl\|authMode\|chatMode\|channels:\|activeChannelId" src/stores/settingsStore.ts
```

Delete each line. The `setView` / `view` / `resolvedTheme` machinery (if present) stays.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors moved — now `App.tsx` / `SettingsPanel.tsx` / `TitleBar.tsx` etc. complain about gone fields. Fixed in Tasks 8-9.

- [ ] **Step 4: Commit**

```bash
git add src/stores/settingsStore.ts src/types/index.ts
git commit -m "feat(stores): trim settings to ClaudeBar set per spec §6

Drop OpenClaw fields (gatewayUrl/authMode/chatMode/channels). Add
defaultModel, defaultPermissionMode, defaultProjectDir,
idleCloseMinutes, windowSize/Position, alwaysOnTop, globalShortcut,
enableSdkTrace. Default petKind flipped to 'claude'."
```

---

### Task 8: Strip App.tsx + TitleBar to single-session shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TitleBar.tsx`
- Delete: `src/components/ChannelHost.tsx`, `ChannelDock.tsx`, `ChannelIcon.tsx` (will be replaced by `SessionRail` + `ChatHost` in Phase 2 — for now we use the existing `ClaudeChannel` directly)

The goal of this task is only to get the renderer compiling again with a simplified UI: one active Claude session shown full-window, plus the existing operator panel toggle. No new design yet — Phase 2 builds the rail + overlay.

- [ ] **Step 1: Delete the dock components**

```bash
rm src/components/ChannelHost.tsx src/components/ChannelDock.tsx src/components/ChannelIcon.tsx
```

- [ ] **Step 2: Rewrite App.tsx as session-only shell**

Replace `src/App.tsx` with:

```tsx
import { useEffect } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useSessionStore } from './stores/sessionStore';
import { TitleBar } from './components/TitleBar';
import { ClaudeChannel } from './components/ClaudeChannel';

export default function App() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const syncFromSettings = useSessionStore((s) => s.syncFromSettings);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {activeSession
          ? <ClaudeChannel channel={activeSession} isActive />
          : <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: 13, padding: 24, textAlign: 'center',
    }}>
      No session active. Phase 2 adds the session rail; for now use Settings to seed a session.
    </div>
  );
}
```

- [ ] **Step 3: Update TitleBar.tsx**

`TitleBar.tsx` likely references `useChannelStore` (the old name) and channel-switching props. Replace its imports to use `useSessionStore` and remove any back/refresh buttons that depended on a webview channel (those are gone). The minimum surviving content: app title text on the left, a settings gear icon on the right that opens the operator panel (or, for Phase 1, a placeholder `console.log('open panel')`).

A working stub — replace `src/components/TitleBar.tsx` with:

```tsx
import { Settings } from 'lucide-react';

export function TitleBar() {
  return (
    <div style={{
      height: 36,
      WebkitAppRegion: 'drag',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px',
      borderBottom: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
    } as React.CSSProperties}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        ClaudeBar
      </span>
      <button
        onClick={() => { /* Phase 2 opens the operator panel here */ }}
        style={{
          WebkitAppRegion: 'no-drag',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', padding: 4,
        } as React.CSSProperties}
        aria-label="Settings"
      >
        <Settings size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Find any remaining stale imports**

```bash
grep -rn "useChannelStore\|ChannelHost\|ChannelDock\|ChannelIcon" src/ 2>/dev/null
```

Expected: only `ClaudeChannel.tsx` may still reference `useChannelStore`. Open it and rename the hook import to `useSessionStore`. Adjust prop typing from `ClaudeChannelDef` → `ClaudeSession`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: clean (or near-clean — fix anything left).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): minimal Phase 1 shell — single ClaudeChannel + stub TitleBar

Drops ChannelHost/Dock/Icon. App.tsx now renders the active ClaudeSession
directly. Phase 2 will reshape this into rail + chat + overlay."
```

---

### Task 9: Bring back the operator panel as a Settings-only stub

**Files:**
- Modify: `src/components/SettingsPanel.tsx` (replace OpenClaw-flavored body with a stub for ClaudeBar settings — full content lands in Phase 3 Task 25)

The goal: the gear button in TitleBar opens *something*, even if that something is a 50-line stub. This keeps the app reachable for adding sessions while we shape Phase 2.

- [ ] **Step 1: Skim what SettingsPanel currently does**

```bash
wc -l src/components/SettingsPanel.tsx
head -40 src/components/SettingsPanel.tsx
```

It almost certainly references `gatewayUrl`, `authMode`, `chatMode`. Strip those.

- [ ] **Step 2: Rewrite SettingsPanel as ClaudeBar stub**

Replace `src/components/SettingsPanel.tsx` with:

```tsx
import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const theme = useSettingsStore((s) => (s as unknown as { theme: 'light' | 'dark' | 'system' }).theme);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--color-bg-primary)',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Settings</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          Close
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Phase 3 will fully populate this panel per spec §6.
      </div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
        Theme:
        <select
          value={theme}
          onChange={(e) => updateSetting('theme', e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Wire TitleBar gear → SettingsPanel toggle**

In `src/components/TitleBar.tsx`, replace the placeholder onClick with a state-lifted handler. Simplest: lift the open state into App.tsx.

Edit `src/App.tsx`. Add `useState`:

```tsx
import { useEffect, useState } from 'react';
// ...
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  // ... existing state ...
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ... existing effects ...

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {activeSession
          ? <ClaudeChannel channel={activeSession} isActive />
          : <EmptyState />}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
```

And update `TitleBar` to accept the prop:

```tsx
interface Props { onOpenSettings: () => void; }

export function TitleBar({ onOpenSettings }: Props) {
  // ... existing markup ...
  // change the button onClick to: onClick={onOpenSettings}
}
```

- [ ] **Step 4: Build + run end-to-end**

```bash
npm run build
npm run dev:electron
```

Expected: app launches, shows TitleBar + EmptyState. Click the gear → SettingsPanel slides in. Theme dropdown persists across restarts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): Phase 1 SettingsPanel stub + working gear toggle

Theme picker only — full Settings landing in Phase 3 Task 25."
```

---

### Task 10: Verify Phase 1 ships, tag v0.5.0

**Files:** none (release prep)

- [ ] **Step 1: Full build**

```bash
npm run clean
npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 2: Local DMG smoke test**

```bash
npm run pack:mac:dmg:arm64
```

Expected: DMG produced under `release-artifacts/`. Mount it, drag ClaudeBar.app to /Applications, launch from Finder. Verify:
- Tray icon appears
- Click tray → window appears (still popover-style at this point — Phase 2 changes this)
- Migration: if `~/.clawbar/settings.json` existed, `~/.claudebar/settings.json` should now exist with theme/petKind
- Settings panel opens via gear, theme selector works
- (Sessions list is empty — expected, no UI yet to add one. That's why Phase 2 is next.)

- [ ] **Step 3: Tag v0.5.0**

```bash
git tag v0.5.0
git push origin main
git push origin v0.5.0
```

- [ ] **Step 4: GitHub release (optional for v0.5.0 since UI is incomplete)**

If you want to keep this internal as a checkpoint, skip the release. If you want testers to try the migration path, create a draft release on GitHub with the DMG attached and label it "internal preview".

---

## Phase 2 — New shell (v0.6.0)

Goal of phase: replace the popover-style window with a draggable / resizable floating window. Build the slim rail (always-visible 32px column with session icons + operator panel toggle + new-session button + settings shortcut). Build the slide-out operator panel as a left overlay (no view content yet — just the shell + a couple of stub view tabs). Add markdown rendering + syntax highlighting + multi-line input to the chat. Hook up the global shortcut + tray-toggle behavior. Ship as v0.6.0.

After Phase 2, the app looks and feels like ClaudeBar — even though the operator views are stubs that get content in Phase 3.

### Task 11: Convert window to standalone floating window

**Files:**
- Modify: `electron/main.ts` (BrowserWindow construction + tray click handler)

The current `electron/main.ts` constructs a popover-style window (frameless, vibrancy, hides on blur, anchored to tray). We want a regular floating window: still frameless + vibrancy (looks like Edge Copilot), but draggable via the title bar, resizable, persistable position/size, and toggled by tray click rather than tray-anchored.

- [ ] **Step 1: Inspect current BrowserWindow construction**

```bash
grep -n "BrowserWindow\|setBounds\|setPosition\|tray\.on\|on('click'" electron/main.ts
```

Note where the popover window is created and how the tray click is wired.

- [ ] **Step 2: Rewrite createWindow + tray click handler**

In `electron/main.ts`, find `function createWindow()` (or however it's named) and replace with:

```ts
function createWindow() {
  const settings = getSettings() as {
    windowSize?: { w: number; h: number };
    windowPosition?: { x: number; y: number } | null;
    alwaysOnTop?: boolean;
    hideOnClickOutside?: boolean;
  };
  const size = settings.windowSize ?? { w: 400, h: 800 };
  const pos = settings.windowPosition ?? null;

  mainWindow = new BrowserWindow({
    width: size.w,
    height: size.h,
    minWidth: 320,
    minHeight: 500,
    x: pos?.x,
    y: pos?.y,
    frame: false,
    transparent: false,
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#1a1a1a',
    titleBarStyle: 'hidden',
    show: false,
    skipTaskbar: false,
    alwaysOnTop: settings.alwaysOnTop ?? false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Track visibility for tray toggle
  mainWindow.on('show', () => { windowVisible = true; });
  mainWindow.on('hide', () => { windowVisible = false; });
  mainWindow.on('close', (e) => {
    // Hide instead of quit; user must use tray Quit menu
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Persist size + position on user resize/drag
  const persistBounds = () => {
    if (!mainWindow) return;
    const [w, h] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    setSetting('windowSize', { w, h });
    setSetting('windowPosition', { x, y });
  };
  mainWindow.on('resized', persistBounds);
  mainWindow.on('moved', persistBounds);

  // Optional: hide on blur (off by default per spec — float windows shouldn't auto-hide)
  mainWindow.on('blur', () => {
    const s = getSettings() as { hideOnClickOutside?: boolean };
    if (s.hideOnClickOutside) mainWindow?.hide();
  });
}
```

Add the `isQuitting` flag at the top of the file:

```ts
let isQuitting = false;
```

And in the existing `app.on('before-quit', ...)`:

```ts
app.on('before-quit', () => {
  isQuitting = true;
});
```

- [ ] **Step 3: Replace tray click handler**

Find the existing tray click handler (search for `tray.on('click'` or `tray.setContextMenu`). Replace with a simple toggle:

```ts
function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}
function hideWindow() {
  mainWindow?.hide();
}
function toggleWindow() {
  if (!mainWindow) return;
  if (windowVisible) hideWindow();
  else showWindow();
}

// Wiring:
tray?.on('click', toggleWindow);
```

(Right-click should still pop a context menu — the existing one with Quit / Switch Pet / etc. is fine to keep.)

- [ ] **Step 4: Hide dock icon on macOS**

`app.dock?.hide()` should already exist (ClawBar uses it). Confirm:

```bash
grep -n "dock\.hide\|app.dock" electron/main.ts
```

If missing, add at the top of whenReady (after migration + hydration):

```ts
app.dock?.hide();
```

- [ ] **Step 5: Build + run**

```bash
npm run build
npm run dev:electron
```

Expected: window opens at center of screen, 400×800. Drag the (still empty) TitleBar — window moves. Resize from corners — window resizes, dimensions persist (close + relaunch, comes back at same size and position). Click tray → window toggles visibility. Right-click tray → menu still works.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat(window): standalone floating window (400×800, draggable, resizable)

Tray click toggles visibility instead of anchoring popover. Window
position + size persisted to settings on user adjustment, restored
next launch. Closing the window hides instead of quits — Quit lives
on tray right-click menu. hideOnClickOutside default false (float
windows shouldn't auto-hide)."
```

---

### Task 12: Wire global shortcut

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add globalShortcut import + registration**

In `electron/main.ts`, add to imports:

```ts
import { app, BrowserWindow, Tray, nativeImage, nativeTheme, ipcMain, screen, globalShortcut } from 'electron';
```

In the `whenReady().then(async () => { ... })` block, after `createWindow()`:

```ts
const settings = getSettings() as { globalShortcut?: string };
const shortcut = settings.globalShortcut ?? (process.platform === 'darwin' ? 'CommandOrControl+Shift+C' : 'Control+Shift+C');
const ok = globalShortcut.register(shortcut, toggleWindow);
if (!ok) {
  // eslint-disable-next-line no-console
  console.warn(`[shortcut] failed to register ${shortcut}`);
}
```

In `app.on('will-quit', ...)` (add the handler if it doesn't exist):

```ts
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

- [ ] **Step 2: Re-register shortcut on settings change**

Settings IPC already broadcasts `settings:changed` events (or has the callback in the renderer's `updateSetting`). For simplicity, watch via the main-process settings module: in `electron/ipc/settings.ts`, after `setSetting` writes, emit a `globalShortcutChanged` if the key was `globalShortcut`. Then in `main.ts`:

```ts
// Pseudo — adapt to actual settings module API. If settings doesn't
// have an event emitter, wrap setSetting in main.ts and intercept the
// globalShortcut key.
import { onSettingChanged } from './ipc/settings';

onSettingChanged('globalShortcut', (value: string) => {
  globalShortcut.unregisterAll();
  globalShortcut.register(value, toggleWindow);
});
```

If the settings module doesn't expose `onSettingChanged`, add it:

In `electron/ipc/settings.ts`, near `setSetting`:

```ts
type Listener = (value: unknown) => void;
const listeners = new Map<string, Listener[]>();

export function onSettingChanged(key: string, fn: Listener): void {
  const arr = listeners.get(key) ?? [];
  arr.push(fn);
  listeners.set(key, arr);
}

// In setSetting, after the write:
const arr = listeners.get(key) ?? [];
for (const fn of arr) fn(value);
```

- [ ] **Step 3: Build + verify**

```bash
npm run build && npm run dev:electron
```

Press `Cmd+Shift+C` (macOS) — window should toggle. Open Settings, change shortcut to `Cmd+Shift+J`, press it — should now toggle. Old `Cmd+Shift+C` should not.

(Settings UI for changing shortcut isn't built yet — Phase 3. For now you can verify by editing `~/.claudebar/settings.json` directly and restarting.)

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/ipc/settings.ts
git commit -m "feat(shortcut): global shortcut toggles window visibility

Default Cmd+Shift+C / Ctrl+Shift+C; rebindable via settings.globalShortcut.
Listener system added to settings module so shortcut changes
re-register without an app restart."
```

---

### Task 13: Build SessionRail component

**Files:**
- Create: `src/components/SessionRail.tsx`
- Modify: `src/App.tsx` (mount rail to the left of chat)

The slim rail per spec §4: 32px wide, always visible. From top to bottom: panel-toggle button, new-session button, one icon per session (with red badge for pending approvals), Settings button at the bottom.

- [ ] **Step 1: Create the rail**

Create `src/components/SessionRail.tsx`:

```tsx
import { Plus, Menu, Settings as SettingsIcon } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import type { ClaudeSession } from '../types';

interface Props {
  onOpenPanel: () => void;
  onOpenSettings: () => void;
  onNewSession: () => void;
  pendingApprovalsBySessionId: Record<string, number>;
}

export function SessionRail({ onOpenPanel, onOpenSettings, onNewSession, pendingApprovalsBySessionId }: Props) {
  const sessions = useSessionStore((s) => s.sessions.filter((x) => x.enabled));
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActive = useSessionStore((s) => s.setActive);

  return (
    <div style={{
      width: 32,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderRight: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
      paddingTop: 6,
      paddingBottom: 6,
    }}>
      <RailButton label="Operator panel" onClick={onOpenPanel}>
        <Menu size={16} strokeWidth={1.75} />
      </RailButton>
      <RailButton label="New session" onClick={onNewSession}>
        <Plus size={16} strokeWidth={1.75} />
      </RailButton>

      <div style={{ height: 8 }} />
      <div style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
        {sessions.map((s) => (
          <SessionRailIcon
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            pendingApprovals={pendingApprovalsBySessionId[s.id] ?? 0}
            onClick={() => setActive(s.id)}
          />
        ))}
      </div>

      <RailButton label="Settings" onClick={onOpenSettings}>
        <SettingsIcon size={16} strokeWidth={1.75} />
      </RailButton>
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 28, height: 28,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        margin: '2px 0',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function SessionRailIcon({ session, active, pendingApprovals, onClick }: {
  session: ClaudeSession;
  active: boolean;
  pendingApprovals: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={session.name}
      aria-label={session.name}
      style={{
        position: 'relative',
        width: 28, height: 28,
        background: active ? 'var(--color-bg-hover)' : 'transparent',
        border: 'none', cursor: 'pointer',
        borderRadius: 6,
        margin: '2px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        fontSize: 11, fontWeight: 600,
      }}
    >
      {/* Phase 3 swaps this letter for the ClaudePet variant icon
         hashed from project + session id. */}
      {session.iconLetter || '?'}
      {pendingApprovals > 0 && (
        <span style={{
          position: 'absolute',
          top: 0, right: 0,
          background: 'var(--color-status-disconnected, #e53)',
          color: 'white',
          borderRadius: 8,
          minWidth: 14, height: 14,
          padding: '0 3px',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {pendingApprovals > 9 ? '9+' : pendingApprovals}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Mount in App.tsx**

Replace `src/App.tsx`'s render block to include the rail to the left of the chat area:

```tsx
import { useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useSessionStore } from './stores/sessionStore';
import { TitleBar } from './components/TitleBar';
import { ClaudeChannel } from './components/ClaudeChannel';
import { SettingsPanel } from './components/SettingsPanel';
import { SessionRail } from './components/SessionRail';

export default function App() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const syncFromSettings = useSessionStore((s) => s.syncFromSettings);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);

  // Stub — Task 14 will populate this from useClaudeSession's pendingApproval
  // aggregated across all active sessions.
  const pendingApprovalsBySessionId: Record<string, number> = {};

  const onNewSession = () => {
    // Stub — Task 16 wires up the new-session wizard
    // eslint-disable-next-line no-console
    console.log('TODO: open new-session wizard');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <SessionRail
          onOpenPanel={() => setPanelOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewSession={onNewSession}
          pendingApprovalsBySessionId={pendingApprovalsBySessionId}
        />
        <div style={{ flex: 1, position: 'relative' }}>
          {activeSession
            ? <ClaudeChannel channel={activeSession} isActive />
            : <EmptyState />}
          {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
          {panelOpen && (
            <div
              onClick={() => setPanelOpen(false)}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 50,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 280, height: '100%',
                  background: 'var(--color-bg-primary)',
                  borderRight: '0.5px solid var(--color-border-primary)',
                  padding: 16,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                }}
              >
                Operator panel — Phase 3 fills the 7 view tabs here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-tertiary)', fontSize: 13, padding: 24, textAlign: 'center',
    }}>
      No active session. Click + on the rail to start one.
    </div>
  );
}
```

- [ ] **Step 3: Build + verify visually**

```bash
npm run dev
# in another terminal:
npm run dev:electron
```

Expected: window now has a 32px-wide left rail with 4 icons (panel, +, settings) and any sessions you have. Click + → console logs "TODO". Click panel-toggle → semi-transparent overlay with stub panel slides in. Click backdrop → closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionRail.tsx src/App.tsx
git commit -m "feat(ui): SessionRail + slide-out operator overlay shell

32px left rail with panel toggle / new-session / settings + per-session
icons. Operator overlay opens as left sidebar with backdrop click-to-
dismiss. Pending-approval red badge plumbing in place (sources stubbed
in Task 14). New-session button stubbed — Task 16 wires the wizard."
```

---

### Task 14: Aggregate pending approvals across sessions

**Files:**
- Create: `src/stores/approvalsStore.ts` (lightweight global counter)
- Modify: `src/hooks/useClaudeSession.ts` (publish pending count to the store)
- Modify: `src/App.tsx` (subscribe + pass to SessionRail)

The red badge needs to know "how many pending approvals + AskUserQuestions does each session have right now". `useClaudeSession` already tracks `pendingApproval` and `pendingAsk` per session. We need to lift that info to a global store so the rail can render badges for sessions whose chat isn't currently visible.

- [ ] **Step 1: Create the store**

Create `src/stores/approvalsStore.ts`:

```ts
import { create } from 'zustand';

interface ApprovalsState {
  // sessionRowId → count of (pendingApproval ? 1 : 0) + (pendingAsk ? 1 : 0)
  countBySession: Record<string, number>;
  setCount: (sessionRowId: string, count: number) => void;
  clear: (sessionRowId: string) => void;
}

export const useApprovalsStore = create<ApprovalsState>((set) => ({
  countBySession: {},
  setCount: (sessionRowId, count) => set((s) => {
    const next = { ...s.countBySession };
    if (count <= 0) delete next[sessionRowId];
    else next[sessionRowId] = count;
    return { countBySession: next };
  }),
  clear: (sessionRowId) => set((s) => {
    const next = { ...s.countBySession };
    delete next[sessionRowId];
    return { countBySession: next };
  }),
}));
```

- [ ] **Step 2: Publish count from useClaudeSession**

In `src/hooks/useClaudeSession.ts`, near the top imports:

```ts
import { useApprovalsStore } from '../stores/approvalsStore';
```

Inside the hook body, after the `pendingApproval` / `pendingAsk` `useState` declarations, add:

```ts
const setApprovalsCount = useApprovalsStore((s) => s.setCount);
const clearApprovalsCount = useApprovalsStore((s) => s.clear);

useEffect(() => {
  const count = (pendingApproval ? 1 : 0) + (pendingAsk ? 1 : 0);
  setApprovalsCount(channelId, count);
  return () => { clearApprovalsCount(channelId); };
}, [channelId, pendingApproval, pendingAsk, setApprovalsCount, clearApprovalsCount]);
```

This makes the count globally readable, and clears it when the hook unmounts (session closed).

- [ ] **Step 3: Read in App.tsx**

Replace the stub in `App.tsx`:

```tsx
import { useApprovalsStore } from './stores/approvalsStore';
// ...
const pendingApprovalsBySessionId = useApprovalsStore((s) => s.countBySession);
```

Delete the empty stub object.

- [ ] **Step 4: Smoke test**

```bash
npm run dev:electron
```

Manually trigger an approval (have a session run a tool that requires approval). Verify the badge appears on the session icon when the approval card is visible, disappears when you approve/deny.

- [ ] **Step 5: Commit**

```bash
git add src/stores/approvalsStore.ts src/hooks/useClaudeSession.ts src/App.tsx
git commit -m "feat(approvals): per-session pending count in global store

useClaudeSession publishes (pendingApproval ? 1 : 0) + (pendingAsk ? 1 : 0)
to approvalsStore.countBySession[channelId]. SessionRail reads it and
shows a red badge with the count (9+ when >9). Replaces the dropped
ApprovalsView (spec §4 Q7 decision)."
```

---

### Task 15: Add markdown + syntax highlighting to chat

**Files:**
- Create: `src/components/Markdown.tsx`
- Modify: `src/components/ChatView.tsx` (use Markdown for assistant messages)
- Modify: `package.json` (add deps)

Per spec §8: `react-markdown` + `remark-gfm` + `react-syntax-highlighter` (locked in plan header).

- [ ] **Step 1: Install deps**

```bash
npm install react-markdown remark-gfm react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

- [ ] **Step 2: Create the Markdown component**

Create `src/components/Markdown.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';

interface Props { source: string; }

export function Markdown({ source }: Props) {
  const theme = useSettingsStore((s) => (s as unknown as { resolvedTheme?: 'light' | 'dark' }).resolvedTheme);
  const isDark = theme === 'dark';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...rest }: {
          inline?: boolean;
          className?: string;
          children?: React.ReactNode;
        } & React.HTMLAttributes<HTMLElement>) {
          const match = /language-(\w+)/.exec(className ?? '');
          const code = String(children ?? '').replace(/\n$/, '');
          if (!inline && match) {
            return <CodeBlock language={match[1]} code={code} isDark={isDark} />;
          }
          return (
            <code
              className={className}
              style={{
                background: 'var(--color-bg-input)',
                padding: '1px 5px', borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: '0.9em',
              }}
              {...rest}
            >
              {children}
            </code>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

function CodeBlock({ language, code, isDark }: { language: string; code: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--color-bg-tertiary)',
        padding: '4px 8px',
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        fontSize: 11, color: 'var(--color-text-tertiary)',
        borderBottom: '0.5px solid var(--color-border-primary)',
      }}>
        <span>{language}</span>
        <button
          onClick={onCopy}
          aria-label="Copy code"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0, borderTopRightRadius: 0,
          borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
          fontSize: 12,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
```

- [ ] **Step 3: Use Markdown in ChatView**

Open `src/components/ChatView.tsx`. Find the assistant-message rendering (the `<div>` containing the assistant text). Replace plain text rendering with:

```tsx
import { Markdown } from './Markdown';
// ...
// Where assistant message body is rendered today (likely something like {message.content}):
<Markdown source={message.content} />
```

Keep user messages as plain text (no markdown — user input stays literal).

- [ ] **Step 4: Build + visual check**

```bash
npm run dev:electron
```

Send a message asking Claude to write a code snippet. Verify:
- Code block renders with syntax highlight
- "Copy" button appears top-right of the code block, copies on click
- Bullet lists / `**bold**` / `[links](https://x)` render correctly
- Inline `code` is highlighted with a subtle background

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/Markdown.tsx src/components/ChatView.tsx
git commit -m "feat(chat): markdown rendering + code-block highlighting

react-markdown + remark-gfm for GFM (tables, task lists, strikethrough,
autolinks). react-syntax-highlighter (Prism, oneDark/oneLight) for code
blocks. Per-block 'Copy' button. Inline code styled subtly."
```

---

### Task 16: Multi-line input with Shift+Enter newline

**Files:**
- Modify: `src/components/ChatView.tsx` (input element)

The current input is likely a single-line `<input>`. Replace with an auto-growing `<textarea>` where Enter sends and Shift+Enter inserts a newline.

- [ ] **Step 1: Find the current input**

```bash
grep -n "input\|textarea\|onKeyDown" src/components/ChatView.tsx | head
```

- [ ] **Step 2: Replace with auto-growing textarea**

In `src/components/ChatView.tsx`, find the input render (probably the bottom of the component). Replace with this textarea pattern:

```tsx
import { useRef, useEffect } from 'react';
// (add to existing imports if not already there)

// State (already present, but if not):
const [text, setText] = useState('');
const textareaRef = useRef<HTMLTextAreaElement | null>(null);

// Auto-grow on text change:
useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';  // cap at 200px
}, [text]);

const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (text.trim()) {
      sendMessage(text.trim());
      setText('');
    }
  }
  // Shift+Enter: default behavior inserts newline; do nothing.
};

// In the JSX where the old input was:
<div style={{
  borderTop: '0.5px solid var(--color-border-primary)',
  padding: 8,
  background: 'var(--color-bg-secondary)',
  display: 'flex', gap: 6, alignItems: 'flex-end',
}}>
  <textarea
    ref={textareaRef}
    value={text}
    onChange={(e) => setText(e.target.value)}
    onKeyDown={onKeyDown}
    placeholder="Message Claude…  (Shift+Enter for newline)"
    rows={1}
    style={{
      flex: 1,
      resize: 'none',
      minHeight: 28, maxHeight: 200,
      padding: '6px 10px',
      borderRadius: 8,
      border: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-input)',
      color: 'var(--color-text-primary)',
      fontFamily: 'inherit', fontSize: 13,
      outline: 'none',
      lineHeight: '1.4',
    }}
  />
  <button
    onClick={() => { if (text.trim()) { sendMessage(text.trim()); setText(''); } }}
    disabled={!text.trim() || isTyping}
    style={{
      padding: '6px 12px',
      borderRadius: 8,
      border: 'none',
      background: 'var(--color-accent)', color: 'white',
      cursor: 'pointer',
      fontSize: 13,
    }}
  >
    Send
  </button>
</div>
```

(If a Stop / abort button already exists in the chat for in-flight turns, keep it — render it conditionally based on `isTyping`.)

- [ ] **Step 3: Visual smoke test**

```bash
npm run dev:electron
```

Type a multi-line message: `line 1`, `Shift+Enter`, `line 2`. Send. Verify both lines transmit. Send a long message — textarea grows up to 200px then scrolls.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatView.tsx
git commit -m "feat(chat): multi-line input with Shift+Enter newline

Textarea auto-grows up to 200px then scrolls. Enter sends, Shift+Enter
inserts newline. Send button disabled when empty or while assistant is
typing."
```

---

### Task 17: New-session wizard wired to rail's + button

**Files:**
- Create: `src/components/add-session/AddSessionWizard.tsx` (rebuild — Task 5 deleted the old one)
- Modify: `src/App.tsx` (mount the wizard)

Reuse the project picker + session picker logic from the old `ClaudeWizard.tsx` (it lived in `src/components/add-channel/`). The mechanics are unchanged: pick project → pick session (resume) or new. Just renamed and freed of the channel-add concept.

- [ ] **Step 1: Create the wizard component**

Create `src/components/add-session/AddSessionWizard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClaudeSessionsStore } from '../../stores/claudeSessionsStore';
import { useSessionStore } from '../../stores/sessionStore';

interface Props {
  onClose: () => void;
}

type Step = 'projects' | 'sessions';

function shortName(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}
function firstLetter(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}
function colorFromKey(key: string): string {
  // Cheap hash → hue; saturation/lightness fixed for legibility
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 60% 50%)`;
}
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AddSessionWizard({ onClose }: Props) {
  const cliStatus = useClaudeSessionsStore((s) => s.cliStatus);
  const cliCheckState = useClaudeSessionsStore((s) => s.cliCheckState);
  const projects = useClaudeSessionsStore((s) => s.projects);
  const projectsState = useClaudeSessionsStore((s) => s.projectsState);
  const sessionsByKey = useClaudeSessionsStore((s) => s.sessionsByKey);
  const sessionsState = useClaudeSessionsStore((s) => s.sessionsState);
  const errorMsg = useClaudeSessionsStore((s) => s.errorMsg);
  const checkCli = useClaudeSessionsStore((s) => s.checkCli);
  const loadProjects = useClaudeSessionsStore((s) => s.loadProjects);
  const loadSessions = useClaudeSessionsStore((s) => s.loadSessions);
  const reset = useClaudeSessionsStore((s) => s.reset);

  const addClaude = useSessionStore((s) => s.addClaude);

  const [step, setStep] = useState<Step>('projects');
  const [pickedProject, setPickedProject] = useState<{ key: string; decodedPath: string } | null>(null);

  useEffect(() => {
    reset();
    (async () => {
      await checkCli();
      const status = useClaudeSessionsStore.getState().cliStatus;
      if (status?.found) await loadProjects();
    })();
  }, [reset, checkCli, loadProjects]);

  const finish = (sessionId: string, preview: string) => {
    if (!pickedProject) return;
    const sn = shortName(pickedProject.decodedPath);
    addClaude({
      projectDir: pickedProject.decodedPath,
      projectKey: pickedProject.key,
      sessionId,
      preview,
      iconLetter: firstLetter(sn),
      iconColor: colorFromKey(pickedProject.key),
    });
    onClose();
  };

  const newSession = () => {
    if (!pickedProject) return;
    finish(crypto.randomUUID(), '');
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 360, maxHeight: '80vh', overflowY: 'auto',
          background: 'var(--color-bg-primary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 16, zIndex: 100,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>
          {step === 'projects' ? 'Pick a project' : `Pick a session — ${shortName(pickedProject?.decodedPath ?? '')}`}
        </div>

        {(cliCheckState === 'loading' || cliCheckState === 'idle') && <Spinner label="Checking for Claude CLI…" />}
        {cliStatus && !cliStatus.found && (
          <div style={{ padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Claude CLI not found</div>
            <pre style={{ background: 'var(--color-bg-input)', padding: 8, borderRadius: 6, fontSize: 11 }}>npm install -g @anthropic-ai/claude-code</pre>
          </div>
        )}

        {cliStatus?.found && step === 'projects' && (
          <>
            {projectsState === 'loading' && <Spinner label="Scanning projects…" />}
            {projectsState === 'error' && <ErrorBox msg={errorMsg ?? 'unknown error'} />}
            {projectsState === 'ready' && projects.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                No projects yet. Run <code>claude</code> in a directory first.
              </div>
            )}
            {projectsState === 'ready' && projects.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPickedProject({ key: p.key, decodedPath: p.decodedPath }); setStep('sessions'); loadSessions(p.key); }}
                style={rowStyle}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.decodedPath}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}</div>
                </div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>
              </button>
            ))}
          </>
        )}

        {cliStatus?.found && step === 'sessions' && pickedProject && (
          <>
            <button
              onClick={() => { setStep('projects'); setPickedProject(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, marginBottom: 8 }}
            >
              ← Projects
            </button>
            <button onClick={newSession} style={{ ...rowStyle, color: 'var(--color-accent)' }}>
              <span style={{ fontSize: 18, marginRight: 4 }}>+</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>New session in this directory</span>
            </button>
            {(() => {
              const state = sessionsState[pickedProject.key];
              const list = sessionsByKey[pickedProject.key] ?? [];
              if (state === 'loading') return <Spinner label="Loading sessions…" inline />;
              if (state === 'error') return <ErrorBox msg={errorMsg ?? 'unknown error'} />;
              if (state === 'ready' && list.length === 0) {
                return <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No sessions yet.</div>;
              }
              return list.map((s) => (
                <button key={s.sessionId} onClick={() => finish(s.sessionId, s.preview)} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview || '(empty session)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{relativeTime(s.mtime)}</div>
                  </div>
                </button>
              ));
            })()}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12, padding: '4px 10px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '8px 8px', borderRadius: 6,
  border: 'none', background: 'transparent', cursor: 'pointer',
  textAlign: 'left',
};

function Spinner({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div style={{ padding: inline ? '8px 0' : '20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      <span style={{ width: 12, height: 12, border: '2px solid var(--color-border-primary)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'cw-spin 0.8s linear infinite' }} />
      <span>{label}</span>
      <style>{`@keyframes cw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ padding: 10, fontSize: 12, color: 'var(--color-status-disconnected, #e53)', background: 'var(--color-bg-input)', borderRadius: 6, margin: '6px 0' }}>{msg}</div>;
}
```

- [ ] **Step 2: Wire into App.tsx**

In `src/App.tsx`, replace the stub onNewSession:

```tsx
import { AddSessionWizard } from './components/add-session/AddSessionWizard';

// ...
const [wizardOpen, setWizardOpen] = useState(false);

// Replace the onNewSession stub:
const onNewSession = () => setWizardOpen(true);

// In the render block, add inside the chat area's relative container:
{wizardOpen && <AddSessionWizard onClose={() => setWizardOpen(false)} />}
```

- [ ] **Step 3: Smoke test end-to-end**

```bash
npm run dev:electron
```

Click + on rail. Wizard opens. Pick project, pick "New session in this directory". Wizard closes. New session icon appears on rail and is set active. Type a message — Claude responds. Verify the markdown rendering + code highlighting works.

- [ ] **Step 4: Commit**

```bash
git add src/components/add-session/AddSessionWizard.tsx src/App.tsx
git commit -m "feat(ui): AddSessionWizard wired to rail + button

Reuses claudeSessionsStore (CLI check, project scan, session listing).
Resume an existing session OR start fresh; resumes are validated by
existence of the .jsonl, new sessions get a placeholder UUID per the
new-session id mirroring invariant (claude-bridge handles the resume
guard, see memory)."
```

---

### Task 18: Verify Phase 2 ships, tag v0.6.0

**Files:** none (release prep)

- [ ] **Step 1: Full clean + build**

```bash
npm run clean
npm run build
```

Expected: clean.

- [ ] **Step 2: Local DMG smoke test**

```bash
npm run pack:mac:dmg:arm64
```

Mount DMG, install, launch from Finder. Verify:
- Window opens at center of screen, 400×800
- Drag the title bar — window moves
- Resize from corners — persists across relaunch
- Tray click toggles
- `Cmd+Shift+C` toggles
- Click + on rail → wizard → pick project → new session → can chat
- Markdown renders, code highlights, Copy button works
- Multi-line: Shift+Enter inserts newline
- Tool call needing approval → red badge appears on session icon
- Switch to a different session → badge stays on the original session's icon

- [ ] **Step 3: Tag**

```bash
git tag v0.6.0
git push origin main
git push origin v0.6.0
```

## Phase 3 — Operator views (v0.7.0)

Goal of phase: replace the operator overlay's stub body with a tabbed container hosting the 7 views from spec §5. Build the 5 fully-new IPC handlers (plugins, skills three-layer, commands, stats incremental cache) and wire each view to its data source. Ship as v0.7.0 = first feature-complete ClaudeBar.

After Phase 3, the spec §14 success criteria are achievable end-to-end.

### Task 19: Operator panel tabbed shell

**Files:**
- Create: `src/components/operator/OperatorPanel.tsx`
- Modify: `src/App.tsx` (replace the inline stub overlay with `<OperatorPanel/>`)

The panel hosts 7 view tabs (Overview / Sessions / Plugins / Skills / Commands / Stats / Settings). Tab strip on top, view content below. Default tab: Overview.

- [ ] **Step 1: Create the panel shell**

Create `src/components/operator/OperatorPanel.tsx`:

```tsx
import { useState } from 'react';
import { LayoutGrid, MessageSquare, Package, Sparkles, Terminal, BarChart3, Settings as SettingsIcon } from 'lucide-react';

type Tab = 'overview' | 'sessions' | 'plugins' | 'skills' | 'commands' | 'stats' | 'settings';

interface Props { onClose: () => void; }

const TABS: Array<{ id: Tab; label: string; Icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutGrid },
  { id: 'sessions', label: 'Sessions', Icon: MessageSquare },
  { id: 'plugins', label: 'Plugins', Icon: Package },
  { id: 'skills', label: 'Skills', Icon: Sparkles },
  { id: 'commands', label: 'Commands', Icon: Terminal },
  { id: 'stats', label: 'Stats', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function OperatorPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320, height: '100%',
          background: 'var(--color-bg-primary)',
          borderRight: '0.5px solid var(--color-border-primary)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <TabStrip tab={tab} setTab={setTab} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'sessions' && <SessionsTab />}
          {tab === 'plugins' && <PluginsTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'commands' && <CommandsTab />}
          {tab === 'stats' && <StatsTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

function TabStrip({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '0.5px solid var(--color-border-primary)',
      background: 'var(--color-bg-secondary)',
      padding: '4px 8px',
      gap: 2,
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={label}
            aria-label={label}
            style={{
              background: active ? 'var(--color-bg-hover)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              padding: '6px 8px', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11,
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

// Stub bodies — Tasks 20-26 fill these in.
function OverviewTab() { return <Stub label="Overview" />; }
function SessionsTab() { return <Stub label="Sessions" />; }
function PluginsTab() { return <Stub label="Plugins" />; }
function SkillsTab() { return <Stub label="Skills" />; }
function CommandsTab() { return <Stub label="Commands" />; }
function StatsTab() { return <Stub label="Stats" />; }
function SettingsTab() { return <Stub label="Settings" />; }

function Stub({ label }: { label: string }) {
  return (
    <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
      {label} — pending Phase 3 implementation.
    </div>
  );
}
```

- [ ] **Step 2: Mount in App.tsx**

In `src/App.tsx`, delete the inline stub overlay and use `OperatorPanel`:

```tsx
import { OperatorPanel } from './components/operator/OperatorPanel';

// In the chat-area render block, replace the previous inline overlay div:
{panelOpen && <OperatorPanel onClose={() => setPanelOpen(false)} />}
```

Also: now that Settings has its own tab, remove the standalone Settings panel (the gear in TitleBar should open the operator panel directly to the Settings tab). Simplest:

```tsx
<TitleBar onOpenSettings={() => { setPanelOpen(true); /* default tab; user clicks Settings tab */ }} />
```

Or, to land directly on Settings, lift the initial tab into a prop:

```tsx
const [panelInitialTab, setPanelInitialTab] = useState<'overview' | 'settings'>('overview');

const openPanel = () => { setPanelInitialTab('overview'); setPanelOpen(true); };
const openSettings = () => { setPanelInitialTab('settings'); setPanelOpen(true); };

// And pass initialTab into OperatorPanel:
{panelOpen && <OperatorPanel initialTab={panelInitialTab} onClose={() => setPanelOpen(false)} />}
```

Update `OperatorPanel`'s `useState`:

```tsx
interface Props { onClose: () => void; initialTab?: Tab; }
export function OperatorPanel({ onClose, initialTab = 'overview' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // ...
}
```

Delete `SettingsPanel.tsx` (now redundant — the SettingsTab inside OperatorPanel will own this):

```bash
rm src/components/SettingsPanel.tsx
```

And remove the `SettingsPanel` import + render from `App.tsx`. Remove the `settingsOpen` state too — replaced by the panel mechanism.

- [ ] **Step 3: Visual smoke test**

```bash
npm run dev:electron
```

Click the panel-toggle on rail → tabbed panel slides in. All 7 tabs visible, all show their stub. Click Settings on rail → opens directly to Settings tab. Click backdrop → closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/operator/OperatorPanel.tsx src/App.tsx
git rm src/components/SettingsPanel.tsx
git commit -m "feat(operator): tabbed operator panel shell with 7 stub tabs

Replaces the standalone SettingsPanel; gear button + rail panel button
both open OperatorPanel, with Settings landing directly on the Settings
tab. Tab bodies stubbed in Tasks 20-26."
```

---

### Task 20: Overview tab

**Files:**
- Modify: `src/components/operator/OperatorPanel.tsx` (replace `OverviewTab` body)

Per spec §5 the Overview shows: CLI status (path + version), project count from `~/.claude/projects/`, active session count from sessionStore, today's tokens from cache, pending approval count.

- [ ] **Step 1: Build the Overview body**

In `src/components/operator/OperatorPanel.tsx`, replace the `OverviewTab` stub:

```tsx
import { useEffect, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useApprovalsStore } from '../../stores/approvalsStore';
// (add to existing imports at top of file)

interface CliStatus { found: boolean; path?: string; version?: string }

function OverviewTab() {
  const sessions = useSessionStore((s) => s.sessions);
  const pending = useApprovalsStore((s) => Object.values(s.countBySession).reduce((a, b) => a + b, 0));

  const [cli, setCli] = useState<CliStatus | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [tokensToday, setTokensToday] = useState<{ input: number; output: number } | null>(null);

  useEffect(() => {
    void window.electronAPI?.claude?.checkCli().then((r: CliStatus) => setCli(r));
    void window.electronAPI?.claude?.scanProjects?.().then((r: { projects: unknown[] }) => setProjectCount(r.projects.length)).catch(() => setProjectCount(null));
    // Stats IPC added in Task 24 — try, gracefully skip if not yet wired
    void (window.electronAPI as unknown as { stats?: { today: () => Promise<{ input: number; output: number }> } }).stats?.today?.()
      .then(setTokensToday)
      .catch(() => setTokensToday(null));
  }, []);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="Claude CLI">
        {!cli && <Skel />}
        {cli && cli.found && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <div>Path: <code style={{ fontSize: 11 }}>{cli.path}</code></div>
            <div>Version: {cli.version || '(unknown)'}</div>
          </div>
        )}
        {cli && !cli.found && (
          <div style={{ fontSize: 12, color: 'var(--color-status-disconnected, #e53)' }}>
            Not found. Install with <code>npm install -g @anthropic-ai/claude-code</code>.
          </div>
        )}
      </Card>

      <Card title="Workspace">
        <Row label="Projects" value={projectCount ?? '…'} />
        <Row label="Active sessions" value={sessions.length} />
        <Row label="Pending approvals" value={pending} highlight={pending > 0} />
      </Card>

      <Card title="Today's tokens">
        {!tokensToday && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>(no usage data yet)</div>}
        {tokensToday && (
          <>
            <Row label="Input" value={tokensToday.input.toLocaleString()} />
            <Row label="Output" value={tokensToday.output.toLocaleString()} />
          </>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '0.5px solid var(--color-border-primary)',
      borderRadius: 8,
      padding: 10,
      background: 'var(--color-bg-secondary)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--color-status-disconnected, #e53)' : 'var(--color-text-primary)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function Skel() {
  return <div style={{ height: 18, background: 'var(--color-bg-input)', borderRadius: 4, animation: 'cw-pulse 1.4s ease-in-out infinite' }} />;
}
```

Add the keyframes once near the top of the file (or inline as a `<style>` tag inside `Skel`):

```css
@keyframes cw-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev:electron
```

Open panel → Overview tab. Should show CLI path/version (already wired since Phase 1), project count, active session count, pending approvals. Today's tokens stays "(no usage data yet)" until Task 24.

- [ ] **Step 3: Commit**

```bash
git add src/components/operator/OperatorPanel.tsx
git commit -m "feat(view/overview): CLI status + workspace stats + tokens-today"
```

---

### Task 21: Sessions tab

**Files:**
- Modify: `src/components/operator/OperatorPanel.tsx` (replace `SessionsTab` body)

Lists all sessions on disk (across all projects), grouped by project, sorted by mtime. Click resumes (calls sessionStore.addClaude). "+ New" button per group jumps into the wizard with project pre-picked.

- [ ] **Step 1: Reuse claudeSessionsStore + build the body**

In `OperatorPanel.tsx`, replace `SessionsTab`:

```tsx
import { useClaudeSessionsStore } from '../../stores/claudeSessionsStore';
// (already imported at top — add if not)

function SessionsTab() {
  const projects = useClaudeSessionsStore((s) => s.projects);
  const projectsState = useClaudeSessionsStore((s) => s.projectsState);
  const sessionsByKey = useClaudeSessionsStore((s) => s.sessionsByKey);
  const sessionsState = useClaudeSessionsStore((s) => s.sessionsState);
  const loadProjects = useClaudeSessionsStore((s) => s.loadProjects);
  const loadSessions = useClaudeSessionsStore((s) => s.loadSessions);
  const addClaude = useSessionStore((s) => s.addClaude);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  if (projectsState === 'loading' || projectsState === 'idle') {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Scanning…</div>;
  }
  if (projects.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No projects.</div>;
  }

  const onToggle = (key: string, decodedPath: string) => {
    const newExpanded = !expanded[key];
    setExpanded((s) => ({ ...s, [key]: newExpanded }));
    if (newExpanded && !sessionsByKey[key]) void loadSessions(key);
  };

  const onResume = (projectKey: string, decodedPath: string, sessionId: string, preview: string) => {
    addClaude({
      projectDir: decodedPath,
      projectKey,
      sessionId,
      preview,
      iconLetter: ((decodedPath.split('/').filter(Boolean).pop() ?? '?').slice(0, 1).toUpperCase()),
      iconColor: 'hsl(' + (Math.abs(projectKey.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)) % 360) + ' 60% 50%)',
    });
  };

  return (
    <div style={{ padding: 8 }}>
      {projects.map((p) => (
        <div key={p.key} style={{ marginBottom: 4 }}>
          <button
            onClick={() => onToggle(p.key, p.decodedPath)}
            style={{
              width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: 6,
              fontSize: 12, color: 'var(--color-text-primary)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {expanded[p.key] ? '▾ ' : '▸ '}{p.decodedPath.split('/').pop()}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{p.sessionCount}</span>
          </button>
          {expanded[p.key] && (
            <div style={{ paddingLeft: 16 }}>
              {sessionsState[p.key] === 'loading' && <div style={{ fontSize: 11, padding: 6, color: 'var(--color-text-tertiary)' }}>loading…</div>}
              {(sessionsByKey[p.key] ?? []).map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => onResume(p.key, p.decodedPath, s.sessionId, s.preview)}
                  style={{
                    display: 'block', width: '100%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: 6,
                    fontSize: 11, color: 'var(--color-text-secondary)',
                    textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {s.preview || '(empty session)'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev:electron
```

Open panel → Sessions tab. Expand a project, click a session — it should be added to the rail and become active. Resume should work end-to-end.

- [ ] **Step 3: Commit**

```bash
git add src/components/operator/OperatorPanel.tsx
git commit -m "feat(view/sessions): collapsible project tree, click-to-resume

Reuses existing claudeSessionsStore (project scan + session list IPC).
Click a session row → adds to rail via sessionStore.addClaude (which
dedupes on sessionId so resume is idempotent)."
```

---

### Task 22: Plugins tab + IPC

**Files:**
- Create: `electron/ipc/plugins.ts` (new IPC: read `~/.claude/plugins/installed_plugins.json` + marketplaces)
- Modify: `electron/preload.ts` + `types/electron.d.ts` (expose `plugins:list`)
- Modify: `electron/main.ts` (call `setupPluginsIPC()` in whenReady)
- Modify: `src/components/operator/OperatorPanel.tsx` (replace `PluginsTab`)

- [ ] **Step 1: Create the IPC handler**

Create `electron/ipc/plugins.ts`:

```ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface PluginInstall {
  name: string;          // e.g. "code-review@claude-plugins-official"
  marketplace: string;   // "claude-plugins-official"
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
      const marketplace = name.includes('@') ? name.split('@').slice(1).join('@') : '(unknown)';
      for (const inst of installs) {
        result.push({
          name,
          marketplace,
          scope: inst.scope,
          version: inst.version,
          installedAt: inst.installedAt,
          lastUpdated: inst.lastUpdated,
          installPath: inst.installPath,
        });
      }
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
```

- [ ] **Step 2: Wire IPC in preload + main**

In `electron/main.ts`:

```ts
import { setupPluginsIPC } from './ipc/plugins';

// In whenReady, alongside other setup* calls:
setupPluginsIPC();
```

In `electron/preload.ts`, add to the exposed `electronAPI` object:

```ts
plugins: {
  list: () => ipcRenderer.invoke('plugins:list'),
},
```

In `types/electron.d.ts`, extend the `electronAPI` interface:

```ts
interface ElectronAPI {
  // ... existing fields ...
  plugins: {
    list: () => Promise<{
      plugins: Array<{
        name: string;
        marketplace: string;
        scope: 'user' | 'project';
        version: string;
        installedAt: string;
        lastUpdated: string;
        installPath: string;
      }>;
      marketplaces: string[];
    }>;
  };
}
```

- [ ] **Step 3: Build the PluginsTab**

In `src/components/operator/OperatorPanel.tsx`, replace `PluginsTab`:

```tsx
function PluginsTab() {
  const [data, setData] = useState<{ plugins: Array<{ name: string; marketplace: string; scope: string; version: string; installedAt: string; lastUpdated: string; installPath: string }>; marketplaces: string[] } | null>(null);

  useEffect(() => {
    void (window.electronAPI as unknown as { plugins: { list: () => Promise<typeof data> } }).plugins.list().then(setData);
  }, []);

  if (!data) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  if (data.plugins.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>No plugins installed.</div>;
  }

  // Group by marketplace
  const byMarket: Record<string, typeof data.plugins> = {};
  for (const p of data.plugins) {
    (byMarket[p.marketplace] ??= []).push(p);
  }

  return (
    <div style={{ padding: 12 }}>
      {Object.entries(byMarket).map(([market, plugins]) => (
        <div key={market} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 6, letterSpacing: 0.5 }}>
            {market}
          </div>
          {plugins.map((p) => {
            const shortName = p.name.split('@')[0];
            return (
              <div
                key={p.name + ':' + p.installPath}
                style={{
                  padding: '8px 10px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 6, marginBottom: 4,
                  border: '0.5px solid var(--color-border-primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{shortName}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>v{p.version}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {p.scope} · installed {new Date(p.installedAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build + smoke test**

```bash
npm run build && npm run dev:electron
```

Open panel → Plugins tab. Should list your installed plugins grouped by marketplace.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/plugins.ts electron/main.ts electron/preload.ts types/electron.d.ts src/components/operator/OperatorPanel.tsx
git commit -m "feat(view/plugins): list installed plugins grouped by marketplace

New IPC plugins:list reads ~/.claude/plugins/installed_plugins.json +
marketplaces/. View groups by marketplace, shows version + scope +
install date per plugin."
```

---

### Task 23: Skills + Commands tabs + IPC (combined)

**Files:**
- Create: `electron/ipc/skills.ts` (three-layer SKILL.md walker)
- Create: `electron/ipc/commands.ts` (three-layer command .md walker)
- Modify: `electron/preload.ts`, `types/electron.d.ts`, `electron/main.ts`
- Modify: `src/components/operator/OperatorPanel.tsx` (replace `SkillsTab` and `CommandsTab`)

These two views are similar enough to do together: both walk three layers (user / project / plugin), both render a list with source badges + a click-to-preview detail pane.

- [ ] **Step 1: Create skills IPC**

Create `electron/ipc/skills.ts`:

```ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SkillEntry {
  name: string;          // skill slug (folder name)
  description: string;   // pulled from SKILL.md frontmatter `description:` line
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;   // when source === 'plugin'
  skillMdPath: string;   // absolute
}

const FRONTMATTER_DESC = /^description:\s*(.+)$/m;

function parseSkillMd(p: string): { description: string } {
  try {
    const head = fs.readFileSync(p, 'utf8').slice(0, 2000);
    const m = FRONTMATTER_DESC.exec(head);
    return { description: m ? m[1].trim().replace(/^["']|["']$/g, '') : '' };
  } catch {
    return { description: '' };
  }
}

function walkSkillsDir(dir: string, source: SkillEntry['source'], pluginName?: string): SkillEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: SkillEntry[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    const skillDir = path.join(dir, name);
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const { description } = parseSkillMd(skillMd);
    out.push({ name, description, source, pluginName, skillMdPath: skillMd });
  }
  return out;
}

function readUserSkills(): SkillEntry[] {
  return walkSkillsDir(path.join(os.homedir(), '.claude', 'skills'), 'user');
}

function readProjectSkills(projectDir: string): SkillEntry[] {
  return walkSkillsDir(path.join(projectDir, '.claude', 'skills'), 'project');
}

function readPluginSkills(): SkillEntry[] {
  // Each plugin install path may have a skills/ subdirectory.
  const installedFile = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(installedFile)) return [];
  let data: { plugins: Record<string, Array<{ installPath: string }>> };
  try {
    data = JSON.parse(fs.readFileSync(installedFile, 'utf8'));
  } catch {
    return [];
  }
  const out: SkillEntry[] = [];
  for (const [name, installs] of Object.entries(data.plugins ?? {})) {
    for (const inst of installs) {
      out.push(...walkSkillsDir(path.join(inst.installPath, 'skills'), 'plugin', name.split('@')[0]));
    }
  }
  return out;
}

export function setupSkillsIPC(): void {
  ipcMain.handle('skills:list', (_e, projectDir?: string) => {
    return [
      ...readUserSkills(),
      ...(projectDir ? readProjectSkills(projectDir) : []),
      ...readPluginSkills(),
    ];
  });
  ipcMain.handle('skills:read', (_e, skillMdPath: string) => {
    try {
      return fs.readFileSync(skillMdPath, 'utf8');
    } catch {
      return '';
    }
  });
}
```

- [ ] **Step 2: Create commands IPC**

Create `electron/ipc/commands.ts`:

```ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CommandEntry {
  name: string;          // command slug = filename without .md
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  description: string;   // first non-empty line of the .md (or frontmatter description)
  filePath: string;
}

function descriptionFromMd(p: string): string {
  try {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    // Skip frontmatter
    let i = 0;
    if (lines[0]?.trim() === '---') {
      i = 1;
      while (i < lines.length && lines[i].trim() !== '---') {
        const m = /^description:\s*(.+)$/.exec(lines[i]);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
        i++;
      }
      i++; // skip closing ---
    }
    while (i < lines.length && !lines[i].trim()) i++;
    return (lines[i] ?? '').trim().slice(0, 120);
  } catch {
    return '';
  }
}

function walkCommandsDir(dir: string, source: CommandEntry['source'], pluginName?: string): CommandEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: CommandEntry[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const filePath = path.join(dir, ent.name);
    out.push({
      name: ent.name.slice(0, -3),
      source,
      pluginName,
      description: descriptionFromMd(filePath),
      filePath,
    });
  }
  return out;
}

export function setupCommandsIPC(): void {
  ipcMain.handle('commands:list', (_e, projectDir?: string) => {
    const user = walkCommandsDir(path.join(os.homedir(), '.claude', 'commands'), 'user');
    const project = projectDir ? walkCommandsDir(path.join(projectDir, '.claude', 'commands'), 'project') : [];

    // Plugins
    const installedFile = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    let plugins: CommandEntry[] = [];
    if (fs.existsSync(installedFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(installedFile, 'utf8')) as { plugins: Record<string, Array<{ installPath: string }>> };
        for (const [name, installs] of Object.entries(data.plugins ?? {})) {
          for (const inst of installs) {
            plugins.push(...walkCommandsDir(path.join(inst.installPath, 'commands'), 'plugin', name.split('@')[0]));
          }
        }
      } catch { /* ignore */ }
    }

    return [...user, ...project, ...plugins];
  });
  ipcMain.handle('commands:read', (_e, filePath: string) => {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
  });
}
```

- [ ] **Step 3: Wire both IPCs (main, preload, types)**

In `electron/main.ts`:

```ts
import { setupSkillsIPC } from './ipc/skills';
import { setupCommandsIPC } from './ipc/commands';

// In whenReady:
setupSkillsIPC();
setupCommandsIPC();
```

In `electron/preload.ts`, add:

```ts
skills: {
  list: (projectDir?: string) => ipcRenderer.invoke('skills:list', projectDir),
  read: (skillMdPath: string) => ipcRenderer.invoke('skills:read', skillMdPath),
},
commands: {
  list: (projectDir?: string) => ipcRenderer.invoke('commands:list', projectDir),
  read: (filePath: string) => ipcRenderer.invoke('commands:read', filePath),
},
```

In `types/electron.d.ts`, extend `ElectronAPI`:

```ts
skills: {
  list: (projectDir?: string) => Promise<Array<{
    name: string; description: string;
    source: 'user' | 'project' | 'plugin';
    pluginName?: string; skillMdPath: string;
  }>>;
  read: (skillMdPath: string) => Promise<string>;
};
commands: {
  list: (projectDir?: string) => Promise<Array<{
    name: string; description: string;
    source: 'user' | 'project' | 'plugin';
    pluginName?: string; filePath: string;
  }>>;
  read: (filePath: string) => Promise<string>;
};
```

- [ ] **Step 4: Build SkillsTab**

In `OperatorPanel.tsx`, replace `SkillsTab`:

```tsx
function SkillsTab() {
  const activeSession = useSessionStore((s) => s.sessions.find((x) => x.id === s.activeSessionId) ?? null);
  const projectDir = activeSession?.projectDir;
  const [list, setList] = useState<Array<{ name: string; description: string; source: 'user' | 'project' | 'plugin'; pluginName?: string; skillMdPath: string }> | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void (window.electronAPI as unknown as { skills: { list: (p?: string) => Promise<typeof list> } }).skills.list(projectDir).then(setList);
  }, [projectDir]);

  if (!list) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  const filtered = filter ? list.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase())) : list;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter skills…"
        style={{
          margin: 8, padding: '6px 10px', fontSize: 12,
          borderRadius: 6, border: '0.5px solid var(--color-border-primary)',
          background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {filtered.map((sk) => (
          <div
            key={sk.skillMdPath}
            style={{
              padding: '8px 10px',
              borderRadius: 6, marginBottom: 4,
              background: 'var(--color-bg-secondary)',
              border: '0.5px solid var(--color-border-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{sk.name}</span>
              <SourceBadge source={sk.source} pluginName={sk.pluginName} />
            </div>
            {sk.description && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
                {sk.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceBadge({ source, pluginName }: { source: 'user' | 'project' | 'plugin'; pluginName?: string }) {
  const color = source === 'user' ? '#7d83ff' : source === 'project' ? '#5cc28b' : '#cc785c';
  const label = source === 'plugin' && pluginName ? `plugin:${pluginName}` : source;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600,
      background: color, color: 'white',
      padding: '1px 6px', borderRadius: 4,
      textTransform: 'uppercase', letterSpacing: 0.3,
    }}>{label}</span>
  );
}
```

- [ ] **Step 5: Build CommandsTab**

In `OperatorPanel.tsx`, replace `CommandsTab` (similar shape, just different fields):

```tsx
function CommandsTab() {
  const activeSession = useSessionStore((s) => s.sessions.find((x) => x.id === s.activeSessionId) ?? null);
  const projectDir = activeSession?.projectDir;
  const [list, setList] = useState<Array<{ name: string; description: string; source: 'user' | 'project' | 'plugin'; pluginName?: string; filePath: string }> | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void (window.electronAPI as unknown as { commands: { list: (p?: string) => Promise<typeof list> } }).commands.list(projectDir).then(setList);
  }, [projectDir]);

  if (!list) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  const filtered = filter ? list.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) || c.description.toLowerCase().includes(filter.toLowerCase())) : list;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter commands…"
        style={{
          margin: 8, padding: '6px 10px', fontSize: 12,
          borderRadius: 6, border: '0.5px solid var(--color-border-primary)',
          background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {filtered.map((c) => (
          <div
            key={c.filePath}
            style={{
              padding: '8px 10px',
              borderRadius: 6, marginBottom: 4,
              background: 'var(--color-bg-secondary)',
              border: '0.5px solid var(--color-border-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>/{c.name}</span>
              <SourceBadge source={c.source} pluginName={c.pluginName} />
            </div>
            {c.description && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
                {c.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Smoke test**

```bash
npm run build && npm run dev:electron
```

Open panel → Skills tab. Should list all skills you have (user / plugin), with colored source badges. Filter input narrows results. Switch to Commands tab — same UI, lists all `/commands`.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/skills.ts electron/ipc/commands.ts electron/main.ts electron/preload.ts types/electron.d.ts src/components/operator/OperatorPanel.tsx
git commit -m "feat(view/skills+commands): three-layer browsers with source badges

Skills: walks ~/.claude/skills, <activeProject>/.claude/skills, and each
installed plugin's skills/. Reads SKILL.md frontmatter for description.
Commands: identical pattern for *.md under commands/ dirs. Both tabs
have a filter input. Source badges color-coded user/project/plugin."
```

---

### Task 24: Stats tab + IPC (incremental cache)

**Files:**
- Create: `electron/ipc/stats.ts` (reads stats-cache.json + maintains usage-cache.json)
- Modify: preload + types + main
- Modify: `OperatorPanel.tsx` (replace `StatsTab`)

This task implements the strategy from spec §7 — read Claude's own `stats-cache.json` for daily activity (free); maintain our own `~/.claudebar/usage-cache.json` with byte-offset incremental token totals from session jsonls.

- [ ] **Step 1: Create the stats IPC + cache module**

Create `electron/ipc/stats.ts`:

```ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOME = os.homedir();
const STATS_CACHE = path.join(HOME, '.claude', 'stats-cache.json');
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const OUR_CACHE = path.join(HOME, '.claudebar', 'usage-cache.json');

interface DailyActivity { date: string; messageCount: number; sessionCount: number; toolCallCount: number; }
interface ClaudeStatsCache { version: number; lastComputedDate: string; dailyActivity: DailyActivity[]; }

interface PerFileEntry {
  lastByteOffset: number;
  tokens: { input: number; output: number; cache_creation: number; cache_read: number };
  byModel: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
}
interface OurUsageCache {
  version: 1;
  perFile: Record<string, PerFileEntry>;
  byDay: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
}

function emptyCache(): OurUsageCache {
  return { version: 1, perFile: {}, byDay: {} };
}

function readOurCache(): OurUsageCache {
  if (!fs.existsSync(OUR_CACHE)) return emptyCache();
  try {
    const data = JSON.parse(fs.readFileSync(OUR_CACHE, 'utf8'));
    if (data?.version !== 1) return emptyCache();
    return data;
  } catch { return emptyCache(); }
}

function writeOurCache(cache: OurUsageCache): void {
  fs.mkdirSync(path.dirname(OUR_CACHE), { recursive: true });
  fs.writeFileSync(OUR_CACHE, JSON.stringify(cache));
}

interface JsonlMessage {
  type?: string;
  timestamp?: string;
  message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
}

function parseAndAccumulate(filePath: string, fromOffset: number, entry: PerFileEntry, byDay: OurUsageCache['byDay']): number {
  const stat = fs.statSync(filePath);
  if (stat.size <= fromOffset) return fromOffset;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - fromOffset);
    fs.readSync(fd, buf, 0, buf.length, fromOffset);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    let consumed = 0;
    // Process all complete lines (last line may be partial — leave for next pass)
    for (let i = 0; i < lines.length - 1; i++) {
      consumed += lines[i].length + 1; // +1 for the \n
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonlMessage;
        const u = msg.message?.usage;
        if (!u) continue;
        const model = msg.message?.model ?? 'unknown';
        const date = (msg.timestamp ?? '').slice(0, 10);
        const inp = u.input_tokens ?? 0;
        const out = u.output_tokens ?? 0;
        const cw = u.cache_creation_input_tokens ?? 0;
        const cr = u.cache_read_input_tokens ?? 0;
        entry.tokens.input += inp;
        entry.tokens.output += out;
        entry.tokens.cache_creation += cw;
        entry.tokens.cache_read += cr;
        const m = entry.byModel[model] ??= { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
        m.input += inp; m.output += out; m.cache_creation += cw; m.cache_read += cr;
        if (date) {
          const d = byDay[date] ??= { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
          d.input += inp; d.output += out; d.cache_creation += cw; d.cache_read += cr;
        }
      } catch { /* malformed line — skip */ }
    }
    return fromOffset + consumed;
  } finally {
    fs.closeSync(fd);
  }
}

function refreshCache(): OurUsageCache {
  const cache = readOurCache();
  if (!fs.existsSync(PROJECTS_DIR)) return cache;
  let projects: string[];
  try { projects = fs.readdirSync(PROJECTS_DIR); } catch { return cache; }

  for (const projectKey of projects) {
    const dir = path.join(PROJECTS_DIR, projectKey);
    let files: string[];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const fname of files) {
      if (!fname.endsWith('.jsonl')) continue;
      const fp = path.join(dir, fname);
      const key = `${projectKey}/${fname}`;
      const entry = cache.perFile[key] ??= {
        lastByteOffset: 0,
        tokens: { input: 0, output: 0, cache_creation: 0, cache_read: 0 },
        byModel: {},
      };
      try {
        entry.lastByteOffset = parseAndAccumulate(fp, entry.lastByteOffset, entry, cache.byDay);
      } catch { /* ignore unreadable file */ }
    }
  }
  writeOurCache(cache);
  return cache;
}

function readClaudeDailyActivity(): DailyActivity[] {
  if (!fs.existsSync(STATS_CACHE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(STATS_CACHE, 'utf8')) as ClaudeStatsCache;
    return data.dailyActivity ?? [];
  } catch { return []; }
}

export function setupStatsIPC(): void {
  ipcMain.handle('stats:get', () => {
    const cache = refreshCache();
    const dailyActivity = readClaudeDailyActivity();
    return {
      dailyActivity,
      tokensByDay: cache.byDay,
      totals: Object.values(cache.perFile).reduce(
        (acc, f) => ({
          input: acc.input + f.tokens.input,
          output: acc.output + f.tokens.output,
          cache_creation: acc.cache_creation + f.tokens.cache_creation,
          cache_read: acc.cache_read + f.tokens.cache_read,
        }),
        { input: 0, output: 0, cache_creation: 0, cache_read: 0 },
      ),
      byModel: Object.values(cache.perFile).reduce((acc, f) => {
        for (const [model, m] of Object.entries(f.byModel)) {
          const target = acc[model] ??= { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
          target.input += m.input; target.output += m.output;
          target.cache_creation += m.cache_creation; target.cache_read += m.cache_read;
        }
        return acc;
      }, {} as Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>),
    };
  });
  ipcMain.handle('stats:today', () => {
    const cache = refreshCache();
    const today = new Date().toISOString().slice(0, 10);
    return cache.byDay[today] ?? { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  });
}
```

- [ ] **Step 2: Wire IPC (main, preload, types)**

In `electron/main.ts`:

```ts
import { setupStatsIPC } from './ipc/stats';

// In whenReady:
setupStatsIPC();
```

In `electron/preload.ts`:

```ts
stats: {
  get: () => ipcRenderer.invoke('stats:get'),
  today: () => ipcRenderer.invoke('stats:today'),
},
```

In `types/electron.d.ts`:

```ts
stats: {
  get: () => Promise<{
    dailyActivity: Array<{ date: string; messageCount: number; sessionCount: number; toolCallCount: number }>;
    tokensByDay: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
    totals: { input: number; output: number; cache_creation: number; cache_read: number };
    byModel: Record<string, { input: number; output: number; cache_creation: number; cache_read: number }>;
  }>;
  today: () => Promise<{ input: number; output: number; cache_creation: number; cache_read: number }>;
};
```

- [ ] **Step 3: Build the StatsTab**

In `OperatorPanel.tsx`, replace `StatsTab`:

```tsx
function StatsTab() {
  type StatsPayload = Awaited<ReturnType<NonNullable<(typeof window.electronAPI)['stats']>['get']>>;
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    void (window.electronAPI as unknown as { stats: { get: () => Promise<StatsPayload> } }).stats.get().then(setData);
  }, []);

  if (!data) return <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>;

  // Last 14 days from byDay (chronological)
  const days: Array<{ date: string; input: number; output: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = data.tokensByDay[key] ?? { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
    days.push({ date: key.slice(5), input: v.input + v.cache_read, output: v.output });
  }
  const maxVal = Math.max(1, ...days.map((d) => d.input + d.output));

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="All-time totals">
        <Row label="Input" value={data.totals.input.toLocaleString()} />
        <Row label="Output" value={data.totals.output.toLocaleString()} />
        <Row label="Cache write" value={data.totals.cache_creation.toLocaleString()} />
        <Row label="Cache read" value={data.totals.cache_read.toLocaleString()} />
      </Card>

      <Card title="Last 14 days">
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 80, gap: 2 }}>
          {days.map((d) => {
            const total = d.input + d.output;
            const h = (total / maxVal) * 100;
            return (
              <div key={d.date} title={`${d.date}: ${total.toLocaleString()}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                <div style={{ width: '70%', height: `${h}%`, background: 'var(--color-accent)', borderRadius: '2px 2px 0 0', minHeight: total > 0 ? 1 : 0 }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          <span>{days[0].date}</span>
          <span>{days[days.length - 1].date}</span>
        </div>
      </Card>

      <Card title="By model">
        {Object.entries(data.byModel).length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>(no usage)</div>
        )}
        {Object.entries(data.byModel).map(([model, m]) => (
          <Row key={model} label={model.length > 30 ? model.slice(0, 30) + '…' : model} value={(m.input + m.output).toLocaleString()} />
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run build && npm run dev:electron
```

Open panel → Stats. First time: parses all your jsonls (may take a few seconds on a large `~/.claude/projects/`). Shows totals + 14-day bar chart + by-model breakdown. Reopen the panel — instant (cache hit). Use a Claude session, then reopen Stats — new tokens reflected (incremental scan picks up the new bytes).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/stats.ts electron/main.ts electron/preload.ts types/electron.d.ts src/components/operator/OperatorPanel.tsx
git commit -m "feat(view/stats): incremental token cache + 14-day bar chart

stats:get reads ~/.claude/stats-cache.json (daily activity, free) and
maintains ~/.claudebar/usage-cache.json with per-file lastByteOffset
incremental token aggregation. Strategy from spec §7. View shows
all-time totals, 14-day bar chart of input+output, and by-model
breakdown."
```

---

### Task 25: Settings tab — full content

**Files:**
- Modify: `OperatorPanel.tsx` (replace `SettingsTab` body)

Per spec §6, Settings groups: Claude CLI, Window, Diagnostics. Each setting is a simple form control bound to `useSettingsStore.updateSetting`.

- [ ] **Step 1: Build the SettingsTab**

In `OperatorPanel.tsx`, replace `SettingsTab`:

```tsx
import { useSettingsStore } from '../../stores/settingsStore';

function SettingsTab() {
  const settings = useSettingsStore((s) => s as unknown as Record<string, unknown>);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const get = <T,>(k: string, fallback: T): T => (settings[k] as T) ?? fallback;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card title="Claude CLI">
        <SettingRow label="Path">
          <input
            value={get<string>('claudePath', '')}
            onChange={(e) => updateSetting('claudePath', e.target.value)}
            placeholder="(autodetected)"
            style={inputStyle}
          />
        </SettingRow>
        <SettingRow label="Default model">
          <select
            value={get<string>('defaultModel', 'default')}
            onChange={(e) => updateSetting('defaultModel', e.target.value)}
            style={inputStyle}
          >
            <option value="default">(use CLI default)</option>
            <option value="opus">opus</option>
            <option value="sonnet">sonnet</option>
            <option value="haiku">haiku</option>
          </select>
        </SettingRow>
        <SettingRow label="Default permission">
          <select
            value={get<string>('defaultPermissionMode', 'default')}
            onChange={(e) => updateSetting('defaultPermissionMode', e.target.value)}
            style={inputStyle}
          >
            <option value="default">default (ask each tool)</option>
            <option value="acceptEdits">acceptEdits</option>
            <option value="bypassPermissions">bypassPermissions (NO callbacks)</option>
          </select>
        </SettingRow>
        <SettingRow label="Idle close (min)">
          <input
            type="number"
            value={get<number>('idleCloseMinutes', 30)}
            onChange={(e) => updateSetting('idleCloseMinutes', Number(e.target.value) || 30)}
            min={1}
            style={inputStyle}
          />
        </SettingRow>
      </Card>

      <Card title="Window">
        <SettingRow label="Theme">
          <select
            value={get<string>('theme', 'system')}
            onChange={(e) => updateSetting('theme', e.target.value)}
            style={inputStyle}
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </SettingRow>
        <SettingRow label="Always on top">
          <input
            type="checkbox"
            checked={get<boolean>('alwaysOnTop', false)}
            onChange={(e) => updateSetting('alwaysOnTop', e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Hide on click outside">
          <input
            type="checkbox"
            checked={get<boolean>('hideOnClickOutside', false)}
            onChange={(e) => updateSetting('hideOnClickOutside', e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Global shortcut">
          <input
            value={get<string>('globalShortcut', '')}
            onChange={(e) => updateSetting('globalShortcut', e.target.value)}
            placeholder="Cmd+Shift+C"
            style={inputStyle}
          />
        </SettingRow>
        <SettingRow label="Show pet">
          <input
            type="checkbox"
            checked={get<boolean>('petVisible', true)}
            onChange={(e) => updateSetting('petVisible', e.target.checked)}
          />
        </SettingRow>
        <SettingRow label="Pet kind">
          <select
            value={get<string>('petKind', 'claude')}
            onChange={(e) => updateSetting('petKind', e.target.value)}
            style={inputStyle}
          >
            <option value="claude">claude</option>
            <option value="lobster">lobster</option>
          </select>
        </SettingRow>
      </Card>

      <Card title="Diagnostics">
        <SettingRow label="SDK trace">
          <input
            type="checkbox"
            checked={get<boolean>('enableSdkTrace', false)}
            onChange={(e) => updateSetting('enableSdkTrace', e.target.checked)}
          />
        </SettingRow>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Logs to <code>~/.claudebar/sdk-trace.jsonl</code>. Auth diagnostics: <code>~/.claudebar/auth-debug.log</code>.
        </div>
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  borderRadius: 4,
  border: '0.5px solid var(--color-border-primary)',
  background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)',
  outline: 'none',
};

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ flexShrink: 0 }}>{children}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify the SDK trace toggle takes effect**

In `electron/claude-bridge.ts` find where `traceEnabled` is set (it currently reads `process.env.CLAUDEBAR_TRACE`). Augment it to also honor the live setting:

```ts
import { getSettings } from './ipc/settings';
// ...
const traceEnabled = !!(getSettings() as { enableSdkTrace?: boolean }).enableSdkTrace
  || process.env.CLAUDEBAR_TRACE === '1';
```

(Move `traceEnabled` evaluation inside `runSession` if it was at module top level — re-evaluate per session so toggling the setting takes effect for new sessions.)

- [ ] **Step 3: Smoke test**

```bash
npm run dev:electron
```

Open panel → Settings. All controls render. Toggle theme — chat re-renders in new theme immediately. Change `defaultModel` — write down the value, close, reopen — value persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/operator/OperatorPanel.tsx electron/claude-bridge.ts
git commit -m "feat(view/settings): full Settings form per spec §6

Three groups: Claude CLI (path/model/permission/idle), Window (theme/
on-top/hide/shortcut/pet), Diagnostics (SDK trace toggle, log paths
shown). enableSdkTrace setting honored at SDK Query construction time
in addition to CLAUDEBAR_TRACE env."
```

---

### Task 26: Use ClaudePet hash for session icons + tray icon

**Files:**
- Modify: `src/components/SessionRail.tsx` (replace letter with ClaudePet variant SVG)
- Modify: `electron/main.ts` (use ClaudePet bitmap for tray icon)
- Possibly create: `resources/tray-icons/` (a few PNG renders of the pet at 16/32px for tray)

The rail currently shows a letter for each session. Spec says "ClaudePet variant hashed from project + session id". Pull the existing variant logic from ClawBar's `claude-icon.ts` + `ClaudePet.tsx` and adapt.

- [ ] **Step 1: Inspect existing pet hash util**

```bash
ls src/utils/claude-icon.ts src/pet/ClaudePet.tsx 2>&1
cat src/utils/claude-icon.ts | head -50
```

The `claudePetVariant(key)` function returns body / shadow / hand / leg / eye colors keyed by an arbitrary string. We feed it `<projectKey>:<sessionId>`.

- [ ] **Step 2: Create a SessionIcon component**

Create `src/components/SessionIcon.tsx`:

```tsx
import { claudePetVariant } from '../utils/claude-icon';

interface Props { projectKey: string; sessionId: string; size?: number; }

export function SessionIcon({ projectKey, sessionId, size = 22 }: Props) {
  const v = claudePetVariant(`${projectKey}:${sessionId}`);
  // Compact pet portrait — body + 2 hands + 4 legs + eyes (NO mouth so it's
  // legible at small sizes). Use 120-unit viewBox to match existing
  // ClaudePet's coordinates so the variant function's color choices
  // continue to make sense.
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" shapeRendering="crispEdges">
      <rect x="28" y="38" width="64" height="46" fill={v.bodyColor} />
      <rect x="20" y="56" width="10" height="10" fill={v.handColor} />
      <rect x="90" y="56" width="10" height="10" fill={v.handColor} />
      <rect x="34" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="48" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="63" y="84" width="9" height="14" fill={v.legColor} />
      <rect x="77" y="84" width="9" height="14" fill={v.legColor} />
      {/* Eyes — variant-controlled style */}
      <rect x="44" y="52" width="6" height="6" fill={v.eyeColor} />
      <rect x="70" y="52" width="6" height="6" fill={v.eyeColor} />
    </svg>
  );
}
```

- [ ] **Step 3: Use SessionIcon in SessionRail**

In `src/components/SessionRail.tsx`, replace the `{session.iconLetter || '?'}` content of `SessionRailIcon` with:

```tsx
import { SessionIcon } from './SessionIcon';
// ...
// In the SessionRailIcon button content, replace the letter span with:
<SessionIcon projectKey={session.projectKey} sessionId={session.sessionId} size={22} />
```

- [ ] **Step 4: Tray icon**

ClawBar's tray icon is currently `resources/icon.png` (the lobster). We need a Claude-flavored tray icon.

Create `resources/tray-icon-claude.png` — a 16×16 (and ideally 32×32 retina) PNG of the ClaudePet portrait. Easiest: render the SessionIcon to PNG via a one-off script, or hand-draw in any pixel editor.

For the plan, we'll generate it programmatically with sharp inside `scripts/`:

Create `scripts/build-tray-icon.mjs`:

```js
// Generates resources/tray-icon-claude.png at 16x16 + 32x32 from the same
// pixel pet shapes used in SessionIcon.tsx. Run once; the PNG is checked in.
import { writeFileSync } from 'fs';
import sharp from 'sharp';

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" shape-rendering="crispEdges">
  <rect x="28" y="38" width="64" height="46" fill="#cc785c"/>
  <rect x="20" y="56" width="10" height="10" fill="#cc785c"/>
  <rect x="90" y="56" width="10" height="10" fill="#cc785c"/>
  <rect x="34" y="84" width="9" height="14" fill="#cc785c"/>
  <rect x="48" y="84" width="9" height="14" fill="#cc785c"/>
  <rect x="63" y="84" width="9" height="14" fill="#cc785c"/>
  <rect x="77" y="84" width="9" height="14" fill="#cc785c"/>
  <rect x="44" y="52" width="6" height="6" fill="#000"/>
  <rect x="70" y="52" width="6" height="6" fill="#000"/>
</svg>
`;

await sharp(Buffer.from(SVG)).resize(32, 32, { kernel: 'nearest' }).png().toFile('resources/tray-icon-claude.png');
console.log('wrote resources/tray-icon-claude.png');
```

Run:

```bash
npm install --save-dev sharp
node scripts/build-tray-icon.mjs
```

- [ ] **Step 5: Use in main.ts**

In `electron/main.ts`, find where the tray icon is loaded:

```bash
grep -n "nativeImage\|tray\|.png" electron/main.ts | head
```

Replace the tray icon path:

```ts
const trayIconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon-claude.png');
const trayImage = nativeImage.createFromPath(trayIconPath);
trayImage.setTemplateImage(true);  // macOS adapts to dark/light menu bar
tray = new Tray(trayImage);
```

- [ ] **Step 6: Build + verify**

```bash
npm run build && npm run dev:electron
```

Tray icon should now be the orange Claude pet (template image: it'll render as monochrome on macOS, adapting to menu bar background). Each session in the rail shows its unique-colored pet portrait.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionIcon.tsx src/components/SessionRail.tsx scripts/build-tray-icon.mjs resources/tray-icon-claude.png electron/main.ts package.json package-lock.json
git commit -m "feat(visual): ClaudePet variant hash for session icons + tray

Each session renders a tiny pet portrait keyed by projectKey:sessionId
via the existing claudePetVariant util. Tray icon swapped from lobster
to a 32×32 monochrome Claude pet (template image so macOS adapts it).

Backlog risk from spec §13: at 16×16 the silhouette is borderline; if
unreadable on user feedback, fall back to a 12-ray sunburst (existing
ClaudeMark)."
```

---

### Task 27: Verify Phase 3 ships, tag v0.7.0 (first feature-complete release)

**Files:** none (release prep)

- [ ] **Step 1: Full clean build**

```bash
npm run clean
npm run build
```

- [ ] **Step 2: DMG smoke test against spec §14 success criteria**

```bash
npm run pack:mac:dmg:arm64
```

Install fresh from DMG (uninstall any prior version first, including ClawBar if you want to validate the migration). Then verify each spec §14 criterion:

- [ ] Cold launch from Finder → window visible in <2 s, with hydrated session rail
- [ ] Click any session in rail → resume works for both real and placeholder UUIDs
- [ ] New session → send markdown message → response streams back with code highlighting
- [ ] Operator panel slides out smoothly, all 7 tabs load <500 ms (Stats may be slower on first scan, OK)
- [ ] Migration from ClawBar on first launch is silent and non-destructive (`~/.clawbar/` left intact, `~/.claudebar/.migrated-from-clawbar` flag exists)
- [ ] DMG launch from Finder works without "Not logged in" (shell-env hydration still works)
- [ ] Tray click toggles, global shortcut toggles
- [ ] `Cmd+Shift+C` (or whatever `globalShortcut` was set to) toggles
- [ ] Settings changes persist across restart

- [ ] **Step 3: Update README + docs/index.html for v0.7.0**

The CI bot bumps download links automatically after tag push (existing workflow inherited from ClawBar). After tag push, `git pull` to merge the bot's commit. (See `ci-bot-bumps-docs-after-tag` memory.)

But the README content itself still describes ClawBar — overhaul it for ClaudeBar. Replace the README's first section with ClaudeBar positioning (use spec §1 as basis). Update screenshots if you have them. Update `docs/index.html` (the project landing page) with ClaudeBar copy.

This is a meaningful chunk of work — split into a separate commit:

```bash
# After README rewrite + index.html rewrite:
git add README.md docs/index.html
git commit -m "docs: rewrite README + landing page for ClaudeBar v0.7.0"
```

- [ ] **Step 4: Tag + push**

```bash
git tag v0.7.0
git push origin main
git push origin v0.7.0
```

- [ ] **Step 5: GitHub release**

`gh release create v0.7.0` (or wait for CI to publish — depending on whether the release workflow is wired).

Add release notes summarizing the three phases:

> ClaudeBar v0.7.0 — first feature-complete release. Forked from ClawBar v0.4.8. Floating-window Claude Code app: slim session rail, slide-out operator panel with Overview/Sessions/Plugins/Skills/Commands/Stats/Settings, markdown chat with syntax-highlighted code blocks, multi-line input. Drives your installed `claude` binary (BYO-CLI). Migrates theme/petKind from ClawBar on first launch.

---

## Backlog (deferred per spec §11)

Tracked here for visibility; create as GitHub issues in the new claudebar repo after v0.7.0:

- **Chat polish v1.1**: message hover actions (copy single message / reroll the last user turn), file drag & drop, image paste
- **Dropped views v1.1**: Plans browser (`~/.claude/plans/`), Hooks viewer (`~/.claude/settings.json` hooks), Cron-like "schedule a prompt"
- **Window mode v1.2**: popover ↔ float dual-mode toggle in Settings
- **Stats v1.2**: estimated cost (apply per-model pricing to the token totals), live "burning now" counter from in-flight SDK Query result events (the C of B+C from spec §7)
- **Tray icon contingency**: if 16×16 ClaudePet silhouette tests poorly, swap to 12-ray sunburst (ClaudeMark)
- **Plugin watcher v1.2**: file watcher on `~/.claude/plugins/` so the Plugins view auto-refreshes when user installs/uninstalls plugins via CLI

---

## Self-Review notes

**Spec coverage:** every section of `2026-05-12-claudebar-fork-design.md` has at least one task. §1 product positioning lives in README rewrite (Task 27 step 3). §2 repo structure = Task 1. §3 window form factor = Task 11. §4 UI layout = Tasks 13, 19. §5 views = Tasks 19-26. §6 settings = Task 25. §7 stats caching = Task 24. §8 chat baseline = Tasks 15, 16. §9 kept/removed/rewritten = covered transitively across all tasks. §10 branding = Tasks 2 (bundle id), 26 (tray icon, pet default). §11 backlog = explicit Backlog section. §12 migration = Task 3. §13 risks = surfaced inline (Task 26 commit message, Task 24 perf notes). §14 success criteria = Task 27.

**Type consistency:** `ClaudeSession` defined in Task 6 used consistently in Tasks 7, 8, 13, 17, 21. `pendingApprovalsBySessionId` and `useApprovalsStore.countBySession` keyed identically in Tasks 13, 14. `SessionRailIcon`'s `pendingApprovals` prop matches App.tsx's pass-through.

**Placeholder scan:** zero TBD/TODO/"implement later". One inline `console.log('TODO: open new-session wizard')` in Task 13 is intentional — it gets replaced in Task 16 (the immediately next task) and that's called out in Task 13's commit message.

**Open ambiguity:** Task 22's `addClaude` call hashes `iconColor` inline in the Sessions tab; `AddSessionWizard` (Task 17) does the same with a slightly different helper. Acceptable redundancy for v1; refactor to a shared util only if both grow more logic.

