/**
 * wshobson Agent Integration - Circuit Breaker with Persistence
 *
 * Implements circuit breaker pattern for resilient agent delegation with
 * state persistence to survive restarts. Part of Phase 5: Robustness & Performance.
 */

import { EventEmitter } from 'events';
import { CircuitBreakerState } from './types';
import { getMonitor } from './monitor';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit (cooldown) */
  cooldownPeriod?: number;
  /** Number of successful calls in half-open before closing */
  successThreshold?: number;
  /** Enable persistence to disk */
  persistenceEnabled?: boolean;
  /** Path to persistence file */
  persistencePath?: string;
  /** Auto-save interval in ms */
  autoSaveInterval?: number;
}

/**
 * Agent-specific circuit breaker state
 */
interface AgentCircuitState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  nextAttemptTime: number;
}

/**
 * Circuit breaker for agent delegation
 */
export class CircuitBreaker extends EventEmitter {
  private state: Map<string, AgentCircuitState> = new Map();
  private config: Required<CircuitBreakerConfig>;
  private monitor = getMonitor();
  private autoSaveInterval?: NodeJS.Timeout;

  constructor(config: CircuitBreakerConfig = {}) {
    super();

    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      cooldownPeriod: config.cooldownPeriod ?? 60000, // 60 seconds
      successThreshold: config.successThreshold ?? 3,
      persistenceEnabled: config.persistenceEnabled ?? true,
      persistencePath: config.persistencePath ?? '.ultra/circuit-breaker-state.json',
      autoSaveInterval: config.autoSaveInterval ?? 30000, // 30 seconds
    };

    // Load persisted state if enabled
    if (this.config.persistenceEnabled) {
      this.loadState();
    }

