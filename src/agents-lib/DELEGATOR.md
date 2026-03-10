# WshobsonDelegator Documentation

## Overview

The `WshobsonDelegator` class provides a high-level interface for delegating tasks to wshobson agents. It handles agent discovery, task execution, timeout management, and result tracking.

## Key Features

- **Agent Discovery**: Uses `IAgentRepository` to find agents by name
- **Smart Retry**: Built-in retry logic with exponential backoff
- **Timeout Management**: Configurable timeouts per delegation
- **Cancellation Support**: Cancel active delegations by trace ID
- **Error Handling**: Comprehensive error categorization with retry hints
- **Metrics Tracking**: Automatic success rate tracking
- **Distributed Tracing**: Trace ID support for workflow correlation
- **File Ownership**: File ownership contract enforcement (prepared)

## Installation

```typescript
import { WshobsonDelegator } from './wshobson/delegator.js';
import { InMemoryAgentRepository } from './wshobson/repositories/in-memory.js';
```

## Basic Usage

### Creating a Delegator

```typescript
// Create repository
const repository = new InMemoryAgentRepository();
await repository.initialize('/path/to/plugins');

// Create delegator with 30s default timeout
const delegator = new WshobsonDelegator(repository, 30000);
```

### Simple Delegation

```typescript
const result = await delegator.delegateToAgent(
  'business-analyst',
  'Analyze the requirements for the new feature'
);

if (result.success) {
  console.log(`Output: ${result.output}`);
  console.log(`Duration: ${result.duration}ms`);
} else {
  console.error(`Error: ${result.error?.message}`);
}
```

## Advanced Usage

### Delegation with Context

```typescript
const context: DelegationContext = {
  workspacePath: '/home/user/project',
  traceId: 'auth-analysis-001',
  timeout: 30000,
  metadata: {
    priority: 'high',
    owner: 'orchestrator',
    tags: ['security', 'authentication'],
  },
  fileOwnership: {
    ownedPaths: ['/home/user/project/src/auth/'],
    readOnlyPaths: ['/home/user/project/src/core/'],
    transferOnCompletion: true,
  },
};

const result = await delegator.delegateToAgent(
  'security-auditor',
  'Review the authentication module',
  context
);
```

### Delegation with Custom Retry

```typescript
const result = await delegator.delegateToAgent(
  'data-analyst',
  'Analyze sales trends',
  undefined,  // No context
  {
    timeout: 15000,
    retry: {
      maxAttempts: 5,
      baseDelay: 1000,
      exponentialBackoff: true,
    },
    updateAgentStats: true,
  }
);
```

### Parallel Delegations

```typescript
// Run multiple delegations in parallel
const tasks = [
  delegator.delegateToAgent('business-analyst', 'Analyze requirements'),
  delegator.delegateToAgent('security-auditor', 'Review security'),
  delegator.delegateToAgent('performance-expert', 'Optimize performance'),
];

const results = await Promise.all(tasks);

results.forEach((result, index) => {
  console.log(`${index + 1}. ${result.agentName}: ${result.success ? '✓' : '✗'}`);
});
```

### Cancellation

```typescript
const context: DelegationContext = {
  traceId: 'long-running-001',
  timeout: 60000,
};

// Start task
const taskPromise = delegator.delegateToAgent(
  'code-generator',
  'Generate REST API',
  context
);

// Cancel after 2 seconds
setTimeout(() => {
  delegator.cancelDelegation(context.traceId!);
}, 2000);

const result = await taskPromise;
console.log(`Cancelled: ${result.error?.code === 'CANCELLED'}`);
```

## API Reference

### `WshobsonDelegator`

#### Constructor

```typescript
constructor(repository: IAgentRepository, defaultTimeout?: number)
```

- `repository`: Agent repository for discovering agents
- `defaultTimeout`: Default timeout in milliseconds (default: 60000)

#### Methods

##### `delegateToAgent()`

```typescript
async delegateToAgent(
  agentName: string,
  task: string,
  context?: DelegationContext,
  options?: DelegationOptions
): Promise<DelegationResult>
```

Delegates a task to an agent.

**Parameters:**
- `agentName`: Name of the agent (e.g., 'business-analyst')
- `task`: Task description or prompt
- `context`: Optional delegation context
- `options`: Optional delegation options

**Returns:** Promise resolving to `DelegationResult`

##### `cancelDelegation()`

```typescript
cancelDelegation(traceId: string): boolean
```

Cancels an active delegation by trace ID.

**Returns:** `true` if cancelled, `false` if not found

##### `cancelAllDelegations()`

```typescript
cancelAllDelegations(): void
```

Cancels all active delegations.

##### `getActiveDelegationCount()`

```typescript
getActiveDelegationCount(): number
```

Returns the number of active delegations.

## Types

### `DelegationContext`

```typescript
interface DelegationContext {
  workspacePath?: string;
  traceId?: string;
  timeout?: number;
  metadata?: Record<string, any>;
  fileOwnership?: {
    ownedPaths: string[];
    readOnlyPaths: string[];
    transferOnCompletion: boolean;
  };
  parentSpanId?: string;
  onProgress?: (update: ProgressUpdate) => void;
}
```

### `DelegationResult`

```typescript
interface DelegationResult {
  success: boolean;
  output?: string;
  error?: DelegationError;
  duration: number;
  agentName: string;
  confidence?: number;
  traceId?: string;
  metadata?: {
    modifiedFiles?: string[];
    readFiles?: string[];
    capabilitiesUsed?: string[];
  };
}
```

