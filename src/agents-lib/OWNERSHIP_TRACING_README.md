# File Ownership & Distributed Tracing

This document describes the **File Ownership Registry** and **Distributed Tracing Manager** - two critical components for parallel agent execution in the wshobson pattern.

## Overview

### File Ownership Registry

Prevents concurrent edits to the same file by multiple agents, implementing the core "wshobson pattern" for conflict-free parallel execution.

**Key Features:**
- Exclusive file ownership per agent
- Conflict detection before ownership transfer
- Automatic timeout-based cleanup
- Persistent state storage (JSON)
- Thread-safe operations with mutex

### Distributed Tracing Manager

Provides OpenTelemetry-compatible distributed tracing for correlating work across multiple agents and debugging complex workflows.

**Key Features:**
- UUID-based trace correlation
- Span lifecycle management
- Trace context propagation (baggage)
- OpenTelemetry export format
- Thread-safe operations with mutex

## File Ownership Registry

### Installation

```typescript
import { createOwnershipRegistry } from './ownership.js';

const registry = await createOwnershipRegistry('/tmp/ownership-state.json', {
  ownershipTimeout: 300000,  // 5 minutes
  autoCleanup: true,
  cleanupInterval: 60000,     // 1 minute
  persistState: true,
});
```

### Basic Usage

#### Claiming Ownership

```typescript
// Agent claims files it will modify
await registry.claimOwnership('agent-1', [
  '/project/src/auth.ts',
  '/project/src/auth/types.ts',
  '/project/src/auth/utils.ts',
]);

// Agent 2 tries to claim same file (fails with error)
try {
  await registry.claimOwnership('agent-2', ['/project/src/auth.ts']);
} catch (error) {
  console.error('File already owned:', error.message);
}
```

#### Validating Ownership

```typescript
// Check if agent can claim files (non-blocking)
const violations = await registry.validateOwnership('agent-2', [
  '/project/src/auth.ts',
  '/project/src/user/types.ts',
]);

if (violations.length > 0) {
  console.log('Cannot claim files:');
  violations.forEach(v => {
    console.log(`  ${v.filePath} owned by ${v.currentOwner}`);
  });
} else {
  // Safe to claim
  await registry.claimOwnership('agent-2', filePaths);
}
```

#### Checking Ownership

```typescript
// Check who owns a file
const owner = await registry.checkOwnership('/project/src/auth.ts');
if (owner) {
  console.log(`File owned by: ${owner}`);
} else {
  console.log('File is unowned');
}
```

#### Releasing Ownership

```typescript
// Agent releases files when done
await registry.releaseOwnership('agent-1', [
  '/project/src/auth.ts',
  '/project/src/auth/types.ts',
]);

// Other agents can now claim them
await registry.claimOwnership('agent-2', ['/project/src/auth.ts']);
```

#### Getting Owned Files

```typescript
// Get all files owned by an agent
const files = await registry.getOwnership('agent-1');
console.log(`Agent owns ${files.size} files:`);
files.forEach(file => console.log(`  ${file}`));
```

#### Statistics

```typescript
const stats = await registry.getStats();
console.log(`Total owned files: ${stats.totalFiles}`);
console.log(`Active agents: ${stats.activeAgents}`);
Object.entries(stats.agentsWithOwnership).forEach(([agent, count]) => {
  console.log(`  ${agent}: ${count} files`);
});
```

### Advanced Features

#### Automatic Timeout Cleanup

Files claimed by agents are automatically released after a timeout period (default: 5 minutes). This prevents deadlocks if an agent crashes.

```typescript
const registry = await createOwnershipRegistry('/tmp/state.json', {
  ownershipTimeout: 300000,  // 5 minutes
  autoCleanup: true,          // Auto-cleanup enabled
  cleanupInterval: 60000,     // Check every minute
});
```

#### Persistent State

Ownership state is automatically persisted to disk (JSON format). Survives process restarts.

```typescript
// State is persisted to /tmp/state.json
await registry.claimOwnership('agent-1', ['/project/src/file.ts']);

// Later, after restart...
const registry = await createOwnershipRegistry('/tmp/state.json');
const owner = await registry.checkOwnership('/project/src/file.ts');
console.log(owner);  // Still 'agent-1'
```

#### Manual Cleanup

```typescript
// Clear all ownership (useful for testing)
await registry.clearAll();

// Destroy registry and optionally delete state file
await registry.destroy(deleteStateFile = true);
```

## Distributed Tracing Manager

### Installation

```typescript
import { createTraceManager } from './tracing.js';

const tracer = createTraceManager({
  maxTraces: 1000,
  maxSpansPerTrace: 1000,
  autoCompleteTraces: true,
});
```

### Basic Usage

#### Creating Traces

```typescript
// Create a root trace
const trace = tracer.createTrace(undefined, 'parallel-workflow');
console.log(`Trace ID: ${trace.traceId}`);
console.log(`Root Span ID: ${trace.spanId}`);
```

#### Creating Spans