    // Start auto-save
    if (this.config.persistenceEnabled) {
      this.startAutoSave();
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    agent: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const circuitState = this.getOrCreateState(agent);

    // Check if circuit is open
    if (circuitState.state === 'open') {
      if (Date.now() < circuitState.nextAttemptTime) {
        // Circuit is still open, reject immediately
        const error = new Error(
          `Circuit breaker is OPEN for agent ${agent}. ` +
          `Next attempt at ${new Date(circuitState.nextAttemptTime).toISOString()}`
        );
        this.monitor.recordCircuitBreakerState(agent, 'open', {
          reason: 'cooldown',
          nextAttempt: circuitState.nextAttemptTime,
        });
        throw error;
      } else {
        // Transition to half-open
        this.transitionTo(agent, 'half-open');
        this.monitor.recordCircuitBreakerState(agent, 'half-open', {
          reason: 'cooldown-expired',
        });
      }
    }

    try {
      // Execute the operation
      const result = await operation();

      // Record success
      this.recordSuccess(agent);

      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(agent);

      throw error;
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(agent: string): void {
    const circuitState = this.getOrCreateState(agent);

    circuitState.successCount++;
    circuitState.lastSuccessTime = Date.now();

    if (circuitState.state === 'half-open') {
      // Check if we should close the circuit
      if (circuitState.successCount >= this.config.successThreshold) {
        this.transitionTo(agent, 'closed');
        this.monitor.recordCircuitBreakerState(agent, 'closed', {
          reason: 'success-threshold-reached',
          successCount: circuitState.successCount,
        });
      } else {
        this.monitor.recordCircuitBreakerState(agent, 'half-open', {
          reason: 'success-recorded',
          successCount: circuitState.successCount,
          threshold: this.config.successThreshold,
        });
      }
    } else if (circuitState.state === 'closed') {
      // Reset failure count on success in closed state
      circuitState.failureCount = 0;

      this.monitor.log({
        level: 'debug',
        message: `Agent ${agent} operation succeeded`,
        metadata: {
          failureCount: circuitState.failureCount,
          successCount: circuitState.successCount,
        },
      });
    }

    this.saveState();
  }

  /**
   * Record failed operation
   */
  private recordFailure(agent: string): void {
    const circuitState = this.getOrCreateState(agent);

    circuitState.failureCount++;
    circuitState.lastFailureTime = Date.now();

    // Check if we should open the circuit
    if (circuitState.state === 'closed' &&
        circuitState.failureCount >= this.config.failureThreshold) {
      this.transitionTo(agent, 'open');
      this.monitor.recordCircuitBreakerState(agent, 'open', {
        reason: 'failure-threshold-reached',
        failureCount: circuitState.failureCount,
        threshold: this.config.failureThreshold,
      });
    } else if (circuitState.state === 'half-open') {
      // Open circuit immediately on failure in half-open
      this.transitionTo(agent, 'open');
      this.monitor.recordCircuitBreakerState(agent, 'open', {
        reason: 'half-open-failure',
      });
    } else {
      this.monitor.log({
        level: 'warn',
        message: `Agent ${agent} operation failed`,
        metadata: {
          failureCount: circuitState.failureCount,
          threshold: this.config.failureThreshold,
        },
      });
    }

    this.saveState();
  }

  /**
   * Transition circuit to new state
   */
  private transitionTo(agent: string, newState: CircuitState): void {
    const circuitState = this.getOrCreateState(agent);
    const oldState = circuitState.state;

    circuitState.state = newState;

    // Reset counters based on transition
    if (newState === 'open') {
      circuitState.nextAttemptTime = Date.now() + this.config.cooldownPeriod;
      circuitState.successCount = 0;
    } else if (newState === 'half-open') {
      circuitState.successCount = 0;
    } else if (newState === 'closed') {
      circuitState.failureCount = 0;
      circuitState.successCount = 0;
    }

    this.emit('transition', {
      agent,
      from: oldState,
      to: newState,
      timestamp: Date.now(),
    });

    this.monitor.log({
      level: 'info',
      message: `Circuit breaker for ${agent} transitioned from ${oldState} to ${newState}`,
      metadata: {
        agent,
        from: oldState,
        to: newState,
      },
    });
  }

  /**
   * Get or create circuit state for agent
   */
  private getOrCreateState(agent: string): AgentCircuitState {
    if (!this.state.has(agent)) {
      this.state.set(agent, {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        nextAttemptTime: 0,
      });
    }
    return this.state.get(agent)!;
  }

  /**
   * Get current state for agent
   */
  getState(agent: string): CircuitState {
    return this.getOrCreateState(agent).state;
  }

  /**
   * Get all circuit states
   */
  getAllStates(): CircuitBreakerState {
    const result: CircuitBreakerState = {};

    for (const [agent, state] of this.state.entries()) {
      result[agent] = {
        state: state.state,
        failureCount: state.failureCount,
        lastFailureTime: state.lastFailureTime,
        nextAttemptTime: state.nextAttemptTime,
        successCount: state.successCount,
      };
    }

    return result;
  }

  /**
   * Reset circuit for agent to closed state
   */
  reset(agent: string): void {
    const circuitState = this.getOrCreateState(agent);
    const oldState = circuitState.state;

    this.state.set(agent, {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      nextAttemptTime: 0,
    });

    this.monitor.log({
      level: 'info',
      message: `Circuit breaker for ${agent} manually reset`,
      metadata: {
        agent,
        from: oldState,
        to: 'closed',
      },
    });

    this.emit('reset', { agent, timestamp: Date.now() });
    this.saveState();
  }

  /**
   * Load state from disk
   */
  private loadState(): void {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(this.config.persistencePath, 'utf-8');
      const loaded = JSON.parse(data) as CircuitBreakerState;

      // Restore state
      for (const [agent, agentState] of Object.entries(loaded)) {
        this.state.set(agent, {
          state: agentState.state,
          failureCount: agentState.failureCount,
          successCount: agentState.successCount,
          lastFailureTime: agentState.lastFailureTime,
          lastSuccessTime: 0, // Not persisted
          nextAttemptTime: agentState.nextAttemptTime,
        });
      }

      this.monitor.log({
        level: 'info',
        message: 'Circuit breaker state loaded from disk',
        metadata: { agentCount: this.state.size },
      });
    } catch (error) {
      this.monitor.log({
        level: 'warn',
        message: 'Failed to load circuit breaker state',
        metadata: { error: (error as Error).message },
      });
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    if (!this.config.persistenceEnabled) {
      return;
    }

    // Save in background
    setImmediate(() => {
      this.persistState();
    });
  }

  /**
   * Persist state to disk
   */
  private async persistState(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const state = this.getAllStates();
      const data = JSON.stringify(state, null, 2);
      await fs.writeFile(this.config.persistencePath, data, 'utf-8');

      this.monitor.log({
        level: 'debug',
        message: 'Circuit breaker state saved to disk',
        metadata: { agentCount: this.state.size },
      });
    } catch (error) {
      this.monitor.log({
        level: 'error',
        message: 'Failed to save circuit breaker state',
        metadata: { error: (error as Error).message },
      });
    }
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.persistState();
    }, this.config.autoSaveInterval);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAgents: number;
    open: number;
    closed: number;
    halfOpen: number;
  } {
    let open = 0;
    let closed = 0;
    let halfOpen = 0;

    for (const state of this.state.values()) {
      if (state.state === 'open') open++;
      else if (state.state === 'closed') closed++;
      else if (state.state === 'half-open') halfOpen++;
    }

    return {
      totalAgents: this.state.size,
      open,
      closed,
      halfOpen,
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // Save final state
    this.persistState();

    this.removeAllListeners();
  }
}

/**
 * Singleton circuit breaker instance
 */
let circuitBreakerInstance: CircuitBreaker | null = null;

/**
 * Get or create the circuit breaker singleton
 */
export function getCircuitBreaker(config?: CircuitBreakerConfig): CircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new CircuitBreaker(config);
  }
  return circuitBreakerInstance;
}

/**
 * Reset the circuit breaker singleton (for testing)
 */
export function resetCircuitBreaker(): void {
  if (circuitBreakerInstance) {
    circuitBreakerInstance.destroy();
    circuitBreakerInstance = null;
  }
}
