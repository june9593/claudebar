# ClawBar — Architecture

> 版本: v2.1 — 2026-04-22

## 1. Overview

ClawBar is a frameless macOS menu bar Electron app with a left-edge **channel dock**. The first channel is OpenClaw — a self-hosted [OpenClaw](https://github.com/nicepkg/openclaw) gateway accessed either via native WebSocket UI (compact mode) or via embedded iframe (classic mode). Additional channels host arbitrary IM web apps (Telegram, Discord, Feishu, Lark, plus user-added URLs) inside Electron `<webview>` tags with persistent partitions.

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

Frameless `BrowserWindow` with `vibrancy: 'popover'`. Position rules:

1. First open → place under the tray icon.
2. After drag/resize → persist to `~/.clawbar/window-bounds.json` and restore.
3. If the saved position is off-screen (display config changed), fall back to under the tray.

`webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.

## 7. Build

| Tool             | Input               | Output                                    |
|------------------|---------------------|-------------------------------------------|
| Vite             | `index.html`        | `dist/`                                   |
| `tsc -p tsconfig.node.json` | `electron/*.ts`        | `dist-electron/` (CommonJS)               |
| electron-builder | `dist/`, `dist-electron/`, `resources/` | `release-artifacts/*.dmg` |

## 8. Channels

The renderer shell is a **channel dock** (`ChannelDock`, 48 px wide, left edge) plus a **channel host** (`ChannelHost`, fills the rest). Each entry in `settings.channels` becomes either an `OpenClawChannel` (the existing compact / classic OpenClaw UI) or a `WebChannel` (an Electron `<webview>` with `partition="persist:channel-<id>"` and a mobile iPhone user-agent so IM web apps render their phone layouts). All enabled channels mount once and stay mounted; the inactive ones are stacked offscreen with `position:absolute + visibility:hidden + zIndex:0` so Electron keeps painting them — `display:none` would suspend the webview's compositor and make channel switches look like the page is "still loading".

The `+` button at the dock's bottom opens `AddChannelMenu` — a popover (rendered via React Portal so it isn't clipped by the dock) that lets users re-enable any hidden built-in (Telegram / Discord / Feishu / Lark) or paste a custom URL. Right-clicking any channel opens `ChannelContextMenu` for rename, change icon, move up/down, hide (built-in only), or delete (custom only). OpenClaw is always at index 0 and cannot be removed; user-added channels' favicons are auto-captured via the `<webview>`'s `page-favicon-updated` event.

Clicking the OpenClaw dock icon while OpenClaw is the active channel toggles its internal operator sidebar (Overview / Approvals / Sessions / Usage / Cron / Agents / Skills / Logs / Settings). The sidebar panel + backdrop start at `left: 48 px` so the channel dock stays visible and clickable. When a web channel is active the TitleBar gains Back / Reload buttons that drive the `<webview>` via `goBack()` / `reload()`; the webview element is exposed through `channelStore.activeWebview`.

## 9. Pet window

`pet-window.ts` owns an optional always-on-top `BrowserWindow` (100 × 110, transparent, frameless) showing the lobster mascot. Spawn lazily — only if `settings.petVisible !== false`. Right-click the pet → "Hide Pet"; right-click the tray icon → "Show Pet" / "Hide Pet". Both update the persisted `petVisible` flag through a small `setSetting()` helper exposed by the settings module. Drag works via a `pet:drag` IPC; `pet:drag-end` resets the captured offset between drag sessions (without it the window snaps to a stale position on subsequent drags).

## 10. Security


- `contextIsolation`, `sandbox`, `nodeIntegration: false` (renderer can't reach Node).
- `settings:set` whitelists the keys it accepts.
- Auth tokens travel in the URL fragment when embedding the OpenClaw UI — fragments aren't sent to servers.
- Ed25519 private key never leaves the main process.
