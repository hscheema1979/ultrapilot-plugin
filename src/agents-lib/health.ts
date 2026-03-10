/**
 * wshobson Health Monitoring System
 *
 * Provides comprehensive health check capabilities for the wshobson agent system.
 * Monitors circuit breaker states, agent health, memory usage, and system metrics.
 * Provides HTTP endpoint for health status queries.
 *
 * @module wshobson/health
 */

import { Mutex } from './mutex.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { Agent } from './types.js';

/**
 * Health check status
 *
 * @example
 * ```typescript
 * const check: HealthCheck = {
 *   name: 'agent-registry',
 *   status: 'healthy',
 *   message: 'All agents operational',
 *   lastCheck: Date.now(),
 *   responseTime: 45
 * };
 * ```
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual health check result
 */
export interface HealthCheck {
  /**
   * Name of the check
   */
  name: string;

  /**
   * Current health status
   */
  status: HealthStatus;

  /**
   * Human-readable status message
   */
  message: string;

  /**
   * Timestamp of last check
   */
  lastCheck: number;

  /**
   * Response time in milliseconds
   */
  responseTime: number;

  /**
   * Additional check-specific data
   */
  data?: Record<string, any>;

  /**
   * Whether this check is critical
   * Critical checks cause system to be unhealthy when failing
   */
  critical: boolean;
}

/**
 * System health summary
 *
 * @example
 * ```typescript
 * const health: SystemHealth = {
 *   status: 'healthy',
 *   checks: [check1, check2, check3],
 *   uptime: 86400000,
 *   version: '1.0.0',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface SystemHealth {
  /**
   * Overall system status
   * - healthy: All critical checks passing
   * - degraded: Non-critical checks failing
   * - unhealthy: Critical checks failing
   */
  status: HealthStatus;

  /**
   * Individual health check results
   */
  checks: HealthCheck[];

  /**
   * System uptime in milliseconds
   */
  uptime: number;

  /**
   * System version
   */
  version: string;

  /**
   * Timestamp of health report
   */
  timestamp: number;

  /**
   * System metrics
   */
  metrics: {
    /**
     * Memory usage in bytes
     */
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };

    /**
     * CPU usage (0-1)
     */
    cpuUsage?: number;

    /**
     * Active agent count
     */
    activeAgents: number;

    /**
     * Total agent count
     */
    totalAgents: number;

    /**
     * Circuit breaker states
     */
    circuitBreakers: {
      total: number;
      open: number;
      halfOpen: number;
      closed: number;
    };
  };
}

/**
 * Health check function
 *
 * Functions that perform health checks should conform to this interface.
 */
export type HealthCheckFunction = () => Promise<{
  status: HealthStatus;
  message: string;
  data?: Record<string, any>;
}>;

/**
 * Health check registration
 */
interface HealthCheckRegistration {
  name: string;
  check: HealthCheckFunction;
  critical: boolean;
  interval?: number;
  lastRun: number;
  lastResult?: HealthCheck;
}

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  /**
   * Default check interval in milliseconds
   * Default: 30000 (30 seconds)
   */
  defaultCheckInterval: number;

  /**
   * Memory threshold for degraded status (0-1)
   * Default: 0.7 (70% of heap used)
   */
  memoryThreshold: number;

  /**
   * Memory threshold for unhealthy status (0-1)
   * Default: 0.9 (90% of heap used)
   */
  memoryCriticalThreshold: number;

  /**
   * Enable automatic memory monitoring
   * Default: true
   */
  monitorMemory: boolean;

  /**
   * Enable automatic circuit breaker monitoring
   * Default: true
   */
  monitorCircuitBreakers: boolean;

  /**
   * System version string
   */
  version: string;

  /**
   * Startup timestamp
   */
  startTime: number;
}

/**
 * Default health monitor configuration
 */
const DEFAULT_CONFIG: Omit<HealthMonitorConfig, 'version' | 'startTime'> = {
  defaultCheckInterval: 30000,
  memoryThreshold: 0.7,
  memoryCriticalThreshold: 0.9,
  monitorMemory: true,
  monitorCircuitBreakers: true,
};

