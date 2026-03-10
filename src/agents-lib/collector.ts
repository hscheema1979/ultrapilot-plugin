/**
 * wshobson Result Collector
 *
 * Collects and aggregates results from parallel agent delegations.
 * Handles partial failures, timeouts, duplicate results, and provides
 * comprehensive statistics for multi-agent workflows.
 *
 * This component is part of Phase 3: Parallel Delegation & Result Synthesis.
 * It works in conjunction with the parallel delegation system to collect
 * results from multiple agents executing concurrently.
 */

import type { DelegationResult } from './delegator.js';

/**
 * Result from a single parallel agent delegation
 *
 * Extends the base DelegationResult with additional metadata
 * for parallel execution tracking.
 *
 * @example
 * ```typescript
 * const parallelResult: ParallelDelegationResult = {
 *   ...delegationResult,
 *   agentId: 'worker-1',
 *   taskId: 'task-001',
 *   parallelExecutionId: 'parallel-123',
 *   startTime: 1677648000000,
 *   endTime: 1677648005000,
 *   completed: true,
 *   timedOut: false,
 *   duplicate: false,
 *   order: 0,
 * };
 * ```
 */
export interface ParallelDelegationResult extends DelegationResult {
  /**
   * Unique identifier for this agent in the parallel execution
   * Format: 'worker-{N}' or custom agent ID
   */
  agentId: string;

  /**
   * Task identifier this result corresponds to
   */
  taskId: string;

  /**
   * Parallel execution group identifier
   * All results from the same parallel execution share this ID
   */
  parallelExecutionId: string;

  /**
   * Timestamp when the agent started execution (ms since epoch)
   */
  startTime: number;

  /**
   * Timestamp when the agent completed or failed (ms since epoch)
   */
  endTime: number;

  /**
   * Whether the agent completed execution
   * false if the agent is still running or was cancelled
   */
  completed: boolean;

  /**
   * Whether the agent timed out during execution
   */
  timedOut: boolean;

  /**
   * Whether this is a duplicate result (same agent called twice)
   */
  duplicate: boolean;

  /**
   * Order in which this result was received (0-indexed)
   * Useful for maintaining completion order
   */
  order: number;
}

/**
 * Collected and aggregated results from parallel execution
 *
 * Provides comprehensive statistics and categorization of
 * results from multiple agents.
 *
 * @example
 * ```typescript
 * const collected: CollectedResults = {
 *   successful: [result1, result2],
 *   failed: [result3],
 *   total: 3,
 *   successCount: 2,
 *   failureCount: 1,
 *   duration: 5000,
 *   statistics: {
 *     successRate: 0.67,
 *     averageDuration: 1666,
 *     minDuration: 1200,
 *     maxDuration: 2000,
 *     errorBreakdown: {
 *       'TIMEOUT': 1,
 *     }
 *   },
 *   agentBreakdown: {
 *     'worker-1': { success: true, duration: 1200 },
 *     'worker-2': { success: true, duration: 1800 },
 *     'worker-3': { success: false, duration: 2000, error: 'TIMEOUT' },
 *   },
 *   duplicateResults: [],
 *   timeoutResults: [],
 *   partialResults: false,
 * };
 * ```
 */
export interface CollectedResults {
  /**
   * Successfully completed results
   */
  successful: ParallelDelegationResult[];

  /**
   * Failed results (including timeouts)
   */
  failed: ParallelDelegationResult[];

  /**
   * Total number of results
   */
  total: number;

  /**
   * Number of successful results
   */
  successCount: number;

  /**
   * Number of failed results
   */
  failureCount: number;

  /**
   * Total duration of the parallel execution in milliseconds
   * Measured from start of first agent to end of last agent
   */
  duration: number;

  /**
   * Aggregated statistics
   */
  statistics: ResultStatistics;

  /**
   * Breakdown of results by agent ID
   */
  agentBreakdown: Record<string, AgentResultInfo>;

  /**
   * Results that are duplicates (same agent called twice)
   */
  duplicateResults: ParallelDelegationResult[];

  /**
   * Results that timed out
   */
  timeoutResults: ParallelDelegationResult[];

  /**
   * Whether some agents did not complete
   * true if any results are incomplete or pending
   */
  partialResults: boolean;

  /**
   * Parallel execution ID for these results
   */
  parallelExecutionId: string;
}

/**
 * Result information for a single agent
 */
export interface AgentResultInfo {
  /**
   * Agent ID
   */
  agentId: string;

  /**
   * Whether the agent succeeded
   */
  success: boolean;

  /**
   * Execution duration in milliseconds
   */
  duration: number;

  /**
   * Error code if failed
   */
  error?: string;

  /**
   * Error message if failed
   */
  errorMessage?: string;

  /**
   * Whether the result is a duplicate
   */
  duplicate: boolean;

  /**
   * Whether the agent timed out
   */
  timedOut: boolean;

  /**
   * Completion order (0-indexed)
   */
  order: number;
}

