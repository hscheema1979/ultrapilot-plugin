/**
 * Agent Bridge - Main Entry Point
 *
 * Provides a unified interface for loading agent definitions,
 * building system prompts, and invoking agents with full behavioral context.
 *
 * This bridges the gap between the AGENT_CATALOG (metadata only)
 * and the actual agent .md files (full behavioral instructions).
 *
 * @example
 * ```typescript
 * import { AgentBridge } from './agent-bridge/index.js';
 *
 * const bridge = new AgentBridge();
 *
 * // Invoke an agent with full behavioral context
 * const result = await bridge.invoke('ultra:backend-architect', task, context);
 * ```
 */

import { AgentDefinitionLoader } from './AgentDefinitionLoader.js';
import { SystemPromptBuilder } from './SystemPromptBuilder.js';
import { AgentInvoker } from './AgentInvoker.js';

import {
  AgentDefinition,
  DomainContext,
  WorkspaceContext,
  TaskContext,
  InvocationContext,
  InvocationOptions,
  InvocationResult,
  LoaderOptions,
  PromptBuilderOptions,
  InvokerOptions,
  TaskFunction
} from './types.js';

/**
 * Agent Bridge - Unified interface
 *
 * Combines loader, builder, and invoker into a single convenient API.
 */
export class AgentBridge {
  private loader: AgentDefinitionLoader;
  private promptBuilder: SystemPromptBuilder;
  private invoker: AgentInvoker;

  constructor(
    loaderOptions?: LoaderOptions,
    builderOptions?: PromptBuilderOptions,
    invokerOptions?: InvokerOptions
  ) {
    this.loader = new AgentDefinitionLoader(loaderOptions);
    this.promptBuilder = new SystemPromptBuilder(builderOptions);
    this.invoker = new AgentInvoker(this.loader, this.promptBuilder, invokerOptions);
  }

  /**
   * Invoke an agent with full behavioral context
   *
   * @param agentId - Agent ID (e.g., 'ultra:backend-architect')
   * @param task - Task description
   * @param context - Invocation context (domain, workspace, task info)
   * @returns Invocation result
   */
  async invoke(
    agentId: string,
    task: string,
    context: InvocationContext
  ): Promise<InvocationResult> {
    const options: InvocationOptions = {
      agentId,
      task,
      context
    };

    return await this.invoker.invokeAgent(options);
  }

  /**
   * Load agent definition (without invoking)
   *
   * @param agentId - Agent ID
   * @returns Complete agent definition
   */
  async loadAgent(agentId: string): Promise<AgentDefinition> {
    return await this.loader.loadAgentDefinition(agentId);
  }

  /**
   * Build system prompt for an agent
   *
   * @param agentId - Agent ID
   * @param context - Invocation context
   * @returns Complete system prompt
   */
  async buildPrompt(
    agentId: string,
    context: InvocationContext
  ): Promise<string> {
    const definition = await this.loader.loadAgentDefinition(agentId);
    return this.promptBuilder.buildSystemPrompt(definition, context);
  }

  /**
   * Check if an agent exists
   *
   * @param agentId - Agent ID
   * @returns True if agent exists
   */
  async agentExists(agentId: string): Promise<boolean> {
    return await this.loader.agentExists(agentId);
  }

  /**
   * List all available agents
   *
   * @returns Array of agent IDs
   */
  async listAgents(): Promise<string[]> {
    return await this.loader.listAvailableAgents();
  }

  /**
   * Preload multiple agents into cache
   *
   * @param agentIds - Array of agent IDs to preload
   */
  async preloadAgents(agentIds: string[]): Promise<void> {
    await this.loader.preloadAgents(agentIds);
  }

  /**
   * Clear agent cache
   */
  clearCache(): void {
    this.loader.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.loader.getCacheStats();
  }

  /**
   * Get invocation metrics
   */
  getMetrics(agentId?: string) {
    return this.invoker.getMetrics(agentId);
  }

  /**
   * Reset metrics
   */
  resetMetrics(agentId?: string): void {
    this.invoker.resetMetrics(agentId);
  }

  /**
   * Get low-level components (for advanced usage)
   */
  getComponents() {
    return {
      loader: this.loader,
      promptBuilder: this.promptBuilder,
      invoker: this.invoker
    };
  }

  /**
   * Set the Task function (injected from Claude Code host)
   *
   * This enables agents to spawn other Claude Code agents autonomously.
   * Pass the Task tool function from the host environment.
   *
   * @example
   * ```typescript
   * bridge.setTaskFunction(Task);
   * ```
   */
  setTaskFunction(taskFn: TaskFunction): void {
    this.invoker.setTaskFunction(taskFn);
  }
}

/**
 * Convenience function: Create and invoke in one call
 *
 * @example
 * ```typescript
 * const result = await invokeAgent('ultra:backend-architect', task, context);
 * ```
 */
export async function invokeAgent(
  agentId: string,
  task: string,
  context: InvocationContext,
  options?: {
    loaderOptions?: LoaderOptions;
    builderOptions?: PromptBuilderOptions;
    invokerOptions?: InvokerOptions;
  }
): Promise<InvocationResult> {
  const bridge = new AgentBridge(
    options?.loaderOptions,
    options?.builderOptions,
    options?.invokerOptions
  );

  return await bridge.invoke(agentId, task, context);
}

/**
 * Convenience function: Load agent definition
 */
export async function loadAgentDefinition(
  agentId: string,
  options?: LoaderOptions
): Promise<AgentDefinition> {
  const loader = new AgentDefinitionLoader(options);
  return await loader.loadAgentDefinition(agentId);
}

/**
 * Convenience function: Build system prompt
 */
export async function buildSystemPrompt(
  agentId: string,
  context: InvocationContext,
  options?: {
    loaderOptions?: LoaderOptions;
    builderOptions?: PromptBuilderOptions;
  }
): Promise<string> {
  const loader = new AgentDefinitionLoader(options?.loaderOptions);
  const builder = new SystemPromptBuilder(options?.builderOptions);

  const definition = await loader.loadAgentDefinition(agentId);
  return builder.buildSystemPrompt(definition, context);
}

// Export all types
export * from './types.js';

// Export components
export { AgentDefinitionLoader } from './AgentDefinitionLoader.js';
export { SystemPromptBuilder } from './SystemPromptBuilder.js';
export { AgentInvoker } from './AgentInvoker.js';

/**
 * Default export: AgentBridge class
 */
export default AgentBridge;
