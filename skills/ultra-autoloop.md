---
name: ultra-autoloop
description: 'Domain heartbeat driver - actively maintains domain health, processes intake queues, closes tasks, and ensures continuous agency. The boulder never stops.'
---

# ULTRA-AUTOLOOP - DOMAIN HEARTBEAT DRIVER

> **"The heartbeat that keeps the domain alive"**

Ultra-Autoloop is the active driver that maintains domain health, processes intake queues, closes out tasks, and ensures continuous agency and ownership. It's not just about refactoring - it's the **routine execution engine** that keeps everything running smoothly.

## What It Is

**Ultra-Autoloop = Domain Driver + Heartbeat + Task Manager**

It's the background process that:

- ✅ Checks intake queues for new tasks
- ✅ Processes routine maintenance tasks
- ✅ Closes out completed work
- ✅ Syncs domain components
- ✅ Ensures agency and ownership
- ✅ Monitors system health
- ✅ Runs continuously (NEVER stops)

## The Domain Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    ULTRA-AUTOLOOP HEARTBEAT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [HEARTBEAT CYCLE - Every 60 seconds]                           │
│                                                                  │
│  1. CHECK INTAKE QUEUE                                          │
│     → New tasks arrived?                                       │
│     → Route to appropriate agents/teams                        │
│     → Update task status                                       │
│                                                                  │
│  2. PROCESS ROUTINE TASKS                                       │
│     → Maintenance tasks scheduled?                             │
│     → Health checks to run?                                    │
│     → Sync operations needed?                                  │
│                                                                  │
│  3. CLOSE COMPLETED WORK                                        │
│     → Tasks marked done? Verify and close                      │
│     → PRs ready to merge? Review and merge                     │
│     → Issues resolved? Clean up                                │
│                                                                  │
│  4. SYNC DOMAIN COMPONENTS                                      │
│     → Git status changed? Push/commit                          │
│     → Dependencies updated? Lock files                         │
│     → Documentation stale? Update                              │
│                                                                  │
│  5. ENSURE AGENCY & OWNERSHIP                                   │
│     → Tasks unowned? Assign ownership                          │
│     → Blocked tasks? Unblock or escalate                       │
│     → Stale work? Follow up or reassign                        │
│                                                                  │
│  6. MONITOR HEALTH                                              │
│     → System metrics OK?                                       │
│     → Errors occurring? Fix or alert                          │
│     → Resources healthy?                                       │
│                                                                  │
│  7. PERSIST STATE                                               │
│     → Write heartbeat timestamp                                │
│     → Update queue metrics                                     │
│     → Log cycle summary                                        │
│                                                                  │
│  8. SLEEP 60s → LOOP AGAIN                                     │
│     (Never exits. Never stops. Just keeps the domain alive.)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

Ultra-Autoloop runs as a **persistent Claude Code REPL** managed by PM2:

```
PM2 (auto-restart, exponential backoff, daily cron restart)
  → autoloop-pm2-wrapper.sh (preflight checks, tmux health monitor)
    → tmux "ultrapilot:autoloop" (persistent terminal session)
      → claude --dangerously-skip-permissions (interactive REPL)
        → CronCreate */1 * * * * (native timer tool, fires every minute)
          → Bash tool: gh CLI checks GitHub for actionable tasks
          → Agent tool: spawns parallel teams → each runs ultra-ultrawork
          → Posts heartbeat to GitHub state issue
```

**Why this architecture:**

- **PM2**: Crash recovery — if Claude Code API errors kill the session, PM2 auto-restarts
- **tmux**: Persistent terminal — survives SSH disconnects
- **REPL mode**: Session maintains full context between cron fires
- **CronCreate**: Native Claude Code timer — no external scheduling needed
- **Agent tool**: Native parallel agent teams — not shelled-out processes

### Key Files

| File                                         | Purpose                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `autoloop.ecosystem.config.cjs`              | PM2 process config (restart policy, memory limits, cron) |
| `autoloop-pm2-wrapper.sh`                    | Preflight checks, tmux session setup, health monitoring  |
| `.ultra/autoloop/autoloop-session-prompt.md` | Bootstrap prompt for Claude Code REPL                    |
| `.ultra/autoloop/daemon-config.json`         | 11 routines with dependency chain                        |

