# ClawBar — Architecture

> 版本: v3.1 — 2026-05-06 (v0.4.8: shell-env hydration + new-session resume guard)

## 1. Overview

ClawBar is a frameless Electron app **for OpenClaw + your local Claude Code**, running on **macOS** (as a menu-bar popover) and **Windows** (as a system-tray popover). The user's agents are reachable through several **channels** — OpenClaw's own web chat, IM bots (Telegram / Discord / Feishu / Lark), custom integrations, and local Claude Code sessions — and ClawBar collects every one of those channels into a 48 px channel bar on the left edge of the popover. The first channel is OpenClaw's native WebSocket UI (or, alternatively, an embedded iframe of the gateway's own web client); the rest are either Electron `<webview>` tags with persistent partitions, or Claude SDK-driven chat surfaces wrapping the user's installed `claude` binary.

```
┌──────────────────────────────────────────────────────────┐
│ macOS                                                    │
│                                                          │
│  Menu Bar  ──► Tray Icon (template PNG, 🦞 silhouette)   │
│                       │                                  │
│                       ▼ click                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Main Process (Node)                              │   │
│  │  ├─ Tray + frameless BrowserWindow (vibrancy)    │   │
│  │  ├─ Optional pet window (lobster or Claude pet)  │   │
│  │  ├─ Settings IPC  (~/.clawbar/settings.json)     │   │
│  │  ├─ WS Bridge     (single ws → IPC fan-out,      │   │
│  │  │                 Ed25519 device identity)       │   │
│  │  └─ Claude Bridge (per-channel SDK Query +       │   │
│  │                    canUseTool → IPC fan-out)      │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │ contextBridge IPC                │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │ Renderer (Chromium)                              │   │
│  │  React 19 + Zustand + Tailwind                   │   │
│  │                                                  │   │
│  │  TitleBar │ ChannelDock │ ChannelHost            │   │
│  │           │              │  ├─ OpenClawChannel   │   │
│  │           │              │  ├─ WebChannel × N    │   │
│  │           │              │  └─ ClaudeChannel     │   │
│  └──────────────────────────────────────────────────┘   │
│                       │                                  │
│         ┌─────────────┴────────────┬───────────────┐    │
│         ▼                          ▼               ▼    │
│  OpenClaw gateway          Web (IM webviews)  spawn `claude`
│  (default localhost:18789)                    (BYO-CLI)
└──────────────────────────────────────────────────────────┘
```

## 2. Source layout

