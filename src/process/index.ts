/**
 * Process Lifecycle Management - Main Export
 *
 * Complete process lifecycle management including:
 * - Process spawning (detached daemons, child processes)
 * - Health monitoring (heartbeat, HTTP, TCP, custom)
 * - Graceful shutdown (SIGTERM, timeout, force kill)
 * - IPC communication (request-response, broadcast)
 * - Auto-restart with exponential backoff
 * - Resource monitoring (CPU, memory)
 */

// Types
export {
  // Basic types
  ProcessRole,
  ProcessStatus,
  ProcessPriority,
  ProcessSignal,

  // Configuration types
  ProcessConfig,
  ProcessLimits,
  HealthCheckConfig,
  SpawnOptions,
  MonitorOptions,
  ShutdownOptions,

  // Runtime types
  ProcessHandle,
  ProcessMetrics,
  LifecycleEvent,
  LifecycleEventData,

  // Pool types
  ProcessPoolConfig,
  ProcessPoolEntry,

  // IPC types
  IPCMessageType,
  IPCMessage,
  IPCChannel as IPCChannelInterface,

  // Interface types
  ProcessManager as ProcessManagerInterface,
  ProcessSpawner as ProcessSpawnerInterface,
  ProcessMonitor as ProcessMonitorInterface
} from './types.js';

// Core classes
export { ProcessManager, getProcessManager, resetProcessManager } from './ProcessManager.js';
export { ProcessSpawner, ProcessFactory } from './ProcessSpawner.js';
export { ProcessMonitor } from './ProcessMonitor.js';
export { IPCChannel, IPCMessageRouter } from './IPCChannel.js';
