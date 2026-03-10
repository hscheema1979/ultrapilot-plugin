/**
 * Result Collector
 *
 * Waits for all agents to complete and collects their results,
 * handling partial failures and providing summary statistics.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult, Agent } from './types.js';
import { ParallelResult, AgentExecution } from './parallel.js';

/**
 * Result collection metadata
 */
export interface ResultMetadata {
  /** Agent name */
  agent: string;
  /** Agent category */
  category?: string;
  /** Agent capabilities */
  capabilities?: string[];
  /** Timestamp when result was collected */
  collectedAt: number;
  /** Result size in bytes (if applicable) */
  size?: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Enhanced delegation result with metadata
 */
export interface EnhancedDelegationResult extends DelegationResult {
  /** Result metadata */
  metadata: ResultMetadata;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  /** Total number of agents */
  totalAgents: number;
  /** Number of successful results */
  successCount: number;
  /** Number of failed results */
  failureCount: number;
  /** Success rate (0.0 to 1.0) */
  successRate: number;
  /** Average duration across all agents */
  averageDuration: number;
  /** Total duration (from start to last completion) */
  totalDuration: number;
  /** Fastest completion time */
  fastestCompletion?: number;
  /** Slowest completion time */
  slowestCompletion?: number;
}

/**
 * Result collection
 */
export interface ResultCollection {
  /** Map of agent name to enhanced result */
  results: Map<string, EnhancedDelegationResult>;
  /** Map of agent name to error (for failed agents) */
  errors: Map<string, Error>;
  /** Collection statistics */
  stats: CollectionStats;
  /** Collection timestamp */
  collectedAt: number;
}

/**
 * Result Collector
 *
 * Collects and aggregates results from parallel agent execution,
 * providing comprehensive statistics and metadata.
 */
export class ResultCollector {
  /**
   * Collect results from parallel execution
   *
   * @param parallelResult - Result from parallel delegation
   * @param executions - Agent execution records
   * @param agents - Agent metadata (optional)
   * @returns Promise<ResultCollection>
   *
   * @example
   * ```typescript
   * const collection = await collector.collect(parallelResult, executions, agents);
   * console.log(`Success rate: ${collection.stats.successRate * 100}%`);
   * ```
   */
  async collect(
    parallelResult: ParallelResult,
    executions: AgentExecution[],
    agents?: Map<string, Agent>
  ): Promise<ResultCollection> {
    const collectedAt = Date.now();

    // Enhance results with metadata
    const enhancedResults = new Map<string, EnhancedDelegationResult>();

    for (const [agentName, result] of parallelResult.results) {
      const agent = agents?.get(agentName);
      const metadata: ResultMetadata = {
        agent: agentName,
        category: agent?.category,
        capabilities: agent?.capabilities.map(c => c.name),
        collectedAt,
        metadata: {
          successRate: agent?.successRate,
          lastUsed: agent?.lastUsed,
        },
      };

      // Calculate result size (if applicable)
      if (result.result) {
        metadata.size = this.calculateSize(result.result);
      }

      enhancedResults.set(agentName, {
        ...result,
        metadata,
      });
    }

    // Calculate statistics
    const stats = this.calculateStats(executions, parallelResult);

    return {
      results: enhancedResults,
      errors: parallelResult.errors,
      stats,
      collectedAt,
    };
  }

  /**
   * Collect partial results (only successful agents)
   *
   * @param parallelResult - Result from parallel delegation
   * @param executions - Agent execution records
   * @param agents - Agent metadata (optional)
   * @returns Promise<ResultCollection> with only successful results
   */
  async collectSuccessful(
    parallelResult: ParallelResult,
    executions: AgentExecution[],
    agents?: Map<string, Agent>
  ): Promise<ResultCollection> {
    const collectedAt = Date.now();

    // Filter only successful results
    const successfulResults = new Map<string, DelegationResult>();
    for (const [agentName, result] of parallelResult.results) {
      if (result.success) {
        successfulResults.set(agentName, result);
      }
    }

    // Enhance results with metadata
    const enhancedResults = new Map<string, EnhancedDelegationResult>();

    for (const [agentName, result] of successfulResults) {
      const agent = agents?.get(agentName);
      const metadata: ResultMetadata = {
        agent: agentName,
        category: agent?.category,
        capabilities: agent?.capabilities.map(c => c.name),
        collectedAt,
        metadata: {
          successRate: agent?.successRate,
          lastUsed: agent?.lastUsed,
        },
      };

      if (result.result) {
        metadata.size = this.calculateSize(result.result);
      }

      enhancedResults.set(agentName, {
        ...result,
        metadata,
      });
    }

    // Calculate statistics for successful results only
    const successfulExecutions = executions.filter(e =>
      Array.from(successfulResults.keys()).includes(e.agent)
    );
    const stats = this.calculateStats(successfulExecutions, {
      ...parallelResult,
      results: successfulResults,
    });

    return {
      results: enhancedResults,
      errors: new Map(), // No errors in successful-only collection
      stats,
      collectedAt,
    };
  }

