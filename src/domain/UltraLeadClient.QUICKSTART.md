# UltraLeadClient Quick Start Guide

## Installation

UltraLeadClient is part of the UltraPilot framework. No additional installation needed.

## Basic Usage

### 1. Import and Create

```typescript
import { createUltraLeadClient } from './UltraLeadClient.js';

const client = createUltraLeadClient({
  workspacePath: process.cwd(),
  planPath: '.ultra/plan-final.md',
  autoStart: true,
  enableFileWatcher: true
});
```

### 2. Listen to Events

```typescript
// Plan received
client.on('planReceived', (plan) => {
  console.log('Plan:', plan.planId);
});

// Progress updates
client.on('progress', (progress) => {
  console.log(`Phase ${progress.phase}: ${progress.status}`);
});

// Workflow completed
client.on('workflowCompleted', (result) => {
  console.log('Success:', result.success);
});

// Task completed
client.on('taskCompleted', (task) => {
  console.log('Task:', task.title);
});
```

### 3. Get Statistics

```typescript
const stats = client.getStats();
console.log({
  running: stats.isRunning,
  session: stats.sessionId,
  phase: stats.currentPhase,
  tasks: `${stats.tasksCompleted}/${stats.totalTasks}`
});
```

## Configuration Options

```typescript
interface UltraLeadClientConfig {
  workspacePath: string;        // Path to workspace (default: cwd)
  planPath?: string;            // Path to plan file (default: .ultra/plan-final.md)
  autoStart?: boolean;          // Auto-start client (default: true)
  monitorInterval?: number;     // Poll interval in ms (default: 5000)
  enableFileWatcher?: boolean;  // Enable file watching (default: true)
}
```

## Plan File Format

Create a plan file at `.ultra/plan-final.md`:

```markdown
# Operational Plan - My Project

## Metadata
- Plan ID: plan-001
- Version: 1.0

## Phase 2: Planning
### Tasks
- [ ] Create implementation plan: Break down requirements
- [ ] Define file ownership: Assign files to agents

## Phase 3: Execution
### Tasks
- [ ] Implement features: Build the main functionality
- [ ] Write tests: Ensure code quality

## Phase 4: Quality Assurance
### Tasks
- [ ] Run tests: Execute test suite
- [ ] Performance review: Check bottlenecks

## Phase 5: Validation
### Tasks
- [ ] Final review: Comprehensive review
- [ ] Documentation: Update docs
```

## Publishing Plan Events

```typescript
import { AgentMessageBus } from './AgentMessageBus.js';

const bus = new AgentMessageBus();

await bus.publish('system', 'plan.created', {
  type: 'plan.created',
  payload: {
    planId: 'plan-001',
    planPath: '.ultra/plan-final.md',
    workspacePath: process.cwd(),
    timestamp: new Date(),
    phases: [...]
  }
});
```

## Stopping the Client

```typescript
await client.stop();
```

## Common Patterns

### Wait for Workflow Completion

```typescript
const workflowPromise = new Promise((resolve) => {
  client.once('workflowCompleted', resolve);
});

await workflowPromise;
```

### Monitor Progress with Phase Names

```typescript
client.on('progress', (progress) => {
  const phaseNames = ['', '', 'Planning', 'Execution', 'QA', 'Validation'];
  console.log(`${phaseNames[progress.phase]}: ${progress.status}`);
});
```

### Get Real-time Workflow State

```typescript
const state = client.getWorkflowState();
if (state) {
  console.log(`Phase ${state.currentPhase}/${state.totalPhases}`);
  console.log(`Tasks ${state.tasksCompleted}/${state.totalTasks}`);
  console.log(`Status: ${state.status}`);
}
```

## Demo Usage

```bash
# Create sample plan
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts create-plan

# Run basic demo
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts basic

# Monitor progress
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts monitor

# Get statistics
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts stats
```

## Event Reference

### Events Emitted

| Event | Payload | Description |
|-------|---------|-------------|
| `planReceived` | `PlanEvent` | Plan received via AgentMessageBus |
| `planChanged` | `{planPath}` | Plan file changed |
| `progress` | `ProgressReport` | Progress update |
| `taskCompleted` | `Task` | Task completed |
| `taskFailed` | `Task` | Task failed |
| `workflowCompleted` | `WorkflowResult` | Workflow completed |
| `error` | `Error` | Error occurred |
| `started` | - | Client started |
| `stopped` | - | Client stopped |

### Progress Report Structure

```typescript
interface ProgressReport {
  sessionId: string;
  phase: number;           // Current phase (2-5)
  phaseName: string;       // Phase name
  status: string;          // 'starting' | 'running' | 'completed'
  tasksCompleted: number;
  totalTasks: number;
  timestamp: Date;
  message?: string;
}
```

## Troubleshooting

### Client Not Starting

Check if workspace path exists:
```typescript
import fs from 'fs';
console.log(fs.existsSync(config.workspacePath));
```

### Plan File Not Found

Ensure plan file exists at specified path:
```typescript
import fs from 'fs';
try {
  await fs.access('.ultra/plan-final.md');
} catch {
  console.log('Plan file not found');
}
```

### Events Not Firing

Check if client is running:
```typescript
console.log(client.isActive()); // Should be true
```

## Advanced Usage

### Custom Plan Parser

Override the default parser:
```typescript
class CustomClient extends UltraLeadClient {
  protected async parsePlanFile(planPath: string): Promise<OperationalPlan> {
    // Custom parsing logic
    return customPlan;
  }
}
```

### Custom Task Execution

Override task execution:
```typescript
class CustomClient extends UltraLeadClient {
  protected async executeTask(task: PlanTask, phase: PlanPhase): Promise<any> {
    // Custom execution logic
    return result;
  }
}
```

## See Also

- [ULTRALEADCLIENT-INTEGRATION.md](./ULTRALEADCLIENT-INTEGRATION.md) - Complete documentation
- [TASK-2.1a-COMPLETION-SUMMARY.md](../TASK-2.1a-COMPLETION-SUMMARY.md) - Implementation summary
- [UltraLeadClient.demo.ts](./UltraLeadClient.demo.ts) - Demo code
