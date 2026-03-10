/**
 * Distributed Tracing Manager
 *
 * Implements distributed tracing for correlating work across multiple agents.
 * Provides OpenTelemetry-compatible tracing for debugging and monitoring.
 *
 * Key features:
 * - UUID-based trace correlation
 * - Span lifecycle management
 * - Trace context propagation
 * - OpenTelemetry export format
 * - Thread-safe operations with mutex
 *
 * @example
 * ```typescript
 * const tracer = new TraceManager();
 *
 * // Create a root trace
 * const trace = tracer.createTrace();
 * console.log(`Trace ID: ${trace.traceId}`);
 *
 * // Create a span
 * const span = tracer.startSpan(trace.traceId, 'agent-delegation');
 *
 * // Do some work...
 * span.metadata['agent'] = 'business-analyst';
 * span.metadata['task'] = 'analyze-requirements';
 *
 * // End the span
 * tracer.endSpan(span);
 *
 * // Export trace for OpenTelemetry
 * const export = tracer.exportTrace(trace.traceId);
 * ```
 */

import type { TraceContext } from './types.js';
import { Mutex } from './mutex.js';
import { randomUUID } from 'crypto';

/**
 * Span status
 */
export type SpanStatus = 'pending' | 'active' | 'completed' | 'error';

/**
 * Span representing a unit of work
 */
export interface Span {
  /**
   * Unique span ID
   */
  spanId: string;

  /**
   * Parent span ID (if nested)
   */
  parentSpanId?: string;

  /**
   * Span name (operation being performed)
   */
  name: string;

  /**
   * Span status
   */
  status: SpanStatus;

  /**
   * Span start timestamp (milliseconds since epoch)
   */
  startTime: number;

  /**
   * Span end timestamp (milliseconds since epoch)
   */
  endTime?: number;

  /**
   * Span duration in milliseconds
   */
  duration?: number;

  /**
   * Span metadata (tags, attributes, etc.)
   */
  metadata: Record<string, any>;

  /**
   * Error message (if status is 'error')
   */
  error?: string;

  /**
   * Error stack trace (if available)
   */
  stackTrace?: string;

  /**
   * Events logged during span
   */
  events: SpanEvent[];
}

/**
 * Event logged during a span
 */
export interface SpanEvent {
  /**
   * Event name
   */
  name: string;

  /**
   * Event timestamp
   */
  timestamp: number;

  /**
   * Event attributes
   */
  attributes: Record<string, any>;
}

/**
 * Trace with all its spans
 */
export interface Trace extends TraceContext {
  /**
   * Trace name (optional, for display)
   */
  name?: string;

  /**
   * All spans in this trace
   */
  spans: Span[];

  /**
   * Trace start timestamp
   */
  startTime: number;

  /**
   * Trace end timestamp (when all spans complete)
   */
  endTime?: number;

  /**
   * Total trace duration
   */
  duration?: number;
}

/**
 * OpenTelemetry-compatible span export
 */
interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Record<string, string | number | boolean>;
  status?: {
    code: number;
    message?: string;
  };
  events: Array<{
    name: string;
    timeUnixNano: string;
    attributes: Record<string, string | number | boolean>;
  }>;
}

/**
 * OpenTelemetry trace export format
 */
interface OtelTraceExport {
  resourceSpans: Array<{
    resource: {
      attributes: Record<string, string | number | boolean>;
    };
    scopeSpans: Array<{
      scope: {
        name: string;
        version?: string;
      };
      spans: OtelSpan[];
    }>;
  }>;
}

/**
 * Trace Manager Options
 */
export interface TraceManagerOptions {
  /**
   * Maximum number of traces to keep in memory
   * Default: 1000
   */
  maxTraces?: number;

  /**
   * Maximum number of spans per trace
   * Default: 1000
   */
  maxSpansPerTrace?: number;

  /**
   * Whether to automatically complete traces when all spans end
   * Default: true
   */
  autoCompleteTraces?: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: TraceManagerOptions = {
  maxTraces: 1000,
  maxSpansPerTrace: 1000,
  autoCompleteTraces: true,
};

/**
 * Trace Manager
 *
 * Manages distributed tracing for agent workflow correlation.
 */
export class TraceManager {
  private options: TraceManagerOptions;
  private mutex: Mutex;
  private traces: Map<string, Trace>;
  private spanCounter: number;

