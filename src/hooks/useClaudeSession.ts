import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, Session } from './useClawChat';
import type { ClaudeEvent, ClaudeEventEnvelope, ApprovalDecision, AskQuestion } from '../../shared/claude-events';
import { useChannelStore } from '../stores/channelStore';

export interface PendingApproval {
  requestId: string;
  tool: string;
  input: unknown;
}

export interface PendingAsk {
  requestId: string;
  questions: AskQuestion[];
}

export interface UseClaudeSession {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  error: string | null;
  cliMissing: boolean;
  recheckCli: () => void;
  pendingApproval: PendingApproval | null;
  pendingAsk: PendingAsk | null;
  approve: (decision: ApprovalDecision) => void;
  answer: (answers: string[][]) => void;
  /** Slash commands (Claude side keeps the Sprint 1 surface for autocomplete). */
  availableCommands: string[];
  sessions: Session[];
  currentSessionKey: string;
  switchSession: (key: string) => void;
  createSession: () => void;
  deleteSession: (key: string) => void;
  /** Stop button — calls bridge `abort`. */
  abort: () => void;
}

const STREAM_ID = '__cl_stream__';
const THINK_ID = '__cl_thinking__';

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
  const [cliMissing, setCliMissing] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availableCommands] = useState<string[]>([]); // SDK doesn't surface init slash commands; left empty for now
  // (cliPathRef + initRef were removed: cliPathRef was unread; initRef
  // broke under React 19 StrictMode double-mount because cleanup ran on
  // the phantom unmount but the ref kept the second mount from
  // reinitializing. The bridge's startSession is idempotent — it calls
  // destroySession internally before creating — so we can let the effect
  // run without guarding.)

  const switchClaudeSession = useChannelStore((s) => s.switchClaudeSession);

  // Shared "resolve CLI then start the bridge session". Used by both the
  // init effect and recheckCli (the install-guide retry button).
  // We use useCallback with primitive deps; a useRef indirection lets the
  // init effect read the latest version without including this callback
  // in its deps array (which would re-fire the effect on every render
  // where ChannelHost re-creates the props object).
  const checkAndStart = useCallback(async () => {
    if (!window.electronAPI?.claude) return;
    const r = await window.electronAPI.claude.checkCli();
    if (!r.found || !r.path) {
      setCliMissing(true);
      return;
    }
    // Found and resolvable — make sure we're not stuck on a previous
    // failed-checkCli view (e.g. flaky `zsh -ilc` first invocation).
    setCliMissing(false);
    try {
      await window.electronAPI.claude.start(channelId, projectDir, projectKey, sessionId, r.path);
    } catch (e) {
      setError(`start failed: ${(e as Error).message}`);
    }
  }, [channelId, projectDir, projectKey, sessionId]);
  const checkAndStartRef = useRef(checkAndStart);
  checkAndStartRef.current = checkAndStart;

  // ── Sibling sessions for the dropdown (unchanged behaviour) ──────────
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
      if (!mapped.find((m) => m.key === sessionId)) {
        mapped.unshift({ key: sessionId, displayName: 'New session', updatedAt: 'now' });
      }
      setSessions(mapped);
    })();
    return () => { cancelled = true; };
  }, [projectKey, sessionId]);

  const recheckCli = useCallback(() => {
    setError(null);
    setCliMissing(false);
    void checkAndStart();
  }, [checkAndStart]);

  // ── Init: load history, check CLI, start session, subscribe to events ──
  // We deliberately let this effect re-run if any dep changes (channel,
  // project, session). The bridge's startSession is idempotent (calls
  // destroySession internally first), so re-running is safe. ChannelHost
  // keys ClaudeChannel by `${c.id}-${c.sessionId}` so deps never change
  // in practice within one mount lifetime — but the contract holds even
  // if a future caller passes mutable props.
  useEffect(() => {
    if (!window.electronAPI?.claude) return;

    // Load .jsonl history for instant context.
    window.electronAPI.claude.loadHistory(projectKey, sessionId).then((turns) => {
      const seeded: ChatMessage[] = turns.map((t, i) => ({
        id: `cl-h-${i}`,
        role: t.role,
        content: t.content,
        timestamp: new Date(t.timestamp).toISOString(),
      }));
      setMessages(seeded);
    }).catch(() => { /* non-fatal */ });

    // Subscribe FIRST so we don't miss events from start().
    const unsub = window.electronAPI.claude.onEvent((envelope: ClaudeEventEnvelope) => {
      if (envelope.channelId !== channelId) return;
      try {
        handleEvent(envelope.event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[claude:event] handleEvent threw', err, 'for event', envelope.event);
      }
    });

    void checkAndStartRef.current();

    function handleEvent(ev: ClaudeEvent) {
      switch (ev.kind) {
        case 'cli-missing':
          setCliMissing(true);
          return;
        case 'cli-found':
          setCliMissing(false);
          setIsConnected(true);
          setError(null);
          return;
        case 'session-started':
          setIsConnected(true);
          return;
        case 'message-delta':
          setIsTyping(true);
          setMessages((prev) => {
            const stream = prev.find((m) => m.id === STREAM_ID);
            const rest = prev.filter((m) => m.id !== STREAM_ID);
            return [...rest, {
              id: STREAM_ID,
              role: 'assistant',
              content: (stream?.content ?? '') + ev.text,
              timestamp: new Date().toISOString(),
            }];
          });
          return;
        case 'thinking-delta':
          setIsTyping(true);
          // Render thinking as a tool-style pill that auto-grows the
          // 'thinking' content. The pill uses ToolCallPill via tool meta
          // with synthetic name 'Thinking'; click toggles to read full.
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === THINK_ID);
            if (idx === -1) {
              return [...prev, {
                id: THINK_ID,
                role: 'tool' as const,
                content: '',
                timestamp: new Date().toISOString(),
                tool: {
                  callId: THINK_ID,
                  name: 'Thinking',
                  input: { thinking: ev.text },
                  output: ev.text,  // also as output so expanded view shows it
                  startedAt: Date.now(),
                },
              }];
            }
            const existing = prev[idx];
            const accumulated = ((existing.tool?.input as { thinking?: string } | undefined)?.thinking ?? '') + ev.text;
            const next = [...prev];
            next[idx] = {
              ...existing,
              tool: {
                ...existing.tool!,
                input: { thinking: accumulated },
                output: accumulated,
              },
            };
            return next;
          });
          return;
        case 'tool-call':
          setMessages((prev) => [...prev, {
            id: `cl-t-${ev.callId}`,
            role: 'tool' as const,
            content: '',
            timestamp: new Date(ev.startedAt).toISOString(),
            tool: {
              callId: ev.callId,
              name: ev.tool,
              input: ev.input,
              startedAt: ev.startedAt,
            },
          }]);
          return;
        case 'tool-result':
          setMessages((prev) => prev.map((m) => {
            if (m.role !== 'tool' || m.tool?.callId !== ev.callId) return m;
            return {
              ...m,
              tool: {
                ...m.tool!,
                output: ev.output,
                isError: ev.isError,
                durationMs: ev.durationMs,
              },
            };
          }));
          return;
        case 'turn-end':
          setIsTyping(false);
          // Promote both the streaming bubble AND the thinking pill to
          // stable per-turn ids so they survive into history.
          setMessages((prev) => {
            const stream = prev.find((m) => m.id === STREAM_ID);
            const think = prev.find((m) => m.id === THINK_ID);
            const rest = prev.filter((m) => m.id !== STREAM_ID && m.id !== THINK_ID);
            const out = [...rest];
            if (think) {
              out.push({
                ...think,
                id: `cl-think-${Date.now()}`,
                tool: think.tool ? { ...think.tool, callId: `cl-think-${Date.now()}` } : think.tool,
              });
            }
            if (stream && stream.content.trim()) {
              out.push({
                id: `cl-a-${Date.now()}`,
                role: 'assistant',
                content: stream.content,
                timestamp: new Date().toISOString(),
              });
            }
            return out;
          });
          return;
        case 'approval-request':
          setPendingApproval({ requestId: ev.requestId, tool: ev.tool, input: ev.input });
          return;
        case 'ask-question':
          setPendingAsk({ requestId: ev.requestId, questions: ev.questions });
          return;
        case 'aborted':
          setIsTyping(false);
          setPendingApproval(null);
          setPendingAsk(null);
          // Only surface "[Stopped by user]" if a turn was actually in
          // progress (a stream/think bubble exists). Idle-close fires
          // `aborted` too — we don't want to confuse users with a
          // "Stopped" line they didn't trigger.
          setMessages((prev) => {
            const hadStream = prev.some((m) => m.id === STREAM_ID || m.id === THINK_ID);
            const rest = prev.filter((m) => m.id !== STREAM_ID && m.id !== THINK_ID);
            if (!hadStream) return rest;
            return [...rest, {
              id: `cl-x-${Date.now()}`,
              role: 'assistant',
              content: '[Stopped by user]',
              timestamp: new Date().toISOString(),
            }];
          });
          return;
        case 'error':
          setError(ev.message);
          setIsTyping(false);
          // Strip any partial stream/think bubbles — they'll never get
          // promoted by a turn-end if the turn errored mid-stream.
          setMessages((prev) => prev.filter((m) => m.id !== STREAM_ID && m.id !== THINK_ID));
          return;
      }
    }

    return () => {
      unsub();
      // Tear down the SDK Query on unmount (or on dep change). The bridge
      // handles double-close gracefully.
      window.electronAPI.claude.close(channelId).catch(() => { /* ignore */ });
    };
  }, [channelId, projectDir, projectKey, sessionId]);

  const sendMessage = (text: string) => {
    if (!window.electronAPI?.claude) return;
    setIsTyping(true);
    setMessages((prev) => [...prev, {
      id: `cl-u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }]);
    window.electronAPI.claude.send(channelId, text).catch((e: Error) => {
      setError(`send failed: ${e.message}`);
      setIsTyping(false);
    });
  };

  const abort = () => {
    if (!window.electronAPI?.claude) return;
    window.electronAPI.claude.abort(channelId).catch(() => { /* ignore */ });
  };

  const approve = (decision: ApprovalDecision) => {
    const p = pendingApproval;
    if (!p || !window.electronAPI?.claude) return;
    setPendingApproval(null);
    window.electronAPI.claude.approve(channelId, p.requestId, decision).catch(() => { /* ignore */ });
  };

  const answer = (answers: string[][]) => {
    const p = pendingAsk;
    if (!p || !window.electronAPI?.claude) return;
    setPendingAsk(null);
    window.electronAPI.claude.answer(channelId, p.requestId, answers).catch(() => { /* ignore */ });
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
    cliMissing, recheckCli,
    pendingApproval, pendingAsk, approve, answer,
    availableCommands,
    sessions,
    currentSessionKey: sessionId,
    switchSession, createSession,
    deleteSession: () => {},
    abort,
  };
}
