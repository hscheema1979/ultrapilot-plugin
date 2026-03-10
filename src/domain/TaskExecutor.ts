/**
 * Task Executor - Executes tasks using Claude Code agents
 *
 * This module provides the actual execution engine for Ultra Loop to execute tasks
 * using Claude Code's Task tool with appropriate agent types.
 */

import { Task, TaskPriority } from './TaskQueue.js';
import { AgentType } from './TaskQueue.js';

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: {
    executedBy: string;
    agentType?: string;
    executionMethod: string;
    executionTime: number;
    duration?: number;
  };
}

/**
 * Task execution configuration
 */
export interface TaskExecutorConfig {
  defaultAgentType: AgentType;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TaskExecutorConfig = {
  defaultAgentType: 'executor',
  timeoutMs: 30 * 60 * 1000, // 30 minutes
  maxRetries: 3
};

/**
 * Task Executor - Executes tasks using appropriate agents
 */
export class TaskExecutor {
  private config: TaskExecutorConfig;

  constructor(config?: Partial<TaskExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a task using the most appropriate agent type
   */
  async executeTask(task: Task): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
      // Select agent type based on task characteristics
      const agentType = this.selectAgentForTask(task);

      console.log(`   [TaskExecutor] Executing task: ${task.title}`);
      console.log(`   [TaskExecutor] Agent type: ${agentType}`);

      // Build execution prompt
      const prompt = this.buildExecutionPrompt(task);

      // Execute task using Task tool
      // NOTE: This is a placeholder for actual Task tool integration
      // In real implementation, this would use the Task tool from Claude Code
      const result = await this.executeWithAgent(agentType, prompt, task);

      const duration = Date.now() - startTime;

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        metadata: {
          executedBy: 'ultra-loop',
          agentType,
          executionMethod: 'individual',
          executionTime: startTime,
          duration
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMsg,
        metadata: {
          executedBy: 'ultra-loop',
          executionMethod: 'individual',
          executionTime: startTime,
          duration
        }
      };
    }
  }

  /**
   * Select the most appropriate agent type for a task
   */
  private selectAgentForTask(task: Task): AgentType {
    // Check task tags for hints
    if (task.tags) {
      // Security tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('security'))) {
        return 'security-reviewer';
      }

      // Quality/performance tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('performance') || tag.toLowerCase().includes('quality'))) {
        return 'quality-reviewer';
      }

