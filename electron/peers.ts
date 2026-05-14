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
