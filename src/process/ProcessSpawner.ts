/**
 * Process Spawner - Process Creation & Management
 *
 * Handles spawning child processes, detached daemons, and
 * process lifecycle initialization.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  ProcessSpawner as ProcessSpawnerInterface,
  ProcessConfig,
  ProcessHandle,
  ProcessStatus,
  SpawnOptions,
  ProcessRole
} from './types.js';
import { IPCChannel } from './IPCChannel.js';

/**
 * Spawn result
 */
interface SpawnResult {
  handle: ProcessHandle;
  childProcess: any;
}

/**
 * Process Spawner Implementation
 */
export class ProcessSpawner implements ProcessSpawnerInterface {
  private processes: Map<number, ProcessHandle> = new Map();
  private defaultOptions: SpawnOptions = {
    stdio: 'pipe',
    ipc: false,
    detached: false,
    timeout: 30000
  };

  /**
   * Spawn a new process from configuration
   */
  async spawn(config: ProcessConfig, options: SpawnOptions = {}): Promise<ProcessHandle> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Validate configuration
    if (!this.validateConfig(config)) {
      throw new Error(`Invalid process configuration for role: ${config.role}`);
    }

    // Prepare spawn parameters
    const spawnParams = this.prepareSpawnParams(config, mergedOptions);

    // Spawn the process
    const result = await this.executeSpawn(config, spawnParams, mergedOptions);

    // Register process
    this.processes.set(result.handle.pid, result.handle);

    // Setup event handlers
    this.setupProcessEvents(result.childProcess, result.handle, mergedOptions);

    return result.handle;
  }

  /**
   * Reattach to existing process
   */
  async reattach(pid: number, role: ProcessRole): Promise<ProcessHandle> {
    // Check if process exists
    if (!this.exists(pid)) {
      throw new Error(`Process not found: ${pid}`);
    }

    // Create handle for existing process
    const handle: ProcessHandle = {
      pid,
      role,
      status: 'running',
      spawnedAt: new Date(), // Approximate
      restartCount: 0,
      metadata: {
        reattached: true
      }
    };

    this.processes.set(pid, handle);
    return handle;
  }

  /**
   * Validate process configuration
   */
  validateConfig(config: ProcessConfig): boolean {
    // Check required fields
    if (!config.role || !config.command) {
      return false;
    }

    // Check if command exists
    if (!existsSync(config.command)) {
      // Try to resolve from PATH
      return true; // Will fail on actual spawn if not found
    }

    // Validate working directory
    if (config.cwd && !existsSync(config.cwd)) {
      return false;
    }

    // Validate health check
    if (config.healthCheck) {
      const { interval, timeout, threshold } = config.healthCheck;
      if (interval <= 0 || timeout <= 0 || threshold <= 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if process exists
   */
  exists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get process info
   */
  getProcessInfo(pid: number): any {
    const handle = this.processes.get(pid);
    if (!handle) {
      return null;
    }

    return {
      pid: handle.pid,
      role: handle.role,
      status: handle.status,
      uptime: Date.now() - handle.spawnedAt.getTime(),
      metadata: handle.metadata
    };
  }

  /**
   * Prepare spawn parameters
   */
  private prepareSpawnParams(config: ProcessConfig, options: SpawnOptions): any {
    const params: any = {
      cwd: config.cwd || process.cwd(),
      env: {
        ...process.env,
        ...config.env
      },
      detached: config.detached || options.detached
    };

    // Setup stdio
    switch (options.stdio) {
      case 'inherit':
        params.stdio = 'inherit';
        break;
      case 'ignore':
        params.stdio = 'ignore';
        break;
      case 'pipe':
      default:
        params.stdio = ['pipe', 'pipe', 'pipe'];
        break;
    }

    // Add IPC if enabled
    if (options.ipc || config.metadata?.enableIPC) {
      if (Array.isArray(params.stdio)) {
        params.stdio.push('ipc');
      }
    }

    return params;
  }

  /**
   * Execute process spawn
   */
  private async executeSpawn(
    config: ProcessConfig,
    spawnParams: any,
    options: SpawnOptions
  ): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve, reject) => {
      const spawnTimeout = setTimeout(() => {
        reject(new Error(`Process spawn timeout: ${config.role}`));
      }, options.timeout);

      try {
        const childProcess = spawn(config.command, config.args || [], spawnParams);

        // Create process handle
        const handle: ProcessHandle = {
          pid: childProcess.pid!,
          role: config.role,
          status: 'starting',
          spawnedAt: new Date(),
          restartCount: 0,
          metadata: {
            ...config.metadata,
            command: config.command,
            args: config.args
          }
        };

        // Create IPC channel if enabled
        if (options.ipc || config.metadata?.enableIPC) {
          handle.ipc = IPCChannel.createForChild(childProcess, config.role);
        }

        // Clear spawn timeout
        clearTimeout(spawnTimeout);

        // Wait for process to be ready
        childProcess.once('spawn', () => {
          handle.status = 'running';
          resolve({ handle, childProcess });
        });

        // Handle spawn error
        childProcess.once('error', (error: Error) => {
          clearTimeout(spawnTimeout);
          handle.status = 'crashed';
          reject(error);
        });

      } catch (error) {
        clearTimeout(spawnTimeout);
        reject(error);
      }
    });
  }

  /**
   * Setup process event handlers
   */
  private setupProcessEvents(
    childProcess: any,
    handle: ProcessHandle,
    options: SpawnOptions
  ): void {
    // Handle process exit
    childProcess.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      handle.exitCode = code ?? undefined;
      handle.signal = signal ?? undefined;
      handle.status = code === 0 ? 'dead' : 'crashed';

      // Clean up IPC
      if (handle.ipc) {
        handle.ipc.close().catch(() => {});
      }

      // Call exit callback if provided
      if (options.onError && code !== 0) {
        options.onError(new Error(`Process exited with code ${code}`));
      }
    });

    // Handle uncaught exceptions
    childProcess.once('uncaughtException', (error: Error) => {
      handle.status = 'crashed';

      if (options.onError) {
        options.onError(error);
      }
    });

    // Handle stdout if piped
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        // Emit stdout event through handle
        (handle as any).emit?.('stdout', data.toString());
      });
    }

    // Handle stderr if piped
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        // Emit stderr event through handle
        (handle as any).emit?.('stderr', data.toString());
      });
    }

    // Store child process reference
    handle.childProcess = childProcess;
  }

  /**
   * Create detached daemon process
   */
  async spawnDaemon(config: ProcessConfig): Promise<ProcessHandle> {
    const daemonConfig: ProcessConfig = {
      ...config,
      detached: true,
      metadata: {
        ...config.metadata,
        daemon: true
      }
    };

    const handle = await this.spawn(daemonConfig, {
      detached: true,
      stdio: 'ignore'
    });

    // Unref to allow parent to exit
    if (handle.childProcess) {
      handle.childProcess.unref();
    }

    return handle;
  }

  /**
   * Spawn process pool
   */
  async spawnPool(
    role: ProcessRole,
    command: string,
    count: number,
    config?: Partial<ProcessConfig>
  ): Promise<ProcessHandle[]> {
    const baseConfig: ProcessConfig = {
      role,
      command,
      ...config
    };

    const promises = Array.from({ length: count }, (_, i) =>
      this.spawn({
        ...baseConfig,
        metadata: {
          ...baseConfig.metadata,
          poolIndex: i
        }
      })
    );

    return Promise.all(promises);
  }

  /**
   * Get all spawned processes
   */
  getAllProcesses(): ProcessHandle[] {
    return Array.from(this.processes.values());
  }

  /**
   * Remove process from registry
   */
  removeProcess(pid: number): void {
    this.processes.delete(pid);
  }

  /**
   * Get process count
   */
  getCount(): number {
    return this.processes.size;
  }
}

