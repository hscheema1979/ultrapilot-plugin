# Delegation Interface Quick Start Guide

## Overview

The Phase 2 delegation layer enables UltraPilot orchestrators to invoke wshobson specialist agents with proper ownership, tracing, and error handling.

## Basic Usage

### 1. Import the Delegator

```typescript
import { WshobsonDelegator } from './wshobson/delegator.js';
import { IAgentRepository } from './wshobson/types.js';
```

### 2. Create Delegator Instance

```typescript
const delegator = new WshobsonDelegator(repository);
```

### 3. Delegate to a Single Agent

```typescript
const result = await delegator.delegate({
  agent: 'business-analyst',
  task: 'Extract requirements for OAuth2 authentication system',
  trace: {
    traceId: 'abc-123',
    spanId: 'span-1',
    baggage: new Map([
      ['session-id', 'my-session'],
      ['user-id', 'user-123']
    ])
  },
  ownership: {
    ownedPaths: ['/src/auth'],
    readOnlyPaths: ['/docs'],
    transferOnCompletion: true
  },
  timeout: 5 * 60 * 1000 // 5 minutes (optional)
});

if (result.success) {
  console.log('Result:', result.result);
} else {
  console.error('Error:', result.error);
}
```

### 4. Delegate to Multiple Agents in Parallel

```typescript
const results = await delegator.delegateParallel({
  agents: ['business-analyst', 'api-designer', 'typescript-expert'],
  tasks: [
    'Extract requirements',
    'Design API endpoints',
    'Implement TypeScript types'
  ],
  trace: {
    traceId: 'abc-123',
    spanId: 'span-1',
    baggage: new Map()
  },
  ownership: {
    ownedPaths: ['/src'],
    readOnlyPaths: ['/docs'],
    transferOnCompletion: false
  }
});

// Access individual results
const businessResult = results.get('business-analyst');
const apiResult = results.get('api-designer');
const typescriptResult = results.get('typescript-expert');

// All results
for (const [agent, result] of results) {
  console.log(`${agent}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
}
```

### 5. Delegate with Fallback

```typescript
const result = await delegator.delegateWithFallback({
  task: 'Design REST API for task management',
  requiredCapabilities: ['api-design', 'rest'],
  trace: {
    traceId: 'abc-123',
    spanId: 'span-1',
    baggage: new Map()
  },
  ownership: {
    ownedPaths: ['/src/api'],
    readOnlyPaths: [],
    transferOnCompletion: true
  },
  // Optional: explicit fallback chain
  fallbackChain: ['api-designer', 'backend-architect', 'fullstack-developer']
});

if (result.success) {
  console.log(`Successfully delegated to: ${result.agent}`);
}
```

## File Ownership Rules

### Define Ownership

```typescript
const ownership = {
  // Paths the worker agent can modify
  ownedPaths: ['/src/feature-x', '/tests/feature-x'],

  // Paths the worker can read but not modify
  readOnlyPaths: ['/docs', '/src/shared'],

  // Should ownership transfer back to orchestrator on completion?
  transferOnCompletion: true
};
```

### Best Practices

1. **Be Specific**: Own only the paths you need to modify
2. **Use Read-Only**: Mark shared paths as read-only to prevent conflicts
3. **Transfer Back**: Set `transferOnCompletion: true` for proper cleanup
4. **Absolute Paths**: Always use absolute paths (not relative)

## Distributed Tracing

### Create Root Trace

```typescript
import { TraceManager } from './wshobson/tracing.js';

const traceManager = new TraceManager();
const trace = traceManager.createTrace('ultra:analyst-session');
```

### Create Child Spans

```typescript
const childSpanId = traceManager.createSpan(trace, 'delegate-to-business-analyst');
// ... perform delegation ...
traceManager.endSpan(trace, childSpanId, true);
```

### Add Baggage

```typescript
traceManager.setBaggage(trace, 'agent-name', 'business-analyst');
traceManager.setBaggage(trace, 'task-id', 'task-123');

// Retrieve baggage
const agentName = traceManager.getBaggage(trace, 'agent-name');
```

### Generate Trace Report

```typescript
const report = traceManager.generateTraceReport(trace.traceId);
console.log(report);
```

**Output**:
```
=== Trace Report: abc-123 ===

Spans:
- [span-1] ultra:analyst-session (✓) 250ms
  - [span-2] delegate-to-business-analyst (✓) 150ms

