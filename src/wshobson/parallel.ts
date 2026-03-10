/**
 * Parallel Delegation Engine
 *
 * Enables UltraPilot to delegate to multiple wshobson agents simultaneously
 * with proper concurrency control, timeout management, and partial failure handling.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { v4 as uuidv4 } from 'uuid';
import { WshobsonDelegator, DelegationParams } from './delegator.js';
import {
  TraceContext,
  FileOwnership,
  DelegationResult,
} from './types.js';
import { DelegationError, ErrorCode } from './errors.js';

/**
 * Agent status during parallel execution
 */
export enum AgentStatus {
  /** Agent is queued but not yet started */
  PENDING = 'pending',
  /** Agent is currently working */
  WORKING = 'working',
  /** Agent completed successfully */
  COMPLETED = 'completed',
  /** Agent failed */
  FAILED = 'failed',
  /** Agent timed out */
  TIMEOUT = 'timeout',
}

/**
 * Parallel execution status for a single agent
 */
export interface AgentExecution {
  /** Agent name */
  agent: string;
  /** Task description */
  task: string;
  /** Current status */
  status: AgentStatus;
  /** Delegation result (available after completion) */
  result?: DelegationResult;
  /** Error if failed */
  error?: Error;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp (if completed) */
  endedAt?: number;
  /** Timeout in milliseconds */
  timeout: number;
}

/**
 * Parallel delegation configuration
 */
export interface ParallelConfig {
  /** Maximum number of concurrent agents (default: 10) */
  maxConcurrency: number;
  /** Default timeout per agent in milliseconds (default: 5 minutes) */
  defaultTimeout: number;
  /** Whether to continue on partial failures (default: true) */
  continueOnFailure: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: ParallelProgress) => void;
}

/**
 * Parallel execution progress
 */
export interface ParallelProgress {
  /** Total number of agents */
  total: number;
  /** Number of completed agents */
  completed: number;
  /** Number of failed agents */
  failed: number;
  /** Number of working agents */
  working: number;
  /** Number of pending agents */
  pending: number;
  /** Overall progress percentage (0-100) */
  progress: number;
}

/**
 * Parallel delegation result
 */
export interface ParallelResult {
  /** Map of agent name to delegation result */
  results: Map<string, DelegationResult>;
  /** Map of agent name to error (for failed agents) */
  errors: Map<string, Error>;
  /** Overall success status */
  success: boolean;
  /** Total execution time in milliseconds */
  duration: number;
  /** Number of successful delegations */
  successCount: number;
  /** Number of failed delegations */
  failureCount: number;
  /** Progress history (if onProgress was provided) */
  progressHistory: ParallelProgress[];
}

/**
 * Parallel Delegation Engine
 *
 * Manages concurrent delegation to multiple agents with:
 * - Concurrency limiting (max parallel agents)
 * - Independent timeouts per agent
 * - Partial failure handling
 * - Real-time progress tracking
 * - Performance monitoring
 */
export class ParallelDelegationEngine {
  private delegator: WshobsonDelegator;
  private config: ParallelConfig;
  private activeExecutions: Map<string, AgentExecution> = new Map();
  private progressHistory: ParallelProgress[] = [];

