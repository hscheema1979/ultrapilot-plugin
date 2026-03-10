/**
 * Error Handling System
 *
 * Provides comprehensive error handling with retry logic,
 * error codes, and telemetry for debugging.
 *
 * Part of Phase 2: Delegation Interface & Ownership Protocol
 */

/**
 * Error codes for categorizing delegation failures
 */
export enum ErrorCode {
  /** Transient failures that can be retried (network, timeout) */
  RETRY = 'RETRY',

  /** Permanent failures (invalid agent, missing capability) */
  FATAL = 'FATAL',

  /** Operation took too long */
  TIMEOUT = 'TIMEOUT',

  /** Invalid input or ownership violation */
  VALIDATION = 'VALIDATION',

  /** Agent invocation failed */
  EXECUTION = 'EXECUTION',

  /** Circuit breaker is open */
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',

  /** Repository error */
  REPOSITORY = 'REPOSITORY',
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  initialDelay: number;

  /** Maximum delay in milliseconds */
  maxDelay: number;

  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Error telemetry data
 */
export interface ErrorTelemetry {
  /** Error code */
  code: ErrorCode;

  /** Error message */
  message: string;

  /** Timestamp when error occurred */
  timestamp: number;

  /** Agent that caused the error */
  agent?: string;

  /** Number of retry attempts */
  attempt?: number;

  /** Original error */
  originalError?: Error;

  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Delegation error class
 *
 * Custom error class for delegation failures with retry support
 */
export class DelegationError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly telemetry: ErrorTelemetry;
  public readonly attempt?: number;

  constructor(
    code: ErrorCode,
    message: string,
    originalError?: Error,
    attempt?: number,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'DelegationError';
    this.code = code;
    this.attempt = attempt;

    // Determine if error is retryable
    this.retryable = this.isRetryableCode(code);

    // Build telemetry data
    this.telemetry = {
      code,
      message,
      timestamp: Date.now(),
      attempt,
      originalError,
      context,
    };

    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DelegationError);
    }
  }

  /**
   * Check if error code is retryable
   */
  private isRetryableCode(code: ErrorCode): boolean {
    return code === ErrorCode.RETRY || code === ErrorCode.TIMEOUT;
  }

  /**
   * Convert error to JSON for logging/telemetry
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      attempt: this.attempt,
      telemetry: this.telemetry,
      stack: this.stack,
    };
  }
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests flow normally */
  CLOSED = 'closed',

  /** Circuit is open, requests are blocked */
  OPEN = 'open',

  /** Circuit is half-open, testing if service has recovered */
  HALF_OPEN = 'half-open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;

  /** Time in milliseconds before attempting to close circuit */
  cooldownPeriod: number;

  /** Number of successful attempts needed to close circuit in half-open state */
  successThreshold: number;
}

/**
 * Circuit breaker error
 *
 * Thrown when circuit breaker is open
 */
