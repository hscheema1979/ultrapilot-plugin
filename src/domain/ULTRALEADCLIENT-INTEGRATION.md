# UltraLeadClient Integration - Task 2.1a Complete

## Overview

UltraLeadClient is the WebSocket integration adapter that connects Ultra-Lead to AgentMessageBus for Phases 2-5 execution. This implementation completes Task 2.1a from the implementation plan.

## What Was Implemented

### 1. UltraLeadClient.ts (NEW)

**Location**: `/home/ubuntu/hscheema1979/ultrapilot/src/domain/UltraLeadClient.ts`

A comprehensive adapter that:

- **Subscribes to plan creation events** via AgentMessageBus
  - Listens to `plan.created` topic
  - Receives PlanEvent objects with plan metadata

- **Monitors `.ultra/plan-final.md`** for changes using chokidar
  - Real-time file watching
  - Auto-reloads plan when changed
  - Stability threshold to avoid partial writes

- **Executes Phases 2-5 workflow** when plan is ready
  - Phase 2: Planning (validation, task breakdown)
  - Phase 3: Execution (parallel agent coordination)
  - Phase 4: Quality Assurance (testing, review)
  - Phase 5: Validation (final verification)

- **Creates ULTRA_LEAD session** via SessionManager
  - Proper session lifecycle management
  - Activity tracking
  - Multi-process coordination support

- **Reports progress** via AgentMessageBus
  - Real-time progress updates
  - Task completion events
  - Workflow status events

### 2. UltraLead.ts (MODIFIED)

**Location**: `/home/ubuntu/hscheema1979/ultrapilot/src/domain/UltraLead.ts`

**Changes**:
- Integrated AgentMessageBus for communication
- Integrated ConnectionPool for database access
- **Resolved TODO at line 424**: Now uses AgentMessageBus.publish() to send tasks to UltraLoop
- **Resolved TODO at line 440**: Now uses AgentMessageBus.publish() to request status from UltraLoop
- **Resolved TODO at line 552**: Now queries actual metrics from ConnectionPool database

**New Methods**:
- `receiveStatusUpdate()`: Handle status updates from UltraLoop
- `getCurrentStats()`: Get real-time statistics including health

## I/O Contract Implementation

The UltraLeadClient implements the complete I/O contract specified in the plan:

```typescript
interface UltraLeadClient {
  // Subscribe to plan events from AgentMessageBus
  subscribeToPlanEvents(callback?: (plan: PlanEvent) => void): void;

  // Monitor plan file for changes (chokidar)
  startPlanMonitoring(planPath: string): void;

  // Execute Phases 2-5 workflow
  executeWorkflow(plan: OperationalPlan): Promise<WorkflowResult>;

  // Create ULTRA_LEAD session
  createSession(workspacePath: string): Promise<string>;

  // Report progress via AgentMessageBus
  reportProgress(sessionId: string, phase: number, status: string): void;
}
```

## Architecture

### Data Flow

```
┌─────────────────┐
│ UltraPilot      │
│ (Phase 0-1)     │
└────────┬────────┘
         │ Creates plan-final.md
         ▼
┌─────────────────────────────────────┐
│ UltraLeadClient                     │
│ ┌─────────────────────────────────┐ │
│ │ 1. Subscribe to plan.created    │ │
│ │    (AgentMessageBus)            │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 2. Monitor plan-final.md        │ │
│ │    (chokidar)                   │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 3. Parse plan                   │ │
│ │    (Markdown parser)            │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 4. Create ULTRA_LEAD session    │ │
│ │    (SessionManager)             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 5. Execute Phases 2-5           │ │
│ │    - Phase 2: Planning          │ │
│ │    - Phase 3: Execution         │ │
│ │    - Phase 4: QA                │ │
│ │    - Phase 5: Validation        │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 6. Report progress              │ │
│ │    (AgentMessageBus)            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Component Integration

```
┌──────────────────┐
│ AgentMessageBus  │◄─────┐
│ (Message Broker) │      │
└────────┬─────────┘      │
         │                │
         ├────────────────┤
         │                │
         ▼                ▼
┌──────────────────┐ ┌──────────────────┐
│ UltraLeadClient  │ │   UltraLead      │
│  (Adapter)       │ │  (Orchestrator)  │
└────────┬─────────┘ └────────┬─────────┘
         │                    │
         ├────────────────────┤
         │                    │
         ▼                    ▼
┌──────────────────┐ ┌──────────────────┐
│  SessionManager  │ │   TaskQueue      │
│ (Session Mgmt)   │ │  (Task Mgmt)     │
└──────────────────┘ └──────────────────┘
         │                    │
         └────────────────────┤
                              │
                              ▼
                   ┌──────────────────┐
                   │  ConnectionPool  │
                   │  (Database)      │
                   └──────────────────┘
```

## Usage

### Basic Usage

```typescript
import { createUltraLeadClient } from './UltraLeadClient.js';

// Create and start client
const client = createUltraLeadClient({
  workspacePath: '/path/to/workspace',
  planPath: '/path/to/.ultra/plan-final.md',
  autoStart: true,
  enableFileWatcher: true
});

