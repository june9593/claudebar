# ClaudeBar Multi-Device — Design Doc

> Date: 2026-05-13 · Author: Yue Liu (with brainstorming via Claude) · Status: A2b shipped in v0.8.0; A3 pending plan

> **Implementation status (2026-05-15):** Phase A1 (renderer transport abstraction) ✓ shipped in v0.7.1. Phase A2a (pairing identity + UI shell) ✓ shipped in v0.7.2. Phase A2b (real transport: mDNS + mTLS WS + PAKE) ✓ shipped in v0.8.0. Phase A3 (session mirroring + UI + remote cache) — pending plan in `docs/plans/`. Note: the device key is **ECDSA P-256**, not ed25519 as originally written in §11 — Electron's BoringSSL rejects ed25519 server certs in the mTLS handshake.

ClaudeBar Multi-Device makes any of your Macs running ClaudeBar a remote display for any other Mac running ClaudeBar — sessions stay on the machine that started them; you see them, take them over, and approve their tool calls from anywhere.

## 1. Product positioning

**The core scenario**: You're running a long task on the Mac mini in your office (Chromium build + Claude refactoring code). You go home. From your laptop's ClaudeBar, you immediately see "mac-mini has 1 active session, currently waiting on 'approve git push'". You click → take over → approve → the task continues on the Mac mini. No SSH, no laptop-in-a-bag, no waking up Anthropic-hosted infra.

This is **remote-drive**, not file sync — the session's `.jsonl` stays on its host machine; we mirror its event stream and forward control inputs back. Conceptually similar to Anthropic's official `claude remote-control`, but:

