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

let cachedCertPem: { cert: string; key: string } | null = null;

/** Derive an in-memory self-signed X.509 ed25519 cert from the persistent
 *  device keypair. Used for mTLS server/client. Regenerated per launch
 *  (cheap; no need to persist). Caller does NOT validate the cert chain;
 *  trust is established by checking the cert's pubkey against peers.json.
 *
 *  Implementation: shells out to /usr/bin/openssl (always present on macOS).
 *  Node's stdlib doesn't expose X.509 generation as of Node 20, only parsing.
 */
export function getDeviceCertPem(): { cert: string; key: string } {
  if (cachedCertPem) return cachedCertPem;
  const id = getDeviceIdentity();
  const { execSync } = require('child_process') as typeof import('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claudebar-cert-'));
  try {
    fs.writeFileSync(path.join(tmp, 'key.pem'), id.privateKeyPem);
    // ed25519 self-signed cert, valid 1 year (we regen per launch anyway).
    // CN is the deviceId for human-readable TLS handshake debugging.
    execSync(
      `openssl req -new -x509 -key key.pem -out cert.pem -days 365 ` +
      `-subj "/CN=${id.deviceId}" -nodes`,
      { cwd: tmp, stdio: 'pipe' },
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

/** Extract the SPKI-PEM public key from a peer's TLS-presented X.509 cert,
 *  for matching against peers.json entries. */
export function certPubkeyPemFromX509(certPem: string): string {
  const cert = new crypto.X509Certificate(certPem);
  return cert.publicKey.export({ type: 'spki', format: 'pem' }) as string;
}
