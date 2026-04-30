import { useState, useEffect, useCallback, useRef } from 'react';
import type { ApprovalRequest, ApprovalDecision } from '../components/ApprovalCard';

export type { ApprovalRequest };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  // Tool-only fields, populated when role === 'tool'.
  tool?: {
    callId: string;
    name: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
    durationMs?: number;
    startedAt: number;
  };
}

export interface Session {
  key: string;
  kind?: string;
  displayName?: string;
  updatedAt?: string;
}

export interface UseClawChat {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  error: string | null;
  sessions: Session[];
  currentSessionKey: string;
  switchSession: (key: string) => void;
  createSession: () => void;
  deleteSession: (key: string) => void;
  pendingApprovals: ApprovalRequest[];
  resolvedApprovals: ApprovalRequest[];
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
/*  Hook — thin IPC bridge to main-process WebSocket                   */
/* ------------------------------------------------------------------ */

export function useClawChat(gatewayUrl: string, authToken: string): UseClawChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionKey, setCurrentSessionKey] = useState('main');
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [resolvedApprovals, setResolvedApprovals] = useState<ApprovalRequest[]>([]);
  const cleanups = useRef<Array<() => void>>([]);
  const sessionKeyRef = useRef('main');
  const sessionListReqId = useRef('');

  // Keep ref in sync with state
  sessionKeyRef.current = currentSessionKey;

  useEffect(() => {
    if (!gatewayUrl || !window.electronAPI?.ws) return;

    const api = window.electronAPI.ws;

    // Listen for connection status
    cleanups.current.push(
      api.onStatus((status) => {
        setIsConnected(status.connected);
        if (status.error) setError(status.error);
        else if (status.connected) {
          setError(null);
          // Fetch sessions on connect
          api.send('sessions.list', {}).then(result => {
            if (result.ok && result.id) {
              sessionListReqId.current = result.id;
            }
          });
        }
      }),
    );

    // Listen for chat history (initial auto-fetch + session switches)
    cleanups.current.push(
      api.onHistory((payload) => {
        const p = payload as { messages?: Array<{ role: string; content: unknown; timestamp?: number }> };
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
      }),
    );

    // Listen for chat streaming events
    cleanups.current.push(
      api.onChatEvent((payload) => {
        const p = payload as { state?: string; message?: { role?: string; content?: unknown } };
        const state = p.state;
        const msg = p.message;

        if (state === 'delta') {
          setIsTyping(true);
          const text = textFrom(msg?.content);
          if (text) {
            setMessages(prev => {
              const rest = prev.filter(m => m.id !== '__stream__');
              return [...rest, {
                id: '__stream__', role: 'assistant' as const,
                content: text, timestamp: new Date().toISOString(),
              }];
            });
          }
        } else if (state === 'final') {
          const final = textFrom(msg?.content);
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
      }),
    );

    // Listen for generic responses (sessions.list, sessions.delete, etc.)
    cleanups.current.push(
      api.onResponse((data) => {
        if (data.id === sessionListReqId.current && data.ok) {
          const p = data.payload as { sessions?: Session[] };
          if (p?.sessions) {
            setSessions(p.sessions);
            // Resolve short 'main' key to full key from sessions list
            setCurrentSessionKey(prev => {
              if (prev === 'main') {
                const match = p.sessions!.find(
                  s => s.key === 'main' || s.key.endsWith(':main'),
                );
                return match ? match.key : prev;
              }
              return prev;
            });
          }
        }
      }),
    );

    // Listen for approval requests
    cleanups.current.push(
      api.onApproval((payload) => {
        const p = payload as ApprovalRequest;
        if (p?.id) {
          setPendingApprovals(prev => {
            if (prev.some(a => a.id === p.id)) return prev;
            return [...prev, p];
          });
        }
      }),
    );

    // Connect
    api.connect(gatewayUrl, authToken);

    return () => {
      cleanups.current.forEach(fn => fn());
      cleanups.current = [];
      api.disconnect();
    };
  }, [gatewayUrl, authToken]);

  const switchSession = useCallback((key: string) => {
    if (!window.electronAPI?.ws) return;
    setCurrentSessionKey(key);
    setMessages([]);
    setIsTyping(false);
    window.electronAPI.ws.send('chat.history', { sessionKey: key });
  }, []);

  const createSession = useCallback(() => {
    const newKey = `agent:daily:clawbar-${Date.now()}`;
    setCurrentSessionKey(newKey);
    setMessages([]);
    setIsTyping(false);
  }, []);

  const deleteSession = useCallback((key: string) => {
    if (!window.electronAPI?.ws) return;
    window.electronAPI.ws.send('sessions.delete', { sessionKey: key });
    setSessions(prev => prev.filter(s => s.key !== key));
    if (sessionKeyRef.current === key) {
      setCurrentSessionKey('main');
      setMessages([]);
      setIsTyping(false);
      window.electronAPI.ws.send('chat.history', { sessionKey: 'main' });
    }
    // Refetch sessions list
    window.electronAPI.ws.send('sessions.list', {}).then(result => {
      if (result.ok && result.id) {
        sessionListReqId.current = result.id;
      }
    });
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!window.electronAPI?.ws) return;

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`, role: 'user' as const,
      content: text, timestamp: new Date().toISOString(),
    }]);
    setIsTyping(true);

    window.electronAPI.ws.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: text,
      idempotencyKey: crypto.randomUUID(),
    });
  }, []);

  const resolveApproval = useCallback((id: string, decision: ApprovalDecision) => {
    if (!window.electronAPI?.ws) return;
    window.electronAPI.ws.send('exec.approval.resolve', { id, decision });
    setPendingApprovals(prev => {
      const resolved = prev.find(a => a.id === id);
      if (resolved) {
        setResolvedApprovals(rp => [...rp, { ...resolved, resolvedDecision: decision } as ApprovalRequest]);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  return {
    messages, isConnected, isTyping, sendMessage, error,
    sessions, currentSessionKey, switchSession, createSession, deleteSession,
    pendingApprovals, resolvedApprovals, resolveApproval,
  };
}
