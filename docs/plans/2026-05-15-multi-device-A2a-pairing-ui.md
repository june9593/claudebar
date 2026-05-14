# ClaudeBar Multi-Device · Phase A2a — Device identity + peers store + static Pairing UI

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Set up the local prerequisites for multi-device pairing — a persistent ed25519 device keypair, a `peers.json` trust store, and a Settings → Pairing UI section that LISTS paired peers and exposes a "Generate PIN" button. The PIN button just SHOWS a number; no network protocol yet. Ships as v0.7.2 — still no over-the-wire functionality, but every piece of state and UI is in place so A2b can plug in the actual transport in one focused phase.

**Architecture:** Pure local state + UI. Three new files in main process (`device.ts`, `peers.ts`, `ipc/peers.ts`); one new file in renderer (`PairingPanel.tsx`); `apiClient` interface extended with a `peers` domain; `OperatorPanel` Settings tab gets a new section. Zero network code. Zero new runtime deps (uses Node's built-in `crypto.generateKeyPairSync` for ed25519).

**Tech Stack:** Node `crypto`, existing apiClient pattern, existing IPC handler pattern, React (functional component).

**Source spec:** [`docs/specs/2026-05-13-multi-device-design.md`](../specs/2026-05-13-multi-device-design.md) §4 (pairing) + §11 (security model).

**Working directory:** `~/edge/claudebar`. All paths relative to repo root. Head at start: `42be712`.

---

## Phase A2a — Static identity + UI shell (v0.7.2)

7 tasks. After this phase:

- `~/.claudebar/device.json` exists on first launch with a fresh ed25519 keypair (mode 0600)
- `~/.claudebar/peers.json` exists (initially `{ "peers": [] }`)
- Settings → Pairing section visible with: machine name input, Generate PIN button (shows a 6-digit number for 5 min, no real consequence), empty paired-machines list, Add remote machine button (shows PIN input UI but submitting it just stores a fake peer entry)
- v0.7.2 DMG ships; nothing user-facing changes since you have no peers, but the foundation is real

A2b will add: mDNS advertisement + scan, WS+mTLS server/client, real PIN handshake (SPAKE2-style PAKE), connection state in `peersStore`.

---

### Task 1: Create `electron/device.ts` — device keypair management

**Files:**
- Create: `electron/device.ts`

Owns `~/.claudebar/device.json` with a persistent ed25519 keypair. Generated on first call, then read from disk forever. Mode 0600.

- [ ] **Step 1: Create the file**

Write `electron/device.ts`:

```ts
// Device identity — a persistent ed25519 keypair stored in
// ~/.claudebar/device.json (mode 0600). The public key is what other paired
// ClaudeBars know us by; the private key signs/decrypts the mTLS handshake
// in Phase A2b. Generated once on first launch, then read from disk forever.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4 + §11
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DeviceIdentity {
  /** Stable per-machine UUID (separate from the pubkey, used as the human
   *  reference: `peers[].id` etc.). */
  deviceId: string;
  /** PEM-encoded ed25519 private key. Sensitive. */
  privateKeyPem: string;
  /** PEM-encoded ed25519 public key. Distributed during pairing. */
  publicKeyPem: string;
  /** ISO8601 timestamp this identity was generated. */
  createdAt: string;
}

const CLAUDEBAR_DIR = path.join(os.homedir(), '.claudebar');
const DEVICE_FILE = path.join(CLAUDEBAR_DIR, 'device.json');

let cached: DeviceIdentity | null = null;

export function getDeviceIdentity(): DeviceIdentity {
  if (cached) return cached;

  if (fs.existsSync(DEVICE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8')) as DeviceIdentity;
      // Sanity check the shape; if anything's missing, regenerate.
      if (data.deviceId && data.privateKeyPem && data.publicKeyPem && data.createdAt) {
        cached = data;
        return data;
      }
    } catch {
      // fall through to regenerate
    }
  }

  cached = generateAndPersist();
  return cached;
}

function generateAndPersist(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const identity: DeviceIdentity = {
    deviceId: crypto.randomUUID(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true });
  fs.writeFileSync(DEVICE_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
  // Re-chmod in case mkdirSync left more permissive bits.
  try { fs.chmodSync(DEVICE_FILE, 0o600); } catch { /* ignore */ }

  return identity;
}

/** Compute a short SHA-256 fingerprint of the public key, formatted for human
 *  comparison (e.g. "ab12-cd34-ef56-7890"). Used in Settings UI + peer rows. */
export function pubkeyFingerprint(publicKeyPem: string): string {
  const hash = crypto.createHash('sha256').update(publicKeyPem).digest('hex');
  // 16 hex chars in 4-char groups, lowercase.
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add electron/device.ts
git commit -m "feat(device): persistent ed25519 device identity in ~/.claudebar/device.json

Generated once on first call, then read from disk. Mode 0600. UUID
deviceId + ed25519 keypair (PEM). Public-key fingerprint helper for
human-readable comparison.

Spec §4, §11. Phase A2a step 1 — no caller yet (added in Task 5)."
```

---

### Task 2: Create `electron/peers.ts` — paired peer storage

**Files:**
- Create: `electron/peers.ts`

Owns `~/.claudebar/peers.json` with the trust list. Read/write helpers + a per-key listener. NOT mode 0600 (pubkeys aren't secret); default mode is fine.

- [ ] **Step 1: Create the file**

Write `electron/peers.ts`:

```ts
// Paired-peer trust store. ~/.claudebar/peers.json holds the list of
// machines this ClaudeBar trusts and may communicate with. Each entry is
// { id, label, publicKeyPem, lastSeenAt, lastAddress }. Pubkeys aren't
// secret (they identify peers, not authenticate them — the peer must
// prove possession of the matching private key during mTLS handshake).
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4 + §11
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Peer {
  /** Stable id chosen by the peer at its own first launch (their deviceId). */
  id: string;
  /** Human-readable label, set by THIS machine when pairing (e.g. "工位"). */
  label: string;
  /** PEM-encoded ed25519 public key. Used to verify peer identity in mTLS. */
  publicKeyPem: string;
  /** ISO8601 timestamp of the last successful connection (or pairing if
   *  never connected). Updated by transport in A2b. */
  lastSeenAt: string;
  /** Last IP/host:port we successfully connected to. Used as a fallback
   *  after mDNS misses. Empty string if never connected. */
  lastAddress: string;
}

interface PeersFile {
  version: 1;
  peers: Peer[];
}

const CLAUDEBAR_DIR = path.join(os.homedir(), '.claudebar');
const PEERS_FILE = path.join(CLAUDEBAR_DIR, 'peers.json');

type Listener = (peers: Peer[]) => void;
const listeners = new Set<Listener>();

function load(): PeersFile {
  if (!fs.existsSync(PEERS_FILE)) {
    return { version: 1, peers: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8')) as PeersFile;
    if (data.version === 1 && Array.isArray(data.peers)) return data;
  } catch {
    // fall through
  }
  return { version: 1, peers: [] };
}

function save(file: PeersFile): void {
  fs.mkdirSync(CLAUDEBAR_DIR, { recursive: true });
  fs.writeFileSync(PEERS_FILE, JSON.stringify(file, null, 2));
  for (const fn of listeners) fn(file.peers);
}

export function listPeers(): Peer[] {
  return load().peers;
}

export function addPeer(peer: Peer): void {
  const file = load();
  // Replace by id if already present.
  const existing = file.peers.findIndex((p) => p.id === peer.id);
  if (existing >= 0) {
    file.peers[existing] = peer;
  } else {
    file.peers.push(peer);
  }
  save(file);
}

export function removePeer(peerId: string): void {
  const file = load();
  file.peers = file.peers.filter((p) => p.id !== peerId);
  save(file);
}

export function updatePeer(peerId: string, patch: Partial<Peer>): void {
  const file = load();
  const idx = file.peers.findIndex((p) => p.id === peerId);
  if (idx < 0) return;
  file.peers[idx] = { ...file.peers[idx], ...patch };
  save(file);
}

export function onPeersChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add electron/peers.ts
git commit -m "feat(peers): paired-peer trust store at ~/.claudebar/peers.json

Versioned JSON (currently v1), { peers: Peer[] }. CRUD helpers +
onPeersChanged listener. Per spec §4 a peer entry is
{id, label, publicKeyPem, lastSeenAt, lastAddress}. Pubkeys aren't
secret; default file mode is fine (private key lives in device.json
which is 0600 — Task 1)."
```

---

### Task 3: Create `electron/ipc/peers.ts` — IPC handlers + PIN state

**Files:**
- Create: `electron/ipc/peers.ts`

Renderer-facing IPC: list peers, generate a PIN, claim a PIN (placeholder for A2b's real handshake), remove a peer, change machine label. PINs live in process memory only — never persisted.

- [ ] **Step 1: Create the file**

Write `electron/ipc/peers.ts`:

```ts
// IPC handlers for peer management — list/remove/label + PIN generation.
// PIN state is in-memory only (a Map<pinHash, expiry>); never persisted.
// In Phase A2a, claimPin just creates a fake peer entry so we can iterate
// the UI; A2b replaces it with the real SPAKE2-style PAKE handshake.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4
import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { listPeers, addPeer, removePeer, updatePeer, type Peer } from '../peers';
import { getDeviceIdentity } from '../device';
import { getSettings, setSetting } from './settings';

interface ActivePin {
  /** The 6-digit numeric PIN (string with leading zeros). */
  pin: string;
  /** Expiry epoch ms. */
  expiresAt: number;
  /** Number of wrong attempts so far. */
  attempts: number;
}

const PIN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

let activePin: ActivePin | null = null;

function generatePin(): string {
  // 6 numeric digits with leading zeros preserved.
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

export function setupPeersIPC(): void {
  ipcMain.handle('peers:list', () => {
    return listPeers();
  });

  ipcMain.handle('peers:remove', (_e, peerId: string) => {
    removePeer(peerId);
  });

  ipcMain.handle('peers:setLabel', (_e, peerId: string, label: string) => {
    updatePeer(peerId, { label });
  });

  ipcMain.handle('peers:getMachineName', () => {
    const s = getSettings() as { machineName?: string };
    return s.machineName || require('os').hostname();
  });

  ipcMain.handle('peers:setMachineName', (_e, name: string) => {
    setSetting('machineName', name);
  });

  /** Generate a fresh PIN. Invalidates any previous active PIN. */
  ipcMain.handle('peers:generatePin', () => {
    activePin = {
      pin: generatePin(),
      expiresAt: Date.now() + PIN_TTL_MS,
      attempts: 0,
    };
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  /** Cancel any active PIN (e.g. user clicked Cancel before pairing happened). */
  ipcMain.handle('peers:cancelPin', () => {
    activePin = null;
  });

  /** Get info about the currently active PIN (so re-mounted UI can resume the
   *  countdown). Returns null if no PIN active. */
  ipcMain.handle('peers:activePin', () => {
    if (!activePin) return null;
    if (Date.now() > activePin.expiresAt) {
      activePin = null;
      return null;
    }
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  /** Claim a PIN (called by the OTHER machine in real pairing). In A2a this
   *  is a stub that just stores a fake peer entry so we can iterate the UI.
   *  A2b replaces this with the real PAKE handshake. */
  ipcMain.handle('peers:claimPin', (_e, args: { pin: string; label: string }) => {
    if (!activePin) {
      return { ok: false, error: 'no-active-pin' };
    }
    if (Date.now() > activePin.expiresAt) {
      activePin = null;
      return { ok: false, error: 'pin-expired' };
    }
    if (activePin.pin !== args.pin) {
      activePin.attempts += 1;
      if (activePin.attempts >= MAX_ATTEMPTS) {
        activePin = null;
        return { ok: false, error: 'too-many-attempts' };
      }
      return { ok: false, error: 'wrong-pin', attemptsRemaining: MAX_ATTEMPTS - activePin.attempts };
    }

    // PIN matched. In A2a we mint a fake peer entry. The pubkey is OUR own,
    // which is bogus but lets us iterate UI; A2b replaces this with the real
    // peer pubkey received over the PAKE handshake.
    const ourId = getDeviceIdentity();
    const peer: Peer = {
      id: `stub-${Date.now()}`,
      label: args.label || 'Unnamed peer',
      publicKeyPem: ourId.publicKeyPem,
      lastSeenAt: new Date().toISOString(),
      lastAddress: '',
    };
    addPeer(peer);
    activePin = null;
    return { ok: true, peer };
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc -p tsconfig.node.json --noEmit
```

Clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add electron/ipc/peers.ts
git commit -m "feat(peers): IPC handlers — list/remove/label/PIN flow

In-memory PIN state (never persisted), 6-digit numeric, 5min TTL,
MAX_ATTEMPTS=5 brute-force lockout. peers:claimPin is a stub in A2a
that mints a fake peer entry so the UI can be iterated; A2b replaces
with the real PAKE handshake. machineName lives in settings.json
alongside transport.* keys (added in A2b)."
```

---

### Task 4: Wire `peers` IPC into `electron/preload.ts` + `types/electron.d.ts`

**Files:**
- Modify: `electron/preload.ts`
- Modify: `types/electron.d.ts`

Expose 8 methods on `electronAPI.peers`. Same pattern as the existing `claude`, `plugins`, etc. blocks.

- [ ] **Step 1: Read current preload.ts to find the right insertion point**

```bash
grep -n "settings:\|claude:\|plugins:\|skills:\|commands:\|stats:\|^});" electron/preload.ts | head -30
```

Note the line where the `electronAPI` object closes (a `});` near the bottom).

- [ ] **Step 2: Add the `peers` block to `electron/preload.ts`**

Inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object, add this block (placement: after `stats`, before the closing `})`). Use the same single-line method style as the surrounding code:

```ts
  peers: {
    list: () => ipcRenderer.invoke('peers:list'),
    remove: (peerId: string) => ipcRenderer.invoke('peers:remove', peerId),
    setLabel: (peerId: string, label: string) => ipcRenderer.invoke('peers:setLabel', peerId, label),
    getMachineName: () => ipcRenderer.invoke('peers:getMachineName'),
    setMachineName: (name: string) => ipcRenderer.invoke('peers:setMachineName', name),
    generatePin: () => ipcRenderer.invoke('peers:generatePin'),
    cancelPin: () => ipcRenderer.invoke('peers:cancelPin'),
    activePin: () => ipcRenderer.invoke('peers:activePin'),
    claimPin: (args: { pin: string; label: string }) => ipcRenderer.invoke('peers:claimPin', args),
  },
