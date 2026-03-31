import { create } from 'zustand';
import type { Message, Session, Agent, ConnectionStatus, ViewState } from '../types';

interface ChatState {
  currentSession: Session | null;
  currentAgent: Agent | null;
  messages: Message[];
  isTyping: boolean;
  isSending: boolean;
  sessions: Session[];
  agents: Agent[];
  connectionStatus: ConnectionStatus;
  view: ViewState;
  pollingTimer: ReturnType<typeof setInterval> | null;

  sendMessage: (text: string) => Promise<void>;
  loadTranscript: () => Promise<void>;
  switchSession: (session: Session) => void;
  createSession: (agentId: string) => Promise<void>;
  checkConnection: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadSessions: () => Promise<void>;
  setView: (view: ViewState) => void;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentSession: null,
  currentAgent: null,
  messages: [],
  isTyping: false,
  isSending: false,
  sessions: [],
  agents: [],
  connectionStatus: 'disconnected',
  view: 'chat',
  pollingTimer: null,

  checkConnection: async () => {
    set({ connectionStatus: 'connecting' });
    try {
      const result = await window.electronAPI.openclaw.checkConnection();
      set({ connectionStatus: result.connected ? 'connected' : 'disconnected' });
      if (result.connected) {
        get().loadAgents();
        get().loadSessions();
      }
    } catch {
      set({ connectionStatus: 'disconnected' });
    }
  },

  loadAgents: async () => {
    try {
      const result = await window.electronAPI.openclaw.getAgents();
      if (result.success && result.agents) {
        set({ agents: result.agents });
        if (!get().currentAgent && result.agents.length > 0) {
          set({ currentAgent: result.agents[0] });
        }
      }
    } catch { /* ignore */ }
  },

  loadSessions: async () => {
    try {
      const result = await window.electronAPI.openclaw.getSessions();
      if (result.success && result.sessions) {
        set({ sessions: result.sessions });
        if (!get().currentSession && result.sessions.length > 0) {
          const session = result.sessions[0];
          set({ currentSession: session });
          get().loadTranscript();
        }
      }
    } catch { /* ignore */ }
  },

  loadTranscript: async () => {
    const { currentSession } = get();
    if (!currentSession) return;
    try {
      const result = await window.electronAPI.openclaw.getTranscript(
        currentSession.agent,
        currentSession.key,
      );
      if (result.success && result.messages) {
        set({ messages: result.messages });
      }
    } catch { /* ignore */ }
  },

  sendMessage: async (text: string) => {
    const { currentSession, currentAgent } = get();
    if (!currentSession || !text.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleString(),
    };

    set((s) => ({
      messages: [...s.messages, userMessage],
      isSending: true,
      isTyping: true,
    }));

    try {
      const sessionId = currentSession.sessionId || currentSession.key;
      const agentId = currentAgent?.id || currentSession.agent;
      await window.electronAPI.openclaw.sendMessage(sessionId, agentId, text.trim());
      get().startPolling();
    } catch {
      set({ isSending: false, isTyping: false });
    }
  },

  startPolling: () => {
    get().stopPolling();
    let noChangeCount = 0;
    let lastCount = get().messages.length;

    const timer = setInterval(async () => {
      await get().loadTranscript();
      const currentCount = get().messages.length;

      if (currentCount > lastCount) {
        noChangeCount = 0;
        lastCount = currentCount;
        // Check if last message is from assistant
        const msgs = get().messages;
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
          set({ isTyping: false, isSending: false });
        }
      } else {
        noChangeCount++;
      }

      // Stop polling after 5s of no new messages  
      if (noChangeCount >= 5) {
        get().stopPolling();
        set({ isTyping: false, isSending: false });
      }
    }, 1000);

    set({ pollingTimer: timer });
  },

  stopPolling: () => {
    const { pollingTimer } = get();
    if (pollingTimer) {
      clearInterval(pollingTimer);
      set({ pollingTimer: null });
    }
  },

  switchSession: (session: Session) => {
    get().stopPolling();
    set({
      currentSession: session,
      messages: [],
      isTyping: false,
      isSending: false,
      view: 'chat',
    });
    get().loadTranscript();
  },

  createSession: async (agentId: string) => {
    try {
      const result = await window.electronAPI.openclaw.createSession(agentId);
      if (result.success) {
        await get().loadSessions();
        const sessions = get().sessions;
        const newSession = sessions.find((s) => s.sessionId === result.sessionId);
        if (newSession) {
          get().switchSession(newSession);
        }
      }
    } catch { /* ignore */ }
  },

  setView: (view: ViewState) => set({ view }),
}));
