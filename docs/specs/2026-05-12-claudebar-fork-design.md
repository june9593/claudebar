# ClaudeBar — Design Doc

> Date: 2026-05-12 · Author: Yue Liu (with brainstorming via Claude) · Status: Draft pending implementation plan

ClaudeBar is a fork of [ClawBar](https://github.com/june9593/clawbar). It pivots the product from "OpenClaw multi-channel hub" to "Claude Code desktop app" — a floating window that hosts your local Claude Code CLI sessions with a side rail for session switching and a slide-out operator panel for plugins / skills / commands / stats / settings.

## 1. Product positioning

ClaudeBar is the floating-window companion for `claude` CLI users — like Edge Copilot or Chrome Gemini, but the brain is your locally-installed Claude Code binary (BYO-CLI, no bundling). Think of it as "VS Code's Copilot chat panel, but free-standing on your desktop, and it can resume any Claude Code session from `~/.claude/projects/`".

Differentiation vs alternatives:
- **vs Claude.ai web** — runs your local CLI with your local file access, your installed plugins / skills / commands, your subscription / API key from `.zshrc`
- **vs Claude Code CLI in a terminal** — visual session switching, hover-able tool calls, inline approvals, multi-session token stats
- **vs ClawBar** — single-purpose (Claude only, no IM/OpenClaw clutter), floating window form factor, deeper Claude ecosystem integration (plugins / skills / commands / stats views)

## 2. Repo structure

**New repo `june9593/claudebar`** (decision A from Q1).

Bootstrap: `git clone` the current ClawBar repo, push to new remote (decision A from Q2). Full commit history preserved — future debuggers can trace back to ClawBar v0.4.x for shell-env / resume-guard fixes. The two repos then diverge independently.

ClawBar repo continues as-is (OpenClaw client). No code-sharing infrastructure (monorepo, npm package, etc.) — clean fork is the whole point.

## 3. Window form factor

**Standalone floating window** (decision B from Q4 — popover ↔ float dual-mode pushed to backlog).

- Default size: **400 × 800** (decision A from Q5 — VS Code Copilot chat panel proportions)
- Min size: 320 × 500
- Max size: unlimited (user drags)
- Draggable, resizable, can be set always-on-top via Settings
- Not a popover — it's a regular Electron `BrowserWindow` without dock icon (`app.dock?.hide()`)
- Window position + size persisted to settings, restored next launch
- Tray icon toggles visibility (decision A from Q11): click tray → show/hide window; right-click tray → menu (New session / Settings / Switch Pet / Quit)
- Global keyboard shortcut `Cmd+Shift+C` (macOS) / `Ctrl+Shift+C` (Windows) also toggles. Configurable in Settings.

## 4. UI layout

**Slim rail + chat + slide-out panel** (decision A from Q3 + Q5):

```
┌─[≡]─┬──────────────────────────────────┐
│     │                                  │
│ ⊕   │                                  │
│     │                                  │
│ S₁  │     Chat for active session      │
│ S₂●─│   (markdown, code highlight,     │
│ S₃  │    tool pills, approvals)        │
│ S₄  │                                  │
│     │                                  │
│ ⚙   │  ┌────────────────────────────┐  │
│     │  │ multi-line input           │  │
└─────┴──┴────────────────────────────┴──┘
```

- **Slim rail (left, ~32px wide, always visible)**:
  - `≡` operator panel toggle (top)
  - `⊕` new session button
  - One icon per active session, using existing `ClaudePet` variant hash (body / hand / leg / eye colors hashed from project + session id)
  - **Red badge** on session icons that have pending approvals or AskUserQuestions (the "Approvals view" replacement — decision from Q7)
  - `⚙` quick Settings access (bottom)
- **Chat area** takes the rest of the width. Always full-width — never compressed by the panel.
- **Operator panel**: when `≡` clicked, slides out from left as **overlay** (z-index above chat, semi-transparent backdrop, ~280px wide). Click backdrop / Esc / select an action inside → auto-close. Chat below stays interactive when panel is open? — **No**, backdrop blocks. Decision: backdrop blocks, click anywhere outside panel closes it.

## 5. Operator panel views

7 views (decision from Q7, with Approvals → red badge, Agents/Logs/Cron/Plans/Hooks dropped to backlog):

| View | Data source | Notes |
|---|---|---|
| **Overview** | Aggregates: CLI status from `claude:check-cli`, project count from `~/.claude/projects/`, active sessions from in-memory bridge state, today's tokens from cache, pending approval count | Landing page when panel opens |
| **Sessions** | `~/.claude/projects/*/*.jsonl` filesystem walk (existing `claude-sessions.ts` IPC) | Group by project, sort by mtime; click resumes; "+ New session" button per project |
| **Plugins** | `~/.claude/plugins/installed_plugins.json` + `~/.claude/plugins/marketplaces/` | Per-plugin: name, marketplace, version, install date; click opens detail showing the plugin's commands / skills / agents |
| **Skills** | Three-layer merge: `~/.claude/skills/`, project-level `.claude/skills/`, plugin `skills/` | Source-tagged badges (user / project / plugin); SKILL.md preview pane |
| **Commands** | `~/.claude/commands/` + project `.claude/commands/` + plugin `commands/` | Cheat-sheet style; search box; click shows the command's `.md` |
| **Stats** | Hybrid (decision B+C from Q8): `~/.claude/stats-cache.json` for daily activity + per-message `usage` field from `~/.claude/projects/*/*.jsonl` for token breakdown + live SDK Query `result.usage` events for "currently burning" counter | Daily activity line chart, token bar chart by model (Opus / Sonnet / Haiku), input/output/cache_creation/cache_read split, estimated cost. See §7 for caching strategy. |
| **Settings** | `~/.claudebar/settings.json` | See §6 |

## 6. Settings

| Setting | Type / Default | Description |
|---|---|---|
| **Claude CLI** |  |  |
| `claudePath` | string, autodetected | Path to `claude` binary; manual override |
| `defaultModel` | `default` \| `opus` \| `sonnet` \| `haiku`, default `default` | Model used for new sessions |
| `defaultPermissionMode` | `default` \| `acceptEdits` \| `bypassPermissions`, default `default` | Permission mode for new sessions |
| `defaultProjectDir` | string?, default null | Pre-selected project when clicking ⊕ (skip the project picker step) |
| `idleCloseMinutes` | number, default 30 | Close idle SDK Query after N minutes (transparent reopen on next message) |
| **Window** |  |  |
| `theme` | `light` \| `dark` \| `system`, default `system` |  |
| `windowSize` | `{w, h}`, default `400 × 800` | Persisted on resize |
| `windowPosition` | `{x, y}`, default null (center) | Persisted on drag |
| `alwaysOnTop` | bool, default false |  |
| `hideOnClickOutside` | bool, default false | (Note: defaults to false — different from popover apps because float windows aren't expected to auto-hide) |
| `globalShortcut` | string, default `Cmd+Shift+C` / `Ctrl+Shift+C` | Toggle window visibility |
| `petVisible` | bool, default true |  |
| `petKind` | `claude` (default) \| `lobster` | Default is Claude pixel critter (decision A from Q12.4) |
| **Diagnostics** |  |  |
| `enableSdkTrace` | bool, default false | Toggles writing every SDK message to `~/.claudebar/sdk-trace.jsonl` (replaces `CLAWBAR_TRACE` env var). |
| (read-only display) | n/a | Shell-env hydration status: how many `ANTHROPIC_*` / `CLAUDE_*` keys lifted, link to `~/.claudebar/auth-debug.log` |

**Removed from ClawBar settings**: `gatewayUrl`, `authMode`, `chatMode`, `channels`, `activeChannelId` (all OpenClaw-specific).

## 7. Stats view caching strategy

The stats view needs to feel instant but the data sources (jsonl files, possibly hundreds of MB across projects) can't be re-parsed every open.

```
┌─ App start / Stats view open ─┐
│                               │
│ 1. Read stats-cache.json     │ ← Claude CC has already aggregated dailyActivity
│    → seed daily chart         │
│                               │
│ 2. Read ~/.claudebar/         │ ← our own incremental cache
│    usage-cache.json           │   (token breakdown by day, by model)
│    → seed token chart         │
│                               │
│ 3. Background incremental     │
│    scan: for each project's   │
│    *.jsonl, if mtime > our    │
│    lastSeen, parse new        │
│    messages, update cache,    │
│    persist                    │
│                               │
│ 4. Subscribe to live SDK      │
│    `result` events → "burning │
│    now" counter               │
└───────────────────────────────┘
```

`~/.claudebar/usage-cache.json` shape:
```json
{
  "version": 1,
  "perFile": {
    "<projectKey>/<sessionId>.jsonl": {
      "lastByteOffset": 12345,
      "tokens": { "input": 0, "output": 0, "cache_creation": 0, "cache_read": 0 },
      "byModel": { "claude-opus-4-7": { ... }, "claude-sonnet-4-6": { ... } }
    }
  },
  "byDay": {
    "2026-05-12": { "input": 0, "output": 0, ... }
  }
}
```

Append-only jsonl makes "lastByteOffset" cheap — we only read new bytes since last scan.

## 8. Chat experience (v1)

Decision from Q9 — first version includes:

- **Markdown rendering** via `react-markdown` with `remark-gfm` (tables, task lists, strikethrough)
- **Code blocks**: syntax highlighting via `shiki` (or `react-syntax-highlighter` with Prism — TBD by writing-plans), language label + copy-to-clipboard button
- **Multi-line input**: `<textarea>` with auto-grow, `Enter` sends, `Shift+Enter` newline
- Existing ToolCallPill, ApprovalCard, AskUserQuestionPrompt all kept

Backlog (out of scope for v1): message hover actions (copy / reroll), file drag & drop, image paste. See task #76.

## 9. What's kept, removed, rewritten

**Kept (no changes or trivial)**:
- `electron/main.ts` (window/tray lifecycle), simplified — no popover behavior, no channel-switching menu
- `electron/preload.ts`, `electron/claude-bridge.ts`, `electron/claude-message-queue.ts`, `electron/shell-env.ts` (the entire Claude bridge stack including BYO-CLI / shell-env hydration / new-session id mirroring — all v0.4.x lessons preserved)
- `electron/ipc/settings.ts`, `electron/ipc/claude-sessions.ts`
- `electron/pet-window.ts`, `src/pet/*` (pet system, default flipped to `claude`)
- `src/components/ChatView.tsx`, `src/components/claude/*` (ToolCallPill, approvals, AskUserQuestion)
- `src/hooks/useClaudeSession.ts` + the soft-setter / hard-switch / acceptedRealIdRef machinery
- `src/stores/channelStore.ts` → renamed `sessionStore.ts`, the channel discriminated union collapses to just claude sessions
- `shared/claude-events.ts`
- The 7 view components (rewritten internals, kept skeletons): `OverviewView`, `SessionsView`, `SkillsView`, `SettingsPanel` + 3 new (`PluginsView`, `CommandsView`, `StatsView`)

**Removed**:
- `electron/ws-bridge.ts` (OpenClaw WebSocket)
- `src/components/OpenClawChannel.tsx`, `CompactChat.tsx`, `ChatWebView.tsx`, `ChatHistory.tsx` (OpenClaw native chat)
- `src/components/WebChannel.tsx`, `LobsterIcon.tsx` (web channels + OpenClaw mascot is now optional alternative)
- `src/components/ApprovalsView.tsx`, `AgentsView.tsx`, `CronView.tsx`, `LogsView.tsx`, `UsageView.tsx` (Approvals → badge; rest dropped)
- `src/components/AddChannelMenu.tsx`, `ChannelContextMenu.tsx`, `add-channel/` (channel concept gone — sessions only)
- `electron/ipc/` OpenClaw-specific handlers
- Settings: `gatewayUrl`, `authMode`, `chatMode`, `channels`, `activeChannelId`
- `~/.clawbar/device-identity.json` (Ed25519 keypair was OpenClaw-only)

**Rewritten**:
- `App.tsx` — drop `ChannelHost` / `ChannelDock`, install `SessionRail` + `ChatHost` + `OperatorPanelOverlay`
- `SessionsView` — was OpenClaw-session listing; now `~/.claude/projects/*/*.jsonl` walker
- `SkillsView` — was reading from OpenClaw gateway; now three-layer filesystem merge
- `SettingsPanel` — completely new content per §6
- `OverviewView` — completely new aggregation per §5
- `electron/main.ts` — strip popover behavior, install standalone window + tray toggle + global shortcut

**New files**:
- `src/components/SessionRail.tsx`, `OperatorPanelOverlay.tsx`
- `src/components/views/PluginsView.tsx`, `CommandsView.tsx`, `StatsView.tsx`
- `electron/ipc/plugins.ts`, `electron/ipc/skills.ts`, `electron/ipc/commands.ts`, `electron/ipc/stats.ts` (filesystem readers + cache management)
- `electron/migration.ts` (one-time copy of theme / petKind / windowSize from `~/.clawbar/` to `~/.claudebar/`)
- Markdown rendering layer (probably `src/components/Markdown.tsx`)

## 10. Branding

Per Q12 decisions:

- **App name**: ClaudeBar
- **Bundle ID**: `com.june9593.claudebar` (decision B from Q12.2)
- **Tray icon**: Pixel ClaudePet small (decision B from Q12.3) — even though it's small at 16×16, the silhouette + orange color tests well; falls back to a 12-ray sunburst on monochrome rendering paths if needed
- **Default pet**: ClaudePet (decision A from Q12.4)
- **Config dir**: `~/.claudebar/` with one-time migration from `~/.clawbar/` (decision B from Q12.1) — migrate `theme`, `petKind`, `windowSize`, mark `~/.claudebar/.migrated-from-clawbar` so it only runs once
- **DMG name**: `ClaudeBar-X.Y.Z-mac-arm64.dmg`

## 11. Backlog (post-v1)

Tracked in this design doc for visibility, will be created as GitHub issues post-v1:

- **Chat polish** (task #76 in current session): message hover actions (copy / reroll), file drag & drop, image paste
- **Dropped views** (task #77): Plans browser, Hooks viewer, Cron-like "schedule a prompt"
- **Window mode** (task #78): popover ↔ float dual-mode toggle in Settings
- **Other**: per-conversation token estimate before sending, search across all sessions, context tagging (e.g. starring important sessions)

## 12. Migration sketch (ClawBar → ClaudeBar)

Users of ClawBar who only used the Claude channel are the natural early ClaudeBar adopters. To make their first ClaudeBar launch feel "settled in" rather than blank:

```ts
// electron/migration.ts
const CLAWBAR_DIR = path.join(os.homedir(), '.clawbar');
const CLAUDEBAR_DIR = path.join(os.homedir(), '.claudebar');
const MIGRATED_FLAG = path.join(CLAUDEBAR_DIR, '.migrated-from-clawbar');

export function maybeMigrateFromClawbar(): void {
  if (fs.existsSync(MIGRATED_FLAG)) return;
  if (!fs.existsSync(path.join(CLAWBAR_DIR, 'settings.json'))) return;

  const oldSettings = JSON.parse(fs.readFileSync(path.join(CLAWBAR_DIR, 'settings.json'), 'utf8'));
  const newSettings = {
    theme: oldSettings.theme ?? 'system',
    petKind: oldSettings.petKind ?? 'claude',  // default flipped
    petVisible: oldSettings.petVisible ?? true,
    // (window size not migrated — ClawBar's narrow popover dims would be wrong)
  };

  fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true });
  fs.writeFileSync(path.join(CLAUDEBAR_DIR, 'settings.json'), JSON.stringify(newSettings, null, 2));
  fs.writeFileSync(MIGRATED_FLAG, new Date().toISOString());
  console.log('[migration] migrated theme/petKind/petVisible from ~/.clawbar/');
}
```

Sessions don't need migration — they live in `~/.claude/projects/`, owned by Claude Code itself, both apps read the same source of truth.

## 13. Open questions / risks

- **`shiki` vs `react-syntax-highlighter`**: shiki is more accurate (uses TextMate grammars same as VS Code) but adds ~1MB to bundle. Defer to writing-plans phase.
- **Stats view perf with huge `~/.claude/projects/`**: heavy users may have GBs of jsonl. The byte-offset incremental cache should handle it but needs benchmarking on a real fat tree before v1 ships.
- **Plugins view dynamics**: if user installs a plugin via `claude` CLI while ClaudeBar is open, do we hot-reload the view? File watchers on `~/.claude/plugins/` would do it but adds complexity. v1 = manual refresh button; v1.1 = file watcher.
- **Tray icon at 16×16**: ClaudePet may not render legibly. Plan B is to render the 12-ray sunburst instead at small sizes. Verify during implementation.

## 14. Success criteria for v1

- Cold launch from Finder → window visible in <2s, with hydrated session rail
- Click any session in rail → resume works for both real and placeholder UUIDs (the v0.4.4 bug stays fixed)
- New session → send message → response streams back in markdown with code highlighting
- Operator panel slides out smoothly, every view loads its data <500ms (Stats may take longer on first scan, OK)
- Migration from ClawBar on first launch is silent and non-destructive (ClawBar config left intact)
- DMG launches from Finder without "Not logged in" (shell-env hydration works — the v0.4.8 fix stays fixed)
