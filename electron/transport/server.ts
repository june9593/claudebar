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
import { listPeers, updatePeer } from '../peers';

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

    // Pairing path: /pair/ — TLS without mTLS verification because pairing
    // is the pre-trust handshake.
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
      const peerCert = tlsSocket.getPeerCertificate(true);
      if (!peerCert || !peerCert.raw) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      // Reconstruct cert as PEM and extract its pubkey.
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