- **Multi-machine in one window** — `/rc` connects you to one machine at a time
- **Native desktop app** — no browser tab, lives in tray + floating window
- **No third-party cloud** — direct P2P over LAN or Tailscale; no Anthropic relay required (you don't need an Anthropic account for the relay layer)
- **Same UI as local sessions** — remote sessions appear in the existing rail, just grouped under their machine

**Out of scope for v1**: cross-machine session migration (physically copying jsonl files between machines so a different `claude` CLI can resume), >2 machines, mobile clients, non-Mac machines, multi-user collaboration. All deferred.

## 2. Scope (v1)

- **2 Macs maximum**, owned by the same user. Pairing is symmetric — either Mac can control the other.
- **Same Wi-Fi (mDNS) or Tailscale overlay** — must be reachable. v1 ships no relay server.
- **Single user assumption** — one human at a time. The "control takeover" model is exclusive (see §6); no concurrent collaboration mechanics.
- **Active sessions are mirrored, not migrated** — the session's `.jsonl` stays on the host machine; the Claude CLI process spawns on the host machine on demand (using the existing idle-close + transparent reopen mechanism).
- **Fully visible by default** — every session on the paired machine appears in the rail. No per-session share/unshare toggle.

## 3. Architecture

Each ClaudeBar is **simultaneously server and client**. There is no central hub.

```
┌─────────────────────────────┐                           ┌─────────────────────────────┐
│  Mac mini @ office          │                           │  Laptop @ home              │
│                             │                           │                             │
│  ClaudeBar                  │                           │  ClaudeBar                  │
│  ├─ Local Claude bridge     │                           │  ├─ Local Claude bridge     │
│  ├─ Server (WS, mTLS)  ─────┼─── mDNS / Tailscale ──────┼──── Client (WS, mTLS)       │
│  ├─ Client (WS, mTLS)  ─────┼─── (P2P, no relay) ───────┼──── Server (WS, mTLS)       │
│  └─ Remote-cache store      │                           │  └─ Remote-cache store      │
└─────────────────────────────┘                           └─────────────────────────────┘
```

Each ClaudeBar process owns:

1. **Local Claude bridge** — unchanged from v0.7.0; manages local sessions via the Claude Agent SDK, each `ActiveSession` keyed by row id
2. **Server** — accepts inbound WS connections from paired peers. Authenticates via mTLS pinned at pair time. Streams local session events out, accepts inbound control messages, executes IPC requests on behalf of the remote
3. **Client** — for each paired peer, maintains an outbound WS connection. Mirrors received events into the renderer's session store under that peer's machine namespace
4. **Remote-cache store** — disk persistence of the latest N events per remote session, used to render an offline snapshot when the peer is unreachable

## 4. Pairing

Pairing happens once per peer pair. The flow is **explicit, in-person, time-bounded**, modelled after Bluetooth/SSH `~/.ssh/authorized_keys`:

```
Mac mini                                  Laptop
──────────                                ──────
1. Settings → Pairing
   → click "Generate PIN"
2. Display PIN (6 digits) for 5 minutes
   ┌───────────┐
   │  482-739  │
   └───────────┘
                                          3. Settings → Pairing
                                             → click "Add remote machine"
                                          4. Enter PIN: 482-739
                                          5. Enter local label for this machine: "工位"
                                          6. Client opens WS to mac-mini's discovered address
                                             (mDNS first, Tailscale second)
                                          7. Both sides exchange ed25519 public keys
                                             over the PIN-derived shared secret
8. Mac mini side stores
   { id, label, pubkey } in
   ~/.claudebar/peers.json                ← Laptop side stores same shape
9. Pairing complete; PIN voids
```

**Brute-force resistance**: PIN is exactly 6 numeric digits (1M space), 5-minute TTL, single-use, 5 wrong attempts within the TTL invalidates the PIN entirely. PIN derivation: SPAKE2-style PAKE so the PIN value never travels in plaintext (the WS handshake uses HKDF over PIN+nonce to derive a one-time symmetric key that wraps the actual ed25519 pubkey exchange).

**Key persistence**: `~/.claudebar/device.json` (mode 0600) stores this machine's persistent ed25519 keypair, generated on first launch. `~/.claudebar/peers.json` stores the trust list — `{ id, label, pubkey, lastSeenAt, lastAddress }` per peer.

**Revocation**: Settings → Paired Machines → "Remove" deletes the peer from `peers.json`. Subsequent connections from that pubkey are rejected (`Auth failed: pubkey not in peer list`).

## 5. Transport — discovery + connection

ClaudeBar attempts in this order:

```
on_startup() and every 30s while disconnected:
  for each peer in peers.json:
    1. mDNS: query _claudebar._tcp.local. for hostname matching peer.lastSeenHostname
       → if found, dial ws+mtls://peer.local:<port>
    2. Tailscale: shell out `tailscale status --json`, find peer's TailscaleIP
       → if found, dial ws+mtls://peer-ts-ip:<port>
    3. Stored last-known IP from peers.json (lastAddress field)
       → if reachable, dial; if not, skip
    4. (Reserved) Settings.relayUrl — if user has configured one, dial wss://<relayUrl>/<peerId>
       v1 ships no relay; this is an escape hatch for future / advanced users
```

**Discovery details**:

- **mDNS**: Each ClaudeBar advertises `_claudebar._tcp.local.` with TXT record containing `id=<deviceId>` and `pubkey-fp=<sha256(pubkey)[:8]>`. macOS has built-in mDNS support; we use the `bonjour-service` npm package (zero-config, MIT-licensed, ~50KB).
- **Tailscale**: We invoke `tailscale status --json` and parse `peers[*].TailscaleIPs`. If the binary isn't installed (`ENOENT`), we skip silently — Tailscale is opt-in.
- **TCP port**: 47891 by default (configurable in Settings, advertised via mDNS TXT).
- **mTLS handshake**: Standard Node TLS with `cert`+`key` from `device.json` and `requestCert: true, rejectUnauthorized: true`. Custom `checkServerIdentity` verifies the server's pubkey is in `peers.json`.

**Heartbeat + reconnect**: 30s heartbeat both ways. On 90s no-pong, mark connection as down, drop to "reconnecting…" state, retry every 30s with exponential backoff capped at 5 min.

## 6. Session lifecycle on a remote-driven session

The remote-driven model is **lazy**: the host machine doesn't keep a `claude` process alive when no client is interacting with the session. Same idle-close model as local sessions, just triggered by the client connection lifecycle instead of just message recency.

```
1. Mac mini's ClaudeBar shows session X in its rail (idle, no claude process).
2. Laptop opens session X (clicks rail icon in the "MAC-MINI" group).
3. Laptop sends control:take{ sessionX } to mac-mini server.
4. Mac-mini server:
     a. Spawns claude --resume <X> via existing bridge (uses local Claude CLI)
     b. Marks session X as controlledBy=laptop
     c. If mac-mini's local UI also has session X open: that view becomes
        read-only with banner "controlled by laptop"
     d. Streams claude:event sequence to laptop client
5. Laptop renders mirrored events into its sessionStore.
6. Laptop user sends a message → session:send{ sessionX, "..." } → mac-mini
   bridge passes to claude SDK → response streams back as session:event.
7. Tool approval: SDK fires canUseTool callback → mac-mini server forwards as
   tool:request → laptop renders inline ApprovalCard → user clicks allow/deny →
   tool:approve flows back → mac-mini callback returns to SDK.
8. Idle release:
     - Laptop closes the session view → control:release sent → mac-mini frees
       the slot, kills the claude process per existing idle-close logic.
     - 30 min no traffic from laptop → mac-mini auto-release (covers laptop
       crash / network drop / forgotten window).
9. Mac-mini's local UI reverts to interactive when control released.
```

**Single-controller invariant**: At any moment, a session has at most one controller (machine id). Take requests from a different machine while one is in control are rejected with `control:taken { byMachineId }` — the requester's UI shows a toast "session is being controlled by laptop right now". The user can manually reclaim by clicking "Take over anyway" which sends a `control:steal` (acceptable for v1's single-user model).

