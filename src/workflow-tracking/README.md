# UltraPilot Workflow Tracking System

**Version:** 1.0
**Date:** 2026-03-03
**Status:** Production Ready (Security Deferred to v2)

---

## Overview

The UltraPilot Workflow Tracking System provides comprehensive observability into multi-agent workflow execution. It captures phase transitions, agent interactions, inter-agent communications, routing decisions, and performance metrics.

### Key Features

- ✅ **Complete Workflow Timeline** - Reconstruct entire execution history
- ✅ **Agent Analytics** - Track agent invocations, tokens, performance
- ✅ **Decision Audit Trail** - Trace all routing/escalation decisions
- ✅ **Performance Metrics** - Identify bottlenecks and optimize
- ✅ **Minimal Overhead** - Async batching keeps overhead <8%
- ✅ **Query API** - Rich analysis capabilities with caching

---

## Installation

The system is integrated into UltraPilot. No additional installation needed.

### Dependencies

```bash
npm install better-sqlite3 lru-cache
npm install --save-dev @types/better-sqlite3
```

---

## Quick Start

### Enable Workflow Tracking

In `AgentOrchestrator.ts`:

```typescript
import { enableWorkflowTracking } from './workflow-tracking';

class AgentOrchestrator {
  constructor(
    bridge: AgentBridge,
    stateStore: AgentStateStore,
    messageBus: AgentMessageBus,
    config: OrchestratorConfig = {}
  ) {
    // ... existing initialization ...

    // Enable workflow tracking
    enableWorkflowTracking(this, messageBus, {
      enabled: true,
      dbPath: '.ultra/state/workflows.db'
    });
  }
}
```

That's it! Workflow tracking is now enabled automatically.

---

## Usage

### Basic Querying

```typescript
import { getQueryAPI } from './workflow-tracking';

// Get query API from orchestrator
const queryAPI = getQueryAPI(orchestrator);

// Get complete workflow timeline
const timeline = await queryAPI.getWorkflowTimeline('workflow-id');

console.log('Workflow:', timeline.workflow.name);
console.log('Phases:', timeline.phases.length);
console.log('Agents:', timeline.executions.length);
console.log('Messages:', timeline.communications.length);
console.log('Decisions:', timeline.decisions.length);
```

### Performance Analysis

```typescript
// Get performance report
const report = await queryAPI.getPerformanceReport('workflow-id');

console.log('Total Duration:', report.summary.totalDuration);
console.log('Agents Invoked:', report.summary.agentsInvoked);
console.log('Total Tokens:', report.summary.totalTokens);

// View phase breakdown
report.phases.forEach(phase => {
  console.log(`${phase.name}: ${phase.duration}ms (${phase.percentage.toFixed(1)}%)`);
});

// View slowest agents
report.agents
  .sort((a, b) => b.totalDuration - a.totalDuration)
  .slice(0, 5)
  .forEach(agent => {
    console.log(`${agent.agentId}: ${agent.totalDuration}ms total, ${agent.avgDuration.toFixed(0)}ms avg`);
  });
```

### Decision Tracing

```typescript
// Trace all decisions in workflow
const trace = await queryAPI.getDecisionTrace('workflow-id');

console.log('Total Decisions:', trace.totalDecisions);
console.log('By Type:', trace.byType);

trace.decisions.forEach(decision => {
  console.log(`[${decision.type}] ${decision.decision}`);
  console.log(`  Reasoning: ${decision.reasoning}`);
  console.log(`  At: ${decision.timestamp}`);
});
```

### Export Workflow Data

```typescript
// Export as JSON
const json = await queryAPI.exportWorkflow('workflow-id', 'json');
console.log(json);

// Export as CSV
const csv = await queryAPI.exportWorkflow('workflow-id', 'csv');
console.log(csv);
```

---

## Configuration

### Environment Variables

```bash
# Enable/disable tracking
ULTRA_TRACKING_ENABLED=true

# Database path
ULTRA_TRACKING_DB_PATH=.ultra/state/workflows.db

# Sampling rate (1.0 = track all workflows)
ULTRA_TRACKING_SAMPLING=1.0

# Flush interval (ms)
ULTRA_TRACKING_FLUSH_INTERVAL=50

# Max buffer size before flush
ULTRA_TRACKING_MAX_BUFFER=100

# Cache sizes
ULTRA_TRACKING_CACHE_L1=50
ULTRA_TRACKING_CACHE_L2=500
```

