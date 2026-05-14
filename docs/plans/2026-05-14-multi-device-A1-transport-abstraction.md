# ClaudeBar Multi-Device · Phase A1 — Renderer transport abstraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an `apiClient` abstraction in the renderer so all `window.electronAPI.*` call sites go through a single typed interface. Implement only the Electron transport. No behavior change. Ships as v0.7.1 — invisible to users; preparatory for Phase A2 (multi-device pairing) and B (PWA companion).

**Architecture:** A single TypeScript file (`src/lib/apiClient.ts`) declares the `ApiClient` interface and exports a module-level `apiClient` instance. At module init, it picks the implementation based on environment: Electron renderer → direct `window.electronAPI` wrapper; browser (no `window.electronAPI` available) → throws helpful errors saying "browser transport coming in Phase B". Every renderer call site moves from `window.electronAPI.foo.bar(...)` to `apiClient.foo.bar(...)`.

**Tech Stack:** No new deps. Pure TypeScript refactor. The interface is a 1:1 mirror of the existing `ElectronAPI` interface in `types/electron.d.ts`.

**Source spec:** [`docs/specs/2026-05-13-multi-device-design.md`](../specs/2026-05-13-multi-device-design.md) §15.

**Working directory:** `~/edge/claudebar`. All paths in this plan are relative to repo root.

---

## Phase A1 — `apiClient` abstraction (v0.7.1)

Goal: zero user-visible change. Build a renderer-side abstraction layer; migrate every `window.electronAPI.*` call site through it; ship a checkpoint release. After this phase, Phase A2 can add new IPC domains (peers, transport) by just adding to the `ApiClient` interface and the Electron implementation — no `window.electronAPI.*` writes anywhere in `src/`.

There are **31 visible call sites** across 6 files (verified via grep at plan time):

| File | Count |
|---|---|
| `src/hooks/useClaudeSession.ts` | 9 |
| `src/components/operator/OperatorPanel.tsx` | 9 |
| `src/pet/PetApp.tsx` | 5 |
| `src/stores/settingsStore.ts` | 4 |
| `src/stores/claudeSessionsStore.ts` | 3 |
| (plus ApprovalCard or others if any new ones appear) | + |

---

### Task 1: Create the `ApiClient` interface

**Files:**
- Create: `src/lib/apiClient.ts`

The interface mirrors the existing `ElectronAPI` interface in `types/electron.d.ts` exactly. We are NOT redesigning the API — just adding an indirection.

- [ ] **Step 1: Read the current `ElectronAPI` interface to know the exact shape**

Run: `cat types/electron.d.ts`

You should see a `ElectronAPI` interface with these top-level domains:
- `settings` — `get()`, `set(key, value)`, plus event listeners
- `claude` — `checkCli`, `scanProjects`, `listSessions`, `start`, `send`, `abort`, `close`, `approve`, `answer`, `loadHistory`, `onEvent`
- `plugins` — `list()`
- `skills` — `list(projectDir?)`, `read(skillDir)`
- `commands` — `list(projectDir?)`, `read(filePath)`
- `stats` — `get()`, `today()`
- `theme` — `getSystemTheme()`, `onThemeChange(cb)`
- `window` — `togglePin`, `hide`, `isPinned`, `setSize`
- `pet` — `onClick`, `onRightClick`, `onDrag`, `onDragEnd`

Note any I missed — capture the exact method signatures for Step 2.

- [ ] **Step 2: Create `src/lib/apiClient.ts` with the interface + Electron impl + dispatcher**

Create `src/lib/apiClient.ts`:

```ts
// ApiClient — single typed gateway from renderer to backend. Today the only
// implementation wraps window.electronAPI (Electron IPC). In Phase B a second
// implementation will speak WebSocket to a local main-process server, enabling
// the same React bundle to run inside a browser/PWA.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §15
//
// Migration rule: NO new file under src/ may call window.electronAPI directly.
// Every IPC interaction goes through `apiClient`.

import type { ElectronAPI } from '../../types/electron';

export type ApiClient = ElectronAPI;

function createElectronApiClient(): ApiClient {
  const w = window as unknown as { electronAPI?: ElectronAPI };
  if (!w.electronAPI) {
    throw new Error(
      'createElectronApiClient called but window.electronAPI is missing — ' +
      'preload script may have failed to load.'
    );
  }
  return w.electronAPI;
}

function createBrowserApiClient(): ApiClient {
  // Phase B will implement this — a WebSocket-based transport to a local
  // ClaudeBar main process. For now, throw on any usage so it's obvious
  // when something tries to run the renderer outside Electron.
  const reject = () => {
    throw new Error(
      'apiClient: browser transport not yet implemented (Phase B). ' +
      'Run inside the Electron shell.'
    );
  };
  return new Proxy({}, {
    get() { return reject; },
  }) as ApiClient;
}

function pickImpl(): ApiClient {
  if (typeof window === 'undefined') return createBrowserApiClient();
  const w = window as unknown as { electronAPI?: ElectronAPI };
  return w.electronAPI ? createElectronApiClient() : createBrowserApiClient();
}

export const apiClient: ApiClient = pickImpl();
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/apiClient.ts
git commit -m "feat(api): add apiClient abstraction over window.electronAPI

Spec §15: renderer transport abstraction. Single typed gateway so the
same React bundle can run inside Electron (today) and a browser/PWA
(Phase B). Today only wraps window.electronAPI; the browser path
throws a helpful error.

No call sites migrated yet — that's Tasks 2-7."
```

---

### Task 2: Migrate `src/stores/settingsStore.ts`

**Files:**
- Modify: `src/stores/settingsStore.ts`

3 read sites + 1 write site + 1 listener attach.

- [ ] **Step 1: Inspect current call sites**

```bash
grep -n "window.electronAPI" src/stores/settingsStore.ts
```

Expected output (5 lines):
```
69:      const settings = await window.electronAPI.settings.get();
74:        resolvedTheme = await window.electronAPI.theme.getSystemTheme();
75:        window.electronAPI.theme.onThemeChange((t) => {
93:        await window.electronAPI.settings.set(key, value);
```

(Line 60 may have a `if (!window.electronAPI?.settings)` guard — keep that exact check; it intentionally lets the store fall back to localStorage in browser mode and we want that to keep working in Phase B browser path even before the WS transport lands.)

- [ ] **Step 2: Add the import**

At the top of `src/stores/settingsStore.ts`, add:

```ts
import { apiClient } from '../lib/apiClient';
```

- [ ] **Step 3: Replace the 4 actual calls (NOT the guard check)**

Use these exact replacements:

| line | from | to |
|---|---|---|
| ~60 (the guard) | `if (!window.electronAPI?.settings)` | **leave as-is** — see step 1 note |
| ~69 | `await window.electronAPI.settings.get()` | `await apiClient.settings.get()` |
| ~74 | `await window.electronAPI.theme.getSystemTheme()` | `await apiClient.theme.getSystemTheme()` |
| ~75 | `window.electronAPI.theme.onThemeChange((t) => {` | `apiClient.theme.onThemeChange((t) => {` |
| ~93 | `await window.electronAPI.settings.set(key, value)` | `await apiClient.settings.set(key, value)` |

- [ ] **Step 4: Re-grep to verify**

```bash
grep -n "window.electronAPI" src/stores/settingsStore.ts
```

Expected: only the guard check on ~line 60 remains.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "refactor(api): settingsStore uses apiClient

Guard check at the top stays as-is — the localStorage fallback path is
intentional and the Phase B browser apiClient will still need it as a
boot-time signal."
```

---

### Task 3: Migrate `src/stores/claudeSessionsStore.ts`

**Files:**
- Modify: `src/stores/claudeSessionsStore.ts`

3 call sites — all `apiClient.claude.*`.

- [ ] **Step 1: Inspect call sites**

```bash
grep -n "window.electronAPI" src/stores/claudeSessionsStore.ts
```

Expected:
```
48:      const status = await window.electronAPI.claude.checkCli();
59:      const projects = await window.electronAPI.claude.scanProjects();
71:      const sessions = await window.electronAPI.claude.listSessions(projectKey);
```

- [ ] **Step 2: Add import**

At top of file:

```ts
import { apiClient } from '../lib/apiClient';
```

- [ ] **Step 3: Replace each call**

| line | from | to |
|---|---|---|
| 48 | `await window.electronAPI.claude.checkCli()` | `await apiClient.claude.checkCli()` |
| 59 | `await window.electronAPI.claude.scanProjects()` | `await apiClient.claude.scanProjects()` |
| 71 | `await window.electronAPI.claude.listSessions(projectKey)` | `await apiClient.claude.listSessions(projectKey)` |

- [ ] **Step 4: Verify**

```bash
grep -n "window.electronAPI" src/stores/claudeSessionsStore.ts
```

Expected: zero hits.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/stores/claudeSessionsStore.ts
git commit -m "refactor(api): claudeSessionsStore uses apiClient"
```