## Usage

```bash
# Start via PM2 (recommended — auto-restarts on crash)
pm2 start autoloop.ecosystem.config.cjs
pm2 save

# Or start directly (no crash recovery)
/ultra-autoloop

# Monitor
pm2 logs ultrapilot-autoloop    # View logs
pm2 monit                        # Live dashboard
tmux attach -t ultrapilot        # Watch Claude work live

# Stop
pm2 stop ultrapilot-autoloop     # Stop daemon
/ultra-autoloop:cancel           # Cancel from within session
```

## Intake Queue Processing

### Queue Locations

```
.ultra/queues/
├── intake.json          # New tasks awaiting processing
├── in-progress.json     # Tasks currently being worked
├── review.json          # Awaiting review/verification
├── completed.json       # Recently completed (not yet closed)
└── failed.json          # Failed tasks needing attention
```

### Queue Processing Logic

```javascript
// Each heartbeat cycle
for (task in intakeQueue) {
  // 1. Categorize task
  category = categorizeTask(task);

  // 2. Route to appropriate handler
  switch (category) {
    case 'feature':
      routeTo('ultra-team', task);
      break;
    case 'bug':
      routeTo('ultra-debugging', task);
      break;
    case 'refactor':
      routeTo('ultra-code-review', task);
      break;
    case 'security':
      routeTo('ultra-security-review', task);
      break;
  }

  // 3. Update status
  task.status = 'in-progress';
  task.assignedAt = now();
  task.owner = determineOwner(task);

  // 4. Move to in-progress queue
  inProgressQueue.add(task);
  intakeQueue.remove(task);
}
```

## Routine Task Execution

### Scheduled Maintenance

```json
{
  "routineTasks": [
    {
      "name": "dependency-check",
      "schedule": "daily",
      "lastRun": "2026-03-01T00:00:00Z",
      "action": "Check for outdated dependencies"
    },
    {
      "name": "test-suite-health",
      "schedule": "hourly",
      "lastRun": "2026-03-01T12:00:00Z",
      "action": "Run test suite, fix any failures"
    },
    {
      "name": "git-sync",
      "schedule": "on-change",
      "lastRun": "2026-03-01T12:30:00Z",
      "action": "Commit and push changes"
    },
    {
      "name": "documentation-update",
      "schedule": "weekly",
      "lastRun": "2026-02-28T00:00:00Z",
      "action": "Update README and docs"
    }
  ]
}
```

### Execution

```javascript
// Each heartbeat cycle
for (task in routineTasks) {
  if (shouldRun(task)) {
    log(`Running routine task: ${task.name}`);
    result = executeTask(task.action);

    if (result.success) {
      task.lastRun = now();
      task.lastResult = 'success';
    } else {
      task.lastResult = 'failed';
      task.failures++;
      alert(`Routine task failed: ${task.name}`);
    }

    persistState();
  }
}
```

## Task Closure

### Closeout Logic

```javascript
// Check for completed tasks
for (task in inProgressQueue) {
  if (task.status === "done" || task.status === "completed") {
    // Verify completion
    verification = verifyTask(task);

    if (verification.success) {
      // Move to completed
      completedQueue.add({
        ...task,
        completedAt: now(),
        verification: verification
      });

      inProgressQueue.remove(task);

      // Log closure
      log(`Task closed: ${task.id}`);
    } else {
      // Verification failed - requeue or alert
      task.status = "verification-failed";
      task.verificationError = verification.error;
      alert(`Task verification failed: ${task.id}`);
    }
  }
}

// Clean up old completed tasks (older than 7 days)
for (task in completedQueue) {
  if (task.completedAt < now() - 7 days) {
    archive(task);
    completedQueue.remove(task);
  }
}
```

## Domain Sync

### Git Operations

