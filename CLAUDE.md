# ClawBar

macOS menu bar chat client and management dashboard for OpenClaw. Dual-mode: compact native WebSocket chat + classic iframe embed of the OpenClaw Control UI. Left sidebar with 10 views (Overview, Chat, Approvals, Sessions, Usage, Cron, Agents, Skills, Logs, Settings).

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
- **Security** — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- **State** — Zustand stores, no React Context
- **Icons** — Lucide React only (`lucide-react`), size 18, strokeWidth 1.75
- **WS protocol** — OpenClaw custom framing (`type:"req"`, NOT JSON-RPC)

## Architecture

- **Main process**: `electron/` — Tray, BrowserWindow, IPC, settings, WS bridge (`ws-bridge.ts` with Ed25519 auth)
- **Renderer**: `src/` — React app with TitleBar, Sidebar, 10 view components, SettingsPanel
- **WS Bridge**: Main-process WebSocket → IPC relay → renderer hook (`useClawChat.ts`)
- **Classic mode**: iframe loads `http://<gateway>:18789/` with CSP header stripping
- **Compact mode**: Native WS chat via `ws:connect/send/status/history/chat-event/approval` IPC channels

See `docs/ARCHITECTURE.md` for the full system diagram and `docs/PRD.md` for product requirements.
