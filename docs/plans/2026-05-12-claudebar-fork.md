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

## Phase 2 — placeholder

Phase 2 (floating window + slim rail + slide-out operator overlay + markdown chat) and Phase 3 (the 7 operator views) will be added to this plan in subsequent edits. Phase 1 is complete and shippable on its own as v0.5.0; ship and validate it before extending the plan.