```

- [ ] **Step 3: Add the `peers` block to `types/electron.d.ts` `ElectronAPI` interface**

Find the `ElectronAPI` interface and add this block (placement: after the `stats` block):

```ts
  peers: {
    list: () => Promise<Array<{
      id: string;
      label: string;
      publicKeyPem: string;
      lastSeenAt: string;
      lastAddress: string;
    }>>;
    remove: (peerId: string) => Promise<void>;
    setLabel: (peerId: string, label: string) => Promise<void>;
    getMachineName: () => Promise<string>;
    setMachineName: (name: string) => Promise<void>;
    generatePin: () => Promise<{ pin: string; expiresAt: number }>;
    cancelPin: () => Promise<void>;
    activePin: () => Promise<{ pin: string; expiresAt: number } | null>;
    claimPin: (args: { pin: string; label: string }) => Promise<
      | { ok: true; peer: { id: string; label: string; publicKeyPem: string; lastSeenAt: string; lastAddress: string } }
      | { ok: false; error: 'no-active-pin' | 'pin-expired' | 'wrong-pin' | 'too-many-attempts'; attemptsRemaining?: number }
    >;
  };
```

- [ ] **Step 4: Type-check both processes**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc -p tsconfig.node.json --noEmit
npx tsc --noEmit
```

