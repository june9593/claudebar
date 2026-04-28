import { create } from 'zustand';
import type { Channel, WebChannelDef, ClaudeChannelDef } from '../types';
import { useSettingsStore } from './settingsStore';

interface ChannelState {
  channels: Channel[];
  activeChannelId: string;
  // OpenClaw's internal sidebar (Overview / Approvals / Sessions / ...).
  // Toggled by clicking the OpenClaw icon in the dock when OpenClaw is
  // already the active channel.
  openclawSidebarOpen: boolean;
  setOpenclawSidebarOpen: (v: boolean) => void;

  // Pointer to the currently active web channel's <webview> element so
  // the TitleBar Back / Refresh buttons can drive it.
  activeWebview: HTMLElement | null;
  setActiveWebview: (el: HTMLElement | null) => void;

  // Hydrate from settings store (call after settings load)
  syncFromSettings: () => void;

  setActive: (id: string) => void;

  // Built-in toggles
  enableBuiltin: (id: string) => void;
  disableBuiltin: (id: string) => void;

  // CRUD on user-added
  addCustom: (url: string) => string | null;  // returns id, or null if duplicate / invalid
  addClaude: (input: {
    projectDir: string;
    projectKey: string;
    sessionId: string;
    preview: string;
    iconLetter: string;
    iconColor: string;
  }) => string;
  /**
   * Replace the sessionId of an existing claude channel in place. Kills the
   * channel's current child process (if any) so the next `claude:send` will
   * spawn against the new session id.
   */
  switchClaudeSession: (channelId: string, newSessionId: string, newPreview: string) => void;
  remove: (id: string) => void;

  // Common edits
  rename: (id: string, name: string) => void;
  setIcon: (id: string, icon: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
}

function persist(channels: Channel[], activeChannelId: string) {
  const api = useSettingsStore.getState();
  api.updateSetting('channels', channels);
  if (activeChannelId) api.updateSetting('activeChannelId', activeChannelId);
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    return u.toString();
  } catch {
    return null;
  }
}

function hostFromUrl(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: 'openclaw',
  openclawSidebarOpen: false,
  activeWebview: null,
  setActiveWebview: (el) => set({ activeWebview: el }),

  setOpenclawSidebarOpen: (v) => set({ openclawSidebarOpen: v }),

  syncFromSettings: () => {
    const s = useSettingsStore.getState();
    set({ channels: s.channels, activeChannelId: s.activeChannelId });
  },

  setActive: (id) => {
    set({ activeChannelId: id });
    persist(get().channels, id);
  },

  enableBuiltin: (id) => {
    const channels = get().channels.map((c) =>
      c.id === id && c.builtin && c.kind === 'web' ? { ...c, enabled: true } : c
    );
    set({ channels, activeChannelId: id });
    persist(channels, id);
  },

  disableBuiltin: (id) => {
    const channels = get().channels.map((c) =>
      c.id === id && c.builtin && c.kind === 'web' ? { ...c, enabled: false } : c
    );
    let next = get().activeChannelId;
    if (next === id) next = 'openclaw';
    set({ channels, activeChannelId: next });
    persist(channels, next);
  },

  addCustom: (rawUrl) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return null;

    const existing = get().channels.find(
      (c) => c.kind === 'web' && hostFromUrl(c.url) === hostFromUrl(url)
    );
    if (existing) {
      get().setActive(existing.id);
      return existing.id;
    }

    const id = `u-${Date.now()}`;
    const newChannel: WebChannelDef = {
      id, kind: 'web', name: hostFromUrl(url), url,
      icon: '🌐', builtin: false, enabled: true,
    };
    const channels = [...get().channels, newChannel];
    set({ channels, activeChannelId: id });
    persist(channels, id);
    return id;
  },

  addClaude: ({ projectDir, projectKey, sessionId, preview, iconLetter, iconColor }) => {
    // Dedupe by (kind:'claude', sessionId)
    const existing = get().channels.find(
      (c) => c.kind === 'claude' && c.sessionId === sessionId
    );
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
    const newChannel: ClaudeChannelDef = {
      id,
      kind: 'claude',
      name: `${shortName} · ${trimmedPreview}`,
      builtin: false,
      enabled: true,
      projectDir,
      projectKey,
      sessionId,
      preview,
      iconLetter,
      iconColor,
    };
    const channels = [...get().channels, newChannel];
    set({ channels, activeChannelId: id });
    persist(channels, id);
    return id;
  },

  switchClaudeSession: (channelId, newSessionId, newPreview) => {
    const list = get().channels;
    const target = list.find((c) => c.id === channelId);
    if (!target || target.kind !== 'claude') return;
    if (target.sessionId === newSessionId) return;

    // Kill the in-flight child for the old session, if any.
    window.electronAPI?.claude?.kill(channelId).catch(() => { /* ignore */ });

    const trimmedPreview = newPreview.length > 28
      ? newPreview.slice(0, 28) + '…'
      : newPreview || '(empty session)';
    const projectShort = (() => {
      const parts = target.projectDir.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : target.projectDir;
    })();

    const channels = list.map((c) =>
      c.id === channelId && c.kind === 'claude'
        ? { ...c, sessionId: newSessionId, preview: newPreview, name: `${projectShort} · ${trimmedPreview}` }
        : c
    );
    set({ channels });
    persist(channels, get().activeChannelId);
  },

  remove: (id) => {
    const list = get().channels;
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const target = list[idx];
    if (target.kind === 'openclaw' || target.builtin) return;
    if (target.kind === 'claude') {
      window.electronAPI?.claude?.kill(id).catch(() => { /* ignore */ });
    }
    const channels = list.filter((c) => c.id !== id);
    let next = get().activeChannelId;
    if (next === id) {
      const fallback = channels[Math.max(0, idx - 1)] ?? channels[0];
      next = fallback?.id ?? 'openclaw';
    }
    set({ channels, activeChannelId: next });
    persist(channels, next);
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const channels = get().channels.map((c) =>
      c.id === id && c.kind !== 'openclaw' ? { ...c, name: trimmed } : c
    );
    set({ channels });
    persist(channels, get().activeChannelId);
  },

  setIcon: (id, icon) => {
    const channels = get().channels.map((c) =>
      c.id === id && c.kind === 'web' ? { ...c, icon } : c
    );
    set({ channels });
    persist(channels, get().activeChannelId);
  },

  moveUp: (id) => {
    const list = [...get().channels];
    const i = list.findIndex((c) => c.id === id);
    if (i <= 1) return; // index 0 is OpenClaw, can't move above it
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    set({ channels: list });
    persist(list, get().activeChannelId);
  },

  moveDown: (id) => {
    const list = [...get().channels];
    const i = list.findIndex((c) => c.id === id);
    if (i < 0 || i >= list.length - 1) return;
    if (list[i].kind === 'openclaw') return;
    [list[i], list[i + 1]] = [list[i + 1], list[i]];
    set({ channels: list });
    persist(list, get().activeChannelId);
  },
}));

// Smoke checks (dev only) — verify URL normalizer behaviour at load time
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  console.assert(normalizeUrl('') === null, 'empty → null');
  console.assert(normalizeUrl('   ') === null, 'whitespace → null');
  console.assert(normalizeUrl('example.com') === 'https://example.com/', 'auto https://');
  console.assert(normalizeUrl('http://x.test')?.startsWith('http://'), 'preserve http://');
  console.assert(normalizeUrl('not a url') === null, 'invalid → null');
}
