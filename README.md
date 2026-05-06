# 🦞 ClawBar

A menu-bar / system-tray app for [OpenClaw](https://github.com/nicepkg/openclaw), on **macOS** and **Windows**. Your agent reaches you through many channels — Telegram, Discord, Feishu, Lark, its own web chat, custom integrations, **and your local Claude Code sessions** — and ClawBar puts every one of those channels in a single bar, sitting in the macOS menu bar or the Windows system tray. **A bar in a bar.**

## Features

- **One bar, every channel** — A 48 px sidebar lists every way you talk to your agents: OpenClaw native chat, Telegram / Discord / Feishu / Lark, any custom URL, and local Claude Code sessions.
- **Built-in IM channels** — Telegram, Discord, Feishu, Lark out of the box. Click `+` to add wherever else your bot lives.
- **Operator panel for OpenClaw** — Click the lobster again to open a sidebar with 10 views: Overview, Chat, Approvals, Sessions, Usage, Cron, Agents, Skills, Logs, Settings.
- **Local Claude Code sessions** — Pick a project from `~/.claude/projects`, resume any past session or start a new one. The conversation lands in the bar with streaming text, expandable tool-call pills (Bash / Edit / Read / Glob / Grep / Thinking — click to see input + output), inline keyboard-driven approval prompts (`1` / `2` / `3` / `↑↓⏎` / `Esc`), and option-list cards for the model's `AskUserQuestion` tool. Real Esc-style abort: Stop cancels the current turn but keeps the SDK process alive for your next message.
- **Persistent logins** — Each web channel runs in its own Electron `<webview>` partition; scan the QR or sign in once and you're set.
- **Mobile-optimised** — Web channels report a phone user-agent so they render their compact mobile layouts inside the narrow menu-bar window.
- **Browser-style controls** — Back / Reload buttons in the title bar when a web channel is active.
- **Secure WebSocket auth** — Ed25519 device identity for talking to the OpenClaw gateway. Tokens never leave the main process.
- **Frameless popover** — vibrancy background, resizable, draggable, optional always-on-top.
- **Optional desktop pet** — A draggable mascot that doubles as a click-to-toggle shortcut. Switch between the OpenClaw lobster 🦞 and a pixel-art Claude critter ✦ via the tray or pet right-click menu. Hide / show, persisted across launches.
- **Light / dark theme** — follows macOS or override per app.
- **No telemetry** — no analytics, no phone-home. The OpenClaw bridge only talks to the gateway URL you configure; the Claude channel only spawns your installed `claude` binary locally.

## Install (pre-built)

Head to the [Releases page](https://github.com/june9593/clawbar/releases) and grab the file for your OS.

### macOS (Apple Silicon)

1. Download [`ClawBar-0.4.7-mac-arm64.dmg`](https://github.com/june9593/clawbar/releases/download/v0.4.7/ClawBar-0.4.7-mac-arm64.dmg).
2. Open it and drag **ClawBar** into `/Applications`.
3. **First launch** — the app isn't code-signed, so Gatekeeper will block it once. Pick one:
   - Finder → **right-click `ClawBar.app` → Open**, then click **Open** in the warning dialog.
   - Or run once in Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/ClawBar.app
     ```

The mascot icon appears in the **macOS menu bar**. Click it to toggle the popover.

### Windows (x64)

1. Download [`ClawBar-0.4.7-win-x64.exe`](https://github.com/june9593/clawbar/releases/download/v0.4.7/ClawBar-0.4.7-win-x64.exe) (NSIS installer).
2. Double-click to install. **SmartScreen** warns because the installer is **not code-signed** — click **More info → Run anyway**.
3. Launch from the Start Menu or desktop shortcut.

The lobster icon appears in the **Windows system tray** (notification area). Left-click to toggle the popover, right-click for Settings / Show Pet / Quit. On Windows 11 the icon may start hidden in the overflow flyout — drag it onto the main taskbar to pin it.

## Quick Start (from source)

### Prerequisites

- **macOS 12+** (Monterey or later) or **Windows 10 / 11**
- Node.js 20+
- (Optional) A reachable [OpenClaw](https://github.com/nicepkg/openclaw) gateway, default `http://localhost:18789`
- (Optional, only if you want to use Claude Code as a channel) The
  [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/cli-reference)
  installed on your system. ClawBar runs your installed `claude` binary
  via `pathToClaudeCodeExecutable` — it does NOT bundle one. If `claude`
  is missing, the Claude channel shows an install guide.

### Install & run

```bash
git clone https://github.com/june9593/clawbar.git
cd clawbar
npm install
npm run dev:electron
```

### Development

```bash
npm run dev               # Vite dev server (renderer only, port 5173)
npm run dev:electron      # Build electron main + launch app
npm run build             # Production build (vite + tsc)

# Type checking
npx tsc --noEmit                          # renderer
npx tsc -p tsconfig.node.json --noEmit    # main process

# Packaging — macOS
npm run pack:mac:dmg:arm64     # Apple Silicon DMG
npm run pack:mac:dmg:x64       # Intel DMG

# Packaging — Windows (run on a Windows host)
npm run pack:win               # NSIS installer + portable exe
npm run pack:win:nsis          # NSIS installer only
npm run pack:win:portable      # portable exe only
```

> Cross-compiling a Windows build from macOS / Linux isn't supported here — run `pack:win*` on a Windows machine (or use the Windows job in the GitHub Actions release workflow).

## Channels

A **channel** in ClawBar is any place your agent talks to you — its native web chat, an IM bot, a custom integration, or your local Claude Code CLI. The channel bar (the 48 px sidebar) lists every one of them.

| Channel | Notes |
|---|---|
| **OpenClaw** | The default first channel. Cannot be deleted. Click its icon to toggle the operator sidebar. |
| **Telegram** | Loads `web.telegram.org`. Where your OpenClaw Telegram bot lives. |
| **Discord** | Loads `discord.com/app`. Where your OpenClaw Discord bot lives. |
| **飞书 / Lark** | Routes through the official `accounts.*` login flow, redirects to messages after auth. |
| **Custom** | Click `+` → paste any URL where you've wired up your OpenClaw integration. Favicon and hostname auto-populate. |
| **Claude Code** | Click `+` → "Claude Code session" → pick project + session (resume) or start a new one. Drives your installed `claude` binary via the [Claude Agent SDK](https://docs.claude.com/en/docs/claude-code/sdk). Tool calls, approvals, and AskUserQuestion render as inline cards. Each session gets a unique pixel-pet icon (body / hand / leg colour, eye style hashed from the project + session id). |

Each web channel keeps its own cookies and localStorage in `persist:channel-<id>`. The Claude channel reads / writes the standard Claude Code session files under `~/.claude/projects/<project-key>/<session-id>.jsonl`.

## Configuration

Settings live at `~/.clawbar/settings.json`. Device identity (Ed25519 keypair, used for OpenClaw auth) lives at `~/.clawbar/device-identity.json`.

| Setting | Default | Description |
|---|---|---|
| `gatewayUrl` | `http://localhost:18789` | OpenClaw gateway address |
| `authMode` | `none` | `none`, `token`, or `password` |
| `chatMode` | `compact` | OpenClaw UI: `compact` (native WS chat) or `classic` (iframe of OpenClaw web UI) |
| `theme` | `system` | `light`, `dark`, or `system` |
| `hideOnClickOutside` | `false` | Auto-hide window when focus moves elsewhere |
| `petVisible` | `true` | Show the desktop pet mascot |
| `petKind` | `lobster` | Mascot kind: `lobster` (OpenClaw 🦞) or `claude` (Claude pixel critter ✦). Switched via tray / pet right-click → "Switch Pet". |
| `channels` | (5 built-in) | Channel list (rendered in the dock). User-added Claude sessions append `kind: 'claude'` entries. |
| `activeChannelId` | `openclaw` | Last-active channel restored on launch |

## Architecture

```
Main process (electron/)
├── Tray + frameless BrowserWindow (vibrancy: popover)
├── Optional pet window (lobster or Claude pixel critter)
├── Settings IPC          (settings.json read/write)
├── WS Bridge             (single WebSocket → IPC fan-out, Ed25519 auth)
└── Claude Bridge         (per-channel SDK Query, canUseTool callback,
                           drives user's installed `claude` via SDK
                           pathToClaudeCodeExecutable; BYO-CLI policy)

Renderer (src/)
├── TitleBar              (back/reload, pin, settings)
├── ChannelDock           (48 px icon column + + button)
└── ChannelHost
    ├── OpenClawChannel   (CompactChat / ChatWebView + 10-view sidebar)
    ├── WebChannel × N    (Electron <webview> per channel, persistent partition)
    └── ClaudeChannel     (ChatView + ClaudeInstallGuide / ToolCallPill /
                           ToolApprovalPrompt / AskUserQuestionPrompt)

Shared (shared/)
└── claude-events.ts      (ClaudeEvent discriminated union — IPC contract
                           between main and renderer for the Claude bridge)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full diagram, IPC channel table, Claude bridge details, and WebSocket bridge details.

## License

MIT

