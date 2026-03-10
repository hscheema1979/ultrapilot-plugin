/**
 * wshobson Error Handling System
 *
 * Comprehensive error management for agent delegation with:
 * - Error classification and categorization
 * - Retry strategies with exponential backoff
 * - Telemetry and error rate tracking
 * - Production-ready error handling patterns
 *
 * This system addresses the need for robust error handling in distributed
 * agent delegation scenarios, where transient failures are common and
 * intelligent retry logic is essential.
 */

/**
 * Error codes for categorization
 *
 * These codes classify errors into retryable and non-retryable categories,
 * enabling intelligent retry strategies and proper error handling.
 */
export enum ErrorCode {
  /**
   * Validation errors indicate invalid input or configuration
   * These are NON-RETRYABLE as the same input will fail again
   */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  /**
   * Timeout errors occur when an operation takes too long
   * These are RETRYABLE as they may be transient
   */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  /**
   * Fatal errors indicate unrecoverable failures
   * These are NON-RETRYABLE and require human intervention
   */
  FATAL_ERROR = 'FATAL_ERROR',

  /**
   * Retryable errors are transient failures that may succeed on retry
   * These include network issues, temporary unavailability, etc.
   */
  RETRYABLE_ERROR = 'RETRYABLE_ERROR',

  /**
   * Cancellation errors occur when operations are intentionally cancelled
   * These are NON-RETRYABLE as cancellation is intentional
   */
  CANCELLED_ERROR = 'CANCELLED_ERROR',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories for telemetry
 */
export enum ErrorCategory {
  NETWORK = 'network',
  AGENT = 'agent',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  TIMEOUT = 'timeout',
  CANCELLATION = 'cancellation',
  UNKNOWN = 'unknown',
}

/**
 * Delegation error class
 *
 * Extends the native Error class with additional context for delegation scenarios.
 * Provides error classification, retry information, and telemetry data.
 *
 * @example
 * ```typescript
 * // Create a timeout error
 * const error = new DelegationError({
 *   code: ErrorCode.TIMEOUT_ERROR,
 *   message: 'Agent timed out after 30s',
 *   agentName: 'data-analyst',
 *   retryable: true,
 *   retryDelay: 5000,
 *   severity: ErrorSeverity.MEDIUM,
 * });
 *
 * // Create a validation error
 * const validationError = new DelegationError({
 *   code: ErrorCode.VALIDATION_ERROR,
 *   message: 'Invalid task parameter',
 *   details: { field: 'task', issue: 'cannot be empty' },
 *   retryable: false,
 *   severity: ErrorSeverity.LOW,
 * });
 * ```
 */
export class DelegationError extends Error {
  /**
   * Error code for classification
   */
  public readonly code: ErrorCode;

  /**
   * Error severity level
   */
  public readonly severity: ErrorSeverity;

  /**
   * Error category for telemetry
   */
  public readonly category: ErrorCategory;

  /**
   * Human-readable error message
   */
  public readonly message: string;

  /**
   * Stack trace if available
   */
  public readonly stack?: string;

  /**
   * Additional error context
   */
  public readonly details?: Record<string, any>;

  /**
   * Whether the error is retryable
   */
  public readonly retryable: boolean;

  /**
   * Suggested retry delay in milliseconds
   */
  public readonly retryDelay?: number;

  /**
   * Name of the agent that caused the error
   */
  public readonly agentName?: string;

  /**
   * Timestamp when the error occurred
   */
  public readonly timestamp: number;

  /**
   * Trace ID for distributed tracing
   */
  public readonly traceId?: string;

  /**
   * Original error that caused this error
   */
  public readonly cause?: Error;

