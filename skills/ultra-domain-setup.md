---
name: ultra-domain-setup
description: 'Initialize a new domain - define requirements, setup queues, configure routines, then unleash ultra-autoloop. One-time setup per workspace.'
---

# ULTRA-DOMAIN-SETUP

> **"Initialize your domain, then let the heartbeat run it"**

Ultra-domain-setup creates the domain structure, defines requirements, sets up queues, configures routine tasks, and prepares everything for ultra-autoloop to take over.

## When to Use

**First time setting up:**

- A new project/workspace
- An existing project you want to add ultra-plugin to
- A domain that needs autonomous agent management

**One-time setup per workspace.**

## Usage

```bash
/ultra-domain-setup
```

## Setup Wizard

### Phase 1: Domain Identity

```
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-SETUP                                          ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Let's set up your domain!                                   ║
║                                                               ║
║  Step 1/5: Domain Identity                                   ║
║  ─────────────────────────────────                           ║
║                                                               ║
║  What is this domain?                                        ║
║                                                               ║
║  Domain name: [________________________________]             ║
║  Example: ecommerce-api, mobile-app, shared-lib              ║
║                                                               ║
║  Description: [________________________________]             ║
║  What does this domain do?                                   ║
║                                                               ║
║  Type:                                                         ║
║  [ ] Web API     [ ] Mobile App     [ ] Library             ║
║  [ ] Frontend    [ ] Backend        [ ] Full Stack          ║
║  [ ] Microservice [ ] Monorepo       [ ] Other               ║
║                                                               ║
║  Press Enter when ready...                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Phase 2: Tech Stack

```
╔═══════════════════════════════════════════════════════════════╗
║  Step 2/5: Tech Stack                                         ║
║  ─────────────────────────────────                           ║
║                                                               ║
║  Primary Language:                                            ║
║  [ ] TypeScript    [ ] Python    [ ] Go                     ║
║  [ ] Rust         [ ] Java     [ ] Other                   ║
║                                                               ║
║  Framework:                                                    ║
║  [__] Example: React, Express, Django, Spring               ║
║                                                               ║
║  Package Manager:                                              ║
║  [ ] npm          [ ] yarn      [ ] pnpm                    ║
║  [ ] pip          [ ] poetry    [ ] cargo                   ║
║  [ ] gradle       [ ] maven     [ ] Other                   ║
║                                                               ║
║  Testing:                                                      ║
║  [ ] Jest         [ ] pytest    [ ] go test                 ║
║  [ ] Mocha        [ ] JUnit     [ ] Other                   ║
║                                                               ║
║  Version Control:                                              ║
║  [ ] Git (default)                                           ║
║  Branch: [main__]                                             ║
║                                                               ║
║  Press Enter when ready...                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Phase 3: Requirements