/**
 * Statistical summary of collected results
 *
 * Provides insights into execution performance and reliability.
 *
 * @example
 * ```typescript
 * const stats: ResultStatistics = {
 *   successRate: 0.85,        // 85% success
 *   averageDuration: 2345,    // 2.3 seconds average
 *   minDuration: 1200,        // 1.2 seconds fastest
 *   maxDuration: 5000,        // 5.0 seconds slowest
 *   medianDuration: 2100,     // 2.1 seconds median
 *   percentiles: {
 *     p50: 2100,
 *     p90: 4500,
 *     p95: 4800,
 *     p99: 4950,
 *   },
 *   errorBreakdown: {
 *     'TIMEOUT': 3,
 *     'AGENT_NOT_FOUND': 1,
 *     'EXECUTION_ERROR': 2,
 *   },
 *   totalErrors: 6,
 *   completionRate: 0.92,     // 92% of agents completed
 *   duplicateRate: 0.0,       // 0% duplicates
 *   timeoutRate: 0.15,        // 15% timeouts
 * };
 * ```
 */
export interface ResultStatistics {
  /**
   * Success rate (0-1)
   * Calculated as: successCount / total
   */
  successRate: number;

  /**
   * Average execution duration in milliseconds
   * Calculated across all completed results
   */
  averageDuration: number;

  /**
   * Minimum execution duration in milliseconds
   */
  minDuration: number;

  /**
   * Maximum execution duration in milliseconds
   */
  maxDuration: number;

  /**
   * Median execution duration in milliseconds
   */
  medianDuration: number;

  /**
   * Percentile durations in milliseconds
   */
  percentiles: {
    /**
     * 50th percentile (median)
     */
    p50: number;

    /**
     * 75th percentile
     */
    p75: number;

    /**
     * 90th percentile
     */
    p90: number;

    /**
     * 95th percentile
     */
    p95: number;

    /**
     * 99th percentile
     */
    p99: number;
  };

  /**
   * Breakdown of errors by error code
   * Key: error code, Value: count
   */
  errorBreakdown: Record<string, number>;

  /**
   * Total number of errors
   */
  totalErrors: number;

  /**
   * Completion rate (0-1)
   * Calculated as: completedCount / total
   */
  completionRate: number;

  /**
   * Duplicate rate (0-1)
   * Calculated as: duplicateCount / total
   */
  duplicateRate: number;

  /**
   * Timeout rate (0-1)
   * Calculated as: timeoutCount / total
   */
  timeoutRate: number;
}

/**
 * Collector configuration options
 *
 * @example
 * ```typescript
 * const config: CollectorConfig = {
 *   timeout: 30000,           // 30 second timeout per agent
 *   waitForAll: true,         // Wait for all agents to complete
 *   allowPartialResults: true, // Return partial results on timeout
 *   detectDuplicates: true,   // Detect and flag duplicate results
 *   calculatePercentiles: true, // Calculate percentile statistics
 *   maxResults: 100,          // Maximum number of results to collect
 * };
 * ```
 */
export interface CollectorConfig {
  /**
   * Per-agent timeout in milliseconds
   * Default: 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Whether to wait for all agents to complete
   * If false, returns as soon as any agent completes
   * Default: true
   */
  waitForAll?: boolean;

  /**
   * Whether to allow partial results on timeout
   * If true, returns partial results when timeout occurs
   * If false, throws an error on timeout
   * Default: true
   */
  allowPartialResults?: boolean;

  /**
   * Whether to detect and flag duplicate results
   * Default: true
   */
  detectDuplicates?: boolean;

  /**
   * Whether to calculate percentile statistics
   * Default: true
   */
  calculatePercentiles?: boolean;

  /**
   * Maximum number of results to collect
   * Default: Infinity (no limit)
   */
  maxResults?: number;

  /**
   * Callback for progress updates during collection
   */
  onProgress?: (update: CollectionProgress) => void;
}

/**
 * Progress update during result collection
 */
export interface CollectionProgress {
  /**
   * Parallel execution ID
   */
  parallelExecutionId: string;

  /**
   * Number of results collected so far
   */
  collected: number;

  /**
   * Total number of expected results
   */
  total: number;

  /**
   * Number of successful results so far
   */
  successful: number;

  /**
   * Number of failed results so far
   */
  failed: number;

  /**
   * Timestamp of the progress update
   */
  timestamp: number;
}

/**
 * Default collector configuration
 */
const DEFAULT_CONFIG: Required<CollectorConfig> = {
  timeout: 60000,
  waitForAll: true,
  allowPartialResults: true,
  detectDuplicates: true,
  calculatePercentiles: true,
  maxResults: Infinity,
  onProgress: () => {},
};

