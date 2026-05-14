# ✦ ClaudeBar

A floating-window desktop app for your local Claude Code CLI sessions — like VS Code's Copilot chat panel, but free-standing, and it drives the `claude` binary you already have installed (BYO-CLI; nothing bundled).

<!-- TODO: add screenshot/demo GIF here -->

## Why ClaudeBar?

| vs... | ClaudeBar advantage |
|---|---|
| **claude.ai web** | Runs your local CLI — local file access, your plugins/skills/commands, your subscription or API key from `.zshrc` |
| **Claude Code in a terminal** | Visual session switching, hoverable tool-call pills, inline approval prompts, multi-session token stats |
| **ClawBar** | Single-purpose (Claude only, no IM/OpenClaw clutter), floating window form factor, deeper Claude ecosystem integration (plugins / skills / commands / stats views) |

## Install (pre-built)

Head to the [Releases page](https://github.com/june9593/claudebar/releases) and grab the DMG for your machine.

### macOS (Apple Silicon)

1. Download [`ClaudeBar-0.7.1-mac-arm64.dmg`](https://github.com/june9593/claudebar/releases/download/v0.7.1/ClaudeBar-0.7.1-mac-arm64.dmg).
2. Open it and drag **ClaudeBar** into `/Applications`.
3. **First launch** — the app isn't code-signed, so Gatekeeper will block it once. Pick one:
   - Finder → **right-click `ClaudeBar.app` → Open**, then click **Open** in the warning dialog.
   - Or run once in Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/ClaudeBar.app
     ```

The tray icon appears in the **macOS menu bar**. Click it to toggle the floating window.

### Windows

Windows is not yet validated for v0.7.x. The codebase compiles on Windows, but no release artifact has been tested since the ClawBar fork. Use "Build from source" below if you need a Windows build, and expect rough edges.

## Usage walk-through

1. **Launch** — ClaudeBar starts in the background with a tray icon. No dock icon.
2. **Toggle** — click the tray icon, or press **Cmd+Shift+C** (macOS) / **Ctrl+Shift+C** (Windows) to show or hide the floating window.
3. **Rail** — the 32px slim column on the left is the session rail:
   - `≡` (top) — opens the operator panel
   - `⊕` — starts the new-session wizard
   - Per-session ClaudePet icons — click to switch; a red badge means a tool approval is waiting
   - `⚙` (bottom) — opens Settings directly
4. **Add a session** — click `⊕` → pick a project from `~/.claude/projects/` → resume an existing session or start a new one. The session appears in the rail immediately.
5. **Chat** — type in the multi-line input, press Enter to send (Shift+Enter for a newline). Responses stream back in markdown with syntax-highlighted code blocks, expandable tool-call pills, and inline approval/AskUserQuestion cards.
6. **Operator panel** — click `≡` to slide out the 320px panel over the chat area. Seven tabs:
   - **Overview** — CLI status, project count, active sessions, today's tokens, pending approvals
   - **Sessions** — collapsible project tree; click any entry to resume
   - **Plugins** — reads `~/.claude/plugins/installed_plugins.json`
   - **Skills** — three-layer merge (user / project / plugin), grouped by source
   - **Commands** — slash-command cheat sheet (user / project / plugin)
   - **Stats** — all-time token totals, 14-day bar chart, per-model breakdown
   - **Settings** — full settings form (see below)

## Configuration

Settings file: `~/.claudebar/settings.json`

| Setting | Default | Description |
|---|---|---|
| `claudePath` | auto-detected | Path to `claude` binary; manual override |
| `defaultModel` | `default` | `default`, `opus`, `sonnet`, or `haiku` |
| `defaultPermissionMode` | `default` | `default`, `acceptEdits`, or `bypassPermissions` |
| `defaultProjectDir` | null | Pre-selected project for ⊕ (skips the picker step) |
| `idleCloseMinutes` | `30` | Close idle SDK Query after N minutes (transparent reopen on next message) |
| `theme` | `system` | `light`, `dark`, or `system` |
| `windowSize` | `{w:400, h:800}` | Persisted on resize |
| `windowPosition` | null (center) | Persisted on drag |
| `alwaysOnTop` | `false` | Keep window above other apps |
| `hideOnClickOutside` | `false` | Auto-hide when focus moves elsewhere |
| `globalShortcut` | `Cmd+Shift+C` | Toggle window visibility |
| `petVisible` | `true` | Show the floating desktop pet mascot |
| `petKind` | `claude` | `claude` (orange pixel critter, default) or `lobster` |
| `enableSdkTrace` | `false` | Write every SDK message to `~/.claudebar/sdk-trace.jsonl` (same effect as `CLAUDEBAR_TRACE=1`) |

## Migration from ClawBar

On first launch ClaudeBar automatically copies `theme`, `petKind`, and `petVisible` from `~/.clawbar/settings.json` (if it exists). A `.migrated-from-clawbar` flag file is written to `~/.claudebar/` so the migration runs only once. ClawBar's config is left intact.

Session history lives in `~/.claude/projects/` and is owned by Claude Code itself — both apps read the same files, so there is nothing to migrate.

## Build from source

Prerequisites: macOS 12+, Node.js 20+, the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/cli-reference) installed on your system.

```bash
git clone https://github.com/june9593/claudebar.git
cd claudebar
npm install
npm run build
npm run pack:mac:dmg:arm64
```

The unsigned DMG lands in `release-artifacts/`.

For development:

```bash
npm run dev:electron      # build main process + launch live
npm run dev               # Vite dev server only (renderer, port 5173)
npx tsc --noEmit          # type-check renderer
npx tsc -p tsconfig.node.json --noEmit  # type-check main process
```

## License

MIT

## Acknowledgements

ClaudeBar is a fork of [ClawBar](https://github.com/june9593/clawbar) (v0.4.8), which pioneered the Claude Code channel concept inside a multi-channel menu-bar app. Full git history preserved. ClawBar continues as an independent project (OpenClaw multi-channel client).
