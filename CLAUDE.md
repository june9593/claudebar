# ClawBar

macOS menu bar **multi-IM hub** — a 48 px channel dock on the left switches between OpenClaw (native WebSocket chat or classic iframe + 10-view operator panel) and any number of web-based IM channels (Telegram, Discord, Feishu, Lark, or user-added URLs). Each web channel runs in its own Electron `<webview>` with a persistent partition so logins survive restarts. Web channels use a mobile UA so IM apps render their phone layouts in the narrow popover window.

## Commands

```bash
npm run dev              # Vite dev server (renderer only, port 5173)
npm run dev:electron     # Build electron + launch app
npm run build            # Production build (Vite + tsc)
npm run build:electron   # Compile electron/ → dist-electron/
npx tsc --noEmit         # Type-check renderer
npx tsc -p tsconfig.node.json --noEmit  # Type-check main process
npm run pack:mac:dmg:arm64  # Package macOS DMG (Apple Silicon)
```

## Conventions

- **No hardcoded colors** — all colors via CSS variables in `src/styles/globals.css`
- **IPC channels** — `domain:action` format (e.g. `settings:get`, `ws:connect`)
- **New IPC** — add handler in `electron/ipc/` or `electron/ws-bridge.ts` → expose in `electron/preload.ts` → type in `types/electron.d.ts`
- **Security** — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: true` (needed for channel hosting)
- **State** — Zustand stores, no React Context
- **Icons** — Lucide React only (`lucide-react`), size 18, strokeWidth 1.75
- **WS protocol** — OpenClaw custom framing (`type:"req"`, NOT JSON-RPC)
- **Webview visibility** — inactive channels use `visibility:hidden + position:absolute` rather than `display:none`, so Electron keeps painting them and channel switches stay instant
- **No new runtime deps without strong reason** — current set is `@noble/ed25519`, `lucide-react`, `react`, `react-dom`, `ws`, `zustand`

## Architecture

- **Main process**: `electron/` — Tray, BrowserWindow, IPC, settings, WS bridge (`ws-bridge.ts` with Ed25519 auth), pet window (show/hide persisted via `petVisible` setting)
- **Renderer**: `src/` — React app: `App.tsx` mounts `TitleBar` + `ChannelDock` + `ChannelHost` (which renders all enabled channels at once and toggles visibility)
- **Channel dock** — `ChannelDock` lists channels from `channelStore`. Right-click for rename/move/hide/delete. + button opens `AddChannelMenu` for built-in toggle / custom URL.
- **WS Bridge**: Main-process WebSocket → IPC relay → renderer hook (`useClawChat.ts`). Used only by the OpenClaw channel.
- **Web channels**: Each `WebChannel` mounts an Electron `<webview>` with `partition="persist:channel-<id>"` and a mobile iPhone user-agent.
- **OpenClaw operator sidebar** — Toggled by clicking the OpenClaw dock icon when OpenClaw is already active. Sidebar panel + backdrop start at `left: 48px` so the dock stays clickable.

See `docs/ARCHITECTURE.md` for the full system diagram, IPC channel table, and WebSocket bridge details.
