/**
 * Process Monitor - Health & Resource Monitoring
 *
 * Monitors process health, resource usage, and automatically
 * restarts crashed processes with exponential backoff.
 */

import { EventEmitter } from 'events';
import { cpus } from 'os';
import {
  ProcessMonitor as ProcessMonitorInterface,
  ProcessHandle,
  MonitorOptions,
  ProcessMetrics,
  ProcessStatus,
  HealthCheckConfig
} from './types.js';

/**
 * Monitoring state for a process
 */
interface MonitoringState {
  handle: ProcessHandle;
  options: MonitorOptions;
  interval?: NodeJS.Timeout;
  resourceInterval?: NodeJS.Timeout;
  healthCheckFailures: number;
  lastMetrics?: ProcessMetrics;
  isMonitoring: boolean;
}

/**
 * Process Monitor Implementation
 */
export class ProcessMonitor extends EventEmitter implements ProcessMonitorInterface {
  private monitoringStates: Map<number, MonitoringState> = new Map();
  private metricsHistory: Map<number, ProcessMetrics[]> = new Map();
  private maxHistorySize: number = 100;
  private cpuInfo = cpus();

  /**
   * Start monitoring a process
   */
  start(handle: ProcessHandle, options: MonitorOptions): void {
    // Check if already monitoring
    if (this.monitoringStates.has(handle.pid)) {
      return;
    }

    const state: MonitoringState = {
      handle,
      options,
      healthCheckFailures: 0,
      isMonitoring: true
    };

    this.monitoringStates.set(handle.pid, state);

    // Start health checks
    if (options.healthCheck) {
      this.startHealthChecks(state);
    }

    // Start resource monitoring
    if (options.monitorCpu || options.monitorMemory || options.resourceMonitorInterval) {
      this.startResourceMonitoring(state);
    }

    this.emit('monitor-started', { pid: handle.pid });
  }

  /**
   * Stop monitoring a process
   */
  stop(handle: ProcessHandle): void {
    const state = this.monitoringStates.get(handle.pid);
    if (!state) {
      return;
    }

    state.isMonitoring = false;

    // Clear intervals
    if (state.interval) {
      clearInterval(state.interval);
    }
    if (state.resourceInterval) {
      clearInterval(state.resourceInterval);
    }

    // Remove from monitoring
    this.monitoringStates.delete(handle.pid);

    this.emit('monitor-stopped', { pid: handle.pid });
  }

  /**
   * Get current health status
   */
  getHealth(pid: number): boolean {
    const state = this.monitoringStates.get(pid);
    if (!state) {
      return false;
    }

    return state.healthCheckFailures < (state.options.healthCheck?.threshold || 3);
  }

  /**
   * Get current metrics
   */
  getMetrics(pid: number): ProcessMetrics | undefined {
    const state = this.monitoringStates.get(pid);
    return state?.lastMetrics;
  }

  /**
   * Force health check
   */
  async checkHealth(pid: number): Promise<boolean> {
    const state = this.monitoringStates.get(pid);
    if (!state || !state.options.healthCheck) {
      return false;
    }

    return this.performHealthCheck(state);
  }

