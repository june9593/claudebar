// mDNS / Bonjour-based peer discovery.
// Advertise: _claudebar._tcp.local. with TXT { id: deviceId }
// Scan: same service. When a peer is found AND its deviceId is in peers.json,
// dial it via the client module.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §5
import { Bonjour, type Service } from 'bonjour-service';
import { getDeviceIdentity } from '../device';
import { listPeers, onPeersChanged } from '../peers';
import { connectPeer, disconnectPeer, isPeerConnected, _activeConnectionIds } from './client';

const SERVICE_TYPE = 'claudebar';
const DEFAULT_PORT = 47891;

type Advertiser = ReturnType<Bonjour['publish']>;
type BrowserHandle = ReturnType<Bonjour['find']>;

let bonjour: Bonjour | null = null;
let advertisement: Advertiser | null = null;
let browser: BrowserHandle | null = null;
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
    // Pick best address: referer.address (advertiser's IP) > host
    const addr = svc.referer?.address || svc.host;
    if (addr && svc.port) {
      connectPeer(peer, `${addr}:${svc.port}`);
    }
  });

  // When peers.json changes (peer removed / added), reconcile connections.
  unsubPeersChanged = onPeersChanged((peers) => {
    const byId = new Set(peers.map((p) => p.id));
    for (const c of _activeConnectionIds()) {
      if (!byId.has(c)) disconnectPeer(c);
    }
  });
}

export function stopDiscovery(): void {
  unsubPeersChanged?.();
  unsubPeersChanged = null;
  browser?.stop();
  browser = null;
  advertisement?.stop?.(() => { /* ignore */ });
  advertisement = null;
  bonjour?.destroy();
  bonjour = null;
}
