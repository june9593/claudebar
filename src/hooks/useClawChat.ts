import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface UseClawChat {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  clearMessages: () => void;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Device Identity — Ed25519 keypair stored in localStorage           */
/* ------------------------------------------------------------------ */

interface DeviceIdentity {
  deviceId: string;
  publicKeyB64: string;       // base64url raw 32-byte Ed25519 public key
  privateKeyJwk: JsonWebKey;  // JWK for re-import & signing
}

const DEVICE_KEY = 'clawbar-device-identity';
const CLIENT_ID = 'clawbar';
const CLIENT_MODE = 'webchat';
const ROLE = 'operator';
const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing'];

function toBase64url(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  const raw = localStorage.getItem(DEVICE_KEY);
  if (raw) {
    try { return JSON.parse(raw) as DeviceIdentity; } catch { /* regenerate */ }
  }
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const identity: DeviceIdentity = { deviceId, publicKeyB64: toBase64url(pubRaw), privateKeyJwk: privJwk };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(identity));
  return identity;
}

async function signPayload(identity: DeviceIdentity, nonce: string, token: string) {
  const signedAt = Date.now();
  const msg = [
    'v2', identity.deviceId, CLIENT_ID, CLIENT_MODE, ROLE,
    SCOPES.join(','), String(signedAt), token, nonce,
  ].join('|');
  const key = await crypto.subtle.importKey('jwk', identity.privateKeyJwk, 'Ed25519', false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(msg)));
  return { signature: toBase64url(sig), signedAt };
}

/* ------------------------------------------------------------------ */
/*  Protocol helpers (NOT JSON-RPC — OpenClaw custom framing)          */
/* ------------------------------------------------------------------ */

function makeReq(method: string, params: Record<string, unknown>) {
  const id = crypto.randomUUID();
  return { raw: JSON.stringify({ type: 'req', id, method, params }), id };
}

function textFrom(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('');
  return '';
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

const MAX_RETRIES = 3;

export function useClawChat(gatewayUrl: string, authToken: string): UseClawChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retries = useRef(0);
  const streamBuf = useRef('');
  const identityRef = useRef<DeviceIdentity | null>(null);
  const connectIdRef = useRef('');
  const historyIdRef = useRef('');

  const connect = useCallback(() => {
    if (!gatewayUrl) return;

    const go = async () => {
      // Ensure device identity exists
      if (!identityRef.current) {
        try { identityRef.current = await loadOrCreateIdentity(); }
        catch (e) { setError(`设备身份生成失败: ${e}`); return; }
      }
      // Guard against connect after cleanup
      if (retries.current >= MAX_RETRIES) return;

      const wsUrl = gatewayUrl
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/+$/, '');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { setError(null); retries.current = 0; };

      ws.onmessage = async (ev) => {
        let d: Record<string, unknown>;
        try { d = JSON.parse(ev.data); } catch { return; }

        try {
          /* 1. connect.challenge → sign & send connect */
          if (d.type === 'event' && d.event === 'connect.challenge') {
            const p = d.payload as { nonce: string };
            const identity = identityRef.current!;
            const { signature, signedAt } = await signPayload(identity, p.nonce, authToken);
            const r = makeReq('connect', {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: CLIENT_ID, mode: CLIENT_MODE },
              role: ROLE,
              scopes: SCOPES,
              device: {
                id: identity.deviceId,
                publicKey: identity.publicKeyB64,
                signature,
                signedAt,
                nonce: p.nonce,
              },
              auth: { token: authToken },
            });
            connectIdRef.current = r.id;
            ws.send(r.raw);
            return;
          }

          /* 2. connect response → hello-ok → request history */
          if (d.type === 'res' && d.id === connectIdRef.current) {
            if (d.ok) {
              setIsConnected(true);
              setError(null);
              const h = makeReq('chat.history', { sessionKey: 'main' });
              historyIdRef.current = h.id;
              ws.send(h.raw);
            } else {
              const p = d.payload as Record<string, unknown> | undefined;
              setError(`连接失败: ${p?.message || JSON.stringify(p)}`);
            }
            return;
          }

          /* 3. chat.history response → populate messages */
          if (d.type === 'res' && d.id === historyIdRef.current && d.ok) {
            const p = d.payload as { messages?: Array<{ role: string; content: unknown; timestamp?: number }> };
            if (p?.messages) {
              setMessages(
                p.messages
                  .filter(m => m.role === 'user' || m.role === 'assistant')
                  .map((m, i) => ({
                    id: `hist-${i}`,
                    role: m.role as 'user' | 'assistant',
                    content: textFrom(m.content),
                    timestamp: m.timestamp
                      ? new Date(m.timestamp).toISOString()
                      : new Date().toISOString(),
                  })),
              );
            }
            return;
          }

          /* 4. chat streaming events */
          if (d.type === 'event' && typeof d.event === 'string' && d.event.startsWith('chat')) {
            const p = (d.payload || {}) as Record<string, unknown>;
            const sub = (p.type || p.event || d.event) as string;

            if (/start/i.test(sub)) {
              setIsTyping(true);
              streamBuf.current = '';
            } else if (/delta/i.test(sub)) {
              streamBuf.current += (p.text ?? p.delta ?? '') as string;
              const text = streamBuf.current;
              setMessages(prev => {
                const rest = prev.filter(m => m.id !== '__stream__');
                return [...rest, {
                  id: '__stream__', role: 'assistant' as const,
                  content: text, timestamp: new Date().toISOString(),
                }];
              });
            } else if (/end|done|complete/i.test(sub)) {
              const final = streamBuf.current || textFrom(p.text ?? p.content ?? '');
              streamBuf.current = '';
              setIsTyping(false);
              if (final) {
                setMessages(prev => {
                  const rest = prev.filter(m => m.id !== '__stream__');
                  return [...rest, {
                    id: `msg-${Date.now()}`, role: 'assistant' as const,
                    content: final, timestamp: new Date().toISOString(),
                  }];
                });
              }
            }
            return;
          }

          /* 5. Generic error response */
          if (d.type === 'res' && d.ok === false) {
            const p = d.payload as Record<string, unknown> | undefined;
            setError(`Gateway: ${p?.message || JSON.stringify(p)}`);
          }
        } catch (e) {
          console.error('[ClawBar WS] handler error:', e);
        }
      };

      ws.onclose = (ev) => {
        setIsConnected(false);
        wsRef.current = null;
        if (retries.current < MAX_RETRIES) {
          retries.current++;
          setTimeout(connect, 3000);
        } else {
          setError(`连接已断开 (code ${ev.code})`);
        }
      };

      ws.onerror = () => { setError('WebSocket 连接错误'); };
    };

    go().catch(e => setError(`连接异常: ${e}`));
  }, [gatewayUrl, authToken]);

  useEffect(() => {
    connect();
    return () => {
      retries.current = MAX_RETRIES;
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`, role: 'user' as const,
      content: text, timestamp: new Date().toISOString(),
    }]);
    setIsTyping(true);
    ws.send(makeReq('chat.send', { text }).raw);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    streamBuf.current = '';
  }, []);

  return { messages, isConnected, isTyping, sendMessage, clearMessages, error };
}
