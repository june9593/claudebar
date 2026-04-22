# Channel Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current OpenClaw-only renderer shell with a left-edge channel dock that hosts OpenClaw plus arbitrary IM web channels (Telegram / Discord / Feishu / Lark / user-added URLs), each persisted across restarts in its own Electron `<webview>` partition.

**Architecture:** A 48 px vertical dock on the left of the main window lists all enabled channels and a `+` add button. The right side mounts every enabled channel at once, switching visibility with `display`. Channel records are stored in `~/.clawbar/settings.json` under a new `channels` array. Web channels are rendered via Electron's `<webview>` tag with persistent partitions for per-channel cookies/login.

**Tech Stack:** React 19 + Zustand 5, Electron 35 (`<webview>` tag), TypeScript. No new runtime dependencies.

---

## File Structure

| Path | Purpose |
|---|---|
| `src/types/index.ts` | Add `Channel` interface; extend `Settings` with `channels` and `activeChannelId`. |
| `electron/ipc/settings.ts` | Add new defaults (5 built-in channels) and whitelist new keys. |
| `src/stores/channelStore.ts` (new) | Zustand store: channel list, active id, CRUD actions, hydration from settings, persistence via `electronAPI.settings.set`. |
| `src/components/ChannelDock.tsx` (new) | 48 px vertical column rendering icons + `+` button. |
| `src/components/ChannelIcon.tsx` (new) | Single icon button with active state, hover tooltip, right-click context menu. |
| `src/components/ChannelHost.tsx` (new) | Renders all enabled channels, toggles visibility by `activeChannelId`. |
| `src/components/WebChannel.tsx` (new) | Wraps `<webview>` with the channel's URL + persistent partition. |
| `src/components/AddChannelMenu.tsx` (new) | Popover anchored to `+`: built-in toggles + custom URL input. |
| `src/components/ChannelContextMenu.tsx` (new) | Right-click menu: rename, change icon, move up/down, hide/delete. |
| `src/components/OpenClawChannel.tsx` (new) | Thin wrapper around the existing OpenClaw UI (`CompactChat` or `ChatWebView` based on `chatMode`). Replaces the current ternary in `App.tsx`. |
| `src/App.tsx` | Replace OpenClaw mount with `<ChannelDock /> + <ChannelHost />`. |
| `electron/main.ts` | Add `webviewTag: true` to webPreferences. |
| `types/electron.d.ts` | No changes (we reuse the existing settings IPC). |

Tests: this codebase has no Vitest setup (the dependency was removed in commit `36d4a1b`). To keep the plan executable without re-introducing a test framework, we verify each task by **type check + manual run + visual inspection of `npm run dev:electron`**. Where a piece of pure logic is testable in isolation (URL normalization, dedupe), we add an inline `assert` smoke check that runs at module load in dev mode.

---

## Task 1: Define `Channel` types and extend `Settings`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `Channel` and update `Settings`**

Replace the contents of `src/types/index.ts` with:

```ts
export interface Settings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  channels: Channel[];
  activeChannelId: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
export type ViewState = 'chat' | 'settings';

export type ChannelKind = 'openclaw' | 'web';

interface BaseChannel {
  id: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
}

export interface OpenClawChannelDef extends BaseChannel {
  kind: 'openclaw';
  builtin: true;
  enabled: true;
}

export interface WebChannelDef extends BaseChannel {
  kind: 'web';
  url: string;
  icon: string; // emoji string OR favicon URL
}

export type Channel = OpenClawChannelDef | WebChannelDef;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: errors complaining about missing `channels`/`activeChannelId` in `defaults` (settingsStore.ts) and elsewhere — that's fine; we'll fix in next tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Channel discriminated union + Settings.channels"
```

---

## Task 2: Built-in channel defaults in main process

**Files:**
- Modify: `electron/ipc/settings.ts`

- [ ] **Step 1: Add channel defaults and whitelist new keys**

Replace `electron/ipc/settings.ts` with:

```ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface Channel {
  id: string;
  kind: 'openclaw' | 'web';
  name: string;
  builtin: boolean;
  enabled: boolean;
  url?: string;
  icon?: string;
}

interface AppSettings {
  gatewayUrl: string;
  authMode: 'none' | 'token' | 'password';
  authToken: string;
  authPassword: string;
  theme: 'light' | 'dark' | 'system';
  chatMode: 'compact' | 'classic';
  hideOnClickOutside: boolean;
  autoLaunch: boolean;
  channels: Channel[];
  activeChannelId: string;
}

const defaultChannels: Channel[] = [
  { id: 'openclaw', kind: 'openclaw', name: 'OpenClaw',  builtin: true, enabled: true },
  { id: 'telegram', kind: 'web',      name: 'Telegram',  builtin: true, enabled: true, url: 'https://web.telegram.org/', icon: '✈️' },
  { id: 'discord',  kind: 'web',      name: 'Discord',   builtin: true, enabled: true, url: 'https://discord.com/app',   icon: '💬' },
  { id: 'feishu',   kind: 'web',      name: '飞书',      builtin: true, enabled: true, url: 'https://www.feishu.cn/messenger/',     icon: '🪶' },
  { id: 'lark',     kind: 'web',      name: 'Lark',      builtin: true, enabled: true, url: 'https://www.larksuite.com/messenger/', icon: '🐦' },
];

const defaults: AppSettings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'none',
  authToken: '',
  authPassword: '',
  theme: 'system',
  chatMode: 'compact',
  hideOnClickOutside: false,
  autoLaunch: false,
  channels: defaultChannels,
  activeChannelId: 'openclaw',
};

function getConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.clawbar', 'settings.json');
}

function readStore(): AppSettings {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaults, ...data };
    }
  } catch { /* ignore */ }
  return { ...defaults };
}

function writeStore(settings: AppSettings): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getSettings(): AppSettings {
  return readStore();
}

export function setupSettingsIPC() {
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    if (typeof key !== 'string' || !key) return;

    const allowedKeys = [
      'gatewayUrl', 'authMode', 'authToken', 'authPassword',
      'theme', 'chatMode', 'hideOnClickOutside', 'autoLaunch',
      'channels', 'activeChannelId',
    ];
    if (!allowedKeys.includes(key)) return;

    const settings = readStore();
    (settings as unknown as Record<string, unknown>)[key] = value;
    writeStore(settings);
  });
}
```

- [ ] **Step 2: Verify main-process type-check passes**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/settings.ts
git commit -m "feat(settings): seed default channels + whitelist new keys"
```

---

## Task 3: Renderer settings store accepts channels

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Add channels/activeChannelId to defaults and persist them**

Edit `src/stores/settingsStore.ts`. Update the `defaults` const and the `updateSetting`'s localStorage extraction to include new keys.

Replace the `defaults` block:

```ts
const defaults: Settings = {
  gatewayUrl: 'http://localhost:18789',
  authMode: 'none',
  authToken: '',
  authPassword: '',
  theme: 'system',
  chatMode: 'compact',
  hideOnClickOutside: false,
  autoLaunch: false,
  channels: [
    { id: 'openclaw', kind: 'openclaw', name: 'OpenClaw',  builtin: true, enabled: true },
    { id: 'telegram', kind: 'web',      name: 'Telegram',  builtin: true, enabled: true, url: 'https://web.telegram.org/', icon: '✈️' },
    { id: 'discord',  kind: 'web',      name: 'Discord',   builtin: true, enabled: true, url: 'https://discord.com/app',   icon: '💬' },
    { id: 'feishu',   kind: 'web',      name: '飞书',      builtin: true, enabled: true, url: 'https://www.feishu.cn/messenger/',     icon: '🪶' },
    { id: 'lark',     kind: 'web',      name: 'Lark',      builtin: true, enabled: true, url: 'https://www.larksuite.com/messenger/', icon: '🐦' },
  ],
  activeChannelId: 'openclaw',
};
```

Add `import type { Channel, Settings, ViewState } from '../types';` at the top (replacing the existing import). The store's `set/get` work without any other change because new keys flow through the existing `{ ...defaults, ...settings }` merge.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual run sanity check**

Run: `npm run dev:electron`
Expected: app boots; Settings panel still works; close window. (`channels` is silently in the store but unused.)

- [ ] **Step 4: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat(store): defaults include channels[] + activeChannelId"
```

---

## Task 4: Channel store

**Files:**
- Create: `src/stores/channelStore.ts`

- [ ] **Step 1: Implement `channelStore`**

Create `src/stores/channelStore.ts`:

```ts
import { create } from 'zustand';
import type { Channel, WebChannelDef } from '../types';
import { useSettingsStore } from './settingsStore';

interface ChannelState {
  channels: Channel[];
  activeChannelId: string;

  // Hydrate from settings store (call after settings load)
  syncFromSettings: () => void;

  setActive: (id: string) => void;

  // Built-in toggles
  enableBuiltin: (id: string) => void;
  disableBuiltin: (id: string) => void;

  // CRUD on user-added
  addCustom: (url: string) => string | null;  // returns id, or null if duplicate / invalid
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

  remove: (id) => {
    const list = get().channels;
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const target = list[idx];
    if (target.kind === 'openclaw' || target.builtin) return;
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
if (import.meta.env?.DEV) {
  console.assert(normalizeUrl('') === null, 'empty → null');
  console.assert(normalizeUrl('   ') === null, 'whitespace → null');
  console.assert(normalizeUrl('example.com') === 'https://example.com/', 'auto https://');
  console.assert(normalizeUrl('http://x.test')?.startsWith('http://'), 'preserve http://');
  console.assert(normalizeUrl('not a url') === null, 'invalid → null');
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/stores/channelStore.ts
git commit -m "feat(channels): zustand store with CRUD + URL normalization"
```

---

## Task 5: Enable `<webview>` in main process

**Files:**
- Modify: `electron/main.ts:95-100`

- [ ] **Step 1: Set `webviewTag: true`**

In `createWindow()`, change the `webPreferences` block to:

```ts
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
```

- [ ] **Step 2: Type-check main process**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(electron): enable <webview> tag for channel hosting"
```

---

## Task 6: `WebChannel` component

**Files:**
- Create: `src/components/WebChannel.tsx`

- [ ] **Step 1: Implement WebChannel**

Create `src/components/WebChannel.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { WebChannelDef } from '../types';
import { useChannelStore } from '../stores/channelStore';

interface Props {
  channel: WebChannelDef;
  isActive: boolean;
}

// Electron webview is a custom element — declare it for TS/React.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}

