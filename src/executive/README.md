# Agent Monitor Daemon

**THE EXECUTION BRIDGE** - Connects dashboard workflow requests to agent execution

---

## Overview

The Agent Monitor Daemon is the critical missing piece that unlocks the entire UltraPilot system. It continuously monitors GitHub issues for workflow execution requests and triggers UltraPilot skills to handle them.

**The Problem It Solves:**
```
BEFORE: User → Dashboard → GitHub Issue → ❌ NO EXECUTION → Result
AFTER:  User → Dashboard → GitHub Issue → ✅ AGENT EXECUTION → Result → Dashboard Updated
```

---

## How It Works

### 1. Continuous Monitoring Loop
```typescript
Every 60 seconds:
  ├─ Fetch all issues with 'workflow' label from GitHub
  ├─ Filter for pending issues (no 'running' label)
  ├─ For each pending issue:
  │   ├─ Mark as 'running'
  │   ├─ Parse task from issue body
  │   ├─ Execute UltraPilot skill
  │   ├─ Update issue with result
  │   └─ Close issue if successful
  └─ Sleep for 60s
```

### 2. Issue Processing

**Issue Format:**
```markdown
# 🤖 UltraPilot: Strategic Orchestration

## Skill
ultrapilot

## Task
Build me a REST API for task management

## Workspace
ultrapilot (optional)

## Parameters
{
  "feature": "REST API",
  "tech": "Node.js, Express"
}
```

**Execution Flow:**
1. Parse skill, task, workspace from issue
2. Trigger UltraPilot skill execution
3. Monitor execution progress
4. Add result comment to issue
5. Close issue on success

---

## Installation & Usage

### Prerequisites
- GitHub Token with `repo` and `issues` permissions
- Node.js 18+
- UltraPilot plugin installed

### Configuration

Set environment variable:
```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

### Start the Daemon

```bash
cd ~/.claude/plugins/ultrapilot

# Development mode
npm run daemon:dev

# Production mode
npm run daemon
```

### What You'll See

```
🚀 AgentMonitorDaemon started - monitoring for workflow issues
🔍 Scanning 3 repositories for workflow issues...
Found 1 pending workflow issues in hscheema1979/control-room
🎯 Executing workflow #42: Build REST API for task management
🔧 Executing skill: ultrapilot
📝 Task: Build me a REST API for task management
🏢 Workspace: ultrapilot
✅ Workflow #42 completed successfully
```

---

## Architecture

### File Structure
```
src/executive/
├── agent-monitor-daemon.ts    # Main daemon logic
├── github-executor.ts          # GitHub API integration
└── feedback-loop.ts            # Status updates & monitoring

cli/
└── daemon.ts                    # CLI wrapper

dist/executive/
└── agent-monitor-daemon.js     # Compiled output
```

### Components

**AgentMonitorDaemon Class:**
- `start()` - Start monitoring loop
- `stop()` - Stop monitoring
- `scanAndExecuteWorkflows()` - Main processing loop
- `executeWorkflow()` - Handle single workflow
- `parseTaskFromIssue()` - Extract task from issue
- `executeSkill()` - Trigger UltraPilot skill

---

## Monitored Repositories

The daemon monitors these repositories by default:
1. `hscheema1979/control-room` - Primary workflow tracking
2. `hscheema1979/ultrapilot-dashboard` - Dashboard workflows
3. `hscheema1979/hscheema1979` - Profile workflows

You can add more repositories in the `checkRepos` array.

---

## Labels & States

### Labels Used
- `workflow` - Marks issue as workflow request (required)
- `running` - Marks issue as currently executing (auto-added)
- `completed` - Marks issue as successfully completed (auto-added)
- `failed` - Marks issue as failed (auto-added on error)

### Issue States
1. **Open** (no `running` label) → Pending execution
2. **Open** (with `running` label) → Currently executing
3. **Closed** → Execution completed

---

## Execution Results

### Success Comment Format
```markdown
✅ **Workflow Execution Completed Successfully**

**Duration:** 45s

**Output:**
```
Executed ultrapilot skill for task: "Build me a REST API"
```

---
*Executed by AgentMonitorDaemon*
```

### Failure Comment Format
```markdown
❌ **Workflow Execution Failed**

**Duration:** 12s

**Error:**
```
Skill execution timeout
```

---
*Executed by AgentMonitorDaemon*
```

---

## Next Steps

After this daemon is running:

1. **Test It**: Create a workflow issue on GitHub with the `workflow` label
2. **Watch It**: Monitor the daemon pick it up and execute
3. **Verify It**: Check the result comment on the issue
4. **Improve It**: Add actual UltraPilot skill execution integration

---

## Troubleshooting

### Daemon won't start
- Check GITHUB_TOKEN is set
- Verify token has `repo` and `issues` permissions
- Check for port conflicts

### Issues not being picked up
- Verify issue has `workflow` label
- Check issue is in monitored repository
- Look for errors in daemon logs

### Execution failing
- Check skill name is valid
- Verify task format is correct
- Look at daemon error logs

---

## Future Enhancements

1. **GitHub Webhook Support** - Real-time triggers instead of polling
2. **Retry Logic** - Automatic retry on transient failures
3. **Parallel Execution** - Execute multiple workflows simultaneously
4. **Priority Queue** - Execute urgent workflows first
5. **Metrics** - Track execution success rate, duration, etc.

---

## Impact

**This daemon is the KEY that unlocks UltraPilot's full potential:**

- ✅ Enables autonomous agency operations
- ✅ Connects dashboard to agents
- ✅ Provides feedback loop
- ✅ Demonstrates "boulder never stops" philosophy

**Time Investment**: 4-6 hours
**Impact**: TRANSFORMATIVE
