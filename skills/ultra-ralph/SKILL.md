---
name: ultra-ralph
description: Persistent execution loop that ensures work gets completed. "The boulder never stops" - continues through errors until done or fundamentally blocked.
---

# ULTRA-RALPH - PERSISTENT EXECUTION

> **"The boulder never stops"**

Philosophy: Ultra-Ralph is the ultimate persistence engine for task completion. It does not accept transient failures, temporary errors, or partial completion as reasons to stop. It continues working until the task is genuinely complete, fundamentally blocked, or explicitly cancelled by the user.

## Attribution

This skill is derived from oh-my-claudecode (OMC) v4.5.1
Source reference: /home/ubuntu/.claude/plugins/cache/omc/oh-my-claudecode/4.5.1/skills/ralph/
Adapted and extended for ultra-plugin with enhanced persistence capabilities.

## Purpose

Ultra-Ralph provides relentless execution persistence for complex tasks that require guaranteed completion. It wraps any workflow with stateful resilience, automatic recovery from transient failures, and session-scoped persistence that survives interruptions.

## Usage

```bash
/ultra-ralph "Deploy this application to production"
/ultra-ralph "Refactor the entire authentication system"
/ultra-ralph "Implement the complete test suite for the API"
```

## When to Use

**Perfect for:**
- Tasks requiring guaranteed completion regardless of transient failures
- Long-running work that may span multiple sessions or interruptions
- Critical deployments or refactors that MUST finish
- Multi-step workflows where intermediate steps may fail
- Work that requires "finish what you started" mentality

**Do NOT use for:**
- Quick exploratory tasks (use direct delegation instead)
- Tasks requiring user approval at each step (use interactive mode)
- Experimental work where failure is acceptable (use standard execution)
- Tasks that should stop on first error (use standard execution without ralph)

## State Persistence

### Primary State Location
```
.ultra/state/ralph.json
```
Tracks:
- Current iteration and max iterations
- Active task list with statuses
- Session linkage
- Phase history
- Fix loop counters

### Session-Scoped State
```
.ultra/state/sessions/{sessionId}/
```
Per-session persistence including:
- Session-specific task state
- Iteration history
- Checkpoint data
- Recovery context

### State Schema
```json
{
  "active": true,
  "current_phase": "execution",
  "iteration": 1,
  "max_iterations": 100,
  "linked_team": null,
  "linked_ralph": null,
  "fix_loop_count": 0,
  "stage_history": ["init", "planning", "execution"],
  "session_id": "uuid-here",
  "tasks": [
    {
      "id": "task-1",
      "status": "in_progress",
      "description": "...",
      "blockedBy": [],
      "blocks": ["task-2"]
    }
  ]
}
```

## The Boulder Never Stops

### Transient Errors Do NOT Stop Ralph

The following are considered **transient** and should trigger retry, not exit:
- Network timeouts
- Temporary dependency installation failures
- Intermittent test failures (flaky tests)
- Temporary file system issues
- Service temporarily unavailable
- Rate limiting
- Build cache corruption (clear and retry)

### Fundamental Blockers DO Stop Ralph

These require user intervention:
- Missing credentials or API keys
- Unclear or contradictory requirements
- External service permanently down
- Permission/access denied errors
- Architectural impossibility (identified by architect agent)
- User explicitly says "stop", "cancel", or "abort"

## Exit Conditions

Ultra-Ralph ONLY exits when one of these conditions is met:

1. **Complete**: All tasks done, all tests passing, all verifications successful
2. **Fundamentally Blocked**: Cannot proceed without user input or external change
3. **User Cancel**: Explicit cancellation via `/ultra-ralph:cancel` or user says "stop"
4. **Max Iterations**: Hit safety limit (default 100 iterations)

## Execution Loop

### Iteration Structure

```
[ITERATION {{CURRENT}}/{{MAX}}]

1. Checkpoint: Read state from .ultra/state/ralph.json
2. Assess: What's incomplete? What failed? What's blocked?
3. Plan: Identify next actions to advance
4. Execute: Work on tasks with parallel delegation
5. Verify: Test and validate progress
6. Persist: Write updated state
7. Decide: Continue, complete, or report blocker?
```

### Recovery on Restart

If interrupted or restarted:
1. Read `.ultra/state/ralph.json`
2. Resume from last active phase
3. Preserve iteration history
4. Continue incomplete tasks
5. Do NOT restart completed tasks unless verification failed

## State Management Approach

### Persistence Mindset

- **State is truth**: The state file is the single source of truth
- **Write frequently**: Update state after each meaningful action
- **Idempotent operations**: Design actions to be safely retryable
- **Checkpoint recovery**: Every iteration is a potential recovery point
- **Session isolation**: Each session gets its own state directory

