/**
 * wshobson Monitoring System
 *
 * Implements production-grade monitoring with anomaly detection, performance tracking,
 * and OpenTelemetry integration. Provides real-time dashboard data and alerting.
 *
 * Key features:
 * - Automatic delegation lifecycle tracking
 * - Agent performance monitoring
 * - Anomaly detection (error spikes, latency increases)
 * - OpenTelemetry integration (optional)
 * - Dashboard data export
 * - Configurable sampling rate
 * - Alert thresholds
 *
 * @example
 * ```typescript
 * const monitoring = new MonitoringService({
 *   metricsEndpoint: 'https://otel-collector:4318/v1/metrics',
 *   logLevel: 'info',
 *   samplingRate: 1.0  // 100% sampling
 * });
 *
 * // Track delegation
 * await monitoring.trackDelegation({
 *   agentName: 'business-analyst',
 *   task: 'Analyze requirements',
 *   success: true,
 *   duration: 1234
 * });
 *
 * // Get dashboard data
 * const dashboard = monitoring.getDashboard();
 * console.log(dashboard);
 * ```
 */

import { MetricsCollector, type Metric } from './metrics.js';
import { TraceManager } from './tracing.js';
import type { DelegationResult } from './delegator.js';

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  /**
   * OpenTelemetry metrics collector endpoint
   * If provided, metrics will be automatically exported
   */
  metricsEndpoint?: string;

  /**
   * Log level for monitoring logs
   * Default: 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Sampling rate for delegation tracking (0.0 to 1.0)
   * 1.0 = track all delegations
   * 0.1 = track 10% of delegations
   * Default: 1.0
   */
  samplingRate?: number;

  /**
   * Alert thresholds
   */
  alerts?: {
    /**
     * Error rate threshold (0.0 to 1.0)
     * Default: 0.1 (10%)
     */
    errorRateThreshold?: number;

    /**
     * Latency threshold in milliseconds
     * Default: 5000 (5 seconds)
     */
    latencyThreshold?: number;

    /**
     * Minimum success rate (0.0 to 1.0)
     * Default: 0.9 (90%)
     */
    minSuccessRate?: number;

    /**
     * Maximum queue depth
     * Default: 100
     */
    maxQueueDepth?: number;
  };

  /**
   * Whether to enable anomaly detection
   * Default: true
   */
  enableAnomalyDetection?: boolean;

  /**
   * Window size for anomaly detection (number of samples)
   * Default: 100
   */
  anomalyWindow?: number;
}

/**
 * Delegation record for tracking
 */
interface DelegationRecord {
  /**
   * Trace ID
   */
  traceId: string;

  /**
   * Agent name
   */
  agentName: string;

  /**
   * Task description
   */
  task: string;

  /**
   * Whether delegation succeeded
   */
  success: boolean;

  /**
   * Execution duration in milliseconds
   */
  duration: number;

  /**
   * Error code (if failed)
   */
  errorCode?: string;

  /**
   * Timestamp
   */
  timestamp: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  /**
   * Type of anomaly
   */
  type: 'error_spike' | 'latency_increase' | 'success_drop' | 'queue_overflow';

  /**
   * Severity level
   */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Current value
   */
  currentValue: number;

  /**
   * Threshold value
   */
  threshold: number;

  /**
   * When the anomaly was detected
   */
  timestamp: number;

  /**
   * Additional context
   */
  context?: Record<string, any>;
}

/**
 * Dashboard data export
 */
export interface DashboardData {
  /**
   * Total number of delegations
   */
  totalDelegations: number;

  /**
   * Number of successful delegations
   */
  successfulDelegations: number;

  /**
   * Number of failed delegations
   */
  failedDelegations: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average latency in milliseconds
   */
  avgLatency: number;

  /**
   * P50 latency in milliseconds
   */
  p50Latency: number;

  /**
   * P95 latency in milliseconds
   */
  p95Latency: number;

  /**
   * P99 latency in milliseconds
   */
  p99Latency: number;

  /**
   * Number of currently active agents
   */
  activeAgents: number;

  /**
   * Error rate (0-1)
   */
  errorRate: number;

  /**
   * Current queue depth
   */
  queueDepth: number;

  /**
   * Throughput (delegations per second)
   */
  throughput: number;

  /**
   * Active anomalies
   */
  anomalies: Anomaly[];

  /**
   * Top agents by delegation count
   */
  topAgents: Array<{
    name: string;
    count: number;
    successRate: number;
    avgLatency: number;
  }>;