Both clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add electron/preload.ts types/electron.d.ts
git commit -m "feat(peers): expose peers IPC on electronAPI + type it

9 methods on electronAPI.peers. apiClient automatically picks them up
(it's just type ApiClient = ElectronAPI)."
```

---

### Task 5: Wire setup into `electron/main.ts`

**Files:**
- Modify: `electron/main.ts`

Call `setupPeersIPC()` in whenReady. Also call `getDeviceIdentity()` once at startup so the keypair is generated/loaded before any IPC handler might need it.

- [ ] **Step 1: Add imports**

In `electron/main.ts`, with the other `import { setupXIPC } from './ipc/X';` lines:

```ts
import { setupPeersIPC } from './ipc/peers';
import { getDeviceIdentity } from './device';
```

- [ ] **Step 2: Add calls inside `whenReady`**

Find the block where other `setupXIPC()` calls happen (around line 263 based on earlier scan). Add:

```ts
  // Eagerly load device identity so any IPC call that needs it gets a hot
  // cache (and the keypair is generated on first launch before user can
  // open Settings).
  getDeviceIdentity();
  setupPeersIPC();
```

Place these AFTER `setupSettingsIPC()` (peers IPC reads/writes settings via getSettings/setSetting, so settings IPC must be ready first).

- [ ] **Step 3: Type-check + verify the file launches cleanly via build**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

Both clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add electron/main.ts
git commit -m "feat(peers): wire setupPeersIPC + eager getDeviceIdentity in main.ts

Eager identity load means the ed25519 keypair is generated on first
launch (before user touches Settings → Pairing), so the Settings UI's
'this machine pubkey fingerprint' display has no spinner."
```

---

### Task 6: Build the Settings → Pairing UI section

**Files:**
- Create: `src/components/PairingPanel.tsx`
- Modify: `src/components/operator/OperatorPanel.tsx` (mount PairingPanel inside SettingsTab)

Pure UI. The Settings tab currently has Claude CLI / Window / Diagnostics groups. Add a **Pairing** group BETWEEN Window and Diagnostics. Components: machine name input, Generate-PIN button + active PIN display + countdown, paired peers list (with Remove buttons), Add-remote-machine flow (PIN input + label input + Connect).

- [ ] **Step 1: Create `src/components/PairingPanel.tsx`**

Write the file. The component is self-contained — owns its own state, calls `apiClient.peers.*`. It ONLY renders the Pairing group's contents (the parent Card wrapper is added in Step 2). Verbatim:

```tsx
import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

type Peer = Awaited<ReturnType<typeof apiClient.peers.list>>[number];

export function PairingPanel() {
  const [machineName, setMachineName] = useState<string>('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [activePin, setActivePin] = useState<{ pin: string; expiresAt: number } | null>(null);
  const [pinNow, setPinNow] = useState<number>(Date.now());
  const [enterPinMode, setEnterPinMode] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [enteredLabel, setEnteredLabel] = useState<string>('');
  const [enteredError, setEnteredError] = useState<string | null>(null);

  // Initial load.
  useEffect(() => {
    void apiClient.peers.getMachineName().then(setMachineName);
    void apiClient.peers.list().then(setPeers);
    void apiClient.peers.activePin().then(setActivePin);
  }, []);

  // PIN countdown — tick once per second while a PIN is active.
  useEffect(() => {
    if (!activePin) return;
    const t = setInterval(() => setPinNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activePin]);

  // Auto-clear expired PIN.
  useEffect(() => {
    if (activePin && pinNow > activePin.expiresAt) setActivePin(null);
  }, [pinNow, activePin]);

  const onGeneratePin = async () => {
    const result = await apiClient.peers.generatePin();
    setActivePin(result);
  };
  const onCancelPin = async () => {
    await apiClient.peers.cancelPin();
    setActivePin(null);
  };
  const onRemovePeer = async (peerId: string) => {
    await apiClient.peers.remove(peerId);
    setPeers(await apiClient.peers.list());
  };
  const onMachineNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setMachineName(v);
    void apiClient.peers.setMachineName(v);
  };
  const onClaimPin = async () => {
    setEnteredError(null);
    const cleanPin = enteredPin.replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      setEnteredError('PIN must be 6 digits');
      return;
    }
    if (!enteredLabel.trim()) {
      setEnteredError('Give the remote machine a label');
      return;
    }
    const result = await apiClient.peers.claimPin({ pin: cleanPin, label: enteredLabel.trim() });
    if (result.ok) {
      setEnterPinMode(false);
      setEnteredPin('');
      setEnteredLabel('');
      setPeers(await apiClient.peers.list());
    } else {
      const msg = {
        'no-active-pin': 'No active PIN on this machine. (A2a stub — both halves of the pair share state.)',
        'pin-expired': 'PIN expired',
        'wrong-pin': `Wrong PIN${'attemptsRemaining' in result ? ` (${result.attemptsRemaining} tries left)` : ''}`,
        'too-many-attempts': 'Too many wrong attempts; PIN voided',
      }[result.error];
      setEnteredError(msg);
    }
  };

  const secondsLeft = activePin ? Math.max(0, Math.ceil((activePin.expiresAt - pinNow) / 1000)) : 0;
  const pinFmt = activePin ? `${activePin.pin.slice(0, 3)}-${activePin.pin.slice(3)}` : '';
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SettingRow label="This machine name">
        <input
          type="text"
          value={machineName}
          onChange={onMachineNameChange}
          style={inputStyle}
          placeholder="(hostname)"
        />
      </SettingRow>

      <SettingRow label="Allow remote control">
        {!activePin ? (
          <button onClick={onGeneratePin} style={buttonStyle}>Generate PIN</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              fontSize: 18, fontWeight: 600, letterSpacing: 1,
              color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)',
            }}>{pinFmt}</code>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {mmss} left
            </span>
            <button onClick={onCancelPin} style={{ ...buttonStyle, marginLeft: 'auto' }}>Cancel</button>
          </div>
        )}
      </SettingRow>

      <div>
        <div style={sectionLabel}>Paired machines:</div>
        {peers.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
            (none yet)
          </div>
        ) : (
          peers.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', marginBottom: 4,
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 6,
              background: 'var(--color-bg-secondary)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                ● offline (A2b)
              </span>
              <button
                onClick={() => onRemovePeer(p.id)}
                style={{ ...buttonStyle, marginLeft: 'auto' }}
              >Remove</button>
            </div>
          ))
        )}
      </div>

      <SettingRow label="Add remote machine">
        {!enterPinMode ? (
          <button onClick={() => setEnterPinMode(true)} style={buttonStyle}>Enter PIN</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <input
              type="text"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              placeholder="6-digit PIN"
              maxLength={7}
              style={inputStyle}
            />
            <input
              type="text"
              value={enteredLabel}
              onChange={(e) => setEnteredLabel(e.target.value)}
              placeholder="Label (e.g. mac-mini)"
              style={inputStyle}
            />
            {enteredError && (
              <div style={{ fontSize: 11, color: 'var(--color-status-disconnected, #e53)' }}>
                {enteredError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onClaimPin} style={buttonStyle}>Connect</button>
              <button
                onClick={() => { setEnterPinMode(false); setEnteredPin(''); setEnteredLabel(''); setEnteredError(null); }}
                style={{ ...buttonStyle, background: 'transparent', color: 'var(--color-text-tertiary)' }}
              >Cancel</button>
            </div>
          </div>
        )}
      </SettingRow>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-input)',
  border: '0.5px solid var(--color-border-primary)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  minWidth: 120,
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '0.5px solid var(--color-border-primary)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)', letterSpacing: 0.5,
  marginTop: 8, marginBottom: 4,
};
```

- [ ] **Step 2: Mount PairingPanel inside `SettingsTab` of `OperatorPanel.tsx`**

Add import at the top of `src/components/operator/OperatorPanel.tsx`:

```ts
import { PairingPanel } from '../PairingPanel';
```

Find the `SettingsTab` function. It renders Cards for "Claude CLI", "Window", "Diagnostics" (in that order). Insert a new `<Card title="Pairing">` between Window and Diagnostics:

```tsx
      <Card title="Pairing">
        <PairingPanel />
      </Card>
```

- [ ] **Step 3: Type-check + build**

```bash
cd /Users/yueliu/edge/claudebar
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

All clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/yueliu/edge/claudebar
git add src/components/PairingPanel.tsx src/components/operator/OperatorPanel.tsx
git commit -m "feat(ui): Settings → Pairing section

Machine name input, Generate PIN (6-digit, 5min countdown), paired
machines list with Remove, Add-remote-machine flow (PIN + label).
A2a-stubbed: claimPin against the same machine creates a fake peer
entry so we can iterate UI; A2b plugs in real PAKE handshake. Status
dot says '● offline (A2b)' since no transport exists yet."
```

---

### Task 7: Bump version + DMG smoke + tag v0.7.2

**Files:** none (release)

- [ ] **Step 1: Bump version**

```bash
cd /Users/yueliu/edge/claudebar
npm version 0.7.2 --no-git-tag-version --allow-same-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.7.2 (multi-device A2a — pairing UI shell)"
```

- [ ] **Step 2: Clean build + DMG**

```bash
cd /Users/yueliu/edge/claudebar
npm run clean && npm run pack:mac:dmg:arm64 2>&1 | tail -3
ls -lh release-artifacts/*.dmg
shasum -a 256 release-artifacts/*.dmg
```

Expected: `ClaudeBar-0.7.2-mac-arm64.dmg` produced.

- [ ] **Step 3: Local smoke test (USER GATE)**

`open release-artifacts/ClaudeBar-0.7.2-mac-arm64.dmg`. Drag to /Applications. Launch. Verify:
- Existing v0.7.1 functionality still works (no regression — refactor only, plus added IPC)
- Open Operator Panel → Settings tab → scroll to Pairing section
- Machine name shows hostname; editing it persists
- Generate PIN shows a 6-digit PIN with countdown that ticks every second
- Cancel button voids the PIN
- "Add remote machine" → enter the same PIN you just generated + a label → Connect → see a fake peer entry appear in the list
- Click Remove on the fake peer → it disappears
- Verify `~/.claudebar/device.json` exists with mode 0600 (`ls -la ~/.claudebar/device.json`)
- Verify `~/.claudebar/peers.json` reflects the add/remove

This is a self-contained UI test — both halves of the "pairing" use the same machine in A2a. A2b is when it really pairs across two Macs.

- [ ] **Step 4: Tag (USER APPROVAL GATE)**

```bash
cd /Users/yueliu/edge/claudebar
git tag v0.7.2
git pull --rebase -X ours origin main
git push origin main
git push origin v0.7.2
```

- [ ] **Step 5: Update MILESTONES**

Append to `docs/MILESTONES.md` BEFORE the "## See also" section:

```md
## v0.7.2 (2026-05-15) — Multi-device A2a: pairing identity + UI shell

- New `~/.claudebar/device.json` (mode 0600): persistent ed25519 keypair generated on first launch
- New `~/.claudebar/peers.json`: paired-peer trust store (initially empty)
- New `electronAPI.peers` IPC: list/remove/setLabel/getMachineName/setMachineName/generatePin/cancelPin/activePin/claimPin
- New `PairingPanel` rendered as a "Pairing" card in Settings tab
- 6-digit PIN, 5-minute TTL, 5-attempt brute-force lockout (in-memory, never persisted)
- Phase A2a stub: claiming a PIN on the same machine creates a fake peer entry to enable UI iteration; A2b replaces with real PAKE handshake over WS+mTLS
- Spec: `docs/specs/2026-05-13-multi-device-design.md` §4 + §11
```

```bash
cd /Users/yueliu/edge/claudebar
git add docs/MILESTONES.md
git commit -m "docs(milestones): add v0.7.2 — multi-device A2a (pairing UI shell)"
git push origin main
```

---

## Phase A2a done

After these 7 tasks: identity + storage + UI all in place, no network code yet. v0.7.2 ships. Next phase A2b plugs the actual transport in:
- mDNS discovery
- WS+mTLS server/client
- Real SPAKE2-style PAKE for PIN handshake (replaces A2a's stub `claimPin`)
- Live `peers.lastSeenAt` updates from heartbeats
- Settings → Pairing status dot turns real (green/yellow/grey instead of "offline (A2b)")

A2b spec/tasks live in `docs/plans/2026-05-XX-multi-device-A2b-transport.md` (to be written after A2a ships and we've smoke-tested the UI affordances).