  /**
   * Create a new trace manager
   *
   * @param options - Configuration options
   */
  constructor(options: TraceManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.mutex = new Mutex();
    this.traces = new Map();
    this.spanCounter = 0;
  }

  /**
   * Create a new trace
   *
   * Creates a new trace context for correlating work across agents.
   * Optionally accepts a parent trace ID for trace chain linking.
   *
   * @param parentId - Optional parent trace ID for trace chaining
   * @param name - Optional trace name for display
   * @returns New trace context
   *
   * @example
   * ```typescript
   * // Create root trace
   * const rootTrace = tracer.createTrace(undefined, 'main-workflow');
   *
   * // Create child trace (linked)
   * const childTrace = tracer.createTrace(rootTrace.traceId, 'sub-workflow');
   * ```
   */
  createTrace(parentId?: string, name?: string): TraceContext {
    const traceId = randomUUID();
    const spanId = this.generateSpanId();

    // Create baggage from parent if provided
    const baggage = parentId ? this.getInheritedBaggage(parentId) : new Map();

    const trace: Trace = {
      traceId,
      spanId,
      parentSpanId: parentId,
      baggage,
      name,
      spans: [],
      startTime: Date.now(),
    };

    // Store trace
    this.traces.set(traceId, trace);

    // Enforce max traces limit
    if (this.traces.size > (this.options.maxTraces || DEFAULT_OPTIONS.maxTraces!)) {
      // Remove oldest trace
      const oldestId = Array.from(this.traces.keys())[0];
      this.traces.delete(oldestId);
    }

    return {
      traceId: trace.traceId,
      spanId: trace.spanId,
      parentSpanId: trace.parentSpanId,
      baggage: trace.baggage,
    };
  }

  /**
   * Start a new span in a trace
   *
   * @param traceId - Trace ID to add span to
   * @param name - Span name (operation description)
   * @param parentSpanId - Optional parent span for nesting
   * @returns New span
   *
   * @example
   * ```typescript
   * const span = tracer.startSpan(traceId, 'agent-execution', parentSpanId);
   * span.metadata['agent'] = 'business-analyst';
   * span.metadata['task'] = task;
   * ```
   */
  startSpan(traceId: string, name: string, parentSpanId?: string): Span {
    const span: Span = {
      spanId: this.generateSpanId(),
      parentSpanId,
      name,
      status: 'active',
      startTime: Date.now(),
      metadata: {},
      events: [],
    };

    // Add span to trace
    const trace = this.traces.get(traceId);
    if (trace) {
      // Enforce max spans per trace
      if (trace.spans.length >= (this.options.maxSpansPerTrace || DEFAULT_OPTIONS.maxSpansPerTrace!)) {
        console.warn(`Max spans per trace exceeded for trace ${traceId}`);
        return span;
      }

      trace.spans.push(span);
    } else {
      console.warn(`Trace ${traceId} not found, creating orphan span`);
    }

    return span;
  }

  /**
   * End a span
   *
   * Marks the span as completed and calculates duration.
   * If the span errored, set status and error before calling this.
   *
   * @param span - Span to end
   *
   * @example
   * ```typescript
   * try {
   *   // Do work...
   *   span.status = 'completed';
   * } catch (error) {
   *   span.status = 'error';
   *   span.error = error.message;
   *   span.stackTrace = error.stack;
   * } finally {
   *   tracer.endSpan(span);
   * }
   * ```
   */
  endSpan(span: Span): void {
    const endTime = Date.now();
    span.endTime = endTime;
    span.duration = endTime - span.startTime;

    // Set status to completed if still active
    if (span.status === 'active') {
      span.status = 'completed';
    }

    // Check if we should auto-complete the trace
    if (this.options.autoCompleteTraces) {
      this.tryCompleteTrace(span.spanId);
    }
  }

