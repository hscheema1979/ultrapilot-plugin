---
name: autopilot
description: "Execution orchestrator: implements plans using Ralph + Ultrawork, runs QA cycles, multi-perspective validation. Invoked by ultra-planning after plan is created."
---

<!--Source: oh-my-claudecode v4.5.1-->
<!--Original: skills/autopilot/SKILL.md-->
<!--Author: Yeachan Heo and contributors-->
<!--License: MIT-->
<!--Repository: https://github.com/Yeachan-Heo/oh-my-claudecode-->
<!--Modified for Ultra Plugin: Adapted to use ultra-* agents instead of oh-my-claudecode agents-->

# Autopilot - Execution Orchestrator

Autopilot orchestrates the complete execution phase: implements plans using Ralph + Ultrawork, runs QA cycles, and performs multi-perspective validation.

## Purpose

Autopilot takes an implementation plan and autonomously handles:
- **Parallel execution** of independent phases
- **Ralph loop** for persistence through errors
- **QA cycles** (build, test, fix, repeat up to 10x)
- **Multi-perspective validation** (security, quality, architecture)
- **State management** and cleanup

## When Invoked

Autopilot is invoked by **ultra-planning** after creating an implementation plan. It is NOT invoked directly by users.

**Users should use:** `/ultrapilot Build me X`

## Workflow

### Phase 0: Load Implementation Plan

Read the plan created by ultra-planning:
```python
plan = read_file("docs/plans/YYYY-MM-DD-<feature-name>-implementation.md")
```

### Phase 1: Parse Plan into Tasks

```python
for phase in plan.phases:
    for task in phase.tasks:
        TaskCreate(
            subject=task.name,
            description=task.description,
            activeForm=f"Working on {task.name}"
        )
```

### Phase 2: Activate Ralph Mode

```python
state_write(mode="ralph", active=true, phase="execution")
```

### Phase 3: Execute with Ultrawork

```
For independent tasks (can run simultaneously):
- Spawn Task calls for each task
- Use model="haiku" for simple tasks
- Use model="sonnet" for standard tasks
- Use model="opus" for complex tasks

Parallel support agents:
- Test engineer: Writing tests in parallel
- Build fixer: Handling compilation errors
- Quality reviewer: Validating code
- Security reviewer: Security checks
```

### Phase 4: QA Cycles (UltraQA)

```
Repeat up to 10 cycles:
1. Run tests: pytest / cargo test / npm test
2. Run build: npm run build / cargo build
3. If failures → fix and repeat
4. Stop when: all tests pass OR same error 3 times
```

### Phase 5: Multi-Perspective Validation

```
Parallel validation (all must approve):
- Ultra-verifier: Functional completeness
- Ultra-security-reviewer: Vulnerability scan
- Ultra-code-reviewer: Code quality
- Ultra-quality-reviewer: Performance analysis

If any reject → Fix and re-validate
```

### Phase 6: Cleanup

```python
state_clear(mode="ralph")
state_clear(mode="ultrawork")
rm .ultra/state/autopilot.json
```

## Agent Mapping

| OMC Agent | Ultra Plugin Equivalent |
|------------|----------------------|
| oh-my-claudecode:executor | ultra-executor |
| oh-my-claudecode:architect (validation) | ultra-verifier |
| oh-my-claudecode:security-reviewer | ultra-security-reviewer |
| oh-my-claudecode:code-reviewer | ultra-code-reviewer |
| oh-my-claude-code:quality-reviewer | ultra-quality-reviewer |

## State Files

- `.ultra/state/autopilot.json` - Main execution state
- `.ultra/state/ralph.json` - Ralph persistence
- `.ultra/state/ultrawork.json` - Parallel execution state

## Usage

Autopilot is invoked automatically by ultra-planning. Example flow:

```
User: /ultrapilot Build me a REST API

[ULTRAPILOT - Enhanced Phase 0]
→ Deep analysis
→ Architecture design
→ Hands off to ultra-planning

[ULTRA-PLANNING]
→ Creates detailed implementation plan
→ Saves to docs/plans/
→ Invokes autopilot

[AUTOPILOT - Execution Orchestrator]
→ Loads plan from docs/plans/
→ Creates tasks from plan
→ Activates Ralph mode
→ Executes with Ultrawork (parallel)
→ Runs QA cycles
→ Validates from multiple perspectives
→ Cleanup

[COMPLETE]
```

## Configuration

Optional settings in `.claude/settings.json`:

```json
{
  "ultra": {
    "autopilot": {
      "maxQaCycles": 10,
      "maxValidationRounds": 10,
      "pauseAfterExpansion": false,
      "pauseAfterPlanning": false
    }
  }
}
```

## Troubleshooting

**Stuck in a phase?** Check TODO list for blocked tasks, review state files, or cancel and resume.

**Same error repeating?** Indicates a fundamental issue requiring human input.

## Integration

Autopilot completes the ultra-plugin chain:

```
ultrapilot (upstream analysis)
    ↓
ultra-planning (creates plan)
    ↓
autopilot (executes plan)
    ↓
Complete working code
```