```typescript
// Start a span
const span = tracer.startSpan(trace.traceId, 'agent-delegation');

// Add metadata
span.metadata['agent'] = 'business-analyst';
span.metadata['task'] = 'analyze-requirements';
span.metadata['confidence'] = 0.95;

// Log events
tracer.logEvent(span, 'agent-discovered', {
  agentName: 'business-analyst',
  confidence: 0.95,
});

tracer.logEvent(span, 'execution-started', {
  taskId: 'task-123',
});

// End span
tracer.endSpan(span);
```

#### Error Handling

```typescript
const span = tracer.startSpan(trace.traceId, 'risky-operation');

try {
  // Do work...
  await performOperation();
  span.status = 'completed';
} catch (error) {
  span.status = 'error';
  span.error = error instanceof Error ? error.message : String(error);
  span.stackTrace = error instanceof Error ? error.stack : undefined;
} finally {
  tracer.endSpan(span);
}
```

#### Nested Spans

```typescript
// Parent span
const parentSpan = tracer.startSpan(trace.traceId, 'orchestrator-workflow');

// Child span (nested)
const childSpan = tracer.startSpan(
  trace.traceId,
  'agent-execution',
  parentSpan.spanId  // Links to parent
);

// End child first
tracer.endSpan(childSpan);

// Then end parent
tracer.endSpan(parentSpan);
```

### Trace Context Propagation

#### Baggage (Metadata Propagation)

```typescript
// Root trace with baggage
const rootTrace = tracer.createTrace(undefined, 'workflow');
rootTrace.baggage.set('workflow-id', 'parallel-task-123');
rootTrace.baggage.set('priority', 'high');

// Child trace inherits baggage
const childTrace = tracer.createTrace(rootTrace.traceId, 'subtask');
console.log(childTrace.baggage.get('workflow-id'));  // 'parallel-task-123'
console.log(childTrace.baggage.get('priority'));     // 'high'

// Child can add its own baggage
childTrace.baggage.set('agent', 'business-analyst');
```

#### Trace Chaining

```typescript
// Create parent trace
const parentTrace = tracer.createTrace(undefined, 'parent-workflow');

// Create child trace linked to parent
const childTrace = tracer.createTrace(parentTrace.traceId, 'child-workflow');
console.log(childTrace.parentSpanId);  // Matches parentTrace.traceId
```

### Querying Traces

#### Getting a Trace

```typescript
const trace = tracer.getTrace(traceId);
if (trace) {
  console.log(`Trace has ${trace.spans.length} spans`);
  console.log(`Duration: ${trace.duration}ms`);
}
```

#### Getting Active Traces

```typescript
const activeTraces = tracer.getActiveTraces();
console.log(`Active traces: ${activeTraces.length}`);
```

#### Statistics

```typescript
const stats = await tracer.getStats();
console.log(`Total traces: ${stats.totalTraces}`);
console.log(`Active traces: ${stats.activeTraces}`);
console.log(`Completed traces: ${stats.completedTraces}`);
console.log(`Total spans: ${stats.totalSpans}`);
console.log(`Active spans: ${stats.activeSpans}`);
console.log(`Avg spans per trace: ${stats.avgSpansPerTrace.toFixed(2)}`);
```

### OpenTelemetry Export

Export traces in OpenTelemetry format for observability platforms (Jaeger, Honeycomb, Datadog, etc.).

```typescript
const otelExport = tracer.exportTrace(traceId);

// Send to OpenTelemetry collector
await fetch('https://otel-collector:4318/v1/traces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(otelExport),
});
```

#### Export Structure

```typescript
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": {
          "service.name": "ultrapilot",
          "service.version": "1.0.0"
        }
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "wshobson-tracer",
            "version": "1.0.0"
          },
          "spans": [
            {
              "traceId": "...",  // 16-byte hex
              "spanId": "...",   // 8-byte hex
              "name": "agent-delegation",
              "kind": "INTERNAL",
              "startTimeUnixNano": "...",
              "endTimeUnixNano": "...",
              "attributes": { ... },
              "status": { "code": 1 },
              "events": [ ... ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Maintenance

#### Pruning Old Traces

```typescript
// Prune traces completed more than 1 hour ago
const hourAgo = Date.now() - 3600000;
const pruned = await tracer.pruneOldTraces(hourAgo);
console.log(`Pruned ${pruned} old traces`);
```

#### Clearing All Traces

```typescript
await tracer.clearAll();
```

## Integration Example: Parallel Agent Execution

```typescript
import { createOwnershipRegistry } from './ownership.js';
import { createTraceManager } from './tracing.js';

// Initialize
const registry = await createOwnershipRegistry('/tmp/ownership.json');
const tracer = createTraceManager();

// Create workflow trace
const trace = tracer.createTrace(undefined, 'parallel-feature-development');
trace.baggage.set('feature', 'user-authentication');

// Agent 1: Authentication module
const agent1Span = tracer.startSpan(trace.traceId, 'agent-1-work');
await registry.claimOwnership('agent-1', [
  '/project/src/auth/index.ts',
  '/project/src/auth/types.ts',
]);

// Agent 1 does work...
tracer.logEvent(agent1Span, 'ownership-acquired', {
  files: 2,
  agent: 'agent-1',
});

