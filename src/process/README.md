# Process Lifecycle Management

Comprehensive process lifecycle management for UltraPilot framework.

## Features

- **Process Spawning**: Spawn child processes with full configuration support
- **Health Monitoring**: Monitor process health via heartbeat, HTTP, TCP, or custom checks
- **Graceful Shutdown**: Controlled shutdown with timeout and force kill
- **IPC Communication**: Bidirectional messaging between parent and child processes
- **Auto-Restart**: Automatic restart with exponential backoff on failure
- **Resource Monitoring**: Track CPU, memory, and uptime
- **Lifecycle Events**: Comprehensive event system for process state changes

## Quick Start

```typescript
import { getProcessManager } from './dist/process/index.js';

const manager = getProcessManager();

// Spawn a process
const handle = await manager.spawn({
  role: 'worker',
  command: process.execPath,
  args: ['worker.js'],
  autoRestart: true,
  maxRestarts: 3,
  healthCheck: {
    type: 'heartbeat',
    interval: 30000,
    timeout: 5000,
    threshold: 3
  }
});

// Subscribe to events
manager.on('spawn', (data) => {
  console.log(`Process ${data.handle.role} spawned: ${data.handle.pid}`);
});

// Graceful shutdown
await manager.shutdown(handle, { timeout: 10000 });
```

## API Reference

### ProcessManager

Main orchestrator for process lifecycle management.

#### Methods

- `spawn(config, options)` - Spawn a new process
- `monitor(handle, options)` - Start monitoring a process
- `unmonitor(handle)` - Stop monitoring a process
- `shutdown(handle, options)` - Graceful shutdown
- `kill(handle, signal)` - Immediate kill
- `list()` - List all processes
- `get(pid)` - Get process by PID
- `getByRole(role)` - Get processes by role
- `getMetrics(pid)` - Get process metrics
- `getCountByStatus(status)` - Count processes by status
- `shutdownAll(options)` - Shutdown all processes

#### Events

- `spawn` - Process spawned
- `ready` - Process ready (first heartbeat)
- `crash` - Process crashed
- `restart` - Process restarted
- `shutdown` - Process shutting down
- `exit` - Process exited
- `heartbeat` - Heartbeat received
- `health-check-fail` - Health check failed
- `resource-exceeded` - Resource limit exceeded

### ProcessFactory

Convenience methods for spawning common process types.

```typescript
const factory = manager.getFactory();

// Spawn Ultra-Lead process
await factory.spawnUltraLead({ workspacePath, sessionId });

// Spawn Autoloop daemon
await factory.spawnAutoloop({ workspacePath, domainId });

// Spawn worker process
await factory.spawnWorker({ taskId, agentId, workspacePath });
```

## Process Configuration

```typescript
interface ProcessConfig {
  role: ProcessRole;              // Process role
  command: string;                 // Command to execute
  args?: string[];                 // Arguments
  env?: Record<string, string>;    // Environment variables
  cwd?: string;                    // Working directory
  detached?: boolean;              // Daemon mode
  autoRestart?: boolean;           // Auto-restart on crash
  maxRestarts?: number;            // Max restart attempts
  restartBackoff?: number;         // Exponential backoff multiplier
  healthCheck?: HealthCheckConfig; // Health monitoring
  limits?: ProcessLimits;          // Resource limits
  metadata?: Record<string, any>;  // Custom metadata
}
```

## Health Monitoring

Health checks support multiple types:

- **heartbeat**: Monitor last heartbeat timestamp
- **http**: Check HTTP endpoint response
- **tcp**: Check TCP port connectivity
- **custom**: Use custom health check function

```typescript
healthCheck: {
  type: 'heartbeat',
  interval: 30000,    // Check interval (ms)
  timeout: 5000,      // Check timeout (ms)
  threshold: 3        // Failures before unhealthy
}
```

## IPC Communication

Enable IPC for bidirectional messaging:

```typescript
const handle = await manager.spawn(config, { ipc: true });

// Send message
await handle.ipc.send({
  type: 'event',
  payload: { action: 'ping' },
  timestamp: new Date()
});

// Request-response
const response = await handle.ipc.request({ query: 'status' });

// Subscribe to messages
handle.ipc.subscribe('event', (msg) => {
  console.log('Received:', msg.payload);
});
```

## Auto-Restart

Configure automatic restart with exponential backoff:

```typescript
const config = {
  autoRestart: true,
  maxRestarts: 3,          // Maximum restart attempts
  restartBackoff: 2        // Exponential backoff multiplier
};
```

Restart events:
- `restart` - Process restarted successfully
- `restart-limit-exceeded` - Max restart limit reached
- `restart-failed` - Restart attempt failed

## Graceful Shutdown

Controlled shutdown with timeout:

```typescript
await manager.shutdown(handle, {
  timeout: 10000,          // Graceful shutdown timeout (ms)
  signal: 'SIGTERM',       // Signal for graceful shutdown
  forceKill: true,         // Force kill after timeout
  onShutdownStart: (h) => console.log(`Shutting down ${h.pid}...`),
  onShutdownComplete: (h) => console.log(`Shutdown complete: ${h.pid}`)
});
```

## Resource Monitoring

Monitor and enforce resource limits:

```typescript
limits: {
  maxMemoryMB: 1024,       // Maximum memory (MB)
  maxCpuPercent: 0.8,      // Maximum CPU usage (0-1)
  maxUptime: 3600000       // Maximum uptime (ms)
}
```

Resource events:
- `resource-exceeded` - Resource limit exceeded
- `metrics` - Process metrics collected

## Examples

See `examples/process-lifecycle.mjs` for comprehensive usage examples.

## Integration

### SessionManager Integration

```typescript
import { getProcessManager } from './process/index.js';

async createSession(options) {
  const manager = getProcessManager();
  const factory = manager.getFactory();

  // Spawn Ultra-Lead for session
  const ultraLead = await factory.spawnUltraLead({
    workspacePath: options.workspacePath,
    sessionId: this.sessionId
  });

  // Store reference
  session.ultraLeadPid = ultraLead.pid;
}
```

### CoordinationProtocol Integration

```typescript
// Use IPC for leader election
const ipcChannel = handle.ipc;

await ipcChannel.send({
  type: 'event',
  payload: { type: 'election', candidateId }
});

await ipcChannel.broadcast({
  type: 'heartbeat',
  payload: { timestamp: Date.now() }
});
```

## Testing

Run the test suite:

```bash
npm test src/process/__tests__/lifecycle.test.ts
```

## License

MIT
