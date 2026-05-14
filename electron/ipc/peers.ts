// IPC handlers for peer management — list/remove/label + PIN generation.
// PIN state is in-memory only (a Map<pinHash, expiry>); never persisted.
// In Phase A2a, claimPin just creates a fake peer entry so we can iterate
// the UI; A2b replaces it with the real SPAKE2-style PAKE handshake.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4
import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os';
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
    return s.machineName || os.hostname();
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
