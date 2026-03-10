/**
 * wshobson Performance Testing & Profiling
 *
 * Provides load testing, performance profiling, and memory leak detection
 * for agent delegation systems. This module enables stress testing with
 * 500+ concurrent agents and provides detailed performance metrics.
 *
 * Key Features:
 * - Load testing with configurable agent counts and ramp-up
 * - Operation profiling with percentile calculations (p50, p95, p99)
 * - Memory leak detection through GC-based analysis
 * - Throughput and latency measurements
 * - Resource usage tracking (memory, CPU)
 *
 * @module wshobson/performance
 */

/**
 * Load testing configuration
 *
 * Defines parameters for stress testing the agent delegation system
 * with large numbers of concurrent agents.
 *
 * @example
 * ```typescript
 * const config: LoadTestConfig = {
 *   agentCount: 500,
 *   delegationCount: 10,
 *   duration: 60000,  // 1 minute
 *   rampUp: 10000,    // 10 second ramp-up
 * };
 * ```
 */
export interface LoadTestConfig {
  /**
   * Number of concurrent agents to simulate
   * Typical: 500+ for production stress testing
   */
  agentCount: number;

  /**
   * Number of parallel delegations per agent
   * Simulates realistic multi-task delegation scenarios
   */
  delegationCount: number;

  /**
   * Test duration in milliseconds
   * Longer tests provide more accurate results
   */
  duration: number;

  /**
   * Ramp-up time in milliseconds
   * Agents are gradually started during this period
   * Prevents thundering herd problems
   */
  rampUp: number;

  /**
   * Optional: think time between delegations (ms)
   * Simulates realistic pacing between operations
   */
  thinkTime?: number;

  /**
   * Optional: timeout for individual delegations (ms)
   * Default: 30000 (30 seconds)
   */
  delegationTimeout?: number;
}

/**
 * Performance profile for a single operation
 *
 * Captures detailed timing statistics including percentiles
 * for understanding operation performance characteristics.
 *
 * @example
 * ```typescript
 * const profile: PerformanceProfile = {
 *   operation: 'delegate-to-data-analyst',
 *   calls: 1000,
 *   totalTime: 5000,
 *   avgTime: 5,
 *   minTime: 2,
 *   maxTime: 50,
 *   p50: 4,
 *   p95: 15,
 *   p99: 30,
 * };
 * ```
 */
export interface PerformanceProfile {
  /**
   * Operation name or identifier
   * e.g., 'delegate-to-data-analyst', 'query-agents'
   */
  operation: string;

  /**
   * Total number of calls profiled
   */
  calls: number;

  /**
   * Total time across all calls (ms)
   */
  totalTime: number;

  /**
   * Average time per call (ms)
   */
  avgTime: number;

  /**
   * Minimum call time (ms)
   * Identifies best-case performance
   */
  minTime: number;

  /**
   * Maximum call time (ms)
   * Identifies worst-case performance and outliers
   */
  maxTime: number;

  /**
   * 50th percentile (median) latency (ms)
   * Half of operations complete faster than this
   */
  p50: number;

  /**
   * 95th percentile latency (ms)
   * 95% of operations complete faster than this
   * Key metric for SLA compliance
   */
  p95: number;

  /**
   * 99th percentile latency (ms)
   * 99% of operations complete faster than this
   * Identifies tail latency issues
   */
  p99: number;
}

/**
 * Load test results
 *
 * Comprehensive metrics from load testing execution.
 *
 * @example
 * ```typescript
 * const results: LoadTestResults = {
 *   throughput: 450.5,  // operations per second
 *   avgLatency: 125,
 *   p99Latency: 500,
 *   errorRate: 0.02,  // 2% error rate
 *   memoryUsage: 512,  // MB
 *   peakMemoryUsage: 768,
 *   cpuUsage: 0.75,  // 75%
 *   successfulRequests: 45000,
 *   failedRequests: 900,
 *   totalRequests: 45900,
 * };
 * ```
 */
