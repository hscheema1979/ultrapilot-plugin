/**
 * Process Lifecycle Management - Types
 *
 * Complete type definitions for process spawning, monitoring,
 * and lifecycle management in UltraPilot.
 */

import { EventEmitter } from 'events';

/**
 * Process role types
 */
export type ProcessRole = 'ultra-lead' | 'autoloop' | 'worker' | 'custom' | 'monitor' | 'scheduler';

/**
 * Process status states
 */
export type ProcessStatus = 'starting' | 'running' | 'stopping' | 'crashed' | 'dead' | 'zombie';

/**
 * Process priority
 */
export type ProcessPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Process signal types
 */
export type ProcessSignal = 'SIGTERM' | 'SIGINT' | 'SIGKILL' | 'SIGHUP' | 'SIGUSR1' | 'SIGUSR2';

/**
 * Process configuration
 */
export interface ProcessConfig {
  /** Process role identifier */
  role: ProcessRole;
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Detached mode (daemon) */
  detached?: boolean;
  /** Working directory */
  cwd?: string;
  /** Process priority */
  priority?: ProcessPriority;
  /** Auto-restart on failure */
  autoRestart?: boolean;
  /** Maximum restart attempts */
  maxRestarts?: number;
  /** Restart backoff multiplier (exponential) */
  restartBackoff?: number;
  /** Process ID (if reattaching) */
  pid?: number;
  /** Custom metadata */
  metadata?: Record<string, any>;
  /** Resource limits */
  limits?: ProcessLimits;
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
}

/**
 * Process resource limits
 */
export interface ProcessLimits {
  /** Maximum memory in MB */
  maxMemoryMB?: number;
  /** Maximum CPU usage (0-1) */
  maxCpuPercent?: number;
  /** Maximum uptime in milliseconds */
  maxUptime?: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Health check interval in milliseconds */
  interval: number;
  /** Health check timeout in milliseconds */
  timeout: number;
  /** Number of failures before marking unhealthy */
  threshold: number;
  /** Health check type */
  type: 'heartbeat' | 'http' | 'tcp' | 'custom';
  /** Health check endpoint (for http/tcp) */
  endpoint?: string;
  /** Custom health check function */
  checkFn?: (pid: number) => Promise<boolean>;
}

/**
 * Process handle - runtime process reference
 */
export interface ProcessHandle {
  /** Process ID */
  pid: number;
  /** Process role */
  role: ProcessRole;
  /** Current status */
  status: ProcessStatus;
  /** Spawn timestamp */
  spawnedAt: Date;
  /** Last heartbeat timestamp */
  lastHeartbeat?: Date;
  /** Exit code (if exited) */
  exitCode?: number;
  /** Signal that caused exit */
  signal?: NodeJS.Signals;
  /** Restart count */
  restartCount: number;
  /** Custom metadata */
  metadata: Record<string, any>;
  /** Child process reference (if spawned by us) */
  childProcess?: any;
  /** IPC channel (if enabled) - use concrete type, not interface */
  ipc?: any;
}

/**
 * Process monitor options
 */
export interface MonitorOptions {
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
  /** Resource monitoring interval */
  resourceMonitorInterval?: number;
  /** Enable CPU monitoring */
  monitorCpu?: boolean;
  /** Enable memory monitoring */
  monitorMemory?: boolean;
  /** Callback on status change */
  onStatusChange?: (handle: ProcessHandle, oldStatus: ProcessStatus, newStatus: ProcessStatus) => void;
  /** Callback on crash */
  onCrash?: (handle: ProcessHandle, error?: Error) => void;
  /** Callback on health check failure */
  onHealthCheckFail?: (handle: ProcessHandle, failures: number) => void;
}

/**
 * Process spawn options
 */
export interface SpawnOptions {
  /** stdio configuration */
  stdio?: 'inherit' | 'pipe' | 'ignore';
  /** Enable IPC */
  ipc?: boolean;
  /** Detached mode */
  detached?: boolean;
  /** Timeout for spawn (ms) */
  timeout?: number;
  /** Callback on spawn success */
  onSpawn?: (handle: ProcessHandle) => void;
  /** Callback on spawn error */
  onError?: (error: Error) => void;
  /** Callback on ready (first heartbeat) */
  onReady?: (handle: ProcessHandle) => void;
}

/**
 * Process shutdown options
 */
export interface ShutdownOptions {
  /** Graceful shutdown timeout (ms) */
  timeout?: number;
  /** Signal to send for graceful shutdown */
  signal?: ProcessSignal;
  /** Force kill after timeout */
  forceKill?: boolean;
  /** Callback on shutdown start */
  onShutdownStart?: (handle: ProcessHandle) => void;
  /** Callback on shutdown complete */
  onShutdownComplete?: (handle: ProcessHandle) => void;
}

/**
 * Process metrics snapshot
 */
