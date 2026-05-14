// PIN-authenticated pairing handshake.
// Symmetric. After successful exchange, both sides have the other's pubkey
// in peers.json.
//
// Crypto: HKDF(PIN || nonce) → 32-byte AEAD key. AES-256-GCM. The PIN
// brute-force resistance comes from the 5-attempt lockout in the listener
// (ipc/peers.ts), not from a heavy KDF — 6-digit PIN gives 1M possibilities;
// 5 attempts means ~5/1M success per ephemeral PIN, acceptable for the
// threat model (LAN, single user, paired hardware).
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §4
import * as crypto from 'crypto';
import { WebSocket } from 'ws';
import { getDeviceIdentity, getDeviceCertPem } from '../device';
import { addPeer, type Peer } from '../peers';

interface HelloFrame {
  type: 'hello';
  nonce: string;     // base64 N1
  pubkey: string;    // initiator's PEM pubkey
  deviceId: string;  // initiator's deviceId — listener stores this as peer.id
  ciphertext: string; // E_K(b"PROOF") — proves initiator had the PIN
  iv: string;        // base64 IV used for AES-GCM
  authTag: string;   // base64 AES-GCM tag
}

interface HelloAckFrame {
  type: 'hello-ack';
  nonce: string;     // base64 N2
  pubkey: string;    // listener's PEM pubkey
  deviceId: string;  // listener's deviceId — initiator stores this as peer.id
  ciphertext: string; // E_K(b"PROOF") — proves listener had the PIN
  iv: string;
  authTag: string;
}

interface ConfirmFrame {
  type: 'confirm';
  label: string;     // initiator's label for the listener
  initiatorDeviceId: string;
}

const PROOF = Buffer.from('CLAUDEBAR-PIN-PROOF');
const KDF_SALT = Buffer.from('claudebar-pin-pairing-v1');

function deriveKey(pin: string, nonceB64: string): Buffer {
  const ikm = Buffer.concat([Buffer.from(pin, 'utf8'), Buffer.from(nonceB64, 'base64')]);
  const out = crypto.hkdfSync('sha256', ikm, KDF_SALT, Buffer.from('aead-key'), 32);
  return Buffer.from(out);
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
    // Server is mTLS-aware (requestCert: true). Even on /pair/ (where the
    // server doesn't VERIFY the cert against peers.json), the TLS handshake
    // still requires the client to present *some* cert. Use our device cert
    // — its pubkey will end up in the listener's peers.json after the
    // PROOF exchange anyway.
    const { cert, key } = getDeviceCertPem();
    const wsOpts = {
      cert,
      key,
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined as unknown as Error | undefined,
    };
    const ws = new WebSocket(url, wsOpts as unknown as ConstructorParameters<typeof WebSocket>[1]);
    let resolved = false;
    const finish = (r: InitiatorResult) => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve(r);
    };
    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 30_000);

    ws.on('open', () => {
      const nonce = crypto.randomBytes(16).toString('base64');
      const key = deriveKey(opts.pin, nonce);
      const enc = encryptProof(key);
      const hello: HelloFrame = {
        type: 'hello',
        nonce,
        pubkey: id.publicKeyPem,
        deviceId: id.deviceId,
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
        // Listener proved they had the PIN. Trust their pubkey + deviceId.
        const peer: Peer = {
          id: frame.deviceId,
          label: opts.label,
          publicKeyPem: frame.pubkey,
          lastSeenAt: new Date().toISOString(),
          lastAddress: opts.hostAddress,
        };
        addPeer(peer);
        // Send confirm so the listener can update its label for us.
        const confirm: ConfirmFrame = {
          type: 'confirm',
          label: opts.label,
          initiatorDeviceId: id.deviceId,
        };
        ws.send(JSON.stringify(confirm));
        clearTimeout(timeout);
        finish({ ok: true, peer });
      } catch {
        finish({ ok: false, error: 'malformed-reply' });
      }
    });

    ws.on('close', () => {
      if (!resolved) finish({ ok: false, error: 'closed' });
    });
    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[pairing] initiator WS error:', err);
      // 'close' will follow; we report it as connection-failed if no other
      // error has been recorded.
      if (!resolved) finish({ ok: false, error: `connection-failed: ${err.message || err}` });
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
      try { ws.close(); } catch { /* ignore */ }
      return;
    }
    const key = deriveKey(pin, hello.nonce);
    if (!verifyProof(key, hello.ciphertext, hello.iv, hello.authTag)) {
      const remaining = ctx.registerWrongAttempt();
      if (remaining <= 0) ctx.voidPin();
      try { ws.close(); } catch { /* ignore */ }
      return;
    }
    // Initiator proved they had the PIN. Trust their pubkey + deviceId.
    const id = getDeviceIdentity();
    const newNonce = crypto.randomBytes(16).toString('base64');
    const newKey = deriveKey(pin, newNonce);
    const enc = encryptProof(newKey);
    addPeer({
      id: hello.deviceId,
      label: 'pending',
      publicKeyPem: hello.pubkey,
      lastSeenAt: new Date().toISOString(),
      lastAddress: '',
    });
    const ack: HelloAckFrame = {
      type: 'hello-ack',
      nonce: newNonce,
      pubkey: id.publicKeyPem,
      deviceId: id.deviceId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
    };
    ws.send(JSON.stringify(ack));
    ctx.voidPin(); // burn the PIN; one successful pairing per PIN
    return;
  }

  if (f.type === 'confirm') {
    // Initiator's confirm gives us a label for them.
    const c = f as unknown as ConfirmFrame;
    const { updatePeer } = require('../peers') as typeof import('../peers');
    updatePeer(c.initiatorDeviceId, { label: c.label });
  }
}
