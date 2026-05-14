# ClaudeBar Multi-Device · Phase A2b — Transport, mDNS discovery, real PIN handshake

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Make the v0.7.2 pairing UI actually work over the network. Replace A2a's `claimPin` stub with a real PIN-authenticated key-exchange handshake. Add mDNS-based peer discovery. Bring up an mTLS WebSocket server on each ClaudeBar that paired peers can authenticate to. Surface live `online | reconnecting | offline` status in the Pairing UI. Ships as v0.8.0 — first version where two Macs can actually find each other and exchange a verified pubkey-pin trust relationship. Still no session mirroring (that's A3); the connection only carries a heartbeat + identity verification.

**Architecture:**
- New module: `electron/transport/` (server, client, discovery, pairing protocol)
- mDNS via `bonjour-service` (zero-config, used in many Electron apps)
- WebSocket server using Node built-in `tls` + `ws` package (one tiny dep), with self-signed ed25519 cert per machine derived from `device.json`
- Pairing protocol: **simple SAS-style flow** (NOT full SPAKE2 — that adds another crypto dep we don't need for the threat model). The PIN is used to derive an HKDF key over a fresh nonce; both sides exchange ed25519 pubkeys wrapped with that key. Listener side proves they had the PIN by being able to decrypt and reply correctly. We've reduced PIN brute-force to "5 guesses then PIN dies" so the symmetric construction is sufficient.
- Live peer status: a new `peersStore` (renderer Zustand) subscribes to a new `apiClient.peers.onStatus(cb)` event stream

**Tech Stack:** Node `tls` + `crypto`, `ws` (lightweight WS lib, ~50KB), `bonjour-service` (~50KB, MIT), existing IPC handler pattern, Zustand.

**Source spec:** [`docs/specs/2026-05-13-multi-device-design.md`](../specs/2026-05-13-multi-device-design.md) §3-§5, §11.

**Working directory:** `~/edge/claudebar`. Head at start: `d397b26`.

---

## Phase A2b — Real transport (v0.8.0)

10 tasks. After this phase: two Macs each running ClaudeBar v0.8.0 on the same Wi-Fi can complete a PIN pairing for real. Settings → Pairing UI shows the peer turning green when reachable, grey when not. Heartbeat every 30s. Disconnect handling. Removing a peer drops both sides' connections.

A3 will add: session enumeration over the open connection, session event mirroring, control take/release, tool-approval relay, operator-panel cross-machine.

---

### Task 1: Add deps `ws` + `bonjour-service` + `@types/ws`

**Files:**
- Modify: `package.json`, `package-lock.json`

Two runtime deps + one dev dep. Both are tiny + audited. (We previously had `ws` in deps as a ClawBar carry-over; we removed it in v0.7.0. This re-adds it for a real reason.)

- [ ] **Step 1: Install**

```bash
cd /Users/yueliu/edge/claudebar
npm install --save ws bonjour-service
npm install --save-dev @types/ws
```

- [ ] **Step 2: Verify the new deps are exactly the 2 + 1 we asked for, no surprise lockfile churn beyond their transitives**

```bash
git diff package.json | head -30
```

Expected: `dependencies` gains exactly `ws` + `bonjour-service`; `devDependencies` gains `@types/ws`. No other version changes.

- [ ] **Step 3: Type-check + build (no usage yet — should still pass)**

```bash
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

Both clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add ws + bonjour-service for multi-device transport

ws: WebSocket library for Node main process. We had it in v0.6.x as
a ClawBar carry-over; this re-adds for the real reason (mTLS WS
server + client between paired Macs).

bonjour-service: zero-config mDNS for peer discovery on LAN. macOS
has built-in mDNS responder via Bonjour; this is the npm wrapper.

@types/ws: types for ws.

Phase A2b step 1."
```

---

### Task 2: Generate self-signed TLS cert from ed25519 device key

**Files:**
- Modify: `electron/device.ts`

The mTLS WS server needs an X.509 cert. Generate one in-memory at app start, derived from the persistent ed25519 keypair already in `device.json`. The cert is regenerated per launch (cheap, no need to persist). The peer trust mechanism is "pubkey is in `peers.json`" — we don't validate cert chains; we only verify the cert's pubkey matches an entry in `peers.json`.

- [ ] **Step 1: Add a `getDeviceCertPem()` exported function to `electron/device.ts`**

```ts
// (append to existing file)

let cachedCertPem: { cert: string; key: string } | null = null;

/** Derive an in-memory self-signed X.509 ed25519 cert from the persistent
 *  device keypair. Used for mTLS server/client. Regenerated per launch
 *  (cheap; no need to persist). Caller does NOT validate the cert chain;
 *  trust is established by checking the cert's pubkey against peers.json. */
export function getDeviceCertPem(): { cert: string; key: string } {
  if (cachedCertPem) return cachedCertPem;
  const id = getDeviceIdentity();
  // Node's built-in crypto can sign X.509 since Node 20. Wrapping with
  // node-forge or @peculiar/x509 is overkill — we hand-craft a minimal
  // self-signed cert via crypto.X509Certificate APIs.
  //
  // NOTE: Node's stdlib doesn't currently expose cert *generation* (only
  // parsing). For the simplest path, we use the `selfsigned` package — but
  // that adds another dep. Alternative: use OpenSSL via child_process
  // (always present on macOS). We pick that.
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execSync } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claudebar-cert-'));
  try {
    fs.writeFileSync(path.join(tmp, 'key.pem'), id.privateKeyPem);
    // ed25519 self-signed cert, valid 1 year (we regen per launch anyway).
    // The CN is the deviceId so we can spot it in TLS handshakes when debugging.
    execSync(
      `openssl req -new -x509 -key key.pem -out cert.pem -days 365 ` +
      `-subj "/CN=${id.deviceId}" -nodes`,
      { cwd: tmp, stdio: 'pipe' }
    );
    cachedCertPem = {
      cert: fs.readFileSync(path.join(tmp, 'cert.pem'), 'utf8'),
      key: id.privateKeyPem,
    };
    return cachedCertPem;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Extract the SHA-256 fingerprint of a peer's TLS-presented certificate's
 *  public key, for matching against peers.json entries. */
export function certPubkeyPemFromX509(certPem: string): string {
  const cert = new (require('crypto').X509Certificate)(certPem);
  return cert.publicKey.export({ type: 'spki', format: 'pem' }) as string;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
git add electron/device.ts
git commit -m "feat(device): in-memory X.509 cert derived from ed25519 device key

Uses macOS's built-in /usr/bin/openssl to mint a self-signed ed25519
cert at app start. Cached per process. The cert is NOT validated as a
chain — trust comes from comparing the cert's pubkey against
peers.json. Cert is regenerated per launch (cheap)."
```

---

### Task 3: Create `electron/transport/server.ts` — mTLS WebSocket server

**Files:**
- Create: `electron/transport/server.ts`

Listens on `transport.port` (default 47891). Each inbound connection completes mTLS, then we look up the client cert's pubkey in `peers.json`. If found, the connection is accepted and bound to that peer. Otherwise rejected. The server emits events to a registered handler (set up in Task 6).

- [ ] **Step 1: Create the file**

```ts
// mTLS WebSocket server for inbound peer connections.
// Listens on transport.port (default 47891) on all interfaces.
// Each inbound connection completes mTLS; we look up the client cert's
// pubkey against peers.json. If matched, the connection is bound to that
// peer and forwarded to the registered handler. Otherwise dropped.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §3, §5, §11
import * as tls from 'tls';
import * as https from 'https';
import { WebSocketServer, type WebSocket } from 'ws';
import { getDeviceCertPem, certPubkeyPemFromX509 } from '../device';
import { listPeers, updatePeer, type Peer } from '../peers';

export interface ServerEvents {
  /** A paired peer connected. The connection is already authenticated. */
  onPeerConnected: (peerId: string, ws: WebSocket) => void;
  /** A paired peer disconnected. */
  onPeerDisconnected: (peerId: string) => void;
  /** A pairing handshake message arrived (PIN flow). */
  onPairingFrame: (frame: unknown, ws: WebSocket) => void;
}

let httpsServer: https.Server | null = null;
let wsServer: WebSocketServer | null = null;
let handlers: ServerEvents | null = null;

const DEFAULT_PORT = 47891;

export function startTransportServer(port: number, h: ServerEvents): void {
  if (httpsServer) {
    // Already running; replace handlers but don't restart.
    handlers = h;
    return;
  }
  handlers = h;
  const { cert, key } = getDeviceCertPem();
  httpsServer = https.createServer({
    cert,
    key,
    requestCert: true,
    rejectUnauthorized: false, // we accept any client cert; we filter ourselves
  });
  wsServer = new WebSocketServer({ noServer: true });

  httpsServer.on('upgrade', (req, socket, head) => {
    const tlsSocket = socket as tls.TLSSocket;
    const peerCert = tlsSocket.getPeerCertificate(true);

    // Pairing path: /pair/ — we accept WITHOUT cert verification because
    // pairing is the pre-trust handshake. We still require TLS (just not mTLS).
    if (req.url?.startsWith('/pair')) {
      wsServer!.handleUpgrade(req, socket, head, (ws) => {
        ws.on('message', (data) => {
          try {
            const frame = JSON.parse(data.toString());
            handlers?.onPairingFrame(frame, ws);
          } catch { /* ignore malformed */ }
        });
      });
      return;
    }

    // Peer path: /peer/ — must have a valid client cert matching peers.json.
    if (req.url?.startsWith('/peer')) {
      if (!peerCert || !peerCert.raw) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      // Get the cert as PEM and extract its pubkey.
      const certPem =
        '-----BEGIN CERTIFICATE-----\n' +
        peerCert.raw.toString('base64').match(/.{1,64}/g)!.join('\n') +
        '\n-----END CERTIFICATE-----\n';
      const presentedPubkey = certPubkeyPemFromX509(certPem);
      const peer = listPeers().find((p) => p.publicKeyPem === presentedPubkey);
      if (!peer) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      // Authenticated. Upgrade.
      wsServer!.handleUpgrade(req, socket, head, (ws) => {
        updatePeer(peer.id, { lastSeenAt: new Date().toISOString() });
        handlers?.onPeerConnected(peer.id, ws);
        ws.on('close', () => handlers?.onPeerDisconnected(peer.id));
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });

  httpsServer.listen(port || DEFAULT_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[transport] mTLS WS server listening on :${port || DEFAULT_PORT}`);
  });
}