Logs:
  [2025-03-08T10:30:00.000Z] [INFO ] [span-1] Started: ultra:analyst-session
  [2025-03-08T10:30:00.100Z] [INFO ] [span-2] Started: delegate-to-business-analyst
  [2025-03-08T10:30:00.250Z] [INFO ] [span-2] Ended: delegate-to-business-analyst ✓ (150ms)
  [2025-03-08T10:30:00.250Z] [INFO ] [span-1] Ended: ultra:analyst-session ✓ (250ms)

Statistics:
  Total duration: 250ms
  Spans: 2 (✓ 2, ✗ 0, active 0)
  Logs: 4

==================================================
```

## Error Handling

### Delegation Errors

```typescript
import { DelegationError, ErrorCode } from './wshobson/errors.js';

try {
  const result = await delegator.delegate({ /* ... */ });
} catch (error) {
  if (error instanceof DelegationError) {
    console.error(`Error code: ${error.code}`);
    console.error(`Retryable: ${error.retryable}`);
    console.error(`Attempt: ${error.attempt}`);
    console.error(`Telemetry:`, error.telemetry);
  }
}
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `RETRY` | Transient failure (network, timeout) | ✅ Yes |
| `FATAL` | Permanent failure (invalid agent) | ❌ No |
| `TIMEOUT` | Operation timed out | ✅ Yes |
| `VALIDATION` | Invalid input or ownership violation | ❌ No |
| `EXECUTION` | Agent invocation failed | ❌ No |
| `CIRCUIT_BREAKER` | Circuit breaker is open | ❌ No |

### Circuit Breaker

```typescript
import { ErrorHandler } from './wshobson/errors.js';

const errorHandler = new ErrorHandler();

// Execute with circuit breaker protection
const result = await errorHandler.withCircuitBreaker(
  'business-analyst',
  async () => {
    // Delegation logic here
    return await delegator.delegate({ /* ... */ });
  }
);
```

## Workspace Context

### Create Context

```typescript
import { WorkspaceContext } from './wshobson/context.js';

const context = await WorkspaceContext.create(ownership, trace);
```

### Access Context Information

```typescript
// Environment
const env = context.getEnvironment();
console.log(`CWD: ${env.cwd}`);
console.log(`Platform: ${env.platform}`);
console.log(`Node: ${env.nodeVersion}`);

// Git
const git = context.getGitInfo();
console.log(`Branch: ${git.branch}`);
console.log(`Commit: ${git.commit}`);
console.log(`Has changes: ${git.hasChanges}`);
```

### Context Helpers

```typescript
// Check if in git repo
if (context.isInGitRepo()) {
  console.log(`Git branch: ${context.getGitBranch()}`);
}

// Get environment variable
const path = context.getEnv('PATH');

// Create child context
const childContext = context.createChild('new-span-id');
```

## Performance Tips

### 1. Reuse Delegator Instances

```typescript
// Good: Create once, reuse
const delegator = new WshobsonDelegator(repository);

for (const task of tasks) {
  await delegator.delegate({ /* ... */ });
}
```

### 2. Use Parallel Delegation

```typescript
// Good: Parallel delegation
const results = await delegator.delegateParallel({
  agents: ['agent-1', 'agent-2', 'agent-3'],
  tasks: ['task-1', 'task-2', 'task-3'],
  trace,
  ownership
});

// Bad: Sequential delegation
for (let i = 0; i < agents.length; i++) {
  await delegator.delegate({
    agent: agents[i],
    task: tasks[i],
    trace,
    ownership
  });
}
```

### 3. Set Appropriate Timeouts

```typescript
// Good: Reasonable timeout
await delegator.delegate({
  /* ... */,
  timeout: 5 * 60 * 1000 // 5 minutes
});

// Bad: Too short (may timeout legit work)
await delegator.delegate({
  /* ... */,
  timeout: 1000 // 1 second
});

// Bad: Too long (hangs too long on failure)
await delegator.delegate({
  /* ... */,
  timeout: 60 * 60 * 1000 // 1 hour
});
```

### 4. Use Transfer on Completion

```typescript
// Good: Transfer ownership back
await delegator.delegate({
  /* ... */,
  ownership: {
    ownedPaths: ['/src/feature'],
    readOnlyPaths: [],
    transferOnCompletion: true  // ✅ Transfer back
  }
});
```

## Testing

### Run Tests

```bash
# Run all tests
npm test -- src/wshobson/__tests__/delegation.test.ts

# Run specific test suite
npm test -- src/wshobson/__tests__/delegation.test.ts -t "File Ownership"

# Run with coverage
npm test -- src/wshobson/__tests__/delegation.test.ts --coverage
```