```javascript
// Each heartbeat cycle
gitStatus = getGitStatus();

if (gitStatus.hasChanges) {
  log('Detected uncommitted changes');

  // Stage changes
  exec('git add -A');

  // Commit
  commitMsg = generateCommitMessage();
  exec(`git commit -m "${commitMsg}"`);

  // Push
  exec('git push');

  log('Changes pushed to remote');
}
```

### Dependency Sync

```javascript
// Check if package.json changed
if (packageJsonChanged()) {
  log('package.json changed - updating dependencies');

  // Install
  exec('npm install');

  // Update lockfile
  exec('npm prune');

  // Commit lockfile
  exec('git add package-lock.json');
  exec(`git commit -m "chore: update dependencies"`);

  log('Dependencies synchronized');
}
```

## Agency & Ownership

### Task Ownership

```javascript
// Ensure all tasks have owners
for (task in allQueues) {
  if (!task.owner || task.owner === 'unassigned') {
    // Find appropriate owner
    owner = findOwnerFor(task);

    // Assign
    task.owner = owner;
    task.assignedAt = now();

    // Notify
    notify(`Task assigned: ${task.id} → ${owner}`);

    log(`Assigned owner to task: ${task.id}`);
  }
}
```

### Unblock Stuck Tasks

```javascript
// Check for stuck tasks
for (task in inProgressQueue) {
  // Stuck criteria:
  // - No activity for 2 hours
  // - Status "blocked" for > 30 minutes
  // - Owner unresponsive

  if (isStuck(task)) {
    log(`Task stuck: ${task.id}`);

    // Try to unblock
    if (canAutoUnblock(task)) {
      unblock(task);
      log(`Auto-unblocked task: ${task.id}`);
    } else {
      // Escalate
      escalate(task);
      alert(`Task requires attention: ${task.id}`);
    }
  }
}
```

## Health Monitoring

### System Health Checks

```javascript
// Each heartbeat cycle
health = {
  timestamp: now(),

  // Check disk space
  disk: getDiskUsage(),

  // Check memory
  memory: getMemoryUsage(),

  // Check CPU
  cpu: getCpuUsage(),

  // Check git status
  git: getGitStatus(),

  // Check test suite
  tests: runTests(),

  // Check for errors
  errors: countRecentErrors(),
};

// Update heartbeat file
write('.ultra/state/heartbeat.json', health);

// Alert if unhealthy
if (!isHealthy(health)) {
  alert(`System health issue: ${getHealthIssue(health)}`);
}
```

### Metrics Tracking

```json
{
  "metrics": {
    "tasksProcessed": 147,
    "tasksCompleted": 132,
    "tasksFailed": 8,
    "cyclesCompleted": 523,
    "uptime": "72h 34m 12s",
    "avgCycleTime": "45s",
    "lastHeartbeat": "2026-03-01T12:34:56Z"
  }
}
```

## State Management

### State File

```json
{
  "active": true,
  "startedAt": "2026-03-01T10:00:00Z",
  "lastHeartbeat": "2026-03-01T12:34:56Z",
  "currentCycle": 523,
  "cycleTime": 60,

  "queues": {
    "intake": 3,
    "inProgress": 7,
    "review": 2,
    "completed": 132,
    "failed": 1
  },

  "routineTasks": {
    "total": 12,
    "scheduled": 8,
    "overdue": 0
  },

  "health": {
    "status": "healthy",
    "diskUsagePercent": 45,
    "memoryUsagePercent": 62,
    "testsPassing": true,
    "gitClean": true
  },

  "lastActions": [
    "Closed task: #142 - Add user auth",
    "Routed to ultra-team: #143 - Fix login bug",
    "Completed routine: dependency-check",
    "Pushed changes to origin/main"
  ]
}
```

## Heartbeat Integration

Ultra-autoloop **IS** the heartbeat:

```bash
/heartbeat
  → Shows autoloop status directly

Output:
┌─────────────────────────────────────────────────────────────┐
│  ULTRA-AUTOLOOP: DOMAIN HEARTBEAT                           │
│  ─────────────────────────────────────────────────────────  │
│  Status: ● ACTIVE (running 72h 34m)                         │
│  Cycle: 523 (every 60s)                                    │
│                                                             │
│  Queues:                                                    │
│  📥 Intake:      3 tasks                                   │
│  🔄 In Progress: 7 tasks                                   │
│  👀 Review:      2 tasks                                   │
│  ✅ Completed:   132 tasks                                 │
│  ❌ Failed:      1 task                                    │
│                                                             │
│  Health:                                                    │
│  Disk: 45% | Memory: 62% | Tests: ✓ PASSING                │
│  Git: Clean | Errors: 0                                    │
│                                                             │
│  Last Actions:                                             │
│  ✓ Closed #142 - Add user auth                             │
│  → Routed #143 to ultra-team                               │
│  ✓ Completed: dependency-check                            │
│  ✓ Pushed to origin/main                                   │
│                                                             │
│  Next cycle in: 23s                                        │
└─────────────────────────────────────────────────────────────┘
```

## HUD Integration

Ultra-autoloop drives the HUD:

```
┌─────────────────────────────────────────────────────────────┐
│  ULTRA PLUGIN HUD                                           │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  🟢 Domain Health: ACTIVE                                  │
│  Heartbeat: 523 cycles | Uptime: 72h 34m                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Active Work (7 in progress)                        │   │
│  │  → #143 ultra-team: Fix login bug                   │   │
│  │  → #144 ultra-debugging: Memory leak               │   │
│  │  → #145 ultra-security: Audit dependencies          │   │
│  │  → #146 ultra-executor: Add user settings           │   │
│  │  → #147 ultra-test: Write integration tests         │   │
│  │  → #148 ultra-review: Review PR #142               │   │
│  │  → #149 ultra-quality: Performance analysis        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Intake Queue (3 awaiting)                          │   │
│  │  → #150 Feature: Add password reset                │   │
│  │  → #151 Bug: Fix 404 on /profile                   │   │
│  │  → #152 Refactor: Optimize queries                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Routine Tasks:                                            │
│  ✓ dependency-check (2h ago)                               │
│  ✓ test-suite-health (1h ago)                              │
  ○ git-sync (5m ago)                                       │
│  ○ documentation-update (due in 3 days)                   │
│                                                             │
│  System: Disk 45% | Mem 62% | Tests ✓                      │
│                                                             │
│  [Auto-refresh every 5s]                                    │
└─────────────────────────────────────────────────────────────┘
```

## Cycle Time Options

```bash
# Fast cycle (high-frequency checking)
/ultra-autoloop --cycle 30s

# Normal cycle (default)
/ultra-autoloop --cycle 60s

# Slow cycle (less frequent)
/ultra-autoloop --cycle 5m

# Very slow cycle (minimal overhead)
/ultra-autoloop --cycle 15m
```

**Recommendation:**

- Active development: 30-60s
- Maintenance mode: 5-15m
- Production monitoring: 1-5m

## Focus Modes

```bash
# Task processing focus
/ultra-autoloop --focus tasks
  → Prioritizes intake queue processing
  → Spawns more agents for parallel work
  → Faster task routing and assignment

# Sync focus
/ultra-autoloop --focus sync
  → Prioritizes git operations
  → Keeps dependencies in sync
  → Updates documentation

# Health focus
/ultra-autoloop --focus health
  → More frequent health checks
  → Aggressive error detection
  → Resource monitoring
```

## Per-Workspace Operation

Each workspace gets its own autoloop:

```
~/projects/ecommerce-api/.ultra/state/autoloop.json
~/projects/mobile-app/.ultra/state/autoloop.json
~/projects/shared-lib/.ultra/state/autoloop.json
```

Independent heartbeat drivers for each domain:

- Separate queues
- Independent routing
- Isolated health monitoring
- Workspace-specific routine tasks

## Cancellation

**ONLY way to stop the heartbeat:**

```bash
/ultra-autoloop:cancel
```

What happens:

1. Graceful shutdown - finish current cycle
2. Close open tasks
3. Push any pending changes
4. Write final state
5. Report summary

```bash
/ultra-autoloop:cancel --force
```

Immediate shutdown - stop mid-cycle if needed.