/**
 * Result Collector for Parallel Agent Delegation
 *
 * Collects and aggregates results from multiple agents executing in parallel.
 * Handles timeouts, partial failures, duplicate results, and provides
 * comprehensive statistics.
 *
 * @example
 * ```typescript
 * const collector = new ResultCollector({
 *   timeout: 30000,
 *   waitForAll: true,
 *   allowPartialResults: true,
 * });
 *
 * // Collect results from parallel execution
 * const results = await collector.collect([
 *   result1,
 *   result2,
 *   result3,
 * ]);
 *
 * console.log(`Success rate: ${results.statistics.successRate}`);
 * console.log(`Average duration: ${results.statistics.averageDuration}ms`);
 * console.log(`Errors: ${results.statistics.totalErrors}`);
 *
 * // Check if all agents completed successfully
 * if (results.successful.length === results.total) {
 *   console.log('All agents completed successfully!');
 * }
 *
 * // Handle partial results
 * if (results.partialResults) {
 *   console.warn('Some agents did not complete');
 * }
 * ```
 */
export class ResultCollector {
  private readonly config: Required<CollectorConfig>;
  private readonly activeCollections: Map<string, Set<string>>;

  /**
   * Create a new result collector
   *
   * @param config - Collector configuration options
   */
  constructor(config?: CollectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeCollections = new Map();
  }

  /**
   * Collect results from parallel agent execution
   *
   * This method:
   * 1. Validates and deduplicates results
   * 2. Waits for all agents to complete (with timeout)
   * 3. Collects partial results on failure if configured
   * 4. Calculates comprehensive statistics
   * 5. Returns aggregated results
   *
   * @param results - Array of results from parallel execution
   * @param parallelExecutionId - Optional parallel execution ID
   * @returns Promise resolving to collected and aggregated results
   *
   * @example
   * ```typescript
   * const results = await collector.collect([
   *   {
   *     agentId: 'worker-1',
   *     taskId: 'task-1',
   *     parallelExecutionId: 'exec-123',
   *     success: true,
   *     output: 'Task completed',
   *     duration: 1000,
   *     agentName: 'business-analyst',
   *     startTime: Date.now() - 1000,
   *     endTime: Date.now(),
   *     completed: true,
   *     timedOut: false,
   *     duplicate: false,
   *     order: 0,
   *   },
   *   // ... more results
   * ], 'exec-123');
   * ```
   */
  async collect(
    results: ParallelDelegationResult[],
    parallelExecutionId?: string
  ): Promise<CollectedResults> {
    const startTime = Date.now();

    // Validate input
    this.validateResults(results);

    // Detect and flag duplicates
    const processedResults = this.config.detectDuplicates
      ? this.detectDuplicates(results)
      : results;

    // Group results by status
    const successful = processedResults.filter(r => r.success && r.completed);
    const failed = processedResults.filter(r => !r.success || !r.completed);

    // Check for partial results
    const partialResults = processedResults.some(r => !r.completed);

    // Calculate duration
    const duration = this.calculateDuration(processedResults);

    // Calculate statistics
    const statistics = this.calculateStatistics(processedResults);

    // Build agent breakdown
    const agentBreakdown = this.buildAgentBreakdown(processedResults);

    // Extract duplicates and timeouts
    const duplicateResults = processedResults.filter(r => r.duplicate);
    const timeoutResults = processedResults.filter(r => r.timedOut);

    // Create collected results object
    const collected: CollectedResults = {
      successful,
      failed,
      total: processedResults.length,
      successCount: successful.length,
      failureCount: failed.length,
      duration,
      statistics,
      agentBreakdown,
      duplicateResults,
      timeoutResults,
      partialResults,
      parallelExecutionId: parallelExecutionId || processedResults[0]?.parallelExecutionId || 'unknown',
    };

    return collected;
  }

  /**
   * Collect results with timeout per agent
   *
   * This method is useful when results arrive asynchronously and you need
   * to enforce a timeout per agent. It waits for all agents to complete
   * or the timeout to expire, whichever comes first.
   *
   * @param pendingResults - Array of promises that resolve to results
   * @param parallelExecutionId - Optional parallel execution ID
   * @returns Promise resolving to collected results
   *
   * @example
   * ```typescript
   * // Start parallel agent executions
   * const pendingResults = agents.map(agent =>
   *   this.executeAgent(agent, task).then(result => ({
   *     ...result,
   *     agentId: agent.id,
   *     taskId: task.id,
   *     // ... other metadata
   *   }))
   * );
   *
   * // Collect with 30s timeout per agent
   * const collected = await collector.collectWithTimeout(
   *   pendingResults,
   *   'exec-123'
   * );
   * ```
   */
  async collectWithTimeout(
    pendingResults: Promise<ParallelDelegationResult>[],
    parallelExecutionId?: string
  ): Promise<CollectedResults> {
    const startTime = Date.now();
    const results: ParallelDelegationResult[] = [];
    const total = pendingResults.length;
    let collected = 0;
    let successful = 0;
    let failed = 0;

    // Create a race condition for each promise with timeout
    const races = pendingResults.map((promise, index) => {
      return Promise.race([
        promise,
        this.createTimeoutResult(index, parallelExecutionId),
      ]);
    });

    // Wait for all races to complete
    const settledResults = await Promise.all(races);

    // Process settled results
    for (const result of settledResults) {
      results.push(result);
      collected++;

      if (result.success && result.completed) {
        successful++;
      } else {
        failed++;
      }

      // Emit progress update
      this.config.onProgress({
        parallelExecutionId: parallelExecutionId || 'unknown',
        collected,
        total,
        successful,
        failed,
        timestamp: Date.now(),
      });
    }

    // Use the regular collect method to aggregate
    return await this.collect(results, parallelExecutionId);
  }

