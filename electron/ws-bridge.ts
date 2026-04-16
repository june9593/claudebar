/**
 * WebSocket bridge — runs in Electron main process.
 *
 * The renderer cannot set Origin headers on WebSocket connections,
 * so we create the WS here (using the `ws` package) where we have
 * full control. Messages are relayed via IPC.
 */

import { ipcMain, BrowserWindow } from 'electron';
import WebSocket from 'ws';
import * as ed from '@noble/ed25519';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/* ------------------------------------------------------------------ */
/*  Device Identity                                                    */
/* ------------------------------------------------------------------ */

interface DeviceIdentity {
  deviceId: string;
  publicKeyB64: string;
  privateKeyHex: string;
}

const CLIENT_ID = 'openclaw-control-ui';
const CLIENT_MODE = 'webchat';
const ROLE = 'operator';
const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing'];

function identityPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.clawbar', 'device-identity.json');
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function toB64url(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = crypto.createHash('sha256').update(data).digest();
  return toHex(hash);
}

async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  const p = identityPath();
  try {
    if (fs.existsSync(p)) {
      const stored = JSON.parse(fs.readFileSync(p, 'utf-8')) as DeviceIdentity;
      const pubBytes = Buffer.from(stored.publicKeyB64, 'base64url');
      const correctId = await sha256Hex(pubBytes);
      if (stored.deviceId !== correctId) stored.deviceId = correctId;
      return stored;
    }
  } catch { /* regenerate */ }

  const privBytes = ed.etc.randomBytes(32);
  const pubBytes = await ed.getPublicKeyAsync(privBytes);
  const deviceId = await sha256Hex(pubBytes);

  const identity: DeviceIdentity = {
    deviceId,
    publicKeyB64: toB64url(pubBytes),
    privateKeyHex: toHex(privBytes),
  };
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(identity), 'utf-8');
  return identity;
}

/* ------------------------------------------------------------------ */
/*  Bridge state                                                       */
/* ------------------------------------------------------------------ */

let ws: WebSocket | null = null;
let identity: DeviceIdentity | null = null;
let connected = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
const MAX_RETRIES = 5;

// Track request IDs so renderer can correlate responses
let connectReqId = '';
let historyReqId = '';
let currentGateway = '';
let currentToken = '';

// Track renderer-originated request methods for routing responses
const rendererReqs = new Map<string, string>();

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins[0] || null;
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  getWindow()?.webContents.send(channel, ...args);
}

function makeReq(method: string, params: Record<string, unknown>) {
  const id = crypto.randomUUID();
  return { raw: JSON.stringify({ type: 'req', id, method, params }), id };
}

/* ------------------------------------------------------------------ */
/*  Connect                                                            */
/* ------------------------------------------------------------------ */

