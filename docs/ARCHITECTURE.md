# ClaudeBar — Architecture

> Version: v0.7.0 — 2026-05-13 (Phase 3: 7-tab operator panel, first feature-complete release)

## 1. Overview

ClaudeBar is a standalone floating Electron app for running and managing local Claude Code CLI sessions. It drives the user's installed `claude` binary via the official Claude Agent SDK (`pathToClaudeCodeExecutable`); nothing is bundled. The window is 400×800 by default, draggable, resizable, always-on-top optional. No dock icon — it lives in the macOS menu bar tray (or Windows system tray).

```
┌──────────────────────────────────────────────────────────┐
│ macOS                                                    │
│                                                          │
│  Menu Bar  ──► Tray Icon (ClaudePet tray, 16px)          │
│                       │                                  │
│                       ▼ click / Cmd+Shift+C              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Main Process (Node)                              │   │
│  │  ├─ Tray + floating BrowserWindow (vibrancy)     │   │
│  │  ├─ Optional pet window (ClaudePet or lobster)   │   │
│  │  ├─ Settings IPC   (~/.claudebar/settings.json)  │   │
│  │  ├─ Claude Bridge  (per-session ActiveSession,   │   │
│  │  │                  SDK Query + canUseTool IPC)  │   │
│  │  ├─ IPC handlers   (plugins / skills / commands  │   │
│  │  │                  / stats / claude-sessions)   │   │
│  │  └─ Migration shim (~/.clawbar/ → ~/.claudebar/) │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │ contextBridge IPC                │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │ Renderer (Chromium, sandboxed)                   │   │
│  │  React 19 + Zustand + Tailwind                   │   │
│  │                                                  │   │
│  │  TitleBar │ SessionRail │ ClaudeChannel           │   │
│  │           │              │  OperatorPanel (overlay)│   │
│  │           │              │  AddSessionWizard (overlay)│
│  └──────────────────────────────────────────────────┘   │
│                       │                                  │
│                       ▼ SDK spawn                        │
│               user's `claude` binary (BYO-CLI)           │
└──────────────────────────────────────────────────────────┘
```

## 2. Source layout