---

### Task 4: Migrate `src/components/operator/OperatorPanel.tsx`

**Files:**
- Modify: `src/components/operator/OperatorPanel.tsx`

9 call sites including 3 `Awaited<ReturnType<typeof window.electronAPI.X.Y>>` type aliases.

- [ ] **Step 1: Inspect**

```bash
grep -n "window.electronAPI" src/components/operator/OperatorPanel.tsx
```

You'll see 9 hits: 6 runtime calls + 3 type-only references inside `Awaited<ReturnType<typeof ...>>`.

- [ ] **Step 2: Add import at top**

```ts
import { apiClient } from '../../lib/apiClient';
```

- [ ] **Step 3: Replace runtime calls**

These are inside useEffect bodies in OverviewTab / PluginsTab / SkillsTab / CommandsTab / StatsTab:

| from | to |
|---|---|
| `window.electronAPI?.claude?.checkCli()` | `apiClient.claude.checkCli()` (drop the optional chain — apiClient is always defined) |
| `window.electronAPI?.claude?.scanProjects?.()` | `apiClient.claude.scanProjects()` |
| `window.electronAPI.stats.today()` | `apiClient.stats.today()` |
| `window.electronAPI.plugins.list()` | `apiClient.plugins.list()` |
| `window.electronAPI.skills.list(projectDir)` | `apiClient.skills.list(projectDir)` |
| `window.electronAPI.commands.list(projectDir)` | `apiClient.commands.list(projectDir)` |
| `window.electronAPI.stats.get()` | `apiClient.stats.get()` |

- [ ] **Step 4: Replace type aliases**

| from | to |
|---|---|
| `Awaited<ReturnType<typeof window.electronAPI.plugins.list>>` | `Awaited<ReturnType<typeof apiClient.plugins.list>>` |
| `Awaited<ReturnType<typeof window.electronAPI.skills.list>>` | `Awaited<ReturnType<typeof apiClient.skills.list>>` |
| `Awaited<ReturnType<typeof window.electronAPI.commands.list>>` | `Awaited<ReturnType<typeof apiClient.commands.list>>` |
| `Awaited<ReturnType<typeof window.electronAPI.stats.get>>` | `Awaited<ReturnType<typeof apiClient.stats.get>>` |

- [ ] **Step 5: Verify**

```bash
grep -n "window.electronAPI" src/components/operator/OperatorPanel.tsx
```

Expected: zero hits.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If any error mentions a method missing on apiClient, the `ApiClient = ElectronAPI` alias hasn't propagated — re-import.

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: clean (chunk-size warning is pre-existing).

- [ ] **Step 8: Commit**

```bash
git add src/components/operator/OperatorPanel.tsx
git commit -m "refactor(api): OperatorPanel uses apiClient

All 9 sites in OperatorPanel.tsx (6 runtime + 3 type aliases) migrated.
Drops the defensive optional chains — apiClient is module-level and
always defined."
```

---

### Task 5: Migrate `src/hooks/useClaudeSession.ts`

**Files:**
- Modify: `src/hooks/useClaudeSession.ts`

9 call sites — claude.checkCli / start / listSessions / loadHistory / onEvent / close / send / abort / approve / answer.

- [ ] **Step 1: Inspect**

```bash
grep -n "window.electronAPI" src/hooks/useClaudeSession.ts
```

Expect 9 lines (numbers approximate):
```
129:    const r = await window.electronAPI.claude.checkCli();
138:      await window.electronAPI.claude.start(channelId, projectDir, projectKey, sessionIdRef.current, r.path);
151:      const list = await window.electronAPI.claude.listSessions(projectKey).catch(() => []);
191:    window.electronAPI.claude.loadHistory(projectKey, sessionIdRef.current).then((turns) => {
202:    const unsub = window.electronAPI.claude.onEvent((envelope: ClaudeEventEnvelope) => {
382:      window.electronAPI.claude.close(channelId).catch(() => { /* ignore */ });
404:      window.electronAPI.claude.loadHistory(projectKey, sessionId).then((turns) => {
425:    window.electronAPI.claude.send(channelId, text).catch((e: Error) => {
433:    window.electronAPI.claude.abort(channelId).catch(() => { /* ignore */ });
440:    window.electronAPI.claude.approve(channelId, p.requestId, decision).catch(() => { /* ignore */ });
447:    window.electronAPI.claude.answer(channelId, p.requestId, answers).catch(() => { /* ignore */ });
```

