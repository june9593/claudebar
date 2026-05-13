# ClaudeBar

A floating-window desktop app for local Claude Code CLI sessions. The user's installed `claude` binary is driven via the official Claude Agent SDK (`pathToClaudeCodeExecutable`) — nothing is bundled. Default window: 400×800, draggable, resizable. Tray-toggled plus global shortcut Cmd/Ctrl+Shift+C.

UI layout: 32px slim left rail (operator panel toggle / new-session / per-session ClaudePet icons with red badge for pending approvals / settings icon) + chat area + 320px slide-out operator panel overlay (7 tabs: Overview / Sessions / Plugins / Skills / Commands / Stats / Settings). The operator panel is an overlay — it does not compress the chat area.

## Commands

```bash
npm run dev              # Vite dev server (renderer only, port 5173)
npm run dev:electron     # Build electron + launch app
npm run build            # Production build (Vite + tsc)
npm run build:electron   # Compile electron/ + shared/ → dist-electron/
npx tsc --noEmit         # Type-check renderer
npx tsc -p tsconfig.node.json --noEmit  # Type-check main process
npm run pack:mac:dmg:arm64          # Local DMG (Apple Silicon, unsigned)
npm run pack:mac:dmg:arm64:release  # Signed + notarized DMG (needs .env, see PR #1)
CLAUDEBAR_TRACE=1 npm run dev:electron  # Dump every Claude SDK message to ~/.claudebar/sdk-trace.jsonl
                                        # (same effect as enabling enableSdkTrace in Settings)
```

## Conventions

- **No hardcoded colors** — all colors via CSS variables in `src/styles/globals.css`
- **IPC channels** — `domain:action` format (e.g. `settings:get`, `claude:start`, `plugins:list`, `skills:list`, `commands:list`, `stats:get`)
- **New IPC** — add handler in `electron/ipc/` → expose in `electron/preload.ts` → type in `types/electron.d.ts`. Cross-process types (event payloads etc.) live in `shared/` and are imported by both processes — `tsconfig.node.json` has `rootDir: "."` and `include: ["electron", "shared"]` for this reason
- **Security** — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false` (no web channels in ClaudeBar — this is the key difference from ClawBar, which needed `webviewTag: true` for its IM channel webviews)
- **State** — Zustand stores, no React Context. Selectors MUST NOT compute new arrays or objects (the React #185 trap). Call `.filter()` / `.map()` outside the selector in the component body. See the comment in `src/components/SessionRail.tsx` for the exact pattern.
- **Icons** — Lucide React only (`lucide-react`), size 18, strokeWidth 1.75
- **Markdown** — `react-markdown` v10 + `remark-gfm` + `react-syntax-highlighter` (Prism `oneDark` / `oneLight`). Each code block gets a copy-to-clipboard button.
- **Hook ordering** — `useMemo`, `useCallback`, and all other hooks MUST be declared ABOVE any early `return` statement. Conditional returns after hook declarations violate React Rules of Hooks (React #310). See `SkillsTab` and `CommandsTab` in `OperatorPanel.tsx` for the pattern.

## Critical invariants

- **Claude SDK = BYO-CLI** — we drive the user's `claude` binary; never bundle it. The SDK's bundled platform package (`@anthropic-ai/claude-agent-sdk-darwin-arm64` etc., ~205 MB) is excluded from the DMG via `electron-builder.yml` `files` pattern.
- **Shell env hydration for Claude bridge** — macOS launchd-launched apps inherit a clean env (no `.zshrc`). `electron/shell-env.ts` parses `~/.zshrc` / `~/.zprofile` / `~/.bashrc` etc. DIRECTLY (regex against `export KEY=VAL` lines, no shell spawn) at app boot, allowlisted to `ANTHROPIC_*` / `CLAUDE_*`. The Claude bridge merges this onto `process.env` before passing `env:` to SDK `query()`. Do NOT try `zsh -lc` / `-ilc` / `source ~/.zshrc` — all three were tried and fail (see `electron/shell-env.ts` header comment for the trail of failed approaches). Diagnostic log at `~/.claudebar/auth-debug.log` (key names only, no values).
- **Resume only on real `.jsonl`** — for "new session" entries the renderer mints a placeholder UUID for stable rail identity, but the bridge MUST NOT pass it as SDK `resume:` (would silently hang the turn). `openQuery` checks `fs.existsSync(~/.claude/projects/<key>/<id>.jsonl)` first. The SDK's `system/init` event reports the real session id, which gets mirrored back into the session store via `setRealSessionId` (soft setter — no `claude:close`, no remount) so the next idle-reopen passes a `resume:` that exists.
- **Platform detection in renderer** — the sandboxed renderer has no `process` global. Use `navigator.userAgentData?.platform || navigator.platform || navigator.userAgent` to detect macOS/Windows. See `TitleBar.tsx` and `settingsStore.ts` for the pattern.
- **No new runtime deps without strong reason** — current set (from `package.json` `dependencies`): `@anthropic-ai/claude-agent-sdk`, `@noble/ed25519`, `lucide-react`, `react`, `react-dom`, `react-markdown`, `react-syntax-highlighter`, `remark-gfm`, `ws`, `zustand`. Note: `@noble/ed25519` and `ws` are ClawBar carry-overs; verify before adding anything that overlaps.

## Architecture

**Main process** (`electron/`): Tray, standalone floating `BrowserWindow` (400×800 default, no dock icon, hide-on-close with `isQuitting` flag, persisted bounds via settings), IPC handlers in `electron/ipc/` (settings / claude-sessions / plugins / skills / commands / stats), Claude bridge (`claude-bridge.ts`) with per-session `ActiveSession` map and idle-close + transparent reopen, pet window (`pet-window.ts`), migration shim (`migration.ts`) for one-time copy from `~/.clawbar/`.

**Renderer** (`src/`): `App.tsx` mounts `TitleBar` (76px left padding on macOS to clear traffic lights) + `SessionRail` + `ClaudeChannel` (active session chat) + overlay layer for `OperatorPanel` / `AddSessionWizard`. State: `settingsStore`, `sessionStore`, `claudeSessionsStore`, `approvalsStore`. Pet window is a separate `BrowserWindow` with its own React root (`src/pet/`).

**Operator panel** (`src/components/operator/OperatorPanel.tsx`): 7 tabs rendered as an overlay with a backdrop that click-closes. Overview / Sessions / Plugins / Skills / Commands / Stats / Settings. Each tab pulls data via the corresponding IPC domain.

**Session rail icons** — `claudePetVariant()` is hashed from the stable row `id` (NOT from the Claude session id, which mutates when `setRealSessionId` fires). This keeps the icon stable across idle-reopen cycles.

**Stats incremental cache** — `~/.claudebar/usage-cache.json` stores `perFile.lastByteOffset` + token totals so repeated opens only parse new bytes. 3s rescan throttle. Do not consume the partial last line of a jsonl (check for `\n` terminator).

See `docs/ARCHITECTURE.md` for the full system diagram and IPC channel table.
