/**
 * wshobson Parallel Delegation Engine
 *
 * Enables concurrent execution of multiple agents with proper error handling,
 * cancellation support, and status tracking. This is critical for wshobson's
 * parallel agent orchestration pattern.
 *
 * Key features:
 * - Concurrent execution using Promise.all/Settled
 * - Individual agent status tracking (pending, running, completed, failed)
 * - Partial failure handling (successful results preserved even if some fail)
 * - Per-agent timeout handling
 * - Granular cancellation (cancel all or individual agents)
 * - Progress callbacks for real-time monitoring
 * - Comprehensive error collection and reporting
 *
 * @example
 * ```typescript
 * const parallelDelegator = new ParallelDelegator(repository);
 *
 * const requests: ParallelDelegationRequest[] = [
 *   { agentName: 'business-analyst', task: 'Analyze requirements' },
 *   { agentName: 'data-analyst', task: 'Process dataset' },
 *   { agentName: 'ux-designer', task: 'Create mockups' }
 * ];
 *
 * const summary = await parallelDelegator.delegateParallel(requests, {
 *   timeout: 30000,
 *   onProgress: (update) => console.log(`Progress: ${update.percentComplete}%`)
 * });
 *
 * console.log(`Completed: ${summary.successful}/${summary.totalAgents}`);
 * summary.results.forEach(result => {
 *   if (result.success) {
 *     console.log(`${result.agentName}: ${result.output}`);
 *   }
 * });
 * ```
 */

import type {
  IAgentRepository,
  Agent,
} from './types.js';
import type {
  DelegationContext,
  DelegationOptions,
  DelegationResult,
  DelegationError,
} from './delegator.js';
import { WshobsonDelegator } from './delegator.js';

/**
 * Parallel delegation request
 *
 * Defines a single agent delegation within a parallel execution batch.
 */
export interface ParallelDelegationRequest {
  /**
   * Name of the agent to delegate to
   */
  agentName: string;

  /**
   * Task description or prompt for the agent
   */
  task: string;

  /**
   * Optional delegation context
   */
  context?: DelegationContext;

  /**
   * Optional delegation options
   */
  options?: DelegationOptions;
}

/**
 * Parallel delegation result
 *
 * Represents the result of a single agent delegation within a parallel batch.
 */
export interface ParallelDelegationResult {
  /**
   * Name of the agent that was delegated to
   */
  agentName: string;

  /**
   * Whether the delegation succeeded
   */
  success: boolean;

  /**
   * Agent output (if successful)
   */
  output?: string;

  /**
   * Error details (if failed)
   */
  error?: DelegationError;

  /**
   * Execution duration in milliseconds
   */
  duration: number;

  /**
   * Trace ID for this specific delegation
   */
  traceId: string;

  /**
   * Agent's confidence level for this task (0-1)
   */
  confidence?: number;

  /**
   * Additional result metadata
   */
  metadata?: DelegationResult['metadata'];

  /**
   * Current status of this delegation
   */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Parallel execution summary
 *
 * Aggregated results from a parallel delegation batch.
 */
export interface ParallelExecutionSummary {
  /**
   * Total number of agents in the batch
   */
  totalAgents: number;

  /**
   * Number of successful delegations
   */
  successful: number;

  /**
   * Number of failed delegations
   */
  failed: number;

  /**
   * Total duration for the entire batch in milliseconds
   */
  duration: number;

  /**
   * Individual agent results
   */
  results: ParallelDelegationResult[];

  /**
   * Overall trace ID for the batch
   */
  batchTraceId: string;

  /**
   * Timestamp when the batch started
   */
  startedAt: number;

  /**
   * Timestamp when the batch completed
   */
  completedAt: number;

  /**
   * Whether the batch was cancelled
   */
  cancelled: boolean;