// Listen to events
client.on('planReceived', (plan) => {
  console.log('Plan received:', plan.planId);
});

client.on('workflowCompleted', (result) => {
  console.log('Workflow completed:', result.success);
});

client.on('progress', (progress) => {
  console.log(`Phase ${progress.phase}: ${progress.status}`);
});
```

### Publishing Plan Events

```typescript
import { AgentMessageBus } from './AgentMessageBus.js';

const messageBus = new AgentMessageBus();

// Publish plan creation event
await messageBus.publish(
  'system',
  'plan.created',
  {
    type: 'plan.created',
    payload: {
      planId: 'plan-123',
      planPath: '/path/to/plan-final.md',
      workspacePath: '/path/to/workspace',
      timestamp: new Date(),
      phases: [...]
    }
  }
);
```

### Monitoring Progress

```typescript
// Get real-time statistics
const stats = client.getStats();
console.log('Session:', stats.sessionId);
console.log('Phase:', stats.currentPhase);
console.log('Tasks:', stats.tasksCompleted, '/', stats.totalTasks);

// Get workflow state
const state = client.getWorkflowState();
console.log('Status:', state?.status);
```

## Plan File Format

UltraLeadClient expects plan files in the following markdown format:

```markdown
# Operational Plan - Project Name

## Metadata
- Plan ID: plan-123
- Version: 1.0
- Created: 2024-01-01T00:00:00Z
- Workspace: /path/to/workspace

## Phase 2: Planning

### Tasks
- [ ] Create implementation tasks: Break down requirements into actionable tasks
- [ ] Define file ownership: Assign files to agents to prevent conflicts
- [ ] Set up testing strategy: Define test approach and coverage goals

## Phase 3: Execution

### Tasks
- [ ] Implement core functionality: Build the main features
- [ ] Write unit tests: Ensure code quality with comprehensive tests
- [ ] Integrate components: Connect all modules together

## Phase 4: Quality Assurance

### Tasks
- [ ] Run test suite: Execute all tests and verify results
- [ ] Performance review: Check for performance bottlenecks
- [ ] Security audit: Review code for security vulnerabilities

## Phase 5: Validation

### Tasks
- [ ] Final review: Comprehensive code review
- [ ] Documentation: Update project documentation
- [ ] Deployment prep: Prepare for production deployment
```

## Events

UltraLeadClient emits the following events:

### Input Events
- `planReceived`: Emitted when a plan is received via AgentMessageBus
- `planChanged`: Emitted when the monitored plan file changes

### Output Events
- `workflowCompleted`: Emitted when the entire workflow completes
- `progress`: Emitted on progress updates
- `taskCompleted`: Emitted when a task completes
- `taskFailed`: Emitted when a task fails
- `error`: Emitted on errors
- `started`: Emitted when client starts
- `stopped`: Emitted when client stops

## Testing/Demo

Run the demo file to test the integration:

```bash
# Create a sample plan file
npm run demo:create-plan

# Run basic demo with file watching
npm run demo:basic

# Publish a plan event
npm run demo:publish

# Monitor progress
npm run demo:monitor

# Get statistics
npm run demo:stats
```

Or directly with ts-node:

```bash
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts basic
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts create-plan
ts-node ultrapilot/src/domain/UltraLeadClient.demo.ts monitor
```

## Dependencies

- `chokidar`: File watching (already in package.json)
- `better-sqlite3`: Database (already in package.json)
- AgentMessageBus: Message broker (implemented)
- SessionManager: Session management (implemented)
- ConnectionPool: Database connection pool (implemented)
- TaskQueue: Task queue management (implemented)

## Next Steps

1. **Task 2.1b**: Implement UltraLoop WebSocket Integration
   - Connect UltraLoop to AgentMessageBus
   - Subscribe to task queues
   - Report task completion

2. **Task 2.2**: Implement Agent Bridge
   - Spawn agents for task execution
   - Handle agent communication
   - Manage agent lifecycle

3. **Task 2.3**: Implement Autoloop Heartbeat
   - 60-second heartbeat for background daemon
   - Queue processing
   - Continuous execution

## Files Created/Modified

### Created
1. `/home/ubuntu/hscheema1979/ultrapilot/src/domain/UltraLeadClient.ts` - Main adapter
2. `/home/ubuntu/hscheema1979/ultrapilot/src/domain/UltraLeadClient.demo.ts` - Demo/test file
3. `/home/ubuntu/hscheema1979/ultrapilot/src/domain/ULTRALEADCLIENT-INTEGRATION.md` - This documentation

### Modified
1. `/home/ubuntu/hscheema1979/ultrapilot/src/domain/UltraLead.ts` - Integrated AgentMessageBus and ConnectionPool, resolved 3 TODOs

## Summary

Task 2.1a is **COMPLETE**. UltraLeadClient successfully bridges Ultra-Lead and AgentMessageBus, enabling Phases 2-5 execution with:

- WebSocket-based event subscription
- File-based plan monitoring
- Session management
- Progress reporting
- Database integration

The implementation follows the I/O contract specified in the plan and integrates seamlessly with existing components.