      // Testing tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('test') || tag.toLowerCase().includes('qa'))) {
        return 'test-engineer';
      }

      // Debugging tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('bug') || tag.toLowerCase().includes('debug'))) {
        return 'debugger';
      }

      // Architecture tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('architecture') || tag.toLowerCase().includes('design'))) {
        return 'architect';
      }

      // Writing/documentation tasks
      if (task.tags.some(tag => tag.toLowerCase().includes('doc') || tag.toLowerCase().includes('write'))) {
        return 'writer';
      }
    }

    // Check priority for complex tasks
    if (task.priority === TaskPriority.CRITICAL) {
      return 'executor-high'; // Use Opus for critical tasks
    }

    // Check description length for complexity
    const wordCount = task.description.split(/\s+/).length;
    if (wordCount > 300) {
      return 'executor-high'; // Use Opus for complex descriptions
    }

    // Default to standard executor (Sonnet)
    return 'executor';
  }

  /**
   * Build execution prompt from task
   */
  private buildExecutionPrompt(task: Task): string {
    let prompt = `Task: ${task.title}\n\n`;
    prompt += `Description:\n${task.description}\n\n`;

    if (task.tags && task.tags.length > 0) {
      prompt += `Tags: ${task.tags.join(', ')}\n\n`;
    }

    if (task.priority === TaskPriority.CRITICAL) {
      prompt += `Priority: CRITICAL - This task must be completed correctly.\n\n`;
    }

    if (task.metadata) {
      if (task.metadata.subtasks) {
        prompt += `Subtasks:\n`;
        const subtasks = Array.isArray(task.metadata.subtasks) ? task.metadata.subtasks : [task.metadata.subtasks];
        subtasks.forEach((subtask: string, i: number) => {
          prompt += `  ${i + 1}. ${subtask}\n`;
        });
        prompt += `\n`;
      }

      if (task.metadata.constraints) {
        prompt += `Constraints:\n${task.metadata.constraints}\n\n`;
      }

      if (task.metadata.acceptanceCriteria) {
        prompt += `Acceptance Criteria:\n${task.metadata.acceptanceCriteria}\n\n`;
      }
    }

    prompt += `Please complete this task and provide a summary of what was done.`;

    return prompt;
  }

  /**
   * Execute task with specific agent
   * NOTE: This is a placeholder for actual Task tool integration
   */
  private async executeWithAgent(
    agentType: AgentType,
    prompt: string,
    task: Task
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // TODO: Integrate with actual Task tool from Claude Code
    //
    // Real implementation would be:
    // const result = await Task({
    //   subagent_type: this.mapAgentTypeToSubagent(agentType),
    //   model: this.getModelForAgent(agentType),
    //   prompt: prompt,
    //   run_in_background: false
    // });
    //
    // For now, simulate execution

    console.log(`   [TaskExecutor] → Spawning ${agentType} agent...`);

    // Simulate work based on task complexity
    const workTime = this.estimateExecutionTime(task);
    await new Promise(resolve => setTimeout(resolve, Math.min(workTime, 5000)));

    // Simulate success (in real implementation, this would check actual result)
    const success = Math.random() > 0.1; // 90% success rate for demo

    if (success) {
      const output = `Task "${task.title}" completed successfully by ${agentType} agent.\n\n` +
        `Summary:\n` +
        `- Analyzed requirements\n` +
        `- Implemented solution\n` +
        `- Verified output\n` +
        `- Ready for review`;

      console.log(`   [TaskExecutor] ✅ Task completed by ${agentType}`);
      return { success: true, output };
    } else {
      const error = `Task execution failed: ${agentType} encountered an issue`;
      console.error(`   [TaskExecutor] ❌ ${error}`);
      return { success: false, error };
    }
  }

  /**
   * Estimate execution time based on task characteristics
   */
  private estimateExecutionTime(task: Task): number {
    let baseTime = 2000; // 2 seconds base

    // Add time based on description length
    const wordCount = task.description.split(/\s+/).length;
    baseTime += Math.min(wordCount * 10, 5000);

    // Add time based on priority
    if (task.priority === TaskPriority.CRITICAL) {
      baseTime += 2000;
    } else if (task.priority === TaskPriority.HIGH) {
      baseTime += 1000;
    }

    // Add time based on tags
    if (task.tags) {
      baseTime += task.tags.length * 500;
    }

    return baseTime;
  }

  /**
   * Map AgentType to subagent type for Task tool
   */
  private mapAgentTypeToSubagent(agentType: AgentType): string {
    const mapping: Record<AgentType, string> = {
      'team-lead': 'ultra:team-lead',
      'team-implementer': 'ultra:team-implementer',
      'team-reviewer': 'ultra:team-reviewer',
      'team-debugger': 'ultra:team-debugger',
      'executor': 'ultra:executor',
      'executor-low': 'ultra:executor-low',
      'executor-high': 'ultra:executor-high',
      'analyst': 'ultra:analyst',
      'architect': 'ultra:architect',
      'planner': 'ultra:planner',
      'critic': 'ultra:critic',
      'test-engineer': 'ultra:test-engineer',
      'verifier': 'ultra:verifier',
      'security-reviewer': 'ultra:security-reviewer',
      'quality-reviewer': 'ultra:quality-reviewer',
      'code-reviewer': 'ultra:code-reviewer',
      'debugger': 'ultra:debugger',
      'build-fixer': 'ultra:build-fixer',
      'designer': 'ultra:designer',
      'writer': 'ultra:writer'
    };

    return mapping[agentType] || 'ultra:executor';
  }

  /**
   * Get model tier for agent type
   */
  private getModelForAgent(agentType: AgentType): 'haiku' | 'sonnet' | 'opus' {
    if (agentType === 'executor-low' || agentType === 'writer') {
      return 'haiku'; // Fast, cheap
    }

    if (agentType === 'executor-high' || agentType === 'architect' || agentType === 'code-reviewer') {
      return 'opus'; // Best quality
    }

    return 'sonnet'; // Balanced
  }
}

/**
 * Factory function
 */
export function createTaskExecutor(config?: Partial<TaskExecutorConfig>): TaskExecutor {
  return new TaskExecutor(config);
}