## 7. Operator panel — multi-machine semantics

The Operator panel's 7 tabs follow the active session's machine:

- **Active session is on this Mac** → all tabs show local data, no machine label.
- **Active session is on mac-mini** → all tabs show mac-mini's data, fetched via `ipc:invoke` over the WS link. Tab strip subtitle shows `viewing data from mac-mini`.

Each tab maps to existing IPC handlers (`overview`, `sessions:list`, `plugins:list`, `skills:list`, `commands:list`, `stats:get`, `settings:get/set`). Remote invocation goes through a generic transport:

```
Renderer → preload → ipcRenderer.invoke('claude:remoteIpc', { peerId, channel: 'stats:get', args: [] })
                       │
                       ▼
                  Local main process
                       │
                       ▼
                  Outbound WS client → ipc:invoke{requestId, channel, args}
                                          │
                                          ▼
                                     Remote main process
                                     dispatches to local IPC handler
                                          │
                                          ▼
                                     ipc:invoke:reply{requestId, result}
```

**Settings is special**: when viewing a remote machine's Settings tab, all writes also go to the remote's `~/.claudebar/settings.json`, not the local one. This is the natural behavior given the IPC wrapping pattern, but worth calling out.

## 8. UI changes

### 8.1 SessionRail — grouped by machine

Existing rail (32px wide):

```
┌──┐
│≡ │  Operator panel
│⊕ │  New session
│  │
│🦞│  Local session 1
│🐙│  Local session 2
│  │
│⚙ │  Settings
└──┘
```

After Multi-Device:

```
┌────┐
│ ≡  │
│ ⊕  │
├────┤
│THIS│   ← section header, 9px text, status dot prefix
│ 🦞 │   ← local session 1
│ 🐙 │   ← local session 2
├────┤
│MAC │   ← section header for paired peer
│MINI│
│ 🐡 │   ← remote session 1 (full color when peer online)
│ 🌟 │   ← remote session 2
│ ⚪ │   ← remote session 3 (greyed if peer offline; clickable for snapshot)
├────┤
│ ⊕mm│   ← (optional v1.1) "+" inside MAC-MINI section to spawn new session there
├────┤
│ ⚙  │
└────┘
```