```
╔═══════════════════════════════════════════════════════════════╗
║  Step 3/5: Domain Requirements                               ║
║  ─────────────────────────────────                           ║
║                                                               ║
║  What agents should work on this domain?                     ║
║                                                               ║
║  Available Ultra-Plugin Agents:                              ║
║  [✓] ultra-executor      - Implementation                   ║
║  [✓] ultra-test-engine   - Test writing                     ║
║  [✓] ultra-debugging     - Bug fixing                       ║
║  [✓] ultra-code-review   - Code review                      ║
║  [✓] ultra-security      - Security auditing                 ║
║  [✓] ultra-quality       - Performance analysis              ║
║  [  ] ultra-architect     - Architecture design               ║
║  [  ] ultra-documenter   - Documentation                     ║
║                                                               ║
║  Routine Maintenance Tasks:                                  ║
║  [✓] test-suite-health   - Run tests hourly                 ║
║  [✓] dependency-check    - Check for updates daily           ║
║  [✓] git-sync            - Commit/push changes               ║
║  [✓] lint-check          - Run linter hourly                 ║
║  [  ] security-scan       - Security audit weekly             ║
║  [  ] docs-update         - Update docs weekly                ║
║                                                               ║
║  Quality Gates:                                               ║
║  [✓] Tests must pass before closing tasks                    ║
║  [✓] Lint must pass before committing                        ║
║  [ ] Build must succeed before merging                        ║
║  [ ] Security scan must pass before deploy                   ║
║                                                               ║
║  Press Enter when ready...                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Phase 4: Domain Rules

```
╔═══════════════════════════════════════════════════════════════╗
║  Step 4/5: Domain Rules                                       ║
║  ─────────────────────────────────                           ║
║                                                               ║
║  Task Routing Rules:                                          ║
║                                                               ║
║  Tasks with "feature" or "implement" → ultra-executor       ║
║  Tasks with "bug" or "fix" → ultra-debugging                 ║
║  Tasks with "refactor" → ultra-code-review                    ║
║  Tasks with "security" → ultra-security-review                ║
║  Tasks with "test" → ultra-test-engine                        ║
║  Tasks with "performance" → ultra-quality                     ║
║                                                               ║
║  Task Priority:                                               ║
║  [ ] FIFO (first in, first out)                               ║
║  [✓] Priority-based (security > bugs > features)            ║
║  [ ] Weighted (custom weights)                                ║
║                                                               ║
║  Autoloop Cycle Time:                                         ║
║  [ ] 30s (active development)                                 ║
║  [✓] 60s (normal)                                            ║
║  [ ] 5m (maintenance mode)                                    ║
║                                                               ║
║  Task Ownership:                                              ║
║  [✓] Auto-assign to available agents                         ║
║  [ ] Manual approval required                                 ║
║  [ ] Round-robin distribution                                 ║
║                                                               ║
║  Press Enter when ready...                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Phase 5: Confirmation

```
╔═══════════════════════════════════════════════════════════════╗
║  Step 5/5: Confirmation                                       ║
║  ─────────────────────────────────                           ║
║                                                               ║
║  Domain Configuration Summary:                               ║
║  ────────────────────────────────────                         ║
║                                                               ║
║  Name: ecommerce-api                                          ║
║  Type: Web API (Backend)                                      ║
║  Stack: TypeScript, Express, npm, Jest                       ║
║                                                               ║
║  Active Agents (6):                                           ║
║  • ultra-executor (implementation)                           ║
║  • ultra-test-engine (tests)                                 ║
║  • ultra-debugging (bugs)                                    ║
║  • ultra-code-review (refactoring)                           ║
║  • ultra-security (security)                                 ║
║  • ultra-quality (performance)                               ║
║                                                               ║
║  Routine Tasks (4):                                           ║
║  • test-suite-health (hourly)                                ║
║  • dependency-check (daily)                                  ║
║  • git-sync (on-change)                                      ║
║  • lint-check (hourly)                                       ║
║                                                               ║
║  Quality Gates:                                               ║
║  ✓ Tests must pass                                           ║
║  ✓ Lint must pass                                            ║
║                                                               ║
║  Autoloop: 60s cycle time                                     ║
║                                                               ║
║  ────────────────────────────────────                         ║
║                                                               ║
║  Ready to initialize?                                        ║
║                                                               ║
║  [Y] Yes, initialize domain                                   ║
║  [N] No, go back                                             ║
║  [C] Cancel                                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

## What Gets Created

### Directory Structure

```
.ultra/
├── domain.json                 # Domain configuration
├── queues/
│   ├── intake.json            # New task queue
│   ├── in-progress.json       # Active tasks
│   ├── review.json            # Awaiting review
│   ├── completed.json         # Recently completed
│   └── failed.json            # Failed tasks
├── routines/
│   ├── test-suite-health.json
│   ├── dependency-check.json
│   ├── git-sync.json
│   └── lint-check.json
├── state/
│   ├── autoloop.json          # Autoloop state
│   ├── heartbeat.json         # Health metrics
│   └── initialized           # Setup complete flag
└── workspace.json             # Workspace metadata
```

### Domain Configuration

```json
{
  "domainId": "domain-ecommerce-api-001",
  "name": "ecommerce-api",
  "type": "web-api",
  "description": "E-commerce REST API with Node.js/Express",

  "stack": {
    "language": "TypeScript",
    "framework": "Express",
    "packageManager": "npm",
    "testing": "Jest",
    "versionControl": "git",
    "mainBranch": "main"
  },

  "agents": [
    "ultra-executor",
    "ultra-test-engine",
    "ultra-debugging",
    "ultra-code-review",
    "ultra-security-review",
    "ultra-quality-review"
  ],

  "routing": {
    "rules": [
      {
        "pattern": "feature|implement",
        "agent": "ultra-executor"
      },
      {
        "pattern": "bug|fix",
        "agent": "ultra-debugging"
      },
      {
        "pattern": "refactor",
        "agent": "ultra-code-review"
      },
      {
        "pattern": "security",
        "agent": "ultra-security-review"
      },
      {
        "pattern": "test",
        "agent": "ultra-test-engine"
      },
      {
        "pattern": "performance",
        "agent": "ultra-quality-review"
      }
    ],
    "priority": "priority-based",
    "ownership": "auto-assign"
  },

  "routines": [
    {
      "name": "test-suite-health",
      "schedule": "hourly",
      "enabled": true
    },
    {
      "name": "dependency-check",
      "schedule": "daily",
      "enabled": true
    },
    {
      "name": "git-sync",
      "schedule": "on-change",
      "enabled": true
    },
    {
      "name": "lint-check",
      "schedule": "hourly",
      "enabled": true
    }
  ],

  "qualityGates": {
    "testsMustPass": true,
    "lintMustPass": true,
    "buildMustSucceed": false,
    "securityScanMustPass": false
  },

  "autoloop": {
    "cycleTime": 60,
    "enabled": false,
    "startedAt": null
  },

  "createdAt": "2026-03-01T12:00:00Z",
  "version": "1.0.0"
}
```

### Initial Queues

```json
{
  "intake": [],
  "in-progress": [],
  "review": [],
  "completed": [],
  "failed": []
}
```

### Routine Task Configurations

```json
{
  "name": "test-suite-health",
  "schedule": "hourly",
  "command": "npm test",
  "enabled": true,
  "lastRun": null,
  "failures": 0
}
```

## After Setup

Once domain is initialized, **automatically start the autoloop daemon via PM2**:

```bash
# Domain is ready! Now start the autoloop daemon:

# 1. Ensure PM2 is installed
command -v pm2 &>/dev/null || npm install -g pm2

# 2. Create the autoloop prompt file from domain config
# (autoloop-session-prompt.md is generated per-domain)

# 3. Start PM2-managed autoloop
pm2 start autoloop.ecosystem.config.cjs
pm2 save

# 4. Verify
pm2 status
tmux list-sessions
```

Output:

```
✓ Domain configuration created
✓ Queues initialized
✓ Routines configured
✓ PM2 autoloop daemon started
✓ tmux session "ultrapilot:autoloop" created
✓ Claude Code REPL running with CronCreate heartbeat
✓ Domain is ALIVE

Monitor:
  pm2 logs ultrapilot-autoloop   # View logs
  pm2 monit                       # Live monitoring
  tmux attach -t ultrapilot       # Watch Claude work
```

## Autoloop Architecture (PM2 + tmux + CronCreate)

```
PM2 (crash recovery, daily restart at 4am UTC)
  → autoloop-pm2-wrapper.sh (preflight, tmux monitor)
    → tmux "ultrapilot:autoloop" (persistent session)
      → claude --dangerously-skip-permissions (REPL mode)
        → CronCreate */1 * * * * (built-in timer)
          → checks GitHub for actionable tasks
          → spawns native Agent teams → ultra-ultrawork