### `DelegationError`

```typescript
interface DelegationError {
  code: 'AGENT_NOT_FOUND' | 'TIMEOUT' | 'EXECUTION_ERROR' | 'CANCELLED' | 'VALIDATION_ERROR';
  message: string;
  stack?: string;
  details?: Record<string, any>;
  retryable: boolean;
  retryDelay?: number;
}
```

### `DelegationOptions`

```typescript
interface DelegationOptions {
  timeout?: number;
  waitForCompletion?: boolean;
  retry?: {
    maxAttempts: number;
    baseDelay: number;
    exponentialBackoff: boolean;
  };
  updateAgentStats?: boolean;
}
```

## Error Handling

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `AGENT_NOT_FOUND` | Agent not in repository | No |
| `TIMEOUT` | Execution exceeded timeout | Yes |
| `EXECUTION_ERROR` | Agent execution failed | Yes |
| `CANCELLED` | Delegation was cancelled | No |
| `VALIDATION_ERROR` | Invalid request format | No |

### Error Handling Example

```typescript
const result = await delegator.delegateToAgent('agent-name', 'task');

if (!result.success) {
  switch (result.error?.code) {
    case 'AGENT_NOT_FOUND':
      console.log('Check agent name or scan plugins');
      break;
    case 'TIMEOUT':
      console.log('Increase timeout or simplify task');
      break;
    case 'EXECUTION_ERROR':
      if (result.error.retryable) {
        console.log(`Retry after ${result.error.retryDelay}ms`);
      }
      break;
    case 'CANCELLED':
      console.log('Task was cancelled');
      break;
    case 'VALIDATION_ERROR':
      console.log('Fix request format');
      break;
  }
}
```

## Integration with Claude Code Skills

### Current State

The delegator currently includes a **placeholder** implementation for skill invocation. The actual integration with Claude Code's skill system will be implemented in a separate integration layer.

### Integration Point

The integration point is in the `executeAgent()` method:

```typescript
private async executeAgent(
  agent: Agent,
  task: string,
  context: DelegationContext | undefined,
  timeout: number,
  signal: AbortSignal,
  startTime: number,
  traceId: string
): Promise<DelegationResult>
```

### Expected Integration Pattern

When integrating with Claude Code's skill system:

```typescript
// Build skill name from agent plugin and name
const skillName = `${agent.plugin}:${agent.name}`;

// Invoke skill via Claude Code
const skillResult = await invokeSkill(skillName, task, {
  workspace: context?.workspacePath,
  timeout,
  signal,
  metadata: context?.metadata
});

// Transform skill result to delegation result
return {
  success: true,
  output: skillResult.output,
  duration: Date.now() - startTime,
  agentName: agent.name,
  traceId,
  confidence: agent.capabilities[0]?.confidence || 0.5,
  metadata: {
    modifiedFiles: skillResult.filesModified,
    readFiles: skillResult.filesRead,
    capabilitiesUsed: skillResult.capabilitiesUsed
  }
};
```

## Circuit Breaker Integration

The delegator includes hooks for circuit breaker integration:

```typescript
private async checkCircuitBreaker(agentName: string): Promise<'closed' | 'open' | 'half-open'>
```

Currently returns `'closed'` (allow requests). The actual implementation will:
1. Check repository's circuit breaker state
2. Return `'open'` to block requests to failing agents
3. Return `'half-open'` to allow test requests
4. Return `'closed'` for normal operation

## Agent Statistics

The delegator automatically updates agent statistics after each delegation:

- **Success Rate**: Exponential moving average (α=0.1)
- **Last Used**: Timestamp of last delegation
- **Status**: Updated to `'idle'` or `'failed'`

This information is used by the repository for:
- Smart agent selection
- Load balancing
- Circuit breaker decisions

## Best Practices

### 1. Always Handle Errors

```typescript
const result = await delegator.delegateToAgent(...);
if (!result.success) {
  // Handle error appropriately
}
```

### 2. Use Trace IDs for Workflows

```typescript
const traceId = `workflow-${workflowId}-${Date.now()}`;
const context = { traceId };
```

### 3. Set Appropriate Timeouts

```typescript
// Quick tasks: 5-10s
const quickResult = await delegator.delegateToAgent(agent, task, undefined, { timeout: 10000 });

// Long tasks: 60-120s
const longResult = await delegator.delegateToAgent(agent, task, undefined, { timeout: 120000 });
```

### 4. Configure Retry for Unreliable Agents

```typescript
const result = await delegator.delegateToAgent(
  'unstable-agent',
  task,
  undefined,
  {
    retry: {
      maxAttempts: 5,
      baseDelay: 2000,
      exponentialBackoff: true,
    }
  }
);
```

### 5. Use File Ownership for Parallel Work

```typescript
const context = {
  fileOwnership: {
    ownedPaths: [`/project/${agentId}/`],
    readOnlyPaths: ['/project/shared/'],
    transferOnCompletion: true,
  },
};
```

## Examples

See `delegator-demo.ts` for complete examples of:
- Basic delegation
- Delegation with context
- Delegation with retry
- Cancellation
- Parallel delegations
- Error handling

## Future Enhancements

- [ ] Actual Claude Code skill integration
- [ ] Circuit breaker implementation
- [ ] Progress callbacks during execution
- [ ] Delegation history and audit log
- [ ] Metrics dashboard integration
- [ ] Webhook notifications for long-running tasks
- [ ] Batch delegation support
- [ ] Priority queues for delegations