  /**
   * Wait for all agents to complete with timeout
   *
   * @param executions - Agent execution records
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise that resolves when all agents complete or timeout expires
   */
  async waitForCompletion(
    executions: AgentExecution[],
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const allCompleted = executions.every(
          e =>
            e.status === 'completed' ||
            e.status === 'failed' ||
            e.status === 'timeout'
        );

        if (allCompleted) {
          clearInterval(interval);
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          clearInterval(interval);
          reject(
            new Error(
              `Timeout waiting for completion after ${timeout}ms. ` +
                `Pending: ${executions.filter(e => e.status === 'pending').length}, ` +
                `Working: ${executions.filter(e => e.status === 'working').length}`
            )
          );
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * Calculate statistics from execution results
   *
   * @param executions - Agent execution records
   * @param parallelResult - Parallel delegation result
   * @returns Collection statistics
   */
  private calculateStats(
    executions: AgentExecution[],
    parallelResult: ParallelResult
  ): CollectionStats {
    const totalAgents = executions.length;
    const successCount = parallelResult.results.size;
    const failureCount = parallelResult.errors.size;

    const durations = executions
      .filter(e => e.endedAt && e.startedAt)
      .map(e => e.endedAt! - e.startedAt);

    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

    const totalDuration = executions.length > 0
      ? Math.max(...executions.map(e => e.endedAt || 0)) -
        Math.min(...executions.map(e => e.startedAt))
      : 0;

    const fastestCompletion =
      durations.length > 0 ? Math.min(...durations) : undefined;

    const slowestCompletion =
      durations.length > 0 ? Math.max(...durations) : undefined;

    return {
      totalAgents,
      successCount,
      failureCount,
      successRate: totalAgents > 0 ? successCount / totalAgents : 1.0,
      averageDuration,
      totalDuration,
      fastestCompletion,
      slowestCompletion,
    };
  }

  /**
   * Calculate size of a result object
   *
   * @param result - Result object
   * @returns Size in bytes (approximate)
   */
  private calculateSize(result: any): number {
    try {
      return JSON.stringify(result).length * 2; // UTF-16 uses 2 bytes per char
    } catch {
      return 0;
    }
  }

  /**
   * Generate summary report for a collection
   *
   * @param collection - Result collection
   * @returns Human-readable summary report
   */
  generateSummary(collection: ResultCollection): string {
    const lines: string[] = [];

    lines.push('=== Result Collection Summary ===\n');

    // Statistics
    lines.push('Statistics:');
    lines.push(`  Total agents: ${collection.stats.totalAgents}`);
    lines.push(`  Successful: ${collection.stats.successCount}`);
    lines.push(`  Failed: ${collection.stats.failureCount}`);
    lines.push(`  Success rate: ${(collection.stats.successRate * 100).toFixed(1)}%`);
    lines.push(`  Average duration: ${collection.stats.averageDuration.toFixed(0)}ms`);
    lines.push(`  Total duration: ${collection.stats.totalDuration.toFixed(0)}ms`);

    if (collection.stats.fastestCompletion) {
      lines.push(`  Fastest completion: ${collection.stats.fastestCompletion.toFixed(0)}ms`);
    }

    if (collection.stats.slowestCompletion) {
      lines.push(`  Slowest completion: ${collection.stats.slowestCompletion.toFixed(0)}ms`);
    }

    lines.push('');

    // Successful results
    lines.push('Successful Results:');
    for (const [agentName, result] of collection.results) {
      lines.push(`  ✓ ${agentName} (${result.metadata.category || 'unknown'})`);
      lines.push(`    Duration: ${result.duration}ms`);
      if (result.metadata.size) {
        lines.push(`    Size: ${result.metadata.size} bytes`);
      }
      if (result.metadata.capabilities) {
        lines.push(`    Capabilities: ${result.metadata.capabilities.join(', ')}`);
      }
    }

    lines.push('');

    // Failed results
    if (collection.errors.size > 0) {
      lines.push('Failed Results:');
      for (const [agentName, error] of collection.errors) {
        lines.push(`  ✗ ${agentName}`);
        lines.push(`    Error: ${error.message}`);
      }
      lines.push('');
    }

    lines.push(`Collected at: ${new Date(collection.collectedAt).toISOString()}`);
    lines.push('='.repeat(50));

    return lines.join('\n');
  }

  /**
   * Export collection to JSON for persistence
   *
   * @param collection - Result collection
   * @returns JSON string
   */
  exportToJSON(collection: ResultCollection): string {
    const exportData = {
      results: Array.from(collection.results.entries()),
      errors: Array.from(collection.errors.entries()).map(([agent, error]) => [
        agent,
        {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      ]),
      stats: collection.stats,
      collectedAt: collection.collectedAt,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import collection from JSON
   *
   * @param json - JSON string
   * @returns Result collection
   */
  importFromJSON(json: string): ResultCollection {
    const data = JSON.parse(json);

    const results = new Map<string, EnhancedDelegationResult>(
      data.results as [string, EnhancedDelegationResult][]
    );

    const errors = new Map<string, Error>(
      data.errors.map(([agent, err]: [string, any]) => [
        agent,
        Object.assign(new Error(err.message), err),
      ])
    );

    return {
      results,
      errors,
      stats: data.stats,
      collectedAt: data.collectedAt,
    };
  }
}
