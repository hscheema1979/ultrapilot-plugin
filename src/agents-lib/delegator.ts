/**
 * wshobson Agent Delegator
 *
 * Provides a high-level interface for delegating tasks to wshobson agents.
 * Handles agent lookup, task execution, timeout management, and result tracking.
 *
 * This is a foundational component that:
 * - Uses IAgentRepository for agent discovery
 * - Manages delegation lifecycle (request → execution → result)
 * - Provides hooks for Claude Code skill system integration
 * - Handles timeout and cancellation
 * - Tracks delegation metrics (duration, success rate)
 */

import type { IAgentRepository, Agent } from './types.js';
import { CircuitBreaker, type CircuitBreakerConfig } from './circuit-breaker.js';

/**
 * Delegation context provides metadata and execution controls
 *
 * @example
 * ```typescript
 * const context: DelegationContext = {
 *   workspacePath: '/home/user/project',
 *   traceId: 'abc-123',
 *   timeout: 30000,
 *   metadata: { priority: 'high', owner: 'orchestrator' }
 * };
 * ```
 */
export interface DelegationContext {
  /**
   * Workspace path for file operations
   * Used for file ownership enforcement and workspace isolation
   */
  workspacePath?: string;

  /**
   * Distributed tracing ID
   * Used for correlating delegation requests across multiple agents
   */
  traceId?: string;

  /**
   * Execution timeout in milliseconds
   * Default: 60000 (1 minute)
   */
  timeout?: number;

  /**
   * Additional metadata for tracking and debugging
   * Can include priority, tags, owner info, etc.
   */
  metadata?: Record<string, any>;

  /**
   * File ownership contract
   * Defines what files the agent can read/write
   */
  fileOwnership?: {
    /**
     * Paths the agent owns exclusively (can write)
     */
    ownedPaths: string[];

    /**
     * Paths the agent can only read
     */
    readOnlyPaths: string[];

    /**
     * Whether to transfer ownership back to orchestrator on completion
     */
    transferOnCompletion: boolean;
  };

  /**
   * Parent span ID for distributed tracing
   */
  parentSpanId?: string;

  /**
   * Callback for progress updates
   * Called periodically during long-running tasks
   */
  onProgress?: (update: ProgressUpdate) => void;
}

/**
 * Progress update during delegation
 */
export interface ProgressUpdate {
  traceId: string;
  agentName: string;
  message: string;
  percentComplete?: number;
  timestamp: number;
}

/**
 * Delegation error details
 */
export interface DelegationError {
  /**
   * Error code for categorization
   */
  code: 'AGENT_NOT_FOUND' | 'TIMEOUT' | 'EXECUTION_ERROR' | 'CANCELLED' | 'VALIDATION_ERROR';

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Stack trace if available
   */
  stack?: string;

  /**
   * Additional error context
   */
  details?: Record<string, any>;

  /**
   * Whether the error is retryable
   */
  retryable: boolean;

  /**
   * Suggested retry delay in milliseconds
   */
  retryDelay?: number;
}

/**
 * Delegation result
 *
 * @example
 * ```typescript
 * // Successful delegation
 * const result: DelegationResult = {
 *   success: true,
 *   output: 'Task completed successfully',
 *   duration: 1234,
 *   agentName: 'business-analyst'
 * };
 *
 * // Failed delegation
 * const failure: DelegationResult = {
 *   success: false,
 *   error: {
 *     code: 'TIMEOUT',
 *     message: 'Agent did not respond within 30s',
 *     retryable: true,
 *     retryDelay: 5000
 *   },
 *   duration: 30000,
 *   agentName: 'data-analyst'
 * };
 * ```
 */
export interface DelegationResult {
  /**
   * Whether delegation succeeded
   */
  success: boolean;

  /**
   * Agent output (if successful)
   * Contains the result of the agent's work
   */
  output?: string;

  /**
   * Error details (if failed)
   */
  error?: DelegationError;

  /**
   * Execution duration in milliseconds
   * Measured from request to response
   */
  duration: number;

  /**
   * Name of the agent that was delegated to
   */
  agentName: string;

