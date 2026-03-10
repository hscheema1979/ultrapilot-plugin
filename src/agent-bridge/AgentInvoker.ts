/**
 * Agent Invoker
 *
 * Invokes agents with full behavioral context using the Task tool.
 * Loads agent definition, builds complete system prompt, and executes.
 */

import { AgentDefinitionLoader } from './AgentDefinitionLoader.js';
import { SystemPromptBuilder } from './SystemPromptBuilder.js';

import {
  InvocationOptions,
  InvocationResult,
  DomainContext,
  WorkspaceContext,
  TaskContext,
  InvocationContext,
  InvokerOptions,
  TaskFunction,
  AgentDefinition
} from './types.js';

/**
 * Default invoker options
 */
const DEFAULT_OPTIONS: InvokerOptions = {
  defaultTimeout: 300000, // 5 minutes
  maxConcurrentInvocations: 5,
  enableMetrics: true,
  logLevel: 'info'
};

export class AgentInvoker {
  private loader: AgentDefinitionLoader;
  private promptBuilder: SystemPromptBuilder;
  private options: InvokerOptions;
  private activeInvocations: Set<string> = new Set();
  private metrics: Map<string, {
    count: number;
    totalDuration: number;
    successCount: number;
    failureCount: number;
  }> = new Map();
  private taskFunction?: TaskFunction;

  constructor(
    loader: AgentDefinitionLoader,
    promptBuilder: SystemPromptBuilder,
    options: InvokerOptions = {}
  ) {
    this.loader = loader;
    this.promptBuilder = promptBuilder;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Set the Task function (injected from Claude Code host)
   *
   * This enables agents to spawn other Claude Code agents autonomously.
   */
  setTaskFunction(taskFn: TaskFunction): void {
    this.taskFunction = taskFn;
  }

  /**
   * Invoke an agent with full behavioral context
   *
   * @param options - Invocation options (agentId, task, context)
   * @returns Invocation result
   */
  async invokeAgent(options: InvocationOptions): Promise<InvocationResult> {
    const startedAt = new Date();
    const agentId = options.agentId;

    // Check concurrent invocation limit
    await this.acquireInvocationSlot(agentId);

    try {
      this.log('info', `Invoking agent: ${agentId}`);

      // 1. Load full agent definition
      this.log('debug', `Loading agent definition: ${agentId}`);
      const definition = await this.loader.loadAgentDefinition(agentId);

      // 2. Build complete system prompt
      this.log('debug', `Building system prompt for: ${agentId}`);
      const systemPrompt = this.promptBuilder.buildSystemPrompt(definition, options.context);

      // 3. Determine model tier
      const model = this.resolveModel(definition.model, options.model);

      // 4. Build task description
      const taskDescription = this.buildTaskDescription(definition, options);

      // 5. Invoke Task tool with full context
      this.log('info', `Executing ${definition.name} (${model}) on task: ${options.task.substring(0, 50)}...`);

      const taskResult = await this.invokeTaskTool({
        subagent_type: this.mapModelToSubagent(model),
        description: taskDescription,
        prompt: systemPrompt
      });

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // 6. Build result
      const result: InvocationResult = {
        success: true,
        agentId,
        agentName: definition.name,
        model,
        message: taskResult.message || taskResult.output || 'Task completed',
        output: taskResult.output,
        duration,
        startedAt,
        completedAt
      };

      // 7. Update metrics
      if (this.options.enableMetrics) {
        this.updateMetrics(agentId, duration, true);
      }

      this.log('info', `Agent ${agentId} completed in ${duration}ms`);

      return result;

    } catch (error) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      this.log('error', `Agent ${agentId} failed: ${(error as any).message}`);

      const result: InvocationResult = {
        success: false,
        agentId,
        agentName: agentId,
        model: 'sonnet',
        message: `Agent invocation failed: ${(error as any).message}`,
        duration,
        startedAt,
        completedAt,
        errors: [(error as any).message]
      };

      // Update metrics
      if (this.options.enableMetrics) {
        this.updateMetrics(agentId, duration, false);
      }

      return result;

    } finally {
      this.releaseInvocationSlot(agentId);
    }
  }

