/**
 * wshobson Metrics Collection System
 *
 * Implements comprehensive metrics collection for monitoring agent performance,
 * delegation operations, and system health. Provides Prometheus-compatible export
 * format for integration with observability platforms.
 *
 * Key features:
 * - Counter metrics for incrementing values (delegations, errors, successes)
 * - Gauge metrics for point-in-time values (active agents, queue depth)
 * - Histogram metrics for distributions (latency, response time)
 * - Timer utility for measuring duration
 * - Prometheus format export for scraping
 * - LRU eviction with configurable retention
 *
 * @example
 * ```typescript
 * const metrics = new MetricsCollector({
 *   enabled: true,
 *   exportInterval: 60000,  // 1 minute
 *   retention: 10000
 * });
 *
 * // Track delegation count
 * metrics.counter('delegations_total', 1, { agent: 'business-analyst' });
 *
 * // Track active agents
 * metrics.gauge('active_agents', 5);
 *
 * // Track latency
 * const timer = metrics.time('delegation_duration_ms');
 * await doDelegation();
 * timer();
 *
 * // Export in Prometheus format
 * const prometheus = metrics.export();
 * console.log(prometheus);
 * ```
 */

import { Mutex } from './mutex.js';

/**
 * Metric with all metadata
 */
export interface Metric {
  /**
   * Metric name (e.g., 'delegations_total')
   */
  name: string;

  /**
   * Metric value
   */
  value: number;

  /**
   * Unit of measurement (e.g., 'ms', 'count', 'bytes')
   */
  unit: string;

  /**
   * Timestamp when metric was recorded (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Labels for dimensional metrics (e.g., { agent: 'analyst', status: 'success' })
   */
  labels: Record<string, string>;
}

/**
 * Metric type
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric family for Prometheus export
 */
interface MetricFamily {
  name: string;
  type: MetricType;
  help: string;
  metrics: Array<{
    value: number;
    labels?: Record<string, string>;
  }>;
}

/**
 * Histogram bucket for distribution tracking
 */
interface HistogramBucket {
  le: string;  // Less than or equal to (e.g., "100", "+Inf")
  count: number;
}

/**
 * Histogram state for tracking distributions
 */
interface HistogramState {
  sum: number;
  count: number;
  buckets: HistogramBucket[];
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /**
   * Whether metrics collection is enabled
   * Default: true
   */
  enabled?: boolean;

  /**
   * Interval for automatic metric export (milliseconds)
   * Default: 60000 (1 minute)
   */
  exportInterval?: number;

  /**
   * Maximum number of metrics to keep in memory (LRU eviction)
   * Default: 10000
   */
  retention?: number;

  /**
   * Default histogram buckets in milliseconds
   * Default: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, +Inf]
   */
  histogramBuckets?: number[];
}

/**
 * Default histogram buckets for latency measurements (milliseconds)
 */
const DEFAULT_HISTOGRAM_BUCKETS = [
  1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity,
];

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<MetricsConfig> = {
  enabled: true,
  exportInterval: 60000,
  retention: 10000,
  histogramBuckets: DEFAULT_HISTOGRAM_BUCKETS,
};

/**
 * Metrics Collector
 *
 * Collects and manages metrics for the wshobson system.
 */
export class MetricsCollector {
  private config: Required<MetricsConfig>;
  private mutex: Mutex;
  private metrics: Metric[];
  private counters: Map<string, number>;
  private gauges: Map<string, number>;
  private histograms: Map<string, HistogramState>;
  private timers: Map<string, number>;
  private metricHelp: Map<string, string>;

  /**
   * Create a new metrics collector
   *
   * @param config - Configuration options
   */
  constructor(config: MetricsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mutex = new Mutex();
    this.metrics = [];
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();
    this.metricHelp = new Map();

    // Initialize default metric descriptions
    this.initializeDefaultHelp();
  }

  /**
   * Record a counter metric
   *
   * Counters monotonically increase and are used for cumulative values.
   *
   * @param name - Metric name
   * @param value - Value to add (can be negative for decrement)
   * @param labels - Optional labels for dimensional metrics
   *
   * @example
   * ```typescript
   * // Increment delegation counter
   * metrics.counter('delegations_total', 1, { agent: 'business-analyst' });
   *
   * // Increment error counter
   * metrics.counter('errors_total', 1, { agent: 'data-analyst', type: 'timeout' });
   * ```
   */
  counter(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    const current = this.counters.get(name) || 0;
    const newValue = current + value;
    this.counters.set(name, newValue);

    this.recordMetric({
      name,
      value: newValue,
      unit: 'count',
      timestamp: Date.now(),
      labels: labels || {},
    });
  }

