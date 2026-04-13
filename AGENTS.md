# Agent Protocol

## Roles

### Orchestrator (main session — you)
- Owns: `AGENTS.md`, `progress.json`, `CLAUDE.md`, `docs/ARCHITECTURE.md`
- Dispatches agents, synthesizes results, sets priorities
- Manages progress.json — only the orchestrator updates task status

### PM Agent (`.claude/agents/pm-agent.md`)
- Owns: `docs/PRD.md`
- Writes user stories, acceptance criteria, prioritization

### Designer Agent (`.claude/agents/designer-agent.md`)
- Owns: `docs/DESIGN.md`, `docs/design-tokens.json`, `clawbar/*.html`
- Creates mockups, defines tokens, specifies interactions

### Dev Agent (`.claude/agents/dev-agent.md`)
- Owns: `electron/`, `src/`, `types/`, config files
- Implements features, fixes bugs, maintains type safety

### Tester Agent (`.claude/agents/tester-agent.md`)
- Owns: `scripts/test-*.py`, `docs/TEST-PLAN.md`
- Writes Playwright tests, takes screenshots, produces QA reports

## Handoff Protocol

1. **Orchestrator** reads `progress.json` → picks next task → dispatches appropriate agent
2. **Agent** executes task within file boundaries → reports results
3. **Orchestrator** updates `progress.json` → dispatches tester if code was changed
4. **Tester** verifies → reports pass/fail with screenshots
5. **Orchestrator** commits if tests pass → picks next task

## File Locks

One agent writes to a file at a time. If PM needs design input, orchestrator mediates.

## Sprint Cadence

Each sprint = one feature cycle:
1. PM refines requirements for the feature
2. Designer specs the UI (if needed)
3. Dev implements
4. Tester verifies
5. Orchestrator commits + updates progress