```
claudebar/
├── electron/                    # Main process (TS → CJS via tsc)
│   ├── main.ts                  # App lifecycle, tray, floating BrowserWindow, global shortcut
│   ├── preload.ts               # contextBridge → window.electronAPI
│   ├── pet-window.ts            # Optional floating mascot window
│   ├── claude-bridge.ts         # Claude SDK bridge: ActiveSession map + Query loop + canUseTool
│   ├── claude-message-queue.ts  # AsyncIterable<SDKUserMessage> for streaming-input mode
│   ├── shell-env.ts             # Parses ~/.zshrc etc. directly for ANTHROPIC_*/CLAUDE_* vars
│   ├── migration.ts             # One-time copy of theme/petKind/petVisible from ~/.clawbar/
│   └── ipc/
│       ├── settings.ts          # settings:get / settings:set / onSettingChanged
│       ├── claude-sessions.ts   # claude:check-cli / scan-projects / list-sessions
│       ├── plugins.ts           # plugins:list
│       ├── skills.ts            # skills:list / skills:read
│       ├── commands.ts          # commands:list / commands:read
│       └── stats.ts             # stats:get / stats:today (incremental cache)
├── shared/                      # Cross-process types (both main + renderer)
│   └── claude-events.ts         # ClaudeEvent discriminated union (IPC contract)
├── src/                         # Renderer (React 19)
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # TitleBar + SessionRail + ClaudeChannel + overlays
│   ├── pet/                     # Pet window (separate BrowserWindow root)
│   │   ├── pet-entry.tsx
│   │   ├── PetApp.tsx           # Polls petKind setting, renders chosen mascot
│   │   ├── LobsterPet.tsx       # Lobster mascot SVG (selectable via Settings)
│   │   ├── ClaudePet.tsx        # Claude pixel critter SVG (default)
│   │   └── pet.css
│   ├── components/
│   │   ├── TitleBar.tsx         # Drag region; 76px left padding on macOS for traffic lights
│   │   ├── SessionRail.tsx      # 32px rail: ≡ / ⊕ / per-session icons / ⚙
│   │   ├── SessionIcon.tsx      # ClaudePet variant icon + red approval badge
│   │   ├── ClaudeChannel.tsx    # ChatView + ClaudeInstallGuide branch
│   │   ├── add-session/
│   │   │   └── AddSessionWizard.tsx  # Two-step: project picker → session picker / new
│   │   ├── claude/
│   │   │   ├── ClaudeInstallGuide.tsx
│   │   │   ├── ToolCallPill.tsx        # Collapsed pill; click to expand input + output
│   │   │   ├── ToolApprovalPrompt.tsx  # Inline keyboard approval card
│   │   │   └── AskUserQuestionPrompt.tsx
│   │   ├── ChatView.tsx         # Markdown chat surface (messages + pendingPrompt + input)
│   │   ├── Markdown.tsx         # react-markdown + remark-gfm + react-syntax-highlighter
│   │   └── operator/
│   │       └── OperatorPanel.tsx  # 7-tab overlay (Overview/Sessions/Plugins/Skills/Commands/Stats/Settings)
│   ├── hooks/
│   │   └── useClaudeSession.ts  # IPC → SDK bridge state hook (soft-setter / hard-switch / acceptedRealIdRef)
│   ├── stores/
│   │   ├── settingsStore.ts     # Full settings object + resolvedTheme + hydrated flag
│   │   ├── sessionStore.ts      # Session list + activeSessionId + CRUD (renamed from channelStore)
│   │   ├── claudeSessionsStore.ts  # ~/.claude/projects scan results (for Sessions tab + wizard)
│   │   └── approvalsStore.ts    # Pending approval counts by session id
│   ├── types/
│   │   └── index.ts             # ClaudeSession type (single kind — no discriminated channel union)
│   ├── utils/
│   │   ├── format.ts
│   │   └── claude-icon.ts       # claudePetVariant() — pet icon hash from stable row id
│   └── styles/globals.css       # All color tokens as CSS variables
├── types/electron.d.ts          # window.electronAPI types
├── resources/                   # Bundled icons (tray PNG, app icon)
├── docs/
│   ├── ARCHITECTURE.md          # This file
│   ├── MILESTONES.md            # Release history
│   ├── specs/                   # Design documents (historical record)
│   └── plans/                   # Implementation plans (historical record)
├── electron-builder.yml         # SDK platform binary excluded; see §9 Packaging
├── tsconfig.json                # Renderer (includes src + types + shared)
├── tsconfig.node.json           # Main (includes electron + shared; rootDir ".")
├── vite.config.ts
└── package.json
```

## 3. IPC channel table

All renderer ↔ main communication goes through `contextBridge` and `window.electronAPI`. Channels follow `domain:action`. Cross-process payload types live in `shared/`.

| Domain   | Channel                  | Direction       | Purpose |
|----------|--------------------------|-----------------|---------|
| settings | `settings:get`           | invoke          | Read whole settings object |
| settings | `settings:set`           | invoke          | Update one whitelisted key |
| settings | `settings:onChanged`     | main → renderer | Live setting change notification |
| window   | `window:toggle-pin`      | invoke          | Toggle alwaysOnTop |
| window   | `window:hide`            | send            | Hide floating window |
| window   | `window:is-pinned`       | invoke          | Read pin state |
| window   | `window:set-size`        | invoke          | Resize main window |
| theme    | `theme:get-system`       | invoke          | Current OS appearance |
| theme    | `theme:changed`          | main → renderer | OS appearance changed |
| claude   | `claude:check-cli`       | invoke          | Resolve `claude` binary path + version |
| claude   | `claude:scan-projects`   | invoke          | List `~/.claude/projects/*` |
| claude   | `claude:list-sessions`   | invoke          | List `*.jsonl` for a project |
| claude   | `claude:start`           | invoke          | Register ActiveSession + emit `cli-found` |
| claude   | `claude:send`            | invoke          | Push a user message; lazy-opens SDK Query |
| claude   | `claude:abort`           | invoke          | Graceful per-turn `Query.interrupt()` |
| claude   | `claude:close`           | invoke          | Destroy session (session removed / quit) |
| claude   | `claude:approve`         | invoke          | Resolve pending tool approval |
| claude   | `claude:answer`          | invoke          | Resolve pending AskUserQuestion |
| claude   | `claude:load-history`    | invoke          | Read `.jsonl` for in-session history seed |
| claude   | `claude:event`           | main → renderer | `ClaudeEventEnvelope` (see §5) |
| plugins  | `plugins:list`           | invoke          | Read `~/.claude/plugins/installed_plugins.json` |
| skills   | `skills:list`            | invoke          | Three-layer skill walk (user/project/plugin) |
| skills   | `skills:read`            | invoke          | Read a skill's markdown content |
| commands | `commands:list`          | invoke          | Three-layer command walk (user/project/plugin) |
| commands | `commands:read`          | invoke          | Read a command's markdown content |
| stats    | `stats:get`              | invoke          | All-time token stats from incremental cache |
| stats    | `stats:today`            | invoke          | Today's token bucket |
| pet      | `pet:click`              | send            | Click on mascot |
| pet      | `pet:drag`               | send            | Drag mascot to (x, y) |
| pet      | `pet:drag-end`           | send            | Reset drag offset |
| pet      | `pet:right-click`        | send            | Open mascot context menu |

