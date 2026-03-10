/**
 * wshobson Production Hardening
 *
 * Provides production safeguards for agent delegation systems including:
 * - Rate limiting (token bucket algorithm)
 * - Resource quotas (memory, CPU, file handles)
 * - Graceful degradation under load
 * - Graceful shutdown with cleanup
 * - Circuit breaker integration
 *
 * Key Features:
 * - Token bucket rate limiting for fair resource allocation
 * - Memory and CPU quota enforcement
 * - Graceful degradation with fallback strategies
 * - Production initialization with health checks
 * - Shutdown hooks for clean resource cleanup
 *
 * @module wshobson/production
 */

import type { CircuitBreakerState } from './types.js';

/**
 * Production configuration
 *
 * Defines runtime limits and safeguards for production deployments.
 *
 * @example
 * ```typescript
 * const config: ProductionConfig = {
 *   maxConcurrentDelegations: 100,
 *   maxMemoryMB: 2048,
 *   maxCpuPercent: 80,
 *   enableCircuitBreaker: true,
 *   gracefulShutdown: true,
 *   rateLimit: {
 *     tokens: 100,
 *     refillRate: 10,
 *     window: 1000,
 *   },
 * };
 * ```
 */
export interface ProductionConfig {
  /**
   * Maximum number of concurrent delegations allowed
   * Prevents system overload under high load
   */
  maxConcurrentDelegations: number;

  /**
   * Maximum memory usage in MB
   * System will reject new requests when this limit is approached
   */
  maxMemoryMB: number;

  /**
   * Maximum CPU usage percentage (0-100)
   * System will throttle when this limit is exceeded
   */
  maxCpuPercent: number;

  /**
   * Enable circuit breaker for failing agents
   * Automatically disables agents that repeatedly fail
   */
  enableCircuitBreaker: boolean;

  /**
   * Enable graceful shutdown
   * Ensures clean cleanup on termination signals
   */
  gracefulShutdown: boolean;

  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: {
    /**
     * Failure threshold before opening circuit
     */
    failureThreshold: number;

    /**
     * Time in ms before attempting half-open state
     */
    cooldownPeriod: number;

    /**
     * Success threshold to close circuit
     */
    successThreshold: number;
  };

  /**
   * Rate limiting configuration
   */
  rateLimit?: {
    /**
     * Initial token bucket size
     */
    tokens: number;

    /**
     * Tokens to add per refill interval
     */
    refillRate: number;

    /**
     * Refill interval in milliseconds
     */
    window: number;
  };

  /**
   * Graceful degradation configuration
   */
  degradation?: {
    /**
     * Enable automatic degradation
     */
    enabled: boolean;

    /**
     * Memory threshold to trigger degradation (0-1)
     */
    memoryThreshold: number;

    /**
     * CPU threshold to trigger degradation (0-1)
     */
    cpuThreshold: number;

    /**
     * Fallback mode: 'simple' or 'reject'
     * - simple: Simplify operations
     * - reject: Reject new requests
     */
    fallbackMode: 'simple' | 'reject';
  };
}

/**
 * Resource quota check result
 *
 * @example
 * ```typescript
 * const result = productionGuard.checkResourceQuota();
 * if (!result.allowed) {
 *   console.warn(`Resource limit exceeded: ${result.reason}`);
 * }
 * ```
 */
export interface QuotaCheckResult {
  /**
   * Whether the operation is allowed
   */
  allowed: boolean;

  /**
   * Reason for disallowing (if not allowed)
   */
  reason?: string;

  /**
   * Current memory usage in MB
   */
  currentMemory?: number;

  /**
   * Current CPU usage (0-1)
   */
  currentCpu?: number;

  /**
   * Current number of active delegations
   */
  activeDelegations?: number;
}

/**
 * Graceful degradation result
 *
 * @example
 * ```typescript
 * const result = productionGuard.degradeGracefully();
 * if (result.degraded) {
 *   console.log(`System degraded to: ${result.fallback}`);
 * }
 * ```
 */
export interface DegradationResult {
  /**
   * Whether degradation was activated
   */
  degraded: boolean;

  /**
   * Fallback mode activated
   */
  fallback: string;

  /**
   * Degradation level (0-1)
   * 0 = no degradation, 1 = maximum degradation
   */
  level: number;

  /**
   * Reason for degradation
   */
  reason?: string;
}