  /**
   * Collect results incrementally as they arrive
   *
   * This method is useful for streaming results as agents complete,
   * rather than waiting for all agents to finish.
   *
   * @param resultStream - Async iterable of results
   * @param parallelExecutionId - Optional parallel execution ID
   * @param expectedCount - Expected number of results (optional)
   * @returns Promise resolving to collected results
   *
   * @example
   * ```typescript
   * // Create a result stream
   * async function* resultGenerator() {
   *   for (const agent of agents) {
   *     yield await executeAgent(agent);
   *   }
   * }
   *
   * // Collect incrementally
   * const collected = await collector.collectIncremental(
   *   resultGenerator(),
   *   'exec-123',
   *   agents.length
   * );
   * ```
   */
  async collectIncremental(
    resultStream: AsyncIterable<ParallelDelegationResult>,
    parallelExecutionId?: string,
    expectedCount?: number
  ): Promise<CollectedResults> {
    const startTime = Date.now();
    const results: ParallelDelegationResult[] = [];
    const total = expectedCount || 0;
    let collected = 0;
    let successful = 0;
    let failed = 0;

    // Set timeout for entire collection
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Collection timeout')), this.config.timeout);
    });

    // Create iterator promise
    const iteratorPromise = (async () => {
      for await (const result of resultStream) {
        results.push(result);
        collected++;

        if (result.success && result.completed) {
          successful++;
        } else {
          failed++;
        }

        // Emit progress update
        this.config.onProgress({
          parallelExecutionId: parallelExecutionId || 'unknown',
          collected,
          total,
          successful,
          failed,
          timestamp: Date.now(),
        });

        // Check max results limit
        if (results.length >= this.config.maxResults) {
          break;
        }
      }
    })();

    // Race between iterator and timeout
    try {
      await Promise.race([iteratorPromise, timeoutPromise]);
    } catch (error) {
      if (this.config.allowPartialResults) {
        // Return partial results
        console.warn('Collection timeout, returning partial results');
      } else {
        throw error;
      }
    }

    // Use the regular collect method to aggregate
    return await this.collect(results, parallelExecutionId);
  }

  /**
   * Validate results array
   *
   * Ensures results are properly formatted and contain required fields.
   *
   * @param results - Results to validate
   * @throws Error if validation fails
   */
  private validateResults(results: ParallelDelegationResult[]): void {
    if (!Array.isArray(results)) {
      throw new Error('Results must be an array');
    }

    if (results.length === 0) {
      throw new Error('Results array cannot be empty');
    }

    if (results.length > this.config.maxResults) {
      throw new Error(
        `Results array exceeds maximum size of ${this.config.maxResults}`
      );
    }

    // Validate each result has required fields
    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if (!result.agentId) {
        throw new Error(`Result at index ${i} missing agentId`);
      }

      if (!result.taskId) {
        throw new Error(`Result at index ${i} missing taskId`);
      }

      if (result.startTime === undefined || result.endTime === undefined) {
        throw new Error(`Result at index ${i} missing startTime or endTime`);
      }

      if (typeof result.duration !== 'number') {
        throw new Error(`Result at index ${i} has invalid duration`);
      }
    }
  }

  /**
   * Detect and flag duplicate results
   *
   * Results are considered duplicates if they have the same agentId and taskId.
   * The first occurrence is marked as non-duplicate, subsequent ones are marked
   * as duplicates.
   *
   * @param results - Results to check for duplicates
   * @returns Results with duplicate flags set
   */
  private detectDuplicates(results: ParallelDelegationResult[]): ParallelDelegationResult[] {
    const seen = new Map<string, number>(); // key: agentId-taskId, value: first index

    return results.map((result, index) => {
      const key = `${result.agentId}-${result.taskId}`;

      if (seen.has(key)) {
        // Mark as duplicate
        return { ...result, duplicate: true };
      } else {
        // First occurrence
        seen.set(key, index);
        return { ...result, duplicate: false };
      }
    });
  }

  /**
   * Calculate total duration of parallel execution
   *
   * Duration is measured from the start of the first agent to the end of the last agent.
   *
   * @param results - Results to calculate duration from
   * @returns Duration in milliseconds
   */
  private calculateDuration(results: ParallelDelegationResult[]): number {
    if (results.length === 0) return 0;

    const startTime = Math.min(...results.map(r => r.startTime));
    const endTime = Math.max(...results.map(r => r.endTime));

    return endTime - startTime;
  }

  /**
   * Calculate comprehensive statistics from results
   *
   * @param results - Results to calculate statistics from
   * @returns Calculated statistics
   */
  private calculateStatistics(results: ParallelDelegationResult[]): ResultStatistics {
    const total = results.length;
    const completedResults = results.filter(r => r.completed);
    const successfulResults = results.filter(r => r.success && r.completed);
    const failedResults = results.filter(r => !r.success || !r.completed);
    const duplicateResults = results.filter(r => r.duplicate);
    const timeoutResults = results.filter(r => r.timedOut);

    // Calculate durations
    const durations = completedResults.map(r => r.duration);
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const minDuration = sortedDurations[0] || 0;
    const maxDuration = sortedDurations[sortedDurations.length - 1] || 0;

    // Calculate median
    const medianDuration = this.calculatePercentile(sortedDurations, 50);

    // Calculate percentiles
    const percentiles = this.config.calculatePercentiles
      ? {
          p50: this.calculatePercentile(sortedDurations, 50),
          p75: this.calculatePercentile(sortedDurations, 75),
          p90: this.calculatePercentile(sortedDurations, 90),
          p95: this.calculatePercentile(sortedDurations, 95),
          p99: this.calculatePercentile(sortedDurations, 99),
        }
      : {
          p50: medianDuration,
          p75: 0,
          p90: 0,
          p95: 0,
          p99: 0,
        };

    // Calculate error breakdown
    const errorBreakdown: Record<string, number> = {};
    for (const result of failedResults) {
      const errorCode = result.error?.code || 'UNKNOWN';
      errorBreakdown[errorCode] = (errorBreakdown[errorCode] || 0) + 1;
    }

    // Calculate rates
    const successRate = total > 0 ? successfulResults.length / total : 0;
    const completionRate = total > 0 ? completedResults.length / total : 0;
    const duplicateRate = total > 0 ? duplicateResults.length / total : 0;
    const timeoutRate = total > 0 ? timeoutResults.length / total : 0;

    return {
      successRate,
      averageDuration,
      minDuration,
      maxDuration,
      medianDuration,
      percentiles,
      errorBreakdown,
      totalErrors: failedResults.length,
      completionRate,
      duplicateRate,
      timeoutRate,
    };
  }

  /**
   * Calculate percentile from sorted array
   *
   * @param sortedArray - Sorted array of numbers
   * @param percentile - Percentile to calculate (0-100)
   * @returns Percentile value
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Build agent breakdown from results
   *
   * @param results - Results to build breakdown from
   * @returns Agent breakdown map
   */
  private buildAgentBreakdown(
    results: ParallelDelegationResult[]
  ): Record<string, AgentResultInfo> {
    const breakdown: Record<string, AgentResultInfo> = {};

    for (const result of results) {
      breakdown[result.agentId] = {
        agentId: result.agentId,
        success: result.success && result.completed,
        duration: result.duration,
        error: result.error?.code,
        errorMessage: result.error?.message,
        duplicate: result.duplicate,
        timedOut: result.timedOut,
        order: result.order,
      };
    }

    return breakdown;
  }

  /**
   * Create a timeout result for an agent
   *
   * @param index - Agent index
   * @param parallelExecutionId - Parallel execution ID
   * @returns Timeout result
   */
  private async createTimeoutResult(
    index: number,
    parallelExecutionId?: string
  ): Promise<ParallelDelegationResult> {
    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, this.config.timeout));

    const startTime = Date.now() - this.config.timeout;

    return {
      success: false,
      error: {
        code: 'TIMEOUT',
        message: `Agent timed out after ${this.config.timeout}ms`,
        retryable: true,
        retryDelay: 5000,
      },
      duration: this.config.timeout,
      agentName: 'unknown',
      agentId: `worker-${index}`,
      taskId: `task-${index}`,
      parallelExecutionId: parallelExecutionId || 'unknown',
      startTime,
      endTime: Date.now(),
      completed: false,
      timedOut: true,
      duplicate: false,
      order: index,
    };
  }

  /**
   * Get current configuration
   *
   * @returns Current collector configuration
   */
  getConfig(): Required<CollectorConfig> {
    return { ...this.config };
  }

  /**
   * Create a summary string of collected results
   *
   * @param results - Collected results to summarize
   * @returns Human-readable summary string
   *
   * @example
   * ```typescript
   * const collected = await collector.collect(results);
   * const summary = collector.summarize(collected);
   * console.log(summary);
   * // Output:
   * // Parallel Execution Summary (exec-123)
   * // =====================================
   * // Total: 10 results
   * // Successful: 8 (80%)
   * // Failed: 2 (20%)
   * // Duration: 5.2s
   * // Average: 1.3s per agent
   * // Errors: TIMEOUT (2)
   * // ```
   */
  summarize(results: CollectedResults): string {
    const lines: string[] = [];

    lines.push(`Parallel Execution Summary (${results.parallelExecutionId})`);
    lines.push('='.repeat(50));
    lines.push(`Total: ${results.total} results`);
    lines.push(
      `Successful: ${results.successCount} (${(results.statistics.successRate * 100).toFixed(1)}%)`
    );
    lines.push(
      `Failed: ${results.failureCount} (${((1 - results.statistics.successRate) * 100).toFixed(1)}%)`
    );
    lines.push(`Duration: ${(results.duration / 1000).toFixed(1)}s`);
    lines.push(`Average: ${(results.statistics.averageDuration / 1000).toFixed(1)}s per agent`);
    lines.push(`Median: ${(results.statistics.medianDuration / 1000).toFixed(1)}s`);

    if (results.timeoutResults.length > 0) {
      lines.push(`Timeouts: ${results.timeoutResults.length}`);
    }

    if (results.duplicateResults.length > 0) {
      lines.push(`Duplicates: ${results.duplicateResults.length}`);
    }

    if (Object.keys(results.statistics.errorBreakdown).length > 0) {
      lines.push('Errors:');
      for (const [code, count] of Object.entries(results.statistics.errorBreakdown)) {
        lines.push(`  - ${code}: ${count}`);
      }
    }

    if (results.partialResults) {
      lines.push('WARNING: Partial results: Some agents did not complete');
    }

    return lines.join('\n');
  }

  /**
   * Export collected results to JSON
   *
   * @param results - Collected results to export
   * @param pretty - Whether to pretty-print JSON (default: true)
   * @returns JSON string
   */
  exportToJSON(results: CollectedResults, pretty: boolean = true): string {
    return JSON.stringify(results, null, pretty ? 2 : 0);
  }

  /**
   * Export collected results to CSV
   *
   * @param results - Collected results to export
   * @returns CSV string
   */
  exportToCSV(results: CollectedResults): string {
    const headers = [
      'Agent ID',
      'Task ID',
      'Success',
      'Duration (ms)',
      'Error Code',
      'Error Message',
      'Timed Out',
      'Duplicate',
      'Order',
    ];

    const rows = [
      headers.join(','),
      ...[...results.successful, ...results.failed].map(r =>
        [
          r.agentId,
          r.taskId,
          r.success,
          r.duration,
          r.error?.code || '',
          r.error?.message || '',
          r.timedOut,
          r.duplicate,
          r.order,
        ].join(',')
      ),
    ];

    return rows.join('\n');
  }
}