  /**
   * Create a new DelegationError
   *
   * @param options - Error configuration options
   */
  constructor(options: {
    code: ErrorCode;
    message: string;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    details?: Record<string, any>;
    retryable: boolean;
    retryDelay?: number;
    agentName?: string;
    traceId?: string;
    cause?: Error;
  }) {
    super(options.message);

    this.name = 'DelegationError';
    this.code = options.code;
    this.message = options.message;
    this.severity = options.severity || this.getDefaultSeverity(options.code);
    this.category = options.category || this.getDefaultCategory(options.code);
    this.details = options.details;
    this.retryable = options.retryable;
    this.retryDelay = options.retryDelay;
    this.agentName = options.agentName;
    this.traceId = options.traceId;
    this.timestamp = Date.now();
    this.cause = options.cause;

    // Maintain proper stack trace (V8-specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DelegationError);
    }
  }

  /**
   * Get default severity for error code
   */
  private getDefaultSeverity(code: ErrorCode): ErrorSeverity {
    switch (code) {
      case ErrorCode.VALIDATION_ERROR:
        return ErrorSeverity.LOW;
      case ErrorCode.TIMEOUT_ERROR:
        return ErrorSeverity.MEDIUM;
      case ErrorCode.RETRYABLE_ERROR:
        return ErrorSeverity.MEDIUM;
      case ErrorCode.CANCELLED_ERROR:
        return ErrorSeverity.LOW;
      case ErrorCode.FATAL_ERROR:
        return ErrorSeverity.CRITICAL;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Get default category for error code
   */
  private getDefaultCategory(code: ErrorCode): ErrorCategory {
    switch (code) {
      case ErrorCode.VALIDATION_ERROR:
        return ErrorCategory.VALIDATION;
      case ErrorCode.TIMEOUT_ERROR:
        return ErrorCategory.TIMEOUT;
      case ErrorCode.CANCELLED_ERROR:
        return ErrorCategory.CANCELLATION;
      case ErrorCode.FATAL_ERROR:
        return ErrorCategory.SYSTEM;
      case ErrorCode.RETRYABLE_ERROR:
        return ErrorCategory.NETWORK;
      default:
        return ErrorCategory.UNKNOWN;
    }
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      category: this.category,
      details: this.details,
      retryable: this.retryable,
      retryDelay: this.retryDelay,
      agentName: this.agentName,
      timestamp: this.timestamp,
      traceId: this.traceId,
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : undefined,
    };
  }

  /**
   * Create a DelegationError from a generic Error
   */
  static fromError(error: Error, context?: {
    code?: ErrorCode;
    retryable?: boolean;
    retryDelay?: number;
    agentName?: string;
    traceId?: string;
  }): DelegationError {
    return new DelegationError({
      code: context?.code || ErrorCode.FATAL_ERROR,
      message: error.message,
      retryable: context?.retryable ?? false,
      retryDelay: context?.retryDelay,
      agentName: context?.agentName,
      traceId: context?.traceId,
      cause: error,
    });
  }

  /**
   * Create a timeout error
   */
  static timeout(message: string, agentName?: string, traceId?: string): DelegationError {
    return new DelegationError({
      code: ErrorCode.TIMEOUT_ERROR,
      message,
      retryable: true,
      retryDelay: 5000,
      agentName,
      traceId,
    });
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: Record<string, any>): DelegationError {
    return new DelegationError({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      retryable: false,
      details,
    });
  }

  /**
   * Create a cancellation error
   */
  static cancelled(agentName?: string, traceId?: string): DelegationError {
    return new DelegationError({
      code: ErrorCode.CANCELLED_ERROR,
      message: 'Operation was cancelled',
      retryable: false,
      agentName,
      traceId,
    });
  }

  /**
   * Create a retryable error
   */
  static retryable(message: string, retryDelay?: number, agentName?: string): DelegationError {
    return new DelegationError({
      code: ErrorCode.RETRYABLE_ERROR,
      message,
      retryable: true,
      retryDelay: retryDelay || 2000,
      agentName,
    });
  }

  /**
   * Create a fatal error
   */
  static fatal(message: string, details?: Record<string, any>): DelegationError {
    return new DelegationError({
      code: ErrorCode.FATAL_ERROR,
      message,
      severity: ErrorSeverity.CRITICAL,
      retryable: false,
      details,
    });
  }
}

/**
 * Error retry strategy configuration
 */
export interface RetryStrategyConfig {
  /**
   * Maximum number of retry attempts
   * Default: 5
   */
  maxAttempts: number;

