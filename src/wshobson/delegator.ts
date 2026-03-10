/**
 * wshobson Agent Delegator
 *
 * Implements delegation interface for UltraPilot orchestrators to invoke
 * wshobson specialist agents with proper ownership, tracing, and error handling.
 *
 * Part of Phase 2: Delegation Interface & Ownership Protocol
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IAgentRepository,
  Agent,
  FileOwnership,
  TraceContext,
  DelegationResult,
} from './types.js';
import { FileOwnershipRegistry } from './ownership.js';
import { TraceManager } from './tracing.js';
import {
  DelegationError,
  ErrorCode,
  RetryConfig,
} from './errors.js';
import { WorkspaceContext } from './context.js';

/**
 * Delegation request parameters
 */
export interface DelegationParams {
  /** Agent name to delegate to */
  agent: string;
  /** Task description/prompt for the agent */
  task: string;
  /** Distributed tracing context */
  trace: TraceContext;
  /** File ownership rules */
  ownership: FileOwnership;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
}

/**
 * Parallel delegation request parameters
 */
export interface ParallelDelegationParams {
  /** Array of agent names */
  agents: string[];
  /** Array of task descriptions (one per agent) */
  tasks: string[];
  /** Distributed tracing context */
  trace: TraceContext;
  /** File ownership rules */
  ownership: FileOwnership;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
}

/**
 * Fallback delegation request parameters
 */
export interface FallbackDelegationParams {
  /** Task description */
  task: string;
  /** Required capabilities for the task */
  requiredCapabilities: string[];
  /** Distributed tracing context */
  trace: TraceContext;
  /** File ownership rules */
  ownership: FileOwnership;
  /** Ordered list of agent names to try (optional - auto-select if not provided) */
  fallbackChain?: string[];
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
}

/**
 * WshobsonDelegator - Main delegation interface
 *
 * Enables UltraPilot orchestrators to invoke wshobson specialists with:
 * - Proper file ownership validation and transfer
 * - Distributed tracing for observability
 * - Comprehensive error handling with retries
 * - Timeout enforcement
 */
export class WshobsonDelegator {
  private repository: IAgentRepository;
  private ownershipRegistry: FileOwnershipRegistry;
  private traceManager: TraceManager;
  private retryConfig: RetryConfig;
  private defaultTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(repository: IAgentRepository) {
    this.repository = repository;
    this.ownershipRegistry = new FileOwnershipRegistry();
    this.traceManager = new TraceManager();
    this.retryConfig = {
      maxAttempts: 3,
      initialDelay: 1000, // 1 second
      maxDelay: 4000, // 4 seconds
      backoffMultiplier: 2,
    };
  }