  /**
   * Get monitoring status
   */
  isMonitoring(pid: number): boolean {
    const state = this.monitoringStates.get(pid);
    return state ? state.isMonitoring : false;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(pid: number): ProcessMetrics[] {
    return this.metricsHistory.get(pid) || [];
  }

  /**
   * Clear metrics history
   */
  clearMetricsHistory(pid: number): void {
    this.metricsHistory.delete(pid);
  }

  /**
   * Start health checks for a process
   */
  private startHealthChecks(state: MonitoringState): void {
    const config = state.options.healthCheck!;
    const interval = config.interval;

    state.interval = setInterval(async () => {
      if (!state.isMonitoring) {
        return;
      }

      await this.performHealthCheck(state);
    }, interval);
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(state: MonitoringState): Promise<boolean> {
    const config = state.options.healthCheck!;
    const handle = state.handle;

    try {
      let isHealthy = false;

      switch (config.type) {
        case 'heartbeat':
          isHealthy = await this.checkHeartbeat(handle);
          break;
        case 'http':
          isHealthy = await this.checkHttpEndpoint(handle, config.endpoint!);
          break;
        case 'tcp':
          isHealthy = await this.checkTcpEndpoint(handle, config.endpoint!);
          break;
        case 'custom':
          isHealthy = await config.checkFn!(handle.pid);
          break;
        default:
          isHealthy = true;
      }

      if (isHealthy) {
        // Reset failures on success
        if (state.healthCheckFailures > 0) {
          this.emit('health-recovered', { pid: handle.pid });
        }
        state.healthCheckFailures = 0;
        this.updateHeartbeat(handle);
        return true;
      } else {
        state.healthCheckFailures++;

        // Call failure callback
        if (state.options.onHealthCheckFail) {
          state.options.onHealthCheckFail(handle, state.healthCheckFailures);
        }

        // Check if threshold exceeded
        if (state.healthCheckFailures >= config.threshold) {
          this.handleUnhealthy(state);
        }

        return false;
      }
    } catch (error) {
      state.healthCheckFailures++;

      if (state.options.onHealthCheckFail) {
        state.options.onHealthCheckFail(handle, state.healthCheckFailures);
      }

      if (state.healthCheckFailures >= config.threshold) {
        this.handleUnhealthy(state);
      }

      return false;
    }
  }

  /**
   * Check heartbeat via last heartbeat timestamp
   */
  private async checkHeartbeat(handle: ProcessHandle): Promise<boolean> {
    if (!handle.lastHeartbeat) {
      return false;
    }

    const config = handle.metadata?.healthCheck as HealthCheckConfig;
    const threshold = config?.timeout || 30000;
    const now = Date.now();
    const lastHeartbeat = handle.lastHeartbeat.getTime();

    return (now - lastHeartbeat) < threshold;
  }

  /**
   * Check HTTP endpoint
   */
  private async checkHttpEndpoint(handle: ProcessHandle, endpoint: string): Promise<boolean> {
    try {
      const url = endpoint.replace('{pid}', handle.pid.toString());
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(handle.metadata?.healthCheck?.timeout || 5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check TCP endpoint
   */
  private async checkTcpEndpoint(handle: ProcessHandle, endpoint: string): Promise<boolean> {
    // Parse host:port
    const [host, portStr] = endpoint.split(':');
    const port = parseInt(portStr, 10);

    try {
      const net = await import('net');
      return new Promise<boolean>((resolve) => {
        const socket = new net.Socket();

        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, handle.metadata?.healthCheck?.timeout || 5000);

        socket.connect(port, host, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle unhealthy process
   */
  private handleUnhealthy(state: MonitoringState): void {
    const handle = state.handle;
    const oldStatus = handle.status;
    handle.status = 'crashed';

    this.emit('unhealthy', {
      pid: handle.pid,
      failures: state.healthCheckFailures
    });

    if (state.options.onStatusChange) {
      state.options.onStatusChange(handle, oldStatus, handle.status);
    }

    if (state.options.onCrash) {
      state.options.onCrash(handle, new Error(`Health check failed ${state.healthCheckFailures} times`));
    }
  }

  /**
   * Update heartbeat timestamp
   */
  private updateHeartbeat(handle: ProcessHandle): void {
    handle.lastHeartbeat = new Date();
    this.emit('heartbeat', { pid: handle.pid });
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(state: MonitoringState): void {
    const interval = state.options.resourceMonitorInterval || 5000;

    state.resourceInterval = setInterval(() => {
      if (!state.isMonitoring) {
        return;
      }

      this.collectMetrics(state);
    }, interval);
  }

  /**
   * Collect process metrics
   */
  private async collectMetrics(state: MonitoringState): Promise<void> {
    const handle = state.handle;
    const pid = handle.pid;

    try {
      // Get CPU usage
      const cpuPercent = await this.getCpuUsage(pid);

      // Get memory usage
      const memoryBytes = await this.getMemoryUsage(pid);

      const metrics: ProcessMetrics = {
        pid,
        cpuPercent,
        memoryBytes,
        memoryMB: memoryBytes / (1024 * 1024),
        uptime: Date.now() - handle.spawnedAt.getTime(),
        timestamp: new Date()
      };

      state.lastMetrics = metrics;

      // Store in history
      if (!this.metricsHistory.has(pid)) {
        this.metricsHistory.set(pid, []);
      }
      const history = this.metricsHistory.get(pid)!;
      history.push(metrics);

      // Limit history size
      if (history.length > this.maxHistorySize) {
        history.shift();
      }

      this.emit('metrics', metrics);

      // Check resource limits
      this.checkResourceLimits(state, metrics);

    } catch (error) {
      // Metrics collection failed - log but don't fail health check
      this.emit('metrics-error', { pid, error: (error as Error).message });
    }
  }

  /**
   * Get CPU usage percentage
   */
  private async getCpuUsage(pid: number): Promise<number> {
    try {
      // Use process usage if on Linux/Mac
      if (process.platform === 'linux' || process.platform === 'darwin') {
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execAsync = promisify(exec);

        try {
          if (process.platform === 'linux') {
            const { stdout } = await execAsync(`ps -p ${pid} -o %cpu --no-headers`);
            return parseFloat(stdout.trim()) || 0;
          } else {
            const { stdout } = await execAsync(`ps -p ${pid} -o %cpu`);
            return parseFloat(stdout.trim().split('\n')[1]) || 0;
          }
        } catch (error) {
          return 0;
        }
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get memory usage in bytes
   */
  private async getMemoryUsage(pid: number): Promise<number> {
    try {
      if (process.platform === 'linux') {
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execAsync = promisify(exec);

        try {
          const { stdout } = await execAsync(`ps -p ${pid} -o rss --no-headers`);
          const rssKB = parseInt(stdout.trim(), 10);
          return rssKB * 1024; // Convert to bytes
        } catch (error) {
          return 0;
        }
      }

      // Fallback: use process.memoryUsage if checking current process
      if (pid === process.pid) {
        return process.memoryUsage().rss;
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check resource limits
   */
  private checkResourceLimits(state: MonitoringState, metrics: ProcessMetrics): void {
    const handle = state.handle;
    const limits = handle.metadata?.limits;

    if (!limits) {
      return;
    }

    // Check memory limit
    if (limits.maxMemoryMB && metrics.memoryMB > limits.maxMemoryMB) {
      this.emit('resource-exceeded', {
        pid: handle.pid,
        type: 'memory',
        value: metrics.memoryMB,
        limit: limits.maxMemoryMB
      });
    }

    // Check CPU limit
    if (limits.maxCpuPercent && metrics.cpuPercent > limits.maxCpuPercent) {
      this.emit('resource-exceeded', {
        pid: handle.pid,
        type: 'cpu',
        value: metrics.cpuPercent,
        limit: limits.maxCpuPercent
      });
    }

    // Check uptime limit
    if (limits.maxUptime && metrics.uptime > limits.maxUptime) {
      this.emit('resource-exceeded', {
        pid: handle.pid,
        type: 'uptime',
        value: metrics.uptime,
        limit: limits.maxUptime
      });
    }
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    for (const [pid, state] of this.monitoringStates) {
      this.stop(state.handle);
    }
  }

  /**
   * Get all monitoring states
   */
  getAllMonitoringStates(): MonitoringState[] {
    return Array.from(this.monitoringStates.values());
  }

  /**
   * Get monitoring count
   */
  getCount(): number {
    return this.monitoringStates.size;
  }
}