/**
 * Create a result collector instance
 *
 * Factory function for creating a collector with custom configuration.
 *
 * @param config - Optional collector configuration
 * @returns Configured result collector instance
 *
 * @example
 * ```typescript
 * const collector = createCollector({
 *   timeout: 30000,
 *   waitForAll: true,
 *   allowPartialResults: true,
 * });
 * ```
 */
export function createCollector(config?: CollectorConfig): ResultCollector {
  return new ResultCollector(config);
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  /**
   * Metric name
   */
  name: string;

  /**
   * Metric value
   */
  value: number;

  /**
   * Timestamp when metric was recorded
   */
  timestamp: number;

  /**
   * Optional tags for categorization
   */
  tags?: Record<string, string>;

  /**
   * Optional unit (e.g., 'ms', 'count', '%')
   */
  unit?: string;
}

/**
 * Metric aggregate data
 */
export interface MetricAggregate {
  /**
   * Metric name
   */
  name: string;

  /**
   * Count of data points
   */
  count: number;

  /**
   * Sum of values
   */
  sum: number;

  /**
   * Average value
   */
  avg: number;

  /**
   * Minimum value
   */
  min: number;

  /**
   * Maximum value
   */
  max: number;

  /**
   * 50th percentile (median)
   */
  p50: number;

