# WshobsonDelegator Architecture

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application Layer                        │
│  (Ultrapilot Orchestrator, CLI, or Custom Workflow)             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ delegateToAgent()
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WshobsonDelegator                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Public API                                                │  │
│  │ - delegateToAgent()                                       │  │
│  │ - cancelDelegation()                                      │  │
│  │ - getActiveDelegationCount()                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 1: Agent Discovery                                  │  │
│  │ - repository.getAgent(name)                               │  │
│  │ - Validate agent exists                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 2: Request Validation                               │  │
│  │ - Validate task content                                   │  │
│  │ - Validate file ownership contracts                       │  │
│  │ - Check timeout values                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 3: Circuit Breaker Check                            │  │
│  │ - Check agent circuit breaker state                       │  │
│  │ - Block if open, allow if closed/half-open                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 4: Execution with Retry                             │  │
│  │ - Execute with exponential backoff                        │  │
│  │ - Handle timeout and cancellation                         │  │
│  │ - Track retry attempts                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 5: Statistics Update                                │  │
│  │ - Update agent success rate (EMA)                         │  │
│  │ - Update last used timestamp                              │  │
│  │ - Update agent status                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ query & update
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      IAgentRepository                            │
│  - findAgents()                                                 │
│  - getAgent()                                                   │
│  - save()                                                       │
│  - getStats()                                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ scan
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Plugin Scanner                              │
│  - Scan ~/.claude/plugins/                                      │
│  - Parse agent .md files                                        │
│  - Build agent registry                                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ (Future Integration)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Claude Code Skill System                         │
│  - Skill invocation API                                         │
│  - Agent execution runtime                                      │
│  - File operations                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Successful Delegation Flow

```
1. Application calls delegateToAgent()
   ↓
2. Delegator looks up agent in repository
   ↓
3. Validate request (task, context, file ownership)
   ↓
4. Check circuit breaker state
   ↓
5. Execute agent with retry logic
   ├─ Attempt 1: Success → Return result
   ├─ Attempt 1: Failure + Retryable → Wait (backoff) → Attempt 2
   └─ Attempt N: Max retries → Return error
   ↓
6. Update agent statistics (success rate, last used)
   ↓
7. Return DelegationResult to application
```

### Error Handling Flow

```
Agent not found
   ↓
Return immediately with AGENT_NOT_FOUND error (not retryable)

Timeout exceeded
   ↓
Return with TIMEOUT error (retryable with delay)

Execution failed
   ↓
Check retryable flag
   ├─ Yes: Retry with backoff
   └─ No: Return error immediately

Cancelled
   ↓
Return immediately with CANCELLED error (not retryable)
```

## Key Interfaces

### DelegationContext (Input)
```
{
  workspacePath?: string;           // Workspace for file ops
  traceId?: string;                 // Distributed tracing ID
  timeout?: number;                 // Execution timeout
  metadata?: Record<string, any>;   // Custom metadata
  fileOwnership?: {                 // File access control
    ownedPaths: string[];
    readOnlyPaths: string[];
    transferOnCompletion: boolean;
  };
  onProgress?: (update) => void;    // Progress callback
}
```

### DelegationResult (Output)
```
{
  success: boolean;                 // Overall success
  output?: string;                  // Agent output (if success)
  error?: DelegationError;          // Error details (if failed)
  duration: number;                 // Execution time (ms)
  agentName: string;                // Agent that was used
  confidence?: number;              // Agent's confidence (0-1)
  traceId?: string;                 // Correlation ID
  metadata?: {                      // Execution metadata
    modifiedFiles?: string[];
    readFiles?: string[];
    capabilitiesUsed?: string[];
  };
}
```

## State Management

### Agent Statistics (Updated after each delegation)
- **successRate**: Exponential moving average (α=0.1)
- **lastUsed**: Timestamp of last delegation
- **status**: 'idle' | 'working' | 'failed'

### Active Delegations
- Tracked in Map<traceId, AbortController>
- Supports cancellation by trace ID
- Cleaned up after completion

### Circuit Breaker State (Future)
- **closed**: Normal operation (allow requests)
- **open**: Agent failing (block requests)
- **half-open**: Testing recovery (allow limited requests)

## Integration Points

### 1. Repository Integration
```typescript
// Agent discovery
const agent = await repository.getAgent(agentName);

// Statistics update
await repository.save(updatedAgent);
```

### 2. Skill System Integration (Future)
```typescript
// Currently: Placeholder simulation
const result = await this.simulateSkillInvocation(agent, task, timeout, signal);

// Future: Actual skill invocation
const skillName = `${agent.plugin}:${agent.name}`;
const result = await invokeSkill(skillName, task, { timeout, signal });
```

### 3. Circuit Breaker Integration (Future)
```typescript
// Currently: Always returns 'closed'
const state = await this.checkCircuitBreaker(agentName);

// Future: Check repository circuit breaker state
const state = await repository.getCircuitBreakerState(agentName);
```

## Design Patterns

### 1. Repository Pattern
- Delegator depends on IAgentRepository interface
- Enables swapping implementations (InMemory ↔ SQLite)

### 2. Retry Pattern
- Exponential backoff for transient failures
- Configurable max attempts and base delay
- Respects retryable flag in errors

### 3. Circuit Breaker Pattern
- Prevents cascading failures
- Automatic state transitions
- Half-open state for testing recovery

### 4. Cancellation Token Pattern
- AbortController for cancellation
- Clean shutdown of active delegations
- Resource cleanup

### 5. Observer Pattern
- Optional progress callbacks
- Real-time updates for long-running tasks

## Thread Safety

### Mutex Protection
- Repository operations are thread-safe (mutex-protected)
- Active delegations map is single-threaded (Node.js)

### Concurrency
- Multiple delegations can run in parallel
- Each has independent abort controller
- Statistics updates use repository transaction

## Error Categories

| Category | Codes | Retryable | Action |
|----------|-------|-----------|--------|
| Not Found | AGENT_NOT_FOUND | No | Scan plugins or fix name |
| Timeout | TIMEOUT | Yes | Increase timeout |
| Execution | EXECUTION_ERROR | Context | Check logs, retry |
| Cancelled | CANCELLED | No | N/A |
| Validation | VALIDATION_ERROR | No | Fix request |

## Performance Considerations

### Caching
- Agent discovery uses repository cache
- No caching of delegation results (stateful)

### Memory
- Active delegations tracked in Map
- AbortController cleanup on completion
- No result history retention

### Scalability
- Parallel delegation support
- Repository handles concurrent queries
- Circuit breaker prevents resource exhaustion

## Future Enhancements

1. **Skill System Integration**: Replace placeholder with actual Claude Code skill invocation
2. **Circuit Breaker**: Implement full circuit breaker with state persistence
3. **Progress Tracking**: Real-time progress updates during execution
4. **Delegation History**: Audit log of all delegations
5. **Metrics Dashboard**: Prometheus/Grafana integration
6. **Batch Operations**: Delegate to multiple agents atomically
7. **Priority Queues**: Priority-based delegation scheduling
8. **Webhooks**: Async notification for long-running tasks