```
clawbar/
├── electron/                    # Main process (TS → CJS via tsc)
│   ├── main.ts                  # app lifecycle, tray, BrowserWindow, Switch Pet menu
│   ├── preload.ts               # contextBridge → window.electronAPI
│   ├── pet-window.ts            # optional floating mascot window
│   ├── ws-bridge.ts             # OpenClaw WebSocket bridge + Ed25519 auth
│   ├── claude-bridge.ts         # Claude SDK bridge: ActiveSession map + Query loop + canUseTool
│   ├── claude-message-queue.ts  # AsyncIterable<SDKUserMessage> for streaming-input mode
│   ├── shell-env.ts             # Parses ~/.zshrc etc. directly for ANTHROPIC_*/CLAUDE_* vars
│                                #   (launchd-launched apps don't get shell env; never spawn a shell here)
│   └── ipc/
│       ├── settings.ts          # settings:get / settings:set
│       └── claude-sessions.ts   # claude:check-cli / scan-projects / list-sessions
├── shared/                      # Cross-process types (consumed by both main + renderer)
│   └── claude-events.ts         # ClaudeEvent discriminated union (IPC contract)
├── src/                         # Renderer (React 19)
│   ├── main.tsx                 # main popover entry
│   ├── App.tsx                  # title bar + view routing (chat / settings)
│   ├── pet/                     # Pet window (separate root)
│   │   ├── pet-entry.tsx        # pet entry
│   │   ├── PetApp.tsx           # polls petKind, renders chosen mascot
│   │   ├── LobsterPet.tsx       # 🦞 OpenClaw mascot SVG
│   │   ├── ClaudePet.tsx        # ✦ Claude pixel critter SVG
│   │   └── pet.css
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ChannelDock.tsx
│   │   ├── ChannelIcon.tsx      # renders LobsterIcon / ClaudePetIcon variant / web favicon
│   │   ├── ChannelHost.tsx      # routes by channel.kind
│   │   ├── WebChannel.tsx
│   │   ├── OpenClawChannel.tsx
│   │   ├── ClaudeChannel.tsx    # branches on cliMissing → install guide
│   │   ├── AddChannelMenu.tsx
│   │   ├── ChannelContextMenu.tsx
│   │   ├── CompactChat.tsx
│   │   ├── ChatView.tsx         # generic chat surface (also renders tool pills + pendingPrompt)
│   │   ├── ChatWebView.tsx
│   │   ├── ChatHistory.tsx
│   │   ├── ApprovalCard.tsx     # OpenClaw exec.approval.requested card (legacy)
│   │   ├── ApprovalsView.tsx
│   │   ├── add-channel/
│   │   │   └── ClaudeWizard.tsx # two-step Claude session picker (project → session)
│   │   ├── claude/
│   │   │   ├── ClaudeInstallGuide.tsx  # 'claude not found' empty state
│   │   │   ├── ToolCallPill.tsx        # collapsed pill for assistant tool_use; click to expand
│   │   │   ├── ToolApprovalPrompt.tsx  # inline keyboard approval card (1 / 2 / 3 / Esc)
│   │   │   └── AskUserQuestionPrompt.tsx  # inline option list with multiSelect support
│   │   ├── SessionsView.tsx ... LogsView.tsx ... SettingsPanel.tsx
│   │   ├── LobsterIcon.tsx
│   │   └── views/{ViewShell,ViewStates}.tsx
│   ├── hooks/
│   │   ├── useClawChat.ts       # OpenClaw IPC → WS bridge state hook
│   │   ├── useClaudeSession.ts  # Claude IPC → SDK bridge state hook (parallel to useClawChat)
│   │   └── useWsRequest.ts      # one-shot ws:send + correlate response
│   ├── stores/
│   │   ├── settingsStore.ts
│   │   ├── channelStore.ts      # also: addClaude(), switchClaudeSession()
│   │   └── webviewStore.ts
│   ├── types/
│   │   └── index.ts             # Channel discriminated union: openclaw | web | claude
│   ├── utils/
│   │   ├── format.ts
│   │   └── claude-icon.ts       # claudePetVariant() — per-session pet icon hash
│   └── styles/globals.css
├── types/electron.d.ts          # window.electronAPI types
├── resources/                   # bundled icons
├── docs/ARCHITECTURE.md         # this file
├── electron-builder.yml         # SDK platform binary excluded; see §11 Packaging
├── tsconfig.json                # renderer (includes src + types + shared)
├── tsconfig.node.json           # main (includes electron + shared; rootDir ".")
├── vite.config.ts
└── package.json
```

## 3. IPC

All renderer ↔ main communication goes through `contextBridge` and `window.electronAPI`. Channels follow `domain:action`. Cross-process payload types (notably `ClaudeEventEnvelope`) live in `shared/` so both ends import the same definitions.