/**
 * Process Factory - Convenience methods for common process types
 */
export class ProcessFactory {
  private spawner: ProcessSpawner;

  constructor(spawner: ProcessSpawner) {
    this.spawner = spawner;
  }

  /**
   * Spawn Ultra-Lead process
   */
  async spawnUltraLead(options: {
    workspacePath: string;
    sessionId: string;
  }): Promise<ProcessHandle> {
    return this.spawner.spawn({
      role: 'ultra-lead',
      command: process.execPath,
      args: ['dist/session/ultra-lead.js', options.workspacePath, options.sessionId],
      env: {
        ULTRA_ROLE: 'ultra-lead',
        ULTRA_SESSION: options.sessionId,
        ULTRA_WORKSPACE: options.workspacePath
      },
      autoRestart: true,
      maxRestarts: 3,
      healthCheck: {
        type: 'heartbeat',
        interval: 30000,
        timeout: 5000,
        threshold: 3
      }
    }, { ipc: true });
  }

  /**
   * Spawn Autoloop process
   */
  async spawnAutoloop(options: {
    workspacePath: string;
    domainId?: string;
  }): Promise<ProcessHandle> {
    return this.spawner.spawnDaemon({
      role: 'autoloop',
      command: process.execPath,
      args: ['dist/execution/autoloop.js', options.workspacePath],
      env: {
        ULTRA_ROLE: 'autoloop',
        ULTRA_DOMAIN: options.domainId || 'default',
        ULTRA_WORKSPACE: options.workspacePath
      },
      detached: true,
      autoRestart: true,
      maxRestarts: 5,
      healthCheck: {
        type: 'heartbeat',
        interval: 60000,
        timeout: 10000,
        threshold: 5
      }
    });
  }

  /**
   * Spawn worker process
   */
  async spawnWorker(options: {
    taskId: string;
    agentId: string;
    workspacePath: string;
  }): Promise<ProcessHandle> {
    return this.spawner.spawn({
      role: 'worker',
      command: process.execPath,
      args: ['dist/agent-bridge/worker.js', options.taskId, options.agentId],
      env: {
        ULTRA_ROLE: 'worker',
        ULTRA_TASK: options.taskId,
        ULTRA_AGENT: options.agentId,
        ULTRA_WORKSPACE: options.workspacePath
      },
      autoRestart: false,
      healthCheck: {
        type: 'heartbeat',
        interval: 15000,
        timeout: 3000,
        threshold: 2
      }
    }, { ipc: true });
  }
}
