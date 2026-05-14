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
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}
