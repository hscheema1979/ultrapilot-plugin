/**
 * Process Manager - Lifecycle Orchestration
 *
 * Main orchestrator for process spawning, monitoring, graceful shutdown,
 * and automatic restart with exponential backoff.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  ProcessManager as ProcessManagerInterface,
  ProcessConfig,
  ProcessHandle,
  ProcessStatus,
  ProcessRole,
  SpawnOptions,
  MonitorOptions,
  ShutdownOptions,
  ProcessSignal,
  LifecycleEvent,
  LifecycleEventData,
  ProcessMetrics,
  ProcessPoolConfig,
  ProcessPoolEntry
} from './types.js';
import { ProcessSpawner, ProcessFactory } from './ProcessSpawner.js';
import { ProcessMonitor } from './ProcessMonitor.js';
import { IPCMessageRouter } from './IPCChannel.js';

/**
 * Process entry with restart state
 */
interface ProcessEntry {
  handle: ProcessHandle;
  config: ProcessConfig;
  monitorOptions?: MonitorOptions;
  isManaged: boolean;
  restartBackoff: number;
}

/**
 * Process Manager Implementation
 */
export class ProcessManager extends EventEmitter implements ProcessManagerInterface {
  private spawner: ProcessSpawner;
  private factory: ProcessFactory;
  private processMonitor: ProcessMonitor;
  private ipcRouter: IPCMessageRouter;

  private processes: Map<number, ProcessEntry> = new Map();
  private roleIndex: Map<ProcessRole, Set<number>> = new Map();
  private pools: Map<string, ProcessPoolEntry[]> = new Map();

  private isShuttingDown: boolean = false;
  private shutdownTimeout: number = 30000; // 30 seconds default

  constructor() {
    super();
    this.spawner = new ProcessSpawner();
    this.factory = new ProcessFactory(this.spawner);
    this.processMonitor = new ProcessMonitor();
    this.ipcRouter = new IPCMessageRouter();

    this.setupEventForwarding();
    this.setupSignalHandlers();
  }

