/**
 * Phase Executor - Executes individual phases of the UltraPilot workflow
 *
 * This module handles the execution of each phase (Phase 2-5) in the workflow:
 * - Phase 2: Queue-Based Task Processing
 * - Phase 3: QA Cycles (UltraQA)
 * - Phase 4: Multi-Perspective Validation
 * - Phase 5: Evidence-Based Verification
 *
 * Each phase is executed independently with proper state management and reporting.
 */

import { EventEmitter } from 'events';
import { TaskQueue, Task, TaskStatus } from './TaskQueue.js';
import { AgentBridge } from './AgentBridge.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';

/**
 * Phase definition from plan
 */
export interface PhaseDefinition {
  phaseNumber: number;
  name: string;
  tasks: Array<{
    taskId: string;
    title: string;
    description: string;
    agentType: string;
    priority: string;
    estimatedHours: number;
  }>;
  dependencies?: number[];
}

/**
 * Phase execution state
 */
export interface PhaseState {
  phaseNumber: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  tasksCompleted: number;
  totalTasks: number;
  errors: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Phase execution result
 */
export interface PhaseResult {
  phaseNumber: number;
  name: string;
  success: boolean;
  duration: number;
  tasksCompleted: number;
  totalTasks: number;
  errors: string[];
  metadata?: Record<string, unknown>;
  output?: string;
}

/**
 * Phase execution configuration
 */
export interface PhaseExecutorConfig {
  /** Maximum concurrent tasks per phase */
  maxConcurrentTasks: number;
  /** Task timeout in milliseconds */
  taskTimeout: number;
  /** Enable parallel task execution */
  enableParallelExecution: boolean;
  /** Retry failed tasks */
  retryFailedTasks: boolean;
  /** Maximum retries per task */
  maxRetries: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PhaseExecutorConfig = {
  maxConcurrentTasks: 5,
  taskTimeout: 3600000, // 1 hour
  enableParallelExecution: true,
  retryFailedTasks: true,
  maxRetries: 3
};

/**
 * Phase Executor class
 */
export class PhaseExecutor extends EventEmitter {
  private config: PhaseExecutorConfig;
  private taskQueue: TaskQueue;
  private agentBridge: AgentBridge;
  private messageBus: AgentMessageBus;
  private workspacePath: string;

  // Phase state tracking
  private currentPhase: PhaseState | null = null;
  private phaseHistory: Map<number, PhaseResult> = new Map();

  // Execution tracking
  private activeExecutions: Map<string, Promise<any>> = new Map();

