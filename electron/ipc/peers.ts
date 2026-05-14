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

let onStatusChange:
  | ((evt: { type: 'connected' | 'disconnected'; peerId: string }) => void)
  | null = null;

export function setPeerStatusBroadcaster(
  fn: typeof onStatusChange,
): void {
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
        getActivePin: () =>
          activePin && Date.now() < activePin.expiresAt ? activePin.pin : null,
        registerWrongAttempt: () => {
          if (!activePin) return 0;
          activePin.attempts += 1;
          if (activePin.attempts >= MAX_ATTEMPTS) {
            activePin = null;
            return 0;
          }
          return MAX_ATTEMPTS - activePin.attempts;
        },
        voidPin: () => {
          activePin = null;
        },
      });
    },
  });

  setClientHandlers({
    onConnected: (peerId) =>
      onStatusChange?.({ type: 'connected', peerId }),
    onDisconnected: (peerId) =>
      onStatusChange?.({ type: 'disconnected', peerId }),
    onMessage: (_peerId, _frame) => {
      // A2b only carries pairing handshake + future heartbeats.
      // Session events arrive in A3.
    },
  });

  startDiscovery(port);

  ipcMain.handle('peers:list', () => listPeers());

  ipcMain.handle('peers:remove', (_e, peerId: string) =>
    removePeer(peerId),
  );

  ipcMain.handle(
    'peers:setLabel',
    (_e, peerId: string, label: string) =>
      updatePeer(peerId, { label }),
  );

  ipcMain.handle('peers:getMachineName', () => {
    const s = getSettings() as { machineName?: string };
    return s.machineName || os.hostname();
  });

  ipcMain.handle('peers:setMachineName', (_e, name: string) =>
    setSetting('machineName', name),
  );

  ipcMain.handle('peers:generatePin', () => {
    activePin = {
      pin: generatePin(),
      expiresAt: Date.now() + PIN_TTL_MS,
      attempts: 0,
    };
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  ipcMain.handle('peers:cancelPin', () => {
    activePin = null;
  });

  ipcMain.handle('peers:activePin', () => {
    if (!activePin) return null;
    if (Date.now() > activePin.expiresAt) {
      activePin = null;
      return null;
    }
    return { pin: activePin.pin, expiresAt: activePin.expiresAt };
  });

  /** Renderer-driven initiator side of pairing: enter PIN + label + host:port,
   *  run the pairing handshake against the remote /pair/ endpoint. */
  ipcMain.handle(
    'peers:claimPin',
    async (
      _e,
      args: { pin: string; label: string; hostAddress: string },
    ): Promise<
      | { ok: true; peer: Peer }
      | {
          ok: false;
          error: string;
        }
    > => {
      if (!args.hostAddress) {
        return { ok: false, error: 'no-host-address' };
      }
      const result = await runInitiator({
        pin: args.pin,
        label: args.label,
        hostAddress: args.hostAddress,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.error || 'pairing-failed',
        };
      }
      return { ok: true, peer: result.peer! };
    },
  );

  /** List discovered peer addresses (mDNS) so initiator UI can pick one.
   *  Stub for v1 — manual entry only. mDNS-driven dropdown is post-A2b. */
  ipcMain.handle('peers:discoveredAddresses', () => {
    return [];
  });
}

export function shutdownPeersIPC(): void {
  stopTransportServer();
}
