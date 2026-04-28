import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Session } from './useClawChat';
import type { ApprovalRequest, ApprovalDecision } from '../components/ApprovalCard';
import { useChannelStore } from '../stores/channelStore';

export interface ClaudeActivity {
  kind: 'thinking' | 'tool';
  label: string;
}

export interface UseClaudeSession {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  error: string | null;
  /** What Claude is currently doing (between turns this is null). */
  activity: ClaudeActivity | null;
  /** Slash commands + skills the running CLI advertises (from system+init). */
  availableCommands: string[];
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

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availableCommands, setAvailableCommands] = useState<string[]>([]);
  const [activity, setActivity] = useState<ClaudeActivity | null>(null);
  const initRef = useRef(false);

  const switchClaudeSession = useChannelStore((s) => s.switchClaudeSession);

  // Load sibling sessions in this project for the dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.electronAPI?.claude) return;
      const list = await window.electronAPI.claude.listSessions(projectKey).catch(() => []);
      if (cancelled) return;
      const mapped: Session[] = list.map((s) => ({
        key: s.sessionId,
        displayName: s.preview || '(empty session)',
        updatedAt: relativeTime(s.mtime),
      }));
      // If the current session isn't in the scan yet (e.g. brand-new session
      // that hasn't been written to disk), inject a placeholder entry so the
      // dropdown header shows something sensible instead of a UUID slice.
      if (!mapped.find((m) => m.key === sessionId)) {
        mapped.unshift({ key: sessionId, displayName: 'New session', updatedAt: 'now' });
      }
      setSessions(mapped);
    })();
    return () => { cancelled = true; };
  }, [projectKey, sessionId]);

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
      if (payload.type === 'init') {
        const cmds = (payload.slashCommands as string[] | undefined) ?? [];
        const skills = (payload.skills as string[] | undefined) ?? [];
        // Skills become slash commands too — `/skill-name` invokes them.
        const merged = Array.from(new Set([
          ...cmds.map((c) => (c.startsWith('/') ? c : `/${c}`)),
          ...skills.map((s) => `/${s}`),
        ])).sort();
        setAvailableCommands(merged);
        return;
      }
      if (payload.type === 'turn-end') {
        setIsTyping(false);
        setActivity(null);
        return;
      }
      if (payload.type === 'activity') {
        const kind = payload.kind as string | undefined;
        if (kind === 'end') {
          setActivity(null);
        } else if (kind === 'thinking' || kind === 'tool') {
          setActivity({ kind, label: (payload.label as string) || '' });
        }
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

    // 3. Register the channel with the bridge.
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

  const switchSession = (newSessionId: string) => {
    if (newSessionId === sessionId) return;
    const found = sessions.find((s) => s.key === newSessionId);
    switchClaudeSession(channelId, newSessionId, found?.displayName ?? '');
  };

  const createSession = () => {
    const newId = crypto.randomUUID();
    switchClaudeSession(channelId, newId, '');
  };

  return {
    messages, isConnected, isTyping, sendMessage, error,
    activity,
    availableCommands,
    sessions,
    currentSessionKey: sessionId,
    switchSession,
    createSession,
    deleteSession: () => {},
    pendingApprovals: [],
    resolvedApprovals: [],
    resolveApproval: () => {},
  };
}
