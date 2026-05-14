// Outbound mTLS WebSocket client. Maintains one long-lived connection per
// paired peer. Address comes from discovery (mDNS / lastAddress / Tailscale
// in a future iteration). On disconnect: exponential backoff reconnect.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §3, §5
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
const RETRY_MAX_MS = 60_000;

let handlers: ClientHandlers | null = null;

export function setClientHandlers(h: ClientHandlers): void {
  handlers = h;
}

export function connectPeer(peer: Peer, address: string): void {
  if (conns.has(peer.id)) return; // already connected/connecting
  const { cert, key } = getDeviceCertPem();
  const url = `wss://${address}/peer/`;
  const wsOpts = {
    cert,
    key,
    rejectUnauthorized: false, // we verify pubkey ourselves below
    // Node's TLS expects (servername, cert) => Error | undefined, but the
    // ws library's types insist on `=> boolean`. We pass the Node-correct
    // signature via the options object, which ws forwards verbatim to
    // Node's tls.connect; the runtime is Node, not the lib's types.
    checkServerIdentity: () => undefined as unknown as Error | undefined,
  };
  const ws = new WebSocket(url, wsOpts as unknown as ConstructorParameters<typeof WebSocket>[1]);

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

/** Internal: list peer IDs with an active or connecting conn. Used by
 *  discovery's reconcile loop. */
export function _activeConnectionIds(): string[] {
  return Array.from(conns.keys());
}