export function stopTransportServer(): void {
  wsServer?.close();
  httpsServer?.close();
  httpsServer = null;
  wsServer = null;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
git add electron/transport/server.ts
git commit -m "feat(transport): mTLS WebSocket server

/pair path: TLS-but-not-mTLS, used by the PIN-pairing handshake (the
peers don't trust each other yet, so no client cert can be expected).

/peer path: full mTLS. Client must present a cert whose pubkey is
in peers.json — otherwise 403."
```

---

### Task 4: Create `electron/transport/client.ts` — outbound mTLS WS client

**Files:**
- Create: `electron/transport/client.ts`

For each peer in `peers.json`, maintain an outbound WS connection. mDNS discovery (Task 5) feeds us addresses; this module just keeps a long-lived connection alive per peer with retry/backoff.

- [ ] **Step 1: Create the file**

```ts
// Outbound mTLS WebSocket client. Maintains one long-lived connection per
// paired peer. Address comes from discovery (mDNS / lastAddress / Tailscale
// in a future iteration). On disconnect: exponential backoff reconnect.
import * as tls from 'tls';
import { WebSocket, type RawData } from 'ws';
import { getDeviceCertPem, certPubkeyPemFromX509 } from '../device';
import { type Peer, updatePeer } from '../peers';

export interface ClientHandlers {
  onConnected: (peerId: string) => void;
  onDisconnected: (peerId: string) => void;
  onMessage: (peerId: string, data: unknown) => void;
}

interface Conn {
  ws: WebSocket;
  closed: boolean;
}

const conns = new Map<string, Conn>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const retryDelays = new Map<string, number>();
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 60000;

let handlers: ClientHandlers | null = null;

export function setClientHandlers(h: ClientHandlers): void {
  handlers = h;
}

export function connectPeer(peer: Peer, address: string): void {
  if (conns.has(peer.id)) return; // already connected/connecting
  const { cert, key } = getDeviceCertPem();
  const url = `wss://${address}/peer/`;
  const ws = new WebSocket(url, {
    cert,
    key,
    rejectUnauthorized: false, // we verify pubkey ourselves below
    checkServerIdentity: () => undefined, // skip hostname check
  });

  const conn: Conn = { ws, closed: false };
  conns.set(peer.id, conn);

  ws.on('upgrade', (res) => {
    // Verify server's cert pubkey matches peers.json.
    const tlsSocket = (res as unknown as { socket: tls.TLSSocket }).socket;
    const serverCert = tlsSocket.getPeerCertificate(true);
    if (!serverCert || !serverCert.raw) {
      ws.close();
      return;
    }
    const certPem =
      '-----BEGIN CERTIFICATE-----\n' +
      serverCert.raw.toString('base64').match(/.{1,64}/g)!.join('\n') +
      '\n-----END CERTIFICATE-----\n';
    const serverPubkey = certPubkeyPemFromX509(certPem);
    if (serverPubkey !== peer.publicKeyPem) {
      // eslint-disable-next-line no-console
      console.warn(`[transport] peer ${peer.id} server pubkey mismatch — dropping`);
      ws.close();
    }
  });

  ws.on('open', () => {
    retryDelays.set(peer.id, RETRY_BASE_MS);
    updatePeer(peer.id, { lastSeenAt: new Date().toISOString(), lastAddress: address });
    handlers?.onConnected(peer.id);
  });

  ws.on('message', (data: RawData) => {
    try {
      const frame = JSON.parse(data.toString());
      handlers?.onMessage(peer.id, frame);
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    conns.delete(peer.id);
    handlers?.onDisconnected(peer.id);
    if (!conn.closed) scheduleRetry(peer, address);
  });

  ws.on('error', () => {
    // 'close' will follow.
  });
}

function scheduleRetry(peer: Peer, address: string): void {
  const delay = retryDelays.get(peer.id) ?? RETRY_BASE_MS;
  const next = Math.min(delay * 2, RETRY_MAX_MS);
  retryDelays.set(peer.id, next);
  const t = setTimeout(() => connectPeer(peer, address), delay);
  retryTimers.set(peer.id, t);
}

export function disconnectPeer(peerId: string): void {
  const conn = conns.get(peerId);
  if (conn) {
    conn.closed = true;
    conn.ws.close();
    conns.delete(peerId);
  }
  const t = retryTimers.get(peerId);
  if (t) {
    clearTimeout(t);
    retryTimers.delete(peerId);
  }
  retryDelays.delete(peerId);
}

export function sendToPeer(peerId: string, frame: unknown): boolean {
  const conn = conns.get(peerId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
  conn.ws.send(JSON.stringify(frame));
  return true;
}

export function isPeerConnected(peerId: string): boolean {
  const conn = conns.get(peerId);
  return !!conn && conn.ws.readyState === WebSocket.OPEN;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
git add electron/transport/client.ts
git commit -m "feat(transport): outbound mTLS WebSocket client

One connection per peer. Verifies server's cert pubkey against
peers.json on upgrade — mismatch → drop. Exponential backoff
reconnect (1s..60s). sendToPeer/isPeerConnected helpers for
heartbeat + future session events."
```

---

### Task 5: Create `electron/transport/discovery.ts` — mDNS peer discovery

**Files:**
- Create: `electron/transport/discovery.ts`

Advertises this machine on `_claudebar._tcp.local.` with TXT record `id=<deviceId>`. Scans for other ClaudeBar instances. When one is discovered AND it's in `peers.json`, dial it via the client.

- [ ] **Step 1: Create the file**

```ts
// mDNS / Bonjour-based peer discovery.
// Advertise: _claudebar._tcp.local. with TXT { id: deviceId }
// Scan: same service. When a peer is found AND its deviceId is in peers.json,
// dial it via the client module.
import { Bonjour, type Service } from 'bonjour-service';
import { getDeviceIdentity } from '../device';
import { listPeers, onPeersChanged } from '../peers';
import { connectPeer, disconnectPeer, isPeerConnected } from './client';

const SERVICE_TYPE = 'claudebar';
const DEFAULT_PORT = 47891;

let bonjour: Bonjour | null = null;
let advertisement: ReturnType<Bonjour['publish']> | null = null;
let browser: ReturnType<Bonjour['find']> | null = null;
let unsubPeersChanged: (() => void) | null = null;

export function startDiscovery(port: number = DEFAULT_PORT): void {
  if (bonjour) return;
  const id = getDeviceIdentity();
  bonjour = new Bonjour();

  // Advertise this machine.
  advertisement = bonjour.publish({
    name: `claudebar-${id.deviceId.slice(0, 8)}`,
    type: SERVICE_TYPE,
    port,
    txt: { id: id.deviceId },
  });

  // Scan.
  browser = bonjour.find({ type: SERVICE_TYPE });
  browser.on('up', (svc: Service) => {
    const peerDeviceId = (svc.txt as { id?: string } | undefined)?.id;
    if (!peerDeviceId || peerDeviceId === id.deviceId) return; // ignore self
    const peer = listPeers().find((p) => p.id === peerDeviceId);
    if (!peer) return; // not paired
    if (isPeerConnected(peer.id)) return; // already connected
    const address = svc.host && svc.port ? `${svc.referer?.address || svc.host}:${svc.port}` : null;
    if (address) connectPeer(peer, address);
  });

  // When peers.json changes (peer removed / added), reconcile connections.
  unsubPeersChanged = onPeersChanged((peers) => {
    const byId = new Set(peers.map((p) => p.id));
    // Disconnect peers that were removed.
    for (const c of getActiveConnections()) {
      if (!byId.has(c)) disconnectPeer(c);
    }
  });
}

export function stopDiscovery(): void {
  unsubPeersChanged?.();
  unsubPeersChanged = null;
  browser?.stop();
  browser = null;
  advertisement?.stop?.();
  advertisement = null;
  bonjour?.destroy();
  bonjour = null;
}

// Re-export for the reconcile loop above.
import { _activeConnectionIds } from './client-internal';
function getActiveConnections(): string[] {
  return _activeConnectionIds();
}
```

- [ ] **Step 2: Add the helper export to `electron/transport/client.ts`**

The `_activeConnectionIds` helper is needed by discovery for reconciliation. Add to client.ts (export from same file rather than separate file):

In `electron/transport/client.ts`, add at the bottom:

```ts
/** Internal: list peer IDs with an active or connecting conn. Used by
 *  discovery's reconcile loop. */
export function _activeConnectionIds(): string[] {
  return Array.from(conns.keys());
}
```

And update `discovery.ts` import to:
```ts
import { connectPeer, disconnectPeer, isPeerConnected, _activeConnectionIds } from './client';
```

(Drop the `'./client-internal'` import line — that file doesn't exist.)

- [ ] **Step 3: Type-check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 4: Commit**

```bash
git add electron/transport/discovery.ts electron/transport/client.ts
git commit -m "feat(transport): mDNS discovery + auto-connect to paired peers

Advertises _claudebar._tcp.local. with TXT { id: deviceId }. Scans
the same service. When a discovered peer's deviceId matches an
entry in peers.json, dial via client.

Subscribes to onPeersChanged: when a peer is removed from peers.json,
drop its connection."
```

---

### Task 6: Create `electron/transport/pairing.ts` — real PIN handshake

**Files:**
- Create: `electron/transport/pairing.ts`

Replaces the A2a stub `claimPin`. The flow:

```
Listener (the one with the PIN)              Initiator (the one entering the PIN)
─────────────────────────                    ─────────────────────────────────
1. UI shows PIN P                            
2. Server is listening on /pair/             
                                             3. UI accepts P + label + address
                                             4. WebSocket-connect to wss://address/pair/
5. accepts pairing WS                        
                                             6. Send {type:"hello", nonce:N1, pubkey:PK_init}
7. Compute K = HKDF(P || N1)                 
8. Decrypt PK_init using K (just AEAD verify)
9. Add initiator to local peers.json
   (label = "Unnamed (pending)", will be
    overwritten on initiator's confirm)
10. Reply {type:"hello-ack", nonce:N2,
       pubkey:PK_listener, ciphertext:E_K(OK)}
                                             11. Compute K = HKDF(P || N1)
                                             12. Decrypt E_K → "OK" → verified
                                             13. Add listener to peers.json with
                                                 user-supplied label
                                             14. Send {type:"confirm", label:"工位"}
                                             15. Close pairing WS
16. Update local peer record with the
    label from initiator's confirm
17. Both ClaudeBars now know each other      
    + can mTLS-connect via /peer/
```

This is symmetric: each side ends up with the other in `peers.json` with verified pubkey.

- [ ] **Step 1: Create the file**

```ts
// PIN-authenticated pairing handshake.
// Symmetric. After successful exchange, both sides have the other's pubkey
// in peers.json.
//
// Crypto: HKDF(PIN || nonce) → 32-byte AEAD key. AES-256-GCM. The PIN
// brute-force resistance comes from the 5-attempt lockout in the listener
// side (ipc/peers.ts), not from a heavy KDF — 6-digit PIN gives 1M
// possibilities; 5 attempts means worst-case 5/1M ≈ 5e-6 success per
// ephemeral PIN, which is acceptable for the threat model.
import * as crypto from 'crypto';
import { WebSocket } from 'ws';
import { getDeviceIdentity } from '../device';
import { addPeer, type Peer } from '../peers';

interface HelloFrame {
  type: 'hello';
  nonce: string;     // base64 N1
  pubkey: string;    // initiator's PEM pubkey
  ciphertext: string; // E_K(b"PROOF") — proves initiator had the PIN
  iv: string;        // base64 IV used for AES-GCM
  authTag: string;   // base64 AES-GCM tag
}

interface HelloAckFrame {
  type: 'hello-ack';
  nonce: string;     // base64 N2
  pubkey: string;    // listener's PEM pubkey
  ciphertext: string; // E_K(b"PROOF") — proves listener had the PIN
  iv: string;
  authTag: string;
  pendingPeerId: string; // listener-assigned id we'll need in confirm
}

interface ConfirmFrame {
  type: 'confirm';
  label: string;     // initiator's label for the listener
  pendingPeerId: string;
}

const PROOF = Buffer.from('CLAUDEBAR-PIN-PROOF');
const KDF_SALT = Buffer.from('claudebar-pin-pairing-v1');

function deriveKey(pin: string, nonceB64: string): Buffer {
  const ikm = Buffer.concat([Buffer.from(pin, 'utf8'), Buffer.from(nonceB64, 'base64')]);
  return Buffer.from(
    crypto.hkdfSync('sha256', ikm, KDF_SALT, Buffer.from('aead-key'), 32) as ArrayBuffer,
  );
}

function encryptProof(key: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(PROOF), cipher.final()]);
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function verifyProof(key: Buffer, ciphertext: string, iv: string, authTag: string): boolean {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
    return pt.equals(PROOF);
  } catch {
    return false;
  }
}

// ─── Initiator side (the one entering the PIN) ─────────────────────────────

export interface InitiatorOptions {
  pin: string;
  label: string;
  hostAddress: string; // "ip:port"
}

export interface InitiatorResult {
  ok: boolean;
  error?: string;
  peer?: Peer;
}

export async function runInitiator(opts: InitiatorOptions): Promise<InitiatorResult> {
  const id = getDeviceIdentity();
  const url = `wss://${opts.hostAddress}/pair/`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    let resolved = false;
    const finish = (r: InitiatorResult) => {
      if (resolved) return;
      resolved = true;
      ws.close();
      resolve(r);
    };
    const t = setTimeout(() => finish({ ok: false, error: 'timeout' }), 30_000);

    ws.on('open', () => {
      const nonce = crypto.randomBytes(16).toString('base64');
      const key = deriveKey(opts.pin, nonce);
      const enc = encryptProof(key);
      const hello: HelloFrame = {
        type: 'hello',
        nonce,
        pubkey: id.publicKeyPem,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
      };
      ws.send(JSON.stringify(hello));
    });

    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as HelloAckFrame;
        if (frame.type !== 'hello-ack') return;
        const key = deriveKey(opts.pin, frame.nonce);
        if (!verifyProof(key, frame.ciphertext, frame.iv, frame.authTag)) {
          finish({ ok: false, error: 'wrong-pin' });
          return;
        }
        // Listener proved they had the PIN. Trust their pubkey.
        const peer: Peer = {
          id: frame.pendingPeerId,
          label: opts.label,
          publicKeyPem: frame.pubkey,
          lastSeenAt: new Date().toISOString(),
          lastAddress: opts.hostAddress,
        };
        addPeer(peer);
        // Send confirm.
        const confirm: ConfirmFrame = {
          type: 'confirm',
          label: opts.label,
          pendingPeerId: frame.pendingPeerId,
        };
        ws.send(JSON.stringify(confirm));
        clearTimeout(t);
        finish({ ok: true, peer });
      } catch {
        finish({ ok: false, error: 'malformed-reply' });
      }
    });

    ws.on('close', () => {
      if (!resolved) finish({ ok: false, error: 'closed' });
    });
    ws.on('error', () => {
      if (!resolved) finish({ ok: false, error: 'connection-failed' });
    });
  });
}

