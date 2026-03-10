# Circuit Breaker & Health Monitoring

Production-grade circuit breaker pattern and health monitoring system for wshobson agent delegation.

## Overview

This module provides two critical components for building resilient agent systems:

1. **CircuitBreaker** - Prevents cascading failures by automatically detecting and isolating failing agents
2. **HealthMonitor** - Provides comprehensive health checks and system status monitoring

## Features

### CircuitBreaker

- **Automatic Failure Detection** - Tracks consecutive failures and trips to OPEN state
- **Exponential Backoff** - Gradually increases recovery timeout to prevent overwhelming recovering services
- **Thread-Safe** - Uses mutex for concurrent request handling
- **Event System** - Emits events for state changes, trips, and recoveries
- **State Persistence** - Export/import state for recovery across restarts
- **Configurable Thresholds** - Customize failure/success thresholds and timeouts

### HealthMonitor

- **Periodic Health Checks** - Runs registered checks at configurable intervals
- **Circuit Breaker Monitoring** - Tracks all circuit breaker states
- **Memory Monitoring** - Monitors heap usage with configurable thresholds
- **HTTP Response Format** - Returns appropriate status codes for health endpoints
- **Custom Checks** - Register custom health checks for external dependencies
- **Thread-Safe** - All operations protected by mutex

## Installation

```typescript
import { CircuitBreaker, createCircuitBreaker } from './circuit-breaker.js';
import { HealthMonitor, createHealthMonitor } from './health.js';
```

## Quick Start

### Circuit Breaker

```typescript
import { CircuitBreaker } from './circuit-breaker.js';

// Create circuit breaker
const breaker = new CircuitBreaker('agent-name', {
  failureThreshold: 5,      // Trip after 5 failures
  successThreshold: 3,      // Close after 3 successes
  timeout: 60000,           // Open→HalfOpen after 60s
  halfOpenMaxCalls: 3,      // Max 3 calls in HalfOpen
  exponentialBackoff: true, // Enable exponential backoff
});

// Use before delegation
if (await breaker.allowRequest()) {
  try {
    const result = await delegateToAgent(agent, task);
    await breaker.recordSuccess();
  } catch (error) {
    await breaker.recordFailure();
  }
}
```

### Health Monitor

```typescript
import { HealthMonitor } from './health.js';

// Create health monitor
const monitor = new HealthMonitor({
  version: '1.0.0',
  startTime: Date.now(),
  memoryThreshold: 0.7,  // 70% heap usage = degraded
});

// Register circuit breakers
monitor.registerCircuitBreaker('agent-1', circuitBreaker1);
monitor.registerCircuitBreaker('agent-2', circuitBreaker2);

// Start monitoring
await monitor.start();

// Get health status
const health = await monitor.getHealth();
console.log(`System status: ${health.status}`);
console.log(`Memory: ${health.metrics.memoryUsage.heapUsed} bytes`);

// Use in HTTP endpoint
app.get('/health', async (req, res) => {
  const response = await monitor.getHealthResponse();
  res.status(response.statusCode).json(response.body);
});
```

## Architecture

### Circuit Breaker States

```
┌─────────┐                  ┌──────────┐
│ CLOSED  │ ──failures──>    │   OPEN   │
│ (Normal) │                  │(Blocking)│
└─────────┘                  └──────────┘
     ▲                            │
     │                        timeout
     │                            │
     │                            ▼
     │                       ┌────────────┐
     └─────successes─────── │ HALF_OPEN  │
             (3+)            │ (Testing)  │
                             └────────────┘
```

### State Transitions

- **CLOSED → OPEN**: When failure threshold is reached
- **OPEN → HALF_OPEN**: When timeout expires
- **HALF_OPEN → CLOSED**: When success threshold is reached
- **HALF_OPEN → OPEN**: On any failure

## Configuration

### CircuitBreakerConfig

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;        // Default: 5
  successThreshold: number;        // Default: 3
  timeout: number;                 // Default: 60000 (1 minute)
  halfOpenMaxCalls: number;        // Default: 3
  exponentialBackoff?: boolean;    // Default: true
  maxBackoffDelay?: number;        // Default: 300000 (5 minutes)
  resetTimeoutOnRecovery?: boolean; // Default: true
}
```

### HealthMonitorConfig

```typescript
interface HealthMonitorConfig {
  defaultCheckInterval: number;    // Default: 30000 (30 seconds)
  memoryThreshold: number;         // Default: 0.7 (70%)
  memoryCriticalThreshold: number; // Default: 0.9 (90%)
  monitorMemory: boolean;          // Default: true
  monitorCircuitBreakers: boolean; // Default: true
  version: string;
  startTime: number;
}
```

## Integration with WshobsonDelegator

The CircuitBreaker is automatically integrated with WshobsonDelegator:

```typescript
import { WshobsonDelegator } from './delegator.js';