  constructor(
    taskQueue: TaskQueue,
    agentBridge: AgentBridge,
    messageBus: AgentMessageBus,
    workspacePath: string,
    config?: Partial<PhaseExecutorConfig>
  ) {
    super();
    this.taskQueue = taskQueue;
    this.agentBridge = agentBridge;
    this.messageBus = messageBus;
    this.workspacePath = workspacePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a single phase
   */
  async executePhase(phase: PhaseDefinition): Promise<PhaseResult> {
    const startTime = Date.now();

    console.log(`\n[PhaseExecutor] ========================================`);
    console.log(`[PhaseExecutor] PHASE ${phase.phaseNumber}: ${phase.name}`);
    console.log(`[PhaseExecutor] ========================================`);
    console.log(`[PhaseExecutor] Tasks: ${phase.tasks.length}`);

    // Initialize phase state
    this.currentPhase = {
      phaseNumber: phase.phaseNumber,
      name: phase.name,
      status: 'running',
      startedAt: new Date(),
      tasksCompleted: 0,
      totalTasks: phase.tasks.length,
      errors: []
    };

    // Publish phase started event
    await this.publishPhaseEvent('phase.started', {
      phaseNumber: phase.phaseNumber,
      name: phase.name,
      totalTasks: phase.tasks.length
    });

    let errors: string[] = [];
    let tasksCompleted = 0;

    try {
      // Check dependencies
      if (phase.dependencies && phase.dependencies.length > 0) {
        const depsMet = await this.checkDependencies(phase.dependencies);
        if (!depsMet) {
          throw new Error(`Dependencies not met for phase ${phase.phaseNumber}`);
        }
      }

      // Add all tasks to the queue
      const taskIds = await this.queueTasks(phase);

      // Execute tasks
      const executionResults = await this.executeTasks(taskIds);

      // Process results
      for (const result of executionResults) {
        if (result.success) {
          tasksCompleted++;
        } else {
          errors.push(`Task ${result.taskId} failed: ${result.error}`);
        }
      }

      // Update phase state
      this.currentPhase.status = errors.length === 0 ? 'completed' : 'failed';
      this.currentPhase.tasksCompleted = tasksCompleted;
      this.currentPhase.completedAt = new Date();
      this.currentPhase.errors = errors;

      const duration = Date.now() - startTime;

      // Store result in history
      const result: PhaseResult = {
        phaseNumber: phase.phaseNumber,
        name: phase.name,
        success: errors.length === 0,
        duration,
        tasksCompleted,
        totalTasks: phase.tasks.length,
        errors,
        metadata: this.currentPhase.metadata
      };

      this.phaseHistory.set(phase.phaseNumber, result);

      // Publish phase completed event
      await this.publishPhaseEvent('phase.completed', {
        phaseNumber: phase.phaseNumber,
        name: phase.name,
        success: result.success,
        duration,
        tasksCompleted,
        totalTasks: phase.tasks.length,
        errors
      });

      console.log(`[PhaseExecutor] ✅ Phase ${phase.phaseNumber} completed`);
      console.log(`[PhaseExecutor]    Tasks: ${tasksCompleted}/${phase.tasks.length}`);
      console.log(`[PhaseExecutor]    Duration: ${(duration / 1000).toFixed(1)}s`);

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);

      this.currentPhase.status = 'failed';
      this.currentPhase.completedAt = new Date();
      this.currentPhase.errors = errors;

      const duration = Date.now() - startTime;

      const result: PhaseResult = {
        phaseNumber: phase.phaseNumber,
        name: phase.name,
        success: false,
        duration,
        tasksCompleted,
        totalTasks: phase.tasks.length,
        errors
      };

      this.phaseHistory.set(phase.phaseNumber, result);

      // Publish phase failed event
      await this.publishPhaseEvent('phase.failed', {
        phaseNumber: phase.phaseNumber,
        name: phase.name,
        error: errorMsg,
        duration
      });

      console.error(`[PhaseExecutor] ❌ Phase ${phase.phaseNumber} failed: ${errorMsg}`);

      return result;
    }
  }

  /**
   * Queue all tasks for a phase
   */
  private async queueTasks(phase: PhaseDefinition): Promise<string[]> {
    const taskIds: string[] = [];

    for (const task of phase.tasks) {
      const taskId = await this.taskQueue.addTask({
        title: task.title,
        description: task.description,
        priority: this.mapPriority(task.priority),
        assignedAgent: task.agentType as any,
        tags: [phase.name, `phase-${phase.phaseNumber}`],
        ownedFiles: [],
        dependencies: [],
        estimatedCompletion: undefined,
        maxRetries: 3,
        metadata: {
          phaseNumber: phase.phaseNumber,
          estimatedHours: task.estimatedHours
        }
      });

      taskIds.push(taskId);
      console.log(`[PhaseExecutor]    → Task queued: ${task.title} (${taskId})`);
    }

    return taskIds;
  }