  /**
   * Any errors that occurred during batch execution
   */
  batchErrors?: Error[];
}

/**
 * Progress update for parallel execution
 */
export interface ParallelProgressUpdate {
  /**
   * Batch trace ID
   */
  batchTraceId: string;

  /**
   * Total number of agents
   */
  totalAgents: number;

  /**
   * Number of completed agents
   */
  completedAgents: number;

  /**
   * Number of failed agents
   */
  failedAgents: number;

  /**
   * Percentage complete (0-100)
   */
  percentComplete: number;

  /**
   * Current status summary
   */
  status: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };

  /**
   * Timestamp of this update
   */
  timestamp: number;

  /**
   * Latest result (if any)
   */
  latestResult?: ParallelDelegationResult;
}

/**
 * Parallel delegation options
 */
export interface ParallelDelegationOptions {
  /**
   * Global timeout for the entire batch in milliseconds
   * If not provided, uses individual agent timeouts
   */
  batchTimeout?: number;

  /**
   * Whether to continue execution if some agents fail
   * Default: true (collect partial results)
   */
  continueOnFailure?: boolean;

  /**
   * Maximum number of concurrent agents
   * Default: Infinity (all agents run concurrently)
   */
  maxConcurrency?: number;

  /**
   * Callback for progress updates
   */
  onProgress?: (update: ParallelProgressUpdate) => void;

  /**
   * Progress update interval in milliseconds
   * Default: 500 (update every 500ms)
   */
  progressInterval?: number;

  /**
   * Whether to update agent statistics after completion
   * Default: true
   */
  updateAgentStats?: boolean;

  /**
   * Default delegation context for all agents
   * Individual agent contexts override this
   */
  defaultContext?: DelegationContext;

  /**
   * Default delegation options for all agents
   * Individual agent options override this
   */
  defaultOptions?: DelegationOptions;
}

/**
 * Agent execution state
 */
interface AgentExecutionState {
  request: ParallelDelegationRequest;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: ParallelDelegationResult;
  startTime?: number;
  endTime?: number;
  abortController?: AbortController;
}

/**
 * Internal type for merged parallel options with defaults applied
 * Allows undefined for truly optional fields while providing defaults where needed
 */
interface MergedParallelOptions {
  batchTimeout: number | undefined;
  continueOnFailure: boolean;
  maxConcurrency: number;
  onProgress: ((update: ParallelProgressUpdate) => void) | undefined;
  progressInterval: number;
  updateAgentStats: boolean;
  defaultContext: DelegationContext | undefined;
  defaultOptions: DelegationOptions | undefined;
}

/**
 * Parallel Delegator
 *
 * Extends WshobsonDelegator to support parallel agent execution.
 * Manages concurrent delegations with proper error handling and cancellation.
 */
export class ParallelDelegator extends WshobsonDelegator {
  private activeBatches: Map<string, AbortController>;
  private batchStates: Map<string, Map<string, AgentExecutionState>>;

  /**
   * Create a new parallel delegator
   *
   * @param repository - Agent repository for discovering agents
   * @param defaultTimeout - Default timeout in milliseconds (default: 60000)
   */
  constructor(repository: IAgentRepository, defaultTimeout: number = 60000) {
    super(repository, defaultTimeout);
    this.activeBatches = new Map();
    this.batchStates = new Map();
  }

