/**
 * Agent Orchestrator - Workflow Coordination
 *
 * The Agent Orchestrator is the glue that coordinates:
 * - Agent Bridge (loads behavioral definitions)
 * - Agent State Store (persistent memory)
 * - Agent Message Bus (inter-agent communication)
 *
 * This enables multi-agent workflows where agents can:
 * - Remember previous work (via State Store)
 * - Communicate with each other (via Message Bus)
 * - Execute with full behavioral context (via Agent Bridge)
 *
 * Key features:
 * - Multi-agent workflow execution
 * - Agent spawning with state + messaging
 * - Fallback chain management
 * - Parallel agent coordination
 * - Transaction-like workflows (commit/rollback)
 */

import { AgentBridge, type TaskFunction } from '../agent-bridge/index.js';
import { AgentStateStore } from '../agent-state/AgentStateStore.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import type { InvocationContext, InvocationResult } from '../agent-bridge/types.js';
import type { AgentState } from '../types.js';

// wshobson integration imports
import { AgentRegistry } from '../registry.js';
import { WshobsonAgentAdapter } from '../adapters/wshobson-adapter.js';
import { RestrictedAgentContext } from '../security/external-agent-sandbox.js';
import { ToolExecutionGuard } from '../security/tool-execution-guard.js';
import { executeWshobsonAgent } from '../execution/claude-api.js';
import type { WshobsonAgentDefinition } from '../types/wshobson-types.js';

/**
 * Workflow definition
 */
export interface AgentWorkflow {
  /** Workflow ID */
  id: string;

  /** Workflow name/description */
  name: string;

  /** Workflow steps */
  steps: WorkflowStep[];

  /** Whether steps run in parallel or sequentially */
  mode: 'sequential' | 'parallel';

  /** Communication channels for workflow */
  channels?: string[];

  /** Global context shared across all agents */
  context?: Record<string, any>;
}

/**
 * Single workflow step
 */
export interface WorkflowStep {
  /** Step ID */
  id: string;

  /** Agent to invoke */
  agentId: string;

  /** Task description */
  task: string;

  /** Step-specific context */
  context?: Partial<InvocationContext>;

  /** Dependencies (step IDs that must complete first) */
  dependencies?: string[];

  /** Timeout in milliseconds */
  timeout?: number;

  /** Failure mode */
  onFailure?: 'continue' | 'stop' | 'rollback';

  /** Output mapping (where to store results) */
  outputTo?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /** Workflow ID */
  workflowId: string;

  /** Overall success */
  success: boolean;

  /** Execution duration */
  duration: number;

  /** Step results */
  steps: StepResult[];

  /** Completed steps */
  completed: number;

  /** Failed steps */
  failed: number;

  /** Error if workflow failed */
  error?: string;

  /** Workflow outputs */
  outputs: Record<string, any>;
}

/**
 * Single step result
 */
export interface StepResult {
  /** Step ID */
  stepId: string;

  /** Agent invoked */
  agentId: string;

  /** Success status */
  success: boolean;

  /** Invocation result */
  result?: InvocationResult;

  /** State snapshot after execution */
  state?: AgentState;

  /** Error if failed */
  error?: string;

  /** Execution time */
  duration: number;

  /** Messages sent during this step */
  messages: number;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Default timeout for agent invocations (ms) */
  defaultTimeout?: number;

  /** Maximum concurrent workflows */
  maxConcurrentWorkflows?: number;

  /** Enable workflow persistence */
  enablePersistence?: boolean;

  /** Enable state checkpointing */
  enableCheckpointing?: boolean;
}

/**
 * Agent Orchestrator
 *
 * Coordinates multi-agent workflows using State + Bus + Bridge.
 */
export class AgentOrchestrator {
  private bridge: AgentBridge;
  private stateStore: AgentStateStore;
  private messageBus: AgentMessageBus;
  private config: Required<OrchestratorConfig>;

  // Active workflows
  private activeWorkflows: Map<string, AgentWorkflow> = new Map();

  // Task function for Claude Code integration
  private taskFunction?: TaskFunction;

  // wshobson integration
  private wshobsonAdapter: WshobsonAgentAdapter;

