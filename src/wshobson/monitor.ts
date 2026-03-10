/**
 * wshobson Agent Integration - Comprehensive Monitoring System
 *
 * Implements detailed logging, metrics collection, and monitoring for the
 * agent delegation system. Part of Phase 5: Robustness & Performance.
 */

import { EventEmitter } from 'events';
import { TraceContext, Agent, DelegationResult } from './types';

/**
 * Performance metrics for a single operation
 */
export interface PerformanceMetrics {
  operation: string;
  agent: string;
  traceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * Agent status snapshot
 */
export interface AgentStatus {
  agent: string;
  status: 'idle' | 'working' | 'failed';
  lastUsed: number;
  successRate: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  failureCount: number;
}

/**
 * System-wide metrics
 */
export interface SystemMetrics {
  timestamp: number;
  agents: {
    total: number;
    idle: number;
    working: number;
    failed: number;
  };
  operations: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  performance: {
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    avgLatency: number;
  };
  circuitBreaker: {
    closed: number;
    open: number;
    halfOpen: number;
  };
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
  };
}

/**
 * Log entry with context
 */
export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  traceId?: string;
  agent?: string;
  metadata: Record<string, any>;
}

/**
 * Monitoring configuration
 */
export interface MonitorConfig {
  /** Enable console logging */
  consoleEnabled?: boolean;
  /** Enable file logging */
  fileEnabled?: boolean;
  /** Log file path */
  logFilePath?: string;
  /** Metrics retention period (ms) */
  retentionPeriod?: number;
  /** Enable OpenTelemetry integration */
  openTelemetryEnabled?: boolean;
  /** Metrics collection interval (ms) */
  metricsInterval?: number;
}

/**
 * Monitoring system for agent delegation
 */
export class Monitor extends EventEmitter {
  private performanceHistory: PerformanceMetrics[] = [];
  private logEntries: LogEntry[] = [];
  private config: Required<MonitorConfig>;
  private metricsInterval?: NodeJS.Timeout;
  private operationCounters = {
    total: 0,
    successful: 0,
    failed: 0,
  };
  private latencySamples: number[] = [];

  constructor(config: MonitorConfig = {}) {
    super();

    this.config = {
      consoleEnabled: config.consoleEnabled ?? true,
      fileEnabled: config.fileEnabled ?? false,
      logFilePath: config.logFilePath ?? '.ultra/wshobson-monitor.log',
      retentionPeriod: config.retentionPeriod ?? 3600000, // 1 hour
      openTelemetryEnabled: config.openTelemetryEnabled ?? false,
      metricsInterval: config.metricsInterval ?? 60000, // 1 minute
    };

    // Start periodic metrics collection
    this.startMetricsCollection();

    // Clean up old data periodically
    setInterval(() => this.cleanupOldData(), this.config.retentionPeriod);
  }

  /**
   * Record a delegation operation
   */
  recordOperation(result: DelegationResult): void {
    const metrics: PerformanceMetrics = {
      operation: 'delegation',
      agent: result.agent,
      traceId: result.traceId,
      startTime: Date.now() - result.duration,
      endTime: Date.now(),
      duration: result.duration,
      success: result.success,
      error: result.error?.message,
      metadata: {},
    };

    this.performanceHistory.push(metrics);
    this.latencySamples.push(result.duration);

    // Update counters
    this.operationCounters.total++;
    if (result.success) {
      this.operationCounters.successful++;
    } else {
      this.operationCounters.failed++;
    }

    // Log the operation
    this.log({
      level: result.success ? 'info' : 'error',
      message: `Delegation to ${result.agent} ${result.success ? 'succeeded' : 'failed'}`,
      traceId: result.traceId,
      agent: result.agent,
      metadata: {
        duration: result.duration,
        error: result.error?.message,
      },
    });

    // Emit event for real-time monitoring
    this.emit('operation', metrics);

    // OpenTelemetry integration
    if (this.config.openTelemetryEnabled) {
      this.recordOpenTelemetrySpan(metrics);
    }
  }