  /**
   * Base delay between retries in milliseconds
   * Default: 1000 (1 second)
   */
  baseDelay: number;

  /**
   * Maximum delay between retries in milliseconds
   * Default: 60000 (1 minute)
   */
  maxDelay: number;

  /**
   * Whether to use exponential backoff
   * Default: true
   */
  exponentialBackoff: boolean;

  /**
   * Exponential backoff multiplier
   * Default: 2 (doubles delay each retry)
   */
  backoffMultiplier: number;

  /**
   * Jitter factor to add randomness to delays (0-1)
   * Default: 0.1 (adds ±10% jitter)
   */
  jitterFactor: number;
}

/**
 * Error retry strategy class
 *
 * Determines if an error is retryable and calculates appropriate backoff delays.
 * Implements exponential backoff with jitter to prevent thundering herd problems.
 *
 * @example
 * ```typescript
 * const strategy = new ErrorRetryStrategy({
 *   maxAttempts: 5,
 *   baseDelay: 1000,
 *   exponentialBackoff: true,
 * });
 *
 * const error = new DelegationError({
 *   code: ErrorCode.TIMEOUT_ERROR,
 *   message: 'Timeout',
 *   retryable: true,
 * });
 *
 * if (strategy.isRetryable(error)) {
 *   const delay = strategy.calculateBackoff(3); // 4th attempt
 *   await sleep(delay);
 *   // Retry the operation
 * }
 * ```
 */
export class ErrorRetryStrategy {
  private readonly config: RetryStrategyConfig;

  /**
   * Create a new error retry strategy
   *
   * @param config - Retry strategy configuration
   */
  constructor(config?: Partial<RetryStrategyConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts || 5,
      baseDelay: config?.baseDelay || 1000,
      maxDelay: config?.maxDelay || 60000,
      exponentialBackoff: config?.exponentialBackoff ?? true,
      backoffMultiplier: config?.backoffMultiplier || 2,
      jitterFactor: config?.jitterFactor || 0.1,
    };
  }

  /**
   * Determine if an error is retryable
   *
   * An error is retryable if:
   * 1. It's marked as retryable
   * 2. The error code indicates a retryable condition
   * 3. The error category allows retries
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  isRetryable(error: DelegationError | Error): boolean {
    if (error instanceof DelegationError) {
      return error.retryable && this.isRetryableCode(error.code);
    }

    // For generic errors, check if it's a network or timeout error
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('econnreset')
    );
  }

  /**
   * Check if error code is retryable
   */
  private isRetryableCode(code: ErrorCode): boolean {
    switch (code) {
      case ErrorCode.TIMEOUT_ERROR:
      case ErrorCode.RETRYABLE_ERROR:
        return true;
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.FATAL_ERROR:
      case ErrorCode.CANCELLED_ERROR:
        return false;
      default:
        return false;
    }
  }

  /**
   * Calculate backoff delay for a given attempt
   *
   * Implements exponential backoff with jitter:
   * - Attempt 1: baseDelay
   * - Attempt 2: baseDelay * 2
   * - Attempt 3: baseDelay * 4
   * - Attempt 4: baseDelay * 8
   * - Attempt 5: baseDelay * 16
   *
   * With jitter applied to prevent thundering herd.
   *
   * @param attempt - Attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  calculateBackoff(attempt: number): number {
    if (!this.config.exponentialBackoff) {
      return this.addJitter(this.config.baseDelay);
    }

    // Calculate exponential delay: baseDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay = this.config.baseDelay * Math.pow(
      this.config.backoffMultiplier,
      attempt - 1
    );

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);

    return this.addJitter(cappedDelay);
  }

  /**
   * Add jitter to delay to prevent thundering herd
   *
   * Adds random jitter based on jitterFactor:
   * delay ± (delay * jitterFactor)
   *
   * @param delay - Base delay in milliseconds
   * @returns Delay with jitter applied
   */
  private addJitter(delay: number): number {
    const jitterRange = delay * this.config.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange; // ±jitterRange
    return Math.max(0, Math.round(delay + jitter));
  }