/**
 * Health Monitor for wshobson Agent System
 *
 * Provides:
 * - Periodic health checks
 * - Circuit breaker state monitoring
 * - Memory usage tracking
 * - Comprehensive health status reporting
 * - Thread-safe operations
 *
 * @example
 * ```typescript
 * const monitor = new HealthMonitor({
 *   version: '1.0.0',
 *   startTime: Date.now()
 * });
 *
 * // Register circuit breakers
 * monitor.registerCircuitBreaker('agent-1', circuitBreaker1);
 * monitor.registerCircuitBreaker('agent-2', circuitBreaker2);
 *
 * // Start monitoring
 * await monitor.start();
 *
 * // Get health status
 * const health = await monitor.getHealth();
 * console.log(`System status: ${health.status}`);
 * ```
 */
export class HealthMonitor {
  private config: HealthMonitorConfig;
  private checks: Map<string, HealthCheckRegistration>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private agents: Map<string, Agent>;
  private mutex: Mutex;
  private isRunning: boolean;
  private intervals: Set<NodeJS.Timeout>;

  /**
   * Create a new health monitor
   *
   * @param config - Health monitor configuration
   */
  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      version: config.version || '1.0.0',
      startTime: config.startTime || Date.now(),
    };
    this.checks = new Map();
    this.circuitBreakers = new Map();
    this.agents = new Map();
    this.mutex = new Mutex();
    this.isRunning = false;
    this.intervals = new Set();

    // Register built-in checks
    this.registerBuiltInChecks();
  }

  /**
   * Start health monitoring
   *
   * Begins periodic execution of all registered health checks.
   *
   * @example
   * ```typescript
   * await monitor.start();
   * console.log('Health monitoring started');
   * ```
   */
  async start(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.isRunning) {
        return;
      }

      this.isRunning = true;

      // Start periodic checks
      const checkEntries = Array.from(this.checks.entries());
      for (const [name, registration] of checkEntries) {
        if (registration.interval) {
          const interval = setInterval(async () => {
            await this.runCheck(name);
          }, registration.interval);

          this.intervals.add(interval);
        }
      }

      // Run all checks immediately
      await this.runAllChecks();
    });
  }

  /**
   * Stop health monitoring
   *
   * Stops all periodic health checks.
   *
   * @example
   * ```typescript
   * await monitor.stop();
   * console.log('Health monitoring stopped');
   * ```
   */
  async stop(): Promise<void> {
    await this.mutex.runExclusive(() => {
      if (!this.isRunning) {
        return;
      }

      this.isRunning = false;

      // Clear all intervals
      const intervals = Array.from(this.intervals);
      for (const interval of intervals) {
        clearInterval(interval);
      }
      this.intervals.clear();
    });
  }

  /**
   * Register a custom health check
   *
   * @param name - Unique name for the check
   * @param check - Health check function
   * @param options - Registration options
   *
   * @example
   * ```typescript
   * monitor.registerCheck('database', async () => {
   *   try {
   *     await db.ping();
   *     return {
   *       status: 'healthy',
   *       message: 'Database responding'
   *     };
   *   } catch (error) {
   *     return {
   *       status: 'unhealthy',
   *       message: 'Database not responding'
   *     };
   *   }
   * }, { critical: true, interval: 15000 });
   * ```
   */
  registerCheck(
    name: string,
    check: HealthCheckFunction,
    options: {
      critical?: boolean;
      interval?: number;
    } = {}
  ): void {
    const registration: HealthCheckRegistration = {
      name,
      check,
      critical: options.critical ?? true,
      interval: options.interval ?? this.config.defaultCheckInterval,
      lastRun: 0,
    };

    this.checks.set(name, registration);

    // Start interval if monitor is already running
    if (this.isRunning && registration.interval) {
      const interval = setInterval(async () => {
        await this.runCheck(name);
      }, registration.interval);

      this.intervals.add(interval);
    }
  }

  /**
   * Unregister a health check
   *
   * @param name - Name of the check to remove
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Register a circuit breaker for monitoring
   *
   * @param agentName - Agent name
   * @param breaker - Circuit breaker instance
   *
   * @example
   * ```typescript
   * monitor.registerCircuitBreaker('business-analyst', circuitBreaker);
   * ```
   */
  registerCircuitBreaker(agentName: string, breaker: CircuitBreaker): void {
    this.circuitBreakers.set(agentName, breaker);
  }

  /**
   * Unregister a circuit breaker
   *
   * @param agentName - Agent name
   */
  unregisterCircuitBreaker(agentName: string): void {
    this.circuitBreakers.delete(agentName);
  }

  /**
   * Register agents for monitoring
   *
   * @param agents - Map of agent name to agent
   *
   * @example
   * ```typescript
   * monitor.registerAgents(new Map([
   *   ['agent-1', agent1],
   *   ['agent-2', agent2]
   * ]));
   * ```
   */
  registerAgents(agents: Map<string, Agent>): void {
    this.agents = agents;
  }

  /**
   * Get current system health
   *
   * Runs all checks and returns comprehensive health status.
   *
   * @returns System health summary
   *
   * @example
   * ```typescript
   * const health = await monitor.getHealth();
   *
   * if (health.status === 'unhealthy') {
   *   alertOps(health);
   * }
   *
   * console.log(`Memory: ${health.metrics.memoryUsage.heapUsed} bytes`);
   * console.log(`Active agents: ${health.metrics.activeAgents}`);
   * ```
   */
  async getHealth(): Promise<SystemHealth> {
    return await this.mutex.runExclusive(async () => {
      // Run all checks
      const checks = await this.runAllChecks();

      // Calculate overall status
      const status = this.calculateOverallStatus(checks);

      // Get metrics
      const metrics = this.gatherMetrics(checks);

      return {
        status,
        checks,
        uptime: Date.now() - this.config.startTime,
        version: this.config.version,
        timestamp: Date.now(),
        metrics,
      };
    });
  }

  /**
   * Get health as HTTP response
   *
   * Formats health status for HTTP response.
   * Returns appropriate status code based on health.
   *
   * @returns HTTP response object
   *
   * @example
   * ```typescript
   * // In Express/HTTP handler
   * app.get('/health', async (req, res) => {
   *   const response = await monitor.getHealthResponse();
   *   res.status(response.statusCode).json(response.body);
   * });
   * ```
   */
  async getHealthResponse(): Promise<{
    statusCode: number;
    body: SystemHealth;
  }> {
    const health = await this.getHealth();

    let statusCode: number;
    switch (health.status) {
      case 'healthy':
        statusCode = 200;
        break;
      case 'degraded':
        statusCode = 200; // Still serving, but degraded
        break;
      case 'unhealthy':
        statusCode = 503; // Service unavailable
        break;
    }

    return {
      statusCode,
      body: health,
    };
  }

  /**
   * Run all health checks
   *
   * @private
   */
  private async runAllChecks(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];

    // Run all registered checks
    const checkEntries = Array.from(this.checks.entries());
    for (const [name, registration] of checkEntries) {
      const result = await this.runCheck(name);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Run a specific health check
   *
   * @private
   */
  private async runCheck(name: string): Promise<HealthCheck | null> {
    const registration = this.checks.get(name);
    if (!registration) {
      return null;
    }

    const startTime = Date.now();

    try {
      const result = await registration.check();
      const responseTime = Date.now() - startTime;

      const healthCheck: HealthCheck = {
        name: registration.name,
        status: result.status,
        message: result.message,
        lastCheck: Date.now(),
        responseTime,
        data: result.data,
        critical: registration.critical,
      };

      registration.lastResult = healthCheck;
      registration.lastRun = Date.now();

      return healthCheck;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      const healthCheck: HealthCheck = {
        name: registration.name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
        lastCheck: Date.now(),
        responseTime,
        critical: registration.critical,
      };

      registration.lastResult = healthCheck;
      registration.lastRun = Date.now();

      return healthCheck;
    }
  }

  /**
   * Calculate overall system status from checks
   *
   * @private
   */
  private calculateOverallStatus(checks: HealthCheck[]): HealthStatus {
    let hasUnhealthyCritical = false;
    let hasUnhealthy = false;
    let hasDegraded = false;

    for (const check of checks) {
      if (check.status === 'unhealthy' && check.critical) {
        hasUnhealthyCritical = true;
      } else if (check.status === 'unhealthy') {
        hasUnhealthy = true;
      } else if (check.status === 'degraded') {
        hasDegraded = true;
      }
    }

    if (hasUnhealthyCritical) {
      return 'unhealthy';
    } else if (hasUnhealthy) {
      return 'degraded';
    } else if (hasDegraded) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Gather system metrics
   *
   * @private
   */
  private gatherMetrics(checks: HealthCheck[]): SystemHealth['metrics'] {
    const memoryUsage = process.memoryUsage();

    // Count circuit breaker states
    let open = 0;
    let halfOpen = 0;
    let closed = 0;

    const breakers = Array.from(this.circuitBreakers.values());
    for (const breaker of breakers) {
      // Note: CircuitBreaker.getState() is async, but we need sync here
      // This is a limitation - in production, cache the state
    }

    // Count active agents
    const activeAgents = Array.from(this.agents.values()).filter(
      agent => agent.status === 'working'
    ).length;

    return {
      memoryUsage: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
      activeAgents,
      totalAgents: this.agents.size,
      circuitBreakers: {
        total: this.circuitBreakers.size,
        open,
        halfOpen,
        closed,
      },
    };
  }

  /**
   * Register built-in health checks
   *
   * @private
   */
  private registerBuiltInChecks(): void {
    // Memory check
    if (this.config.monitorMemory) {
      this.registerCheck('memory', async () => {
        const memoryUsage = process.memoryUsage();
        const heapUsedRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

        if (heapUsedRatio > this.config.memoryCriticalThreshold) {
          return {
            status: 'unhealthy',
            message: `Critical memory usage: ${(heapUsedRatio * 100).toFixed(1)}%`,
            data: {
              heapUsed: memoryUsage.heapUsed,
              heapTotal: memoryUsage.heapTotal,
              rss: memoryUsage.rss,
            },
          };
        } else if (heapUsedRatio > this.config.memoryThreshold) {
          return {
            status: 'degraded',
            message: `High memory usage: ${(heapUsedRatio * 100).toFixed(1)}%`,
            data: {
              heapUsed: memoryUsage.heapUsed,
              heapTotal: memoryUsage.heapTotal,
              rss: memoryUsage.rss,
            },
          };
        } else {
          return {
            status: 'healthy',
            message: `Memory usage normal: ${(heapUsedRatio * 100).toFixed(1)}%`,
            data: {
              heapUsed: memoryUsage.heapUsed,
              heapTotal: memoryUsage.heapTotal,
              rss: memoryUsage.rss,
            },
          };
        }
      }, { critical: true, interval: this.config.defaultCheckInterval });
    }

    // Circuit breaker check
    if (this.config.monitorCircuitBreakers) {
      this.registerCheck('circuit-breakers', async () => {
        const states: CircuitState[] = [];

        const breakers = Array.from(this.circuitBreakers.values());
        for (const breaker of breakers) {
          const state = await breaker.getState();
          states.push(state);
        }

        const openCount = states.filter(s => s === 'open').length;
        const halfOpenCount = states.filter(s => s === 'half-open').length;

        if (openCount > 0) {
          return {
            status: 'degraded',
            message: `${openCount} circuit breaker(s) open, ${halfOpenCount} half-open`,
            data: {
              open: openCount,
              halfOpen: halfOpenCount,
              closed: states.length - openCount - halfOpenCount,
            },
          };
        } else if (halfOpenCount > 0) {
          return {
            status: 'degraded',
            message: `${halfOpenCount} circuit breaker(s) in half-open state`,
            data: {
              open: 0,
              halfOpen: halfOpenCount,
              closed: states.length - halfOpenCount,
            },
          };
        } else {
          return {
            status: 'healthy',
            message: 'All circuit breakers closed',
            data: {
              open: 0,
              halfOpen: 0,
              closed: states.length,
            },
          };
        }
      }, { critical: false, interval: this.config.defaultCheckInterval });
    }

    // Uptime check
    this.registerCheck('uptime', async () => {
      const uptime = Date.now() - this.config.startTime;

      return {
        status: 'healthy',
        message: `System uptime: ${Math.floor(uptime / 1000)}s`,
        data: {
          uptimeMs: uptime,
          uptimeSeconds: Math.floor(uptime / 1000),
          startTime: this.config.startTime,
        },
      };
    }, { critical: false, interval: this.config.defaultCheckInterval });
  }
}

// Import CircuitState for type checking
import { CircuitState } from './circuit-breaker.js';

/**
 * Create a health monitor instance
 *
 * Factory function for creating a health monitor with configuration.
 *
 * @param config - Health monitor configuration
 * @returns Configured health monitor instance
 *
 * @example
 * ```typescript
 * const monitor = createHealthMonitor({
 *   version: '1.0.0',
 *   startTime: Date.now(),
 *   memoryThreshold: 0.7
 * });
 * ```
 */
export function createHealthMonitor(
  config?: Partial<HealthMonitorConfig>
): HealthMonitor {
  return new HealthMonitor(config);
}