| Domain   | Channel                | Direction        | Purpose |
|----------|------------------------|------------------|---------|
| settings | `settings:get`         | invoke           | Read whole settings object |
| settings | `settings:set`         | invoke           | Update one whitelisted key (incl. `petKind`) |
| window   | `window:toggle-pin`    | invoke           | Toggle alwaysOnTop |
| window   | `window:hide`          | send             | Hide popover |
| window   | `window:is-pinned`     | invoke           | Read pin state |
| window   | `window:set-size`      | invoke           | Resize main window |
| window   | `navigate`             | main → renderer  | Tray menu → switch view |
| theme    | `theme:get-system`     | invoke           | Current macOS appearance |
| theme    | `theme:changed`        | main → renderer  | OS appearance changed |
| ws       | `ws:connect`           | invoke           | Open WebSocket to gateway |
| ws       | `ws:disconnect`        | invoke           | Close WS, suppress retry |
| ws       | `ws:send`              | invoke           | Send a `req` frame |
| ws       | `ws:is-connected`      | invoke           | Read auth-complete flag |
| ws       | `ws:status`            | main → renderer  | `{ connected, error }` updates |
| ws       | `ws:history`           | main → renderer  | `chat.history` payload |
| ws       | `ws:chat-event`        | main → renderer  | streaming `chat` events |
| ws       | `ws:approval`          | main → renderer  | `exec.approval.requested` |
| ws       | `ws:response`          | main → renderer  | Generic `res` frame fan-out |
| pet      | `pet:click`            | send             | Click on mascot |
| pet      | `pet:drag`             | send             | Drag mascot to (x, y) |
| pet      | `pet:drag-end`         | send             | Reset drag offset |
| pet      | `pet:right-click`      | send             | Open mascot context menu |
| claude   | `claude:check-cli`     | invoke           | Resolve user's `claude` binary path + version |
| claude   | `claude:scan-projects` | invoke           | List `~/.claude/projects/*` |
| claude   | `claude:list-sessions` | invoke           | List `*.jsonl` for a project |
| claude   | `claude:start`         | invoke           | Register an ActiveSession + emit `cli-found` |
| claude   | `claude:send`          | invoke           | Push a user message; lazy-opens the SDK Query |
| claude   | `claude:abort`         | invoke           | Graceful per-turn `Query.interrupt()` |
| claude   | `claude:close`         | invoke           | Destroy session (channel removed / quit) |
| claude   | `claude:approve`       | invoke           | Resolve a pending tool approval |
| claude   | `claude:answer`        | invoke           | Resolve a pending AskUserQuestion |
| claude   | `claude:load-history`  | invoke           | Read `.jsonl` for in-channel history seed |
| claude   | `claude:event`         | main → renderer  | `ClaudeEventEnvelope` (see §5) |

## 4. WebSocket bridge (OpenClaw)

The renderer can't set custom `Origin` headers on a WebSocket, and we want a single connection shared across all renderer windows, so the WebSocket lives in the main process.

`electron/ws-bridge.ts` handles:

1. **Device identity** — Ed25519 keypair generated on first run, stored at `~/.clawbar/device-identity.json`. Public-key SHA-256 is the device id.
2. **Connect** — open `ws(s)://<gateway>` with `Origin: <gateway>` header.
3. **Challenge / response** — on `connect.challenge` event sign `v2|deviceId|clientId|mode|role|scopes|signedAt|token|nonce` with the private key, reply with a `connect` request including the public key + signature + token.
4. **Auto-fetch history** — once `connect` succeeds, fire `chat.history { sessionKey: 'main' }` automatically.
5. **Fan-out** — relay frames to **all** open BrowserWindows via the `ws:*` channels.
6. **Reconnect** — exponential backoff up to 5 retries on `close`. Manual `ws:disconnect` suppresses retry.

Frame shape (OpenClaw custom protocol — **not** JSON-RPC):

```
{ "type": "req",  "id": "uuid", "method": "chat.send", "params": { … } }
{ "type": "res",  "id": "uuid", "ok": true,  "payload": { … } }
{ "type": "event","event": "chat", "payload": { state: "delta" | "final", message: { … } } }
```

## 5. Claude bridge (BYO-CLI)

`electron/claude-bridge.ts` is the parallel of `ws-bridge.ts` for the Claude channel. Each Claude channel has its own `ActiveSession` (Query + AbortController + MessageQueue + pending approvals/asks). Tool permission checks bridge to the renderer through a `canUseTool` callback.

### 5.1 Lifecycle

```
ClaudeChannel mounts
  → useClaudeSession.checkAndStart()
  → claude.checkCli()              [resolveCliPath: probe common paths first,
                                     then `zsh -lc 'command -v claude'`]
  → if missing → cliMissing event → renders <ClaudeInstallGuide/>
  → else        → claude.start(channelId, projectDir, projectKey, sessionId, cliPath)
                  → bridge stores ActiveSession (Query NOT yet opened)
                  → bridge emits 'cli-found'

User sends first message
  → claude.send(channelId, text)
  → bridge openQuery() if needed:
      query({
        prompt: messageQueue,
        options: {
          cwd, pathToClaudeCodeExecutable: cliPath,
          permissionMode: 'default',     // SDK auto-adds --permission-prompt-tool stdio
          includePartialMessages: true,
          abortController, canUseTool,
          ...(sessionId ? { resume: sessionId } : {}),
        },
      })
  → runSession(query) drains async iterator → emits ClaudeEvents

Idle 30 min
  → closeQuery(): graceful interrupt + null out q/queue, KEEP ActiveSession
  → next send reopens with resume: lastKnownSessionId

User clicks Stop
  → abortTurn(): set lastAbortByUser = true; q.interrupt()
  → SDK iterator unwinds; runSession's catch checks the flag and skips
    duplicate 'aborted' emit

Channel removed / app quit
  → destroySession() → closeQuery + abortController.abort + map.delete
```