  /**
   * Get maximum retry attempts
   */
  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }

  /**
   * Check if should retry based on attempt number
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns true if should retry
   */
  shouldRetry(attempt: number): boolean {
    return attempt <= this.config.maxAttempts;
  }

  /**
   * Check if should retry after error
   *
   * @param error - Error that occurred
   * @param attempt - Current attempt number (1-indexed)
   * @returns true if should retry
   */
  shouldRetryAfter(error: DelegationError | Error, attempt: number): boolean {
    return this.isRetryable(error) && this.shouldRetry(attempt);
  }

  /**
   * Get retry delay for a given attempt and error
   *
   * @param attempt - Attempt number (1-indexed)
   * @param error - Error that occurred
   * @returns Delay in milliseconds
   */
  getRetryDelay(attempt: number, error?: DelegationError | Error): number {
    // If error has a suggested retry delay, use that
    if (error instanceof DelegationError && error.retryDelay) {
      return this.addJitter(error.retryDelay);
    }

    return this.calculateBackoff(attempt);
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryStrategyConfig {
    return { ...this.config };
  }
}

/**
 * Error statistics for telemetry
 */
export interface ErrorStats {
  /**
   * Total error count
   */
  totalErrors: number;

  /**
   * Error counts by code
   */
  errorsByCode: Record<ErrorCode, number>;

  /**
   * Error counts by category
   */
  errorsByCategory: Record<ErrorCategory, number>;

  /**
   * Error counts by severity
   */
  errorsBySeverity: Record<ErrorSeverity, number>;

  /**
   * Error counts by agent
   */
  errorsByAgent: Record<string, number>;

  /**
   * Error rate (errors per minute) using EMA
   */
  errorRate: number;

  /**
   * Timestamp of first error
   */
  firstErrorTime?: number;

  /**
   * Timestamp of last error
   */
  lastErrorTime: number;
}

/**
 * Error telemetry configuration
 */
export interface ErrorTelemetryConfig {
  /**
   * EMA (Exponential Moving Average) smoothing factor for error rate calculation
   * Lower values give more weight to historical data
   * Default: 0.1 (10% weight to new data, 90% to historical)
   */
  emaSmoothingFactor: number;

  /**
   * Time window for error rate calculation (in milliseconds)
   * Default: 60000 (1 minute)
   */
  errorRateWindow: number;

  /**
   * Whether to track errors by agent
   * Default: true
   */
  trackByAgent: boolean;

  /**
   * Maximum number of errors to keep in history
   * Default: 1000
   */
  maxHistorySize: number;
}

/**
 * Error telemetry class
 *
 * Tracks error rates, error types, and provides error statistics.
 * Uses exponential moving average (EMA) for smooth error rate calculation.
 *
 * @example
 * ```typescript
 * const telemetry = new ErrorTelemetry();
 *
 * // Record an error
 * telemetry.recordError(error);
 *
 * // Get error statistics
 * const stats = telemetry.getStats();
 * console.log(`Error rate: ${stats.errorRate} errors/min`);
 * console.log(`Total errors: ${stats.totalErrors}`);
 *
 * // Check if error rate is high
 * if (telemetry.isErrorRateHigh(10)) {
 *   console.warn('High error rate detected!');
 * }
 *
 * // Reset telemetry
 * telemetry.reset();
 * ```
 */
export class ErrorTelemetry {
  private readonly config: ErrorTelemetryConfig;
  private errorsByCode: Map<ErrorCode, number>;
  private errorsByCategory: Map<ErrorCategory, number>;
  private errorsBySeverity: Map<ErrorSeverity, number>;
  private errorsByAgent: Map<string, number>;
  private errorHistory: Array<{ timestamp: number; error: DelegationError }>;
  private currentErrorRate: number;
  private firstErrorTime?: number;
  private lastErrorTime?: number;

