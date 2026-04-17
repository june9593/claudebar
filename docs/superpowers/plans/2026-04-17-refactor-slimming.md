# ClawBar Refactor & Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, eliminate duplication, fix silent bugs, and enforce design-token rules — without changing user-facing behavior.

**Architecture:** Keep current dual-process layout (Electron main + React renderer). Introduce ONE shared view scaffold (`ViewShell` + state components), ONE shared WS-request hook (`useWsRequest`), ONE shared formatters module. Delete unused types/exports/IPC handlers. Centralize hardcoded colors into CSS variables already defined in `design-tokens.json`.

**Tech Stack:** Electron 35, React 19, TypeScript, Vite 6, Tailwind 3, Zustand 5, Lucide React.

**Scope:** Pure refactor. No new features. F-27 pet is in-progress — we touch only dead/duplicate code within it, not visual behavior.

---

## File Structure

**New shared modules (create):**
- `src/components/views/ViewShell.tsx` — shared view wrapper (header + scroll body)
- `src/components/views/ViewStates.tsx` — `LoadingState`, `ErrorState`, `EmptyState`
- `src/hooks/useWsRequest.ts` — one-shot WS request/response hook
- `src/utils/format.ts` — `formatSessionName`, `timeAgo`, `formatRelative`

**Files to modify (extract + dedupe):**
- `src/components/OverviewView.tsx` — use new hook + formatters
- `src/components/AgentsView.tsx` — use ViewShell/states + new hook + remove duplicate "heartbeat: off"
- `src/components/CronView.tsx` — use ViewShell/states
- `src/components/SkillsView.tsx` — use ViewShell/states
- `src/components/SessionsView.tsx` — use formatters + new hook
- `src/components/ChatHistory.tsx` — delete (fold into SessionsView) OR use shared formatters
- `src/components/UsageView.tsx` — use new hook
- `src/components/LogsView.tsx` — replace hardcoded color + URL
- `src/components/ChatWebView.tsx` — remove hardcoded `#ffffff`
- `src/components/LobsterIcon.tsx` — replace hardcoded hex with tokens
- `src/components/SettingsPanel.tsx` — remove dead `hideOnClickOutside`/`autoLaunch` fields OR surface them
- `src/components/Sidebar.tsx` — drop unused `sidebarRef`
- `src/components/TitleBar.tsx` — move TitleButton hover to CSS
- `src/components/ApprovalCard.tsx` — remove unused `setTick`
- `src/components/CompactChat.tsx` — extract view router; keep only chat concerns
- `src/hooks/useClawChat.ts` — delete unused `fetchSessions`, `clearMessages` exports
- `src/stores/settingsStore.ts` — align default `authMode` with `settings.ts`
- `src/App.tsx` — remove phantom-scroll workaround if root cause fixable
- `src/styles/globals.css` — dedupe `.prose h3`; regroup `@keyframes`
- `src/types/index.ts` — delete unused `Message`/`Session`/`Agent` shadows
- `electron/ipc/settings.ts` — add `chatMode` (and any other missing keys) to `allowedKeys`
- `electron/pet-window.ts` — remove unused `pet:drag-end` handler; delete `getPetWindow`/`sendToPet` exports
- `electron/ws-bridge.ts` — no structural change; only if a silent bug surfaces during testing
- `electron/preload.ts` — drop `pet.onStatus`/`pet.onApproval` (duplicates `ws.*`)
- `types/electron.d.ts` — match preload changes

**Files to delete (if fold succeeds):**
- `src/components/ChatHistory.tsx` (only if SessionsView fully absorbs it)

---

## Task 1: Baseline typecheck + lint

**Files:** none modified.

- [ ] **Step 1: Verify renderer types clean before refactor**

Run: `npx tsc --noEmit`
Expected: PASS (baseline). If fails, capture errors — they become implicit tasks.

- [ ] **Step 2: Verify main-process types clean**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit a refactor-start marker**

```bash
git commit --allow-empty -m "chore: begin refactor/slimming pass (baseline clean)"
```

---

## Task 2: Shared formatters module

**Files:**
- Create: `src/utils/format.ts`

- [ ] **Step 1: Write `format.ts`**