async function doConnect(gatewayUrl: string, authToken: string) {
  // Clean up previous
  if (ws) {
    try { ws.close(); } catch { /* */ }
    ws = null;
  }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

  currentGateway = gatewayUrl;
  currentToken = authToken;

  if (!gatewayUrl) {
    sendToRenderer('ws:status', { connected: false, error: '未设置 Gateway URL' });
    return;
  }

  // Ensure identity
  if (!identity) {
    try { identity = await loadOrCreateIdentity(); }
    catch (e) { sendToRenderer('ws:status', { connected: false, error: `设备身份生成失败: ${e}` }); return; }
  }

  const wsUrl = gatewayUrl
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/+$/, '');

  // Derive the HTTP origin from the gateway URL for the Origin header
  const httpOrigin = gatewayUrl.replace(/\/+$/, '');

  ws = new WebSocket(wsUrl, { headers: { Origin: httpOrigin } });

  ws.on('open', () => {
    retries = 0;
    sendToRenderer('ws:status', { connected: false, error: null }); // connected but not authed yet
  });

  ws.on('message', async (raw: Buffer) => {
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw.toString()); } catch { return; }

    try {
      /* 1. connect.challenge → sign & respond */
      if (d.type === 'event' && d.event === 'connect.challenge') {
        const p = d.payload as { nonce: string };
        const signedAt = Date.now();
        const msg = [
          'v2', identity!.deviceId, CLIENT_ID, CLIENT_MODE, ROLE,
          SCOPES.join(','), String(signedAt), authToken, p.nonce,
        ].join('|');
        const sig = await ed.signAsync(new TextEncoder().encode(msg), fromHex(identity!.privateKeyHex));

        const r = makeReq('connect', {
          minProtocol: 3, maxProtocol: 3,
          client: { id: CLIENT_ID, version: 'control-ui', platform: 'electron', mode: CLIENT_MODE },
          role: ROLE, scopes: SCOPES,
          device: {
            id: identity!.deviceId,
            publicKey: identity!.publicKeyB64,
            signature: toB64url(sig),
            signedAt,
            nonce: p.nonce,
          },
          caps: [], auth: { token: authToken }, locale: 'en',
        });
        connectReqId = r.id;
        ws!.send(r.raw);
        return;
      }

      /* 2. connect response → hello-ok → fetch history */
      if (d.type === 'res' && d.id === connectReqId) {
        if (d.ok) {
          connected = true;
          sendToRenderer('ws:status', { connected: true, error: null });
          // Auto-fetch chat history
          const h = makeReq('chat.history', { sessionKey: 'main' });
          historyReqId = h.id;
          ws!.send(h.raw);
        } else {
          const err = d.error as Record<string, unknown> | undefined;
          sendToRenderer('ws:status', { connected: false, error: `连接失败: ${err?.message || JSON.stringify(err)}` });
        }
        return;
      }

      /* 3. chat.history response */
      if (d.type === 'res' && d.id === historyReqId && d.ok) {
        sendToRenderer('ws:history', d.payload);
        return;
      }

      /* 3.5. Renderer-initiated requests — route by method */
      if (d.type === 'res' && typeof d.id === 'string' && rendererReqs.has(d.id)) {
        const method = rendererReqs.get(d.id)!;
        rendererReqs.delete(d.id);
        if (method === 'chat.history' && d.ok) {
          sendToRenderer('ws:history', d.payload);
          return;
        }
        // Other methods fall through to generic ws:response
      }

      /* 4. chat events (stream delta/final) */
      if (d.type === 'event' && d.event === 'chat') {
        sendToRenderer('ws:chat-event', d.payload);
        return;
      }

      /* 5. approval events */
      if (d.type === 'event' && d.event === 'exec.approval.requested') {
        sendToRenderer('ws:approval', d.payload);
        return;
      }

      /* 6. Generic response (for chat.send, etc.) */
      if (d.type === 'res') {
        sendToRenderer('ws:response', { id: d.id, ok: d.ok, payload: d.payload, error: d.error });
        return;
      }
    } catch (e) {
      console.error('[WS Bridge] handler error:', e);
    }
  });

  ws.on('close', (code) => {
    const wasConnected = connected;
    connected = false;
    ws = null;

    // Only show error if we were previously connected (not on initial connection failures)
    if (wasConnected) {
      sendToRenderer('ws:status', { connected: false, error: `连接已断开 (code ${code})` });
    }

    // Auto-retry with exponential backoff
    if (retries < MAX_RETRIES) {
      retries++;
      const delay = Math.min(2000 * Math.pow(2, retries - 1), 30000);
      retryTimer = setTimeout(() => doConnect(currentGateway, currentToken), delay);
    } else {
      sendToRenderer('ws:status', { connected: false, error: `无法连接到 Gateway，请检查网络` });
    }
  });

  ws.on('error', (e) => {
    // Only log non-empty messages to avoid spam
    if (e.message) {
      console.error('[WS Bridge] error:', e.message);
    }
    // Send user-friendly error on connection refused
    if (e.message.includes('ECONNREFUSED')) {
      sendToRenderer('ws:status', { connected: false, error: 'Gateway 连接被拒绝，请检查服务是否运行' });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  IPC Handlers                                                       */
/* ------------------------------------------------------------------ */

export function setupWsBridge() {
  ipcMain.handle('ws:connect', (_, gatewayUrl: string, authToken: string) => {
    retries = 0;
    doConnect(gatewayUrl, authToken);
  });

  ipcMain.handle('ws:disconnect', () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retries = MAX_RETRIES; // prevent auto-retry
    if (ws) { ws.close(); ws = null; }
    connected = false;
    sendToRenderer('ws:status', { connected: false, error: null });
  });

  ipcMain.handle('ws:send', (_, method: string, params: Record<string, unknown>) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return { ok: false, error: 'not connected' };
    const r = makeReq(method, params);
    rendererReqs.set(r.id, method);
    ws.send(r.raw);
    return { ok: true, id: r.id };
  });

  ipcMain.handle('ws:is-connected', () => connected);
}