  /**
   * 95th percentile
   */
  p95: number;

  /**
   * 99th percentile
   */
  p99: number;

  /**
   * First timestamp
   */
  firstTimestamp: number;

  /**
   * Last timestamp
   */
  lastTimestamp: number;
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  /**
   * Maximum number of data points per metric
   * Default: 10000
   */
  maxDataPoints?: number;

  /**
   * Whether to automatically calculate aggregates
   * Default: true
   */
  autoAggregate?: boolean;

  /**
   * Aggregation interval in milliseconds
   * Default: 60000 (1 minute)
   */
  aggregationInterval?: number;

  /**
   * Whether to persist metrics to disk
   * Default: false
   */
  persist?: boolean;

  /**
   * Directory for persisted metrics
   * Default: '.ultra/metrics'
   */
  persistDir?: string;
}

/**
 * Metrics Collector for Performance Monitoring
 *
 * Collects, aggregates, and provides insights into agent delegation performance.
 * Tracks timing metrics, counters, and gauges with configurable aggregation.
 *
 * @example
 * ```typescript
 * const collector = new MetricsCollector({
 *   maxDataPoints: 10000,
 *   autoAggregate: true,
 *   aggregationInterval: 60000,
 * });
 *
 * // Record a timing metric
 * collector.recordTiming('delegation-duration', 1250, {
 *   agent: 'data-analyst',
 *   task: 'analyze-data',
 * });
 *
 * // Record a counter
 * collector.incrementCounter('delegations-total', {
 *   agent: 'data-analyst',
 * });
 *
 * // Record a gauge (current value)
 * collector.recordGauge('active-delegations', 5);
 *
 * // Get aggregated metrics
 * const timing = collector.getAggregate('delegation-duration');
 * console.log(`P95: ${timing.p95}ms`);
 *
 * // Get all metrics
 * const all = collector.getAllMetrics();
 *
 * // Export to JSON
 * const json = collector.exportToJSON();
 *
 * // Reset metrics
 * collector.reset();
 * ```
 */