```ts
// src/utils/format.ts
export function formatSessionName(key: string): string {
  if (!key) return '—';
  if (key === 'main') return 'Main';
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function timeAgo(ts: number | string | Date): string {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const formatRelative = timeAgo; // alias used by OverviewView
```

- [ ] **Step 2: Replace callsites in SessionsView, ChatHistory, OverviewView, AgentsView**

For each file, remove the local `formatSessionName` / `timeAgo` / `formatRelative` definitions and add:

```ts
import { formatSessionName, timeAgo, formatRelative } from '../utils/format';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/format.ts src/components/SessionsView.tsx src/components/ChatHistory.tsx src/components/OverviewView.tsx src/components/AgentsView.tsx
git commit -m "refactor: extract shared formatters (formatSessionName, timeAgo)"
```

---

## Task 3: Shared view scaffold

**Files:**
- Create: `src/components/views/ViewShell.tsx`
- Create: `src/components/views/ViewStates.tsx`

- [ ] **Step 1: Write `ViewShell.tsx`**

```tsx
// src/components/views/ViewShell.tsx
import { ReactNode } from 'react';

interface Props {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ViewShell({ title, actions, children }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        {actions}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ViewStates.tsx`**

```tsx
// src/components/views/ViewStates.tsx
import { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-secondary)' }}>
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-danger)' }}>
      {message}
    </div>
  );
}

export function EmptyState({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <div>{label}</div>
      {hint && <div className="opacity-70">{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Port CronView to ViewShell + ViewStates**

Delete the local ViewShell/LoadingState/ErrorState/EmptyState from `src/components/CronView.tsx` and add:

```tsx
import { ViewShell } from './views/ViewShell';
import { LoadingState, ErrorState, EmptyState } from './views/ViewStates';
```

Replace usage sites 1:1.

- [ ] **Step 4: Port SkillsView**

Same pattern as CronView in `src/components/SkillsView.tsx`.

- [ ] **Step 5: Port AgentsView**

Same pattern. Also remove the duplicate `"heartbeat: off"` string — keep only the one rendered for the actual "off" state.

- [ ] **Step 6: Port OverviewView and UsageView (where applicable)**

Only if they currently re-implement the same shell/state components. Leave behavior identical.

- [ ] **Step 7: Typecheck and visually smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS.

Then: `npm run dev:electron`, click through Cron, Skills, Agents, Overview, Usage views — confirm headers, loading, empty, error still render. Close the app.

- [ ] **Step 8: Commit**

```bash
git add src/components/views/ src/components/CronView.tsx src/components/SkillsView.tsx src/components/AgentsView.tsx src/components/OverviewView.tsx src/components/UsageView.tsx
git commit -m "refactor: unify ViewShell + Loading/Error/Empty states across views"
```

---

## Task 4: Shared WS-request hook

**Files:**
- Create: `src/hooks/useWsRequest.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useWsRequest.ts
import { useCallback, useEffect, useRef, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * One-shot request/response helper over the WS IPC bridge.
 * Fires `method` with `params` on mount (and when `deps` change), resolves
 * with the matching `ws:response` payload.
 */
export function useWsRequest<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  deps: unknown[] = [],
): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const reqIdRef = useRef<string | null>(null);

  const fire = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    const api = window.electronAPI?.ws;
    if (!api) { setState({ data: null, loading: false, error: 'bridge unavailable' }); return; }
    const res = await api.send(method, params);
    if (!res?.ok) { setState({ data: null, loading: false, error: String((res as { error?: unknown })?.error ?? 'send failed') }); return; }
    reqIdRef.current = res.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, JSON.stringify(params)]);

  useEffect(() => {
    const api = window.electronAPI?.ws;
    if (!api) return;
    const unsub = api.onResponse((data) => {
      if (data.id !== reqIdRef.current) return;
      if (data.ok) setState({ data: data.payload as T, loading: false, error: null });
      else setState({ data: null, loading: false, error: String((data.error as { message?: string })?.message ?? 'error') });
    });
    return () => { unsub?.(); };
  }, []);

  useEffect(() => { fire(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);

  return { ...state, refetch: fire };
}
```

- [ ] **Step 2: Migrate UsageView**

In `src/components/UsageView.tsx`, replace the existing `reqIdRef`-based fetch with:

```ts
const { data, loading, error, refetch } = useWsRequest<UsageResponse>('usage.get', {});
```

Keep the render tree unchanged.

- [ ] **Step 3: Migrate CronView, SkillsView, LogsView, SessionsView single-request callsites**

Leave AgentsView (two-phase) and OverviewView (5 parallel) for Task 5.

- [ ] **Step 4: Typecheck + smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS. Open each view in the app; confirm data still loads.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWsRequest.ts src/components/UsageView.tsx src/components/CronView.tsx src/components/SkillsView.tsx src/components/LogsView.tsx src/components/SessionsView.tsx
git commit -m "refactor: introduce useWsRequest hook and migrate single-request views"
```

---

## Task 5: OverviewView + AgentsView cleanup

**Files:**
- Modify: `src/components/OverviewView.tsx`
- Modify: `src/components/AgentsView.tsx`

- [ ] **Step 1: OverviewView — replace `got` flag pattern with `Promise.all` of 5 `useWsRequest`-equivalent calls**

Inside a single `useEffect`, issue the 5 `ws.send` calls, collect responses via a single `onResponse` listener keyed by the returned ids, and resolve when all complete. Keep the render output identical.

- [ ] **Step 2: AgentsView — extract two-phase fetch**

Phase 1: `agents.list` + `agents.status` → merge.
Phase 2: for each agent, `agent.identity`.
Replace the inline phase logic with two helper functions inside the file; each returns a typed result. Remove the duplicated "heartbeat: off" copy.

- [ ] **Step 3: Typecheck + smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS. Open Overview + Agents views; confirm all cards render and status ticks.

- [ ] **Step 4: Commit**

```bash
git add src/components/OverviewView.tsx src/components/AgentsView.tsx
git commit -m "refactor: simplify OverviewView parallel fetch and AgentsView two-phase fetch"
```

---

## Task 6: Fix silent `chatMode` persistence bug

**Files:**
- Modify: `electron/ipc/settings.ts`

- [ ] **Step 1: Read current `allowedKeys` array**

Confirm `chatMode` is missing.

- [ ] **Step 2: Add `chatMode` (and any other legitimate renderer-side keys) to `allowedKeys`**

```ts
const allowedKeys = [
  'gatewayUrl',
  'authToken',
  'authMode',
  'theme',
  'chatMode',
  // …keep existing entries
];
```

- [ ] **Step 3: Typecheck main process**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Build + launch: `npm run dev:electron`. In Settings, toggle chat mode, quit, relaunch. Confirm it persists.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/settings.ts
git commit -m "fix: persist chatMode through main-process settings (was falling back to localStorage)"
```

---

## Task 7: Align `authMode` default between store and main

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Change default `authMode: 'token'` → `authMode: 'none'`**

Match `electron/ipc/settings.ts`. If historical users relied on 'token', document in commit message.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "fix: align default authMode with main-process settings (none)"
```

---

## Task 8: Remove hardcoded colors (design-token compliance)

**Files:**
- Modify: `src/components/LogsView.tsx`
- Modify: `src/components/ChatWebView.tsx`
- Modify: `src/components/LobsterIcon.tsx`
- Modify: `src/styles/globals.css` (may need to add missing tokens)

- [ ] **Step 1: LogsView — replace `'#e6a700'` with CSS variable**

In `src/components/LogsView.tsx` around line 19, replace the hex with `var(--text-warn)`. If `--text-warn` is absent from `globals.css`, add it sourced from `docs/design-tokens.json` (value `#e6a700`).

- [ ] **Step 2: LogsView — replace hardcoded URL**

Line 232 `http://localhost:18789/logs` → derive from `useSettingsStore(s => s.gatewayUrl)`:

```ts
const gatewayUrl = useSettingsStore((s) => s.gatewayUrl);
const logsUrl = `${gatewayUrl.replace(/\/$/, '')}/logs`;
```

- [ ] **Step 3: ChatWebView — remove `color: '#ffffff'` at lines 105, 206**

Replace with `color: 'var(--text-on-accent)'` (add token if missing; token value from design-tokens.json).

- [ ] **Step 4: LobsterIcon — migrate hexes to tokens**

`#ff4d4d`, `#991b1b`, `#050810`, `#00e5cc` → add as `--pet-*` tokens in `globals.css` (mirroring the `pet.*` subtree of design-tokens.json), then reference.

- [ ] **Step 5: Typecheck + visual smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS.

Launch app, open Logs / chat / tray lobster. Confirm colors unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/LogsView.tsx src/components/ChatWebView.tsx src/components/LobsterIcon.tsx src/styles/globals.css
git commit -m "refactor: move remaining hardcoded colors to CSS variables"
```

---

## Task 9: Delete dead code (components, hooks, types, IPC)

**Files:**
- Modify: `src/hooks/useClawChat.ts` — remove exports `fetchSessions`, `clearMessages`
- Modify: `src/types/index.ts` — remove unused `Message`, `Session`, `Agent`
- Modify: `src/components/Sidebar.tsx` — remove unused `sidebarRef`
- Modify: `src/components/ApprovalCard.tsx` — remove write-only `setTick` state
- Modify: `src/components/TitleBar.tsx` — inline hover → CSS class
- Modify: `src/components/SettingsPanel.tsx` — delete UI-less `hideOnClickOutside` and `autoLaunch` fields (and their store entries) unless the user explicitly wants them surfaced later
- Modify: `electron/pet-window.ts` — delete `pet:drag-end` handler, `getPetWindow`, `sendToPet`
- Modify: `electron/preload.ts` — delete `pet.onStatus`, `pet.onApproval` (duplicates of `ws.*`)
- Modify: `types/electron.d.ts` — reflect preload changes

- [ ] **Step 1: Remove `fetchSessions` and `clearMessages` from useClawChat**

Grep first: `rg 'fetchSessions|clearMessages' src/` — confirm zero callers outside the hook itself.

- [ ] **Step 2: Delete dead types**

In `src/types/index.ts`, delete `Message`, `Session`, `Agent` if unused. Grep to confirm.

- [ ] **Step 3: Delete unused `sidebarRef` (line 37 of Sidebar.tsx) and write-only `setTick` (line 38 of ApprovalCard.tsx)**

- [ ] **Step 4: TitleBar — move inline hover to a CSS class**

Add a `.title-button` rule in `globals.css` with `:hover`, drop the inline `onMouseEnter/Leave` in `TitleBar.tsx`.

- [ ] **Step 5: SettingsPanel — remove `hideOnClickOutside`/`autoLaunch`**

Delete their entries from `settingsStore`, `electron/ipc/settings.ts` `allowedKeys`, and the panel. If any logic silently depends on them, search first with `rg 'hideOnClickOutside|autoLaunch'`.

- [ ] **Step 6: pet-window — delete dead IPC and exports**

Remove `ipcMain.on('pet:drag-end', ...)`, and delete `getPetWindow` / `sendToPet` from the exports. Grep to confirm zero external callers.

- [ ] **Step 7: preload + electron.d.ts — drop `pet.onStatus`/`pet.onApproval`**

Callers in `src/pet/*` should switch to `electronAPI.ws.onStatus` / `ws.onApproval`. Update those callsites.

- [ ] **Step 8: Typecheck both projects**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.node.json --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: delete dead exports, unused state, duplicate pet IPC surface"
```

---

## Task 10: CompactChat split (view router vs chat)

**Files:**
- Create: `src/components/ViewRouter.tsx`
- Modify: `src/components/CompactChat.tsx`
- Modify: `src/App.tsx` (wire the router)

- [ ] **Step 1: Create `ViewRouter.tsx`**

Extract the 9-view routing logic (everything that switches among Overview/Approvals/Sessions/Usage/Cron/Agents/Skills/Logs/Settings). Keep chat rendering in `CompactChat`.

```tsx
// src/components/ViewRouter.tsx
import { useSettingsStore } from '../stores/settingsStore';
import { OverviewView } from './OverviewView';
// …other imports
export function ViewRouter() {
  const view = useSettingsStore((s) => s.view);
  switch (view) {
    case 'overview': return <OverviewView />;
    // …
    default: return null;
  }
}
```

- [ ] **Step 2: Slim `CompactChat.tsx`**

Remove view-routing branches. `CompactChat` now renders chat only (header, messages, composer, sidebar toggle). Delete the inline agent-identity fetch (it duplicates AgentsView) — if the chat truly needs agent identity, consume the extracted helper added in Task 5.

- [ ] **Step 3: Update `App.tsx` to render `<ViewRouter />` when `view !== 'chat'`**

- [ ] **Step 4: Typecheck + smoke-test every view**

Run: `npx tsc --noEmit`. Launch app; click every sidebar entry; confirm each renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/ViewRouter.tsx src/components/CompactChat.tsx src/App.tsx
git commit -m "refactor: split CompactChat — extract ViewRouter, keep chat concerns only"
```

---

## Task 11: ChatHistory vs SessionsView dedup

**Files:**
- Modify: `src/components/SessionsView.tsx`
- Delete (if fold succeeds): `src/components/ChatHistory.tsx`

- [ ] **Step 1: Grep for ChatHistory usages**

Run: `rg "ChatHistory" src/`
If the only caller is `CompactChat`/sidebar, and the content is a near-duplicate of `SessionsView`, fold it.

- [ ] **Step 2: Fold OR keep**

If folding: replace callsites with `<SessionsView />` and delete `ChatHistory.tsx`.
If keeping (different UX): at minimum, both files must import `formatSessionName` from `utils/format.ts` (already done in Task 2).

- [ ] **Step 3: Typecheck + smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: dedupe ChatHistory against SessionsView"
```

---

## Task 12: CSS hygiene

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Dedupe `.prose h3`**

Remove the duplicate rule at line 166 (keep the first at line 159 or merge intentionally).

- [ ] **Step 2: Move `@keyframes typingBounce` out of the `.prose` block**

Group all `@keyframes` together at the bottom of the file for readability.

- [ ] **Step 3: Verify visually**

Launch app; confirm prose rendering and typing indicator unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: dedupe .prose h3 and regroup keyframes"
```

---

## Task 13: Revisit App.tsx phantom-scroll workaround

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Identify the focus-induced scroll culprit**

Comment out the workaround at lines 36-44. Launch. Reproduce the phantom scroll (focus on composer after opening a long view). Identify which child is setting `scrollTop`.

- [ ] **Step 2: Root-cause fix**

Typically: `position: absolute; inset: 0; overflow: clip;` on the offending wrapper, or `scrollIntoView({ block: 'nearest' })` replaced with a scoped scroll handle. Apply the minimal correct fix.

- [ ] **Step 3: If root cause is genuinely browser-layer**

Keep the workaround but add a single-line comment explaining which element triggers it.

- [ ] **Step 4: Typecheck + smoke-test**

Run: `npx tsc --noEmit`
Expected: PASS. Tab through composer + settings; no phantom scroll.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: root-cause fix for phantom scroll (or document residual workaround)"
```

---

## Task 14: Final sweep

**Files:** none specific.

- [ ] **Step 1: Full typecheck**

```
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
```
Expected: both PASS.

- [ ] **Step 2: Production build**

Run: `npm run build && npm run build:electron`
Expected: success.

- [ ] **Step 3: Grep for leftover hardcoded hex colors**

Run: `rg -n "#[0-9a-fA-F]{3,8}" src/ | rg -v "globals.css|LobsterIcon"` (after token migration, expect only main.ts base64 + globals.css).

- [ ] **Step 4: Grep for leftover `TODO`/`FIXME` introduced during refactor**

Run: `rg "TODO|FIXME" src/ electron/`

- [ ] **Step 5: Final commit (only if anything new)**

```bash
git commit --allow-empty -m "chore: refactor/slimming complete"
```

---

## Non-Goals (Explicit)

- No new features. F-27 pet is in-progress per `progress.json` — we touch only dead/duplicate code inside pet files, not visual behavior.
- No dependency upgrades (Electron/React/Tailwind versions unchanged).
- No protocol changes to `ws-bridge.ts` — the Ed25519 flow stays intact.
- No CLAUDE.md / AGENTS.md / PRD.md / DESIGN.md edits — those belong to their respective owners.

## Rollback Plan

Each task is a single commit. If a task breaks behavior discovered mid-execution:

```bash
git revert <sha>
```

Tasks are ordered so later tasks do not depend on earlier tasks' implementations — only on their extracted modules.