## 4. Renderer state

Zustand only — no React Context.

- **`settingsStore`** — full settings object, `resolvedTheme`, `hydrated` flag. Platform detection uses `navigator.userAgentData?.platform || navigator.platform || navigator.userAgent` because the sandboxed renderer has no `process` global.
- **`sessionStore`** — session list + `activeSessionId` + CRUD. The session list replaces ClawBar's channel list; the discriminated union (`openclaw | web | claude`) is gone — every entry is a Claude session.
- **`claudeSessionsStore`** — result of `claude:scan-projects` + `claude:list-sessions` calls; powers the Sessions tab and the AddSessionWizard project picker.
- **`approvalsStore`** — `countBySession: Record<string, number>` aggregating pending approvals across all sessions; drives the red badge on rail icons. The aggregate is derived in the store, not in each component.

### Zustand selector hygiene (the React #185 trap)

Selectors that compute new arrays or objects (`.filter()`, `.map()`, object spread) return a new reference on every call, causing `useSyncExternalStore` to report a change on every render — triggering an infinite loop. The fix: select the raw array, then transform in the component body.

```tsx
// WRONG — .filter() inside selector returns new array every call
const sessions = useSessionStore((s) => s.sessions.filter((x) => x.enabled));

// CORRECT — select raw, filter outside
const allSessions = useSessionStore((s) => s.sessions);
const sessions = allSessions.filter((x) => x.enabled);
```

This pattern is documented in `src/components/SessionRail.tsx`.

## 5. Claude bridge (BYO-CLI)

`electron/claude-bridge.ts` manages one `ActiveSession` per session id. Each session holds a `Query` instance (lazily opened), an `AbortController`, a `MessageQueue`, and pending approval/ask resolver maps.

### 5.1 Lifecycle

```
SessionRail mounts / session selected
  → useClaudeSession.checkAndStart()
  → claude:check-cli              [resolveCliPath: probe common paths first,
                                    then `zsh -lc 'command -v claude'`]
  → if missing → cliMissing event → renders <ClaudeInstallGuide/>
  → else        → claude:start(sessionId, projectDir, projectKey, cliPath)
                  → bridge stores ActiveSession (Query NOT yet opened)
                  → bridge emits 'cli-found'

User sends first message
  → claude:send(sessionId, text)
  → bridge openQuery() if needed:
      query({
        prompt: messageQueue,
        options: {
          cwd, pathToClaudeCodeExecutable: cliPath,
          permissionMode: 'default',     // SDK auto-adds --permission-prompt-tool stdio
          includePartialMessages: true,
          abortController, canUseTool,
          ...(resumeId ? { resume: resumeId } : {}),
        },
      })
  → runSession(query) drains async iterator → emits ClaudeEvents via IPC

Idle 30 min
  → closeQuery(): graceful interrupt + null out q/queue, KEEP ActiveSession
  → next send reopens with resume: lastKnownSessionId

User clicks Stop
  → abortTurn(): set lastAbortByUser = true; q.interrupt()
  → SDK iterator unwinds cleanly

Session removed / app quit
  → destroySession() → closeQuery + abortController.abort + map.delete
```

### 5.2 ClaudeEvent IPC contract

Defined in `shared/claude-events.ts`:

```ts
type ClaudeEvent =
  | { kind: 'cli-missing' }
  | { kind: 'cli-found'; path: string; version: string }
  | { kind: 'session-started'; sessionId: string }
  | { kind: 'message-delta'; messageId: string; text: string }
  | { kind: 'thinking-delta'; messageId: string; text: string }
  | { kind: 'tool-call';   callId; tool; input; startedAt }
  | { kind: 'tool-result'; callId; output; isError; durationMs }
  | { kind: 'turn-end';    messageId; usage: { input, output } }
  | { kind: 'approval-request'; requestId; tool; input }
  | { kind: 'ask-question';     requestId; questions: AskQuestion[] }
  | { kind: 'error';   message; recoverable: boolean }
  | { kind: 'aborted' };
```

### 5.3 canUseTool callback

`permissionMode: 'default'` causes the SDK to add `--permission-prompt-tool stdio` so the `claude` binary forwards permission requests via stdio rather than prompting on TTY. `bypassPermissions` would skip the callback entirely (do not use it).

For `AskUserQuestion`: emit `ask-question` event, wait for `claude:answer` IPC from renderer, return `{ behavior: 'allow', updatedInput: { questions, answers } }`. Answers are keyed by `question` text, not `header`.

For tool approvals: if already in `allowedForSession` set → allow without prompt. Otherwise emit `approval-request`, wait for `claude:approve` IPC. `allow-session` adds to the set; `deny` returns `{ behavior: 'deny', message: '...' }`.

### 5.4 CLI path resolution