Section header: 9px uppercase label, status dot prefix (green=online, yellow=reconnecting, grey=offline). Hover tooltip shows `mac-mini · last seen 2m ago`.

When peer is offline, that section's session icons are 50% opacity but still clickable; clicking enters snapshot mode (chat shows the cached last-N events with a banner).

### 8.2 Chat banner for remote sessions

Remote sessions (any session not on the local machine) get a thin banner at the top of the chat area, above the message scroll region. Local sessions never show this banner.

```
remote · LAN · 12ms                                       [Take over]
remote · Tailscale · 78ms                                 [Release]
offline · last update 3 min ago                            [Reconnecting...]
controlled by laptop                                       [Take over anyway]
```

11px font, full-width, uses the existing `--color-bg-secondary` background. The banner state machine:

- **online + not controlled by me** → "Take over" button visible
- **online + controlled by me** → "Release" button visible
- **online + controlled by other peer** → read-only, "Take over anyway" button
- **offline** → "Reconnecting..." spinner, no buttons (read-only snapshot)

### 8.3 Settings — Pairing section

New section in the Settings tab, between Window and Diagnostics:

```
─── Pairing ─────────────────────────────────

This machine name        [laptop                    ]   ← editable string

Allow remote control     [ Generate PIN ]
                          (when active: shows "482-739 · 4:32 left" + Cancel)

Paired machines:
  ┌──────────────────────────────────────────┐
  │ ● mac-mini                               │
  │   工位 · last seen 2m ago                 │
  │   [Remove]                               │
  └──────────────────────────────────────────┘

Add remote machine       [ Enter PIN ]
                          (when active: shows PIN input + label input + Connect)

Discovery                ☑ mDNS (LAN)
                         ☑ Tailscale (if installed)
                         Relay URL [                              ]   ← optional
```

## 9. Protocol — message frames

WebSocket text frames carrying JSON. All messages have `type` and (when needed) `requestId` for request/response correlation. Field types informally:

```ts
// Discovery / handshake (after mTLS established)
{ type: "hello", payload: { deviceId, label, version, capabilities: ["ipc-invoke", "control"] } }

// Session enumeration
{ type: "sessions:list", requestId }
{ type: "sessions:list:reply", requestId, payload: { sessions: ClaudeSession[] } }

// Subscribe to a session's event stream
{ type: "session:open", requestId, payload: { sessionId } }
{ type: "session:open:reply", requestId, payload: { ok, controlledBy?, recentEvents: ClaudeEvent[] } }

// Streaming events (from server to client)
{ type: "session:event", payload: { sessionId, event: ClaudeEvent, eventId: number } }

// Sending input (client to server)
{ type: "session:send", requestId, payload: { sessionId, text } }
{ type: "session:abort", requestId, payload: { sessionId } }

// Control transfer
{ type: "control:take", requestId, payload: { sessionId, force?: boolean } }
{ type: "control:release", payload: { sessionId } }
{ type: "control:state", payload: { sessionId, controlledBy: string | null } }

// Tool approval relay
{ type: "tool:request", payload: { sessionId, requestId: string, request: ToolPermissionRequest } }
{ type: "tool:approve", payload: { sessionId, requestId: string, decision: "allow"|"deny", remember?: boolean } }

// AskUserQuestion relay (similar shape)
{ type: "ask:request", payload: { ... } }
{ type: "ask:answer", payload: { ... } }

// Generic IPC relay (for Operator panel cross-machine)
{ type: "ipc:invoke", requestId, payload: { channel: string, args: unknown[] } }
{ type: "ipc:invoke:reply", requestId, payload: { result?, error? } }

// Heartbeat
{ type: "ping" }
{ type: "pong" }
```

Each `session:event` carries a monotonic `eventId`. When client reconnects after a drop, it sends `session:open` with `lastEventId` to fetch only the diff since then.

## 10. Remote cache for offline snapshots

Per spec §6 (offline visibility), the client persists each remote session's recent state:

```
~/.claudebar/remote-cache/
├── <peerId>/
│   ├── sessions.json                ← { sessionId → { name, projectDir, lastEventAt, lastEventId } }
│   └── <sessionId>.events.jsonl     ← append-only event log, capped at last 500 events
```

When the peer goes offline, the client renders from this cache: chat shows the last 500 events with the offline banner; the rail icon greys but stays clickable. On reconnect, client sends `session:open { sessionId, lastEventId }` and the server replays only the diff.

Cache eviction: on graceful disconnect or when a session is observed as deleted on the peer, that session's events file is deleted. Otherwise indefinite retention bounded by 500 events × ~1KB ≈ 500KB per session.

## 11. Security model

- **At rest**: `~/.claudebar/device.json` (private key) is mode 0600. `peers.json` (pubkeys + labels) is mode 0644 — pubkeys are not secret. Remote-cache events are mode 0600 (may contain code snippets, prompts).
- **In transit**: mTLS for all peer-to-peer traffic. Server cert is the local device's ed25519 cert; client validates against pinned pubkey from `peers.json`.
- **Pairing**: SPAKE2-style PAKE handshake derives ephemeral key from PIN; pubkeys are wrapped with this ephemeral key. PIN never appears on the wire in plaintext.
- **Authorization**: Once paired, a peer is fully trusted (see scope §2 — single-user model). No per-session permission scoping in v1.
- **Replay**: WS frames carry request IDs (UUIDv4); server tracks last 1000 IDs per peer to reject replays.
- **Tailscale-on-Tailscale**: When transport is via Tailscale IP, both Tailscale and our mTLS apply — defence in depth, but not required.

## 12. What's kept, removed, rewritten

**Kept (no changes)**: All v0.7.0 code paths for local sessions. The Claude bridge, sessionStore, ApprovalCard, AskUserQuestionPrompt, ChatView all work identically when the session is local. Operator panel tabs that already use IPC (overview, sessions, plugins, skills, commands, stats, settings) work unchanged when active session is local; they get a thin transport adapter when active session is remote.

**Added**:
- `electron/transport/` — new module, ~5 files: server.ts (WS+mTLS server), client.ts (per-peer WS+mTLS client + reconnect), discovery.ts (mDNS + Tailscale scan), pairing.ts (PIN flow + SPAKE2), peers.ts (peers.json read/write + watcher).
- `electron/ipc/peers.ts` — IPC for pairing UI (generate PIN / consume PIN / list peers / remove peer).
- `electron/remote-cache.ts` — manage `~/.claudebar/remote-cache/`.
- `src/stores/peersStore.ts` — renderer state for paired peers + their online status + their remote sessions.
- `src/components/PairingPanel.tsx` — Settings UI section.
- `src/components/RemoteBanner.tsx` — chat-area banner for remote sessions.

**Modified**:
- `src/components/SessionRail.tsx` — render machine sections; status dots; mixed local + remote rendering.
- `src/components/ChatView.tsx` — read banner state from peersStore for remote sessions; gate input/approval on control state.
- `src/stores/sessionStore.ts` — sessions can have `machineId: string | "local"`; selectors filter by machine.
- `src/stores/approvalsStore.ts` — track pending approvals per (machineId, sessionRowId) pair.
- `electron/preload.ts` + `types/electron.d.ts` — new `peers.*` and `transport.*` IPC surfaces.
- `electron/main.ts` — bootstrap transport server + initial discovery sweep on whenReady.

**Reused infrastructure**:
- mTLS via Node `tls` module (zero new deps for that).
- ed25519 via `@noble/ed25519` — needs to be re-added to deps (we removed it in v0.7.0; this brings it back for a real reason).
- mDNS via `bonjour-service`.

**Out of scope (backlog)**:
- Cross-machine session migration (jsonl portability) — separate spec.
- >2 machines / fleet management UI.
- Mobile / PWA companion (see §15).
- Relay server (we ship the protocol + an escape-hatch URL field; relay is a separate project).

## 13. Settings

New keys in `~/.claudebar/settings.json`:

| Key | Type / Default | Purpose |
|---|---|---|
| `machineName` | string, default = hostname | Label this machine shows to peers |
| `transport.port` | number, default 47891 | WS port for inbound connections |
| `transport.mdnsEnabled` | bool, default true | Advertise + scan mDNS |
| `transport.tailscaleEnabled` | bool, default true | Try `tailscale status --json` |
| `transport.relayUrl` | string?, default null | Optional fallback wss URL (escape hatch; v1 has no first-party relay) |
| `pairing.maxPinAttempts` | number, default 5 | Brute-force lockout threshold per active PIN |

Pairing state (PINs, peer trust) lives in **separate files** (`device.json`, `peers.json`), not in settings.json — different security tier and write cadence.

## 14. Migration

v0.7.0 → multi-device: zero migration. Existing settings preserved, no schema changes to existing keys, no breaking changes to local session behavior. First launch after upgrade: ClaudeBar generates `device.json` if absent. `peers.json` starts empty. Multi-device is fully opt-in (must pair to use).

## 15. Renderer transport abstraction (enables PWA in Phase B)

The v1 architectural decision: **the renderer is built so it can run in two environments without changes** — inside Electron (with `window.electronAPI` IPC) AND inside a regular browser (over WebSocket). The Electron app remains the primary product; the browser path enables a future PWA companion (mobile / tablet / any device with a browser) for ~free.

### The `apiClient` interface

All renderer code that today calls `window.electronAPI.<domain>.<method>(...)` is migrated to call `apiClient.<domain>.<method>(...)`. `apiClient` is a thin wrapper with two implementations:

```ts
// src/lib/apiClient.ts (new)
interface ApiClient {
  claude: { checkCli, scanProjects, listSessions, start, send, abort, close, ... };
  settings: { get, set, ... };
  plugins: { list };
  skills: { list, read };
  commands: { list, read };
  stats: { get, today };
  peers: { ... }; // new in multi-device
  // each method returns Promise<...> OR exposes onEvent listener
}

// Picked at module init based on environment:
export const apiClient: ApiClient =
  typeof window !== 'undefined' && (window as any).electronAPI
    ? createElectronApiClient()        // wraps window.electronAPI (IPC)
    : createWebSocketApiClient();       // wraps WSS to local main-process server
```

Event subscriptions (e.g. the `claude:event` stream) follow the same pattern: `apiClient.claude.onEvent(handler) → unsubscribe`.

### Local server inside Electron main process

Electron main process runs an **additional** HTTP+WSS server on the same port used for peer transport (47891 by default), but on a different path:

- `wss://127.0.0.1:47891/peer/` — peer-to-peer (between two Macs running ClaudeBar), mTLS pinned, used by §3-12
- `wss://127.0.0.1:47891/web/` — local browser/PWA path. Same JSON message shapes as `/peer/` but auth is via a **session token** (signed JWT issued by Settings UI), not mTLS.
- `https://127.0.0.1:47891/` — serves `dist/` (the same renderer bundle Electron loads via `loadFile`)

Both `/peer/` and `/web/` ultimately invoke the SAME IPC handlers (the `setup*IPC()` functions in `electron/ipc/`); they're just different transports.

### Phase A vs Phase B

- **Phase A (this multi-device v1, what this spec implements)**:
  - Build the `apiClient` abstraction
  - Migrate all renderer call sites from `window.electronAPI.*` to `apiClient.*`
  - Implement only the Electron transport (`createElectronApiClient`) — Electron-to-Electron P2P uses the `/peer/` WS path described in §3-12
  - The HTTP server stub for `/web/` exists but only serves `dist/` static files; no `/web/` WS handler yet

- **Phase B (PWA companion, future work, separate spec)**:
  - Implement `createWebSocketApiClient` (the browser-side `apiClient`)
  - Implement `/web/` WS handler in main process (JWT auth, message routing)
  - Issue PWA pairing JWT via Settings → "Pair browser device" → QR code
  - Add `manifest.json` + service worker to `dist/` so the page is installable as a PWA
  - Renderer code: zero changes (other than the optional service-worker registration)