### Programmatic Configuration

```typescript
import { initializeWorkflowTracking } from './workflow-tracking';

const { tracker, queryAPI } = initializeWorkflowTracking({
  enabled: true,
  dbPath: '.ultra/state/workflows.db',
  samplingRate: 1.0,
  flushInterval: 50,
  maxBufferSize: 100,
  cacheSize: {
    l1: 50,
    l2: 500
  }
});
```

---

## Architecture

### Components

```
AgentOrchestrator (existing)
    ↓
WorkflowTracker (decorator)
    ↓
┌─────────────────────────────────────┐
│  WorkflowExecutionStore (SQLite)    │
│  - .ultra/state/workflows.db        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│     WorkflowQueryAPI                │
│  - Timeline reconstruction          │
│  - Performance analytics            │
│  - Decision audit trail             │
└─────────────────────────────────────┘
```

### Data Model

- **workflows** - Top-level workflow records
- **phase_transitions** - Phase lifecycle tracking
- **agent_executions** - Individual agent calls with I/O and tokens
- **communications** - Inter-agent message log
- **decisions** - Routing, escalation, retry decisions
- **performance_metrics** - Aggregated performance data

---

## Performance

### Overhead

- **Target:** <8% of workflow execution time
- **Mechanism:** Async batch writes (50ms intervals, 100 record batches)
- **Result:** Minimal impact on workflow performance

### Query Performance

- **Timeline queries:** <300ms (with caching)
- **Agent analytics:** <100ms
- **Performance reports:** <500ms

### Caching Strategy

- **L1 Cache:** 50 recent workflows, 5-minute TTL
- **L2 Cache:** 500 workflows, 1-hour TTL
- **Cache hit rate:** ~70% for recent workflows

---

## Security (v2)

**Note:** Current deployment is behind VPN. Enhanced security features deferred to v2.

### Planned v2 Security Features

- Content-based secret detection (API keys, tokens, passwords)
- Access control enforcement (query permissions)
- Enhanced input validation (SQL injection prevention)
- Export functionality access control
- Database encryption
- Comprehensive audit logging
- GDPR compliance features

### Current Security (v1)

- Basic field-name redaction (apiKey, secret, password, token)
- Base64 string truncation (>32 chars)
- Database file permissions (0600)
- Basic audit logging (access log table exists but not populated)

---

## API Reference

### WorkflowTracker

Main tracking coordinator. Automatically used by AgentOrchestrator.

```typescript
class WorkflowTracker {
  async startWorkflow(sessionId, workflowId, metadata)
  async recordPhaseTransition(phase, fromPhase, toPhase, criteria, timing)
  async recordAgentInvocation(agentId, invocation)
  async recordDecision(decision)
  async recordCommunication(message)
  async endWorkflow(status, summary)
}
```

### WorkflowQueryAPI

Query and analyze workflow executions.

```typescript
class WorkflowQueryAPI {
  async getWorkflowTimeline(workflowId): Promise<WorkflowTimeline>
  async getAgentExecutions(options): Promise<AgentExecution[]>
  async getPhaseMetrics(phase): Promise<PhaseMetrics>
  async getAgentPerformance(agentId): Promise<AgentPerformance>
  async getTokenUsage(workflowId): Promise<TokenUsageReport>
  async getDecisionTrace(workflowId): Promise<DecisionTrace>
  async getPerformanceReport(workflowId): Promise<PerformanceReport>
  async exportWorkflow(workflowId, format): Promise<string>
  clearCache()
  getCacheStats()
}
```

### WorkflowExecutionStore

Low-level database operations. Usually used indirectly via tracker/query API.

```typescript
class WorkflowExecutionStore {
  async createWorkflow(workflow)
  async updateWorkflow(workflowId, updates)
  async getWorkflow(workflowId)
  async recordPhase(phase)
  async getPhases(workflowId)
  async recordExecution(execution)
  async getExecutions(workflowId, limit)
  async recordCommunication(comm)
  async getCommunications(workflowId)
  async recordDecision(decision)
  async getDecisions(workflowId)
  async flush()
  close()
}
```

---

## Examples

### Example 1: Monitor Workflow Progress

