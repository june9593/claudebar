# ClawBar

macOS menu bar chat client for OpenClaw. Embeds the OpenClaw Control UI chat page in a frameless Electron popover window with Tray icon, resize/drag/pin support, and configurable Gateway URL + auth.

## Commands

```bash
npm run dev              # Vite dev server (renderer only, port 5173)
npm run dev:electron     # Build electron + launch app
npm run build            # Production build (Vite + tsc)
npm run build:electron   # Compile electron/ → dist-electron/
npx tsc --noEmit         # Type-check renderer
npx tsc -p tsconfig.node.json --noEmit  # Type-check main process
npm run pack:mac:dmg:arm64  # Package macOS DMG (Apple Silicon)
npm test                 # Run unit tests
```

## Conventions

- **No hardcoded colors** — all colors via CSS variables in `src/styles/globals.css`
- **IPC channels** — `domain:action` format (e.g. `settings:get`, `window:toggle-pin`)
- **New IPC** — add handler in `electron/ipc/` → expose in `electron/preload.ts` → type in `types/electron.d.ts`
- **Security** — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- **State** — Zustand stores, no React Context
- **CLI calls** — `spawn` only (never `exec`), args as array

## Architecture

- **Main process**: `electron/` — Tray, BrowserWindow, IPC, settings persistence
- **Renderer**: `src/` — React app with TitleBar + ChatWebView (iframe to OpenClaw) + SettingsPanel
- **OpenClaw integration**: iframe loads `http://<gateway>:18789/` with token/password via URL fragment
- **Electron strips** `X-Frame-Options` and `frame-ancestors` CSP from OpenClaw responses

## Agent Protocol

See `AGENTS.md` for roles. Agent definitions in `.claude/agents/`.

### File Ownership

| Owner | Writable |
|-------|----------|
| pm-agent | `docs/PRD.md` |
| designer-agent | `docs/DESIGN.md`, `docs/design-tokens.json` |
| dev-agent | `electron/`, `src/`, `types/`, config files |
| tester-agent | `tests/`, `scripts/test-*.py` |
| Orchestrator | `AGENTS.md`, `progress.json`, `CLAUDE.md` |
| Nobody modifies | `docs/ARCHITECTURE.md` (orchestrator only) |
