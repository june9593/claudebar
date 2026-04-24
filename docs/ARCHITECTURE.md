# ClawBar — Architecture

> 版本: v2.3 — 2026-04-24

## 1. Overview

ClawBar is a frameless Electron app **for OpenClaw**, running on **macOS** (as a menu-bar popover) and **Windows** (as a system-tray popover). The user's OpenClaw agent is reachable through several **channels** — its own web chat, IM bots (Telegram / Discord / Feishu / Lark), custom integrations — and ClawBar collects every one of those channels into a 48 px channel bar on the left edge of the popover. The first channel is OpenClaw's native WebSocket UI (or, alternatively, an embedded iframe of the gateway's own web client); the rest are Electron `<webview>` tags with persistent partitions.

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
│  │  ├─ Optional pet window (floating mascot)        │   │
│  │  ├─ Settings IPC  (~/.clawbar/settings.json)     │   │
│  │  └─ WS Bridge     (single ws → IPC fan-out,      │   │
│  │                    Ed25519 device identity)      │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │ contextBridge IPC                │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │ Renderer (Chromium)                              │   │
│  │  React 19 + Zustand + Tailwind                   │   │
│  │                                                  │   │
│  │  TitleBar │ Sidebar (10 views)                   │   │
│  │           │  ├─ Chat → CompactChat → ChatView    │   │
│  │           │  │   (native WS UI via useClawChat)  │   │
│  │           │  └─ … other views                    │   │
│  │  ChatWebView (classic iframe of OpenClaw UI)     │   │
│  └──────────────────────────────────────────────────┘   │
│                       │                                  │
│                       ▼ WebSocket / HTTP                 │
│         ┌───────────────────────────────┐                │
│         │ OpenClaw gateway              │                │
│         │ (default localhost:18789)     │                │
│         └───────────────────────────────┘                │
└──────────────────────────────────────────────────────────┘
```

## 2. Source layout

```
clawbar/
├── electron/                  # Main process (TS → CJS via tsc)
│   ├── main.ts                # app lifecycle, tray, BrowserWindow
│   ├── preload.ts             # contextBridge → window.electronAPI
│   ├── pet-window.ts          # optional floating mascot window
│   ├── ws-bridge.ts           # WebSocket bridge + Ed25519 auth
│   └── ipc/
│       └── settings.ts        # settings:get / settings:set
├── src/                       # Renderer (React 19)
│   ├── main.tsx               # React entry
│   ├── App.tsx                # title bar + view routing (chat / settings)
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ChannelDock.tsx
│   │   ├── ChannelIcon.tsx
│   │   ├── ChannelHost.tsx
│   │   ├── WebChannel.tsx
│   │   ├── OpenClawChannel.tsx
│   │   ├── AddChannelMenu.tsx
│   │   ├── ChannelContextMenu.tsx
│   │   ├── CompactChat.tsx    # compact mode shell + ViewRouter
│   │   ├── ChatView.tsx       # native chat (messages, input, approvals)
│   │   ├── ChatWebView.tsx    # classic mode iframe
│   │   ├── ChatHistory.tsx
│   │   ├── ApprovalCard.tsx
│   │   ├── ApprovalsView.tsx
│   │   ├── SessionsView.tsx
│   │   ├── OverviewView.tsx
│   │   ├── UsageView.tsx
│   │   ├── CronView.tsx
│   │   ├── AgentsView.tsx
│   │   ├── SkillsView.tsx
│   │   ├── LogsView.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── LobsterIcon.tsx
│   │   └── views/
│   │       ├── ViewShell.tsx
│   │       └── ViewStates.tsx
│   ├── hooks/
│   │   ├── useClawChat.ts     # IPC → WS bridge state hook
│   │   └── useWsRequest.ts    # one-shot ws:send + correlate response
│   ├── stores/
│   │   ├── settingsStore.ts   # Zustand: settings + theme + view
│   │   ├── channelStore.ts    # Zustand: channel list + active id + CRUD
│   │   └── webviewStore.ts    # Zustand: trigger iframe reload
│   ├── utils/format.ts
│   └── styles/globals.css     # CSS variables (color tokens)
├── types/electron.d.ts        # window.electronAPI types
├── resources/                 # bundled icons (electron-builder)
├── docs/ARCHITECTURE.md
├── electron-builder.yml
├── tailwind.config.js, postcss.config.js
├── tsconfig.json, tsconfig.node.json
├── vite.config.ts
└── package.json
```

## 3. IPC

All renderer ↔ main communication goes through `contextBridge` and `window.electronAPI`. Channels follow `domain:action`.

| Domain   | Channel                | Direction        | Purpose |
|----------|------------------------|------------------|---------|
| settings | `settings:get`         | invoke           | Read whole settings object |
| settings | `settings:set`         | invoke           | Update one whitelisted key |
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
| pet      | `pet:right-click`      | send             | Open mascot context menu |

## 4. WebSocket bridge

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

## 5. Renderer

### 5.1 State

Zustand only — no React Context.

- **`settingsStore`** — full settings object plus `resolvedTheme` (light/dark), current `view` (`chat` | `settings`), `chatMode` (`compact` | `classic`), `hydrated` flag (true after main-process settings have loaded).
- **`webviewStore`** — single `reloadKey` counter, bumped by the TitleBar reload button to force-remount the classic iframe.

### 5.2 Compact chat data flow

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

`useClawChat` owns the message list, typing flag, sessions list, pending/resolved approvals, and exposes `sendMessage`, `switchSession`, `createSession`, `deleteSession`, `resolveApproval`. Subscriptions are torn down on unmount and `ws:disconnect` is invoked — so toggling chat mode triggers a clean reconnect when you come back.

### 5.3 Classic mode

`ChatWebView` mounts an `<iframe>` pointing at the gateway root, passing auth via URL fragment (`#token=…` or `#password=…`) so secrets never reach the server. Chromium strips `X-Frame-Options` / `frame-ancestors` via `onHeadersReceived` so the embed isn't blocked.

> Cross-origin iframes in Electron don't reliably fire `onLoad`, so we don't rely on it for UI gating. Real network failures show Chromium's native iframe error page; the TitleBar reload button bumps `reloadKey` to force-remount.

## 6. Window

Frameless `BrowserWindow`. Position rules:

1. First open → place near the tray icon.
2. After drag/resize → persist to `~/.clawbar/window-bounds.json` and restore.
3. If the saved position is off-screen (display config changed), fall back to the tray anchor.

`positionNearTray()` clamps the window inside the current display's `workArea` and flips above the tray when there's not enough room below — on Windows the tray usually sits at the bottom of the screen, so the popover is rendered **above** the tray rather than below it.

`webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.

macOS-only knobs (`vibrancy: 'popover'`, `visualEffectState: 'active'`, `app.dock?.hide()`) are applied only when `process.platform === 'darwin'`. On Windows the window has a standard opaque background and gets an `icon` option so alt-tab / task-manager show the lobster.

## 7. Build

| Tool             | Input               | Output                                    |
|------------------|---------------------|-------------------------------------------|
| Vite             | `index.html`        | `dist/`                                   |
| `tsc -p tsconfig.node.json` | `electron/*.ts`        | `dist-electron/` (CommonJS)               |
| electron-builder | `dist/`, `dist-electron/`, `resources/` | `release-artifacts/*.dmg` (macOS), `release-artifacts/*.exe` (Windows NSIS + portable) |

Release CI (`.github/workflows/release.yml`) runs two parallel jobs — macOS arm64 on `macos-14`, Windows x64 on `windows-latest` — then a final `release` job downloads both artifacts and publishes them to a single GitHub Release. Triggered by pushing a `v*` tag, or manually via `workflow_dispatch`.

## 8. Channels

A **channel** is any place the user's OpenClaw agent talks to them — its own web chat, an IM bot (Telegram / Discord / Feishu / Lark), or a custom integration. The renderer shell is a **channel bar** (`ChannelDock`, 48 px wide, left edge) plus a **channel host** (`ChannelHost`, fills the rest). Each entry in `settings.channels` becomes either an `OpenClawChannel` (the existing compact / classic OpenClaw UI) or a `WebChannel` (an Electron `<webview>` with `partition="persist:channel-<id>"` and a mobile iPhone user-agent so IM web apps render their phone layouts). All enabled channels mount once and stay mounted; the inactive ones are stacked offscreen with `position:absolute + visibility:hidden + zIndex:0` so Electron keeps painting them — `display:none` would suspend the webview's compositor and make channel switches look like the page is "still loading".

The `+` button at the bar's bottom opens `AddChannelMenu` — a popover (rendered via React Portal so it isn't clipped by the bar) that lets users re-enable any hidden built-in (Telegram / Discord / Feishu / Lark) or paste a custom URL where their agent is reachable. Right-clicking any channel opens `ChannelContextMenu` for rename, change icon, move up/down, hide (built-in only), or delete (custom only). OpenClaw is always at index 0 and cannot be removed; user-added channels' favicons are auto-captured via the `<webview>`'s `page-favicon-updated` event.

Clicking the OpenClaw channel icon while OpenClaw is the active channel toggles its internal **operator sidebar** (Overview / Approvals / Sessions / Usage / Cron / Agents / Skills / Logs / Settings) — this surface is for managing the OpenClaw gateway itself, not chat. The sidebar panel + backdrop start at `left: 48 px` so the channel bar stays visible and clickable. When a web channel is active the TitleBar gains Back / Reload buttons that drive the `<webview>` via `goBack()` / `reload()`; the webview element is exposed through `channelStore.activeWebview`.

## 9. Pet window

`pet-window.ts` owns an optional always-on-top `BrowserWindow` (100 × 110, transparent, frameless) showing the lobster mascot. Spawn lazily — only if `settings.petVisible !== false`. Right-click the pet → "Hide Pet"; right-click the tray icon → "Show Pet" / "Hide Pet". Both update the persisted `petVisible` flag through a small `setSetting()` helper exposed by the settings module. Drag works via a `pet:drag` IPC; `pet:drag-end` resets the captured offset between drag sessions (without it the window snaps to a stale position on subsequent drags).

## 10. Security


- `contextIsolation`, `sandbox`, `nodeIntegration: false` (renderer can't reach Node).
- `settings:set` whitelists the keys it accepts.
- Auth tokens travel in the URL fragment when embedding the OpenClaw UI — fragments aren't sent to servers.
- Ed25519 private key never leaves the main process.

## 11. Platform notes

**Tray icon.** macOS uses a 18 px template (monochrome) PNG so it auto-adapts to light / dark menu bars. Windows uses the colored `resources/icon.png` at 16 px — Windows tray doesn't honour `setTemplateImage`, so a black silhouette would be invisible on a dark taskbar.

**Tray tooltip / menu.** Same code path on both platforms (`tray.setToolTip`, `tray.on('right-click', …)`). Windows 11 hides new tray icons inside the overflow flyout by default; users drag the icon onto the main taskbar to pin it.

**Popover positioning.** On macOS the tray is at the top of the screen so the popover drops **below** the tray icon. On Windows the tray is at the bottom, so `positionNearTray()` flips the popover **above** the tray and clamps it inside the screen's `workArea`.

**Window chrome.** `vibrancy` is macOS-only; on Windows the popover is a plain opaque window. Frameless + custom titlebar is the same on both.

**Pet window.** `transparent: true + frameless + alwaysOnTop` works on both platforms; `focusable: false` keeps it out of alt-tab / Mission Control.

**Packaging.** macOS produces a `.dmg` via electron-builder's `dmg` target; Windows produces an NSIS installer (`.exe`) and a self-extracting portable (`.exe`) via the `nsis` and `portable` targets. Neither is code-signed — macOS users bypass Gatekeeper with right-click → Open, Windows users bypass SmartScreen with "More info → Run anyway".