  /**
   * Spawn a new process
   */
  async spawn(config: ProcessConfig, options: SpawnOptions = {}): Promise<ProcessHandle> {
    if (this.isShuttingDown) {
      throw new Error('Cannot spawn process during shutdown');
    }

    try {
      // Spawn process
      const handle = await this.spawner.spawn(config, options);

      // Register process
      this.registerProcess(handle, config);

      // Start monitoring if options provided
      const monitorOptions: MonitorOptions = {
        healthCheck: config.healthCheck,
        resourceMonitorInterval: 5000,
        monitorCpu: true,
        monitorMemory: true,
        onStatusChange: (handle, oldStatus, newStatus) => {
          this.emitLifecycleEvent('status-change', handle, { oldStatus, newStatus });
        },
        onCrash: (handle, error) => {
          this.handleCrash(handle, error);
        }
      };

      this.processMonitor.start(handle, monitorOptions);

      // Setup IPC if enabled
      if (handle.ipc) {
        this.ipcRouter.register(handle.ipc);
      }

      // Emit spawn event
      this.emitLifecycleEvent('spawn', handle);

      // Call ready callback if provided
      if (options.onReady) {
        // Wait for first heartbeat
        const readyCheck = setInterval(() => {
          if (handle.lastHeartbeat || handle.status === 'running') {
            clearInterval(readyCheck);
            options.onReady!(handle);
            this.emitLifecycleEvent('ready', handle);
          }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => clearInterval(readyCheck), 30000);
      }

      return handle;

    } catch (error) {
      if (options.onError) {
        options.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Monitor an existing process
   */
  monitor(handle: ProcessHandle, options: MonitorOptions): void {
    this.processMonitor.start(handle, options);

    // Forward monitor events
    this.processMonitor.on('metrics', (metrics: ProcessMetrics) => {
      this.emit('metrics', metrics);
    });

    this.processMonitor.on('unhealthy', (data: any) => {
      this.emit('unhealthy', data);
    });
  }

  /**
   * Stop monitoring a process
   */
  unmonitor(handle: ProcessHandle): void {
    this.processMonitor.stop(handle);
  }

  /**
   * Shutdown a process gracefully
   */
  async shutdown(handle: ProcessHandle, options: ShutdownOptions = {}): Promise<void> {
    const entry = this.processes.get(handle.pid);
    if (!entry) {
      throw new Error(`Process not found: ${handle.pid}`);
    }

    const timeout = options.timeout || this.shutdownTimeout;
    const signal = options.signal || 'SIGTERM';

    // Call shutdown start callback
    if (options.onShutdownStart) {
      options.onShutdownStart(handle);
    }

    // Update status
    const oldStatus = handle.status;
    handle.status = 'stopping';
    this.emitLifecycleEvent('shutdown', handle, { oldStatus });

    // Stop monitoring
    this.processMonitor.stop(handle);

    try {
      // Send graceful shutdown signal
      if (handle.childProcess && !handle.childProcess.killed) {
        handle.childProcess.kill(signal);

        // Wait for graceful exit
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => {
            // Timeout - force kill if enabled
            if (options.forceKill !== false) {
              this.kill(handle, 'SIGKILL');
            }
            resolve();
          }, timeout);

          handle.childProcess.once('exit', () => {
            clearTimeout(timeoutId);
            resolve();
          });
        });
      }

      // Close IPC
      if (handle.ipc) {
        await handle.ipc.close();
        this.ipcRouter.unregister(handle.ipc);
      }

      // Remove from registry
      this.unregisterProcess(handle);

      // Call shutdown complete callback
      if (options.onShutdownComplete) {
        options.onShutdownComplete(handle);
      }

      this.emitLifecycleEvent('exit', handle);

    } catch (error) {
      // Force kill on error
      if (options.forceKill !== false) {
        this.kill(handle, 'SIGKILL');
      }
      throw error;
    }
  }

  /**
   * Kill a process immediately
   */
  kill(handle: ProcessHandle, signal: ProcessSignal = 'SIGKILL'): void {
    if (handle.childProcess && !handle.childProcess.killed) {
      handle.childProcess.kill(signal);
    }

    // Close IPC
    if (handle.ipc) {
      handle.ipc.close().catch(() => {});
      this.ipcRouter.unregister(handle.ipc);
    }

    // Remove from registry
    this.unregisterProcess(handle);

    this.emitLifecycleEvent('exit', handle, { signal });
  }

  /**
   * List all processes
   */
  list(): ProcessHandle[] {
    return Array.from(this.processes.values()).map(entry => entry.handle);
  }

  /**
   * Get process by PID
   */
  get(pid: number): ProcessHandle | undefined {
    return this.processes.get(pid)?.handle;
  }

  /**
   * Get processes by role
   */
  getByRole(role: ProcessRole): ProcessHandle[] {
    const pids = this.roleIndex.get(role);
    if (!pids) {
      return [];
    }

    return Array.from(pids)
      .map(pid => this.processes.get(pid)?.handle)
      .filter((h): h is ProcessHandle => h !== undefined);
  }

  /**
   * Get process metrics
   */
  getMetrics(pid: number): ProcessMetrics | undefined {
    return this.processMonitor.getMetrics(pid);
  }

  /**
   * Subscribe to lifecycle events
   */
  on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  /**
   * Unsubscribe from lifecycle events
   */
  off(event: string, handler: (...args: any[]) => void): this {
    return super.off(event, handler);
  }

  /**
   * Shutdown all processes
   */
  async shutdownAll(options: ShutdownOptions = {}): Promise<void> {
    this.isShuttingDown = true;

    const handles = this.list();

    // Shutdown in parallel with timeout
    await Promise.allSettled(
      handles.map(handle => this.shutdown(handle, options))
    );

    // Stop all monitoring
    this.processMonitor.stopAll();

    // Close all IPC
    await this.ipcRouter.closeAll();

    this.isShuttingDown = false;
  }

  /**
   * Get process count by status
   */
  getCountByStatus(status: ProcessStatus): number {
    return Array.from(this.processes.values())
      .filter(entry => entry.handle.status === status)
      .length;
  }

  /**
   * Handle process crash
   */
  private async handleCrash(handle: ProcessHandle, error?: Error): Promise<void> {
    const entry = this.processes.get(handle.pid);
    if (!entry) {
      return;
    }

    this.emitLifecycleEvent('crash', handle, { error });

    // Auto-restart if enabled
    if (entry.config.autoRestart && entry.config.maxRestarts) {
      await this.restartProcess(entry);
    }
  }

  /**
   * Restart process with exponential backoff
   */
  private async restartProcess(entry: ProcessEntry): Promise<void> {
    const { handle, config, restartBackoff } = entry;

    // Check restart limit
    if (handle.restartCount >= (config.maxRestarts || 3)) {
      this.emit('restart-limit-exceeded', {
        pid: handle.pid,
        role: handle.role,
        restartCount: handle.restartCount
      });
      return;
    }

    // Calculate backoff delay
    const backoffMultiplier = config.restartBackoff || 2;
    const delay = Math.min(1000 * Math.pow(backoffMultiplier, restartBackoff), 60000);

    // Wait before restart
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // Remove old process
      this.unregisterProcess(handle);

      // Spawn new process
      const newHandle = await this.spawner.spawn(config, {});

      // Update restart count
      newHandle.restartCount = handle.restartCount + 1;

      // Register new process
      this.registerProcess(newHandle, config);

      // Start monitoring
      this.processMonitor.start(newHandle, {
        healthCheck: config.healthCheck,
        onCrash: (h, error) => this.handleCrash(h, error)
      });

      // Update entry
      entry.handle = newHandle;
      entry.restartBackoff = restartBackoff + 1;

      this.emitLifecycleEvent('restart', newHandle, {
        previousPid: handle.pid,
        restartCount: newHandle.restartCount
      });

    } catch (error) {
      this.emit('restart-failed', {
        pid: handle.pid,
        error: (error as Error).message
      });
    }
  }