  /**
   * Record agent status change
   */
  recordAgentStatus(agent: Agent, status: 'idle' | 'working' | 'failed'): void {
    this.log({
      level: 'debug',
      message: `Agent ${agent.name} status changed to ${status}`,
      agent: agent.name,
      metadata: {
        plugin: agent.plugin,
        successRate: agent.successRate,
      },
    });

    this.emit('agentStatus', {
      agent: agent.name,
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerState(
    agent: string,
    state: 'closed' | 'open' | 'half-open',
    metadata?: Record<string, any>
  ): void {
    this.log({
      level: state === 'open' ? 'warn' : 'info',
      message: `Circuit breaker for ${agent} is now ${state}`,
      agent,
      metadata: metadata || {},
    });

    this.emit('circuitBreaker', {
      agent,
      state,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: 'hit' | 'miss' | 'eviction',
    metadata?: Record<string, any>
  ): void {
    this.log({
      level: 'debug',
      message: `Cache ${operation}`,
      metadata: metadata || {},
    });

    this.emit('cache', {
      operation,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const sortedLatencies = [...this.latencySamples].sort((a, b) => a - b);
    const p50Index = Math.floor(sortedLatencies.length * 0.5);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    return {
      timestamp: Date.now(),
      agents: {
        total: 0, // Populated by registry
        idle: 0,
        working: 0,
        failed: 0,
      },
      operations: {
        total: this.operationCounters.total,
        successful: this.operationCounters.successful,
        failed: this.operationCounters.failed,
        successRate:
          this.operationCounters.total > 0
            ? this.operationCounters.successful / this.operationCounters.total
            : 1.0,
      },
      performance: {
        latencyP50: sortedLatencies[p50Index] || 0,
        latencyP95: sortedLatencies[p95Index] || 0,
        latencyP99: sortedLatencies[p99Index] || 0,
        avgLatency:
          this.latencySamples.length > 0
            ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
            : 0,
      },
      circuitBreaker: {
        closed: 0, // Populated by circuit breaker
        open: 0,
        halfOpen: 0,
      },
      cache: {
        hitRate: 0, // Populated by cache
        size: 0,
        evictions: 0,
      },
    };
  }

  /**
   * Get performance history for analysis
   */
  getPerformanceHistory(agent?: string, limit?: number): PerformanceMetrics[] {
    let history = this.performanceHistory;

    if (agent) {
      history = history.filter((m) => m.agent === agent);
    }

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Get recent log entries
   */
  getLogs(level?: string, limit?: number): LogEntry[] {
    let logs = this.logEntries;

    if (level) {
      logs = logs.filter((l) => l.level === level);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  /**
   * Log a message
   */
  private log(entry: LogEntry): void {
    const logEntry: LogEntry = {
      timestamp: Date.now(),
      ...entry,
    };

    this.logEntries.push(logEntry);

    // Console logging
    if (this.config.consoleEnabled) {
      const timestamp = new Date(logEntry.timestamp).toISOString();
      const prefix = `[${timestamp}] [${logEntry.level.toUpperCase()}]`;
      const context = logEntry.traceId ? ` [trace:${logEntry.traceId}]` : '';
      const agent = logEntry.agent ? ` [agent:${logEntry.agent}]` : '';
      const message = `${prefix}${context}${agent} ${logEntry.message}`;

      switch (logEntry.level) {
        case 'error':
          console.error(message, logEntry.metadata);
          break;
        case 'warn':
          console.warn(message, logEntry.metadata);
          break;
        case 'debug':
          console.debug(message, logEntry.metadata);
          break;
        default:
          console.log(message, logEntry.metadata);
      }
    }

    // File logging
    if (this.config.fileEnabled && this.config.logFilePath) {
      this.writeToLogFile(logEntry);
    }
  }

  /**
   * Write log entry to file
   */
  private async writeToLogFile(entry: LogEntry): Promise<void> {
    try {
      const fs = require('fs').promises;
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.config.logFilePath, line);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Record span to OpenTelemetry
   */
  private recordOpenTelemetrySpan(metrics: PerformanceMetrics): void {
    // OpenTelemetry integration would go here
    // For now, just log that it would be recorded
    this.log({
      level: 'debug',
      message: 'OpenTelemetry span recorded',
      metadata: { metrics },
    });
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getSystemMetrics();
      this.emit('metrics', metrics);

      // Log metrics summary
      this.log({
        level: 'info',
        message: 'System metrics update',
        metadata: {
          operations: metrics.operations,
          performance: metrics.performance,
        },
      });
    }, this.config.metricsInterval);
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;

    // Clean performance history
    this.performanceHistory = this.performanceHistory.filter(
      (m) => m.startTime > cutoff
    );

    // Clean log entries
    this.logEntries = this.logEntries.filter((l) => l.timestamp > cutoff);

    // Clean latency samples
    this.latencySamples = this.latencySamples.slice(-1000);
  }

  /**
   * Shutdown monitoring
   */
  shutdown(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.log({
      level: 'info',
      message: 'Monitoring system shutdown',
      metadata: {
        totalOperations: this.operationCounters.total,
        successRate:
          this.operationCounters.total > 0
            ? this.operationCounters.successful / this.operationCounters.total
            : 1.0,
      },
    });
  }
}

/**
 * Singleton monitoring instance
 */
let monitorInstance: Monitor | null = null;

/**
 * Get or create the monitoring singleton
 */
export function getMonitor(config?: MonitorConfig): Monitor {
  if (!monitorInstance) {
    monitorInstance = new Monitor(config);
  }
  return monitorInstance;
}

/**
 * Reset the monitoring singleton (for testing)
 */
export function resetMonitor(): void {
  if (monitorInstance) {
    monitorInstance.shutdown();
    monitorInstance = null;
  }
}