  /**
   * Log an event to a span
   *
   * Events are timestamped occurrences within a span.
   *
   * @param span - Span to log event to
   * @param name - Event name
   * @param attributes - Event attributes
   *
   * @example
   * ```typescript
   * tracer.logEvent(span, 'agent-discovered', {
   *   agentName: 'business-analyst',
   *   confidence: 0.95
   * });
   * ```
   */
  logEvent(span: Span, name: string, attributes: Record<string, any>): void {
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Get a trace by ID
   *
   * @param traceId - Trace ID to retrieve
   * @returns Trace or null if not found
   *
   * @example
   * ```typescript
   * const trace = tracer.getTrace(traceId);
   * if (trace) {
   *   console.log(`Trace has ${trace.spans.length} spans`);
   * }
   * ```
   */
  getTrace(traceId: string): Trace | null {
    return this.traces.get(traceId) || null;
  }

  /**
   * Get all active traces
   *
   * @returns Array of active traces (those with incomplete spans)
   */
  getActiveTraces(): Trace[] {
    const active: Trace[] = [];

    Array.from(this.traces.values()).forEach(trace => {
      const hasActiveSpans = trace.spans.some(s => s.status === 'active');
      if (hasActiveSpans || !trace.endTime) {
        active.push(trace);
      }
    });

    return active;
  }

  /**
   * Export a trace in OpenTelemetry format
   *
   * Exports the trace in a format compatible with OpenTelemetry collectors.
   * Useful for sending to observability platforms like Jaeger, Honeycomb, etc.
   *
   * @param traceId - Trace ID to export
   * @returns OpenTelemetry-compatible export object
   *
   * @example
   * ```typescript
   * const otelExport = tracer.exportTrace(traceId);
   * // Send to OpenTelemetry collector...
   * await fetch('https://otel-collector:4318/v1/traces', {
   *   method: 'POST',
   *   body: JSON.stringify(otelExport)
   * });
   * ```
   */
  exportTrace(traceId: string): OtelTraceExport {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return { resourceSpans: [] };
    }

    // Convert spans to OpenTelemetry format
    const otelSpans: OtelSpan[] = trace.spans.map(span => ({
      traceId: this.toOtelTraceId(trace.traceId),
      spanId: this.toOtelSpanId(span.spanId),
      parentSpanId: span.parentSpanId
        ? this.toOtelSpanId(span.parentSpanId)
        : undefined,
      name: span.name,
      kind: 'INTERNAL',
      startTimeUnixNano: this.toOtelTimestamp(span.startTime),
      endTimeUnixNano: span.endTime
        ? this.toOtelTimestamp(span.endTime)
        : undefined,
      attributes: this.sanitizeAttributes(span.metadata),
      status:
        span.status === 'error'
          ? { code: 2, message: span.error }
          : span.status === 'completed'
          ? { code: 1 }
          : { code: 0 },
      events: span.events.map(event => ({
        name: event.name,
        timeUnixNano: this.toOtelTimestamp(event.timestamp),
        attributes: this.sanitizeAttributes(event.attributes),
      })),
    }));

    // Build OpenTelemetry export structure
    return {
      resourceSpans: [
        {
          resource: {
            attributes: {
              'service.name': 'ultrapilot',
              'service.version': '1.0.0',
            },
          },
          scopeSpans: [
            {
              scope: {
                name: 'wshobson-tracer',
                version: '1.0.0',
              },
              spans: otelSpans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Get trace statistics
   *
   * @returns Statistics about traces in memory
   *
   * @example
   * ```typescript
   * const stats = await tracer.getStats();
   * console.log(`Total traces: ${stats.totalTraces}`);
   * console.log(`Active traces: ${stats.activeTraces}`);
   * console.log(`Total spans: ${stats.totalSpans}`);
   * ```
   */
  async getStats(): Promise<{
    totalTraces: number;
    activeTraces: number;
    completedTraces: number;
    totalSpans: number;
    activeSpans: number;
    avgSpansPerTrace: number;
  }> {
    return await this.mutex.runExclusive(async () => {
      let totalSpans = 0;
      let activeSpans = 0;
      let completedTraces = 0;

      Array.from(this.traces.values()).forEach(trace => {
        totalSpans += trace.spans.length;
        activeSpans += trace.spans.filter(s => s.status === 'active').length;
        if (trace.endTime) {
          completedTraces++;
        }
      });

      return {
        totalTraces: this.traces.size,
        activeTraces: this.traces.size - completedTraces,
        completedTraces,
        totalSpans,
        activeSpans,
        avgSpansPerTrace:
          this.traces.size > 0 ? totalSpans / this.traces.size : 0,
      };
    });
  }

  /**
   * Clear all traces
   *
   * Useful for testing or memory management.
   *
   * @example
   * ```typescript
   * await tracer.clearAll();
   * ```
   */
  async clearAll(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.traces.clear();
      this.spanCounter = 0;
    });
  }

  /**
   * Prune old completed traces
   *
   * Removes traces that completed before a certain time.
   *
   * @param olderThan - Remove traces completed before this timestamp
   * @returns Number of traces pruned
   *
   * @example
   * ```typescript
   * // Prune traces older than 1 hour
   * const hourAgo = Date.now() - 3600000;
   * const pruned = await tracer.pruneOldTraces(hourAgo);
   * console.log(`Pruned ${pruned} old traces`);
   * ```
   */
  async pruneOldTraces(olderThan: number): Promise<number> {
    return await this.mutex.runExclusive(async () => {
      let pruned = 0;

      Array.from(this.traces.entries()).forEach(([traceId, trace]) => {
        if (trace.endTime && trace.endTime < olderThan) {
          this.traces.delete(traceId);
          pruned++;
        }
      });

      return pruned;
    });
  }

  /**
   * Try to complete a trace
   *
   * Marks a trace as complete if all its spans are complete.
   */
  private tryCompleteTrace(spanId: string): void {
    Array.from(this.traces.values()).forEach(trace => {
      // Check if this trace has the span
      const hasSpan = trace.spans.some(s => s.spanId === spanId);
      if (!hasSpan) return;

      // Check if all spans are complete
      const allComplete = trace.spans.every(
        s => s.status === 'completed' || s.status === 'error'
      );

      if (allComplete && !trace.endTime) {
        // Find the end time (latest span end time)
        const latestEnd = Math.max(
          ...trace.spans.map(s => s.endTime || s.startTime)
        );

        trace.endTime = latestEnd;
        trace.duration = latestEnd - trace.startTime;
      }
    });
  }

  /**
   * Get inherited baggage from parent trace
   */
  private getInheritedBaggage(parentId: string): Map<string, string> {
    const parentTrace = this.traces.get(parentId);
    if (!parentTrace) {
      return new Map();
    }

    // Clone parent's baggage
    return new Map(parentTrace.baggage);
  }

  /**
   * Generate a unique span ID
   */
  private generateSpanId(): string {
    this.spanCounter++;
    return `span-${this.spanCounter}-${Date.now()}`;
  }

  /**
   * Convert UUID to OpenTelemetry trace ID format (16 bytes hex)
   */
  private toOtelTraceId(uuid: string): string {
    // Remove hyphens and convert to lowercase
    return uuid.replace(/-/g, '').toLowerCase();
  }

  /**
   * Convert span ID to OpenTelemetry format (8 bytes hex)
   */
  private toOtelSpanId(spanId: string): string {
    // Generate a hash-like hex string from span ID
    let hash = 0;
    for (let i = 0; i < spanId.length; i++) {
      hash = (hash << 5) - hash + spanId.charCodeAt(i);
      hash |= 0;
    }

    // Convert to 16-character hex string
    return Math.abs(hash).toString(16).padStart(16, '0').slice(0, 16);
  }

  /**
   * Convert millisecond timestamp to OpenTelemetry nanosecond timestamp
   */
  private toOtelTimestamp(ms: number): string {
    return `${ms * 1000000}`;
  }

  /**
   * Sanitize attributes for OpenTelemetry
   * Ensures all values are string, number, or boolean
   */
  private sanitizeAttributes(
    attrs: Record<string, any>
  ): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value instanceof Date) {
        sanitized[key] = value.toISOString();
      } else if (typeof value === 'object') {
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }
}

/**
 * Create a trace manager
 *
 * Factory function for creating a trace manager with default options.
 *
 * @param options - Configuration options
 * @returns Configured trace manager instance
 *
 * @example
 * ```typescript
 * const tracer = createTraceManager({
 *   maxTraces: 500,
 *   maxSpansPerTrace: 500
 * });
 * ```
 */
export function createTraceManager(options?: TraceManagerOptions): TraceManager {
  return new TraceManager(options);
}