  /**
   * Recent errors
   */
  recentErrors: Array<{
    errorCode: string;
    agentName: string;
    message: string;
    timestamp: number;
  }>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<MonitoringConfig> = {
  metricsEndpoint: '',
  logLevel: 'info',
  samplingRate: 1.0,
  alerts: {
    errorRateThreshold: 0.1,
    latencyThreshold: 5000,
    minSuccessRate: 0.9,
    maxQueueDepth: 100,
  },
  enableAnomalyDetection: true,
  anomalyWindow: 100,
};

/**
 * Monitoring Service
 *
 * Provides production-grade monitoring for the wshobson system.
 */
export class MonitoringService {
  private config: Required<MonitoringConfig>;
  private metrics: MetricsCollector;
  private tracer?: TraceManager;
  private delegations: DelegationRecord[];
  private anomalies: Anomaly[];
  private startTime: number;

  /**
   * Create a new monitoring service
   *
   * @param config - Configuration options
   * @param tracer - Optional trace manager for distributed tracing
   */
  constructor(config: MonitoringConfig = {}, tracer?: TraceManager) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.alerts) {
      this.config.alerts = { ...DEFAULT_CONFIG.alerts, ...config.alerts };
    }

    this.metrics = new MetricsCollector({ enabled: true });
    this.tracer = tracer;
    this.delegations = [];
    this.anomalies = [];
    this.startTime = Date.now();