  /**
   * Agent's confidence level for this task (0-1)
   * Derived from agent's capability match
   */
  confidence?: number;

  /**
   * Trace ID for distributed tracing
   */
  traceId?: string;

  /**
   * Additional result metadata
   */
  metadata?: {
    /**
     * Files modified by the agent
     */
    modifiedFiles?: string[];

    /**
     * Files read by the agent
     */
    readFiles?: string[];

    /**
     * Capabilities used
     */
    capabilitiesUsed?: string[];

    /**
     * Custom metrics
     */
    [key: string]: any;
  };
}

/**
 * Delegation options
 */
export interface DelegationOptions {
  /**
   * Maximum execution time in milliseconds
   * Overrides context.timeout if provided
   */
  timeout?: number;

  /**
   * Whether to wait for completion or return immediately
   * If false, returns a promise that resolves when the task completes
   */
  waitForCompletion?: boolean;

  /**
   * Retry configuration
   */
  retry?: {
    /**
     * Maximum number of retry attempts
     */
    maxAttempts: number;

    /**
     * Base delay between retries in milliseconds
     */
    baseDelay: number;

    /**
     * Whether to use exponential backoff
     */
    exponentialBackoff: boolean;
  };

  /**
   * Whether to update agent's success rate based on result
   */
  updateAgentStats?: boolean;
}

/**
 * Default delegation options
 */
const DEFAULT_OPTIONS: DelegationOptions = {
  timeout: 60000,  // 1 minute
  waitForCompletion: true,
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    exponentialBackoff: true,
  },
  updateAgentStats: true,
};

/**
 * Wshobson Agent Delegator
 *
 * Core responsibilities:
 * 1. Agent discovery via IAgentRepository
 * 2. Task validation and preprocessing
 * 3. Agent invocation (via Claude Code skill system)
 * 4. Timeout and cancellation handling
 * 5. Result aggregation and tracking
 *
 * @example
 * ```typescript
 * const delegator = new WshobsonDelegator(repository);
 *
 * const result = await delegator.delegateToAgent(
 *   'business-analyst',
 *   'Analyze the requirements for the new feature',
 *   {
 *     workspacePath: '/home/user/project',
 *     traceId: 'req-analysis-123',
 *     timeout: 30000
 *   }
 * );
 *
 * if (result.success) {
 *   console.log(`Output: ${result.output}`);
 * } else {
 *   console.error(`Error: ${result.error?.message}`);
 * }
 * ```
 */
export class WshobsonDelegator {
  private repository: IAgentRepository;
  private defaultTimeout: number;
  private activeDelegations: Map<string, AbortController>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private circuitBreakerConfig: Partial<CircuitBreakerConfig>;

  /**
   * Create a new delegator
   *
   * @param repository - Agent repository for discovering agents
   * @param defaultTimeout - Default timeout in milliseconds (default: 60000)
   * @param circuitBreakerConfig - Optional circuit breaker configuration
   */
  constructor(
    repository: IAgentRepository,
    defaultTimeout: number = 60000,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.repository = repository;
    this.defaultTimeout = defaultTimeout;
    this.activeDelegations = new Map();
    this.circuitBreakers = new Map();
    this.circuitBreakerConfig = circuitBreakerConfig || {};
  }