This split means **Phase B is essentially "implement the missing transport + add manifest"**, not "rewrite the UI". One UI codebase, two runtimes.

### Why not pure web app (lgtm-anywhere style)

We considered making ClaudeBar purely a local web server with Electron as a thin frame loading `localhost`. Rejected because:

- Loses Electron-native features the spec relies on: tray integration, global shortcut, `powerSaveBlocker` for host machines (§16), shell-env hydration to find `claude` binary, native window chrome with traffic-light padding, on-launch from Finder, dock icon hide
- Existing `electron/main.ts`, `electron/preload.ts`, all `electron/ipc/*` are written as Electron IPC and would need full rewrite
- The transport abstraction described above gets us 95% of the "web app" benefit (one UI codebase, runs anywhere) without losing native integration

### Implications for v1 task list

The first phase of multi-device implementation does the abstraction migration BEFORE adding the peer transport, because the new `peers` IPC and the new transport server should be built against the abstracted apiClient pattern from day one.

## 16. Future considerations: PWA companion

Concrete plan for Phase B (after multi-device v1 ships):

- **Same React bundle** — no UI rebuild
- **Discovery**: PWA cannot do mDNS / Tailscale; user types or scans QR for the host's address (e.g. `wss://laptop.tailnet.local:47891/web/`)
- **Pairing**: similar PIN model as Mac-to-Mac, but PIN issues a JWT (signed by the host's device key) rather than exchanging a peer pubkey. JWT carries `{ deviceId, label, expiresAt }`. PWA stores JWT in IndexedDB.
- **Auth on `/web/` WS**: bearer JWT in initial message; server validates signature against its own pubkey
- **No mTLS on PWA path** — browsers can't reliably present client certs; we accept this as a security tradeoff (JWT + mandatory WSS suffice for the single-user case)
- **Forward-compatible with v1**: the `/peer/` and `/web/` paths are designed to coexist; same handlers, different auth front-ends.

## 17. Risks and open questions

- **mDNS reliability under VPN/firewall**: macOS's mDNS responder is generally reliable on the LAN, but corporate VPNs sometimes block or hijack `.local.` resolution. If the user's office Wi-Fi has aggressive client isolation, mDNS will fail and they must use Tailscale. Document this in README.
- **Tailscale binary location**: We shell out to `tailscale`; it lives at `/Applications/Tailscale.app/Contents/MacOS/Tailscale` (GUI install) or `/usr/local/bin/tailscale` (CLI install). The shell-env hydration logic from v0.5.0 should already cover PATH discovery, but verify.
- **Clock skew + JWT (future PWA)**: Out of scope for v1, but the future PWA path will need to handle it.
- **Race: two ClaudeBars start simultaneously and try to dial each other**: Our discovery loop is idempotent; whichever opens the WS first becomes "client", the other accepts as "server". The mTLS handshake doesn't care which side initiated.
- **Battery / wakelock on mac-mini**: When the mac-mini is the host of an active controlled session, we want to prevent it from sleeping. Use `caffeinate` shell-out or Electron's `powerSaveBlocker` API. Add to spec under §6 lifecycle (host acquires power-save block while it has any controlled session).
- **What if user removes a peer mid-session?** Server-side: drop all open WS connections from that pubkey, close any controlled sessions cleanly. Client-side: peer disappears from rail, any open chat view shows "peer removed" and closes after 5s.

## 18. Success criteria for v1

- Pair two Macs in <2 min from cold (install → enter PIN → see remote sessions in rail)
- LAN session take-over latency: first event after click < 500ms
- Reconnect after network blip: rail status point goes yellow → green within 30s, chat updates within 5s
- Offline view: peer goes offline mid-session → snapshot still visible within 1s
- No regression on v0.7.0 local-session behavior with no peers configured
- Memory: idle multi-device subsystem (no active controlled sessions) under +50MB vs v0.7.0
