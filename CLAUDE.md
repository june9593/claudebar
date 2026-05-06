# ClawBar

A macOS / Windows **menu-bar / system-tray app for OpenClaw**. Your OpenClaw agent reaches you through many channels (its native web chat, IM bots in Telegram / Discord / Feishu / Lark, custom integrations); ClawBar puts every one of those channels in a single 48 px channel bar inside the popover. Bar in a bar — both the channel bar inside the app and the macOS menu bar housing the app.

ClawBar also hosts your **local Claude Code sessions** as a third channel kind: pick a project under `~/.claude/projects`, resume any past session or start a new one, and the conversation lands in the bar with streaming text, expandable tool-call pills, inline tool-approval prompts, and AskUserQuestion option lists. The bridge drives the user's installed `claude` binary via the official Claude Agent SDK's `pathToClaudeCodeExecutable` (BYO-CLI; no bundled fork).

The OpenClaw channel itself supports two UI modes (native WebSocket chat or classic iframe of the gateway's web UI) and exposes a 10-view operator panel (Overview / Approvals / Sessions / Usage / Cron / Agents / Skills / Logs / Settings) by re-clicking its icon. The other built-in channels are Electron `<webview>`s with a persistent partition + iPhone user-agent so IM apps render their phone layouts in the narrow popover.

## Commands

```bash
npm run dev              # Vite dev server (renderer only, port 5173)
npm run dev:electron     # Build electron + launch app
npm run build            # Production build (Vite + tsc)
npm run build:electron   # Compile electron/ + shared/ → dist-electron/
npx tsc --noEmit         # Type-check renderer
npx tsc -p tsconfig.node.json --noEmit  # Type-check main process
npm run pack:mac:dmg:arm64          # Local DMG (Apple Silicon, unsigned)
npm run pack:mac:dmg:arm64:release  # Signed + notarized DMG (needs .env, see PR #1)
CLAWBAR_TRACE=1 npm run dev:electron  # Dump every Claude SDK message to ~/.clawbar/sdk-trace.jsonl
```

## Conventions

- **No hardcoded colors** — all colors via CSS variables in `src/styles/globals.css`
- **IPC channels** — `domain:action` format (e.g. `settings:get`, `ws:connect`, `claude:start`)
- **New IPC** — add handler in `electron/ipc/` or a bridge module → expose in `electron/preload.ts` → type in `types/electron.d.ts`. Cross-process types (event payloads etc.) live in `shared/` and are imported by both processes — `tsconfig.node.json` has `rootDir: "."` and `include: ["electron", "shared"]` for this reason
- **Security** — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: true` (needed for channel hosting)
- **State** — Zustand stores, no React Context
- **Icons** — Lucide React only (`lucide-react`), size 18, strokeWidth 1.75
- **WS protocol** — OpenClaw custom framing (`type:"req"`, NOT JSON-RPC)
- **Webview visibility** — inactive channels use `visibility:hidden + position:absolute` rather than `display:none`, so Electron keeps painting them and channel switches stay instant
- **Claude SDK = BYO-CLI** — we drive the user's `claude` binary; never bundle it. The SDK's bundled platform package (`@anthropic-ai/claude-agent-sdk-darwin-arm64` etc., ~205 MB) is excluded from the DMG via `electron-builder.yml` `files` pattern
- **Shell env hydration for Claude bridge** — macOS launchd-launched apps inherit a clean env (no `.zshrc`). `electron/shell-env.ts` parses `~/.zshrc` / `~/.zprofile` / `~/.bashrc` etc. DIRECTLY (regex against `export KEY=VAL` lines, no shell spawn) at app boot, allowlisted to `ANTHROPIC_*` / `CLAUDE_*`. The Claude bridge merges this onto `process.env` before passing `env:` to SDK `query()`. Do NOT try to `zsh -lc` / `-ilc` / `source ~/.zshrc` — all three were tried and fail (see `electron/shell-env.ts` header comment for the trail of failed approaches). Diagnostic log at `~/.clawbar/auth-debug.log` (key names only, no values)
- **Resume only on real `.jsonl`** — for "new session" channels the renderer mints a placeholder UUID for stable dock identity, but the bridge MUST NOT pass it as SDK `resume:` (would silently hang the turn). `openQuery` checks `fs.existsSync(~/.claude/projects/<key>/<id>.jsonl)` first. The SDK's `system/init` event reports the real session id, which gets mirrored back into the channel store via `setRealSessionId` (soft setter — no `claude:close`, no remount) so the next idle-reopen passes a `resume:` that exists
- **No new runtime deps without strong reason** — current set: `@anthropic-ai/claude-agent-sdk`, `@noble/ed25519`, `lucide-react`, `react`, `react-dom`, `ws`, `zustand`

## Architecture

- **Main process**: `electron/` — Tray, BrowserWindow, IPC, settings, WS bridge (`ws-bridge.ts` with Ed25519 auth), Claude bridge (`claude-bridge.ts` with SDK `query()` + per-channel ActiveSession), pet window (mascot kind selectable via `petKind` setting; visibility persisted via `petVisible`)
- **Renderer**: `src/` — React app: `App.tsx` mounts `TitleBar` + `ChannelDock` + `ChannelHost` (which renders all enabled channels at once and toggles visibility)
- **Channel kinds**: `openclaw`, `web`, `claude` (discriminated union in `src/types/index.ts`). `ChannelHost` routes by kind to `OpenClawChannel`, `WebChannel`, or `ClaudeChannel`
- **Channel dock** — `ChannelDock` lists channels from `channelStore`. Right-click for rename/move/hide/delete. + button opens `AddChannelMenu` for built-in toggle / custom URL / Claude session picker
- **WS Bridge**: Main-process WebSocket → IPC relay → renderer hook (`useClawChat.ts`). Used only by the OpenClaw channel
- **Claude Bridge**: Main-process SDK `query()` per channel. `canUseTool` callback bridges every tool permission check + AskUserQuestion to the renderer via `claude:event` IPC. `permissionMode: 'default'` so the bundled binary forwards permission requests via stdio (auto-added `--permission-prompt-tool stdio`); `bypassPermissions` would skip the callback entirely. Idle close after 30 min of inactivity, transparent reopen with `resume: sessionId` on next message — but only when the `.jsonl` actually exists; otherwise the SDK creates a fresh session and the canonical id flows back via `setRealSessionId`. Each `query()` call merges `getShellAuthEnv()` onto `process.env` so the spawned `claude` sees `ANTHROPIC_AUTH_TOKEN` even when ClawBar was launched from Finder. CLI path resolved via `commonClaudePaths()` direct probe before falling back to `zsh -lc 'command -v claude'` — `-i` interactive hangs without a TTY under Node spawn
- **Web channels**: Each `WebChannel` mounts an Electron `<webview>` with `partition="persist:channel-<id>"` and a mobile iPhone user-agent
- **OpenClaw operator sidebar** — Toggled by clicking the OpenClaw dock icon when OpenClaw is already active. Sidebar panel + backdrop start at `left: 48px` so the dock stays clickable
- **Pet** — `electron/pet-window.ts` owns the floating mascot window. `src/pet/` has `LobsterPet.tsx` and `ClaudePet.tsx`; `PetApp.tsx` polls `petKind` setting every 2s and renders accordingly. Tray right-click + pet right-click both expose a "Switch Pet" submenu

See `docs/ARCHITECTURE.md` for the full system diagram, IPC channel table, and Claude bridge / WebSocket bridge details.