  /**
   * Record a gauge metric
   *
   * Gauges represent point-in-time values that can go up or down.
   *
   * @param name - Metric name
   * @param value - Current gauge value
   * @param labels - Optional labels for dimensional metrics
   *
   * @example
   * ```typescript
   * // Track active agents
   * metrics.gauge('active_agents', 5);
   *
   * // Track queue depth
   * metrics.gauge('queue_depth', 12, { queue: 'delegation' });
   *
   * // Track memory usage
   * metrics.gauge('memory_usage_mb', 1024);
   * ```
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    this.gauges.set(name, value);

    this.recordMetric({
      name,
      value,
      unit: 'count',
      timestamp: Date.now(),
      labels: labels || {},
    });
  }

  /**
   * Record a histogram metric
   *
   * Histograms track distributions of values (e.g., latency, response sizes).
   * Values are automatically sorted into buckets for percentile calculation.
   *
   * @param name - Metric name
   * @param value - Value to observe
   * @param labels - Optional labels for dimensional metrics
   *
   * @example
   * ```typescript
   * // Track delegation latency
   * metrics.histogram('delegation_duration_ms', 1234);
   *
   * // Track response size
   * metrics.histogram('response_size_bytes', 4096, { agent: 'analyst' });
   * ```
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    let state = this.histograms.get(name);
    if (!state) {
      // Initialize histogram with default buckets
      state = {
        sum: 0,
        count: 0,
        buckets: this.config.histogramBuckets.map(le => ({
          le: le === Infinity ? '+Inf' : String(le),
          count: 0,
        })),
      };
      this.histograms.set(name, state);
    }

    // Update sum and count
    state.sum += value;
    state.count += 1;

    // Update bucket counts
    for (const bucket of state.buckets) {
      const threshold = bucket.le === '+Inf' ? Infinity : parseFloat(bucket.le);
      if (value <= threshold) {
        bucket.count++;
      }
    }

    this.recordMetric({
      name,
      value,
      unit: 'ms',
      timestamp: Date.now(),
      labels: labels || {},
    });
  }

  /**
   * Create a timer for measuring duration
   *
   * Returns a function that, when called, records the elapsed time.
   *
   * @param name - Metric name for the histogram
   * @param labels - Optional labels for dimensional metrics
   * @returns Function to stop timer and record duration
   *
   * @example
   * ```typescript
   * // Time an operation
   * const endTimer = metrics.time('delegation_duration_ms');
   * await doSomeWork();
   * endTimer();
   *
   * // Time with labels
   * const timer = metrics.time('agent_execution_ms', { agent: 'analyst' });
   * await agent.execute(task);
   * timer();
   * ```
   */
  time(name: string, labels?: Record<string, string>): () => void {
    if (!this.config.enabled) {
      return () => {};
    }

    const startTime = Date.now();
    const timerId = `${name}-${startTime}-${Math.random()}`;

    this.timers.set(timerId, startTime);

    return () => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.histogram(name, duration, labels);
      this.timers.delete(timerId);
    };
  }

  /**
   * Increment a counter (convenience method)
   *
   * @param name - Metric name
   * @param labels - Optional labels
   *
   * @example
   * ```typescript
   * metrics.increment('delegations_total', { agent: 'analyst' });
   * ```
   */
  increment(name: string, labels?: Record<string, string>): void {
    this.counter(name, 1, labels);
  }

  /**
   * Decrement a counter (convenience method)
   *
   * @param name - Metric name
   * @param labels - Optional labels
   *
   * @example
   * ```typescript
   * metrics.decrement('active_agents');
   * ```
   */
  decrement(name: string, labels?: Record<string, string>): void {
    this.counter(name, -1, labels);
  }

  /**
   * Set a gauge (convenience method)
   *
   * @param name - Metric name
   * @param value - Gauge value
   * @param labels - Optional labels
   *
   * @example
   * ```typescript
   * metrics.set('active_agents', 5);
   * ```
   */
  set(name: string, value: number, labels?: Record<string, string>): void {
    this.gauge(name, value, labels);
  }

  /**
   * Get current counter value
   *
   * @param name - Metric name
   * @returns Current counter value or 0 if not found
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get current gauge value
   *
   * @param name - Metric name
   * @returns Current gauge value or 0 if not found
   */
  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  /**
   * Get histogram statistics
   *
   * @param name - Metric name
   * @returns Histogram statistics or null if not found
   */
  getHistogram(name: string): {
    count: number;
    sum: number;
    avg: number;
    buckets: HistogramBucket[];
  } | null {
    const state = this.histograms.get(name);
    if (!state) return null;

    return {
      count: state.count,
      sum: state.sum,
      avg: state.count > 0 ? state.sum / state.count : 0,
      buckets: state.buckets,
    };
  }

  /**
   * Export metrics in Prometheus text format
   *
   * Returns metrics in a format compatible with Prometheus scraping.
   *
   * @returns Prometheus-formatted metrics string
   *
   * @example
   * ```typescript
   * const prometheus = metrics.export();
   * console.log(prometheus);
   * // Output:
   * // # HELP delegations_total Total number of delegations
   * // # TYPE delegations_total counter
   * // delegations_total{agent="business-analyst"} 42
   * ```
   */
  export(): string {
    const lines: string[] = [];

    // Export counters
    Array.from(this.counters.entries()).forEach(([name, value]) => {
      const help = this.metricHelp.get(name) || `${name} metric`;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
      lines.push('');
    });

    // Export gauges
    Array.from(this.gauges.entries()).forEach(([name, value]) => {
      const help = this.metricHelp.get(name) || `${name} metric`;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
      lines.push('');
    });

    // Export histograms
    Array.from(this.histograms.entries()).forEach(([name, state]) => {
      const help = this.metricHelp.get(name) || `${name} metric`;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_sum ${state.sum}`);
      lines.push(`${name}_count ${state.count}`);

      // Export buckets
      let cumulativeCount = 0;
      for (const bucket of state.buckets) {
        cumulativeCount += bucket.count;
        lines.push(`${name}_bucket{le="${bucket.le}"} ${cumulativeCount}`);
      }

      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Get all metrics as JSON
   *
   * Returns all metrics in a structured JSON format.
   *
   * @returns Array of all metrics
   */
  toJSON(): Metric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   *
   * @param name - Metric name to filter by
   * @returns Array of metrics with the given name
   */
  getByName(name: string): Metric[] {
    return this.metrics.filter(m => m.name === name);
  }

  /**
   * Get metrics by label
   *
   * @param labelName - Label name to filter by
   * @param labelValue - Label value to match
   * @returns Array of metrics with the matching label
   */
  getByLabel(labelName: string, labelValue: string): Metric[] {
    return this.metrics.filter(m => m.labels[labelName] === labelValue);
  }

  /**
   * Clear all metrics
   *
   * Useful for testing or memory management.
   */
  async clearAll(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.metrics = [];
      this.counters.clear();
      this.gauges.clear();
      this.histograms.clear();
      this.timers.clear();
    });
  }

  /**
   * Get metric statistics
   *
   * @returns Statistics about collected metrics
   */
  async getStats(): Promise<{
    totalMetrics: number;
    counters: number;
    gauges: number;
    histograms: number;
    activeTimers: number;
  }> {
    return await this.mutex.runExclusive(async () => {
      return {
        totalMetrics: this.metrics.length,
        counters: this.counters.size,
        gauges: this.gauges.size,
        histograms: this.histograms.size,
        activeTimers: this.timers.size,
      };
    });
  }

  /**
   * Record a metric with LRU eviction
   */
  private recordMetric(metric: Metric): void {
    this.metrics.push(metric);

    // Enforce retention limit (LRU eviction)
    if (this.metrics.length > this.config.retention) {
      this.metrics.shift();  // Remove oldest metric
    }
  }

  /**
   * Initialize default metric help text
   */
  private initializeDefaultHelp(): void {
    // Counter metrics
    this.metricHelp.set('delegations_total', 'Total number of agent delegations');
    this.metricHelp.set('errors_total', 'Total number of errors');
    this.metricHelp.set('successes_total', 'Total number of successful delegations');
    this.metricHelp.set('timeouts_total', 'Total number of delegation timeouts');
    this.metricHelp.set('retries_total', 'Total number of retry attempts');

    // Gauge metrics
    this.metricHelp.set('active_agents', 'Number of currently active agents');
    this.metricHelp.set('active_delegations', 'Number of active delegations');
    this.metricHelp.set('queue_depth', 'Current queue depth');
    this.metricHelp.set('memory_usage_mb', 'Memory usage in megabytes');
    this.metricHelp.set('cpu_usage_percent', 'CPU usage percentage');

    // Histogram metrics
    this.metricHelp.set(
      'delegation_duration_ms',
      'Delegation execution duration in milliseconds'
    );
    this.metricHelp.set(
      'agent_execution_ms',
      'Agent execution duration in milliseconds'
    );
    this.metricHelp.set(
      'response_size_bytes',
      'Response size in bytes'
    );
    this.metricHelp.set(
      'queue_wait_time_ms',
      'Time spent waiting in queue'
    );
  }
}

/**
 * Create a metrics collector
 *
 * Factory function for creating a metrics collector with default configuration.
 *
 * @param config - Configuration options
 * @returns Configured metrics collector
 *
 * @example
 * ```typescript
 * const metrics = createMetricsCollector({
 *   retention: 5000,
 *   exportInterval: 30000
 * });
 * ```
 */
export function createMetricsCollector(config?: MetricsConfig): MetricsCollector {
  return new MetricsCollector(config);
}
