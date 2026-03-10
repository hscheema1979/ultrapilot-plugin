---
name: ultra-team
description: Coordinate multiple Claude Code agents in parallel. Spawn specialist agents, assign tasks, and coordinate completion.
---

# Ultra Team

## Overview

Coordinate multiple Claude Code agents working in parallel on independent tasks. Break down work, spawn specialist agents, track progress, and synthesize results.

**Attribution:** Adapted from oh-my-claudecode v4.5.1 team skill.

**Announce at start:** "I'm using the ultra-team skill to coordinate parallel agents."

## Usage

```bash
/ultra-team N=3 "Refactor authentication system"
/ultra-team N=5 "Review all TypeScript code for security issues"
/ultra-team "Implement user management features"
```

### Parameters

- **N** - Number of parallel agents (1-10). Optional; defaults to 3.
- **task** - High-level task to decompose and distribute

## Architecture

```
User: "/ultra-team 3 fix all TypeScript errors"
              |
              v
      [COORDINATOR]
              |
              +-- Analyze & decompose task into N subtasks
              |
              +-- Spawn N specialist agents
              |
              +-- Monitor progress
              |
              +-- Synthesize results
```

## Workflow

### Phase 1: Parse Input

- Extract **N** (agent count), validate 1-10
- Extract **task** description
- Write state to `.ultra/state/team.json`:
  ```json
  {
    "active": true,
    "task": "fix all TypeScript errors",
    "agent_count": 3,
    "status": "decomposing"
  }
  ```

### Phase 2: Decompose Task

Break the task into N independent subtasks:

- Each subtask should be **file-scoped** or **module-scoped** to avoid conflicts
- Subtasks must be independent or have clear dependency ordering
- Each subtask needs a concise `subject` and detailed `description`

**Example decomposition:**

```
Task: "Fix all TypeScript errors"

Subtask 1: Fix type errors in src/auth/
Subtask 2: Fix type errors in src/api/
Subtask 3: Fix type errors in src/utils/
```

### Phase 3: Spawn Agents

Use Task tool to spawn N specialist agents:

```
Task(
  subagent_type="oh-my-claudecode:executor",
  prompt="You are working on subtask: Fix type errors in src/auth/..."
)
```

**Spawn all agents in parallel** - do not wait for one to finish before spawning the next.

### Phase 4: Monitor Progress

Track each agent's progress:

1. Maintain task status in `.ultra/state/team.json`:
   ```json
   {
     "agents": [
       {"name": "agent-1", "status": "in_progress", "subtask": "Fix auth types"},
       {"name": "agent-2", "status": "completed", "subtask": "Fix API types"},
       {"name": "agent-3", "status": "pending", "subtask": "Fix utils types"}
     ]
   }
   ```

2. Update status as agents complete

3. Handle failures:
   - If an agent fails, reassign subtask to another agent
   - If all agents fail, report failure to user

### Phase 5: Synthesize Results

When all agents complete:

1. Collect results from each agent
2. Merge changes (if applicable)
3. Verify overall success
4. Present summary to user

5. Clean up state:
   ```bash
   rm .ultra/state/team.json
   ```

## Agent Assignment

Assign subtasks to agents based on task type:

| Task Type | Agent Type |
|-----------|------------|
| Implementation | `executor` |
| Bug fixing | `debugger` |
| Testing | `test-engineer` |
| Code review | `code-reviewer` |
| Security review | `security-reviewer` |
| Quality checks | `quality-reviewer` |
| Documentation | `writer` |

## State File Format

`.ultra/state/team.json`:

```json
{
  "active": true,
  "task": "task description",
  "agent_count": 3,
  "status": "executing",
  "agents": [
    {
      "name": "agent-1",
      "status": "completed",
      "subtask": "subtask description",
      "result": "summary of work done"
    }
  ],
  "started_at": "2026-02-27T12:00:00Z",
  "completed_at": null
}
```

## Example Session

```
User: /ultra-team N=3 "Add error handling to all API endpoints"

I'm using the ultra-team skill to coordinate parallel agents.

Decomposing task:
- Agent 1: Add error handling to src/api/auth/*
- Agent 2: Add error handling to src/api/users/*
- Agent 3: Add error handling to src/api/posts/*

Spawning 3 executor agents...
Monitoring progress...

✓ Agent 1 completed: Added try-catch to 8 endpoints
✓ Agent 2 completed: Added try-catch to 12 endpoints
✓ Agent 3 completed: Added try-catch to 6 endpoints

Synthesis: All 26 API endpoints now have error handling.
Cleanup: Removed .ultra/state/team.json

Done!
```

## Best Practices

1. **Independent tasks** - Design subtasks to minimize dependencies
2. **File boundaries** - Assign different files/modules to different agents
3. **Clear scope** - Each subtask should have well-defined boundaries
4. **Progress updates** - Report status regularly to keep user informed
5. **Error handling** - Have a plan for when agents fail or get stuck

## Limitations

- Maximum 10 parallel agents (configurable)
- No inter-agent communication (simpler than full OMC team)
- State is local (no cross-session persistence)
- Manual coordination (no automatic load balancing)

## Cancellation

To cancel an active ultra-team session:

```bash
rm .ultra/state/team.json
```

This signals all agents to stop and cleans up state.