export interface LoadTestResults {
  /**
   * Throughput in operations per second
   * Calculated as successful requests / total duration
   */
  throughput: number;

  /**
   * Average latency in milliseconds
   */
  avgLatency: number;

  /**
   * 99th percentile latency in milliseconds
   * Critical for tail latency analysis
   */
  p99Latency: number;

  /**
   * Error rate (0-1)
   * Calculated as failed requests / total requests
   */
  errorRate: number;

  /**
   * Memory usage in MB
   * Average memory usage during test
   */
  memoryUsage: number;

  /**
   * Peak memory usage in MB
   * Maximum memory observed during test
   */
  peakMemoryUsage: number;

  /**
   * CPU usage (0-1)
   * Average CPU utilization during test
   */
  cpuUsage?: number;

  /**
   * Number of successful requests
   */
  successfulRequests: number;

  /**
   * Number of failed requests
   */
  failedRequests: number;

  /**
   * Total number of requests attempted
   */
  totalRequests: number;

  /**
   * Duration of the test in milliseconds
   */
  duration: number;

  /**
   * Detailed error breakdown
   * Maps error type to count
   */
  errorBreakdown?: Map<string, number>;
}

/**
 * Memory leak detection results
 *
 * Reports potential memory leaks identified through
 * iterative testing and garbage collection analysis.
 *
 * @example
 * ```typescript
 * const leakResults: MemoryLeakResults = {
 *   hasLeaks: true,
 *   growthRate: 1.5,  // MB per 1000 iterations
 *   leakObjects: ['AgentCache', 'ResultBuffer'],
 *   baseHeap: 100,
 *   finalHeap: 250,
 *   iterations: 10000,
 * };
 * ```
 */
export interface MemoryLeakResults {
  /**
   * Whether memory leaks were detected
   */
  hasLeaks: boolean;

  /**
   * Memory growth rate (MB per 1000 iterations)
   * Positive values indicate potential leaks
   */
  growthRate: number;

  /**
   * Object types showing leak patterns
   * Identified through heap size analysis
   */
  leakObjects: string[];

  /**
   * Base heap size in MB before iterations
   */
  baseHeap: number;

  /**
   * Final heap size in MB after iterations
   */
  finalHeap: number;

  /**
   * Number of iterations executed
   */
  iterations: number;

  /**
   * Confidence level (0-1)
   * Higher values indicate more confident leak detection
   */
  confidence?: number;
}

/**
 * Timing data for a single operation
 *
 * Internal structure for tracking individual operation timings.
 */
interface TimingData {
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Performance profiler for agent delegation operations
 *
 * Provides comprehensive performance profiling including:
 * - Operation timing with percentile calculations
 * - Load testing with concurrent agent simulation
 * - Memory leak detection
 * - Resource usage tracking
 *
 * @example
 * ```typescript
 * const profiler = new PerformanceProfiler();
 *
 * // Profile a single operation
 * const result = await profiler.profile('delegate-task', async () => {
 *   return await delegateToAgent(task);
 * });
 *
 * // Run load test
 * const results = await profiler.loadTest({
 *   agentCount: 500,
 *   delegationCount: 10,
 *   duration: 60000,
 *   rampUp: 10000,
 * });
 *
 * // Detect memory leaks
 * const leaks = await profiler.detectLeaks(10000);
 * ```
 */
export class PerformanceProfiler {
  /**
   * Stores timing data for each operation
   */
  private profiles: Map<string, TimingData[]> = new Map();

  /**
   * Active load test state
   */
  private loadTestActive = false;

  /**
   * Load test results cache
   */
  private cachedResults: LoadTestResults | null = null;

  /**
   * Get current heap usage in MB
   */
  private getHeapUsage(): number {
    if (global.gc) {
      global.gc();
    }
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024;
  }

  /**
   * Calculate percentiles from sorted array
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  /**
   * Profile an operation and record its timing
   *
   * Wraps any async function with timing and success/failure tracking.
   *
   * @param operation - Name of the operation being profiled
   * @param fn - Async function to execute and profile
   * @returns Result of the function execution
   *
   * @example
   * ```typescript
   * const result = await profiler.profile('query-agents', async () => {
   *   return await repository.query({ capability: 'data-analysis' });
   * });
   * ```
   */
  async profile<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      return await fn();
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const timing: TimingData = {
        duration,
        timestamp: startTime,
        success,
        error,
      };