### State Operations

```bash
# Read current state
state_read(mode="ralph")

# Write state update
state_write(
  mode="ralph",
  data={
    "iteration": current + 1,
    "tasks": updated_tasks,
    "current_phase": next_phase
  }
)

# Check if active
state_get_status(mode="ralph")  # Returns {"active": true, ...}

# Clean shutdown
state_write(mode="ralph", data={"active": false, ...})
```

## Verification Before Completion

Ultra-Ralph requires evidence before claiming completion:

1. **Test Evidence**: Fresh test run output showing all tests pass
2. **Build Evidence**: Fresh build output showing success
3. **Lint Evidence**: Zero errors from linting/typechecking
4. **Functional Evidence**: The feature actually works
5. **Architect Sign-off**: For complex changes (>5 files or >100 lines)

### No Shortcuts

These phrases are FORBIDDEN in completion reports:
- "should work"
- "looks good"
- "probably complete"
- "seems fine"

Instead, use:
- "Tests pass: 42 passed, 0 failed (attached output)"
- "Build succeeded: artifacts generated at ./dist/"
- "Verification confirmed: feature working as specified"

## Parallel Execution Policy

- Fire independent agent calls simultaneously
- Use `run_in_background: true` for long operations
- Route tasks to appropriate agent tiers:
  - Simple: Haiku (fast lookups, small edits)
  - Standard: Sonnet (implementation, debugging)
  - Complex: Opus (architecture, deep refactoring)

## Examples

### Good Execution
```python
# Parallel delegation
Task(subagent_type="executor", model="sonnet", prompt="Implement auth")
Task(subagent_type="test-engineer", model="sonnet", prompt="Write auth tests")
Task(subagent_type="build-fixer", model="sonnet", prompt="Fix type errors")

# Background long operation
Bash(command="npm install", run_in_background=true)

# Verify with evidence
Bash(command="npm test")  # Read output, confirm 0 failures
Bash(command="npm run build")  # Read output, confirm success

# State persistence
state_write(mode="ralph", data={"iteration": 2, "phase": "verify"})

# Clean exit
Skill(skill="ultra-ralph:cancel")
```

### Bad Execution
```python
# Sequential independent tasks (SLOW)
Task(executor, "Implement auth")
wait...
Task(test-engineer, "Write tests")
wait...

# No verification evidence
"Implementation complete, tests should pass"
# FORBIDDEN: No actual test output

# Exit without cleanup
"Done!"
# FORBIDDEN: State file still shows active=true
```

## Cleanup and Exit

When completion is verified:

1. Update state to inactive:
   ```json
   {
     "active": false,
     "final_status": "complete",
     "completed_at": "2025-02-27T10:30:00Z"
   }
   ```

2. Run cancel skill:
   ```bash
   /ultra-ralph:cancel
   ```

3. Report completion with evidence:
   - What was done
   - Verification results (test output, build status)
   - Files changed
   - Any known limitations

## Integration with Ultra-Plugin

Ultra-Ralph integrates with other ultra-plugin components:

- **ultra-work**: Delegates work packages to ultra-ralph for persistence
- **ultra-team**: Coordinates multi-agent execution within ralph loop
- **ultra-verify**: Runs verification phases before completion
- **ultra-state**: Shared state management across all ultra modes

## Advanced Features

### PRD Mode
Use `--prd` flag to initialize with Product Requirements Document:
```bash
/ultra-ralph --prd Build a complete todo app with TypeScript
```

### Linked Modes
Can coordinate with other execution modes:
- Team: Multi-agent orchestration
- Pipeline: Sequential agent chaining
- Ultrawork: Maximum parallelism

### Session Resumption
After interruption, ultra-ralph automatically:
- Detects existing state file
- Restores session context
- Continues from last checkpoint
- Preserves iteration history

## Monitoring and Debugging

### Check Current State
```bash
cat .ultra/state/ralph.json
cat .ultra/state/sessions/{sessionId}/state.json
```

### Manual Recovery
If state is corrupted, manually edit `.ultra/state/ralph.json` to:
- Reset iteration count
- Clear stuck tasks
- Adjust phase

### Force Cancel
```bash
/ultra-ralph:cancel --force
```
Clears all state files even if active tasks remain.

## Safety Limits

Default limits to prevent infinite loops:
- Max iterations: 100
- Max fix loops: 10 per issue
- Max session time: 24 hours (configurable)

Adjust via state file if needed for legitimate long-running tasks.

## Original Task Context

The original task prompt is preserved in state:
```json
{
  "original_prompt": "...",
  "original_timestamp": "...",
  "original_user": "..."
}
```

This ensures the true north is never lost across iterations.

---

**Remember: The boulder never stops.**
