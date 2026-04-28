import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Session } from './useClawChat';
import type { ApprovalRequest, ApprovalDecision } from '../components/ApprovalCard';

export interface UseClaudeSession {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  error: string | null;
  // Stubs to satisfy ChatView's prop shape (Claude MVP doesn't expose these).
  sessions: Session[];
  currentSessionKey: string;
  switchSession: (key: string) => void;
  createSession: () => void;
  deleteSession: (key: string) => void;
  pendingApprovals: ApprovalRequest[];
  resolvedApprovals: ApprovalRequest[];
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
}

const STREAM_ID = '__cl_stream__';

export function useClaudeSession(
  channelId: string,
  projectDir: string,
  sessionId: string,
  projectKey: string,
): UseClaudeSession {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!window.electronAPI?.claude || initRef.current) return;
    initRef.current = true;

    // 1. Load history from .jsonl on disk for instant context.
    window.electronAPI.claude.loadHistory(projectKey, sessionId).then((turns) => {
      const seeded: ChatMessage[] = turns.map((t, i) => ({
        id: `cl-h-${i}`,
        role: t.role,
        content: t.content,
        timestamp: new Date(t.timestamp).toISOString(),
      }));
      setMessages(seeded);
    }).catch(() => { /* non-fatal */ });

    // 2. Subscribe to streaming events for this channel.
    const unsub = window.electronAPI.claude.onEvent((payload) => {
      if (payload.channelId !== channelId) return;

      if (payload.type === 'spawned') {
        setIsConnected(true);
        setError(null);
        return;
      }
      if (payload.type === 'turn-end') {
        setIsTyping(false);
        return;
      }
      if (payload.type === 'error') {
        setError((payload.message as unknown as string) ?? 'unknown error');
        setIsTyping(false);
        return;
      }

      const msg = payload.message;
      if (!msg) return;

      if (payload.state === 'delta') {
        setIsTyping(true);
        setMessages((prev) => {
          const previousStream = prev.find((m) => m.id === STREAM_ID);
          const rest = prev.filter((m) => m.id !== STREAM_ID);
          return [...rest, {
            id: STREAM_ID,
            role: msg.role as 'user' | 'assistant',
            content: (previousStream?.content ?? '') + msg.content,
            timestamp: new Date().toISOString(),
          }];
        });
      } else if (payload.state === 'final') {
        if (msg.role === 'user') {
          setMessages((prev) => [...prev, {
            id: `cl-u-${Date.now()}`,
            role: 'user', content: msg.content,
            timestamp: new Date().toISOString(),
          }]);
        } else {
          setMessages((prev) => {
            const rest = prev.filter((m) => m.id !== STREAM_ID);
            return [...rest, {
              id: `cl-a-${Date.now()}`,
              role: 'assistant', content: msg.content,
              timestamp: new Date().toISOString(),
            }];
          });
        }
      }
    });

    // 3. Register the channel with the bridge (does not actually spawn — the
    //    CLI is spawned per turn by `claude:send`).
    window.electronAPI.claude.spawn(channelId, projectDir, sessionId).catch((e: Error) => {
      setError(`spawn failed: ${e.message}`);
    });

    return () => {
      unsub();
    };
  }, [channelId, projectDir, sessionId, projectKey]);

  const sendMessage = (text: string) => {
    if (!window.electronAPI?.claude) return;
    setIsTyping(true);
    window.electronAPI.claude.send(channelId, text).catch((e: Error) => {
      setError(`send failed: ${e.message}`);
      setIsTyping(false);
    });
  };

  return {
    messages, isConnected, isTyping, sendMessage, error,
    sessions: [], currentSessionKey: '',
    switchSession: () => {},
    createSession: () => {},
    deleteSession: () => {},
    pendingApprovals: [],
    resolvedApprovals: [],
    resolveApproval: () => {},
  };
}