  /**
   * Invoke multiple agents in parallel
   *
   * @param invocations - Array of invocation options
   * @returns Array of invocation results
   */
  async invokeAgentsParallel(invocations: InvocationOptions[]): Promise<InvocationResult[]> {
    this.log('info', `Invoking ${invocations.length} agents in parallel`);

    const results = await Promise.all(
      invocations.map(options => this.invokeAgent(options))
    );

    return results;
  }

  /**
   * Invoke multiple agents sequentially (with dependency management)
   *
   * @param invocations - Array of invocation options
   * @param dependencies - Optional dependency map (invocation index -> array of dependency indices)
   * @returns Array of invocation results
   */
  async invokeAgentsSequential(
    invocations: InvocationOptions[],
    dependencies?: Record<number, number[]>
  ): Promise<InvocationResult[]> {
    this.log('info', `Invoking ${invocations.length} agents sequentially`);

    const results: InvocationResult[] = [];
    const completed = new Set<number>();

    for (let i = 0; i < invocations.length; i++) {
      // Check if dependencies are satisfied
      if (dependencies && dependencies[i]) {
        const deps = dependencies[i];
        const pendingDeps = deps.filter(dep => !completed.has(dep));

        if (pendingDeps.length > 0) {
          this.log('warn', `Skipping invocation ${i} due to unmet dependencies: ${pendingDeps.join(', ')}`);
          results.push({
            success: false,
            agentId: invocations[i].agentId,
            agentName: invocations[i].agentId,
            model: 'sonnet',
            message: 'Skipped due to unmet dependencies',
            duration: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            errors: [`Unmet dependencies: ${pendingDeps.join(', ')}`]
          });
          continue;
        }
      }

      const result = await this.invokeAgent(invocations[i]);
      results.push(result);

      if (result.success) {
        completed.add(i);
      }
    }

    return results;
  }

  /**
   * Resolve model tier (agent definition vs. override vs. domain default)
   */
  private resolveModel(
    agentModel: string,
    override?: 'opus' | 'sonnet' | 'haiku'
  ): 'opus' | 'sonnet' | 'haiku' {
    // Explicit override takes precedence
    if (override) {
      return override;
    }

    // Use agent's model if not 'inherit'
    if (agentModel !== 'inherit') {
      return agentModel as 'opus' | 'sonnet' | 'haiku';
    }

    // Default to sonnet for 'inherit'
    return 'sonnet';
  }

  /**
   * Map model tier to Task tool subagent type
   */
  private mapModelToSubagent(model: 'opus' | 'sonnet' | 'haiku'): string {
    const mapping: Record<string, string> = {
      'opus': 'general-purpose',  // Use opus for complex tasks
      'sonnet': 'general-purpose',
      'haiku': 'general-purpose'  // Haiku uses general-purpose but faster
    };

    return mapping[model] || 'general-purpose';
  }

  /**
   * Build task description for Task tool
   */
  private buildTaskDescription(
    definition: AgentDefinition,
    options: InvocationOptions
  ): string {
    const parts: string[] = [];

    parts.push(`[${definition.name}]`);
    parts.push(options.task);

    return parts.join(' ');
  }

  /**
   * Invoke Task tool - spawns actual Claude Code agent
   *
   * This method creates an autonomous Claude Code subagent that works
   * independently with full behavioral context from the agent definition.
   */
  private async invokeTaskTool(params: {
    subagent_type: string;
    description: string;
    prompt: string;
    model?: 'opus' | 'sonnet' | 'haiku';
  }): Promise<any> {
    // Check if Task function is available
    if (!this.taskFunction) {
      throw new Error(
        'Task function not set. Agent spawning requires Claude Code host integration. ' +
        'Call setTaskFunction() to enable autonomous agent spawning.'
      );
    }

    // Spawn actual Claude Code agent with full behavioral context
    this.log('info', `Spawning Claude Code agent: ${params.subagent_type}`);

    const result = await this.taskFunction({
      description: params.description,
      prompt: params.prompt,
      subagent_type: params.subagent_type,
      model: params.model
    });

    this.log('debug', `Agent completed: ${result ? 'success' : 'failed'}`);

    return result;
  }