  /**
   * Delegate tasks to multiple agents in parallel
   *
   * This is the main entry point for parallel agent delegation. It:
   * 1. Validates all requests
   * 2. Creates abort controllers for cancellation
   * 3. Executes all delegations concurrently
   * 4. Tracks individual agent status
   * 5. Handles partial failures
   * 6. Returns aggregated summary
   *
   * @param requests - Array of delegation requests
   * @param options - Parallel delegation options
   * @returns Promise resolving to execution summary
   *
   * @example
   * ```typescript
   * const summary = await parallelDelegator.delegateParallel(
   *   [
   *     { agentName: 'business-analyst', task: 'Analyze market trends' },
   *     { agentName: 'data-analyst', task: 'Process sales data' },
   *     { agentName: 'ux-designer', task: 'Create wireframes' }
   *   ],
   *   {
   *     timeout: 30000,
   *     continueOnFailure: true,
   *     onProgress: (update) => console.log(`Progress: ${update.percentComplete}%`)
   *   }
   * );
   *
   * console.log(`Completed: ${summary.successful}/${summary.totalAgents}`);
   * ```
   */
  async delegateParallel(
    requests: ParallelDelegationRequest[],
    options?: ParallelDelegationOptions
  ): Promise<ParallelExecutionSummary> {
    const startTime = Date.now();
    const batchTraceId = this.generateBatchTraceId();
    const mergedOptions = this.mergeParallelOptions(options);

    // Validate requests
    const validation = this.validateParallelRequests(requests);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Create abort controller for batch cancellation
    const batchAbortController = new AbortController();
    this.activeBatches.set(batchTraceId, batchAbortController);

    // Initialize execution state
    const executionState = this.initializeExecutionState(requests);
    this.batchStates.set(batchTraceId, executionState);

    // Start progress updates if callback provided
    const progressTimer = mergedOptions.onProgress
      ? this.startProgressUpdates(batchTraceId, executionState, mergedOptions)
      : undefined;

    try {
      // Execute with batch timeout if provided
      const executionPromise = this.executeParallelDelegations(
        batchTraceId,
        executionState,
        mergedOptions,
        batchAbortController.signal
      );

      const timeoutPromise = mergedOptions.batchTimeout
        ? this.createTimeoutPromise(mergedOptions.batchTimeout)
        : Promise.race([executionPromise]);

      // Wait for execution or timeout
      await Promise.race([executionPromise, timeoutPromise]);

    } catch (error) {
      // Handle batch-level errors
      console.error(`Batch ${batchTraceId} error:`, error);

    } finally {
      // Stop progress updates
      if (progressTimer) {
        clearInterval(progressTimer);
      }

      // Cleanup
      this.activeBatches.delete(batchTraceId);
      this.batchStates.delete(batchTraceId);
    }

    // Build summary
    return this.buildSummary(batchTraceId, executionState, startTime);
  }

  /**
   * Cancel an active parallel batch
   *
   * @param batchTraceId - Batch trace ID to cancel
   * @returns true if cancelled, false if not found
   *
   * @example
   * ```typescript
   * const cancelled = parallelDelegator.cancelBatch('batch-123');
   * if (cancelled) {
   *   console.log('Batch cancelled successfully');
   * }
   * ```
   */
  cancelBatch(batchTraceId: string): boolean {
    const controller = this.activeBatches.get(batchTraceId);
    if (controller) {
      controller.abort();

      // Mark all running/pending agents as cancelled
      const state = this.batchStates.get(batchTraceId);
      if (state) {
        for (const [agentName, execState] of Array.from(state.entries())) {
          if (execState.status === 'running' || execState.status === 'pending') {
            execState.status = 'cancelled';
            if (execState.abortController) {
              execState.abortController.abort();
            }
          }
        }
      }

      this.activeBatches.delete(batchTraceId);
      return true;
    }
    return false;
  }

  /**
   * Cancel a specific agent within a batch
   *
   * @param batchTraceId - Batch trace ID
   * @param agentName - Agent name to cancel
   * @returns true if cancelled, false if not found
   *
   * @example
   * ```typescript
   * const cancelled = parallelDelegator.cancelAgentInBatch('batch-123', 'data-analyst');
   * if (cancelled) {
   *   console.log('Agent cancelled successfully');
   * }
   * ```
   */
  cancelAgentInBatch(batchTraceId: string, agentName: string): boolean {
    const state = this.batchStates.get(batchTraceId);
    if (!state) {
      return false;
    }

    const execState = state.get(agentName);
    if (!execState) {
      return false;
    }

    if (execState.status === 'running' || execState.status === 'pending') {
      execState.status = 'cancelled';
      if (execState.abortController) {
        execState.abortController.abort();
      }
      return true;
    }

    return false;
  }

