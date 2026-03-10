/**
 * wshobson Circuit Breaker Implementation
 *
 * Provides production-grade circuit breaker pattern for preventing cascading failures
 * in agent delegation. Automatically detects failures, trips to OPEN state, and
 * implements exponential backoff for recovery.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failed, blocking requests after threshold
 * - HALF_OPEN: Testing if service has recovered
 *
 * @module wshobson/circuit-breaker
 */

import { Mutex } from './mutex.js';
import type { CircuitBreakerState } from './types.js';

/**
 * Circuit breaker states
 *
 * @example
 * ```typescript
 * // Normal operation
 * breaker.setState(CircuitState.CLOSED);
 *
 * // After failures, block requests
 * breaker.setState(CircuitState.OPEN);
 *
 * // Testing recovery
 * breaker.setState(CircuitState.HALF_OPEN);
 * ```
 */
export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failed, block requests
  HALF_OPEN = 'half-open' // Testing if recovered
}

/**
 * Circuit breaker configuration
 *
 * @example
 * ```typescript
 * const config: CircuitBreakerConfig = {
 *   failureThreshold: 5,      // Trip after 5 failures
 *   successThreshold: 3,      // Close after 3 successes
 *   timeout: 60000,           // Open→HalfOpen after 60s
 *   halfOpenMaxCalls: 3       // Max 3 calls in HalfOpen
 * };
 * ```
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before tripping to OPEN state
   * Default: 5
   */
  failureThreshold: number;

  /**
   * Number of consecutive successes in HALF_OPEN to close circuit
   * Default: 3
   */
  successThreshold: number;

  /**
   * Time in milliseconds before transitioning from OPEN to HALF_OPEN
   * Default: 60000 (1 minute)
   */
  timeout: number;

  /**
   * Maximum number of calls allowed in HALF_OPEN state
   * Prevents overwhelming recovering service
   * Default: 3
   */
  halfOpenMaxCalls: number;

  /**
   * Enable exponential backoff for recovery attempts
   * When true, timeout doubles after each failed recovery attempt
   * Default: true
   */
  exponentialBackoff?: boolean;

  /**
   * Maximum backoff delay in milliseconds (when exponentialBackoff is true)
   * Default: 300000 (5 minutes)
   */
  maxBackoffDelay?: number;

  /**
   * Reset timeout after successful recovery (back to initial timeout)
   * Default: true
   */
  resetTimeoutOnRecovery?: boolean;
}

/**
 * Circuit breaker metrics for monitoring
 */
export interface CircuitBreakerMetrics {
  /**
   * Current state
   */
  state: CircuitState;

  /**
   * Number of consecutive failures
   */
  failureCount: number;

  /**
   * Number of consecutive successes (in HALF_OPEN)
   */
  successCount: number;

  /**
   * Total requests since circuit opened
   */
  requestsSinceOpen: number;

  /**
   * Last failure timestamp
   */
  lastFailureTime: number;

  /**
   * Next attempt time (when OPEN)
   */
  nextAttemptTime: number;

  /**
   * Current timeout (with exponential backoff)
   */
  currentTimeout: number;

  /**
   * Number of times circuit has tripped
   */
  tripCount: number;

  /**
   * Number of successful recoveries
   */
  recoveryCount: number;
}

/**
 * Circuit breaker event types
 */
export enum CircuitBreakerEvent {
  STATE_CHANGED = 'state_changed',
  TRIPPED = 'tripped',
  RECOVERED = 'recovered',
  HALF_OPEN_ENTERED = 'half_open_entered',
  REJECTED = 'rejected',
}

/**
 * Circuit breaker event listener
 */
export type CircuitBreakerListener = (
  event: CircuitBreakerEvent,
  data: {
    agentName: string;
    oldState?: CircuitState;
    newState?: CircuitState;
    timestamp: number;
    metrics: CircuitBreakerMetrics;
    [key: string]: any;
  }
) => void;

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
  halfOpenMaxCalls: 3,
  exponentialBackoff: true,
  maxBackoffDelay: 300000,
  resetTimeoutOnRecovery: true,
};

/**
 * Circuit Breaker for Agent Delegation
 *
 * Prevents cascading failures by:
 * - Tracking consecutive failures
 * - Automatically tripping to OPEN state
 * - Implementing exponential backoff for recovery
 * - Thread-safe operations with mutex
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('agent-name', {
 *   failureThreshold: 5,
 *   successThreshold: 3,
 *   timeout: 60000
 * });
 *
 * // Before delegation
 * if (!breaker.allowRequest()) {
 *   throw new Error('Circuit breaker is OPEN');
 * }
 *
 * try {
 *   const result = await delegateToAgent(agentName, task);
 *   breaker.recordSuccess();
 * } catch (error) {
 *   breaker.recordFailure();
 * }
 * ```
 */
