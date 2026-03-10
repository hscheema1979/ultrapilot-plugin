/**
 * Distributed Tracing Manager
 *
 * Implements trace context propagation for observability across
 * delegation chains, enabling debugging and performance monitoring.
 *
 * Part of Phase 2: Delegation Interface & Ownership Protocol
 */

import { v4 as uuidv4 } from 'uuid';
import { TraceContext } from './types.js';

/**
 * Trace span representing a unit of work
 */
export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  success?: boolean;
  metadata: Record<string, any>;
}

/**
 * Trace log entry
 */
export interface TraceLog {
  traceId: string;
  spanId: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Trace Manager
 *
 * Manages distributed tracing for delegation operations,
 * providing observability and debugging capabilities.
 */
export class TraceManager {
  private traces: Map<string, TraceSpan[]> = new Map();
  private logs: TraceLog[] = [];
  private maxLogs: number = 10000; // Prevent unbounded memory growth
  private enableConsoleLogging: boolean = true;

  /**
   * Create a new trace context (root span)
   *
   * @param operationName - Name of the operation
   * @param metadata - Optional metadata to attach to trace
   * @returns TraceContext
   *
   * @example
   * ```typescript
   * const trace = traceManager.createTrace('ultra:analyst-session');
   * // Returns: { traceId: 'abc-123', spanId: 'span-1', baggage: new Map() }
   * ```
   */
  createTrace(operationName: string, metadata?: Record<string, any>): TraceContext {
    const traceId = uuidv4();
    const spanId = this.createSpanId();

    const span: TraceSpan = {
      spanId,
      operationName,
      startTime: Date.now(),
      metadata: metadata || {},
    };

    this.traces.set(traceId, [span]);

    if (this.enableConsoleLogging) {
      console.log(`[TRACE] Started trace ${traceId} (${operationName})`);
    }

    return {
      traceId,
      spanId,
      baggage: new Map(),
    };
  }

  /**
   * Create a child span within an existing trace
   *
   * @param trace - Existing trace context
   * @param operationName - Name of the operation
   * @param metadata - Optional metadata to attach to span
   * @returns New span ID
   *
   * @example
   * ```typescript
   * const childSpanId = traceManager.createSpan(trace, 'delegate-to-business-analyst');
   * ```
   */
  createSpan(trace: TraceContext, operationName: string, metadata?: Record<string, any>): string {
    const spanId = this.createSpanId();

    const span: TraceSpan = {
      spanId,
      parentSpanId: trace.spanId,
      operationName,
      startTime: Date.now(),
      metadata: metadata || {},
    };

    const spans = this.traces.get(trace.traceId);
    if (spans) {
      spans.push(span);
    } else {
      // Create new trace if it doesn't exist
      this.traces.set(trace.traceId, [span]);
    }

    this.log(trace.traceId, spanId, 'info', `Started: ${operationName}`);

    return spanId;
  }

  /**
   * End a span (mark as complete)
   *
   * @param trace - Trace context
   * @param spanId - Span ID to end
   * @param success - Whether the operation succeeded
   * @param metadata - Optional metadata to attach to span
   *
   * @example
   * ```typescript
   * traceManager.endSpan(trace, spanId, true, { result: 'success' });
   * ```
   */
  endSpan(trace: TraceContext, spanId: string, success: boolean, metadata?: Record<string, any>): void {
    const spans = this.traces.get(trace.traceId);
    if (!spans) {
      return;
    }

    const span = spans.find(s => s.spanId === spanId);
    if (!span) {
      return;
    }

    span.endTime = Date.now();
    span.success = success;

    if (metadata) {
      span.metadata = { ...span.metadata, ...metadata };
    }

    const duration = span.endTime - span.startTime;
    const status = success ? '✓' : '✗';

    this.log(
      trace.traceId,
      spanId,
      success ? 'info' : 'error',
      `Ended: ${span.operationName} ${status} (${duration}ms)`
    );
  }

  /**
   * Log a message within a trace context
   *
   * @param traceId - Trace ID
   * @param spanId - Span ID
   * @param level - Log level
   * @param message - Log message
   * @param metadata - Optional metadata
   *
   * @example
   * ```typescript
   * traceManager.log(traceId, spanId, 'info', 'Delegating to business-analyst');
   * ```
   */
  log(
    traceId: string,
    spanId: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry: TraceLog = {
      traceId,
      spanId,
      timestamp: Date.now(),
      level,
      message,
      metadata,
    };

    this.logs.push(logEntry);

    // Prevent unbounded growth
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    if (this.enableConsoleLogging) {
      const timestamp = new Date(logEntry.timestamp).toISOString();
      const levelStr = level.toUpperCase().padEnd(5);
      console.log(`[TRACE ${traceId.slice(0, 8)}] [${spanId.slice(0, 8)}] [${timestamp}] [${levelStr}] ${message}`);
    }
  }

  /**
   * Log a retry attempt
   *
   * @param trace - Trace context
   * @param agentName - Agent being retried
   * @param attempt - Attempt number
   * @param error - Error that caused retry
   *
   * @example
   * ```typescript
   * traceManager.logRetry(trace, 'business-analyst', 2, error);
   * ```
   */
  logRetry(trace: TraceContext, agentName: string, attempt: number, error: any): void {
    this.log(
      trace.traceId,
      trace.spanId,
      'warn',
      `Retry ${attempt}/3 for agent ${agentName}: ${error.message}`
    );
  }