`resolveCliPath()` strategy, in order:
1. Probe common install locations directly (no shell): `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `~/.npm-global/bin/claude`, `~/.bun/bin/claude`, `/opt/local/bin/claude`.
2. Fall back to `zsh -lc 'command -v claude'` (login non-interactive; `-i` hangs under Node spawn without a TTY) with 5s timeout. Take the last non-empty line starting with `/`.

### 5.5 Auth env hydration (`electron/shell-env.ts`)

macOS launchd starts GUI apps with a minimal env that does not include `~/.zshrc` exports. `hydrateShellEnv()` (awaited in `main.ts` before bridge setup) parses `.profile` / `.bash_profile` / `.bashrc` / `.zshenv` / `.zprofile` / `.zshrc` directly with a regex on `export KEY=VALUE` lines, allowlisted to `ANTHROPIC_*` / `CLAUDE_*`. Result is cached and merged onto `process.env` at each `query()` call.

**Do not try to spawn a shell for this.** Three approaches were tried and documented in `electron/shell-env.ts` header; all fail. Direct parsing sidesteps them.

Diagnostic log: `~/.claudebar/auth-debug.log` — key names and counts only, never values.

### 5.6 New-session id mirroring

The renderer mints a placeholder UUID for "new session" entries so they have a stable rail identity immediately. The bridge guards `resume:`:

```ts
let resumeId: string | undefined;
if (s.sessionId) {
  const sessionFile = path.join(os.homedir(), '.claude', 'projects', s.projectKey, `${s.sessionId}.jsonl`);
  if (fs.existsSync(sessionFile)) resumeId = s.sessionId;
}
```

For new sessions `resumeId` stays undefined → SDK creates fresh session → `system/init` reports canonical id → bridge emits `session-started` → `sessionStore.setRealSessionId(id, realId)`.

`setRealSessionId` is a **soft setter**: swaps the id in place, persists, but does NOT call `claude:close`. To prevent the id change from re-firing `useClaudeSession`'s main effect mid-turn: `sessionId` is excluded from effect deps (held in a ref), and an `acceptedRealIdRef` guard suppresses the echo. Hard switches (user-initiated session change) go through a separate effect that calls `checkAndStart()`.

`ClaudeChannel` is keyed by `session.id` only (not `${session.id}-${session.sessionId}`) — the hook owns in-place re-init.

### 5.7 Session rail icon stability

`claudePetVariant()` is called with the stable row `id` (the UUID that was minted when the session was added to the rail), NOT the Claude session id (which mutates via `setRealSessionId`). This ensures the icon colour/shape stays constant across idle-reopen cycles.

## 6. Operator panel views

The panel slides out from the left as an overlay (`z-index: 50`) with a semi-transparent backdrop. Clicking the backdrop (or pressing Esc) closes it. Chat below is blocked by the backdrop while the panel is open.

| Tab | Data source | Notes |
|---|---|---|
| **Overview** | Aggregates: `claude:check-cli`, `~/.claude/projects/` count, active sessions from bridge state, `stats:today`, `approvalsStore.total` | Landing tab when panel opens |
| **Sessions** | `claudeSessionsStore` (populated via `claude:scan-projects` + `claude:list-sessions`) | Collapsible project tree; paths show last 2 segments to distinguish `edge/src` vs `chromium/src`; click to resume |
| **Plugins** | `plugins:list` → `~/.claude/plugins/installed_plugins.json` | Deduped by plugin name (latest install date wins) |
| **Skills** | `skills:list` → three-layer walk: `~/.claude/skills/`, project `.claude/skills/`, per-plugin `skills/` | Grouped by source with badges (user / project / plugin); click shows SKILL.md |
| **Commands** | `commands:list` → same three-layer walk for `commands/` dirs | Slash-prefixed display; search box; click shows command `.md` |
| **Stats** | `stats:get` + `stats:today` → `~/.claudebar/usage-cache.json` | All-time totals, 14-day bar chart, per-model breakdown (input/output/cache_creation/cache_read). First open may be slow on large `~/.claude/projects/` trees. |
| **Settings** | `settings:get` / `settings:set` → `~/.claudebar/settings.json` | Full form per spec §6 (Claude CLI / Window / Diagnostics groups) |

## 7. Stats incremental cache

`~/.claudebar/usage-cache.json` shape:

```json
{
  "version": 1,
  "perFile": {
    "<projectKey>/<sessionId>.jsonl": {
      "lastByteOffset": 12345,
      "tokens": { "input": 0, "output": 0, "cache_creation": 0, "cache_read": 0 },
      "byModel": { "claude-sonnet-4-6": { "input": 0, "output": 0, ... } }
    }
  },
  "byDay": {
    "2026-05-13": { "input": 0, "output": 0, "cache_creation": 0, "cache_read": 0 }
  }
}
```

On each rescan (throttled to 3s), for each `*.jsonl` whose mtime is newer than our last scan, only bytes after `lastByteOffset` are read. The partial last line (no trailing `\n`) is not consumed. This keeps rescans fast even on multi-GB project trees.

## 8. Window

Standalone floating `BrowserWindow`. Key properties:
- No dock icon (`app.dock?.hide()` on macOS).
- `hide-on-close` + `isQuitting` flag — the window hides when the user clicks the red button; `app.quit()` (from tray "Quit") sets `isQuitting = true` first so the close actually quits.
- Position + size persisted to `settings.windowPosition` / `settings.windowSize` on `moved` / `resized` events, restored next launch.
- `vibrancy: 'popover'` on macOS only.
- `webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false`.
- TitleBar pads 76px left on macOS to clear the traffic-light buttons (Electron adds them even to frameless windows on macOS).

## 9. Settings system

Settings are persisted to `~/.claudebar/settings.json`. The `settings:set` handler writes one key at a time and fires an `onSettingChanged` listener to all renderers. The global shortcut (`globalShortcut`) is re-registered live via `onSettingChanged` without requiring a restart. `theme` changes update `resolvedTheme` in `settingsStore` which writes `data-theme` onto `document.documentElement`.

## 10. Migration

`electron/migration.ts` runs once on first launch (guarded by `~/.claudebar/.migrated-from-clawbar` flag file). It copies `theme`, `petKind`, and `petVisible` from `~/.clawbar/settings.json` if that file exists. ClawBar's config is left intact. Sessions in `~/.claude/projects/` need no migration — both apps read the same directory.

## 11. Pet window

`pet-window.ts` owns an always-on-top `BrowserWindow` (100×110, transparent, frameless). Default kind: `claude` (orange pixel critter). Alternative: `lobster` (OpenClaw mascot, selectable via Settings → petKind). Both are in `src/pet/`. `PetApp.tsx` polls `settings:get` every 2s to pick up kind/visibility changes without a dedicated IPC channel. Right-click pet / right-click tray both expose a "Switch Pet" submenu.

## 12. Packaging — BYO-CLI

The Claude Agent SDK ships ~205 MB platform packages (`@anthropic-ai/claude-agent-sdk-darwin-arm64` etc.) that we never bundle. `electron-builder.yml` excludes them:

```yaml
files:
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**/*"
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk/bridge.mjs"
  - ...
```

Net DMG: ~109 MB (SDK JS + transitive deps, no platform binary).

Code signing is wired (`build/entitlements.mac.plist`, `hardenedRuntime: true`) but requires a Developer ID certificate + App Store Connect API key in `.env`. Without them, the unsigned DMG requires the right-click → Open / `xattr -dr com.apple.quarantine` Gatekeeper bypass.