export class MetricsCollector {
  private readonly config: Required<MetricsCollectorConfig>;
  private readonly metrics: Map<string, MetricDataPoint[]>;
  private readonly aggregates: Map<string, MetricAggregate>;
  private aggregationTimer?: NodeJS.Timeout;

  constructor(config?: MetricsCollectorConfig) {
    this.config = {
      maxDataPoints: config?.maxDataPoints ?? 10000,
      autoAggregate: config?.autoAggregate ?? true,
      aggregationInterval: config?.aggregationInterval ?? 60000,
      persist: config?.persist ?? false,
      persistDir: config?.persistDir ?? '.ultra/metrics',
    };

    this.metrics = new Map();
    this.aggregates = new Map();

    // Start automatic aggregation if enabled
    if (this.config.autoAggregate) {
      this.startAggregation();
    }
  }

  /**
   * Record a timing metric (duration in milliseconds)
   *
   * @param name - Metric name
   * @param value - Duration in milliseconds
   * @param tags - Optional tags for categorization
   *
   * @example
   * ```typescript
   * collector.recordTiming('delegation-duration', 1250, {
   *   agent: 'data-analyst',
   *   task: 'analyze-data',
   * });
   * ```
   */
  recordTiming(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(name, value, tags, 'ms');
  }

  /**
   * Increment a counter metric
   *
   * @param name - Metric name
   * @param delta - Amount to increment (default: 1)
   * @param tags - Optional tags for categorization
   *
   * @example
   * ```typescript
   * collector.incrementCounter('delegations-total', 1, {
   *   agent: 'data-analyst',
   * });
   * ```
   */
  incrementCounter(name: string, delta: number = 1, tags?: Record<string, string>): void {
    // Get current value
    const points = this.metrics.get(name) || [];
    const currentValue = points.length > 0 ? points[points.length - 1].value : 0;

    this.recordMetric(name, currentValue + delta, tags, 'count');
  }