  /**
   * Delegate a task to a single wshobson agent
   *
   * @param params - Delegation parameters
   * @returns Promise<DelegationResult>
   *
   * @example
   * ```typescript
   * const result = await delegator.delegate({
   *   agent: 'business-analyst',
   *   task: 'Extract requirements for OAuth2 authentication system',
   *   trace: { traceId: 'abc-123', spanId: 'span-1', baggage: new Map() },
   *   ownership: { ownedPaths: ['/src'], readOnlyPaths: ['/docs'], transferOnCompletion: true }
   * });
   * ```
   */
  async delegate(params: DelegationParams): Promise<DelegationResult> {
    const startTime = Date.now();
    const spanId = this.traceManager.createSpan(params.trace, 'delegate');

    try {
      // Step 1: Validate ownership before delegation
      const validationResult = await this.ownershipRegistry.validateOwnership(
        params.ownership
      );

      if (!validationResult.valid) {
        throw new DelegationError(
          ErrorCode.VALIDATION,
          `Ownership validation failed: ${validationResult.errors.join(', ')}`
        );
      }

      // Step 2: Resolve agent from repository
      const agent = await this.repository.getAgent(params.agent);
      if (!agent) {
        throw new DelegationError(
          ErrorCode.FATAL,
          `Agent not found: ${params.agent}`
        );
      }

      // Step 3: Create workspace context
      const workspaceContext = await WorkspaceContext.create(params.ownership, params.trace);

      // Step 4: Execute delegation with retry logic
      const result = await this.executeWithRetry({
        agent,
        task: params.task,
        trace: { ...params.trace, spanId, parentSpanId: params.trace.spanId },
        ownership: params.ownership,
        workspaceContext,
        timeout: params.timeout || this.defaultTimeout,
      });

      // Step 5: Transfer ownership back if required
      if (params.ownership.transferOnCompletion) {
        await this.ownershipRegistry.transferOwnership(params.ownership, 'orchestrator');
      }

      const duration = Date.now() - startTime;
      this.traceManager.endSpan(params.trace, spanId, result.success);

      return {
        agent: params.agent,
        success: result.success,
        result: result.data,
        error: result.error,
        duration,
        traceId: params.trace.traceId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.traceManager.endSpan(params.trace, spanId, false);

      return {
        agent: params.agent,
        success: false,
        error: error as Error,
        duration,
        traceId: params.trace.traceId,
      };
    }
  }

  /**
   * Delegate tasks to multiple agents in parallel
   *
   * @param params - Parallel delegation parameters
   * @returns Promise<Map<string, DelegationResult>> - Map of agent name to result
   *
   * @example
   * ```typescript
   * const results = await delegator.delegateParallel({
   *   agents: ['business-analyst', 'api-designer', 'typescript-expert'],
   *   tasks: [
   *     'Extract requirements',
   *     'Design API endpoints',
   *     'Implement TypeScript types'
   *   ],
   *   trace: { traceId: 'abc-123', spanId: 'span-1', baggage: new Map() },
   *   ownership: { ownedPaths: ['/src'], readOnlyPaths: [], transferOnCompletion: false }
   * });
   * ```
   */
  async delegateParallel(
    params: ParallelDelegationParams
  ): Promise<Map<string, DelegationResult>> {
    const results = new Map<string, DelegationResult>();
    const spanId = this.traceManager.createSpan(params.trace, 'delegateParallel');

    // Validate ownership once for all delegations
    const validationResult = await this.ownershipRegistry.validateOwnership(
      params.ownership
    );

    if (!validationResult.valid) {
      throw new DelegationError(
        ErrorCode.VALIDATION,
        `Ownership validation failed: ${validationResult.errors.join(', ')}`
      );
    }

    // Execute all delegations in parallel
    const delegationPromises = params.agents.map(async (agent, index) => {
      try {
        const result = await this.delegate({
          agent,
          task: params.tasks[index],
          trace: {
            ...params.trace,
            spanId: this.traceManager.createSpan(params.trace, `delegate-${agent}`),
            parentSpanId: spanId,
          },
          ownership: params.ownership,
          timeout: params.timeout || this.defaultTimeout,
        });

        return { agent, result };
      } catch (error) {
        return {
          agent,
          result: {
            agent,
            success: false,
            error: error as Error,
            duration: 0,
            traceId: params.trace.traceId,
          },
        };
      }
    });

    // Wait for all delegations to complete
    const delegationResults = await Promise.all(delegationPromises);

    // Collect results into map
    delegationResults.forEach(({ agent, result }) => {
      results.set(agent, result);
    });

    this.traceManager.endSpan(params.trace, spanId, true);

    return results;
  }

  /**
   * Delegate with automatic fallback to alternative agents
   *
   * Tries each agent in the fallback chain until one succeeds.
   * If no fallback chain is provided, automatically selects agents
   * based on required capabilities.
   *
   * @param params - Fallback delegation parameters
   * @returns Promise<DelegationResult>
   *
   * @example
   * ```typescript
   * const result = await delegator.delegateWithFallback({
   *   task: 'Design REST API for task management',
   *   requiredCapabilities: ['api-design', 'rest'],
   *   trace: { traceId: 'abc-123', spanId: 'span-1', baggage: new Map() },
   *   ownership: { ownedPaths: ['/src'], readOnlyPaths: [], transferOnCompletion: true },
   *   fallbackChain: ['api-designer', 'backend-architect', 'fullstack-developer']
   * });
   * ```
   */
  async delegateWithFallback(
    params: FallbackDelegationParams
  ): Promise<DelegationResult> {
    const spanId = this.traceManager.createSpan(params.trace, 'delegateWithFallback');
    const startTime = Date.now();

    // Determine fallback chain
    let fallbackChain = params.fallbackChain;

    if (!fallbackChain || fallbackChain.length === 0) {
      // Auto-select agents based on capabilities
      const agents = await this.repository.findAgentsByCapabilities(
        params.requiredCapabilities
      );

      // Sort by success rate (descending) and use as fallback chain
      fallbackChain = agents
        .sort((a, b) => b.successRate - a.successRate)
        .map(agent => agent.name);
    }

    if (fallbackChain.length === 0) {
      throw new DelegationError(
        ErrorCode.FATAL,
        `No agents found with capabilities: ${params.requiredCapabilities.join(', ')}`
      );
    }

    // Try each agent in the fallback chain
    const errors: Array<{ agent: string; error: Error }> = [];

    for (const agentName of fallbackChain) {
      try {
        const result = await this.delegate({
          agent: agentName,
          task: params.task,
          trace: {
            ...params.trace,
            spanId: this.traceManager.createSpan(params.trace, `fallback-${agentName}`),
            parentSpanId: spanId,
          },
          ownership: params.ownership,
          timeout: params.timeout || this.defaultTimeout,
        });

        if (result.success) {
          const duration = Date.now() - startTime;
          this.traceManager.endSpan(params.trace, spanId, true);

          return {
            agent: agentName,
            success: true,
            result: result.result,
            duration,
            traceId: params.trace.traceId,
          };
        }

        errors.push({ agent: agentName, error: result.error || new Error('Unknown error') });
      } catch (error) {
        errors.push({ agent: agentName, error: error as Error });
      }
    }

    // All agents in fallback chain failed
    const duration = Date.now() - startTime;
    this.traceManager.endSpan(params.trace, spanId, false);

    return {
      agent: fallbackChain[0],
      success: false,
      error: new DelegationError(
        ErrorCode.FATAL,
        `All ${fallbackChain.length} agents in fallback chain failed. Errors: ${errors.map(e => `${e.agent}: ${e.error.message}`).join('; ')}`
      ),
      duration,
      traceId: params.trace.traceId,
    };
  }

  /**
   * Execute delegation with retry logic
   *
   * Private method that implements exponential backoff retry
   */
  private async executeWithRetry(params: {
    agent: Agent;
    task: string;
    trace: TraceContext;
    ownership: FileOwnership;
    workspaceContext: WorkspaceContext;
    timeout: number;
  }): Promise<{ success: boolean; data?: any; error?: Error }> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        // Execute the delegation
        const result = await this.executeDelegation(params);

        // Success! Return result
        return { success: true, data: result };
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          // Non-retryable error, fail immediately
          throw error;
        }