- [ ] **Step 2: Add import**

At the top of `src/hooks/useClaudeSession.ts`:

```ts
import { apiClient } from '../lib/apiClient';
```

- [ ] **Step 3: Replace each — same pattern, `window.electronAPI.claude.X` → `apiClient.claude.X`**

Use a single sed-style edit if your editor supports it; otherwise edit each line individually. Do NOT change the surrounding `.then` / `.catch` chains, just the call expression.

- [ ] **Step 4: Verify**

```bash
grep -n "window.electronAPI" src/hooks/useClaudeSession.ts
```

Expected: zero hits.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useClaudeSession.ts
git commit -m "refactor(api): useClaudeSession uses apiClient

9 sites migrated — checkCli/start/listSessions/loadHistory/onEvent/
close/send/abort/approve/answer. Behavior unchanged; .then/.catch
chains preserved."
```

---

### Task 6: Migrate `src/pet/PetApp.tsx`

**Files:**
- Modify: `src/pet/PetApp.tsx`

5 call sites — settings + 4 pet.* event push methods.

- [ ] **Step 1: Inspect**

```bash
grep -n "window.electronAPI" src/pet/PetApp.tsx
```

Expected:
```
21:      const s = await window.electronAPI.settings.get();
52:    window.electronAPI.pet.onClick();
57:    window.electronAPI.pet.onRightClick();
73:        window.electronAPI.pet.onDrag(ev.screenX, ev.screenY);
81:        window.electronAPI.pet.onDragEnd();
```

- [ ] **Step 2: Add import**

At top of `src/pet/PetApp.tsx`:

```ts
import { apiClient } from '../lib/apiClient';
```

(Note: pet has a separate React entry point but lives in the same renderer-bundle pipeline; same import resolution.)

- [ ] **Step 3: Replace each**

| from | to |
|---|---|
| `await window.electronAPI.settings.get()` | `await apiClient.settings.get()` |
| `window.electronAPI.pet.onClick()` | `apiClient.pet.onClick()` |
| `window.electronAPI.pet.onRightClick()` | `apiClient.pet.onRightClick()` |
| `window.electronAPI.pet.onDrag(...)` | `apiClient.pet.onDrag(...)` |
| `window.electronAPI.pet.onDragEnd()` | `apiClient.pet.onDragEnd()` |

- [ ] **Step 4: Verify + type-check + build**

```bash
grep -n "window.electronAPI" src/pet/PetApp.tsx
npx tsc --noEmit
npm run build
```

All clean.

- [ ] **Step 5: Commit**

```bash
git add src/pet/PetApp.tsx
git commit -m "refactor(api): PetApp uses apiClient (pet window's React root)"
```

---

### Task 7: Sweep `src/` for stragglers + verify zero direct `window.electronAPI` usage

**Files:**
- (Possibly modify: any file with stragglers)

It's possible that ApprovalCard, ChatView, or another component has a `window.electronAPI` call that wasn't in the initial 6-file count (e.g. a `navigate` listener installed by App.tsx for the tray context-menu route, see `electron/main.ts` line ~144 `mainWindow?.webContents.send('navigate', 'settings')` which the renderer might consume).

- [ ] **Step 1: Whole-tree grep**

```bash
grep -rn "window.electronAPI" src/
```

Expected hits at this point:
- 0 in stores (covered by Tasks 2-3)
- 0 in components (covered by Task 4)
- 0 in hooks (covered by Task 5)
- 0 in pet (covered by Task 6)
- Possibly 1-2 stragglers in `src/App.tsx` (navigate listener) or `src/components/ChatView.tsx` if any direct calls exist

- [ ] **Step 2: For each remaining hit, migrate to apiClient**

Use the same pattern: add `import { apiClient } from '<relative>/lib/apiClient'` at top, replace the call.

- [ ] **Step 3: Verify zero hits**

```bash
grep -rn "window.electronAPI" src/
```

Expected: empty output.

- [ ] **Step 4: Verify guard checks survive (intentional)**

The settingsStore has an `if (!window.electronAPI?.settings)` guard — this DOES still reference `window.electronAPI` directly but only as an existence check, NOT as a call. Confirm:

```bash
grep -n "if (!window.electronAPI" src/
```

Expected: at most 1 hit in `src/stores/settingsStore.ts` (intentional, kept for browser-mode bootstrap).

If you want the guard to also go through apiClient, you can add a sentinel method like `apiClient.settings.isAvailable()` — but that's over-design for now; the direct existence check is fine and well-commented.

- [ ] **Step 5: Type-check + build**

```bash
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