export class CircuitBreaker {
  private agentName: string;
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private nextAttemptTime: number;
  private halfOpenCalls: number;
  private tripCount: number;
  private recoveryCount: number;
  private currentTimeout: number;
  private listeners: Set<CircuitBreakerListener>;
  private mutex: Mutex;

  /**
   * Create a new circuit breaker
   *
   * @param agentName - Name of the agent this breaker protects
   * @param config - Circuit breaker configuration
   */
  constructor(agentName: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.agentName = agentName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.halfOpenCalls = 0;
    this.tripCount = 0;
    this.recoveryCount = 0;
    this.currentTimeout = this.config.timeout;
    this.listeners = new Set();
    this.mutex = new Mutex();
  }

  /**
   * Check if request is allowed through circuit
   *
   * Returns true if request should proceed, false if blocked.
   * Automatically transitions OPEN→HALF_OPEN when timeout expires.
   *
   * @returns true if allowed, false if blocked
   *
   * @example
   * ```typescript
   * if (!breaker.allowRequest()) {
   *   // Circuit is OPEN or HALF_OPEN with max calls reached
   *   return { error: 'Circuit breaker blocking requests' };
   * }
   *
   * // Proceed with request
   * const result = await executeRequest();
   * ```
   */
  async allowRequest(): Promise<boolean> {
    return await this.mutex.runExclusive(() => {
      const now = Date.now();

      // Auto-transition from OPEN to HALF_OPEN when timeout expires
      if (this.state === CircuitState.OPEN && now >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }

      // Allow based on state
      switch (this.state) {
        case CircuitState.CLOSED:
          return true;

        case CircuitState.OPEN:
          this.emit(CircuitBreakerEvent.REJECTED, {
            reason: 'Circuit is OPEN',
            nextAttemptTime: this.nextAttemptTime,
          });
          return false;

        case CircuitState.HALF_OPEN:
          // Limit calls in HALF_OPEN state
          if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
            this.emit(CircuitBreakerEvent.REJECTED, {
              reason: 'Half-open max calls reached',
              halfOpenCalls: this.halfOpenCalls,
            });
            return false;
          }
          this.halfOpenCalls++;
          return true;
      }
    });
  }

  /**
   * Record a successful request
   *
   * Resets failure count in CLOSED state.
   * In HALF_OPEN state, progresses toward closing circuit.
   *
   * @example
   * ```typescript
   * try {
   *   const result = await delegateToAgent(agent, task);
   *   breaker.recordSuccess();
   *   return result;
   * } catch (error) {
   *   breaker.recordFailure();
   *   throw error;
   * }
   * ```
   */
  async recordSuccess(): Promise<void> {
    await this.mutex.runExclusive(() => {
      switch (this.state) {
        case CircuitState.CLOSED:
          // Reset failure count
          this.failureCount = 0;
          break;

        case CircuitState.HALF_OPEN:
          // Progress toward closing
          this.successCount++;

          // Close circuit if threshold reached
          if (this.successCount >= this.config.successThreshold) {
            this.transitionTo(CircuitState.CLOSED);
            this.recoveryCount++;

            // Reset timeout on recovery if configured
            if (this.config.resetTimeoutOnRecovery) {
              this.currentTimeout = this.config.timeout;
            }
          }
          break;

        case CircuitState.OPEN:
          // Shouldn't happen, but handle gracefully
          break;
      }
    });
  }

  /**
   * Record a failed request
   *
   * Increments failure count and trips circuit if threshold reached.
   * In HALF_OPEN state, immediately returns to OPEN state.
   *
   * @example
   * ```typescript
   * try {
   *   const result = await delegateToAgent(agent, task);
   *   breaker.recordSuccess();
   *   return result;
   * } catch (error) {
   *   breaker.recordFailure();
   *   throw error;
   * }
   * ```
   */
  async recordFailure(): Promise<void> {
    await this.mutex.runExclusive(() => {
      const now = Date.now();
      this.lastFailureTime = now;

      switch (this.state) {
        case CircuitState.CLOSED:
          this.failureCount++;

          // Trip circuit if threshold reached
          if (this.failureCount >= this.config.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
            this.tripCount++;
          }
          break;

        case CircuitState.HALF_OPEN:
          // Any failure in HALF_OPEN trips back to OPEN
          this.transitionTo(CircuitState.OPEN);
          break;

        case CircuitState.OPEN:
          // Already open, no action needed
          break;
      }
    });
  }

  /**
   * Get current circuit breaker state
   *
   * @returns Current state
   */
  async getState(): Promise<CircuitState> {
    return await this.mutex.runExclusive(() => this.state);
  }

  /**
   * Get circuit breaker metrics
   *
   * Returns comprehensive metrics for monitoring and debugging.
   *
   * @returns Current metrics
   *
   * @example
   * ```typescript
   * const metrics = breaker.getMetrics();
   * console.log(`State: ${metrics.state}`);
   * console.log(`Failures: ${metrics.failureCount}`);
   * console.log(`Tripped: ${metrics.tripCount} times`);
   * ```
   */
  async getMetrics(): Promise<CircuitBreakerMetrics> {
    return await this.mutex.runExclusive(() => ({
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestsSinceOpen: this.halfOpenCalls,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      currentTimeout: this.currentTimeout,
      tripCount: this.tripCount,
      recoveryCount: this.recoveryCount,
    }));
  }

  /**
   * Manually reset circuit breaker to CLOSED state
   *
   * Useful for testing or manual recovery intervention.
   * Resets all counters and timers.
   *
   * @example
   * ```typescript
   * // Manual intervention after fixing underlying issue
   * breaker.reset();
   * ```
   */
  async reset(): Promise<void> {
    await this.mutex.runExclusive(() => {
      const oldState = this.state;
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
      this.lastFailureTime = 0;
      this.nextAttemptTime = 0;
      this.halfOpenCalls = 0;
      this.currentTimeout = this.config.timeout;

      if (oldState !== CircuitState.CLOSED) {
        this.emit(CircuitBreakerEvent.STATE_CHANGED, {
          oldState,
          newState: CircuitState.CLOSED,
        });
      }
    });
  }

  /**
   * Add event listener
   *
   * @param listener - Callback function for events
   *
   * @example
   * ```typescript
   * breaker.on((event, data) => {
   *   if (event === CircuitBreakerEvent.TRIPPED) {
   *     console.log(`Circuit tripped for ${data.agentName}`);
   *     alertOps(data);
   *   }
   * });
   * ```
   */
  on(listener: CircuitBreakerListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   *
   * @param listener - Callback function to remove
   */
  off(listener: CircuitBreakerListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Export state for persistence
   *
   * @returns Serializable state
   *
   * @example
   * ```typescript
   * // Save to repository cache
   * repository.saveCircuitBreakerState(breaker.getState());
   * ```
   */
  async exportState(): Promise<CircuitBreakerState[string]> {
    return await this.mutex.runExclusive(() => ({
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      successCount: this.successCount,
    }));
  }

  /**
   * Import state from persistence
   *
   * @param state - Previously exported state
   *
   * @example
   * ```typescript
   * // Load from repository cache
   * const savedState = repository.loadCircuitBreakerState(agentName);
   * if (savedState) {
   *   breaker.importState(savedState);
   * }
   * ```
   */
  async importState(state: CircuitBreakerState[string]): Promise<void> {
    await this.mutex.runExclusive(() => {
      this.state = state.state as CircuitState;
      this.failureCount = state.failureCount;
      this.lastFailureTime = state.lastFailureTime;
      this.nextAttemptTime = state.nextAttemptTime;
      this.successCount = state.successCount;
      this.halfOpenCalls = 0; // Reset on import
    });
  }

  /**
   * Transition to new state
   *
   * @private
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    const now = Date.now();

    if (newState === CircuitState.OPEN) {
      // Calculate next attempt time with exponential backoff
      if (this.config.exponentialBackoff) {
        this.currentTimeout = Math.min(
          this.currentTimeout * 2,
          this.config.maxBackoffDelay
        );
      }
      this.nextAttemptTime = now + this.currentTimeout;
      this.halfOpenCalls = 0;
      this.successCount = 0;

      this.emit(CircuitBreakerEvent.TRIPPED, {
        reason: 'Failure threshold reached',
        nextAttemptTime: this.nextAttemptTime,
      });
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.successCount = 0;

      this.emit(CircuitBreakerEvent.HALF_OPEN_ENTERED, {
        nextAttemptTime: this.nextAttemptTime,
      });
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;

      this.emit(CircuitBreakerEvent.RECOVERED, {
        reason: 'Success threshold reached in HALF_OPEN',
      });
    }

    this.state = newState;
    this.emit(CircuitBreakerEvent.STATE_CHANGED, {
      oldState,
      newState,
    });
  }

  /**
   * Emit event to all listeners
   *
   * @private
   */
  private emit(event: CircuitBreakerEvent, extraData: Record<string, any> = {}): void {
    const metrics = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestsSinceOpen: this.halfOpenCalls,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      currentTimeout: this.currentTimeout,
      tripCount: this.tripCount,
      recoveryCount: this.recoveryCount,
    };

    const data = {
      agentName: this.agentName,
      timestamp: Date.now(),
      ...extraData,
      metrics,
    };

    const listeners = Array.from(this.listeners);
    for (const listener of listeners) {
      try {
        listener(event, data);
      } catch (error) {
        // Don't let listener errors break circuit breaker
        console.error(`Circuit breaker listener error:`, error);
      }
    }
  }
}

/**
 * Create a circuit breaker instance
 *
 * Factory function for creating a circuit breaker with configuration.
 *
 * @param agentName - Name of the agent this breaker protects
 * @param config - Circuit breaker configuration
 * @returns Configured circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker('business-analyst', {
 *   failureThreshold: 5,
 *   timeout: 60000
 * });
 * ```
 */
export function createCircuitBreaker(
  agentName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker(agentName, config);
}