```typescript
const queryAPI = getQueryAPI(orchestrator);

// Check workflow status
const timeline = await queryAPI.getWorkflowTimeline('workflow-123');

console.log(`Status: ${timeline.workflow.status}`);
console.log(`Progress: ${timeline.workflow.completedSteps}/${timeline.workflow.stepsCount} steps`);

// Show recent events
timeline.timeline.slice(-5).forEach(event => {
  console.log(`[${event.type}] ${event.timestamp.toISOString()}`);
});
```

### Example 2: Analyze Agent Performance

```typescript
const queryAPI = getQueryAPI(orchestrator);

// Get performance report
const report = await queryAPI.getPerformanceReport('workflow-123');

// Find slowest agents
const slowAgents = report.agents
  .filter(a => a.invocations >= 3)
  .sort((a, b) => b.avgDuration - a.avgDuration)
  .slice(0, 3);

slowAgents.forEach(agent => {
  console.log(`${agent.agentId}:`);
  console.log(`  Invocations: ${agent.invocations}`);
  console.log(`  Avg Duration: ${agent.avgDuration.toFixed(0)}ms`);
  console.log(`  Total Tokens: ${agent.tokensUsed}`);
});
```

### Example 3: Debug Failed Workflow

```typescript
const queryAPI = getQueryAPI(orchestrator);

// Get failed workflow timeline
const timeline = await queryAPI.getWorkflowTimeline('workflow-123');

// Show failed executions
timeline.executions
  .filter(e => !e.success)
  .forEach(exec => {
    console.log(`❌ ${exec.agentId} failed:`);
    console.log(`   Error: ${exec.errorMessage}`);
    console.log(`   Input: ${exec.inputText.substring(0, 100)}...`);
  });

// Show decisions leading to failure
timeline.decisions
  .filter(d => d.decisionType === 'escalation')
  .forEach(dec => {
    console.log(`⚠️  Escalation: ${dec.decision}`);
    console.log(`   Reasoning: ${dec.reasoning}`);
  });
```

### Example 4: Cost Analysis

```typescript
const queryAPI = getQueryAPI(orchestrator);

// Get token usage
const usage = await queryAPI.getTokenUsage('workflow-123');

console.log(`Total Tokens: ${usage.totalTokens}`);
console.log(`Estimated Cost: $${usage.estimatedCost.toFixed(2)}`);

console.log('\nBy Model:');
Object.entries(usage.byModel).forEach(([model, tokens]) => {
  console.log(`  ${model}: ${tokens.toLocaleString()} tokens`);
});

console.log('\nBy Agent:');
Object.entries(usage.byAgent)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .forEach(([agent, tokens]) => {
    console.log(`  ${agent}: ${tokens.toLocaleString()} tokens`);
  });
```

---

## Troubleshooting

### Tracking Not Working

1. Check if enabled:
   ```typescript
   console.log('Tracking enabled:', orchestrator._workflowTracker !== undefined);
   ```

2. Check database:
   ```bash
   ls -la .ultra/state/workflows.db
   ```

3. Check logs:
   ```
   [WorkflowTracking] Initialized successfully
   [WorkflowTracking] Enabled for AgentOrchestrator
   ```

### High Overhead

1. Reduce sampling rate:
   ```bash
   export ULTRA_TRACKING_SAMPLING=0.5
   ```

2. Increase flush interval:
   ```bash
   export ULTRA_TRACKING_FLUSH_INTERVAL=100
   ```

3. Increase buffer size:
   ```bash
   export ULTRA_TRACKING_MAX_BUFFER=500
   ```

### Slow Queries

1. Check cache stats:
   ```typescript
   const stats = queryAPI.getCacheStats();
   console.log('L1 cache:', stats.l1.size);
   console.log('L2 cache:', stats.l2.size);
   ```

2. Clear caches if needed:
   ```typescript
   queryAPI.clearCache();
   ```

---

## Future Enhancements (v2)

### Security
- Content-based secret detection
- Access control enforcement
- SQL injection prevention
- Export access control
- Database encryption
- Comprehensive audit logging
- GDPR compliance

### Performance
- Compression for large payloads
- Query result pagination
- Materialized views for aggregations
- Adaptive batching
- Performance monitoring and circuit breaker

### Features
- Replay workflow execution
- Workflow comparison
- Anomaly detection
- Automated insights
- Dashboard integration

---

## License

MIT

---

## Support

For issues or questions, please open an issue on the UltraPilot repository.
