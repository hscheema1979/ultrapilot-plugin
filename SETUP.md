# Ultrapilot Plugin - Setup Summary

## What Was Created

A complete standalone plugin that replaces OMC:

```
~/.claude/plugins/ultrapilot/
├── src/
│   ├── agents.ts      # 20+ specialist agents catalog
│   ├── state.ts       # State management system
│   ├── hud.ts         # HUD renderer
│   └── index.ts       # Main exports
├── cli/
│   └── hud.mjs        # Statusline CLI (executable)
├── scripts/
│   └── install.mjs    # Installation script (executable)
├── skills/            # Skills (to be copied to ~/.claude/skills/)
├── AGENTS.md          # Complete agent documentation
├── README.md          # Plugin documentation
├── SETUP.md           # This file
└── package.json       # NPM package config
```

## Installation Steps

### 1. Run the installer
```bash
cd ~/.claude/plugins/ultrapilot
node scripts/install.mjs
```

This will:
- Copy skills to `~/.claude/skills/`
- Set up HUD CLI at `~/.claude/hud/ultra-hud.mjs`
- Configure `~/.claude/settings.json`
- Create `.ultra/` directory structure

### 2. Restart Claude Code

The HUD statusline will appear showing:
```
[ULTRA] READY | ctx:0%
```

### 3. Use Ultrapilot
```bash
/ultrapilot Build me a REST API for task management
```

## What Ultrapilot Replaces

| Old (OMC) | New (Ultrapilot) |
|-----------|------------------|
| `oh-my-claudecode` plugin | `ultrapilot` plugin |
| `/oh-my-claudecode:autopilot` | `/ultrapilot` |
| `/oh-my-claudecode:ralph` | `/ultra-ralph` |
| `/oh-my-claudecode:cancel` | `/ultra-cancel` |
| OMC agent catalog | Built-in 20+ agents |
| OMC state management | Built-in state system |
| OMC HUD | Built-in HUD |

## Optional Add-Ons

These plugins work alongside Ultrapilot:

| Plugin | Purpose | Install? |
|--------|---------|----------|
| context7 | Library documentation | Yes, for `/ask` |
| github | GitHub integration | Yes, for gh commands |
| playwright | Browser testing | Yes, for testing |
| glm-plan-* | GLM usage tracking | Optional |

## Quick Reference

### Commands
```bash
/ultrapilot <task>        # Main command
/ultra-team N=3 <task>    # Parallel team
/ultra-ralph <task>       # Persistent execution
/ultra-review <code>      # Multi-dimensional review
/ultra-hud                # Configure HUD
/ultra-cancel             # Cancel active mode
```

### State Files
```bash
.ultra/state/autopilot-state.json  # Current phase, status
.ultra/state/ralph-state.json       # Loop iteration
.ultra/state/ultraqa-state.json     # QA cycles
.ultra/state/validation-state.json  # Reviewer status
.ultra/spec.md                       # Requirements & architecture
.ultra/plan.md                       # Implementation plan
```

### Agent Types (examples)
```bash
ultra:analyst           # Requirements (opus)
ultra:architect         # Architecture (opus)
ultra:executor          # Implementation (sonnet)
ultra:executor-low      # Simple tasks (haiku)
ultra:executor-high     # Complex tasks (opus)
ultra:security-reviewer # Security (sonnet)
ultra:quality-reviewer  # Performance (sonnet)
ultra:verifier          # Verification (sonnet)
```

## HUD Presets

```bash
/ultra-hud minimal      # [ULTRA] EXP | ralph:3/10
/ultra-hud focused      # [ULTRA] EXP | ralph:3/10 | qa:2/5 | ...
/ultra-hud full         # Multi-line with agent details
```

## Troubleshooting

**Plugin not loading?**
1. Check `~/.claude/settings.json` has `"ultrapilot@local": true`
2. Restart Claude Code

**HUD not showing?**
1. Run `/ultra-hud setup`
2. Check `statusLine` in settings.json

**State not persisting?**
1. Verify `.ultra/state/` directory exists
2. Check file permissions

**Agents not working?**
1. Verify agent type in `AGENTS.md`
2. Check model tier is correct

## Configuration

### HUD Config
`~/.claude/ultra-hud-config.json`:
```json
{
  "preset": "focused",
  "elements": {
    "ultraLabel": true,
    "phase": true,
    "ralph": true,
    "qa": true,
    "status": true,
    "context": true,
    "tasks": true,
    "agents": true,
    "background": true,
    "maxOutputLines": 4
  }
}
```

### Autopilot Config
`~/.claude/settings.json`:
```json
{
  "ultra": {
    "autopilot": {
      "maxIterations": 10,
      "maxQaCycles": 10,
      "maxValidationRounds": 10,
      "fileOwnership": true,
      "parallelExecution": true
    }
  }
}
```

## Next Steps

1. ✅ Run installer: `node ~/.claude/plugins/ultrapilot/scripts/install.mjs`
2. ✅ Restart Claude Code
3. ✅ Run: `/ultrapilot Build me a simple example`
4. ✅ Watch the phases execute
5. ✅ Check `.ultra/` for generated files

## Example Session

```bash
User: /ultrapilot Create a todo list with React

[Phase 0: Expansion]
→ ultra:analyst: Extracting requirements...
→ ultra:architect: Designing architecture...
→ Spec saved to .ultra/spec.md

[Phase 1: Planning]
→ ultra:planner: Creating implementation plan...
→ ultra:critic: Validating plan...
→ Plan saved to .ultra/plan.md

[Phase 2: Execution]
→ ultra:team-implementer: components/TodoList.tsx
→ ultra:team-implementer: hooks/useTodos.ts
→ ultra:team-implementer: types/todo.ts
→ Parallel implementation complete

[Phase 3: QA]
→ Build: ✓
→ Lint: ✓
→ Test: 12/12 passing ✓

[Phase 4: Validation]
→ ultra:security-reviewer: APPROVED
→ ultra:quality-reviewer: APPROVED
→ ultra:code-reviewer: APPROVED

[Phase 5: Verification]
→ ultra:verifier: All evidence confirmed ✓

[COMPLETE]
✓ Todo list app ready
  - 3 components created
  - 12 tests passing
  - Production ready
```

---

**One plugin. One command. Everything you need.**