  /**
   * Acquire invocation slot (enforce concurrency limit)
   */
  private async acquireInvocationSlot(agentId: string): Promise<void> {
    while (this.activeInvocations.size >= this.options.maxConcurrentInvocations!) {
      this.log('debug', `Waiting for invocation slot (active: ${this.activeInvocations.size})`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeInvocations.add(agentId);
  }

  /**
   * Release invocation slot
   */
  private releaseInvocationSlot(agentId: string): void {
    this.activeInvocations.delete(agentId);
  }

  /**
   * Update metrics
   */
  private updateMetrics(agentId: string, duration: number, success: boolean): void {
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, {
        count: 0,
        totalDuration: 0,
        successCount: 0,
        failureCount: 0
      });
    }

    const metrics = this.metrics.get(agentId)!;
    metrics.count++;
    metrics.totalDuration += duration;

    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }
  }

  /**
   * Get metrics for an agent
   */
  getMetrics(agentId?: string): any {
    if (agentId) {
      return this.metrics.get(agentId) || null;
    }

    // Return all metrics
    return Object.fromEntries(this.metrics.entries());
  }

  /**
   * Reset metrics
   */
  resetMetrics(agentId?: string): void {
    if (agentId) {
      this.metrics.delete(agentId);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Logging helper
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.options.logLevel!];

    if (levels[level] >= currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AgentInvoker:${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Update invoker options
   */
  setOptions(options: Partial<InvokerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): InvokerOptions {
    return { ...this.options };
  }

  /**
   * Get active invocations
   */
  getActiveInvocations(): string[] {
    return Array.from(this.activeInvocations);
  }

  // ========================================================================
  // wshobson Agent Resolution (NEW STATIC METHOD for integration)
  // ========================================================================

  /**
   * Resolve agent by ID with fallback logic
   * NEW STATIC METHOD for wshobson integration
   *
   * Checks wshobson registry first, then ultra registry
   * Returns UnifiedAgent metadata or null if not found
   *
   * DEPENDENCY: Requires P1-T004 (AgentRegistry extensions) to complete first
   * because this method calls AgentRegistry.getWshobsonAgent()
   *
   * @param agentId - Agent ID (e.g., 'wshobson:backend-security' or 'ultra:analyst')
   * @returns UnifiedAgent metadata or null
   */
  static async resolveAgent(agentId: string): Promise<any | null> {
    const { AgentRegistry } = await import('../registry.js');

    // Check if wshobson agent (prefixed)
    if (agentId.startsWith('wshobson:')) {
      const agentName = agentId.replace('wshobson:', '');
      const wshobsonAgent = AgentRegistry.getWshobsonAgent(agentName);

      if (wshobsonAgent) {
        return {
          id: agentId,
          name: wshobsonAgent.name,
          description: wshobsonAgent.description,
          model: wshobsonAgent.model,
          source: 'wshobson',
          plugin: wshobsonAgent.plugin,
          domain: wshobsonAgent.domain,
          capabilities: wshobsonAgent.capabilities
        };
      }
    }

    // Check ultra agent (existing logic)
    // FIXED: Use correct method name getMapping() not getMappingForAgentType()
    const mapping = AgentRegistry.getMapping(agentId);
    if (mapping) {
      return {
        id: agentId,
        name: mapping.agentType,
        description: mapping.description || '',
        model: mapping.model,
        source: 'ultrapilot',
        capabilities: []
      };
    }

    return null;
  }
}