  /**
   * Delegate a task to an agent
   *
   * This is the main entry point for agent delegation. It:
   * 1. Looks up the agent by name
   * 2. Validates the request
   * 3. Invokes the agent via the skill system
   * 4. Handles timeout and cancellation
   * 5. Returns the result
   *
   * @param agentName - Name of the agent to delegate to (e.g., 'business-analyst')
   * @param task - Task description or prompt for the agent
   * @param context - Optional delegation context
   * @param options - Optional delegation options
   * @returns Promise resolving to delegation result
   *
   * @example
   * ```typescript
   * const result = await delegator.delegateToAgent(
   *   'data-analyst',
   *   'Analyze the sales data and find trends',
   *   {
   *     workspacePath: '/home/user/analytics',
   *     traceId: 'sales-analysis-001',
   *     timeout: 45000,
   *     metadata: { priority: 'high' }
   *   }
   * );
   * ```
   */
  async delegateToAgent(
    agentName: string,
    task: string,
    context?: DelegationContext,
    options?: DelegationOptions
  ): Promise<DelegationResult> {
    const startTime = Date.now();
    const traceId = context?.traceId || this.generateTraceId();
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const timeout = context?.timeout || mergedOptions.timeout || this.defaultTimeout;

    // Create abort controller for cancellation
    const abortController = new AbortController();
    this.activeDelegations.set(traceId, abortController);

    try {
      // Phase 1: Agent Discovery
      const agent = await this.findAgent(agentName);
      if (!agent) {
        return {
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent '${agentName}' not found in repository`,
            retryable: false,
          },
          duration: Date.now() - startTime,
          agentName,
          traceId,
        };
      }

      // Phase 2: Validation
      const validation = this.validateRequest(task, context);
      if (!validation.valid) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error ?? 'Validation failed',
            retryable: false,
          },
          duration: Date.now() - startTime,
          agentName,
          traceId,
        };
      }

      // Phase 3: Circuit Breaker Check
      const circuitState = await this.checkCircuitBreaker(agentName);
      if (circuitState === 'open') {
        return {
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: `Agent '${agentName}' is in circuit-breaker open state`,
            retryable: true,
            retryDelay: 60000,
          },
          duration: Date.now() - startTime,
          agentName,
          traceId,
        };
      }

      // Phase 4: Execute with Retry
      const result = await this.executeWithRetry(
        agent,
        task,
        context,
        mergedOptions,
        abortController.signal,
        startTime,
        traceId
      );

      // Phase 5: Update Agent Statistics
      if (mergedOptions.updateAgentStats) {
        await this.updateAgentStats(agentName, result.success);
      }

      return result;

    } catch (error) {
      // Handle unexpected errors
      const duration = Date.now() - startTime;
      const delegationError: DelegationError = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        retryable: true,
        retryDelay: 2000,
      };

      return {
        success: false,
        error: delegationError,
        duration,
        agentName,
        traceId,
      };

    } finally {
      // Cleanup
      this.activeDelegations.delete(traceId);
    }
  }

  /**
   * Cancel an active delegation
   *
   * @param traceId - Trace ID of the delegation to cancel
   * @returns true if cancelled, false if not found
   */
  cancelDelegation(traceId: string): boolean {
    const controller = this.activeDelegations.get(traceId);
    if (controller) {
      controller.abort();
      this.activeDelegations.delete(traceId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active delegations
   */
  cancelAllDelegations(): void {
    Array.from(this.activeDelegations.values()).forEach(controller => {
      controller.abort();
    });
    this.activeDelegations.clear();
  }

  /**
   * Get active delegation count
   */
  getActiveDelegationCount(): number {
    return this.activeDelegations.size;
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    agent: Agent,
    task: string,
    context: DelegationContext | undefined,
    options: DelegationOptions,
    signal: AbortSignal,
    startTime: number,
    traceId: string
  ): Promise<DelegationResult> {
    const retry = options.retry!;
    let lastError: DelegationError | undefined;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      // Check for cancellation
      if (signal.aborted) {
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            message: 'Delegation was cancelled',
            retryable: false,
          },
          duration: Date.now() - startTime,
          agentName: agent.name,
          traceId,
        };
      }

      // Execute the delegation
      const result = await this.executeAgent(
        agent,
        task,
        context,
        options.timeout || this.defaultTimeout,
        signal,
        startTime,
        traceId
      );

      // Return immediately on success
      if (result.success) {
        return result;
      }

      // Save error for potential retry
      lastError = result.error;

      // Check if retryable
      if (!lastError?.retryable || attempt === retry.maxAttempts) {
        return result;
      }

      // Wait before retry
      const delay = retry.exponentialBackoff
        ? retry.baseDelay * Math.pow(2, attempt - 1)
        : retry.baseDelay;

      await this.sleep(delay);
    }

    // All retries exhausted
    return {
      success: false,
      error: lastError || {
        code: 'EXECUTION_ERROR',
        message: 'Max retry attempts exhausted',
        retryable: false,
      },
      duration: Date.now() - startTime,
      agentName: agent.name,
      traceId,
    };
  }

  /**
   * Execute agent invocation
   *
   * This is the core integration point with Claude Code's skill system.
   *
   * INTEGRATION NOTES:
   * This method needs to be integrated with Claude Code's skill invocation system.
   * The integration point will:
   * 1. Map agent name to skill name (e.g., 'business-analyst' → 'business-analytics:business-analyst')
   * 2. Invoke the skill via Claude Code's Skill tool
   * 3. Pass the task as the skill argument
   * 4. Handle the skill's response
   *
   * Example skill invocation (when integrated):
   * ```
   * Skill tool call:
   * {
   *   "skill": "business-analytics:business-analyst",
   *   "args": task
   * }
   * ```
   *
   * For now, this is a placeholder that demonstrates the interface.
   * The actual skill invocation will be implemented in the integration layer.
   */
  private async executeAgent(
    agent: Agent,
    task: string,
    context: DelegationContext | undefined,
    timeout: number,
    signal: AbortSignal,
    startTime: number,
    traceId: string
  ): Promise<DelegationResult> {
    try {
      // TODO: Integrate with Claude Code skill system
      //
      // Integration pattern:
      // 1. Build skill name from agent.plugin + agent.name
      // 2. Invoke skill via Claude Code's skill invocation API
      // 3. Pass task, context, and signal to the skill
      // 4. Capture output and metadata
      //
      // Example:
      // const skillName = `${agent.plugin}:${agent.name}`;
      // const skillResult = await invokeSkill(skillName, task, {
      //   workspace: context?.workspacePath,
      //   timeout,
      //   signal,
      //   metadata: context?.metadata
      // });
      //
      // return {
      //   success: true,
      //   output: skillResult.output,
      //   duration: Date.now() - startTime,
      //   agentName: agent.name,
      //   traceId,
      //   confidence: agent.capabilities[0]?.confidence || 0.5,
      //   metadata: {
      //     modifiedFiles: skillResult.filesModified,
      //     readFiles: skillResult.filesRead,
      //     capabilitiesUsed: skillResult.capabilitiesUsed
      //   }
      // };

      // Placeholder: Simulate skill invocation
      const result = await this.simulateSkillInvocation(agent, task, timeout, signal);

      // Record success in circuit breaker
      await this.recordCircuitBreakerSuccess(agent.name);

      return {
        success: true,
        output: result.output,
        duration: Date.now() - startTime,
        agentName: agent.name,
        traceId,
        confidence: result.confidence,
        metadata: result.metadata,
      };

    } catch (error) {
      // Record failure in circuit breaker
      await this.recordCircuitBreakerFailure(agent.name);

      // Handle timeout
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Agent '${agent.name}' timed out after ${timeout}ms`,
            retryable: true,
            retryDelay: 5000,
          },
          duration: Date.now() - startTime,
          agentName: agent.name,
          traceId,
        };
      }

      // Handle cancellation
      if (signal.aborted) {
        return {
          success: false,
          error: {
            code: 'CANCELLED',
            message: 'Agent execution was cancelled',
            retryable: false,
          },
          duration: Date.now() - startTime,
          agentName: agent.name,
          traceId,
        };
      }

      // Handle other errors
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          retryable: true,
          retryDelay: 2000,
        },
        duration: Date.now() - startTime,
        agentName: agent.name,
        traceId,
      };
    }
  }

  /**
   * Placeholder: Simulate skill invocation
   *
   * This is a temporary placeholder that simulates what the actual
   * skill invocation will return. Remove this when integrating with
   * Claude Code's skill system.
   */
  private async simulateSkillInvocation(
    agent: Agent,
    task: string,
    timeout: number,
    signal: AbortSignal
  ): Promise<{
    output: string;
    confidence: number;
    metadata: DelegationResult['metadata'];
  }> {
    // Simulate processing time
    await this.sleep(Math.random() * 1000 + 500);

    // Check for cancellation
    if (signal.aborted) {
      throw new Error('Cancelled');
    }

    // Return simulated result
    return {
      output: `[Simulated] Agent '${agent.name}' processed task: "${task}"`,
      confidence: agent.capabilities[0]?.confidence || 0.8,
      metadata: {
        modifiedFiles: [],
        readFiles: [],
        capabilitiesUsed: agent.capabilities.map(c => c.name),
      },
    };
  }

  /**
   * Find agent by name
   */
  private async findAgent(agentName: string): Promise<Agent | undefined> {
    return await this.repository.getAgent(agentName);
  }

  /**
   * Validate delegation request
   */
  private validateRequest(
    task: string,
    context?: DelegationContext
  ): { valid: boolean; error?: string } {
    // Validate task
    if (!task || task.trim().length === 0) {
      return { valid: false, error: 'Task cannot be empty' };
    }

    if (task.length > 10000) {
      return { valid: false, error: 'Task too long (max 10000 characters)' };
    }

    // Validate file ownership if provided
    if (context?.fileOwnership) {
      const { ownedPaths, readOnlyPaths } = context.fileOwnership;

      // Check for path conflicts
      for (const owned of ownedPaths) {
        for (const readOnly of readOnlyPaths) {
          if (owned.startsWith(readOnly) || readOnly.startsWith(owned)) {
            return {
              valid: false,
              error: `Path conflict: '${owned}' cannot be both owned and read-only`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check circuit breaker state for agent
   *
   * Uses CircuitBreaker instance to check if agent is available.
   * Creates CircuitBreaker on-demand if not exists.
   */
  private async checkCircuitBreaker(agentName: string): Promise<'closed' | 'open' | 'half-open'> {
    // Get or create circuit breaker for this agent
    let breaker = this.circuitBreakers.get(agentName);

    if (!breaker) {
      breaker = new CircuitBreaker(agentName, this.circuitBreakerConfig);
      this.circuitBreakers.set(agentName, breaker);
    }

    return await breaker.getState();
  }

  /**
   * Record successful delegation in circuit breaker
   *
   * @param agentName - Agent name
   */
  private async recordCircuitBreakerSuccess(agentName: string): Promise<void> {
    const breaker = this.circuitBreakers.get(agentName);
    if (breaker) {
      await breaker.recordSuccess();
    }
  }

  /**
   * Record failed delegation in circuit breaker
   *
   * @param agentName - Agent name
   */
  private async recordCircuitBreakerFailure(agentName: string): Promise<void> {
    const breaker = this.circuitBreakers.get(agentName);
    if (breaker) {
      await breaker.recordFailure();
    }
  }

  /**
   * Get circuit breaker for an agent
   *
   * Returns the CircuitBreaker instance for the given agent.
   * Useful for health monitoring integration.
   *
   * @param agentName - Agent name
   * @returns CircuitBreaker instance or undefined
   */
  getCircuitBreaker(agentName: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(agentName);
  }

  /**
   * Get all circuit breakers
   *
   * Returns Map of all circuit breakers managed by this delegator.
   * Useful for health monitoring integration.
   *
   * @returns Map of agent name to CircuitBreaker
   */
  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Update agent statistics after delegation
   */
  private async updateAgentStats(agentName: string, success: boolean): Promise<void> {
    const agent = await this.repository.getAgent(agentName);
    if (!agent) return;

    // Update success rate using exponential moving average
    const alpha = 0.1;  // Smoothing factor
    const newSuccessRate = success
      ? agent.successRate * (1 - alpha) + 1 * alpha
      : agent.successRate * (1 - alpha) + 0 * alpha;

    // Update last used timestamp
    agent.lastUsed = Date.now();
    agent.successRate = newSuccessRate;
    agent.status = success ? 'idle' : 'failed';

    await this.repository.save(agent);
  }

  /**
   * Generate a unique trace ID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a delegator instance
 *
 * Factory function for creating a delegator with a repository
 *
 * @param repository - Agent repository
 * @param defaultTimeout - Default timeout in milliseconds
 * @returns Configured delegator instance
 *
 * @example
 * ```typescript
 * const delegator = createDelegator(repository, 30000);
 * ```
 */
export function createDelegator(
  repository: IAgentRepository,
  defaultTimeout?: number
): WshobsonDelegator {
  return new WshobsonDelegator(repository, defaultTimeout);
}