        // Check if this was the last attempt
        if (attempt === this.retryConfig.maxAttempts) {
          // Last attempt failed, return error
          return { success: false, error: lastError };
        }

        // Calculate delay for exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Log retry
        this.traceManager.logRetry(params.trace, params.agent.name, attempt, error);
      }
    }

    // Should never reach here, but TypeScript needs it
    return { success: false, error: lastError };
  }

  /**
   * Execute a single delegation attempt
   *
   * This is where the actual agent invocation happens.
   * For now, this is a placeholder that will be implemented
   * to integrate with Claude Code's skill system.
   */
  private async executeDelegation(params: {
    agent: Agent;
    task: string;
    trace: TraceContext;
    ownership: FileOwnership;
    workspaceContext: WorkspaceContext;
    timeout: number;
  }): Promise<any> {
    // TODO: Integrate with Claude Code skill system
    // This will invoke the agent via the Skill tool or similar mechanism

    // Placeholder implementation
    return new Promise((resolve, reject) => {
      // Simulate agent execution
      setTimeout(() => {
        // For now, just return a mock result
        resolve({
          agent: params.agent.name,
          task: params.task,
          output: `Mock result from ${params.agent.name}`,
        });
      }, 100);
    });
  }

  /**
   * Check if an error is retryable
   *
   * Transient errors (network, timeout) are retryable.
   * Fatal errors (invalid agent, validation) are not.
   */
  private isRetryable(error: Error): boolean {
    if (error instanceof DelegationError) {
      return error.code === ErrorCode.RETRY || error.code === ErrorCode.TIMEOUT;
    }

    // For other error types, assume non-retryable
    return false;
  }
}