  constructor(delegator: WshobsonDelegator, config?: Partial<ParallelConfig>) {
    this.delegator = delegator;
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 10,
      defaultTimeout: config?.defaultTimeout ?? 5 * 60 * 1000, // 5 minutes
      continueOnFailure: config?.continueOnFailure ?? true,
      onProgress: config?.onProgress,
    };
  }

  /**
   * Delegate to multiple agents in parallel
   *
   * @param agents - Array of agent names
   * @param tasks - Array of task descriptions (one per agent)
   * @param trace - Distributed tracing context
   * @param ownership - File ownership rules
   * @param timeout - Optional timeout (uses default if not provided)
   * @returns Promise<ParallelResult>
   *
   * @example
   * ```typescript
   * const result = await engine.delegateParallel(
   *   ['business-analyst', 'api-designer', 'security-reviewer'],
   *   [
   *     'Extract requirements for OAuth2 system',
   *     'Design REST API endpoints',
   *     'Review security implications'
   *   ],
   *   trace,
   *   ownership
   * );
   * ```
   */
  async delegateParallel(
    agents: string[],
    tasks: string[],
    trace: TraceContext,
    ownership: FileOwnership,
    timeout?: number
  ): Promise<ParallelResult> {
    const startTime = Date.now();
    const spanId = this.delegator['traceManager'].createSpan(trace, 'delegateParallel');

    // Validate inputs
    if (agents.length !== tasks.length) {
      throw new DelegationError(
        ErrorCode.VALIDATION,
        `Agents array length (${agents.length}) must match tasks array length (${tasks.length})`
      );
    }

    if (agents.length === 0) {
      throw new DelegationError(
        ErrorCode.VALIDATION,
        'At least one agent must be specified'
      );
    }

    // Create execution records for all agents
    const executions: AgentExecution[] = agents.map((agent, index) => ({
      agent,
      task: tasks[index],
      status: AgentStatus.PENDING,
      startedAt: 0,
      timeout: timeout || this.config.defaultTimeout,
    }));

    // Initialize progress tracking
    this.progressHistory = [];
    this.updateProgress(executions);

    // Execute agents with concurrency limit
    const results = await this.executeWithConcurrencyLimit(
      executions,
      trace,
      ownership,
      spanId
    );

    const duration = Date.now() - startTime;
    this.delegator['traceManager'].endSpan(trace, spanId, true);

    return {
      results,
      errors: this.extractErrors(executions),
      success: results.size === agents.length,
      duration,
      successCount: results.size,
      failureCount: agents.length - results.size,
      progressHistory: this.progressHistory,
    };
  }

  /**
   * Execute agents with concurrency limit
   *
   * @param executions - Agent execution records
   * @param trace - Trace context
   * @param ownership - File ownership rules
   * @param parentSpanId - Parent span ID for tracing
   * @returns Promise<Map<string, DelegationResult>>
   */
  private async executeWithConcurrencyLimit(
    executions: AgentExecution[],
    trace: TraceContext,
    ownership: FileOwnership,
    parentSpanId: string
  ): Promise<Map<string, DelegationResult>> {
    const results = new Map<string, DelegationResult>();
    const maxConcurrency = this.config.maxConcurrency;

    // Process executions in batches
    for (let i = 0; i < executions.length; i += maxConcurrency) {
      const batch = executions.slice(i, Math.min(i + maxConcurrency, executions.length));
      const batchPromises = batch.map(execution =>
        this.executeSingleAgent(execution, trace, ownership, parentSpanId)
      );

      // Wait for entire batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Collect results
      for (const { agent, result, error } of batchResults) {
        if (result) {
          results.set(agent, result);
        }

        // Update execution status
        const execution = executions.find(e => e.agent === agent);
        if (execution) {
          execution.endedAt = Date.now();
          if (error) {
            execution.status = error.message.includes('timeout')
              ? AgentStatus.TIMEOUT
              : AgentStatus.FAILED;
            execution.error = error;
          } else {
            execution.status = AgentStatus.COMPLETED;
            execution.result = result;
          }
        }

        // Check if we should continue on failure
        if (error && !this.config.continueOnFailure) {
          throw new DelegationError(
            ErrorCode.FATAL,
            `Agent ${agent} failed and continueOnFailure is false: ${error.message}`
          );
        }
      }

      // Update progress
      this.updateProgress(executions);
    }

    return results;
  }

  /**
   * Execute a single agent with timeout
   *
   * @param execution - Agent execution record
   * @param trace - Trace context
   * @param ownership - File ownership rules
   * @param parentSpanId - Parent span ID for tracing
   * @returns Promise with agent, result, and error
   */
  private async executeSingleAgent(
    execution: AgentExecution,
    trace: TraceContext,
    ownership: FileOwnership,
    parentSpanId: string
  ): Promise<{ agent: string; result?: DelegationResult; error?: Error }> {
    execution.status = AgentStatus.WORKING;
    execution.startedAt = Date.now();

    const agentSpanId = this.delegator['traceManager'].createSpan(
      trace,
      `execute-${execution.agent}`,
      { agent: execution.agent }
    );

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new DelegationError(
            ErrorCode.TIMEOUT,
            `Agent ${execution.agent} timed out after ${execution.timeout}ms`
          ));
        }, execution.timeout);
      });

      // Create delegation promise
      const delegationPromise = this.delegator.delegate({
        agent: execution.agent,
        task: execution.task,
        trace: {
          ...trace,
          spanId: agentSpanId,
          parentSpanId,
        },
        ownership,
        timeout: execution.timeout,
      });

      // Race between delegation and timeout
      const result = await Promise.race([delegationPromise, timeoutPromise]);

      this.delegator['traceManager'].endSpan(trace, agentSpanId, true);

      return { agent: execution.agent, result };
    } catch (error) {
      this.delegator['traceManager'].endSpan(trace, agentSpanId, false);
      return { agent: execution.agent, error: error as Error };
    }
  }

  /**
   * Update progress and trigger callback if configured
   *
   * @param executions - All agent execution records
   */
  private updateProgress(executions: AgentExecution[]): void {
    const total = executions.length;
    const completed = executions.filter(e => e.status === AgentStatus.COMPLETED).length;
    const failed = executions.filter(e =>
      e.status === AgentStatus.FAILED || e.status === AgentStatus.TIMEOUT
    ).length;
    const working = executions.filter(e => e.status === AgentStatus.WORKING).length;
    const pending = executions.filter(e => e.status === AgentStatus.PENDING).length;

    const progress: ParallelProgress = {
      total,
      completed,
      failed,
      working,
      pending,
      progress: Math.round(((completed + failed) / total) * 100),
    };

    this.progressHistory.push(progress);

    if (this.config.onProgress) {
      this.config.onProgress(progress);
    }
  }

  /**
   * Extract errors from executions
   *
   * @param executions - Agent execution records
   * @returns Map of agent name to error
   */
  private extractErrors(executions: AgentExecution[]): Map<string, Error> {
    const errors = new Map<string, Error>();

    for (const execution of executions) {
      if (execution.error) {
        errors.set(execution.agent, execution.error);
      }
    }

    return errors;
  }

  /**
   * Get current active executions
   *
   * @returns Array of active agent executions
   */
  getActiveExecutions(): AgentExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel all active executions
   *
   * Note: This is a best-effort cancellation. Already-started agents
   * may continue running.
   */
  cancelAll(): void {
    for (const execution of this.activeExecutions.values()) {
      if (execution.status === AgentStatus.WORKING) {
        execution.status = AgentStatus.FAILED;
        execution.error = new DelegationError(
          ErrorCode.FATAL,
          `Execution cancelled for agent ${execution.agent}`
        );
        execution.endedAt = Date.now();
      }
    }

    this.activeExecutions.clear();
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<ParallelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): ParallelConfig {
    return { ...this.config };
  }
}
