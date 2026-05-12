import { create } from 'zustand';
import type { ClaudeSession } from '../types';
import { useSettingsStore } from './settingsStore';

interface SessionState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;

  syncFromSettings: () => void;
  setActive: (id: string) => void;

  addClaude: (input: {
    projectDir: string;
    projectKey: string;
    sessionId: string;
    preview: string;
    iconLetter: string;
    iconColor: string;
  }) => string;

  /** Hard switch: tear down the bridge session before persisting. */
  switchClaudeSession: (sessionRowId: string, newSessionId: string, newPreview: string) => void;

  /** Soft mirror from bridge's system/init — swap sessionId in place,
   *  no claude:close, no remount. (See claude-bridge-new-session-id-mirror
   *  memory for the four-file invariant.) */
  setRealSessionId: (sessionRowId: string, realSessionId: string) => void;

  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
}

function persist(sessions: ClaudeSession[], activeSessionId: string | null) {
  const api = useSettingsStore.getState();
  api.updateSetting('sessions', sessions);
  api.updateSetting('activeSessionId', activeSessionId);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  syncFromSettings: () => {
    const s = useSettingsStore.getState();
    set({
      sessions: (s as unknown as { sessions?: ClaudeSession[] }).sessions ?? [],
      activeSessionId: (s as unknown as { activeSessionId?: string | null }).activeSessionId ?? null,
    });
  },

  setActive: (id) => {
    set({ activeSessionId: id });
    persist(get().sessions, id);
  },

  addClaude: ({ projectDir, projectKey, sessionId, preview, iconLetter, iconColor }) => {
    const existing = get().sessions.find((s) => s.sessionId === sessionId);
    if (existing) {
      get().setActive(existing.id);
      return existing.id;
    }
    const id = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const shortName = (() => {
      const parts = projectDir.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : projectDir;
    })();
    const trimmedPreview = preview.length > 28 ? preview.slice(0, 28) + '…' : preview || '(empty session)';
    const newSession: ClaudeSession = {
      id,
      name: `${shortName} · ${trimmedPreview}`,
      enabled: true,
      projectDir,
      projectKey,
      sessionId,
      preview,
      iconLetter,
      iconColor,
    };
    const sessions = [...get().sessions, newSession];
    set({ sessions, activeSessionId: id });
    persist(sessions, id);
    return id;
  },

  switchClaudeSession: (sessionRowId, newSessionId, newPreview) => {
    const list = get().sessions;
    const target = list.find((c) => c.id === sessionRowId);
    if (!target) return;
    if (target.sessionId === newSessionId) return;

    window.electronAPI?.claude?.close(sessionRowId).catch(() => { /* ignore */ });

    const trimmedPreview = newPreview.length > 28
      ? newPreview.slice(0, 28) + '…'
      : newPreview || '(empty session)';
    const projectShort = (() => {
      const parts = target.projectDir.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : target.projectDir;
    })();

    const sessions = list.map((c) =>
      c.id === sessionRowId
        ? { ...c, sessionId: newSessionId, preview: newPreview, name: `${projectShort} · ${trimmedPreview}` }
        : c
    );
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  setRealSessionId: (sessionRowId, realSessionId) => {
    const list = get().sessions;
    const target = list.find((c) => c.id === sessionRowId);
    if (!target) return;
    if (target.sessionId === realSessionId) return;
    const sessions = list.map((c) =>
      c.id === sessionRowId ? { ...c, sessionId: realSessionId } : c
    );
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  remove: (id) => {
    const list = get().sessions;
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    window.electronAPI?.claude?.close(id).catch(() => { /* ignore */ });
    const sessions = list.filter((c) => c.id !== id);
    let next = get().activeSessionId;
    if (next === id) {
      const fallback = sessions[Math.max(0, idx - 1)] ?? sessions[0];
      next = fallback?.id ?? null;
    }
    set({ sessions, activeSessionId: next });
    persist(sessions, next);
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const sessions = get().sessions.map((c) => c.id === id ? { ...c, name: trimmed } : c);
    set({ sessions });
    persist(sessions, get().activeSessionId);
  },

  moveUp: (id) => {
    const list = [...get().sessions];
    const i = list.findIndex((c) => c.id === id);
    if (i <= 0) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    set({ sessions: list });
    persist(list, get().activeSessionId);
  },

  moveDown: (id) => {
    const list = [...get().sessions];
    const i = list.findIndex((c) => c.id === id);
    if (i < 0 || i >= list.length - 1) return;
    [list[i], list[i + 1]] = [list[i + 1], list[i]];
    set({ sessions: list });
    persist(list, get().activeSessionId);
  },
}));