/**
 * Token bucket for rate limiting
 *
 * Implements the token bucket algorithm for rate limiting.
 * Tokens are added at a fixed rate, and operations consume tokens.
 *
 * @example
 * ```typescript
 * const bucket = new TokenBucket(100, 10, 1000); // 100 tokens, refill 10 per second
 *
 * if (bucket.consume(1)) {
 *   // Operation allowed
 * } else {
 *   // Rate limited
 * }
 * ```
 */
class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private window: number;
  private lastRefill: number;

  constructor(initialTokens: number, refillRate: number, window: number) {
    this.tokens = initialTokens;
    this.maxTokens = initialTokens;
    this.refillRate = refillRate;
    this.window = window;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.window) {
      const intervals = Math.floor(elapsed / this.window);
      const tokensToAdd = intervals * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Consume tokens if available
   *
   * @param count - Number of tokens to consume
   * @returns true if tokens were consumed, false if insufficient tokens
   */
  consume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset token bucket
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Circuit breaker state machine
 *
 * Prevents cascading failures by temporarily disabling
 * agents that repeatedly fail.
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Circuit is open, requests are rejected
 * - half-open: Testing if service has recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('data-analyst', {
 *   failureThreshold: 5,
 *   cooldownPeriod: 60000,
 *   successThreshold: 2,
 * });
 *
 * if (breaker.allowRequest()) {
 *   try {
 *     await delegateToAgent(agent);
 *     breaker.recordSuccess();
 *   } catch (error) {
 *     breaker.recordFailure();
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(
    private readonly agentName: string,
    private readonly config: {
      failureThreshold: number;
      cooldownPeriod: number;
      successThreshold: number;
    }
  ) {}

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
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  /**
   * Record a failed operation
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
   * Get current state
   */
  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  /**
   * Get circuit breaker state for persistence
   */
  toPersistentState(): { agentName: string } & CircuitBreakerState[string] {
    return {
      agentName: this.agentName,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      successCount: this.successCount,
    };
  }

  /**
   * Restore from persistent state
   */
  fromPersistentState(persistent: CircuitBreakerState[string]): void {
    this.state = persistent.state;
    this.failureCount = persistent.failureCount;
    this.lastFailureTime = persistent.lastFailureTime;
    this.nextAttemptTime = persistent.nextAttemptTime;
    this.successCount = persistent.successCount;
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Production guard for agent delegation systems
 *
 * Provides comprehensive production safeguards including rate limiting,
 * resource quotas, graceful degradation, and circuit breaker integration.
 *
 * @example
 * ```typescript
 * const guard = new ProductionGuard();
 *
 * await guard.initialize({
 *   maxConcurrentDelegations: 100,
 *   maxMemoryMB: 2048,
 *   maxCpuPercent: 80,
 *   enableCircuitBreaker: true,
 *   gracefulShutdown: true,
 * });
 *
 * // Check if delegation is allowed
 * const quota = guard.checkResourceQuota();
 * if (quota.allowed) {
 *   await delegateToAgent(agent);
 * }
 *
 * // Shutdown gracefully
 * await guard.shutdown(5000);
 * ```
 */
export class ProductionGuard {
  private config?: ProductionConfig;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private tokenBucket?: TokenBucket;
  private activeDelegations: number = 0;
  private isShuttingDown: boolean = false;
  private isInitialized: boolean = false;
  private degraded: boolean = false;
  private shutdownCallbacks: Array<() => Promise<void>> = [];

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024;
  }

  /**
   * Get current CPU usage (0-1)
   *
   * Note: This is an approximation based on process CPU time
   */
  private getCpuUsage(): number {
    const usage = process.cpuUsage();
    // Simple approximation: convert to percentage
    const total = usage.user + usage.system;
    return Math.min(1, total / 1000000); // Normalize to 0-1
  }

  /**
   * Setup shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];

    signals.forEach(signal => {
      process.on(signal as NodeJS.Signals, async () => {
        await this.shutdown(5000);
        process.exit(0);
      });
    });

    // Also handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await this.shutdown(5000);
      process.exit(1);
    });
  }

  /**
   * Initialize production guard with configuration
   *
   * @param config - Production configuration
   *
   * @example
   * ```typescript
   * await guard.initialize({
   *   maxConcurrentDelegations: 100,
   *   maxMemoryMB: 2048,
   *   maxCpuPercent: 80,
   *   enableCircuitBreaker: true,
   *   gracefulShutdown: true,
   * });
   * ```
   */
  async initialize(config: ProductionConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ProductionGuard already initialized');
    }

    this.config = config;
    this.isInitialized = true;

    // Initialize token bucket for rate limiting
    if (config.rateLimit) {
      this.tokenBucket = new TokenBucket(
        config.rateLimit.tokens,
        config.rateLimit.refillRate,
        config.rateLimit.window
      );
    }

    // Setup graceful shutdown handlers
    if (config.gracefulShutdown) {
      this.setupShutdownHandlers();
    }

    // Initial health check
    const healthCheck = this.checkResourceQuota();
    if (!healthCheck.allowed) {
      console.warn(`Initial health check warning: ${healthCheck.reason}`);
    }
  }

  /**
   * Check rate limit for an agent
   *
   * Uses token bucket algorithm to enforce rate limits.
   *
   * @param agentId - Agent identifier
   * @returns true if request is within rate limit, false otherwise
   *
   * @example
   * ```typescript
   * if (!guard.checkRateLimit('data-analyst')) {
   *   throw new Error('Rate limit exceeded');
   * }
   * ```
   */
  checkRateLimit(agentId: string): boolean {
    if (!this.isInitialized || !this.tokenBucket) {
      return true; // No rate limiting configured
    }

    return this.tokenBucket.consume(1);
  }

  /**
   * Check resource quotas
   *
   * Verifies that system has sufficient resources to handle
   * additional delegations.
   *
   * @returns Quota check result with details
   *
   * @example
   * ```typescript
   * const quota = guard.checkResourceQuota();
   * if (!quota.allowed) {
   *   console.warn(`Resource limit: ${quota.reason}`);
   *   return;
   * }
   * ```
   */
  checkResourceQuota(): QuotaCheckResult {
    if (!this.isInitialized || !this.config) {
      return { allowed: true };
    }

    const currentMemory = this.getMemoryUsage();
    const currentCpu = this.getCpuUsage();

    // Check memory quota
    if (currentMemory > this.config.maxMemoryMB) {
      return {
        allowed: false,
        reason: `Memory limit exceeded: ${currentMemory.toFixed(2)}MB > ${this.config.maxMemoryMB}MB`,
        currentMemory,
        currentCpu,
        activeDelegations: this.activeDelegations,
      };
    }

    // Check CPU quota
    if (currentCpu > this.config.maxCpuPercent / 100) {
      return {
        allowed: false,
        reason: `CPU limit exceeded: ${(currentCpu * 100).toFixed(1)}% > ${this.config.maxCpuPercent}%`,
        currentMemory,
        currentCpu,
        activeDelegations: this.activeDelegations,
      };
    }

    // Check concurrent delegation limit
    if (this.activeDelegations >= this.config.maxConcurrentDelegations) {
      return {
        allowed: false,
        reason: `Concurrent delegation limit: ${this.activeDelegations} >= ${this.config.maxConcurrentDelegations}`,
        currentMemory,
        currentCpu,
        activeDelegations: this.activeDelegations,
      };
    }

    // Check if shutting down
    if (this.isShuttingDown) {
      return {
        allowed: false,
        reason: 'System is shutting down',
        currentMemory,
        currentCpu,
        activeDelegations: this.activeDelegations,
      };
    }

    return {
      allowed: true,
      currentMemory,
      currentCpu,
      activeDelegations: this.activeDelegations,
    };
  }

  /**
   * Get or create circuit breaker for an agent
   *
   * @param agentName - Agent name
   * @returns Circuit breaker instance
   */
  getCircuitBreaker(agentName: string): CircuitBreaker | null {
    if (!this.config?.enableCircuitBreaker) {
      return null;
    }

    if (!this.circuitBreakers.has(agentName)) {
      const breaker = new CircuitBreaker(agentName, {
        failureThreshold: this.config.circuitBreaker?.failureThreshold || 5,
        cooldownPeriod: this.config.circuitBreaker?.cooldownPeriod || 60000,
        successThreshold: this.config.circuitBreaker?.successThreshold || 2,
      });
      this.circuitBreakers.set(agentName, breaker);
    }

    return this.circuitBreakers.get(agentName)!;
  }

  /**
   * Record delegation start
   *
   * Call this when starting a delegation to track active count.
   */
  recordDelegationStart(): void {
    this.activeDelegations++;
  }

  /**
   * Record delegation completion
   *
   * Call this when a delegation completes (success or failure).
   */
  recordDelegationEnd(): void {
    this.activeDelegations = Math.max(0, this.activeDelegations - 1);
  }

  /**
   * Degrade gracefully under load
   *
   * Activates fallback mode when resources are constrained.
   *
   * @returns Degradation result with fallback strategy
   *
   * @example
   * ```typescript
   * const result = guard.degradeGracefully();
   * if (result.degraded) {
   *   // Switch to simpler operations
   *   simplifyProcessing();
   * }
   * ```
   */
  degradeGracefully(): DegradationResult {
    if (!this.config?.degradation?.enabled) {
      return {
        degraded: false,
        fallback: 'none',
        level: 0,
      };
    }

    const currentMemory = this.getMemoryUsage();
    const currentCpu = this.getCpuUsage();

    const memoryRatio = currentMemory / this.config.maxMemoryMB;
    const cpuRatio = currentCpu / (this.config.maxCpuPercent / 100);

    const maxRatio = Math.max(memoryRatio, cpuRatio);
    const threshold = this.config.degradation.memoryThreshold;

    if (maxRatio > threshold && !this.degraded) {
      this.degraded = true;

      return {
        degraded: true,
        fallback: this.config.degradation.fallbackMode,
        level: Math.min(1, (maxRatio - threshold) / (1 - threshold)),
        reason: `Resource stress: memory=${(memoryRatio * 100).toFixed(1)}%, cpu=${(cpuRatio * 100).toFixed(1)}%`,
      };
    }

    // Recover from degradation if resources are available
    if (this.degraded && maxRatio < threshold * 0.8) {
      this.degraded = false;
    }

    return {
      degraded: this.degraded,
      fallback: this.degraded ? this.config.degradation.fallbackMode : 'none',
      level: this.degraded ? Math.min(1, (maxRatio - threshold) / (1 - threshold)) : 0,
    };
  }

  /**
   * Register a shutdown callback
   *
   * Callbacks are executed in reverse order during shutdown.
   *
   * @param callback - Async function to call during shutdown
   */
  onShutdown(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
  }

  /**
   * Graceful shutdown
   *
   * Executes shutdown callbacks and waits for active delegations to complete.
   *
   * @param timeout - Maximum time to wait for cleanup (ms)
   *
   * @example
   * ```typescript
   * // Handle termination signal
   * process.on('SIGTERM', async () => {
   *   await guard.shutdown(5000);
   *   process.exit(0);
   * });
   * ```
   */
  async shutdown(timeout: number): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    console.log('Starting graceful shutdown...');

    // Wait for active delegations to complete or timeout
    while (this.activeDelegations > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeDelegations > 0) {
      console.warn(`Shutdown timeout: ${this.activeDelegations} delegations still active`);
    }

    // Execute shutdown callbacks in reverse order
    for (const callback of this.shutdownCallbacks.reverse()) {
      try {
        await callback();
      } catch (error) {
        console.error('Shutdown callback error:', error);
      }
    }

    // Clear circuit breakers
    this.circuitBreakers.clear();

    console.log('Graceful shutdown complete');
  }

  /**
   * Get current guard status
   *
   * Returns comprehensive status information.
   */
  getStatus(): {
    initialized: boolean;
    shuttingDown: boolean;
    activeDelegations: number;
    degraded: boolean;
    memoryUsage: number;
    cpuUsage: number;
    circuitBreakerCount: number;
  } {
    return {
      initialized: this.isInitialized,
      shuttingDown: this.isShuttingDown,
      activeDelegations: this.activeDelegations,
      degraded: this.degraded,
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCpuUsage(),
      circuitBreakerCount: this.circuitBreakers.size,
    };
  }

  /**
   * Get circuit breaker states for persistence
   */
  getCircuitBreakerStates(): CircuitBreakerState {
    const states: CircuitBreakerState = {};

    for (const [agentName, breaker] of Array.from(this.circuitBreakers.entries())) {
      states[agentName] = breaker.toPersistentState();
    }

    return states;
  }

  /**
   * Restore circuit breaker states from persistence
   */
  restoreCircuitBreakerStates(states: CircuitBreakerState): void {
    for (const [agentName, state] of Object.entries(states)) {
      const breaker = this.getCircuitBreaker(agentName);
      if (breaker) {
        breaker.fromPersistentState(state);
      }
    }
  }
}