export interface ProcessMetrics {
  /** Process ID */
  pid: number;
  /** CPU usage percentage */
  cpuPercent: number;
  /** Memory usage in bytes */
  memoryBytes: number;
  /** Memory usage in MB */
  memoryMB: number;
  /** Uptime in milliseconds */
  uptime: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Process pool configuration
 */
export interface ProcessPoolConfig {
  /** Pool name */
  name: string;
  /** Process template */
  template: ProcessConfig;
  /** Minimum pool size */
  minSize: number;
  /** Maximum pool size */
  maxSize: number;
  /** Idle timeout (ms) */
  idleTimeout?: number;
  /** Spawn on demand */
  spawnOnDemand?: boolean;
}

/**
 * Process pool entry
 */
export interface ProcessPoolEntry {
  handle: ProcessHandle;
  inUse: boolean;
  lastUsed: Date;
}

/**
 * Lifecycle event types
 */
export type LifecycleEvent =
  | 'spawn'
  | 'ready'
  | 'crash'
  | 'restart'
  | 'restart-limit-exceeded'
  | 'restart-failed'
  | 'shutdown'
  | 'exit'
  | 'heartbeat'
  | 'health-check-fail'
  | 'resource-exceeded'
  | 'status-change'
  | '*';

/**
 * Lifecycle event payload
 */
export interface LifecycleEventData {
  eventType: LifecycleEvent;
  handle: ProcessHandle;
  timestamp: Date;
  data?: any;
}

/**
 * IPC message types
 */
export type IPCMessageType = 'request' | 'response' | 'event' | 'broadcast';

/**
 * IPC message format
 */
export interface IPCMessage {
  /** Message type */
  type: IPCMessageType;
  /** Source process role */
  from?: ProcessRole;
  /** Destination process role (undefined = broadcast) */
  to?: ProcessRole;
  /** Message ID (for request/response) */
  id?: string;
  /** Correlation ID (for async responses) */
  correlationId?: string;
  /** Message payload */
  payload: any;
  /** Timestamp */
  timestamp: Date;
}

/**
 * IPC channel interface
 */
export interface IPCChannel extends EventEmitter {
  /** Send message to process */
  send(message: IPCMessage): Promise<void>;

  /** Request-response pattern */
  request(payload: any, timeout?: number): Promise<any>;

  /** Broadcast message to all */
  broadcast(message: IPCMessage): Promise<void>;

  /** Subscribe to message type */
  subscribe(eventType: string, handler: (message: IPCMessage) => void): void;

  /** Unsubscribe from message type */
  unsubscribe(eventType: string, handler: (message: IPCMessage) => void): void;

  /** Close channel */
  close(): Promise<void>;
}

/**
 * Process manager interface
 */
export interface ProcessManager {
  /** Spawn a new process */
  spawn(config: ProcessConfig, options?: SpawnOptions): Promise<ProcessHandle>;

  /** Monitor an existing process */
  monitor(handle: ProcessHandle, options: MonitorOptions): void;

  /** Stop monitoring a process */
  unmonitor(handle: ProcessHandle): void;

  /** Shutdown a process gracefully */
  shutdown(handle: ProcessHandle, options?: ShutdownOptions): Promise<void>;

  /** Kill a process immediately */
  kill(handle: ProcessHandle, signal?: ProcessSignal): void;

  /** List all processes */
  list(): ProcessHandle[];

  /** Get process by PID */
  get(pid: number): ProcessHandle | undefined;

  /** Get processes by role */
  getByRole(role: ProcessRole): ProcessHandle[];

  /** Get process metrics */
  getMetrics(pid: number): ProcessMetrics | undefined;

  /** Subscribe to lifecycle events */
  on(event: LifecycleEvent, handler: (data: LifecycleEventData) => void): void;

  /** Unsubscribe from lifecycle events */
  off(event: LifecycleEvent, handler: (data: LifecycleEventData) => void): void;

  /** Shutdown all processes */
  shutdownAll(options?: ShutdownOptions): Promise<void>;

  /** Get process count by status */
  getCountByStatus(status: ProcessStatus): number;
}

/**
 * Process spawner interface
 */
export interface ProcessSpawner {
  /** Spawn process from config */
  spawn(config: ProcessConfig, options?: SpawnOptions): Promise<ProcessHandle>;

  /** Reattach to existing process */
  reattach(pid: number, role: ProcessRole): Promise<ProcessHandle>;

  /** Validate process config */
  validateConfig(config: ProcessConfig): boolean;

  /** Check if process exists */
  exists(pid: number): boolean;

  /** Get process info */
  getProcessInfo(pid: number): any;
}

/**
 * Process monitor interface
 */
export interface ProcessMonitor {
  /** Start monitoring a process */
  start(handle: ProcessHandle, options: MonitorOptions): void;

  /** Stop monitoring a process */
  stop(handle: ProcessHandle): void;

  /** Get current health status */
  getHealth(pid: number): boolean;

  /** Get current metrics */
  getMetrics(pid: number): ProcessMetrics | undefined;

  /** Force health check */
  checkHealth(pid: number): Promise<boolean>;

  /** Get monitoring status */
  isMonitoring(pid: number): boolean;
}