### 5.2 ClaudeEvent (the IPC contract)

Defined in `shared/claude-events.ts`. The bridge emits events; the hook reduces them into chat state.

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

When `canUseTool` is provided, the SDK auto-adds `--permission-prompt-tool stdio` to its CLI args, telling the bundled `claude` to forward every permission check via stdio rather than asking on TTY. We MUST use `permissionMode: 'default'` — `bypassPermissions` would skip the callback entirely (the bundled binary's safety policy is to deny rather than allow without a human).

```
bundled claude wants to call Bash
  → SDK forwards 'can_use_tool' control request
  → makeCanUseTool(session) runs:
      if AskUserQuestion → emit 'ask-question', wait for `answer` IPC,
        return { behavior: 'allow', updatedInput: { questions, answers } }
        // answers keyed by `question` text (NOT `header`), per SDK spec
      else if tool already in allowedForSession → allow without prompt
      else → emit 'approval-request', wait for `approve` IPC
        decision 'allow' → allow once
        decision 'allow-session' → add to set, allow
        decision 'deny' → { behavior: 'deny', message: 'Tool call denied by user' }
```

`signal.aborted` is honoured: pending resolvers reject, the SDK turn unwinds.

### 5.4 CLI path resolution

`resolveCliPath()` strategy, in order:

1. Probe common install locations directly (no shell, fast, robust):
   `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `~/.npm-global/bin/claude`, `~/.bun/bin/claude`, `/opt/local/bin/claude`.
2. Fall back to `zsh -lc 'command -v claude'` (login non-interactive shell — `-i` would hang under Node spawn without a TTY) with a 5 s timeout.

Take the last non-empty line of stdout (login shells print "Restored session: …" before command output) and require it to start with `/` before trusting it.

### 5.5 Auth env hydration (`electron/shell-env.ts`)

macOS launchd starts GUI apps with a minimal env — it does NOT source `~/.zshrc`, `~/.zprofile`, or `~/.bash_profile`. So `process.env.ANTHROPIC_AUTH_TOKEN` is missing for any user who exports tokens in shell rc files, and the spawned `claude` reports "Not logged in" even though it works fine from a terminal.

Fix: at app boot (`hydrateShellEnv()` awaited in `main.ts` `whenReady` before `setupClaudeBridge()`), parse `.profile` / `.bash_profile` / `.bashrc` / `.zshenv` / `.zprofile` / `.zshrc` DIRECTLY with a regex against `export KEY=VALUE` lines on the `ANTHROPIC_*` / `CLAUDE_*` allowlist. Cache the result. The Claude bridge merges the cache onto `process.env` when calling SDK `query()`:

```ts
env: { ...process.env, ...getShellAuthEnv() }
```

**Do not try to spawn a shell to do this.** History of failed approaches (documented in the file header):
1. `zsh -lc 'env'` — `-l` does NOT source `.zshrc` (interactive-only), only `.zshenv`/`.zprofile`/`.zlogin`.
2. `zsh -ilc 'env'` — `-i` requires a TTY; under Node `spawn` it hangs forever.
3. `zsh -c 'source ~/.zshrc; env'` — hangs >5 s when launchd's clean env is the parent (compinit / nvm hooks / brew completion behave differently with `SHLVL=0` and minimal `PATH`).

Direct parsing sidesteps all three. Doesn't expand `$VAR` / handle `eval`, but values for these keys are almost always literal (URLs, tokens, model names, "true").

A diagnostic log lives at `~/.clawbar/auth-debug.log` — only key NAMES + counts, never values. Ask users to send this when env-related auth bugs recur.

Windows: skipped entirely. GUI launches inherit the user env on Windows.

### 5.6 New-session id mirroring

The renderer mints a placeholder `crypto.randomUUID()` for every "new session" (so the channel has a stable identity in the dock from the moment the user clicks). The bridge MUST NOT pass that placeholder as SDK `resume:` — the SDK silently fails to load a non-existent `.jsonl` and the turn hangs.

`openQuery` guards the resume:

```ts
let resumeId: string | undefined;
if (s.sessionId) {
  const sessionFile = path.join(os.homedir(), '.claude', 'projects', s.projectKey, `${s.sessionId}.jsonl`);
  if (fs.existsSync(sessionFile)) resumeId = s.sessionId;
}
```

For new sessions `resumeId` stays undefined → SDK creates a fresh session → `system/init` reports the canonical id → bridge emits `session-started` → renderer's `useClaudeSession` calls `channelStore.setRealSessionId(channelId, realId)`.

`setRealSessionId` is a SOFT setter: it swaps the channel's sessionId in place and persists, but does NOT call `claude.close`. To prevent the resulting prop change from re-firing the hook's main effect (which would tear down the live SDK Query mid-turn), `useClaudeSession`:
- drops `sessionId` from the main effect's deps (uses a ref for initial start)
- handles the soft echo via an `acceptedRealIdRef` guard
- handles user-initiated session switches via a separate "hard switch" effect that calls `checkAndStart()` to re-init the bridge

`ChannelHost` keys `ClaudeChannel` by `c.id` only (NOT `${c.id}-${c.sessionId}`) — the hook owns the in-place re-init.

## 6. Renderer

### 6.1 State

Zustand only — no React Context.

- **`settingsStore`** — full settings object plus `resolvedTheme`, current `view`, `chatMode`, `hydrated` flag.
- **`channelStore`** — channel list + active id + CRUD. Helpers: `addClaude(projectDir, projectKey, sessionId)`, `switchClaudeSession(channelId, newSessionId, displayName)` (calls `claude.close()` on the old session before re-mounting via key change).
- **`webviewStore`** — `reloadKey` counter for force-remounting the classic iframe.

### 6.2 Compact chat data flow (OpenClaw)

```
ChatView ──► useClawChat(gateway, token)
                │
                ▼
       window.electronAPI.ws.{send, onChatEvent, onHistory, onApproval, …}
                │
                ▼
            ws-bridge (main)
                │
                ▼
           OpenClaw gateway
```

### 6.3 Claude chat data flow

```
ClaudeChannel
  ├─ if cliMissing → <ClaudeInstallGuide onRecheck={chat.recheckCli} />
  └─ else        → <ChatView
                     messages={chat.messages}              (incl. role:'tool' for pills)
                     pendingPrompt={pendingApproval ? <ToolApprovalPrompt/>
                                  : pendingAsk     ? <AskUserQuestionPrompt/>
                                  : null}
                     onInterrupt={chat.abort}
                     ...
                   />
useClaudeSession ──► window.electronAPI.claude.{start,send,abort,close,
                                                approve,answer,onEvent,...}
                          │
                          ▼
                    claude-bridge (main) ── spawn `claude` via SDK
```

`useClaudeSession` reduces `ClaudeEvent`s into messages:
- `message-delta` / `thinking-delta` accumulate into a STREAM_ID / THINK_ID bubble; `turn-end` promotes them to stable per-turn ids so they survive into history.
- `tool-call` appends a `role: 'tool'` message with a `tool` meta object; `tool-result` mutates that message in place by `callId`, populating `output` / `isError` / `durationMs`.
- `ChatView` renders `role === 'tool'` messages via `<ToolCallPill>` (collapsed; click to expand input + output) and other messages via `<MessageBubble>`.
- `aborted` strips streaming bubbles and surfaces "[Stopped by user]" only if a turn was actually in flight (so idle close doesn't show a phantom Stop).

### 6.4 Classic mode (OpenClaw iframe)

`ChatWebView` mounts an `<iframe>` pointing at the gateway root, passing auth via URL fragment so secrets never reach the server. Chromium strips `X-Frame-Options` / `frame-ancestors` via `onHeadersReceived`. The TitleBar reload button bumps `reloadKey` to force-remount.

## 7. Channels

A **channel** is any place the user's agent talks to them. The renderer shell is a **channel bar** (`ChannelDock`, 48 px wide, left edge) plus a **channel host** (`ChannelHost`, fills the rest). Each entry in `settings.channels` becomes one of:

- `OpenClawChannel` — the existing compact / classic OpenClaw UI.
- `WebChannel` — an Electron `<webview>` with `partition="persist:channel-<id>"` and a mobile iPhone user-agent.
- `ClaudeChannel` — `ChatView` wrapping `useClaudeSession`. Each channel binds to a (project, session) pair under `~/.claude/projects/`.

All enabled channels mount once and stay mounted; the inactive ones are stacked offscreen with `position:absolute + visibility:hidden + zIndex:0` so Electron keeps painting them — `display:none` would suspend the webview's compositor and make channel switches look like the page is "still loading".

The `+` button at the bar's bottom opens `AddChannelMenu` — a popover (rendered via React Portal) that lets users re-enable any hidden built-in (Telegram / Discord / Feishu / Lark), paste a custom URL, or pick a Claude session via `ClaudeWizard` (two-step: project list → session list, with a "New session in this directory" entry). Right-clicking any channel opens `ChannelContextMenu` for rename / change icon / move / hide / delete; OpenClaw is always at index 0 and cannot be removed.

`ChannelIcon` renders three glyph styles by `kind`:
- `openclaw` → `<LobsterIcon size={26} />`
- `web` → favicon URL or emoji string from `channel.icon`
- `claude` → `<ClaudePetIcon v={claudePetVariant(projectKey + ':' + sessionId)} />` — a tiny pixel-pet variant whose body / hand / leg colours plus eye style + colour are hashed from the session key (~3.9k unique combos, all in the warm-orange family so they read as Claude sessions at a glance)

Clicking the OpenClaw channel icon while OpenClaw is the active channel toggles its internal **operator sidebar** (Overview / Approvals / Sessions / Usage / Cron / Agents / Skills / Logs / Settings). The sidebar panel + backdrop start at `left: 48 px` so the channel bar stays visible.

When a web channel is active the TitleBar gains Back / Reload buttons that drive the `<webview>` via `goBack()` / `reload()`; the webview element is exposed through `channelStore.activeWebview`. When a Claude channel is active, the title bar shows the project pwd in mono font, and the Stop button (square icon while typing) calls `chat.abort()` for graceful per-turn interrupt.

## 8. Pet window

`pet-window.ts` owns an optional always-on-top `BrowserWindow` (100 × 110, transparent, frameless). Mascot kind is selectable: `petKind: 'lobster'` shows the OpenClaw lobster, `'claude'` shows a chunky pixel-art critter inspired by the official Claude pixel sticker (square orange body, two black square eyes, two side hands, four chunky legs). Both pets share the same `.left-claw` / `.right-claw` CSS animation hooks.

Spawn lazily — only if `settings.petVisible !== false`. UI:

- Right-click pet → "Show Chat", "Settings", "Switch Pet" submenu (radio: OpenClaw 🦞 / Claude Code ✦), "Hide Pet", "Quit ClawBar".
- Right-click tray → "Settings", "Hide Pet" / "Show Pet", "Switch Pet" submenu, "Quit ClawBar".

Both surfaces write through `setSetting('petKind' | 'petVisible', …)` to `~/.clawbar/settings.json`. `PetApp.tsx` polls `settings:get` every 2 s so a tray-menu change reflects in the live pet without an IPC event channel. Drag works via `pet:drag`; `pet:drag-end` resets the captured offset between drag sessions.

## 9. Window

Frameless `BrowserWindow`. Position rules:

1. First open → place near the tray icon.
2. After drag/resize → persist to `~/.clawbar/window-bounds.json` and restore.
3. If the saved position is off-screen (display config changed), fall back to the tray anchor.

`positionNearTray()` clamps the window inside the current display's `workArea` and flips above the tray when there's not enough room below — on Windows the tray usually sits at the bottom of the screen, so the popover is rendered **above** the tray.

`webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: true` (needed for channel hosting).

macOS-only knobs (`vibrancy: 'popover'`, `visualEffectState: 'active'`, `app.dock?.hide()`) are applied only when `process.platform === 'darwin'`. On Windows the window has a standard opaque background and gets an `icon` option so alt-tab / task-manager show the lobster.

## 10. Build

| Tool             | Input               | Output                                    |
|------------------|---------------------|-------------------------------------------|
| Vite             | `index.html`, `pet.html` | `dist/`                              |
| `tsc -p tsconfig.node.json` | `electron/*.ts`, `shared/*.ts` | `dist-electron/electron/`, `dist-electron/shared/` (CommonJS) |
| electron-builder | `dist/`, `dist-electron/`, `resources/` | `release-artifacts/*.dmg` (macOS), `release-artifacts/*.exe` (Windows NSIS + portable) |

`tsconfig.node.json` uses `rootDir: "."` and `include: ["electron", "shared"]` so the main process can import shared event types directly. As a consequence the compiled main entry lives at `dist-electron/electron/main.js`, and `package.json`'s `"main"` field points there. Renderer assets in `index.html` are loaded via `path.join(__dirname, '../../dist/index.html')` from the main process.

Release CI (`.github/workflows/release.yml`) runs two parallel jobs — macOS arm64 on `macos-14`, Windows x64 on `windows-latest` — then a `release` job downloads both artifacts and publishes them to a single GitHub Release. Triggered by pushing a `v*` tag.

## 11. Packaging — BYO-CLI

The Claude Agent SDK ships its own Claude Code implementation as a platform-specific optional npm package (`@anthropic-ai/claude-agent-sdk-darwin-arm64`, `…-linux-x64`, `…-win32-x64`, etc.) — each ~205 MB. We never bundle it; the user's installed `claude` binary is invoked via `pathToClaudeCodeExecutable`. `electron-builder.yml` excludes:

```yaml
files:
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**/*"      # 205 MB platform pkg
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk/bridge.mjs"  # alt entry, unused
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk/assistant.mjs"
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk/browser-sdk.js"
  - "!**/node_modules/@anthropic-ai/claude-agent-sdk/manifest*.json"
  - …
```

Net DMG delta vs bundling: roughly **−205 MB**, +~16 MB for the SDK's own JS (`sdk.mjs`) plus transitive deps (`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `zod`). The shipped DMG is around 109 MB.