## Best Practices

### DO:

✅ Run on all active workspaces
✅ Monitor heartbeat regularly
✅ Review closed tasks periodically
✅ Adjust cycle time based on activity
✅ Use focus mode for targeted work

### DON'T:

❌ Run on archived/unused projects
❌ Ignore heartbeat alerts
❌ Let failed tasks accumulate
❌ Run with very short cycle (< 30s) unless needed
❌ Forget to cancel when shutting down

## Warnings

⚠️ **Autoloop NEVER stops automatically**

- Must cancel manually
- Will keep running forever
- Monitor resource usage
- Set up alerts for failures

⚠️ **Cycle time affects resources**

- Shorter cycle = more frequent checks = higher CPU
- Longer cycle = slower response time
- Choose based on your needs

⚠️ **Queue management is important**

- Don't let intake queue grow
- Close completed tasks regularly
- Archive old completed tasks
- Prevent queue bloat

---

## Summary

**Ultra-Autoloop = Domain Heartbeat Driver**

- Checks intake queues every cycle
- Processes routine tasks
- Closes completed work
- Syncs domain components
- Ensures agency and ownership
- Monitors system health
- **NEVER stops (until you cancel it)**

**The heartbeat that keeps your domain alive and running smoothly.**

---

## Security & Quality Enhancements (Revision 1)

### Domain Validation on Startup (Fix 9)

Autoloop validates domain before starting:

```bash
# Validate domain setup before starting autoloop
if [ ! -f ".ultra/domain.json" ]; then
  echo "❌ Domain not initialized"
  echo "   Run: /ultra-domain-setup"
  exit 1
fi

# Validate domain.json is well-formed
if ! jq empty .ultra/domain.json 2>/dev/null; then
  echo "❌ Domain configuration is corrupted"
  echo "   Run: /ultra-domain-setup --reconfigure"
  exit 1
fi

echo "✓ Domain validated: $(jq -r '.domain.name' .ultra/domain.json)"
```

### Command Validation for Routine Tasks (Fix 1)

```bash
# Validate routine command before execution
validate_command() {
  local cmd="$1"

  # Whitelist allowed commands (alphanumeric, spaces, basic shell chars)
  local allowed_regex="^[a-zA-Z0-9_\- ]+( [a-zA-Z0-9_\-./]+)*$"

  if [[ ! "$cmd" =~ $allowed_regex ]]; then
    echo "❌ Invalid command characters: $cmd"
    return 1
  fi

  # Block dangerous commands
  if echo "$cmd" | grep -qiE "(rm\s+-rf\s+/|curl\s+-|wget\s+-|nc\s+-|ncat\s+-|sh\s+-|bash\s+-|eval\s+|exec\s+)"; then
    echo "❌ Dangerous command blocked: $cmd"
    return 1
  fi

  # Validate command exists
  local cmd_name
  cmd_name=$(echo "$cmd" | awk '{print $1}')
  if ! command -v "$cmd_name" &> /dev/null; then
    echo "⚠️  Command not found: $cmd_name"
    return 1
  fi

  return 0
}

# Usage in routine execution
command=$(jq -r '.command' "$routine")
if ! validate_command "$command"; then
  echo "Skipping routine: $name (command validation failed)"
  continue
fi
```

### Skill Invocation Whitelist (Fix 4)

```bash
# Whitelist valid ultra-skills
declare -A VALID_SKILLS=(
  ["ultra-executor"]="1"
  ["ultra-test-engine"]="1"
  ["ultra-debugging"]="1"
  ["ultra-code-review"]="1"
  ["ultra-security-review"]="1"
  ["ultra-quality-review"]="1"
)

# Validate skill before invocation
invoke_ultra_skill() {
  local skill="$1"
  local task="$2"

  # Check whitelist
  if [ -z "${VALID_SKILLS[$skill]}" ]; then
    echo "❌ Invalid skill: $skill"
    mark_task_failed "$task" "Invalid skill name"
    return 1
  fi

  # Invoke via Claude Code Skill tool (not arbitrary command)
  echo "Invoking skill: $skill for task: $task"
}
```