    // Initialize monitoring metrics
    this.initializeMetrics();
  }

  /**
   * Track a delegation lifecycle
   *
   * Automatically tracks metrics and detects anomalies.
   *
   * @param result - Delegation result from WshobsonDelegator
   *
   * @example
   * ```typescript
   * const result = await delegator.delegateToAgent('analyst', task, context);
   * await monitoring.trackDelegation(result);
   * ```
   */
  async trackDelegation(result: DelegationResult): Promise<void> {
    // Apply sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    const record: DelegationRecord = {
      traceId: result.traceId || 'unknown',
      agentName: result.agentName,
      task: result.output || '',
      success: result.success,
      duration: result.duration,
      errorCode: result.error?.code,
      timestamp: Date.now(),
      metadata: result.metadata,
    };

    // Store delegation record
    this.delegations.push(record);

    // Update metrics
    this.updateMetrics(result);

    // Check for anomalies
    if (this.config.enableAnomalyDetection) {
      await this.detectAnomalies();
    }

    // Log if debug mode
    if (this.config.logLevel === 'debug') {
      this.logDebug(result);
    }
  }

  /**
   * Track agent performance
   *
   * @param agentName - Agent name
   * @param success - Whether operation succeeded
   * @param duration - Operation duration in milliseconds
   *
   * @example
   * ```typescript
   * await monitoring.trackAgentPerformance('business-analyst', true, 1234);
   * ```
   */
  trackAgentPerformance(
    agentName: string,
    success: boolean,
    duration: number
  ): void {
    // Track agent-specific metrics
    this.metrics.counter(
      'agent_delegations_total',
      1,
      { agent: agentName }
    );

    if (success) {
      this.metrics.counter(
        'agent_successes_total',
        1,
        { agent: agentName }
      );
    } else {
      this.metrics.counter(
        'agent_errors_total',
        1,
        { agent: agentName }
      );
    }

    this.metrics.histogram(
      'agent_duration_ms',
      duration,
      { agent: agentName }
    );
  }

  /**
   * Get current dashboard data
   *
   * Returns a snapshot of current system state for dashboard display.
   *
   * @returns Dashboard data
   *
   * @example
   * ```typescript
   * const dashboard = monitoring.getDashboard();
   * console.log(`Success rate: ${dashboard.successRate * 100}%`);
   * console.log(`Average latency: ${dashboard.avgLatency}ms`);
   * ```
   */
  getDashboard(): DashboardData {
    const totalDelegations = this.delegations.length;
    const successfulDelegations = this.delegations.filter(d => d.success).length;
    const failedDelegations = totalDelegations - successfulDelegations;

    const successRate = totalDelegations > 0
      ? successfulDelegations / totalDelegations
      : 1.0;

    const errorRate = totalDelegations > 0
      ? failedDelegations / totalDelegations
      : 0.0;

    const durations = this.delegations.map(d => d.duration);
    const avgLatency = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Calculate percentiles
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p50Latency = this.getPercentile(sortedDurations, 50);
    const p95Latency = this.getPercentile(sortedDurations, 95);
    const p99Latency = this.getPercentile(sortedDurations, 99);

    // Calculate throughput (delegations per second)
    const elapsed = (Date.now() - this.startTime) / 1000;
    const throughput = elapsed > 0 ? totalDelegations / elapsed : 0;

    // Get active agents from metrics
    const activeAgents = this.metrics.getGauge('active_agents');

    // Get queue depth from metrics
    const queueDepth = this.metrics.getGauge('queue_depth');

    // Get top agents
    const topAgents = this.getTopAgents();

    // Get recent errors
    const recentErrors = this.getRecentErrors();

    return {
      totalDelegations,
      successfulDelegations,
      failedDelegations,
      successRate,
      avgLatency,
      p50Latency,
      p95Latency,
      p99Latency,
      activeAgents,
      errorRate,
      queueDepth,
      throughput,
      anomalies: [...this.anomalies],
      topAgents,
      recentErrors,
    };
  }

  /**
   * Export metrics in Prometheus format
   *
   * @returns Prometheus-formatted metrics string
   */
  exportMetrics(): string {
    return this.metrics.export();
  }

  /**
   * Get metrics collector instance
   *
   * Useful for custom metric recording.
   *
   * @returns Metrics collector
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Get active anomalies
   *
   * @returns Array of active anomalies
   */
  getAnomalies(): Anomaly[] {
    return [...this.anomalies];
  }

  /**
   * Clear anomalies
   *
   * Useful after acknowledging alerts.
   */
  clearAnomalies(): void {
    this.anomalies = [];
  }

  /**
   * Update monitoring configuration
   *
   * @param updates - Configuration updates
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.alerts) {
      this.config.alerts = { ...this.config.alerts, ...updates.alerts };
    }
  }

  /**
   * Get monitoring statistics
   *
   * @returns Statistics about the monitoring system
   */
  async getStats(): Promise<{
    uptime: number;
    delegationsTracked: number;
    anomaliesDetected: number;
    samplingRate: number;
    metricsCount: number;
  }> {
    const metricsStats = await this.metrics.getStats();

    return {
      uptime: Date.now() - this.startTime,
      delegationsTracked: this.delegations.length,
      anomaliesDetected: this.anomalies.length,
      samplingRate: this.config.samplingRate,
      metricsCount: metricsStats.totalMetrics,
    };
  }

  /**
   * Clear all monitoring data
   *
   * Useful for testing or reset.
   */
  async clearAll(): Promise<void> {
    await this.metrics.clearAll();
    this.delegations = [];
    this.anomalies = [];
    this.startTime = Date.now();
    this.initializeMetrics();
  }

  /**
   * Initialize monitoring metrics
   */
  private initializeMetrics(): void {
    // Counter metrics
    this.metrics.counter('delegations_total', 0);
    this.metrics.counter('errors_total', 0);
    this.metrics.counter('successes_total', 0);
    this.metrics.counter('timeouts_total', 0);
    this.metrics.counter('retries_total', 0);

    // Gauge metrics
    this.metrics.gauge('active_agents', 0);
    this.metrics.gauge('active_delegations', 0);
    this.metrics.gauge('queue_depth', 0);
    this.metrics.gauge('memory_usage_mb', 0);
    this.metrics.gauge('cpu_usage_percent', 0);

    // Histogram metrics
    this.metrics.histogram('delegation_duration_ms', 0);
    this.metrics.histogram('agent_execution_ms', 0);
    this.metrics.histogram('response_size_bytes', 0);
    this.metrics.histogram('queue_wait_time_ms', 0);
  }

  /**
   * Update metrics from delegation result
   */
  private updateMetrics(result: DelegationResult): void {
    // Update counters
    this.metrics.increment('delegations_total', { agent: result.agentName });

    if (result.success) {
      this.metrics.increment('successes_total', { agent: result.agentName });
    } else {
      this.metrics.increment('errors_total', {
        agent: result.agentName,
        error_code: result.error?.code || 'unknown',
      });
    }

    // Update latency histogram
    this.metrics.histogram('delegation_duration_ms', result.duration, {
      agent: result.agentName,
      status: result.success ? 'success' : 'error',
    });

    // Update agent-specific metrics
    this.trackAgentPerformance(result.agentName, result.success, result.duration);
  }

  /**
   * Detect anomalies in delegation patterns
   */
  private async detectAnomalies(): Promise<void> {
    const window = this.delegations.slice(-this.config.anomalyWindow);
    if (window.length < 10) return;  // Need minimum samples

    const errors = window.filter(d => !d.success);
    const errorRate = errors.length / window.length;
    const avgLatency = window.reduce((sum, d) => sum + d.duration, 0) / window.length;

    // Clear old anomalies
    this.anomalies = this.anomalies.filter(
      a => Date.now() - a.timestamp < 300000  // Keep for 5 minutes
    );

    // Check error rate threshold
    if (this.config.alerts && errorRate > (this.config.alerts.errorRateThreshold || 0.1)) {
      this.addAnomaly({
        type: 'error_spike',
        severity: errorRate > 0.5 ? 'critical' : 'high',
        message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${((this.config.alerts.errorRateThreshold || 0.1) * 100).toFixed(1)}%`,
        currentValue: errorRate,
        threshold: this.config.alerts.errorRateThreshold || 0.1,
        timestamp: Date.now(),
        context: { windowSize: window.length, errorCount: errors.length },
      });
    }

    // Check latency threshold
    if (this.config.alerts && avgLatency > (this.config.alerts.latencyThreshold || 5000)) {
      this.addAnomaly({
        type: 'latency_increase',
        severity: avgLatency > (this.config.alerts.latencyThreshold || 5000) * 2 ? 'critical' : 'medium',
        message: `Average latency ${avgLatency.toFixed(0)}ms exceeds threshold ${this.config.alerts.latencyThreshold || 5000}ms`,
        currentValue: avgLatency,
        threshold: this.config.alerts.latencyThreshold || 5000,
        timestamp: Date.now(),
        context: { windowSize: window.length },
      });
    }

    // Check success rate threshold
    const successRate = 1 - errorRate;
    if (this.config.alerts && successRate < (this.config.alerts.minSuccessRate || 0.9)) {
      this.addAnomaly({
        type: 'success_drop',
        severity: successRate < 0.5 ? 'critical' : 'high',
        message: `Success rate ${(successRate * 100).toFixed(1)}% below minimum ${((this.config.alerts.minSuccessRate || 0.9) * 100).toFixed(1)}%`,
        currentValue: successRate,
        threshold: this.config.alerts.minSuccessRate || 0.9,
        timestamp: Date.now(),
        context: { windowSize: window.length },
      });
    }
  }

  /**
   * Add an anomaly
   */
  private addAnomaly(anomaly: Anomaly): void {
    // Check for similar recent anomaly
    const exists = this.anomalies.some(
      a => a.type === anomaly.type && Date.now() - a.timestamp < 60000
    );

    if (!exists) {
      this.anomalies.push(anomaly);
      this.logAlert(anomaly);
    }
  }

  /**
   * Get top agents by delegation count
   */
  private getTopAgents(): Array<{
    name: string;
    count: number;
    successRate: number;
    avgLatency: number;
  }> {
    const agentStats = new Map<string, {
      count: number;
      successes: number;
      totalDuration: number;
    }>();

    for (const delegation of this.delegations) {
      let stats = agentStats.get(delegation.agentName);
      if (!stats) {
        stats = { count: 0, successes: 0, totalDuration: 0 };
        agentStats.set(delegation.agentName, stats);
      }

      stats.count++;
      if (delegation.success) {
        stats.successes++;
      }
      stats.totalDuration += delegation.duration;
    }

    return Array.from(agentStats.entries())
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        successRate: stats.count > 0 ? stats.successes / stats.count : 0,
        avgLatency: stats.count > 0 ? stats.totalDuration / stats.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);  // Top 10
  }

  /**
   * Get recent errors
   */
  private getRecentErrors(): Array<{
    errorCode: string;
    agentName: string;
    message: string;
    timestamp: number;
  }> {
    return this.delegations
      .filter(d => !d.success && d.errorCode)
      .slice(-20)
      .map(d => ({
        errorCode: d.errorCode!,
        agentName: d.agentName,
        message: d.errorCode || 'Unknown error',
        timestamp: d.timestamp,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Calculate percentile
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Log debug information
   */
  private logDebug(result: DelegationResult): void {
    console.debug('[Monitoring]', {
      agent: result.agentName,
      success: result.success,
      duration: result.duration,
      traceId: result.traceId,
    });
  }

  /**
   * Log alert
   */
  private logAlert(anomaly: Anomaly): void {
    const level = anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'error' : 'warn';
    console[level](`[Monitoring Alert] ${anomaly.message}`, {
      type: anomaly.type,
      severity: anomaly.severity,
      currentValue: anomaly.currentValue,
      threshold: anomaly.threshold,
    });
  }

  /**
   * Export to OpenTelemetry (if endpoint configured)
   *
   * @returns Promise that resolves when export completes
   */
  async exportToOpenTelemetry(): Promise<void> {
    if (!this.config.metricsEndpoint) {
      return;
    }

    try {
      const metrics = this.exportMetrics();

      const response = await fetch(this.config.metricsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: metrics,
      });

      if (!response.ok) {
        console.warn(`Failed to export metrics to OpenTelemetry: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`Error exporting metrics to OpenTelemetry: ${error}`);
    }
  }
}

/**
 * Create a monitoring service
 *
 * Factory function for creating a monitoring service with default configuration.
 *
 * @param config - Configuration options
 * @param tracer - Optional trace manager for distributed tracing
 * @returns Configured monitoring service
 *
 * @example
 * ```typescript
 * const monitoring = createMonitoringService({
 *   samplingRate: 0.5,
 *   enableAnomalyDetection: true
 * }, tracer);
 * ```
 */
export function createMonitoringService(
  config?: MonitoringConfig,
  tracer?: TraceManager
): MonitoringService {
  return new MonitoringService(config, tracer);
}