Code signing is wired (`build/entitlements.mac.plist`, `hardenedRuntime: true`, `pack:mac:dmg:arm64:release` script + `scripts/notarize-dmg.mjs`) but requires a Developer ID certificate + App Store Connect API key in `.env` (see `.env.mac-signing.example`). Without those, the unsigned DMG falls back to the right-click → Open / `xattr -dr com.apple.quarantine` Gatekeeper bypass.

## 12. Security

- `contextIsolation`, `sandbox`, `nodeIntegration: false` (renderer can't reach Node).
- `settings:set` whitelists the keys it accepts (`petKind` and `petVisible` are in the list).
- Auth tokens travel in the URL fragment when embedding the OpenClaw UI — fragments aren't sent to servers.
- Ed25519 private key never leaves the main process.
- Claude bridge spawns the user's `claude` binary in `cwd: projectDir`; the SDK respects the user's existing `~/.claude/settings.json` allow / deny lists. Anything not pre-approved surfaces as an inline approval card; nothing is auto-allowed beyond what the bundled binary's safety rules already permit.

## 13. Platform notes

**Tray icon.** macOS uses a 18 px template (monochrome) PNG so it auto-adapts to light / dark menu bars. Windows uses the colored `resources/icon.png` at 16 px.

**Tray tooltip / menu.** Same code path on both platforms.

**Popover positioning.** macOS — popover drops below tray. Windows — `positionNearTray()` flips above and clamps inside `workArea`.

**Window chrome.** `vibrancy` is macOS-only.

**Pet window.** `transparent + frameless + alwaysOnTop` works on both. `focusable: false` keeps it out of alt-tab.

**Packaging.** macOS produces `.dmg` (arm64 default). Windows produces NSIS installer + self-extracting portable. Neither is code-signed by default; users bypass Gatekeeper / SmartScreen on first launch.

**Claude CLI detection.** macOS only ships in releases. Windows fallback is `cli-missing`; the `where claude` equivalent isn't wired yet — tracked as future work. The renderer hook gracefully shows the install guide on either platform when no `claude` binary is found.