### Test Runner

```bash
# Run all tests
node src/wshobson/__tests__/run-tests.ts

# Run specific tests
node src/wshobson/__tests__/run-tests.ts --filter "delegation"

# Run benchmarks
node src/wshobson/__tests__/run-tests.ts --benchmark
```

## Troubleshooting

### Issue: Ownership Violation

**Error**: `Ownership validation failed: /src/feature is already owned by agent-1`

**Solution**:
1. Check if another agent owns the path
2. Wait for that agent to complete
3. Use a different path
4. Set `transferOnCompletion: true` on the first delegation

### Issue: Agent Not Found

**Error**: `Agent not found: xyz-agent`

**Solution**:
1. Check if agent exists in repository
2. Run `ultra-discover-agents` to refresh registry
3. Verify agent name spelling
4. Use `delegateWithFallback()` for automatic selection

### Issue: Timeout

**Error**: `Operation timed out after 5000ms`

**Solution**:
1. Increase timeout value
2. Check if agent is stuck (infinite loop)
3. Break task into smaller subtasks
4. Use circuit breaker to prevent cascading failures

### Issue: Circuit Breaker Open

**Error**: `Circuit breaker is open for agent business-analyst`

**Solution**:
1. Wait for cooldown period (default: 60s)
2. Check why agent is failing (logs, telemetry)
3. Fix underlying issue
4. Circuit will auto-close after cooldown

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Delegation latency | <500ms | `result.duration` |
| Parallel delegation (3 agents) | <2s | `Date.now() - startTime` |
| Success rate | 99.9% | Run 1000 delegations, count successes |
| Cold start | <2s | Time from process start to first delegation |
| Warm start | <100ms | Time between delegations (cached) |

## Examples

### Example 1: Simple Delegation

```typescript
const result = await delegator.delegate({
  agent: 'business-analyst',
  task: 'Extract requirements for OAuth2',
  trace: traceManager.createTrace('oauth2-requirements'),
  ownership: {
    ownedPaths: ['/docs/requirements'],
    readOnlyPaths: [],
    transferOnCompletion: true
  }
});

console.log(result.success ? '✅ Success' : '❌ Failed');
console.log(`Duration: ${result.duration}ms`);
```

### Example 2: Parallel Delegation with Results

```typescript
const trace = traceManager.createTrace('api-development');

// Phase 1: Requirements & Design (parallel)
const phase1 = await delegator.delegateParallel({
  agents: ['business-analyst', 'api-designer'],
  tasks: ['Extract requirements', 'Design API endpoints'],
  trace,
  ownership: {
    ownedPaths: ['/docs/requirements', '/src/api'],
    readOnlyPaths: [],
    transferOnCompletion: false
  }
});

// Phase 2: Implementation (after Phase 1 completes)
if (phase1.get('business-analyst')?.success && phase1.get('api-designer')?.success) {
  const phase2 = await delegator.delegate({
    agent: 'typescript-expert',
    task: 'Implement TypeScript types',
    trace: { ...trace, spanId: traceManager.createSpan(trace, 'implementation') },
    ownership: {
      ownedPaths: ['/src/api/types'],
      readOnlyPaths: ['/docs/requirements'],
      transferOnCompletion: true
    }
  });

  console.log('API development complete!');
}
```

### Example 3: Fallback with Capabilities

```typescript
const result = await delegator.delegateWithFallback({
  task: 'Implement secure authentication flow',
  requiredCapabilities: ['security', 'authentication', 'typescript'],
  trace: traceManager.createTrace('auth-implementation'),
  ownership: {
    ownedPaths: ['/src/auth'],
    readOnlyPaths: ['/docs'],
    transferOnCompletion: true
  }
});

if (result.success) {
  console.log(`Successfully implemented by: ${result.agent}`);
} else {
  console.error('All authentication specialists failed:', result.error);
}
```

## Resources

- **Phase 2 Completion Report**: `src/wshobson/PHASE2-COMPLETION-REPORT.md`
- **Integration Plan**: `/home/ubuntu/.claude/plans/wshobson-integration-plan-v2.md`
- **Type Definitions**: `src/wshobson/types.ts`
- **Test Suite**: `src/wshobson/__tests__/delegation.test.ts`

## Support

For issues or questions:
1. Check the test suite for examples
2. Review the Phase 2 completion report
3. Consult the integration plan
4. Check trace reports for debugging

---

**Happy Delegating! 🚀**