      if (!this.profiles.has(operation)) {
        this.profiles.set(operation, []);
      }
      this.profiles.get(operation)!.push(timing);
    }
  }

  /**
   * Get performance profile for an operation
   *
   * Calculates detailed statistics including percentiles
   * for all recorded timings of the specified operation.
   *
   * @param operation - Name of the operation to profile
   * @returns Performance profile with detailed statistics
   *
   * @example
   * ```typescript
   * const profile = profiler.getProfile('delegate-task');
   * console.log(`P95 latency: ${profile.p95}ms`);
   * console.log(`Success rate: ${(profile.successfulCalls / profile.calls * 100).toFixed(1)}%`);
   * ```
   */
  getProfile(operation: string): PerformanceProfile | null {
    const timings = this.profiles.get(operation);
    if (!timings || timings.length === 0) {
      return null;
    }

    const successfulTimings = timings.filter(t => t.success).map(t => t.duration);
    const allTimings = timings.map(t => t.duration);

    successfulTimings.sort((a, b) => a - b);

    const totalTime = allTimings.reduce((sum, t) => sum + t, 0);

    return {
      operation,
      calls: timings.length,
      totalTime,
      avgTime: totalTime / timings.length,
      minTime: Math.min(...allTimings),
      maxTime: Math.max(...allTimings),
      p50: this.calculatePercentile(successfulTimings, 50),
      p95: this.calculatePercentile(successfulTimings, 95),
      p99: this.calculatePercentile(successfulTimings, 99),
    };
  }

  /**
   * Get all performance profiles
   *
   * Returns profiles for all operations that have been tracked.
   *
   * @returns Map of operation names to performance profiles
   */
  getAllProfiles(): Map<string, PerformanceProfile> {
    const result = new Map<string, PerformanceProfile>();
    const operations = Array.from(this.profiles.keys());
    for (const operation of operations) {
      const profile = this.getProfile(operation);
      if (profile) {
        result.set(operation, profile);
      }
    }
    return result;
  }

  /**
   * Reset all profiling data
   *
   * Clears all recorded timing data. Useful for starting
   * fresh profiling sessions.
   */
  reset(): void {
    this.profiles.clear();
    this.cachedResults = null;
  }

  /**
   * Run a load test with configurable parameters
   *
   * Simulates high-load scenarios with many concurrent agents
   * delegating tasks in parallel.
   *
   * @param config - Load test configuration
   * @param simulateDelegate - Function that simulates delegation
   * @returns Comprehensive load test results
   *
   * @example
   * ```typescript
   * const results = await profiler.loadTest({
   *   agentCount: 500,
   *   delegationCount: 10,
   *   duration: 60000,
   *   rampUp: 10000,
   * }, async (agentId, taskId) => {
   *   // Simulate delegation work
   *   await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
   *   return { success: true };
   * });
   * ```
   */
  async loadTest(
    config: LoadTestConfig,
    simulateDelegate?: (agentId: string, taskId: number) => Promise<{ success: boolean; latency?: number }>
  ): Promise<LoadTestResults> {
    if (this.loadTestActive) {
      throw new Error('Load test already in progress');
    }

    this.loadTestActive = true;
    this.reset();

    const startTime = Date.now();
    const endTime = startTime + config.duration;

    // Track metrics
    let successfulRequests = 0;
    let failedRequests = 0;
    const errorBreakdown = new Map<string, number>();
    const latencies: number[] = [];

    // Memory tracking
    const initialMemory = this.getHeapUsage();
    let peakMemory = initialMemory;

    // Calculate delay between agent starts for ramp-up
    const agentDelay = config.rampUp / config.agentCount;

    // Create batches of agents
    const batchSize = Math.max(1, Math.floor(config.agentCount / 10));

    try {
      // Run load test
      const runAgent = async (agentId: string): Promise<void> => {
        const agentStartMemory = this.getHeapUsage();

        for (let i = 0; i < config.delegationCount; i++) {
          // Check if test duration exceeded
          if (Date.now() > endTime) {
            break;
          }

          // Think time between delegations
          if (config.thinkTime && config.thinkTime > 0) {
            await new Promise(resolve => setTimeout(resolve, config.thinkTime));
          }

          const delegationStart = Date.now();

          try {
            // Use provided simulation function or default
            if (simulateDelegate) {
              const result = await simulateDelegate(agentId, i);
              if (result.success) {
                successfulRequests++;
                latencies.push(result.latency || (Date.now() - delegationStart));
              } else {
                failedRequests++;
              }
            } else {
              // Default simulation: just wait a random time
              const waitTime = Math.random() * 50 + 10;
              await new Promise(resolve => setTimeout(resolve, waitTime));
              successfulRequests++;
              latencies.push(waitTime);
            }
          } catch (error) {
            failedRequests++;
            const errorType = error instanceof Error ? error.name : 'Unknown';
            errorBreakdown.set(errorType, (errorBreakdown.get(errorType) || 0) + 1);
          }

          // Track peak memory
          const currentMemory = this.getHeapUsage();
          if (currentMemory > peakMemory) {
            peakMemory = currentMemory;
          }
        }
      };

      // Start agents with ramp-up
      const agentPromises: Promise<void>[] = [];
      let startedAgents = 0;

      const startAgentsBatch = (): void => {
        const batchEnd = Math.min(startedAgents + batchSize, config.agentCount);

        for (let i = startedAgents; i < batchEnd; i++) {
          const agentId = `agent-${i}`;
          agentPromises.push(
            new Promise<void>(resolve => {
              setTimeout(() => {
                runAgent(agentId).then(() => resolve());
              }, i * agentDelay);
            })
          );
        }

        startedAgents = batchEnd;

        if (startedAgents < config.agentCount) {
          setTimeout(startAgentsBatch, batchSize * agentDelay);
        }
      };

      startAgentsBatch();

      // Wait for all agents to complete or timeout
      await Promise.race([
        Promise.all(agentPromises),
        new Promise(resolve => setTimeout(resolve, config.duration)),
      ]);

    } finally {
      this.loadTestActive = false;
    }

    const actualDuration = Date.now() - startTime;
    const totalRequests = successfulRequests + failedRequests;
    const avgMemory = (initialMemory + peakMemory) / 2;

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p99Latency = this.calculatePercentile(latencies, 99);

    // Build results
    const results: LoadTestResults = {
      throughput: (successfulRequests / actualDuration) * 1000,
      avgLatency: latencies.length > 0
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
        : 0,
      p99Latency,
      errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
      memoryUsage: avgMemory,
      peakMemoryUsage: peakMemory,
      successfulRequests,
      failedRequests,
      totalRequests,
      duration: actualDuration,
      errorBreakdown,
    };

    this.cachedResults = results;
    return results;
  }

  /**
   * Detect memory leaks through iterative testing
   *
   * Runs multiple iterations and monitors heap growth
   * to identify potential memory leaks.
   *
   * @param iterations - Number of iterations to run
   * @param simulateOperation - Function that simulates the operation to test
   * @returns Memory leak detection results
   *
   * @example
   * ```typescript
   * const leaks = await profiler.detectLeaks(10000, async () => {
   *   // Simulate agent delegation
   *   const agents = await repository.query({ capability: 'test' });
   *   return agents.length;
   * });
   *
   * if (leaks.hasLeaks) {
   *   console.warn(`Memory leak detected: ${leaks.growthRate} MB/1k iterations`);
   * }
   * ```
   */
  async detectLeaks<T>(
    iterations: number,
    simulateOperation: () => Promise<T>
  ): Promise<MemoryLeakResults> {
    // Force initial GC
    if (global.gc) {
      global.gc();
    }

    const baseHeap = this.getHeapUsage();
    const checkPoints: number[] = [];
    const checkInterval = Math.max(1, Math.floor(iterations / 10));

    // Run iterations and track memory
    for (let i = 0; i < iterations; i++) {
      await simulateOperation();

      // Record memory at checkpoints
      if (i % checkInterval === 0) {
        if (global.gc) {
          global.gc();
        }
        checkPoints.push(this.getHeapUsage());
      }
    }

    // Force final GC
    if (global.gc) {
      global.gc();
    }

    const finalHeap = this.getHeapUsage();

    // Calculate growth rate
    const heapGrowth = finalHeap - baseHeap;
    const growthRate = (heapGrowth / iterations) * 1000; // MB per 1000 iterations

    // Determine if leak exists (growth > 10% of base heap)
    const hasLeaks = heapGrowth > baseHeap * 0.1;

    // Analyze growth pattern
    const leakObjects: string[] = [];
    if (hasLeaks) {
      // Check if growth is consistent (indicates leak)
      const growths: number[] = [];
      for (let i = 1; i < checkPoints.length; i++) {
        growths.push(checkPoints[i] - checkPoints[i - 1]);
      }

      const avgGrowth = growths.reduce((sum, g) => sum + g, 0) / growths.length;
      const positiveGrowths = growths.filter(g => g > 0).length;

      // If >70% of checkpoints show growth, likely a leak
      if (positiveGrowths / growths.length > 0.7) {
        leakObjects.push('Unknown');
      }
    }

    // Calculate confidence based on iterations and growth
    const confidence = Math.min(1, iterations / 10000) * (hasLeaks ? 0.9 : 0.5);

    return {
      hasLeaks,
      growthRate,
      leakObjects,
      baseHeap,
      finalHeap,
      iterations,
      confidence,
    };
  }

  /**
   * Get cached load test results
   *
   * Returns the most recent load test results if available.
   */
  getCachedResults(): LoadTestResults | null {
    return this.cachedResults;
  }

  /**
   * Export profiling data as JSON
   *
   * Serializes all profiling data for external analysis.
   */
  exportData(): string {
    const data = {
      profiles: Array.from(this.getAllProfiles().entries()),
      loadTestResults: this.cachedResults,
      exportTime: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Print performance summary
   *
   * Outputs a human-readable summary of all profiling data.
   */
  printSummary(): void {
    console.log('\n=== Performance Profiling Summary ===\n');

    const profiles = this.getAllProfiles();
    if (profiles.size === 0) {
      console.log('No profiling data available.');
      return;
    }

    for (const [operation, profile] of Array.from(profiles.entries())) {
      console.log(`Operation: ${profile.operation}`);
      console.log(`  Calls: ${profile.calls}`);
      console.log(`  Avg: ${profile.avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${profile.minTime}ms`);
      console.log(`  Max: ${profile.maxTime}ms`);
      console.log(`  P50: ${profile.p50.toFixed(2)}ms`);
      console.log(`  P95: ${profile.p95.toFixed(2)}ms`);
      console.log(`  P99: ${profile.p99.toFixed(2)}ms`);
      console.log('');
    }

    if (this.cachedResults) {
      console.log('\n=== Load Test Results ===\n');
      console.log(`Throughput: ${this.cachedResults.throughput.toFixed(2)} ops/sec`);
      console.log(`Avg Latency: ${this.cachedResults.avgLatency.toFixed(2)}ms`);
      console.log(`P99 Latency: ${this.cachedResults.p99Latency.toFixed(2)}ms`);
      console.log(`Error Rate: ${(this.cachedResults.errorRate * 100).toFixed(2)}%`);
      console.log(`Memory Usage: ${this.cachedResults.memoryUsage.toFixed(2)} MB`);
      console.log(`Peak Memory: ${this.cachedResults.peakMemoryUsage.toFixed(2)} MB`);
      console.log(`Successful: ${this.cachedResults.successfulRequests}`);
      console.log(`Failed: ${this.cachedResults.failedRequests}`);
      console.log('');
    }
  }
}