```

Key files:

- `autoloop.ecosystem.config.cjs` — PM2 process config
- `autoloop-pm2-wrapper.sh` — tmux session manager
- `.ultra/autoloop/autoloop-session-prompt.md` — Claude REPL bootstrap
- `.ultra/autoloop/daemon-config.json` — routine definitions & dependencies

## Quick Setup (Non-Interactive)

For automation/scripted setup:

```bash
/ultra-domain-setup --config domain.json
```

Where `domain.json` contains all configuration:

```json
{
  "name": "ecommerce-api",
  "type": "web-api",
  "stack": {
    "language": "TypeScript",
    "framework": "Express"
  },
  "agents": ["ultra-executor", "ultra-test-engine"],
  "routines": ["test-suite-health", "git-sync"],
  "autoloop": { "cycleTime": 60 }
}
```

## Reconfiguration

To change domain settings after setup:

```bash
/ultra-domain-setup --reconfigure
```

Opens wizard again with current values pre-filled.

## Reset Domain

To completely reset domain (WARNING: deletes all state):

```bash
/ultra-domain-setup --reset
```

Deletes `.ultra/` directory and allows fresh setup.

## Validation

Domain setup validates:

- ✅ Package manager exists (npm/yarn/pnpm)
- ✅ Testing framework is installed
- ✅ Git repository initialized
- ✅ Main branch exists
- ✅ Write permissions for `.ultra/`

If validation fails, setup reports errors and allows corrections.

---

## Summary

**Ultra-Domain-Setup = Domain Initialization**

1. Define domain identity
2. Specify tech stack
3. Select agents and routines
4. Configure routing rules
5. Create directory structure
6. Initialize queues
7. **Ready for ultra-autoloop**

**One-time setup, then let the heartbeat run your domain.**

---

## Security Enhancements (Revision 1)

This section describes security measures integrated into ultra-domain-setup.

### Input Validation (Fix 2)

All wizard inputs are validated before acceptance:

```bash
# Validate domain name
validate_domain_name() {
  local name="$1"

  # Only alphanumeric, hyphens, underscores
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "❌ Invalid domain name. Use only letters, numbers, hyphens, underscores."
    return 1
  fi

  # Length limit (DNS-compatible)
  if [ ${#name} -lt 1 ] || [ ${#name} -gt 63 ]; then
    echo "❌ Domain name must be 1-63 characters"
    return 1
  fi

  # Prevent path traversal
  if [[ "$name" =~ \.\. ]]; then
    echo "❌ Domain name cannot contain '..'"
    return 1
  fi

  # Must start with letter
  if [[ ! "$name" =~ ^[a-zA-Z] ]]; then
    echo "❌ Domain name must start with a letter"
    return 1
  fi

  return 0
}

# Validate description (no special chars)
validate_description() {
  local desc="$1"

  # Allow alphanumeric, spaces, basic punctuation
  if [[ ! "$desc" =~ ^[a-zA-Z0-9\s\-.,!?']+$ ]]; then
    echo "⚠️  Description contains unusual characters"
    read -p "Continue anyway? (y/N) " -n 1 -r
    [[ $REPLY =~ ^[Yy]$ ]]
  fi

  return 0
}
```

### Secrets Management (Fix 5)

Domain setup includes automatic secrets detection:

```bash
# After generating domain.json, scan for secrets
if grep -iE "(api[_-]?key|secret|password|token|private[_-]?key)" .ultra/domain.json; then
  echo "⚠️  WARNING: Possible secret detected in domain.json"
  echo "   Secrets should use environment variables instead"
  echo "   Example: Add API_KEY to environment and reference as \${API_KEY}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled. Please remove secrets and try again."
    exit 1
  fi
fi
```

### File Permissions (Fix 3)

All created files have restrictive permissions:

```bash
# Directories: 700 (owner read/write/execute only)
chmod 700 .ultra/
chmod 700 .ultra/queues
chmod 700 .ultra/routines
chmod 700 .ultra/state

# Config files: 600 (owner read/write only)
chmod 600 .ultra/domain.json
```

### .gitignore Configuration (Fix 5)

Automatically created `.ultra/.gitignore`:

```bash
# Ignore state files (may contain sensitive data)
state/

# Ignore runtime queue files
queues/*.json

# Keep domain config and schemas
!.gitignore
*.json
```

### Pre-flight Validation

Domain setup validates before completion:

```bash
# 1. Check package manager exists
if ! command -v npm &> /dev/null && ! command -v yarn &> /dev/null && ! command -v pnpm &> /dev/null; then
    echo "❌ No package manager found (npm/yarn/pnpm required)"
    exit 1
fi

# 2. Check git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not a git repository"
    echo "   Run: git init"
    exit 1
fi

# 3. Check write permissions
if [ ! -w . ]; then
    echo "❌ No write permission for current directory"
    exit 1
fi

echo "✅ All validation checks passed"
```