  constructor(
    bridge: AgentBridge,
    stateStore: AgentStateStore,
    messageBus: AgentMessageBus,
    config: OrchestratorConfig = {}
  ) {
    this.bridge = bridge;
    this.stateStore = stateStore;
    this.messageBus = messageBus;

    // Initialize wshobson adapter
    this.wshobsonAdapter = new WshobsonAgentAdapter();

    // Default configuration
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      maxConcurrentWorkflows: config.maxConcurrentWorkflows ?? 10,
      enablePersistence: config.enablePersistence ?? true,
      enableCheckpointing: config.enableCheckpointing ?? true
    };
  }

  /**
   * Set the Task function (for Claude Code integration)
   */
  setTaskFunction(taskFn: TaskFunction): void {
    this.taskFunction = taskFn;
    this.bridge.setTaskFunction(taskFn);
  }

  /**
   * Execute a multi-agent workflow
   *
   * @param workflow - Workflow definition
   * @returns Workflow execution result
   */
  async executeWorkflow(workflow: AgentWorkflow): Promise<WorkflowResult> {
    const startedAt = Date.now();

    console.log(`[Orchestrator] Starting workflow: ${workflow.name} (${workflow.steps.length} steps)`);

    // Check concurrent workflow limit
    if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
      throw new Error(`Maximum concurrent workflows reached (${this.config.maxConcurrentWorkflows})`);
    }

    // Register workflow
    this.activeWorkflows.set(workflow.id, workflow);

    // Setup communication channels
    if (workflow.channels) {
      for (const channel of workflow.channels) {
        // Channels are auto-created by message bus
        console.log(`[Orchestrator] Using channel: ${channel}`);
      }
    }

    try {
      let results: WorkflowResult;

      if (workflow.mode === 'sequential') {
        results = await this.executeSequential(workflow);
      } else {
        results = await this.executeParallel(workflow);
      }

      results.duration = Date.now() - startedAt;

      console.log(`[Orchestrator] Workflow ${workflow.name} completed: ${results.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`[Orchestrator] Duration: ${results.duration}ms, Steps: ${results.completed}/${results.steps.length}`);

      return results;

    } catch (error) {
      const duration = Date.now() - startedAt;

      return {
        workflowId: workflow.id,
        success: false,
        duration,
        steps: [],
        completed: 0,
        failed: workflow.steps.length,
        error: (error as any).message,
        outputs: {}
      };
    } finally {
      // Unregister workflow
      this.activeWorkflows.delete(workflow.id);
    }
  }

  /**
   * Execute workflow steps sequentially
   */
  private async executeSequential(workflow: AgentWorkflow): Promise<WorkflowResult> {
    const steps: StepResult[] = [];
    const outputs: Record<string, any> = {};
    let completed = 0;
    let failed = 0;

    for (const step of workflow.steps) {
      console.log(`[Orchestrator] Executing step ${step.id}: ${step.agentId}`);

      // Check dependencies
      if (step.dependencies) {
        const dependencyResults = step.dependencies.map(depId =>
          steps.find(s => s.stepId === depId)
        );

        const failedDeps = dependencyResults.filter(r => r && !r.success);
        if (failedDeps.length > 0) {
          console.log(`[Orchestrator] Step ${step.id} skipped due to failed dependencies`);
          steps.push({
            stepId: step.id,
            agentId: step.agentId,
            success: false,
            error: `Dependencies failed: ${failedDeps.map(d => d?.stepId).join(', ')}`,
            duration: 0,
            messages: 0
          });
          failed++;
          continue;
        }
      }

      // Execute step
      const result = await this.executeStep(step, workflow);

      steps.push(result);
      outputs[step.outputTo || step.id] = result.result;

      if (result.success) {
        completed++;
      } else {
        failed++;

        // Handle failure
        if (step.onFailure === 'stop') {
          console.log(`[Orchestrator] Stopping workflow due to step ${step.id} failure`);
          break;
        } else if (step.onFailure === 'rollback') {
          console.log(`[Orchestrator] Rolling back workflow due to step ${step.id} failure`);
          // TODO: Implement rollback logic
          break;
        }
        // else: continue (onFailure === 'continue')
      }
    }

    return {
      workflowId: workflow.id,
      success: failed === 0,
      duration: 0, // Will be set by executeWorkflow
      steps,
      completed,
      failed,
      outputs
    };
  }

  /**
   * Execute workflow steps in parallel
   */
  private async executeParallel(workflow: AgentWorkflow): Promise<WorkflowResult> {
    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(workflow.steps);

    // Execute steps respecting dependencies
    const stepResults = new Map<string, StepResult>();
    const completed = new Set<string>();
    const outputs: Record<string, any> = {};

    let completedCount = 0;
    let failedCount = 0;

    while (completed.size < workflow.steps.length) {
      // Find steps ready to execute (all dependencies completed)
      const readySteps = workflow.steps.filter(step =>
        !completed.has(step.id) &&
        this.areDependenciesCompleted(step, completed)
      );

      if (readySteps.length === 0 && completed.size < workflow.steps.length) {
        throw new Error('Circular dependency detected in workflow');
      }

      // Execute ready steps in parallel
      const results = await Promise.all(
        readySteps.map(step => this.executeStep(step, workflow))
      );

      // Process results
      for (const result of results) {
        stepResults.set(result.stepId, result);
        completed.add(result.stepId);
        outputs[result.stepId] = result.result;

        if (result.success) {
          completedCount++;
        } else {
          failedCount++;
        }
      }
    }

    return {
      workflowId: workflow.id,
      success: failedCount === 0,
      duration: 0, // Will be set by executeWorkflow
      steps: Array.from(stepResults.values()),
      completed: completedCount,
      failed: failedCount,
      outputs
    };
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    workflow: AgentWorkflow
  ): Promise<StepResult> {
    const startedAt = Date.now();

    try {
      // Build invocation context (merge workflow + step context)
      const invocationContext: InvocationContext = {
        domain: step.context?.domain || workflow.context?.domain || {
          domainId: 'default',
          name: 'Default Domain',
          type: 'general',
          description: 'Default domain',
          stack: {
            language: 'typescript',
            framework: 'custom',
            testing: 'jest',
            packageManager: 'npm'
          },
          agents: [],
          routing: {
            rules: [],
            ownership: 'auto-assign'
          }
        },
        workspace: step.context?.workspace || workflow.context?.workspace || {
          path: process.cwd(),
          domainId: 'default',
          availableAgents: [],
          queuePaths: {
            intake: '.ultra/queue/intake',
            inProgress: '.ultra/queue/in-progress',
            review: '.ultra/queue/review',
            completed: '.ultra/queue/completed',
            failed: '.ultra/queue/failed'
          }
        },
        task: {
          taskId: step.id,
          type: 'workflow-step',
          description: step.task,
          priority: 'normal',
          assignedBy: 'orchestrator',
          createdAt: new Date(),
          workflowId: workflow.id
        }
      };

      // Get current agent state (if exists)
      const currentState = await this.stateStore.get(step.agentId);

      // Subscribe to agent messages for this step
      let messageCount = 0;
      const messageChannel = `workflow-${workflow.id}-step-${step.id}`;

      const unsubscribe = this.messageBus.subscribe(
        step.agentId,
        messageChannel,
        async () => {
          messageCount++;
        }
      );

      // Invoke agent
      const result = await this.bridge.invoke(step.agentId, step.task, invocationContext);

      // Update agent state
      await this.stateStore.update(step.agentId, {
        currentTask: step.id,
        completedTasks: [...(currentState?.completedTasks || []), step.id]
      });

      // Record invocation
      await this.stateStore.recordInvocation(
        step.agentId,
        step.id,
        result.success,
        result.duration
      );

      // Call unsubscribe as a function
      await (unsubscribe as any)();

      return {
        stepId: step.id,
        agentId: step.agentId,
        success: result.success,
        result,
        state: await this.stateStore.get(step.agentId) || undefined,
        duration: Date.now() - startedAt,
        messages: messageCount
      };

    } catch (error) {
      return {
        stepId: step.id,
        agentId: step.agentId,
        success: false,
        error: (error as any).message,
        duration: Date.now() - startedAt,
        messages: 0
      };
    }
  }

  /**
   * Spawn a single agent with state + messaging
   *
   * @param agentId - Agent to spawn
   * @param task - Task for agent
   * @param context - Invocation context
   * @returns Invocation result
   */
  async spawnAgent(
    agentId: string,
    task: string,
    context: InvocationContext
  ): Promise<InvocationResult> {
    console.log(`[Orchestrator] Spawning agent ${agentId} for task: ${task.substring(0, 50)}...`);

    // Check if this is a wshobson agent
    if (this.isWshobsonAgent(agentId)) {
      return this.executeWshobsonAgent(agentId, task, context);
    }

    // Create state if doesn't exist
    const exists = await this.stateStore.exists(agentId);
    if (!exists) {
      await this.stateStore.create(agentId, {
        currentTask: task,
        context: {
          domain: context.domain,
          workspace: context.workspace,
          task: context.task
        }
      });
    }

    // Subscribe agent to default channels
    this.messageBus.subscribe(agentId, 'broadcast', async (msg) => {
      console.log(`[${agentId}] Broadcast: ${msg.type}`);
    });

    // Invoke agent
    const result = await this.bridge.invoke(agentId, task, context);

    // Update state
    const currentState = await this.stateStore.get(agentId);
    await this.stateStore.update(agentId, {
      currentTask: undefined, // Clear after completion
      completedTasks: [...(currentState?.completedTasks || []), task]
    });

    return result;
  }

  /**
   * Coordinate multiple agents in parallel with communication
   *
   * @param agents - Array of agent specifications
   * @returns Array of invocation results
   */
  async coordinateParallel(agents: Array<{
    agentId: string;
    task: string;
    context: InvocationContext;
    communicationChannels?: string[];
  }>): Promise<InvocationResult[]> {
    console.log(`[Orchestrator] Coordinating ${agents.length} agents in parallel`);

    // Subscribe all agents to communication channels
    for (const spec of agents) {
      if (spec.communicationChannels) {
        for (const channel of spec.communicationChannels) {
          this.messageBus.subscribe(spec.agentId, channel, async (msg) => {
            // Handle inter-agent communication
            console.log(`[${spec.agentId}] Received on ${channel}: ${msg.type}`);
          });
        }
      }
    }

    // Execute all agents in parallel
    const results = await Promise.all(
      agents.map(spec => this.spawnAgent(spec.agentId, spec.task, spec.context))
    );

    return results;
  }

  /**
   * Build dependency graph for parallel execution
   */
  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }

    return graph;
  }

  /**
   * Check if all dependencies for a step are completed
   */
  private areDependenciesCompleted(step: WorkflowStep, completed: Set<string>): boolean {
    if (!step.dependencies) return true;

    return step.dependencies.every(dep => completed.has(dep));
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): AgentWorkflow[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      activeWorkflows: this.activeWorkflows.size,
      maxConcurrentWorkflows: this.config.maxConcurrentWorkflows,
      config: this.config
    };
  }

  /**
   * Check if agentId is a wshobson agent
   */
  private isWshobsonAgent(agentId: string): boolean {
    return agentId.startsWith('wshobson:');
  }

  /**
   * Execute wshobson agent with sandboxing and security enforcement
   *
   * @param agentId - wshobson agent ID (e.g., "wshobson:backend-security-reviewer")
   * @param task - Task description
   * @param context - Invocation context
   * @returns Invocation result
   */
  private async executeWshobsonAgent(
    agentId: string,
    task: string,
    context: InvocationContext
  ): Promise<InvocationResult> {
    const startedAt = Date.now();
    const agentName = agentId.replace('wshobson:', '');

    console.log(`[Orchestrator] Executing wshobson agent: ${agentName}`);

    try {
      // Get wshobson agent from registry
      const agent = AgentRegistry.getWshobsonAgent(agentName);
      if (!agent) {
        throw new Error(`wshobson agent not found: ${agentName}`);
      }

      // Convert to executable definition
      const definition: WshobsonAgentDefinition = await this.wshobsonAdapter.toAgentDefinition(agent);

      // Create sandboxed context (external agents get restricted tool access)
      const sandboxContext = new RestrictedAgentContext({
        allowedTools: [], // Use default read-only tools
        maxTokens: 4096,
        maxToolCalls: 10,
        enableNetwork: false
      });

      // Create tool execution guard
      const toolGuard = new ToolExecutionGuard(sandboxContext);

      // Execute with security enforcement
      const executionResult = await executeWshobsonAgent(
        task,
        definition.model || definition.tier || 'sonnet',
        {
          maxTokens: sandboxContext.getExecutionContext().maxTokens,
          systemPrompt: definition.systemPrompt,
          tools: sandboxContext.getExecutionContext().restricted
            ? [] // No tools for restricted agents
            : context.tools || []
        }
      );

      // Update agent state
      const exists = await this.stateStore.exists(agentId);
      if (!exists) {
        await this.stateStore.create(agentId, {
          currentTask: task,
          context: context.context || {}
        });
      }

      // Record invocation
      await this.stateStore.recordInvocation(
        agentId,
        task,
        true,
        Date.now() - startedAt
      );

      // Update state after completion
      await this.stateStore.update(agentId, {
        currentTask: null,
        completedTasks: [...(await this.stateStore.get(agentId))?.completedTasks || [], task]
      });

      return {
        success: true,
        output: executionResult.output,
        duration: Date.now() - startedAt,
        tokens: executionResult.usage,
        agentId
      };

    } catch (error) {
      const duration = Date.now() - startedAt;
      const errorMessage = (error as any).message || 'Unknown error';

      console.error(`[Orchestrator] wshobson agent execution failed: ${errorMessage}`);

      // Record failed invocation
      const exists = await this.stateStore.exists(agentId);
      if (exists) {
        await this.stateStore.recordInvocation(agentId, task, false, duration);
      }

      return {
        success: false,
        output: '',
        duration,
        error: errorMessage,
        agentId
      };
    }
  }
}
