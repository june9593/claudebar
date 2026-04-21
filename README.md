# 🦞 ClawBar

macOS menu bar chat client for [OpenClaw](https://github.com/nicepkg/openclaw) — talk to your self-hosted lobster without installing Feishu, Discord, or Teams.

## Features

- **Menu Bar Native** — Click the 🦞 icon in your macOS menu bar to open/close the chat window
- **Beautiful Chat UI** — Markdown rendering, code syntax highlighting, copy button
- **Flexible Window** — Resize, drag, pin (always-on-top)
- **OpenClaw Integration** — Connects to your local OpenClaw instance via CLI
- **Dark/Light Theme** — Follows system appearance or manual override
- **Session Management** — Switch between chat sessions and agents

## Quick Start

### Prerequisites

- macOS 12+ (Monterey or later)
- [OpenClaw](https://github.com/nicepkg/openclaw) installed and running locally
- Node.js 20+

### Install & Run

```bash
git clone https://github.com/user/clawbar.git
cd clawbar
npm install
npm run build
npm run dev:electron
```

### Development

```bash
# Start Vite dev server (renderer only)
npm run dev

# Build electron main process + launch app
npm run dev:electron

# Type check
npx tsc --noEmit                          # renderer
npx tsc -p tsconfig.node.json --noEmit    # main process

# Production build
npm run build

# Package as DMG
npm run pack:mac:dmg:arm64    # Apple Silicon
npm run pack:mac:dmg:x64      # Intel
```

## Configuration

On first launch, ClawBar will auto-detect the `openclaw` CLI in your PATH. You can customize the CLI path in Settings (⚙️).

Settings are saved to `~/.clawbar/settings.json`.

| Setting | Default | Description |
|---------|---------|-------------|
| CLI Path | `openclaw` | Path to the openclaw CLI executable |
| Theme | System | `light`, `dark`, or `system` |
| Hide on click outside | Off | Auto-hide window when clicking outside |
| Font size | 13px | Chat text size |

## Architecture

```
Electron Main Process
├── Tray Icon (menu bar)
├── BrowserWindow (frameless, vibrancy)
└── IPC Handlers
    ├── openclaw CLI executor
    ├── Session manager
    └── Settings store

Renderer Process (React)
├── TitleBar (drag, pin, settings)
├── ChatPanel
│   ├── MessageList (auto-scroll)
│   ├── MessageBubble (Markdown + code)
│   └── ChatInput (Enter/Shift+Enter)
├── SessionSwitcher
└── SettingsPanel
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Documentation

- [Product Requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)

## License

MIT