  /**
   * Register process in indexes
   */
  private registerProcess(handle: ProcessHandle, config: ProcessConfig): void {
    const entry: ProcessEntry = {
      handle,
      config,
      isManaged: config.autoRestart || false,
      restartBackoff: 0
    };

    this.processes.set(handle.pid, entry);

    // Update role index
    if (!this.roleIndex.has(handle.role)) {
      this.roleIndex.set(handle.role, new Set());
    }
    this.roleIndex.get(handle.role)!.add(handle.pid);
  }

  /**
   * Unregister process from indexes
   */
  private unregisterProcess(handle: ProcessHandle): void {
    this.processes.delete(handle.pid);

    // Update role index
    const pids = this.roleIndex.get(handle.role);
    if (pids) {
      pids.delete(handle.pid);
      if (pids.size === 0) {
        this.roleIndex.delete(handle.role);
      }
    }
  }

  /**
   * Emit lifecycle event
   */
  private emitLifecycleEvent(
    eventType: LifecycleEvent,
    handle: ProcessHandle,
    data?: any
  ): void {
    const eventData: LifecycleEventData = {
      eventType,
      handle,
      timestamp: new Date(),
      data
    };

    this.emit(eventType, eventData);
    this.emit('*', eventData); // Wildcard for all events
  }

  /**
   * Setup event forwarding from monitor
   */
  private setupEventForwarding(): void {
    this.processMonitor.on('metrics', (metrics: ProcessMetrics) => {
      this.emit('metrics', metrics);
    });

    this.processMonitor.on('unhealthy', (data: any) => {
      this.emit('unhealthy', data);
    });

    this.processMonitor.on('health-recovered', (data: any) => {
      this.emit('health-recovered', data);
    });

    this.processMonitor.on('resource-exceeded', (data: any) => {
      this.emit('resource-exceeded', data);
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const shutdownHandler = async (signal: NodeJS.Signals) => {
      console.log(`Received ${signal}, shutting down processes...`);
      await this.shutdownAll({ timeout: 10000, forceKill: true });
      process.exit(0);
    };

    process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.once('SIGINT', () => shutdownHandler('SIGINT'));
  }

  /**
   * Get process factory for convenience methods
   */
  getFactory(): ProcessFactory {
    return this.factory;
  }

  /**
   * Get IPC router
   */
  getIPCRouter(): IPCMessageRouter {
    return this.ipcRouter;
  }

  /**
   * Get process count
   */
  getCount(): number {
    return this.processes.size;
  }

  /**
   * Get process entries
   */
  getEntries(): ProcessEntry[] {
    return Array.from(this.processes.values());
  }
}

/**
 * Global process manager singleton
 */
let globalProcessManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!globalProcessManager) {
    globalProcessManager = new ProcessManager();
  }
  return globalProcessManager;
}

export function resetProcessManager(): void {
  if (globalProcessManager) {
    globalProcessManager.removeAllListeners();
    globalProcessManager = null;
  }
}
