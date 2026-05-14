import { create } from 'zustand';
import { apiClient } from '../lib/apiClient';

export interface ClaudeProject {
  key: string;
  decodedPath: string;
  sessionCount: number;
}

export interface ClaudeSession {
  sessionId: string;
  preview: string;
  mtime: number;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface ClaudeSessionsState {
  cliStatus: { found: boolean; version?: string } | null;
  cliCheckState: LoadState;

  projects: ClaudeProject[];
  projectsState: LoadState;

  sessionsByKey: Record<string, ClaudeSession[]>;
  sessionsState: Record<string, LoadState>;

  errorMsg: string | null;

  checkCli: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadSessions: (projectKey: string) => Promise<void>;
  reset: () => void;
}

export const useClaudeSessionsStore = create<ClaudeSessionsState>((set, get) => ({
  cliStatus: null,
  cliCheckState: 'idle',
  projects: [],
  projectsState: 'idle',
  sessionsByKey: {},
  sessionsState: {},
  errorMsg: null,

  checkCli: async () => {
    if (get().cliCheckState === 'loading') return;
    set({ cliCheckState: 'loading', errorMsg: null });
    try {
      const status = await apiClient.claude.checkCli();
      set({ cliStatus: status, cliCheckState: 'ready' });
    } catch (e) {
      set({ cliCheckState: 'error', errorMsg: (e as Error).message });
    }
  },

  loadProjects: async () => {
    if (get().projectsState === 'loading') return;
    set({ projectsState: 'loading', errorMsg: null });
    try {
      const projects = await apiClient.claude.scanProjects();
      set({ projects, projectsState: 'ready' });
    } catch (e) {
      set({ projectsState: 'error', errorMsg: (e as Error).message });
    }
  },

  loadSessions: async (projectKey: string) => {
    const state = get().sessionsState[projectKey];
    if (state === 'loading') return;
    set((s) => ({ sessionsState: { ...s.sessionsState, [projectKey]: 'loading' }, errorMsg: null }));
    try {
      const sessions = await apiClient.claude.listSessions(projectKey);
      set((s) => ({
        sessionsByKey: { ...s.sessionsByKey, [projectKey]: sessions },
        sessionsState: { ...s.sessionsState, [projectKey]: 'ready' },
      }));
    } catch (e) {
      set((s) => ({
        sessionsState: { ...s.sessionsState, [projectKey]: 'error' },
        errorMsg: (e as Error).message,
      }));
    }
  },

  reset: () => set({
    cliStatus: null, cliCheckState: 'idle',
    projects: [], projectsState: 'idle',
    sessionsByKey: {}, sessionsState: {},
    errorMsg: null,
  }),
}));