All clean.

- [ ] **Step 6: Commit (only if Step 2 made changes)**

```bash
git add -A
git commit -m "refactor(api): final sweep — all renderer IPC goes through apiClient"
```

If Step 2 made no changes (all stragglers were imaginary), skip the commit.

---

### Task 8: Add CLAUDE.md convention reminder

**Files:**
- Modify: `CLAUDE.md` (add to "Conventions" section)

Future work (Phase A2/A3, Phase B, plus any unrelated future feature) MUST not write `window.electronAPI.foo()` in `src/`. Document this rule.

- [ ] **Step 1: Read current CLAUDE.md**

```bash
cat CLAUDE.md
```

Find the "Conventions" section.

- [ ] **Step 2: Add a new bullet to Conventions**

Insert this bullet after the existing "**IPC channels**" bullet:

```md
- **Renderer IPC** — never write `window.electronAPI.foo()` in `src/`. Import `apiClient` from `src/lib/apiClient.ts` and call `apiClient.foo()`. The abstraction lets the same React bundle run in Electron (today) and a browser/PWA (Phase B); see [`docs/specs/2026-05-13-multi-device-design.md`](docs/specs/2026-05-13-multi-device-design.md) §15.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): never call window.electronAPI directly in src/

Spec §15 abstraction is now load-bearing — Phase A2's new IPC domains
(peers, transport) and Phase B's browser apiClient both depend on
the renderer being transport-agnostic."
```

---

### Task 9: Bump version + DMG smoke + tag v0.7.1

**Files:** none (release prep)

- [ ] **Step 1: Bump version**

```bash
npm version 0.7.1 --no-git-tag-version --allow-same-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.7.1 (renderer transport abstraction checkpoint)"
```

- [ ] **Step 2: Full clean build**

```bash
npm run clean
npm run build
```

Expected: clean (the chunk-size warning is pre-existing and harmless).

- [ ] **Step 3: Pack DMG**

```bash
npm run pack:mac:dmg:arm64
```

Expected: `release-artifacts/ClaudeBar-0.7.1-mac-arm64.dmg` produced.

- [ ] **Step 4: Local smoke test (USER GATE — needs your eyes on the GUI)**

```bash
open release-artifacts/ClaudeBar-0.7.1-mac-arm64.dmg
```

Drag to /Applications, launch, verify:
- Window appears
- Operator panel opens, all 7 tabs render
- Settings tab is functional (theme picker works)
- Existing local sessions resume
- No console errors when running with `--remote-debugging-port=9222`

This is a refactor — if anything looks different from v0.7.0, it's a regression. Report it.

- [ ] **Step 5: Tag (USER APPROVAL GATE)**

After user confirms smoke test:

```bash
git tag v0.7.1
git push origin main
git push origin v0.7.1
```

- [ ] **Step 6: Update MILESTONES.md**

Append to `docs/MILESTONES.md`:

```md
## v0.7.1 (2026-05-14) — Renderer transport abstraction

- Internal refactor: introduced `apiClient` abstraction in `src/lib/apiClient.ts`
- Migrated all 31 `window.electronAPI.*` call sites in `src/` to `apiClient.*` (across 6 files: stores, hooks, OperatorPanel, PetApp)
- CLAUDE.md convention added: no direct `window.electronAPI` calls in `src/`
- Behavior identical to v0.7.0 — preparatory work for Phase A2 (multi-device pairing, v0.8.0) and Phase B (browser/PWA, future)
- Spec: [`docs/specs/2026-05-13-multi-device-design.md`](specs/2026-05-13-multi-device-design.md) §15
```

```bash
git add docs/MILESTONES.md
git commit -m "docs(milestones): add v0.7.1 — renderer transport abstraction"
git push origin main
```

---

## Phase A1 done

After these 9 tasks, the renderer has zero direct `window.electronAPI` writes (only the one intentional guard in settingsStore). Phase A2 can now add `apiClient.peers`, `apiClient.transport`, etc. by extending the interface and the Electron implementation in one place.

**Estimated effort:** ~2 hours of pure mechanical refactor + 30 min smoke test. No design decisions left.

**Next:** Phase A2 plan in `docs/plans/2026-05-14-multi-device-A2-pairing.md` — adds device keypair, mDNS discovery, mTLS WS server, PIN pairing UI.
