# 🦞 ClawBar

A macOS menu-bar **multi-IM hub** that puts your [OpenClaw](https://github.com/nicepkg/openclaw) agent, Telegram, Discord, Feishu, Lark — and any other web app — one click away from the menu bar. No Dock clutter, no app-switcher dance.

## Features

- **Channel Dock** — A 48 px sidebar lists OpenClaw plus any web channels you add. Each channel runs in its own Electron `<webview>` with a persistent partition, so logins survive across launches.
- **Built-in IM channels** — Telegram, Discord, Feishu, Lark out of the box. Add any URL via the `+` button.
- **Mobile-optimised** — Web channels report a phone user-agent so they render their compact mobile layouts inside the narrow menu-bar window.
- **OpenClaw operator panel** — Click the OpenClaw icon to open a sidebar with 10 views: Overview, Chat, Approvals, Sessions, Usage, Cron, Agents, Skills, Logs, Settings.
- **Browser-style controls** — Back / Reload buttons in the title bar when a web channel is active.
- **Secure WebSocket auth** — Ed25519 device identity for talking to OpenClaw. Tokens never leave the main process.
- **Frameless popover** — vibrancy background, resizable, draggable, optional always-on-top.
- **Optional desktop pet** — A draggable lobster mascot that doubles as a click-to-toggle shortcut. Hide / show from the tray menu, persisted across launches.
- **Light / dark theme** — follows macOS or override per app.
- **No telemetry** — no analytics, no phone-home. The OpenClaw bridge only talks to the gateway URL you configure.

## Install (pre-built DMG)

Grab the latest `.dmg` from the [Releases page](https://github.com/june9593/clawbar/releases), open it, and drag **ClawBar** into `/Applications`.

> **The app isn't code-signed**, so macOS Gatekeeper will block the first launch. Pick one:
>
> - In Finder, **right-click `ClawBar.app` → Open**, then click **Open** in the warning dialog (one time only).
> - Or paste this once in Terminal:
>   ```bash
>   xattr -dr com.apple.quarantine /Applications/ClawBar.app
>   ```

## Quick Start (from source)

### Prerequisites

- macOS 12+ (Monterey or later)
- Node.js 20+
- (Optional) A reachable [OpenClaw](https://github.com/nicepkg/openclaw) gateway, default `http://localhost:18789`

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

# Package as DMG (Apple Silicon)
npm run pack:mac:dmg:arm64
```

## Channels

| Channel | Notes |
|---|---|
| **OpenClaw** | The default first channel. Cannot be deleted. Click its icon to toggle the operator sidebar. |
| **Telegram** | Loads `web.telegram.org`. Scan QR or use phone number. |
| **Discord** | Loads `discord.com/app`. Login with email/password or QR. |
| **飞书 / Lark** | Routes through the official `accounts.*` login flow, redirects to messages after auth. |
| **Custom** | Click `+` → paste any URL. Favicon and hostname auto-populate. Right-click → Rename / Change icon / Move / Delete. |

Each channel keeps its own cookies and localStorage in `persist:channel-<id>`.

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
| `channels` | (5 built-in) | Channel list (rendered in the dock) |
| `activeChannelId` | `openclaw` | Last-active channel restored on launch |

## Architecture

```
Main process (electron/)
├── Tray + frameless BrowserWindow (vibrancy: popover)
├── Optional pet window (floating mascot)
├── Settings IPC          (settings.json read/write)
└── WS Bridge             (single WebSocket → IPC fan-out, Ed25519 auth)

Renderer (src/)
├── TitleBar              (back/reload, pin, settings)
├── ChannelDock           (48 px icon column + + button)
└── ChannelHost
    ├── OpenClawChannel   (CompactChat / ChatWebView + 10-view sidebar)
    └── WebChannel × N    (Electron <webview> per channel, persistent partition)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full diagram, IPC channel table, and WebSocket bridge details.

## License

MIT