### JSON Validation and Error Handling (Fix 7)

```bash
# Validate JSON file is well-formed
validate_json() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    return 1
  fi

  if ! jq empty "$file" 2>/dev/null; then
    echo "❌ Invalid JSON: $file"
    return 1
  fi

  return 0
}

# Safely extract JSON field with default
json_field() {
  local file="$1"
  local field="$2"
  local default="${3:-}"

  if ! validate_json "$file"; then
    [ -n "$default" ] && echo "$default" || return 1
  fi

  local value
  value=$(jq -r --arg f "$field" '.[$f] // empty' "$file" 2>/dev/null)

  if [ -z "$value" ]; then
    if [ -n "$default" ]; then
      echo "$default"
    else
      echo "❌ Missing required field: $field in $file"
      return 1
    fi
  fi

  echo "$value"
}
```

### Enhanced Error Classification (Fix 8)

```bash
# Enhanced error classification (language-agnostic)
classify_error() {
  local error="$1"

  # Transient: Network, temporary failures
  if echo "$error" | grep -qiE "(timeout|refused|reset|unavailable|temporarily|retry|connection|network)"; then
    echo "transient"
  # Fundamental: Permission, not found, invalid input
  elif echo "$error" | grep -qiE "(permission denied|not found|invalid|malformed|unauthorized|forbidden)"; then
    echo "fundamental"
  # Resource: Out of memory, disk full
  elif echo "$error" | grep -qiE "(out of memory|disk full|no space|resource.*unavailable)"; then
    echo "resource"
  else
    # Unknown: Treat as transient for retry, but log for investigation
    echo "unknown"
    log_warning "Unclassified error (treating as transient): $error"
  fi
}
```

### Infinite Loop Safety Mechanisms (Fix 6)

```bash
# Constants for safety
MAX_ITERATIONS=1000000      # Safety limit for testing
WATCHDOG_TIMEOUT=300        # 5 minutes max per cycle
DISK_FULL_THRESHOLD=95      # Stop if disk > 95% full
MEMORY_HIGH_THRESHOLD=90    # Stop if memory > 90% used

heartbeat_loop() {
  local iteration=0

  # Set up cleanup handler
  cleanup() {
    echo "Cleaning up..."
    persist_state
    exit 0
  }
  trap cleanup SIGINT SIGTERM

  while [ $iteration -lt $MAX_ITERATIONS ]; do
    iteration=$((iteration + 1))

    # Check emergency stop conditions
    # 1. Disk space
    local disk_usage
    disk_usage=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt $DISK_FULL_THRESHOLD ]; then
      echo "❌ EMERGENCY STOP: Disk ${disk_usage}% full"
      break
    fi

    # 2. Memory
    local mem_usage
    if command -v free &> /dev/null; then
      mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
      if [ "$mem_usage" -gt $MEMORY_HIGH_THRESHOLD ]; then
        echo "❌ EMERGENCY STOP: Memory ${mem_usage}% used"
        break
      fi
    fi

    # Run heartbeat with timeout (prevent hangs)
    if ! timeout $WATCHDOG_TIMEOUT heartbeat_cycle; then
      echo "❌ EMERGENCY STOP: Heartbeat cycle timed out after ${WATCHDOG_TIMEOUT}s"
      break
    fi

    # Sleep with interruptibility
    sleep $cycleTime || break
  done

  # Write final state
  persist_state
  echo "Autoloop stopped after $iteration iterations"
}
```

### Lock File for Instance Exclusion (Recommendation 3)

```bash
LOCKFILE=".ultra/state/autoloop.lock"

acquire_lock() {
  if [ -f "$LOCKFILE" ]; then
    local pid=$(cat "$LOCKFILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "❌ Autoloop already running (PID: $pid)"
      exit 1
    else
      echo "⚠️  Removing stale lock file"
      rm -f "$LOCKFILE"
    fi
  fi

  echo $$ > "$LOCKFILE"
}

release_lock() {
  rm -f "$LOCKFILE"
}

trap release_lock EXIT

acquire_lock
```