export class CircuitBreakerError extends DelegationError {
  constructor(agentName: string, state: CircuitBreakerState, nextAttemptTime: number) {
    super(
      ErrorCode.CIRCUIT_BREAKER,
      `Circuit breaker is ${state} for agent ${agentName}. Next attempt at ${new Date(nextAttemptTime).toISOString()}`
    );
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Error Handler
 *
 * Provides error handling utilities including retry logic,
 * circuit breaker integration, and error telemetry.
 */
export class ErrorHandler {
  private retryConfig: RetryConfig;
  private errorTelemetry: ErrorTelemetry[] = [];
  private maxTelemetryEntries: number = 1000;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(retryConfig?: RetryConfig) {
    this.retryConfig = retryConfig || {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 4000,
      backoffMultiplier: 2,
    };
  }

  /**
   * Wrap an async function with retry logic
   *
   * @param fn - Function to retry
   * @param context - Error context
   * @returns Promise with retry logic
   *
   * @example
   * ```typescript
   * const result = await errorHandler.withRetry(
   *   async () => await delegateToAgent(agent, task),
   *   { agent: agent.name, task }
   * );
   * ```
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Convert to DelegationError if needed
        const delegationError = this.normalizeError(error, attempt, context);

        // Check if error is retryable
        if (!delegationError.retryable) {
          // Non-retryable error, fail immediately
          this.recordError(delegationError);
          throw delegationError;
        }

        // Check if this was the last attempt
        if (attempt === this.retryConfig.maxAttempts) {
          // Last attempt failed, throw error
          this.recordError(delegationError);
          throw delegationError;
        }

        // Calculate delay for exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelay *
            Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        // Wait before retry
        await this.delay(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError;
  }

  /**
   * Normalize any error to DelegationError
   *
   * @param error - Original error
   * @param attempt - Attempt number
   * @param context - Error context
   * @returns DelegationError
   */
  normalizeError(
    error: any,
    attempt?: number,
    context?: Record<string, any>
  ): DelegationError {
    // If already a DelegationError, return as-is
    if (error instanceof DelegationError) {
      return error;
    }

    // Determine error code based on error type
    let code = ErrorCode.FATAL;
    let message = error?.message || 'Unknown error';

    if (error?.name === 'TimeoutError' || error?.message?.includes('timeout')) {
      code = ErrorCode.TIMEOUT;
      message = `Operation timed out: ${message}`;
    } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      code = ErrorCode.RETRY;
      message = `Network error: ${message}`;
    } else if (error?.name === 'ValidationError') {
      code = ErrorCode.VALIDATION;
    } else if (error?.name === 'AgentError') {
      code = ErrorCode.EXECUTION;
    }

    return new DelegationError(code, message, error, attempt, context);
  }

  /**
   * Record error telemetry
   *
   * @param error - DelegationError to record
   */
  recordError(error: DelegationError): void {
    this.errorTelemetry.push(error.telemetry);

    // Prevent unbounded growth
    if (this.errorTelemetry.length > this.maxTelemetryEntries) {
      this.errorTelemetry.shift(); // Remove oldest entry
    }
  }

  /**
   * Get error telemetry
   *
   * @param filter - Optional filter function
   * @returns Array of error telemetry
   */
  getTelemetry(filter?: (telemetry: ErrorTelemetry) => boolean): ErrorTelemetry[] {
    if (filter) {
      return this.errorTelemetry.filter(filter);
    }
    return [...this.errorTelemetry];
  }

  /**
   * Get error statistics
   *
   * @returns Error statistics
   */
  getStats(): {
    totalErrors: number;
    byCode: Record<ErrorCode, number>;
    successRate: number;
  } {
    const byCode: Record<ErrorCode, number> = {
      [ErrorCode.RETRY]: 0,
      [ErrorCode.FATAL]: 0,
      [ErrorCode.TIMEOUT]: 0,
      [ErrorCode.VALIDATION]: 0,
      [ErrorCode.EXECUTION]: 0,
      [ErrorCode.CIRCUIT_BREAKER]: 0,
      [ErrorCode.REPOSITORY]: 0,
    };

    for (const telemetry of this.errorTelemetry) {
      byCode[telemetry.code]++;
    }

    // Calculate success rate (inverse of error rate)
    const successRate = this.errorTelemetry.length > 0
      ? 1 - (this.errorTelemetry.length / (this.errorTelemetry.length + 100)) // Placeholder
      : 1.0;

    return {
      totalErrors: this.errorTelemetry.length,
      byCode,
      successRate,
    };
  }

  /**
   * Clear error telemetry
   */
  clearTelemetry(): void {
    this.errorTelemetry = [];
  }

  /**
   * Create or get circuit breaker for an agent
   *
   * @param agentName - Agent name
   * @param config - Circuit breaker configuration
   * @returns CircuitBreaker instance
   */
  getCircuitBreaker(agentName: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.circuitBreakers.get(agentName);

    if (!breaker) {
      breaker = new CircuitBreaker(
        agentName,
        config || {
          failureThreshold: 5,
          cooldownPeriod: 60000, // 1 minute
          successThreshold: 2,
        }
      );
      this.circuitBreakers.set(agentName, breaker);
    }

    return breaker;
  }

  /**
   * Execute with circuit breaker protection
   *
   * @param agentName - Agent name
   * @param fn - Function to execute
   * @returns Promise with result
   */
  async withCircuitBreaker<T>(agentName: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getCircuitBreaker(agentName);

    // Check if circuit is open
    if (breaker.getState() === CircuitBreakerState.OPEN) {
      const canAttempt = breaker.canAttempt();
      if (!canAttempt) {
        throw new CircuitBreakerError(
          agentName,
          breaker.getState(),
          breaker.getNextAttemptTime()
        );
      }
      // Transition to half-open
      breaker.transitionTo(CircuitBreakerState.HALF_OPEN);
    }

    try {
      const result = await fn();

      // Record success
      breaker.recordSuccess();

      return result;
    } catch (error) {
      // Record failure
      breaker.recordFailure();

      // Check if circuit should open
      if (breaker.shouldOpen()) {
        breaker.transitionTo(CircuitBreakerState.OPEN);
      }

      throw error;
    }
  }

  /**
   * Delay helper
   *
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker
 *
 * Implements circuit breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private agentName: string;
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private openedAt: number;

  constructor(agentName: string, config: CircuitBreakerConfig) {
    this.agentName = agentName;
    this.config = config;
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.openedAt = 0;
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Transition back to open on failure in half-open state
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  /**
   * Check if circuit should open
   */
  shouldOpen(): boolean {
    return (
      this.state === CircuitBreakerState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    );
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitBreakerState.OPEN) {
      this.openedAt = Date.now();
    } else if (newState === CircuitBreakerState.CLOSED) {
      this.successCount = 0;
    }

    console.log(`[CIRCUIT BREAKER] ${this.agentName}: ${oldState} → ${newState}`);
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if attempt can be made
   */
  canAttempt(): boolean {
    if (this.state !== CircuitBreakerState.OPEN) {
      return true;
    }

    const timeSinceOpened = Date.now() - this.openedAt;
    return timeSinceOpened >= this.config.cooldownPeriod;
  }

  /**
   * Get next attempt time
   */
  getNextAttemptTime(): number {
    if (this.state !== CircuitBreakerState.OPEN) {
      return Date.now();
    }

    return this.openedAt + this.config.cooldownPeriod;
  }

  /**
   * Get circuit breaker state for persistence
   */
  toState(): {
    agentName: string;
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
    successCount: number;
  } {
    return {
      agentName: this.agentName,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.getNextAttemptTime(),
      successCount: this.successCount,
    };
  }

  /**
   * Restore circuit breaker from persisted state
   */
  fromState(state: {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    successCount: number;
  }): void {
    this.state = state.state;
    this.failureCount = state.failureCount;
    this.lastFailureTime = state.lastFailureTime;
    this.successCount = state.successCount;

    // Recalculate openedAt if state is open
    if (this.state === CircuitBreakerState.OPEN) {
      this.openedAt = Date.now() - this.config.cooldownPeriod;
    }
  }
}
