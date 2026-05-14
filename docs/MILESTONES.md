# ClaudeBar release milestones

## v0.5.0 (2026-05-12) — Phase 1: Bootstrap & Strip

- Forked from ClawBar v0.4.8 (full git history preserved)
- Renamed: `package.json` name/description, bundle id (`com.june9593.claudebar`), tray tooltip, window title, config dir (`~/.claudebar/`)
- Removed: OpenClaw WebSocket bridge (`electron/ws-bridge.ts`), all IM channel components (Telegram / Discord / Feishu / Lark / web), channel discriminated union (`openclaw | web | claude` → `claude` only), Ed25519 device-identity keypair, 5 OpenClaw-specific operator views (Approvals / Agents / Cron / Logs / Usage)
- Added: `~/.claudebar/` config dir + one-shot migration shim from `~/.clawbar/` (`electron/migration.ts`; copies `theme` / `petKind` / `petVisible` only; leaves ClawBar config intact)
- Renamed: `channelStore` → `sessionStore` (Claude-only), trimmed `settingsStore` to spec §6 fields (removed `gatewayUrl`, `authMode`, `chatMode`, `channels`, `activeChannelId`)
- Internal-only checkpoint; UI was "ClawBar minus OpenClaw"

## v0.6.0 (2026-05-12) — Phase 2: New shell

- **Window**: standalone floating `BrowserWindow` (400×800 default, draggable, resizable, persisted bounds); no dock icon; `webviewTag: false`
- **Tray click** → toggle visibility (no longer popover-anchored); right-click menu: New session / Settings / Switch Pet / Quit
- **Global shortcut** Cmd/Ctrl+Shift+C with live re-registration via `onSettingChanged` (no restart required)
- **Session rail** (32px): operator panel toggle (`≡`) / new-session (`⊕`) / per-session ClaudePet icons with red badge for pending approvals / settings (`⚙`)
- **Operator panel overlay** (320px, slide-out from left, semi-transparent backdrop, click-outside closes)
- **Markdown rendering** in chat: `react-markdown` + `remark-gfm` + `react-syntax-highlighter` (Prism `oneDark` / `oneLight`) with copy button per code block
- **Multi-line input**: `<textarea>` auto-grows up to 200px; Enter sends, Shift+Enter inserts newline
- **AddSessionWizard**: two-step project picker → resume existing session OR start new (placeholder UUID minted by renderer; real id flows back via `setRealSessionId`)
- **TitleBar** pads 76px left on macOS to clear traffic-light buttons

## v0.7.0 (2026-05-13) — Phase 3: Operator views (first feature-complete release)

- **7-tab operator panel**: Overview / Sessions / Plugins / Skills / Commands / Stats / Settings
- **Overview tab**: Claude CLI status (path + version), project count, active session count, today's token total, pending approval count
- **Sessions tab**: collapsible project tree sourced from `~/.claude/projects/`; paths show last 2 path segments to disambiguate (e.g. `edge/src` vs `chromium/src`); click any session to resume; hidden directory paths (e.g. `/Users/x/.vibebook/...`) decoded correctly
- **Plugins tab**: reads `~/.claude/plugins/installed_plugins.json`, deduped by plugin name (latest install date wins), shows marketplace and version
- **Skills tab**: three-layer walk (user `~/.claude/skills/` / project `.claude/skills/` / per-plugin `skills/`), grouped by source with badges; click shows SKILL.md preview
- **Commands tab**: same three-layer shape for `commands/` dirs; slash-prefixed display; search box; click shows command `.md`
- **Stats tab**: incremental cache in `~/.claudebar/usage-cache.json` with byte-offset tail reads (3s rescan throttle, partial-last-line guard), all-time totals + 14-day bar chart + per-model breakdown (Opus / Sonnet / Haiku), today bucket
- **Settings tab**: full form per spec §6 — Claude CLI group (`claudePath`, `defaultModel`, `defaultPermissionMode`, `defaultProjectDir`, `idleCloseMinutes`), Window group (`theme`, `alwaysOnTop`, `hideOnClickOutside`, `globalShortcut`, `petVisible`, `petKind`), Diagnostics group (`enableSdkTrace`, shell-env hydration status link)
- **Session rail icons**: `claudePetVariant()` hashed from stable row `id` (not the Claude session id, which mutates on `setRealSessionId`) — icon colour/shape stays constant across idle-reopen cycles
- **New IPC handlers**: `electron/ipc/plugins.ts`, `electron/ipc/skills.ts`, `electron/ipc/commands.ts`, `electron/ipc/stats.ts`
- **Bug fixes discovered in Phase 3 self-test**: React #185 (Zustand `.filter()` in selector infinite loop, fixed in `SessionRail.tsx`), React #310 (hooks below early return in `SkillsTab` / `CommandsTab`, fixed by moving hooks above returns)

## v0.7.1 (2026-05-14) — Renderer transport abstraction (Phase A1 of multi-device)

- Internal refactor — invisible to users; preparation for the multi-device feature (Phase A2/A3)
- New `src/lib/apiClient.ts`: single typed gateway over `window.electronAPI`. Same React bundle can later run inside a browser/PWA (Phase B) without UI changes
- Migrated all renderer call sites: `settingsStore`, `claudeSessionsStore`, `sessionStore`, `useClaudeSession`, `OperatorPanel`, `PetApp`. Existence guards (`if (!window.electronAPI?.foo)`) preserved as bootstrap signals
- CLAUDE.md convention added: never write `window.electronAPI.foo()` directly in `src/`
- Spec: `docs/specs/2026-05-13-multi-device-design.md` §15

## v0.7.2 (2026-05-15) — Multi-device A2a: pairing identity + UI shell

- New `~/.claudebar/device.json` (mode 0600): persistent ed25519 keypair generated on first launch
- New `~/.claudebar/peers.json`: paired-peer trust store (initially empty)
- New `electronAPI.peers` IPC: list/remove/setLabel/getMachineName/setMachineName/generatePin/cancelPin/activePin/claimPin
- New `PairingPanel` rendered as a "Pairing" card in Settings tab
- 6-digit PIN, 5-minute TTL, 5-attempt brute-force lockout (in-memory, never persisted)
- New `machineName` setting (defaults to `os.hostname()`)
- Phase A2a stub: claiming a PIN on the same machine creates a fake peer entry to enable UI iteration; A2b replaces with real PAKE handshake over WS+mTLS
- Verified end-to-end via Playwright: PIN generation → claim → peer persisted → 0 console errors
- Spec: `docs/specs/2026-05-13-multi-device-design.md` §4 + §11

## See also

- **Design spec**: `docs/specs/2026-05-12-claudebar-fork-design.md` — authoritative product description (264 lines); describes positioning, window form factor, UI layout, operator views, settings shape, stats caching strategy, migration sketch
- **Implementation plan**: `docs/plans/2026-05-12-claudebar-fork.md` — 27-task plan for all three phases; historical record of task-level decisions made during implementation