export function WebChannel({ channel, isActive }: Props) {
  const webviewRef = useRef<HTMLElement | null>(null);
  const setIcon = useChannelStore((s) => s.setIcon);

  // Capture favicon updates for user-added channels (so the dock icon
  // stops being 🌐 once the page loads).
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || channel.builtin) return;

    const onFavicon = (e: Event) => {
      const ev = e as Event & { favicons?: string[] };
      const url = ev.favicons?.[0];
      if (url) setIcon(channel.id, url);
    };
    el.addEventListener('page-favicon-updated', onFavicon as EventListener);
    return () => el.removeEventListener('page-favicon-updated', onFavicon as EventListener);
  }, [channel.id, channel.builtin, setIcon]);

  return (
    <webview
      ref={(el) => { webviewRef.current = el; }}
      src={channel.url}
      partition={`persist:channel-${channel.id}`}
      allowpopups="true"
      style={{
        width: '100%',
        height: '100%',
        display: isActive ? 'flex' : 'none',
        background: 'var(--color-bg-primary)',
      }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/WebChannel.tsx
git commit -m "feat(channels): WebChannel mounts persistent <webview>"
```

---

## Task 7: `OpenClawChannel` wrapper

**Files:**
- Create: `src/components/OpenClawChannel.tsx`

- [ ] **Step 1: Move OpenClaw mount logic out of App.tsx**

Create `src/components/OpenClawChannel.tsx`:

```tsx
import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { CompactChat } from './CompactChat';
import { ChatWebView } from './ChatWebView';

interface Props {
  isActive: boolean;
}

export function OpenClawChannel({ isActive }: Props) {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', display: isActive ? 'flex' : 'none' }}>
      {chatMode === 'compact'
        ? <CompactChat sidebarOpen={sidebarOpen} onSidebarClose={() => setSidebarOpen(false)} />
        : <ChatWebView />
      }
    </div>
  );
}
```

Note: in this iteration we drop the old TitleBar hamburger that toggled `sidebarOpen`. The OpenClaw internal sidebar is still accessible from inside `CompactChat`'s own UI controls. We re-wire the hamburger in Task 12 once channels are wired up.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/OpenClawChannel.tsx
git commit -m "feat(channels): OpenClawChannel wrapper around existing UI"
```

---

## Task 8: `ChannelHost` mounts everything

**Files:**
- Create: `src/components/ChannelHost.tsx`

- [ ] **Step 1: Implement host**

Create `src/components/ChannelHost.tsx`:

```tsx
import { useChannelStore } from '../stores/channelStore';
import { OpenClawChannel } from './OpenClawChannel';
import { WebChannel } from './WebChannel';

export function ChannelHost() {
  const channels = useChannelStore((s) => s.channels);
  const activeId = useChannelStore((s) => s.activeChannelId);

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      {channels
        .filter((c) => c.enabled)
        .map((c) => {
          const isActive = c.id === activeId;
          if (c.kind === 'openclaw') {
            return <OpenClawChannel key={c.id} isActive={isActive} />;
          }
          return <WebChannel key={c.id} channel={c} isActive={isActive} />;
        })
      }
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChannelHost.tsx
git commit -m "feat(channels): ChannelHost mounts every enabled channel"
```

---

## Task 9: `ChannelIcon` button

**Files:**
- Create: `src/components/ChannelIcon.tsx`

- [ ] **Step 1: Implement the icon button**

Create `src/components/ChannelIcon.tsx`:

```tsx
import { useState } from 'react';
import type { Channel } from '../types';
import { LobsterIcon } from './LobsterIcon';

interface Props {
  channel: Channel;
  active: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function ChannelIcon({ channel, active, onClick, onContextMenu }: Props) {
  const [hover, setHover] = useState(false);

  const renderGlyph = () => {
    if (channel.kind === 'openclaw') {
      return <LobsterIcon size={22} />;
    }
    const icon = channel.icon;
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
      return <img src={icon} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />;
    }
    return <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>;
  };

  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={channel.name}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: 'none',
          background: active ? 'var(--color-surface-active)' : (hover ? 'var(--color-surface-hover)' : 'transparent'),
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {renderGlyph()}
      </button>
      {/* Active indicator pill on the left edge */}
      {active && (
        <span style={{
          position: 'absolute', left: -10, top: 8, width: 3, height: 20,
          borderRadius: 2, background: 'var(--color-accent)',
        }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChannelIcon.tsx
git commit -m "feat(channels): ChannelIcon button with active indicator"
```

---

## Task 10: `AddChannelMenu` popover

**Files:**
- Create: `src/components/AddChannelMenu.tsx`

- [ ] **Step 1: Implement popover**

Create `src/components/AddChannelMenu.tsx`:

```tsx
import { useState } from 'react';
import { useChannelStore } from '../stores/channelStore';
import type { WebChannelDef } from '../types';

interface Props {
  onClose: () => void;
}

export function AddChannelMenu({ onClose }: Props) {
  const channels = useChannelStore((s) => s.channels);
  const enableBuiltin = useChannelStore((s) => s.enableBuiltin);
  const setActive = useChannelStore((s) => s.setActive);
  const addCustom = useChannelStore((s) => s.addCustom);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const builtinWeb = channels.filter((c): c is WebChannelDef => c.kind === 'web' && c.builtin);

  const handleAdd = () => {
    const id = addCustom(url);
    if (!id) {
      setError('Invalid URL');
      return;
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute', left: 56, bottom: 12,
        width: 280,
        background: 'var(--color-bg-primary)',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 12,
        zIndex: 100,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
        Add a channel
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '8px 0 4px' }}>
        Built-in
      </div>
      {builtinWeb.map((c) => (
        <button
          key={c.id}
          onClick={() => {
            if (c.enabled) setActive(c.id);
            else enableBuiltin(c.id);
            onClose();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '6px 8px', borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 18 }}>{c.icon}</span>
          <span style={{ flex: 1 }}>{c.name}</span>
          <span style={{ color: c.enabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
            {c.enabled ? '✓' : '+'}
          </span>
        </button>
      ))}

      <div style={{ borderTop: '0.5px solid var(--color-border-primary)', margin: '10px 0 6px' }} />
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Custom
      </div>
      <input
        type="text"
        placeholder="https://..."
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        autoFocus
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6,
          border: '0.5px solid var(--color-border-primary)',
          background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
          fontSize: 13, fontFamily: 'inherit',
        }}
      />
      {error && (
        <div style={{ color: 'var(--color-status-disconnected)', fontSize: 11, marginTop: 4 }}>{error}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 6 }}>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!url.trim()}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: url.trim() ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            color: url.trim() ? 'var(--color-bubble-user-text)' : 'var(--color-text-tertiary)',
            cursor: url.trim() ? 'pointer' : 'default', fontSize: 12,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/AddChannelMenu.tsx
git commit -m "feat(channels): + button popover with built-in toggles + custom URL"
```

---

## Task 11: `ChannelContextMenu`

**Files:**
- Create: `src/components/ChannelContextMenu.tsx`

- [ ] **Step 1: Implement context menu**

Create `src/components/ChannelContextMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Channel } from '../types';
import { useChannelStore } from '../stores/channelStore';

interface Props {
  channel: Channel;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelContextMenu({ channel, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rename = useChannelStore((s) => s.rename);
  const setIcon = useChannelStore((s) => s.setIcon);
  const moveUp = useChannelStore((s) => s.moveUp);
  const moveDown = useChannelStore((s) => s.moveDown);
  const remove = useChannelStore((s) => s.remove);
  const disableBuiltin = useChannelStore((s) => s.disableBuiltin);
  const [editing, setEditing] = useState<'name' | 'icon' | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const startEdit = (mode: 'name' | 'icon') => {
    setDraft(mode === 'name' ? channel.name : (channel.kind === 'web' ? channel.icon : ''));
    setEditing(mode);
  };

  const commit = () => {
    if (!editing) return;
    if (editing === 'name') rename(channel.id, draft);
    else if (editing === 'icon' && draft.trim()) setIcon(channel.id, draft.trim());
    setEditing(null);
    onClose();
  };

  const isOpenClaw = channel.kind === 'openclaw';

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y,
        minWidth: 160,
        background: 'var(--color-bg-primary)',
        border: '0.5px solid var(--color-border-primary)',
        borderRadius: 8, boxShadow: 'var(--shadow-card)',
        padding: 4, zIndex: 200, fontSize: 13,
      }}
    >
      {editing ? (
        <div style={{ padding: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
            autoFocus
            placeholder={editing === 'icon' ? 'emoji or favicon URL' : ''}
            style={{
              width: '100%', padding: '4px 6px', borderRadius: 4,
              border: '0.5px solid var(--color-border-primary)',
              background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
              fontSize: 13, fontFamily: 'inherit',
            }}
          />
        </div>
      ) : (
        <>
          {!isOpenClaw && <Item label="Rename"      onClick={() => startEdit('name')} />}
          {channel.kind === 'web' && <Item label="Change icon" onClick={() => startEdit('icon')} />}
          {!isOpenClaw && <Item label="Move up"     onClick={() => { moveUp(channel.id); onClose(); }} />}
          {!isOpenClaw && <Item label="Move down"   onClick={() => { moveDown(channel.id); onClose(); }} />}
          {channel.kind === 'web' && channel.builtin && (
            <Item label="Hide" onClick={() => { disableBuiltin(channel.id); onClose(); }} />
          )}
          {channel.kind === 'web' && !channel.builtin && (
            <Item label="Delete" danger onClick={() => { remove(channel.id); onClose(); }} />
          )}
          {isOpenClaw && (
            <div style={{ padding: '6px 10px', color: 'var(--color-text-tertiary)' }}>
              OpenClaw cannot be removed
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '6px 10px', borderRadius: 4,
        border: 'none', background: 'transparent',
        color: danger ? 'var(--color-status-disconnected)' : 'var(--color-text-primary)',
        cursor: 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChannelContextMenu.tsx
git commit -m "feat(channels): right-click context menu (rename/icon/move/hide/delete)"
```

---

## Task 12: `ChannelDock` assembled

**Files:**
- Create: `src/components/ChannelDock.tsx`

- [ ] **Step 1: Implement the dock**

Create `src/components/ChannelDock.tsx`:

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Channel } from '../types';
import { useChannelStore } from '../stores/channelStore';
import { ChannelIcon } from './ChannelIcon';
import { AddChannelMenu } from './AddChannelMenu';
import { ChannelContextMenu } from './ChannelContextMenu';