  /**
   * Propagate baggage (metadata) through trace context
   *
   * @param trace - Trace context
   * @param key - Baggage key
   * @param value - Baggage value
   *
   * @example
   * ```typescript
   * traceManager.setBaggage(trace, 'agent-name', 'business-analyst');
   * ```
   */
  setBaggage(trace: TraceContext, key: string, value: string): void {
    trace.baggage.set(key, value);
  }

  /**
   * Get baggage value from trace context
   *
   * @param trace - Trace context
   * @param key - Baggage key
   * @returns Value or undefined
   */
  getBaggage(trace: TraceContext, key: string): string | undefined {
    return trace.baggage.get(key);
  }

  /**
   * Get all spans for a trace
   *
   * @param traceId - Trace ID
   * @returns Array of spans or undefined
   */
  getSpans(traceId: string): TraceSpan[] | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all logs for a trace
   *
   * @param traceId - Trace ID
   * @returns Array of logs
   */
  getLogs(traceId: string): TraceLog[] {
    return this.logs.filter(log => log.traceId === traceId);
  }

  /**
   * Generate a trace report for debugging
   *
   * @param traceId - Trace ID
   * @returns Human-readable trace report
   *
   * @example
   * ```typescript
   * const report = traceManager.generateTraceReport(traceId);
   * console.log(report);
   * ```
   */
  generateTraceReport(traceId: string): string {
    const spans = this.traces.get(traceId);
    const logs = this.getLogs(traceId);

    if (!spans || spans.length === 0) {
      return `No trace found with ID: ${traceId}`;
    }

    let report = `\n=== Trace Report: ${traceId} ===\n\n`;

    // Spans section
    report += 'Spans:\n';
    for (const span of spans) {
      const duration = span.endTime ? `${span.endTime - span.startTime}ms` : 'active';
      const status = span.success === undefined ? 'active' : span.success ? '✓' : '✗';
      const indent = span.parentSpanId ? '  ' : '';

      report += `${indent}- [${span.spanId.slice(0, 8)}] ${span.operationName} (${status}) ${duration}\n`;
    }

    // Logs section
    report += '\nLogs:\n';
    for (const log of logs) {
      const timestamp = new Date(log.timestamp).toISOString();
      const levelStr = log.level.toUpperCase().padEnd(5);

      report += `  [${timestamp}] [${levelStr}] [${log.spanId.slice(0, 8)}] ${log.message}\n`;
    }

    // Statistics
    report += '\nStatistics:\n';
    const totalDuration = spans[spans.length - 1].endTime
      ? spans[spans.length - 1].endTime - spans[0].startTime
      : 0;

    const successCount = spans.filter(s => s.success === true).length;
    const failureCount = spans.filter(s => s.success === false).length;
    const activeCount = spans.filter(s => s.success === undefined).length;

    report += `  Total duration: ${totalDuration}ms\n`;
    report += `  Spans: ${spans.length} (✓ ${successCount}, ✗ ${failureCount}, active ${activeCount})\n`;
    report += `  Logs: ${logs.length}\n`;

    report += '\n' + '='.repeat(50) + '\n';

    return report;
  }

  /**
   * Clear trace data (for testing or memory management)
   *
   * @param traceId - Trace ID to clear (optional, clears all if not provided)
   */
  clearTrace(traceId?: string): void {
    if (traceId) {
      this.traces.delete(traceId);
    } else {
      this.traces.clear();
      this.logs = [];
    }
  }

  /**
   * Enable or disable console logging
   *
   * @param enabled - Whether to enable console logging
   */
  setConsoleLogging(enabled: boolean): void {
    this.enableConsoleLogging = enabled;
  }

  /**
   * Generate a unique span ID
   *
   * @returns Span ID
   */
  private createSpanId(): string {
    return uuidv4();
  }

  /**
   * Export trace data in OpenTelemetry format (optional)
   *
   * This can be used to integrate with OpenTelemetry collectors
   * for distributed tracing across multiple services.
   *
   * @param traceId - Trace ID to export
   * @returns OpenTelemetry-compatible trace data
   */
  exportToOpenTelemetry(traceId: string): any {
    const spans = this.traces.get(traceId);
    if (!spans) {
      return null;
    }

    // Convert to OpenTelemetry format
    // This is a simplified version - real implementation would use
    // @opentelemetry/sdk-trace-base and proper OTLP formatting

    return {
      traceId,
      spans: spans.map(span => ({
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.operationName,
        startTimeUnixNano: span.startTime * 1_000_000,
        endTimeUnixNano: (span.endTime || Date.now()) * 1_000_000,
        status: {
          code: span.success === false ? 2 : 0, // 0 = OK, 2 = ERROR
        },
        attributes: span.metadata,
      })),
    };
  }

  /**
   * Get trace statistics
   *
   * @returns Overall trace statistics
   */
  getStats(): {
    totalTraces: number;
    totalSpans: number;
    totalLogs: number;
    activeTraces: number;
  } {
    let activeTraces = 0;
    let totalSpans = 0;

    for (const spans of this.traces.values()) {
      totalSpans += spans.length;
      const hasActiveSpans = spans.some(s => s.endTime === undefined);
      if (hasActiveSpans) {
        activeTraces++;
      }
    }

    return {
      totalTraces: this.traces.size,
      totalSpans,
      totalLogs: this.logs.length,
      activeTraces,
    };
  }
}
