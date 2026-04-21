# 🦞 ClawBar

macOS menu bar chat client and management dashboard for [OpenClaw](https://github.com/nicepkg/openclaw). One click in your menu bar pops up a floating window with native chat plus a full operator panel — sessions, approvals, agents, skills, cron jobs, usage, logs.

## Features

- **Menu Bar Native** — 🦞 tray icon, click to toggle the popover window
- **Two Chat Modes** — Compact (native WebSocket UI) or Classic (embedded OpenClaw Control UI iframe)
- **Operator Panel** — Sidebar with 10 views: Overview, Chat, Approvals, Sessions, Usage, Cron, Agents, Skills, Logs, Settings
- **Secure Auth** — Ed25519 device identity + token/password auth to the gateway
- **Resize, Drag, Pin** — Frameless `popover` vibrancy window
- **Light / Dark Theme** — Follows system or manual override
- **Desktop Pet** — Optional floating 🦞 mascot window

## Install (pre-built DMG)

Download the latest `.dmg` from the [Releases page](https://github.com/june9593/clawbar/releases), open it and drag **ClawBar** to `/Applications`.

> **Heads up — the app is not code-signed.** macOS Gatekeeper will refuse to launch it the first time. Either:
>
> - In Finder, **right-click `ClawBar.app` → Open**, then click **Open** in the warning dialog. (Only needed once.)
> - Or run in Terminal:
>   ```bash
>   xattr -dr com.apple.quarantine /Applications/ClawBar.app
>   ```

## Quick Start (from source)

### Prerequisites

- macOS 12+ (Monterey or later)
- A reachable [OpenClaw](https://github.com/nicepkg/openclaw) gateway (default `http://localhost:18789`)
- Node.js 20+

### Install & Run

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

# Package as DMG
npm run pack:mac:dmg:arm64    # Apple Silicon
npm run pack:mac:dmg:x64      # Intel
```

## Configuration

Open Settings (⚙️ in title bar) on first launch to point ClawBar at your gateway and pick an auth method.

Settings persist to `~/.clawbar/settings.json`. Device identity (Ed25519 keypair) lives at `~/.clawbar/device-identity.json`.

| Setting | Default | Description |
|---------|---------|-------------|
| Gateway URL | `http://localhost:18789` | OpenClaw gateway address |
| Auth Mode | `none` | `none`, `token`, or `password` |
| Chat Mode | `compact` | `compact` (native WS) or `classic` (iframe) |
| Theme | `system` | `light`, `dark`, or `system` |
| Hide on click outside | Off | Auto-hide window when focus moves elsewhere |

## Architecture (high level)

```
Main process (electron/)
├── Tray + BrowserWindow (frameless, vibrancy: popover)
├── Settings IPC      (settings.json read/write)
└── WS Bridge         (single WebSocket → IPC fan-out, Ed25519 auth)

Renderer (src/)
├── TitleBar
├── Sidebar (10 views)
├── CompactChat → ChatView (native WS UI)
└── ChatWebView (classic iframe embed)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for IPC channel definitions and the full system diagram.

## License

MIT