  /**
   * Cancel all active batches
   *
   * @example
   * ```typescript
   * parallelDelegator.cancelAllBatches();
   * console.log('All batches cancelled');
   * ```
   */
  cancelAllBatches(): void {
    Array.from(this.activeBatches.keys()).forEach(batchTraceId => {
      this.cancelBatch(batchTraceId);
    });
  }

  /**
   * Get status of an active batch
   *
   * @param batchTraceId - Batch trace ID
   * @returns Current status summary or undefined if not found
   *
   * @example
   * ```typescript
   * const status = parallelDelegator.getBatchStatus('batch-123');
   * if (status) {
   *   console.log(`Pending: ${status.pending}`);
   *   console.log(`Running: ${status.running}`);
   *   console.log(`Completed: ${status.completed}`);
   * }
   * ```
   */
  getBatchStatus(batchTraceId: string): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } | undefined {
    const state = this.batchStates.get(batchTraceId);
    if (!state) {
      return undefined;
    }

    const status = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const execState of Array.from(state.values())) {
      status[execState.status]++;
    }

    return status;
  }

  /**
   * Get active batch count
   */
  getActiveBatchCount(): number {
    return this.activeBatches.size;
  }

  /**
   * Execute parallel delegations with concurrency control
   */
  private async executeParallelDelegations(
    batchTraceId: string,
    executionState: Map<string, AgentExecutionState>,
    options: ParallelDelegationOptions,
    signal: AbortSignal
  ): Promise<void> {
    const agents = Array.from(executionState.entries());

    if (options.maxConcurrency && options.maxConcurrency < agents.length) {
      // Execute with concurrency limit
      await this.executeWithConcurrencyLimit(
        batchTraceId,
        agents,
        options,
        signal
      );
    } else {
      // Execute all concurrently
      await this.executeAllConcurrently(
        batchTraceId,
        agents,
        options,
        signal
      );
    }
  }

  /**
   * Execute all agents concurrently
   */
  private async executeAllConcurrently(
    batchTraceId: string,
    agents: Array<[string, AgentExecutionState]>,
    options: ParallelDelegationOptions,
    signal: AbortSignal
  ): Promise<void> {
    // Use Promise.allSettled to handle partial failures
    const promises = Array.from(agents).map(([agentName, execState]) =>
      this.executeSingleAgent(
        batchTraceId,
        agentName,
        execState,
        options,
        signal
      )
    );

    await Promise.allSettled(promises);
  }

  /**
   * Execute with concurrency limit
   */
  private async executeWithConcurrencyLimit(
    batchTraceId: string,
    agents: Array<[string, AgentExecutionState]>,
    options: ParallelDelegationOptions,
    signal: AbortSignal,
    maxConcurrency: number = options.maxConcurrency!
  ): Promise<void> {
    // Execute in batches
    const agentsArray = Array.from(agents);
    for (let i = 0; i < agentsArray.length; i += maxConcurrency) {
      // Check for cancellation
      if (signal.aborted) {
        break;
      }

      const batch = agentsArray.slice(i, i + maxConcurrency);
      const promises = batch.map(([agentName, execState]) =>
        this.executeSingleAgent(
          batchTraceId,
          agentName,
          execState,
          options,
          signal
        )
      );

      await Promise.allSettled(promises);
    }
  }

  /**
   * Execute a single agent delegation
   */
  private async executeSingleAgent(
    batchTraceId: string,
    agentName: string,
    execState: AgentExecutionState,
    options: ParallelDelegationOptions,
    batchSignal: AbortSignal
  ): Promise<void> {
    // Check if already cancelled
    if (batchSignal.aborted) {
      execState.status = 'cancelled';
      return;
    }

    // Create abort controller for this agent
    const agentAbortController = new AbortController();
    execState.abortController = agentAbortController;

    // Update status to running
    execState.status = 'running';
    execState.startTime = Date.now();

    try {
      // Merge options with defaults
      const mergedContext = {
        ...options.defaultContext,
        ...execState.request.context,
      };

      const mergedOptions = {
        ...options.defaultOptions,
        ...execState.request.options,
      };

      // Create combined signal (batch OR agent)
      const combinedSignal = this.createCombinedSignal(
        batchSignal,
        agentAbortController.signal
      );

      // Delegate to agent (using parent class method)
      const result = await this.delegateToAgent(
        execState.request.agentName,
        execState.request.task,
        mergedContext,
        {
          ...mergedOptions,
          // Override timeout to use combined signal
        }
      );

      // Check for cancellation
      if (combinedSignal.aborted) {
        execState.status = 'cancelled';
        execState.result = {
          agentName,
          success: false,
          error: {
            code: 'CANCELLED',
            message: 'Delegation was cancelled',
            retryable: false,
          },
          duration: Date.now() - (execState.startTime || Date.now()),
          traceId: result.traceId || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: 'cancelled',
        };
        return;
      }

      // Store result
      execState.endTime = Date.now();
      execState.status = result.success ? 'completed' : 'failed';
      execState.result = {
        agentName,
        success: result.success,
        output: result.output,
        error: result.error,
        duration: result.duration,
        traceId: result.traceId || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        confidence: result.confidence,
        metadata: result.metadata,
        status: result.success ? 'completed' : 'failed',
      };

    } catch (error) {
      // Handle unexpected errors
      execState.endTime = Date.now();
      execState.status = 'failed';
      const duration = execState.endTime - (execState.startTime || execState.endTime);

      execState.result = {
        agentName,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          retryable: true,
          retryDelay: 2000,
        },
        duration,
        traceId: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'failed',
      };

      // If continueOnFailure is false, we should propagate
      if (!options.continueOnFailure) {
        throw error;
      }

    } finally {
      // Cleanup abort controller
      execState.abortController = undefined;
    }
  }

  /**
   * Initialize execution state for requests
   */
  private initializeExecutionState(
    requests: ParallelDelegationRequest[]
  ): Map<string, AgentExecutionState> {
    const state = new Map<string, AgentExecutionState>();

    for (const request of requests) {
      state.set(request.agentName, {
        request,
        status: 'pending',
      });
    }

    return state;
  }

  /**
   * Start progress updates
   */
  private startProgressUpdates(
    batchTraceId: string,
    executionState: Map<string, AgentExecutionState>,
    options: ParallelDelegationOptions
  ): NodeJS.Timeout {
    const interval = options.progressInterval || 500;

    return setInterval(() => {
      const update = this.createProgressUpdate(
        batchTraceId,
        executionState
      );
      options.onProgress?.(update);
    }, interval);
  }

  /**
   * Create progress update
   */
  private createProgressUpdate(
    batchTraceId: string,
    executionState: Map<string, AgentExecutionState>
  ): ParallelProgressUpdate {
    const totalAgents = executionState.size;
    const status = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    let latestResult: ParallelDelegationResult | undefined;

    for (const execState of Array.from(executionState.values())) {
      status[execState.status]++;
      if (execState.result && (!latestResult || execState.endTime! > latestResult.duration)) {
        latestResult = execState.result;
      }
    }

    const completedAgents = status.completed + status.failed + status.cancelled;
    const percentComplete = totalAgents > 0
      ? Math.round((completedAgents / totalAgents) * 100)
      : 0;

    return {
      batchTraceId,
      totalAgents,
      completedAgents,
      failedAgents: status.failed,
      percentComplete,
      status,
      timestamp: Date.now(),
      latestResult,
    };
  }

  /**
   * Build execution summary
   */
  private buildSummary(
    batchTraceId: string,
    executionState: Map<string, AgentExecutionState>,
    startTime: number
  ): ParallelExecutionSummary {
    const results: ParallelDelegationResult[] = [];
    let successful = 0;
    let failed = 0;
    let cancelled = false;

    for (const [agentName, execState] of Array.from(executionState.entries())) {
      if (execState.result) {
        results.push(execState.result);
        if (execState.result.success) {
          successful++;
        } else if (execState.result.status === 'cancelled') {
          cancelled = true;
        } else {
          failed++;
        }
      } else {
        // Agent didn't complete (e.g., was cancelled before starting)
        results.push({
          agentName,
          success: false,
          error: {
            code: 'CANCELLED',
            message: 'Agent execution was cancelled',
            retryable: false,
          },
          duration: 0,
          traceId: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: execState.status,
        });
        if (execState.status === 'cancelled') {
          cancelled = true;
        }
      }
    }

    const endTime = Date.now();

    return {
      totalAgents: executionState.size,
      successful,
      failed,
      duration: endTime - startTime,
      results,
      batchTraceId,
      startedAt: startTime,
      completedAt: endTime,
      cancelled,
    };
  }

  /**
   * Validate parallel delegation requests
   */
  private validateParallelRequests(
    requests: ParallelDelegationRequest[]
  ): { valid: boolean; error?: string } {
    if (!requests || requests.length === 0) {
      return { valid: false, error: 'Requests array cannot be empty' };
    }

    if (requests.length > 100) {
      return { valid: false, error: 'Cannot execute more than 100 agents in parallel' };
    }

    // Check for duplicate agent names
    const agentNames = new Set<string>();
    for (const request of requests) {
      if (agentNames.has(request.agentName)) {
        return {
          valid: false,
          error: `Duplicate agent name: ${request.agentName}`,
        };
      }
      agentNames.add(request.agentName);
    }

    return { valid: true };
  }

  /**
   * Merge parallel options with defaults
   *
   * @param options - Optional user-provided options
   * @returns Options with all required fields filled with defaults
   *
   * @example
   * ```typescript
   * const merged = this.mergeParallelOptions({ timeout: 5000 });
   * // All fields have values, undefined fields get defaults
   * ```
   */
  private mergeParallelOptions(
    options?: ParallelDelegationOptions
  ): MergedParallelOptions {
    return {
      batchTimeout: options?.batchTimeout,
      continueOnFailure: options?.continueOnFailure ?? true,
      maxConcurrency: options?.maxConcurrency ?? Infinity,
      onProgress: options?.onProgress,
      progressInterval: options?.progressInterval ?? 500,
      updateAgentStats: options?.updateAgentStats ?? true,
      defaultContext: options?.defaultContext,
      defaultOptions: options?.defaultOptions,
    };
  }

  /**
   * Create combined abort signal
   */
  private createCombinedSignal(
    signal1: AbortSignal,
    signal2: AbortSignal
  ): AbortSignal {
    // Create a new abort controller that aborts when either signal aborts
    const combinedController = new AbortController();

    const abortHandler = () => {
      combinedController.abort();
    };

    signal1.addEventListener('abort', abortHandler, { once: true });
    signal2.addEventListener('abort', abortHandler, { once: true });

    // Return the combined signal
    return combinedController.signal;
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Batch timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Generate a batch trace ID
   */
  private generateBatchTraceId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a parallel delegator instance
 *
 * Factory function for creating a parallel delegator with a repository.
 *
 * @param repository - Agent repository
 * @param defaultTimeout - Default timeout in milliseconds
 * @returns Configured parallel delegator instance
 *
 * @example
 * ```typescript
 * const parallelDelegator = createParallelDelegator(repository, 30000);
 * ```
 */
export function createParallelDelegator(
  repository: IAgentRepository,
  defaultTimeout?: number
): ParallelDelegator {
  return new ParallelDelegator(repository, defaultTimeout);
}