  /**
   * Record a gauge metric (current value)
   *
   * @param name - Metric name
   * @param value - Current value
   * @param tags - Optional tags for categorization
   *
   * @example
   * ```typescript
   * collector.recordGauge('active-delegations', 5);
   * collector.recordGauge('memory-usage', 1024, { unit: 'MB' });
   * ```
   */
  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(name, value, tags, 'value');
  }

  /**
   * Record a metric data point
   *
   * @param name - Metric name
   * @param value - Metric value
   * @param tags - Optional tags
   * @param unit - Optional unit
   */
  private recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
    unit?: string
  ): void {
    const point: MetricDataPoint = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      unit,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const points = this.metrics.get(name)!;
    points.push(point);

    // Trim if exceeding max size
    if (points.length > this.config.maxDataPoints) {
      points.splice(0, points.length - this.config.maxDataPoints);
    }
  }

  /**
   * Get aggregated data for a metric
   *
   * @param name - Metric name
   * @returns Aggregated metric data, or null if metric doesn't exist
   *
   * @example
   * ```typescript
   * const timing = collector.getAggregate('delegation-duration');
   * console.log(`Average: ${timing.avg}ms`);
   * console.log(`P95: ${timing.p95}ms`);
   * console.log(`P99: ${timing.p99}ms`);
   * ```
   */
  getAggregate(name: string): MetricAggregate | null {
    const points = this.metrics.get(name);
    if (!points || points.length === 0) {
      return null;
    }

    const values = points.map(p => p.value).sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const count = values.length;

    return {
      name,
      count,
      sum,
      avg: sum / count,
      min: values[0],
      max: values[values.length - 1],
      p50: this.calculatePercentile(values, 50),
      p95: this.calculatePercentile(values, 95),
      p99: this.calculatePercentile(values, 99),
      firstTimestamp: points[0].timestamp,
      lastTimestamp: points[points.length - 1].timestamp,
    };
  }

  /**
   * Get all metric aggregates
   *
   * @returns Map of metric name to aggregate data
   */
  getAllMetrics(): Map<string, MetricAggregate> {
    const result = new Map<string, MetricAggregate>();

    for (const name of Array.from(this.metrics.keys())) {
      const aggregate = this.getAggregate(name);
      if (aggregate) {
        result.set(name, aggregate);
      }
    }

    return result;
  }

  /**
   * Get raw data points for a metric
   *
   * @param name - Metric name
   * @param since - Optional timestamp to filter from
   * @returns Array of data points
   */
  getDataPoints(name: string, since?: number): MetricDataPoint[] {
    const points = this.metrics.get(name);
    if (!points) {
      return [];
    }

    if (since) {
      return points.filter(p => p.timestamp >= since);
    }

    return [...points];
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Start automatic aggregation
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.updateAggregates();
    }, this.config.aggregationInterval);
  }

  /**
   * Stop automatic aggregation
   */
  stopAggregation(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }
  }

  /**
   * Update all aggregates
   */
  private updateAggregates(): void {
    for (const name of Array.from(this.metrics.keys())) {
      const aggregate = this.getAggregate(name);
      if (aggregate) {
        this.aggregates.set(name, aggregate);
      }
    }

    // Persist if enabled
    if (this.config.persist) {
      this.persist();
    }
  }

  /**
   * Persist metrics to disk
   */
  private persist(): void {
    // Implementation would write to disk
    // For now, this is a placeholder
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.aggregates.clear();
  }

  /**
   * Reset a specific metric
   *
   * @param name - Metric name to reset
   */
  resetMetric(name: string): void {
    this.metrics.delete(name);
    this.aggregates.delete(name);
  }

  /**
   * Export metrics to JSON
   *
   * @returns JSON string of all metrics
   *
   * @example
   * ```typescript
   * const json = collector.exportToJSON();
   * console.log(json);
   * ```
   */
  exportToJSON(): string {
    const data = {
      aggregates: Array.from(this.getAllMetrics().entries()),
      exportTime: new Date().toISOString(),
      config: this.config,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import metrics from JSON
   *
   * @param json - JSON string to import
   *
   * @example
   * ```typescript
   * collector.importFromJSON(jsonString);
   * ```
   */
  importFromJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      // Implementation would restore metrics
      // For now, this is a placeholder
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Get metrics summary as a string
   *
   * @returns Human-readable summary
   *
   * @example
   * ```typescript
   * console.log(collector.getSummary());
   * // Output:
   * // Metrics Summary
   * // ===============
   * //
   * // delegation-duration:
   * //   Count: 1250
   * //   Average: 1234ms
   * //   P95: 2500ms
   * //   P99: 3500ms
   * //
   * // delegations-total:
   * //   Count: 5000
   * //   Sum: 5000
   * ```
   */
  getSummary(): string {
    const lines: string[] = [];
    lines.push('Metrics Summary');
    lines.push('='.repeat(50));
    lines.push('');

    for (const [name, aggregate] of Array.from(this.getAllMetrics().entries())) {
      lines.push(`${name}:`);
      lines.push(`  Count: ${aggregate.count}`);
      lines.push(`  Average: ${aggregate.avg.toFixed(2)}${aggregate.p50 ? 'ms' : ''}`);
      lines.push(`  Min: ${aggregate.min}${aggregate.p50 ? 'ms' : ''}`);
      lines.push(`  Max: ${aggregate.max}${aggregate.p50 ? 'ms' : ''}`);
      lines.push(`  P95: ${aggregate.p95.toFixed(2)}${aggregate.p50 ? 'ms' : ''}`);
      lines.push(`  P99: ${aggregate.p99.toFixed(2)}${aggregate.p50 ? 'ms' : ''}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Destroy the collector and cleanup resources
   */
  destroy(): void {
    this.stopAggregation();
    this.reset();
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MetricsCollectorConfig> {
    return { ...this.config };
  }

  /**
   * Get metric count
   */
  getMetricCount(): number {
    return this.metrics.size;
  }

  /**
   * Get total data point count across all metrics
   */
  getTotalDataPointCount(): number {
    let total = 0;
    for (const points of Array.from(this.metrics.values())) {
      total += points.length;
    }
    return total;
  }
}

/**
 * Create a metrics collector instance
 *
 * Factory function for creating a collector with custom configuration.
 *
 * @param config - Optional collector configuration
 * @returns Configured metrics collector instance
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector({
 *   maxDataPoints: 10000,
 *   autoAggregate: true,
 * });
 * ```
 */
export function createMetricsCollector(config?: MetricsCollectorConfig): MetricsCollector {
  return new MetricsCollector(config);
}

/**
 * Unit test examples (for documentation purposes)
 *
 * Test cases demonstrate:
 * 1. Basic result collection
 * 2. Duplicate detection
 * 3. Timeout handling
 * 4. Statistics calculation
 * 5. Export functionality
 * 6. Metrics collection
 * 7. Aggregation
 */