  /**
   * Create a new error telemetry instance
   *
   * @param config - Telemetry configuration
   */
  constructor(config?: Partial<ErrorTelemetryConfig>) {
    this.config = {
      emaSmoothingFactor: config?.emaSmoothingFactor || 0.1,
      errorRateWindow: config?.errorRateWindow || 60000,
      trackByAgent: config?.trackByAgent ?? true,
      maxHistorySize: config?.maxHistorySize || 1000,
    };

    this.errorsByCode = new Map();
    this.errorsByCategory = new Map();
    this.errorsBySeverity = new Map();
    this.errorsByAgent = new Map();
    this.errorHistory = [];
    this.currentErrorRate = 0;
  }

  /**
   * Record an error
   *
   * Updates error counts and recalculates error rate.
   *
   * @param error - Error to record
   */
  recordError(error: DelegationError | Error): void {
    const timestamp = Date.now();

    // Convert to DelegationError if needed
    const delegationError = error instanceof DelegationError
      ? error
      : DelegationError.fromError(error);

    // Update error counts by code
    const codeCount = this.errorsByCode.get(delegationError.code) || 0;
    this.errorsByCode.set(delegationError.code, codeCount + 1);

    // Update error counts by category
    const categoryCount = this.errorsByCategory.get(delegationError.category) || 0;
    this.errorsByCategory.set(delegationError.category, categoryCount + 1);

    // Update error counts by severity
    const severityCount = this.errorsBySeverity.get(delegationError.severity) || 0;
    this.errorsBySeverity.set(delegationError.severity, severityCount + 1);

    // Update error counts by agent
    if (this.config.trackByAgent && delegationError.agentName) {
      const agentCount = this.errorsByAgent.get(delegationError.agentName) || 0;
      this.errorsByAgent.set(delegationError.agentName, agentCount + 1);
    }

    // Add to history
    this.errorHistory.push({ timestamp, error: delegationError });

    // Trim history if needed
    if (this.errorHistory.length > this.config.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Update timestamps
    if (!this.firstErrorTime) {
      this.firstErrorTime = timestamp;
    }
    this.lastErrorTime = timestamp;

    // Recalculate error rate
    this.recalculateErrorRate();
  }

  /**
   * Recalculate error rate using EMA
   *
   * Error rate is calculated as errors per minute using exponential moving average.
   */
  private recalculateErrorRate(): void {
    const now = Date.now();
    const windowStart = now - this.config.errorRateWindow;

    // Count errors in the current window
    const errorsInWindow = this.errorHistory.filter(
      e => e.timestamp >= windowStart
    ).length;

    // Calculate errors per minute
    const errorsPerMinute = (errorsInWindow / this.config.errorRateWindow) * 60000;

    // Apply EMA smoothing
    this.currentErrorRate = this.currentErrorRate * (1 - this.config.emaSmoothingFactor) +
                           errorsPerMinute * this.config.emaSmoothingFactor;
  }

  /**
   * Get error statistics
   *
   * @returns Current error statistics
   */
  getStats(): ErrorStats {
    return {
      totalErrors: this.errorHistory.length,
      errorsByCode: this.mapToObject(this.errorsByCode),
      errorsByCategory: this.mapToObject(this.errorsByCategory),
      errorsBySeverity: this.mapToObject(this.errorsBySeverity),
      errorsByAgent: this.mapToObject(this.errorsByAgent),
      errorRate: this.currentErrorRate,
      firstErrorTime: this.firstErrorTime,
      lastErrorTime: this.lastErrorTime || 0,
    };
  }

  /**
   * Get current error rate
   *
   * @returns Error rate (errors per minute)
   */
  getErrorRate(): number {
    return this.currentErrorRate;
  }

  /**
   * Check if error rate is high
   *
   * @param threshold - Threshold for high error rate (errors per minute)
   * @returns true if error rate exceeds threshold
   */
  isErrorRateHigh(threshold: number = 10): boolean {
    return this.currentErrorRate > threshold;
  }

  /**
   * Get errors by code
   *
   * @param code - Error code to filter by
   * @returns Count of errors for this code
   */
  getErrorsByCode(code: ErrorCode): number {
    return this.errorsByCode.get(code) || 0;
  }

  /**
   * Get errors by agent
   *
   * @param agentName - Agent name to filter by
   * @returns Count of errors for this agent
   */
  getErrorsByAgent(agentName: string): number {
    return this.errorsByAgent.get(agentName) || 0;
  }

  /**
   * Get top error codes
   *
   * @param limit - Maximum number of codes to return
   * @returns Array of error codes with counts, sorted by count
   */
  getTopErrorCodes(limit: number = 5): Array<{ code: ErrorCode; count: number }> {
    return Array.from(this.errorsByCode.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top error agents
   *
   * @param limit - Maximum number of agents to return
   * @returns Array of agent names with error counts, sorted by count
   */
  getTopErrorAgents(limit: number = 5): Array<{ agentName: string; count: number }> {
    return Array.from(this.errorsByAgent.entries())
      .map(([agentName, count]) => ({ agentName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get error history
   *
   * @param since - Optional timestamp to filter from
   * @returns Array of errors in history
   */
  getErrorHistory(since?: number): Array<{ timestamp: number; error: DelegationError }> {
    if (since) {
      return this.errorHistory.filter(e => e.timestamp >= since);
    }
    return [...this.errorHistory];
  }

  /**
   * Reset telemetry
   *
   * Clears all error statistics and history.
   */
  reset(): void {
    this.errorsByCode.clear();
    this.errorsByCategory.clear();
    this.errorsBySeverity.clear();
    this.errorsByAgent.clear();
    this.errorHistory = [];
    this.currentErrorRate = 0;
    this.firstErrorTime = undefined;
    this.lastErrorTime = undefined;
  }

  /**
   * Get telemetry configuration
   */
  getConfig(): ErrorTelemetryConfig {
    return { ...this.config };
  }

  /**
   * Convert Map to plain object
   */
  private mapToObject(map: Map<string | ErrorCode | ErrorSeverity | ErrorCategory, number>): Record<string, number> {
    const obj: Record<string, number> = {};
    map.forEach((value, key) => {
      obj[String(key)] = value;
    });
    return obj;
  }

  /**
   * Export telemetry data as JSON
   */
  toJSON(): Record<string, any> {
    return {
      stats: this.getStats(),
      config: this.config,
      historySize: this.errorHistory.length,
    };
  }
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerStateType = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening circuit
   * Default: 5
   */
  failureThreshold?: number;

  /**
   * Time in milliseconds to wait before attempting recovery
   * Default: 60000 (1 minute)
   */
  cooldownPeriod?: number;

  /**
   * Number of consecutive successes required to close circuit
   * Default: 2
   */
  successThreshold?: number;

  /**
   * Timeout in milliseconds for half-open requests
   * Default: 10000 (10 seconds)
   */
  halfOpenTimeout?: number;
}

/**
 * Circuit breaker for preventing cascading failures
 *
 * The circuit breaker pattern prevents cascading failures by
 * temporarily disabling agents that repeatedly fail. It operates
 * in three states:
 *
 * - **closed**: Normal operation, all requests pass through
 * - **open**: Circuit is tripped, all requests are rejected
 * - **half-open**: Testing if service has recovered, limited requests allowed
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('data-analyst', {
 *   failureThreshold: 5,
 *   cooldownPeriod: 60000,
 *   successThreshold: 2,
 * });
 *
 * // Wrap delegation with circuit breaker
 * if (breaker.allowRequest()) {
 *   try {
 *     await delegateToAgent(agent, task);
 *     breaker.recordSuccess();
 *   } catch (error) {
 *     breaker.recordFailure();
 *   }
 * } else {
 *   // Circuit is open, use fallback
 *   await fallbackAgent.execute(task);
 * }
 *
 * // Check state
 * console.log(`Circuit state: ${breaker.getState()}`);
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerStateType = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(
    private readonly agentName: string,
    config: CircuitBreakerConfig = {}
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      cooldownPeriod: config.cooldownPeriod ?? 60000,
      successThreshold: config.successThreshold ?? 2,
      halfOpenTimeout: config.halfOpenTimeout ?? 10000,
    };
  }

  /**
   * Check if request should be allowed
   *
   * @returns true if request is allowed, false if circuit is open
   */
  allowRequest(): boolean {
    const now = Date.now();

    // Check if we should transition from open to half-open
    if (this.state === 'open' && now >= this.nextAttemptTime) {
      this.state = 'half-open';
      this.successCount = 0;
    }

    return this.state !== 'open';
  }

  /**
   * Record a successful operation
   *
   * Resets failure count and potentially closes the circuit.
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  /**
   * Record a failed operation
   *
   * Increments failure count and potentially opens the circuit.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.config.cooldownPeriod;
    }
  }

  /**
   * Get current circuit state
   *
   * @returns Current state: 'closed', 'open', or 'half-open'
   */
  getState(): CircuitBreakerStateType {
    return this.state;
  }

  /**
   * Get agent name
   */
  getAgentName(): string {
    return this.agentName;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get success count (for half-open state)
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'open';
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === 'closed';
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  /**
   * Get time until next attempt (when circuit will transition to half-open)
   *
   * @returns Milliseconds until next attempt, or 0 if circuit is not open
   */
  getTimeUntilNextAttempt(): number {
    if (this.state !== 'open') {
      return 0;
    }
    return Math.max(0, this.nextAttemptTime - Date.now());
  }

  /**
   * Reset circuit breaker to closed state
   *
   * Useful for manual recovery or testing.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getStatus(): {
    agentName: string;
    state: CircuitBreakerStateType;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    return {
      agentName: this.agentName,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON(): Record<string, any> {
    return this.getStatus();
  }
}

/**
 * Unit test examples (for documentation purposes)
 *
 * @example
 * ```typescript
 * // Test 1: Create different error types
 * const timeoutError = DelegationError.timeout('Agent timed out', 'data-analyst');
 * assert(timeoutError.code === ErrorCode.TIMEOUT_ERROR);
 * assert(timeoutError.retryable === true);
 *
 * const validationError = DelegationError.validation('Invalid input');
 * assert(validationError.code === ErrorCode.VALIDATION_ERROR);
 * assert(validationError.retryable === false);
 *
 * // Test 2: Retry strategy
 * const strategy = new ErrorRetryStrategy({ maxAttempts: 3 });
 * assert(strategy.isRetryable(timeoutError) === true);
 * assert(strategy.isRetryable(validationError) === false);
 *
 * const delay1 = strategy.calculateBackoff(1);
 * const delay2 = strategy.calculateBackoff(2);
 * assert(delay2 > delay1); // Exponential backoff
 *
 * // Test 3: Telemetry
 * const telemetry = new ErrorTelemetry();
 * telemetry.recordError(timeoutError);
 * telemetry.recordError(validationError);
 *
 * const stats = telemetry.getStats();
 * assert(stats.totalErrors === 2);
 * assert(stats.errorsByCode[ErrorCode.TIMEOUT_ERROR] === 1);
 * assert(stats.errorsByCode[ErrorCode.VALIDATION_ERROR] === 1);
 *
 * // Test 4: Error rate tracking
 * for (let i = 0; i < 10; i++) {
 *   telemetry.recordError(DelegationError.retryable('Network error'));
 * }
 * assert(telemetry.isErrorRateHigh(5) === true);
 *
 * // Test 5: Circuit breaker
 * const breaker = new CircuitBreaker('test-agent', {
 *   failureThreshold: 3,
 *   cooldownPeriod: 1000,
 * });
 *
 * assert(breaker.isClosed() === true);
 * assert(breaker.allowRequest() === true);
 *
 * // Record failures
 * breaker.recordFailure();
 * breaker.recordFailure();
 * breaker.recordFailure();
 *
 * assert(breaker.isOpen() === true);
 * assert(breaker.allowRequest() === false);
 *
 * // Test 6: Reset
 * telemetry.reset();
 * const statsAfterReset = telemetry.getStats();
 * assert(statsAfterReset.totalErrors === 0);
 *
 * breaker.reset();
 * assert(breaker.isClosed() === true);
 * ```
 */