// Agent 2: User management (non-conflicting files)
const agent2Span = tracer.startSpan(trace.traceId, 'agent-2-work');
await registry.claimOwnership('agent-2', [
  '/project/src/user/index.ts',
  '/project/src/user/types.ts',
]);

// Agent 2 does work...
tracer.logEvent(agent2Span, 'ownership-acquired', {
  files: 2,
  agent: 'agent-2',
});

// Both agents complete
tracer.endSpan(agent1Span);
tracer.endSpan(agent2Span);

// Release ownership
await registry.releaseOwnership('agent-1', [
  '/project/src/auth/index.ts',
  '/project/src/auth/types.ts',
]);

await registry.releaseOwnership('agent-2', [
  '/project/src/user/index.ts',
  '/project/src/user/types.ts',
]);

// Export trace for observability
const otelExport = tracer.exportTrace(trace.traceId);
```

## API Reference

### FileOwnershipRegistry

#### Constructor
```typescript
new FileOwnershipRegistry(statePath: string, options?: OwnershipRegistryOptions)
```

#### Methods
- `initialize(): Promise<void>` - Load persisted state
- `claimOwnership(agentId: string, filePaths: string[]): Promise<void>` - Claim files
- `checkOwnership(filePath: string): Promise<string | null>` - Check owner
- `releaseOwnership(agentId: string, filePaths: string[]): Promise<void>` - Release files
- `validateOwnership(agentId: string, filePaths: string[]): Promise<OwnershipViolation[]>` - Validate
- `getOwnership(agentId: string): Promise<Set<string>>` - Get owned files
- `clearAll(): Promise<void>` - Clear all ownership
- `getStats(): Promise<object>` - Get statistics
- `destroy(deleteStateFile?: boolean): Promise<void>` - Cleanup

### TraceManager

#### Constructor
```typescript
new TraceManager(options?: TraceManagerOptions)
```

#### Methods
- `createTrace(parentId?: string, name?: string): TraceContext` - Create trace
- `startSpan(traceId: string, name: string, parentSpanId?: string): Span` - Start span
- `endSpan(span: Span): void` - End span
- `logEvent(span: Span, name: string, attributes: object): void` - Log event
- `getTrace(traceId: string): Trace | null` - Get trace
- `getActiveTraces(): Trace[]` - Get active traces
- `exportTrace(traceId: string): object` - Export to OpenTelemetry
- `getStats(): Promise<object>` - Get statistics
- `clearAll(): Promise<void>` - Clear all traces
- `pruneOldTraces(olderThan: number): Promise<number>` - Prune old traces

## Best Practices

### File Ownership

1. **Always validate before claiming**: Use `validateOwnership()` to check for conflicts
2. **Release when done**: Always release ownership after completing work
3. **Use timeouts**: Set appropriate timeout based on task complexity
4. **Handle conflicts gracefully**: Check violations and either wait or choose different files
5. **Normalize paths**: Ensure consistent path formats (absolute paths recommended)

### Distributed Tracing

1. **Create meaningful span names**: Use descriptive operation names (e.g., 'agent-execution', 'file-write')
2. **Log key events**: Log important milestones (agent-discovered, ownership-acquired, etc.)
3. **Use baggage for propagation**: Propagate workflow context via baggage
4. **Export regularly**: Send traces to observability platform for analysis
5. **Prune old traces**: Regularly prune completed traces to manage memory

## Performance Considerations

### File Ownership Registry

- **Thread-safe**: All operations are mutex-protected
- **Persistent**: State is saved to disk on every modification
- **Auto-cleanup**: Automatic timeout cleanup prevents state bloat

### Distributed Tracing Manager

- **In-memory**: Traces are stored in memory (use pruning for long-running processes)
- **Max limits**: Enforce maximum traces and spans to prevent memory issues
- **Efficient iteration**: Uses Array.from() for ES5 compatibility

## Troubleshooting

### File Ownership Issues

**Problem**: Agent can't claim files
```typescript
// Check for conflicts
const violations = await registry.validateOwnership(agentId, filePaths);
console.log('Conflicts:', violations);
```

**Problem**: Ownership not persisting
```typescript
// Check if persistState is enabled
const registry = await createOwnershipRegistry(path, {
  persistState: true,
});

// Check file permissions on statePath
```

### Tracing Issues

**Problem**: Traces not completing
```typescript
// Check if autoCompleteTraces is enabled
const tracer = createTraceManager({
  autoCompleteTraces: true,
});

// Manually end all spans
span.status = 'completed';
tracer.endSpan(span);
```

**Problem**: Memory usage growing
```typescript
// Prune old traces regularly
const hourAgo = Date.now() - 3600000;
await tracer.pruneOldTraces(hourAgo);

// Reduce max traces
const tracer = createTraceManager({ maxTraces: 100 });
```

## See Also

- `ownership.ts` - File ownership implementation
- `tracing.ts` - Distributed tracing implementation
- `ownership-tracing-demo.ts` - Comprehensive usage examples
- `delegator.ts` - Integration with agent delegation
- `types.ts` - Type definitions

## License

MIT