  /**
   * Execute queued tasks
   */
  private async executeTasks(taskIds: string[]): Promise<Array<{
    taskId: string;
    success: boolean;
    error?: string;
  }>> {
    const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

    if (this.config.enableParallelExecution) {
      // Execute tasks in parallel with concurrency limit
      const executionBatches: string[][] = [];
      for (let i = 0; i < taskIds.length; i += this.config.maxConcurrentTasks) {
        executionBatches.push(taskIds.slice(i, i + this.config.maxConcurrentTasks));
      }

      for (const batch of executionBatches) {
        const batchResults = await Promise.allSettled(
          batch.map(taskId => this.executeSingleTask(taskId))
        );

        for (let i = 0; i < batch.length; i++) {
          const result = batchResults[i];
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              taskId: batch[i],
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
          }
        }
      }
    } else {
      // Execute tasks sequentially
      for (const taskId of taskIds) {
        const result = await this.executeSingleTask(taskId);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Execute a single task
   */
  private async executeSingleTask(taskId: string): Promise<{
    taskId: string;
    success: boolean;
    error?: string;
  }> {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return { taskId, success: false, error: 'Task not found' };
    }

    console.log(`[PhaseExecutor]       Executing: ${task.title}`);

    // In production, this would use AgentBridge to spawn an actual agent
    // For now, we simulate the execution
    try {
      // Simulate task execution
      await this.simulateTaskExecution(task);

      // Mark task as completed
      await this.taskQueue.completeTask(taskId, {
        success: true,
        output: `Task completed: ${task.title}`
      });

      // Publish task completed event
      await this.publishPhaseEvent('task.completed', {
        taskId,
        title: task.title,
        phaseNumber: task.metadata?.phaseNumber as number
      });

      return { taskId, success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Handle retry logic
      if (this.config.retryFailedTasks && task.retryCount < this.config.maxRetries) {
        await this.taskQueue.failTask(taskId, errorMsg, true);
        return await this.executeSingleTask(taskId);
      }

      await this.taskQueue.failTask(taskId, errorMsg, false);

      return { taskId, success: false, error: errorMsg };
    }
  }

  /**
   * Simulate task execution (placeholder for actual agent spawning)
   */
  private async simulateTaskExecution(task: Task): Promise<void> {
    // In production, this would:
    // 1. Use AgentBridge to spawn the appropriate agent
    // 2. Execute the task with the agent
    // 3. Return the actual result

    // For now, simulate execution based on task type
    const estimatedDuration = (task.metadata?.estimatedHours as number || 1) * 1000;
    const simulatedDuration = Math.min(estimatedDuration, 500); // Cap at 500ms for simulation

    await new Promise(resolve => setTimeout(resolve, simulatedDuration));
  }

  /**
   * Check if phase dependencies are met
   */
  private async checkDependencies(dependencies: number[]): Promise<boolean> {
    for (const depPhase of dependencies) {
      const result = this.phaseHistory.get(depPhase);
      if (!result || !result.success) {
        console.warn(`[PhaseExecutor] Dependency not met: Phase ${depPhase}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Publish phase event to message bus
   */
  private async publishPhaseEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.messageBus.publish(
        'phase-executor',
        `workflow.phase.${eventType}`,
        {
          type: eventType,
          payload: {
            ...payload,
            workspacePath: this.workspacePath,
            timestamp: new Date().toISOString()
          }
        }
      );
    } catch (error) {
      console.error(`[PhaseExecutor] Failed to publish event ${eventType}:`, error);
    }
  }

  /**
   * Map priority string to TaskPriority enum
   */
  private mapPriority(priority: string): number {
    const mapping: Record<string, number> = {
      'low': 1,
      'normal': 5,
      'high': 8,
      'critical': 10
    };
    return mapping[priority] || 5;
  }

  /**
   * Get current phase state
   */
  getCurrentPhase(): PhaseState | null {
    return this.currentPhase;
  }

  /**
   * Get phase history
   */
  getPhaseHistory(): Map<number, PhaseResult> {
    return new Map(this.phaseHistory);
  }

  /**
   * Get result for a specific phase
   */
  getPhaseResult(phaseNumber: number): PhaseResult | undefined {
    return this.phaseHistory.get(phaseNumber);
  }

  /**
   * Reset phase history (for testing)
   */
  reset(): void {
    this.phaseHistory.clear();
    this.currentPhase = null;
  }
}

/**
 * Factory function
 */
export function createPhaseExecutor(
  taskQueue: TaskQueue,
  agentBridge: AgentBridge,
  messageBus: AgentMessageBus,
  workspacePath: string,
  config?: Partial<PhaseExecutorConfig>
): PhaseExecutor {
  return new PhaseExecutor(taskQueue, agentBridge, messageBus, workspacePath, config);
}
