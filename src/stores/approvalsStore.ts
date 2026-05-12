import { create } from 'zustand';

interface ApprovalsState {
  // sessionRowId → count of (pendingApproval ? 1 : 0) + (pendingAsk ? 1 : 0)
  countBySession: Record<string, number>;
  setCount: (sessionRowId: string, count: number) => void;
  clear: (sessionRowId: string) => void;
}

export const useApprovalsStore = create<ApprovalsState>((set) => ({
  countBySession: {},
  setCount: (sessionRowId, count) => set((s) => {
    const next = { ...s.countBySession };
    if (count <= 0) delete next[sessionRowId];
    else next[sessionRowId] = count;
    return { countBySession: next };
  }),
  clear: (sessionRowId) => set((s) => {
    const next = { ...s.countBySession };
    delete next[sessionRowId];
    return { countBySession: next };
  }),
}));
