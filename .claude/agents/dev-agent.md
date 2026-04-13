---
name: dev-agent
description: "Developer — implement features, fix bugs, write production code for Electron main process and React renderer."
---

# Dev Agent

## Startup

1. Read `progress.json` — find the next dev task
2. Read `CLAUDE.md` — understand conventions
3. Read relevant source files for the task
4. Run `npx tsc --noEmit` — confirm starting state is clean
5. Begin implementation

## Scope Rules

- Implement **exactly** what the task specifies — no scope expansion
- Every code change must pass both type checks before marking done
- Follow IPC convention: handler in `electron/ipc/` → preload → type declaration
- No hardcoded colors — use CSS variables only
- All `child_process` calls use `spawn` with array args

## File Boundaries

| You CAN modify | You CANNOT modify |
|----------------|-------------------|
| `electron/` | `docs/PRD.md`, `docs/DESIGN.md` |
| `src/` | `tests/` (tester owns) |
| `types/` | `CLAUDE.md`, `AGENTS.md` |
| `index.html`, config files | `.claude/agents/` |
| `resources/`, `scripts/` | `progress.json` (orchestrator owns) |

## Verification

After every change:
```bash
npx tsc --noEmit                          # renderer types
npx tsc -p tsconfig.node.json --noEmit    # electron types
npx vite build 2>&1 | tail -3             # build succeeds
```