const delegator = new WshobsonDelegator(
  repository,
  60000,
  {
    failureThreshold: 5,
    timeout: 60000,
    exponentialBackoff: true,
  }
);

// Circuit breakers are created on-demand
const result = await delegator.delegateToAgent(
  'agent-name',
  'task description',
  context
);

// Get circuit breakers for health monitoring
const breakers = delegator.getAllCircuitBreakers();
for (const [name, breaker] of breakers) {
  monitor.registerCircuitBreaker(name, breaker);
}
```

## Events

### Circuit Breaker Events

```typescript
breaker.on((event, data) => {
  switch (event) {
    case CircuitBreakerEvent.TRIPPED:
      console.log(`Circuit tripped for ${data.agentName}`);
      break;
    case CircuitBreakerEvent.RECOVERED:
      console.log(`Circuit recovered for ${data.agentName}`);
      break;
    case CircuitBreakerEvent.REJECTED:
      console.log(`Request rejected: ${data.reason}`);
      break;
  }
});
```

## Metrics

### Circuit Breaker Metrics

```typescript
const metrics = await breaker.getMetrics();
console.log(metrics);
// {
//   state: 'closed',
//   failureCount: 0,
//   successCount: 0,
//   requestsSinceOpen: 0,
//   lastFailureTime: 0,
//   nextAttemptTime: 0,
//   currentTimeout: 60000,
//   tripCount: 2,
//   recoveryCount: 1
// }
```

### Health Check Results

```typescript
const health = await monitor.getHealth();
console.log(health);
// {
//   status: 'healthy',
//   checks: [
//     { name: 'memory', status: 'healthy', ... },
//     { name: 'circuit-breakers', status: 'healthy', ... }
//   ],
//   uptime: 86400000,
//   version: '1.0.0',
//   timestamp: 1640000000000,
//   metrics: { ... }
// }
```

## Thread Safety

All operations are thread-safe using the Mutex class:

```typescript
// Multiple concurrent operations are safe
await Promise.all([
  breaker.allowRequest(),
  breaker.recordFailure(),
  breaker.getMetrics(),
]);
```

## Best Practices

1. **Set Appropriate Thresholds**
   - Failure threshold: 3-10 depending on agent reliability
   - Success threshold: 2-5 for quick recovery
   - Timeout: 30-120 seconds depending on agent response time

2. **Enable Exponential Backoff**
   - Prevents overwhelming recovering agents
   - Start with 30-60 second base timeout
   - Cap at 5-10 minutes maximum

3. **Monitor Circuit Breakers**
   - Register all breakers with HealthMonitor
   - Alert on circuit trips
   - Track trip/recovery rates

4. **Custom Health Checks**
   - Monitor external dependencies (databases, APIs)
   - Set appropriate criticality flags
   - Run critical checks more frequently

5. **State Persistence**
   - Export circuit breaker state periodically
   - Import on startup to maintain state across restarts
   - Use for debugging and analysis

## Example: Complete Setup

```typescript
import { WshobsonDelegator } from './delegator.js';
import { HealthMonitor } from './health.js';

// Create delegator with circuit breaker config
const delegator = new WshobsonDelegator(repository, 60000, {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
  exponentialBackoff: true,
});

// Create health monitor
const monitor = new HealthMonitor({
  version: '1.0.0',
  startTime: Date.now(),
});

// Register circuit breakers
const breakers = delegator.getAllCircuitBreakers();
for (const [name, breaker] of breakers) {
  monitor.registerCircuitBreaker(name, breaker);

  // Add event listener for alerts
  breaker.on((event, data) => {
    if (event === CircuitBreakerEvent.TRIPPED) {
      alertTeam(`Agent ${name} circuit tripped`);
    }
  });
}

// Add custom health checks
monitor.registerCheck('database', async () => {
  try {
    await db.ping();
    return { status: 'healthy', message: 'Database responding' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Database not responding' };
  }
}, { critical: true, interval: 15000 });

// Start monitoring
await monitor.start();

// Setup health endpoint
app.get('/health', async (req, res) => {
  const response = await monitor.getHealthResponse();
  res.status(response.statusCode).json(response.body);
});

// Use delegator with automatic circuit breaker protection
const result = await delegator.delegateToAgent(agent, task, context);
```

## API Reference

See [circuit-breaker.ts](./circuit-breaker.ts) and [health.ts](./health.ts) for complete API documentation.

## License

MIT