export function ChannelDock() {
  const channels = useChannelStore((s) => s.channels);
  const activeId = useChannelStore((s) => s.activeChannelId);
  const setActive = useChannelStore((s) => s.setActive);
  const [adding, setAdding] = useState(false);
  const [ctx, setCtx] = useState<{ channel: Channel; x: number; y: number } | null>(null);

  const visible = channels.filter((c) => c.enabled);

  return (
    <div
      style={{
        width: 48, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0',
        gap: 6,
        borderRight: '0.5px solid var(--color-border-primary)',
        background: 'var(--color-bg-secondary)',
        position: 'relative',
        overflowY: 'auto',
      }}
    >
      {visible.map((c) => (
        <ChannelIcon
          key={c.id}
          channel={c}
          active={c.id === activeId}
          onClick={() => setActive(c.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtx({ channel: c, x: e.clientX, y: e.clientY });
          }}
        />
      ))}

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setAdding((v) => !v)}
        title="Add channel"
        style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: adding ? 'var(--color-surface-active)' : 'transparent',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={(e) => { if (!adding) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
        onMouseLeave={(e) => { if (!adding) e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={18} strokeWidth={1.75} />
      </button>

      {adding && <AddChannelMenu onClose={() => setAdding(false)} />}
      {ctx && <ChannelContextMenu channel={ctx.channel} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChannelDock.tsx
git commit -m "feat(channels): ChannelDock assembled (icons + add + context menu)"
```

---

## Task 13: Wire `App.tsx` into the new layout

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TitleBar.tsx`

- [ ] **Step 1: Replace OpenClaw mount with ChannelDock + ChannelHost**

Replace the entire body of `src/App.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { SettingsPanel } from './components/SettingsPanel';
import { ChannelDock } from './components/ChannelDock';
import { ChannelHost } from './components/ChannelHost';
import { useSettingsStore } from './stores/settingsStore';
import { useChannelStore } from './stores/channelStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const syncFromSettings = useChannelStore((s) => s.syncFromSettings);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (hydrated) syncFromSettings(); }, [hydrated, syncFromSettings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const unsub = window.electronAPI?.window?.onNavigate?.((v: string) => {
      if (v === 'settings') setView('settings');
      else if (v === 'chat') setView('chat');
    });
    return () => unsub?.();
  }, [setView]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fix = () => { if (el.scrollTop !== 0) el.scrollTop = 0; };
    fix();
    el.addEventListener('scroll', fix, { passive: true });
    return () => el.removeEventListener('scroll', fix);
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full"
      style={{ borderRadius: '12px', overflow: 'clip' }}
    >
      <TitleBar />
      <div className="flex-1 min-h-0 relative" style={{ display: 'flex' }}>
        <ChannelDock />
        <ChannelHost />
        {view === 'settings' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--color-bg-primary)',
            zIndex: 5,
          }}>
            <SettingsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Drop the old hamburger toggle from TitleBar usage**

Open `src/components/TitleBar.tsx`. The existing `onToggleSidebar` prop is no longer passed. Make `onToggleSidebar` optional and only render the hamburger when it exists. If TitleBar already supports the optional prop (it does, per existing code), no edit is needed beyond deleting the now-unused `interface TitleBarProps` field if the file requires it. **Verify**: open `TitleBar.tsx`, confirm the hamburger renders only when `onToggleSidebar` is truthy. If yes, leave it alone; if no, wrap the hamburger render in `{onToggleSidebar && (...)}`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Build + run**

Run: `npm run dev:electron`
Expected:
- App opens with a 48 px dock on the left containing 5 icons (lobster + 4 IM emojis) + a `+` at the bottom.
- OpenClaw icon active by default; the OpenClaw UI you had before fills the right area.
- Click each IM icon → corresponding webview loads (Telegram QR page, Discord login, Feishu, Lark).
- Click `+` → popover opens with 4 builtin items (all `✓` since enabled) and a URL input. Type `example.com` → Add → new channel appears in dock and is activated, loads example.com.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/TitleBar.tsx
git commit -m "feat(app): mount ChannelDock + ChannelHost as the renderer shell"
```

---

## Task 14: Switching channels preserves state

**Files:** none (verification task)

- [ ] **Step 1: Manual verification — login persistence**

Run: `npm run dev:electron`. In Telegram channel scan QR (or skip if no phone). Switch to Discord, switch back to Telegram. Expected: still on whatever screen you left it on, no reload. Quit and relaunch the app. Expected: Telegram still logged in (cookies persisted to `persist:channel-telegram` partition).

- [ ] **Step 2: Manual verification — OpenClaw connection survives switch**

Open OpenClaw channel, confirm WS connected (status dot in TitleBar). Switch to Discord → switch back. Expected: WS still connected (no re-auth, no flicker).

- [ ] **Step 3: Manual verification — duplicate URL handling**

Open `+`, add `example.com`. Open `+` again, add `https://example.com`. Expected: no second channel created; the existing example.com channel is reactivated.

- [ ] **Step 4: Manual verification — right-click menu**

Right-click on Discord icon → Hide. Expected: icon disappears from dock; reopening `+` shows Discord with `+` (re-enable). Right-click a custom channel → Delete. Expected: removed.

- [ ] **Step 5: Commit (no changes; verification only)**

If everything passes, no commit needed. If a defect is found, fix it and commit with `fix(channels): <what>`.

---

## Task 15: Increase default window width to fit dock

**Files:**
- Modify: `electron/main.ts` (window default width)
- Modify: `src/stores/settingsStore.ts` (the chatMode resize hardcoded value)

- [ ] **Step 1: Increase main window default width**

In `electron/main.ts`, change the `BrowserWindow` constructor:

```ts
    width: savedBounds?.width ?? 440,    // was 380
```

The dock takes 48 px so the OpenClaw content area gets ~392 px (matches the original 380 baseline closely).

- [ ] **Step 2: Match the chatMode resize**

In `src/stores/settingsStore.ts`, the existing `updateSetting` resizes the window when `chatMode` changes. Update the compact branch:

```ts
        if (value === 'classic') {
          window.electronAPI?.window?.setSize(800, 700);
        } else {
          window.electronAPI?.window?.setSize(440, 560);   // was 380
        }
```

- [ ] **Step 3: Type-check + run**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit && npm run dev:electron`
Expected: app opens slightly wider; dock + content fit comfortably.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts src/stores/settingsStore.ts
git commit -m "chore(window): widen default to 440px to fit channel dock"
```

---

## Task 16: Update CLAUDE.md and ARCHITECTURE.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update CLAUDE.md description**

Open `CLAUDE.md`. Replace the opening paragraph with:

```markdown
# ClawBar

macOS menu bar chat client and management dashboard for OpenClaw plus a multi-channel IM hub. A 48 px channel dock on the left switches between OpenClaw (compact native chat / classic iframe + 10 operator views) and any number of web-based IM channels (Telegram, Discord, Feishu, Lark, or user-added URLs). Channels persist their login state across launches via Electron `<webview>` partitions.
```

- [ ] **Step 2: Update ARCHITECTURE.md overview + source layout**

In `docs/ARCHITECTURE.md`, update Section 1 ("Overview") opening to mention the channel dock, and add the new files in Section 2 ("Source layout") under `src/components/`:

```
│   ├── ChannelDock.tsx
│   ├── ChannelIcon.tsx
│   ├── ChannelHost.tsx
│   ├── WebChannel.tsx
│   ├── OpenClawChannel.tsx
│   ├── AddChannelMenu.tsx
│   ├── ChannelContextMenu.tsx
```

And under `src/stores/`:

```
│   ├── channelStore.ts
```

Add a new short Section 9 "Channels" with one paragraph: each entry in `settings.channels` becomes either an `OpenClawChannel` (the existing UI) or a `WebChannel` (`<webview partition="persist:channel-<id>">`). All enabled channels are mounted at once and toggled with `display`; partitions persist cookies/login per channel. Built-in IM channels can be reordered or hidden but not deleted; custom URL channels are fully editable.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md
git commit -m "docs: describe channel dock + per-channel webview partitions"
```

---

## Self-review

- **Spec coverage:** every spec section has a task — channel dock layout (Tasks 9, 12, 13), data model (Tasks 1–3), channelStore CRUD with normalize/dedupe (Task 4), webview behaviour (Tasks 5–6), AddChannelMenu (Task 10), ContextMenu (Task 11), edge cases verified (Task 14), out-of-scope items intentionally not included.
- **Placeholder scan:** none.
- **Type consistency:** `Channel` discriminated union in Task 1 is used identically in Tasks 4, 6, 7, 8, 9, 10, 11. `setIcon` / `rename` / `moveUp` / `moveDown` / `enableBuiltin` / `disableBuiltin` / `addCustom` / `remove` defined in Task 4 and consumed verbatim in 10/11/12. Partition string `persist:channel-${id}` consistent in Task 6 and verified in Task 14. `webviewTag: true` in Task 5 unblocks Task 6.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-22-channel-dock.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