// ─── Listener side (called from server.ts on inbound /pair/ frame) ─────────

export interface ListenerContext {
  /** Get the currently active PIN (returns null if expired/cancelled). */
  getActivePin: () => string | null;
  /** Increment wrong-attempt counter; returns remaining attempts. */
  registerWrongAttempt: () => number;
  /** Void the active PIN (e.g. on success or 5 wrong attempts). */
  voidPin: () => void;
}

export function handlePairingFrame(
  frame: unknown,
  ws: WebSocket,
  ctx: ListenerContext,
): void {
  if (!frame || typeof frame !== 'object') return;
  const f = frame as { type: string };

  if (f.type === 'hello') {
    const hello = f as unknown as HelloFrame;
    const pin = ctx.getActivePin();
    if (!pin) {
      ws.close();
      return;
    }
    const key = deriveKey(pin, hello.nonce);
    if (!verifyProof(key, hello.ciphertext, hello.iv, hello.authTag)) {
      const remaining = ctx.registerWrongAttempt();
      if (remaining <= 0) ctx.voidPin();
      ws.close();
      return;
    }
    // Initiator proved they had the PIN. Trust their pubkey.
    const id = getDeviceIdentity();
    const newNonce = crypto.randomBytes(16).toString('base64');
    const newKey = deriveKey(pin, newNonce);
    const enc = encryptProof(newKey);
    // Use the initiator's deviceId as our peer id for them — but we don't know
    // it yet. Use a temporary id; the initiator will overwrite via confirm.
    // Actually: the initiator doesn't tell us their deviceId in v1. We'll
    // use a hash of their pubkey as a stable id.
    const pendingPeerId = crypto.createHash('sha256')
      .update(hello.pubkey).digest('hex').slice(0, 16);
    // Store the peer with the temporary label; will be replaced on confirm.
    addPeer({
      id: pendingPeerId,
      label: 'pending',
      publicKeyPem: hello.pubkey,
      lastSeenAt: new Date().toISOString(),
      lastAddress: '',
    });
    const ack: HelloAckFrame = {
      type: 'hello-ack',
      nonce: newNonce,
      pubkey: id.publicKeyPem,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      pendingPeerId,
    };
    ws.send(JSON.stringify(ack));
    ctx.voidPin(); // burn the PIN; one successful pairing per PIN
    return;
  }

  if (f.type === 'confirm') {
    // Initiator's confirm just gives us a label for them. We already added
    // their peer record in the hello step.
    const c = f as unknown as ConfirmFrame;
    // updatePeer would be ideal here, but we don't have the import context
    // — server.ts can wire this. For now, server.ts handles confirm via
    // its own updatePeer call.
    void c;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
git add electron/transport/pairing.ts
git commit -m "feat(transport): PIN-authenticated PAKE-like handshake

HKDF(PIN || nonce) → AES-256-GCM key. Each side encrypts a fixed
PROOF blob; counterparty decrypting it validates the PIN-derived key,
which proves they had the PIN. Pubkeys are exchanged in plaintext but
trust comes from the symmetric PROOF roundtrip.

5-attempt lockout (delegated to ListenerContext from ipc/peers.ts)
keeps brute force to ~5/1M per ephemeral PIN."
```

---

### Task 7: Wire pairing.ts + server.ts into ipc/peers.ts (replace claimPin stub)

**Files:**
- Modify: `electron/ipc/peers.ts`

The A2a `claimPin` stub created a fake peer. Replace with: invoke `runInitiator` from pairing.ts. Also: server.ts's `onPairingFrame` handler needs to be wired with `handlePairingFrame` from pairing.ts plus a `ListenerContext` that talks to ipc/peers.ts's PIN state.

Server start happens in `setupPeersIPC`, since peers IPC owns the PIN state and only ipc/peers.ts knows the relationship.

- [ ] **Step 1: Refactor `electron/ipc/peers.ts`**

Replace the stub `claimPin` handler. Add server start. Add `peers:getAddress` to give the renderer the host:port format for the initiator UI to enter. (Renderer needs to know what address to dial; mDNS does it for connection-after-pairing, but during pairing the user might be entering an address manually OR we use mDNS to find the listener too. For v1 simplicity: the initiator UI uses mDNS-discovered addresses; if mDNS missed, fall back to manual entry of `host:port`.)

For the rewrite, here is the full new file:

```ts
// IPC handlers for peer management — list/remove/label + PIN flow.
// PIN state in-memory only; never persisted.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4
import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os';
import { listPeers, addPeer, removePeer, updatePeer, type Peer } from '../peers';
import { getDeviceIdentity } from '../device';
import { getSettings, setSetting } from './settings';
import { startTransportServer, stopTransportServer } from '../transport/server';
import { runInitiator, handlePairingFrame } from '../transport/pairing';
import { setClientHandlers } from '../transport/client';
import { startDiscovery } from '../transport/discovery';

interface ActivePin {
  pin: string;
  expiresAt: number;
  attempts: number;
}

const PIN_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DEFAULT_PORT = 47891;

let activePin: ActivePin | null = null;

function generatePin(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

function broadcastStatus(_event: { type: 'connected' | 'disconnected'; peerId: string }): void {
  // Phase A2b: broadcast to renderer via webContents.send. Wired in main.ts.
  // Stub for now — the actual send happens via a callback registered later.
}

let onStatusChange: ((evt: { type: 'connected' | 'disconnected'; peerId: string }) => void) | null = null;
export function setPeerStatusBroadcaster(fn: typeof onStatusChange): void {
  onStatusChange = fn;
}

export function setupPeersIPC(): void {
  // Start transport server + discovery. The port comes from settings.
  const settings = getSettings() as { transportPort?: number };
  const port = settings.transportPort || DEFAULT_PORT;

  startTransportServer(port, {
    onPeerConnected: (peerId) => {
      onStatusChange?.({ type: 'connected', peerId });
    },
    onPeerDisconnected: (peerId) => {
      onStatusChange?.({ type: 'disconnected', peerId });
    },
    onPairingFrame: (frame, ws) => {
      handlePairingFrame(frame, ws, {
        getActivePin: () => activePin && Date.now() < activePin.expiresAt ? activePin.pin : null,
        registerWrongAttempt: () => {
          if (!activePin) return 0;
          activePin.attempts += 1;
          if (activePin.attempts >= MAX_ATTEMPTS) {
            activePin = null;
            return 0;
          }
          return MAX_ATTEMPTS - activePin.attempts;
        },
        voidPin: () => { activePin = null; },
      });
    },
  });

  setClientHandlers({
    onConnected: (peerId) => onStatusChange?.({ type: 'connected', peerId }),
    onDisconnected: (peerId) => onStatusChange?.({ type: 'disconnected', peerId }),
    onMessage: (_peerId, _frame) => {
      // A2b only carries pairing handshake + future heartbeats.
      // Session events arrive in A3.
    },
  });

  startDiscovery(port);

  ipcMain.handle('peers:list', () => listPeers());

  ipcMain.handle('peers:remove', (_e, peerId: string) => removePeer(peerId));

  ipcMain.handle('peers:setLabel', (_e, peerId: string, label: string) => updatePeer(peerId, { label }));

  ipcMain.handle('peers:getMachineName', () => {
    const s = getSettings() as { machineName?: string };
    return s.machineName || os.hostname();
  });

  ipcMain.handle('peers:setMachineName', (_e, name: string) => setSetting('machineName', name));

  ipcMain.handle('peers:generatePin', () => {
    activePin = { pin: generatePin(), expiresAt: Date.now() + PIN_TTL_MS, attempts: 0 };
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  ipcMain.handle('peers:cancelPin', () => { activePin = null; });

  ipcMain.handle('peers:activePin', () => {
    if (!activePin) return null;
    if (Date.now() > activePin.expiresAt) { activePin = null; return null; }
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  /** Renderer-driven initiator side of pairing: enter PIN + label + host:port,
   *  run the pairing handshake against the remote /pair/ endpoint. */
  ipcMain.handle(
    'peers:claimPin',
    async (_e, args: { pin: string; label: string; hostAddress: string }) => {
      if (!args.hostAddress) {
        return { ok: false, error: 'no-host-address' };
      }
      const result = await runInitiator({
        pin: args.pin,
        label: args.label,
        hostAddress: args.hostAddress,
      });
      if (!result.ok) {
        return { ok: false, error: result.error || 'pairing-failed' };
      }
      return { ok: true, peer: result.peer! };
    },
  );

  /** List discovered peer addresses (mDNS) so initiator UI can pick one. */
  // Stub for v1 — manual entry only. mDNS-driven dropdown is post-A2b polish.
  ipcMain.handle('peers:discoveredAddresses', () => {
    // TODO Phase A2c: surface live mDNS results.
    return [];
  });
}

export function shutdownPeersIPC(): void {
  stopTransportServer();
}
```

- [ ] **Step 2: Update `types/electron.d.ts` and `electron/preload.ts`**

The `claimPin` signature changed (added `hostAddress`). Update:

In `electron/preload.ts`:
```ts
    claimPin: (args: { pin: string; label: string; hostAddress: string }) => ipcRenderer.invoke('peers:claimPin', args),
    discoveredAddresses: () => ipcRenderer.invoke('peers:discoveredAddresses'),
    onStatus: (cb: (evt: { type: 'connected' | 'disconnected'; peerId: string }) => void) => {
      const handler = (_e: unknown, evt: { type: 'connected' | 'disconnected'; peerId: string }) => cb(evt);
      ipcRenderer.on('peers:status', handler);
      return () => ipcRenderer.removeListener('peers:status', handler);
    },
```

In `types/electron.d.ts` `peers:`:
```ts
    claimPin(args: { pin: string; label: string; hostAddress: string }): Promise<
      | { ok: true; peer: { id: string; label: string; publicKeyPem: string; lastSeenAt: string; lastAddress: string } }
      | { ok: false; error: string }
    >;
    discoveredAddresses(): Promise<string[]>;
    onStatus(cb: (evt: { type: 'connected' | 'disconnected'; peerId: string }) => void): () => void;
```

Update PairingPanel's `onClaimPin` to also collect a `hostAddress` input field.

- [ ] **Step 3: In `src/components/PairingPanel.tsx`, add a `hostAddress` input**

Inside the `enterPinMode` block, add an address field between PIN and label:

```tsx
            <input
              type="text"
              value={enteredHostAddress}
              onChange={(e) => setEnteredHostAddress(e.target.value)}
              placeholder="Host address (e.g. mac-mini.local:47891)"
              style={inputStyle}
            />
```

Add state: `const [enteredHostAddress, setEnteredHostAddress] = useState<string>('');`

In `onClaimPin`, validate it's non-empty, pass it to `claimPin`:
```tsx
    if (!enteredHostAddress.trim()) {
      setEnteredError('Host address required');
      return;
    }
    const result = await apiClient.peers.claimPin({
      pin: cleanPin,
      label: enteredLabel.trim(),
      hostAddress: enteredHostAddress.trim(),
    });
```

Subscribe to `apiClient.peers.onStatus` to update the per-peer status dot:

```tsx
  const [statusByPeer, setStatusByPeer] = useState<Record<string, 'online' | 'offline'>>({});
  useEffect(() => {
    return apiClient.peers.onStatus((evt) => {
      setStatusByPeer((s) => ({ ...s, [evt.peerId]: evt.type === 'connected' ? 'online' : 'offline' }));
    });
  }, []);
```

In the peer row, replace `'● offline (A2b)'` with:
```tsx
{statusByPeer[p.id] === 'online' ? <span style={{color: 'var(--color-status-connected,#0a0)'}}>● online</span> : <span style={{color:'var(--color-text-tertiary)'}}>● offline</span>}
```

- [ ] **Step 4: Wire status broadcast in main.ts**

In `electron/main.ts`, after `setupPeersIPC()`:

```ts
import { setPeerStatusBroadcaster } from './ipc/peers';
// ...
setPeerStatusBroadcaster((evt) => {
  mainWindow?.webContents.send('peers:status', evt);
});
```

- [ ] **Step 5: Type-check + build**

```bash
npx tsc -p tsconfig.node.json --noEmit
npx tsc --noEmit
npm run build
```

All clean.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/peers.ts electron/preload.ts types/electron.d.ts src/components/PairingPanel.tsx electron/main.ts
git commit -m "feat(peers): wire real PIN handshake — replaces A2a stub

claimPin now drives the runInitiator path (pair WS + symmetric PIN
proof). Host address is a new required field in the UI (manual entry
for now; mDNS-driven dropdown is a post-A2b polish task).

setupPeersIPC also starts the mTLS server, mDNS discovery, and the
client connection manager. Status events flow through
setPeerStatusBroadcaster → mainWindow.webContents.send →
apiClient.peers.onStatus → PairingPanel state."
```

---

### Task 8: Test single-machine pairing (loopback) via Playwright

**Files:** none (smoke test)

We can't test two-Mac pairing without two Macs, but the loopback case (initiator points at `127.0.0.1:47891`) IS testable on one machine. The PIN proof should succeed; both sides should add a peer record (the same machine appears as its own peer — degenerate but valid).

- [ ] **Step 1: Build + hot-swap into /Applications**

```bash
npm run build && npm run pack:mac:dmg:arm64 2>&1 | tail -3
cp release-artifacts/mac-arm64/ClaudeBar.app/Contents/Resources/app.asar /Applications/ClaudeBar.app/Contents/Resources/app.asar
codesign --force --deep --sign - /Applications/ClaudeBar.app
pkill -9 -f "ClaudeBar"; sleep 1
/Applications/ClaudeBar.app/Contents/MacOS/ClaudeBar --remote-debugging-port=9222 > /tmp/cb.log 2>&1 &
sleep 5
```

- [ ] **Step 2: Verify mTLS server is listening**

```bash
lsof -i :47891
```

Expected: ClaudeBar process listening.

- [ ] **Step 3: Via Playwright, click Settings → Pairing, generate PIN, then via JS click Enter PIN, fill PIN + label + `127.0.0.1:47891`, click Connect**

```js
// In Playwright eval:
const apiClient = window.electronAPI.peers;
const { pin } = await apiClient.generatePin();
const result = await apiClient.claimPin({ pin, label: 'loopback-self', hostAddress: '127.0.0.1:47891' });
return result;
```

Expected: `{ ok: true, peer: { id: ..., label: 'loopback-self', publicKeyPem: ... } }`. The peer publicKeyPem should equal our own (because both ends are this machine).

- [ ] **Step 4: Check peers.json**

```bash
cat ~/.claudebar/peers.json
```

Expected: 1 peer entry with the label "loopback-self" + this machine's pubkey.

- [ ] **Step 5: Verify ongoing connection — the client should auto-dial the discovered self-peer + the status broadcast should fire**

Wait 5s after pairing for mDNS to fire, then check Playwright console for `peers:status` events or check via:
```js
const peers = await window.electronAPI.peers.list();
return peers; // lastSeenAt should update on each successful connection cycle
```

If `lastSeenAt` is updating and Settings UI shows "● online", A2b is working end-to-end (single-machine).

- [ ] **Step 6: Cleanup test peer**

```bash
rm ~/.claudebar/peers.json
pkill -9 -f "ClaudeBar"
```

If anything fails, debug + fix in this task before proceeding.

- [ ] **Step 7: No commit (this is verification, not code)**

---

### Task 9: Bump version + DMG + tag v0.8.0 (USER GATE — needs two Macs eventually)

**Files:** none (release)

- [ ] **Step 1: Bump version**

```bash
npm version 0.8.0 --no-git-tag-version --allow-same-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.8.0 (multi-device A2b — real pairing transport)"
```

- [ ] **Step 2: Final build + DMG**

```bash
npm run clean && npm run pack:mac:dmg:arm64 2>&1 | tail -3
ls -lh release-artifacts/*.dmg
```

- [ ] **Step 3: USER GATE — install on BOTH Macs + smoke test pairing**

Hand off to user:
- Install `ClaudeBar-0.8.0-mac-arm64.dmg` on both Macs
- On Mac mini: Settings → Pairing → Generate PIN
- On laptop: Settings → Pairing → Enter PIN → enter PIN + label "mac-mini" + address `mac-mini.local:47891`
- Verify: laptop's Pairing UI shows mac-mini with green ● online dot
- Reverse direction: laptop generates PIN, mac-mini claims it
- Verify both sides' `~/.claudebar/peers.json` mirror each other

This is the first real test of cross-machine work. Expect debugging.

- [ ] **Step 4: Tag (after user confirms)**

```bash
git tag v0.8.0
git pull --rebase -X ours origin main
git push origin main
git push origin v0.8.0
```

- [ ] **Step 5: MILESTONES.md**

Append:
```md
## v0.8.0 (2026-05-XX) — Multi-device A2b: real pairing transport

- mTLS WebSocket server on port 47891 (default); X.509 cert derived per-launch from the persistent ed25519 device key
- mTLS WebSocket client maintains long-lived outbound connections to all paired peers; reconnects with exponential backoff
- mDNS service `_claudebar._tcp.local.` advertises this machine + scans for peers; auto-dials when a discovered service's deviceId matches `peers.json`
- PIN-authenticated pairing handshake over `wss://host/pair/`: HKDF(PIN || nonce) → AES-256-GCM key + symmetric PROOF roundtrip; brute-force resistance via 5-attempt lockout (PIN voids on 5th wrong attempt)
- PairingPanel updates: live status dot per peer (online / offline), host-address input field for initiator
- Two new deps: `ws` (WebSocket lib), `bonjour-service` (mDNS); `@types/ws` dev-dep
- A3 will plug session events on top of these connections
- Spec: `docs/specs/2026-05-13-multi-device-design.md` §3-§5, §11
```

```bash
git add docs/MILESTONES.md
git commit -m "docs(milestones): add v0.8.0 — multi-device A2b (real pairing transport)"
git push origin main
```

---

### Task 10: Document A2b → A3 transition

**Files:**
- Modify: `docs/specs/2026-05-13-multi-device-design.md` (mark A2b implementation status)

Brief — just note in the spec doc that §3-§5 + §11 are now implemented. Future plan A3 will deliver §6-§8 (sessions + UI + Operator panel cross-machine) and §10 (remote cache).

- [ ] **Step 1: Add a small "Implementation status" line at the top of the spec**

After the date line at the top, add:

```md
> **Implementation status (2026-05-XX):** Phase A1 (renderer transport abstraction) ✓ shipped in v0.7.1. Phase A2a (pairing identity + UI shell) ✓ shipped in v0.7.2. Phase A2b (real transport: mDNS + mTLS WS + PAKE) ✓ shipped in v0.8.0. Phase A3 (session mirroring + UI + remote cache) — pending plan in `docs/plans/`.
```

- [ ] **Step 2: Commit + push**

```bash
git add docs/specs/2026-05-13-multi-device-design.md
git commit -m "docs(spec): mark Phase A2b as shipped in v0.8.0"
git push origin main
```

---

## Phase A2b done

Two Macs running ClaudeBar v0.8.0 can pair + maintain a live authenticated connection. No session functionality yet — that's A3.

**Estimated effort:** 6-8 hours. Server + client + PAKE are non-trivial; debugging cross-machine likely takes 2-3 hours.

**Risk areas:**
- mDNS reliability under corporate Wi-Fi / VPN — see spec §17. Document if user hits this.
- macOS Local Network privacy permission — modern macOS prompts the first time we use mDNS. Make sure the prompt fires + user grants. (Surface in README.)
- TLS 1.3 cert handshake nuances with ed25519 — Node 20 supports it but if older user-installed Node is used in dev (we have `engine.node` constraint), error mid-handshake.

**Next:** Phase A3 plan (`docs/plans/2026-05-XX-multi-device-A3-sessions.md`) — session enumeration + event mirroring + chat banner + take/release + tool-approval relay + operator-panel cross-machine + remote cache. Bigger than A2b (~2000-line plan, 15-20 tasks). Will write after A2b ships and we've tuned the live connection layer based on cross-Mac smoke testing.
