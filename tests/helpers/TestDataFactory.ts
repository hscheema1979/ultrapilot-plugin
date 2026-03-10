import { randomUUID } from 'crypto';
import type { Task, WorkRequest, AgentState, QueueState } from '../../src/domain/types';

/**
 * TestDataFactory - Factory functions for generating test data
 *
 * Provides consistent test data generation with override support.
 * Reduces test boilerplate and improves maintainability.
 */
export class TestDataFactory {
  /**
   * Create a test task with optional overrides
   */
  static createTask(overrides?: Partial<Task>): Task {
    return {
      id: randomUUID(),
      description: 'Test task',
      priority: 'medium',
      status: 'pending',
      dependencies: [],
      fileOwnership: [],
      createdAt: new Date(),
      assignedAgent: null,
      ...overrides,
    };
  }

  /**
   * Create multiple test tasks
   */
  static createTasks(count: number, overrides?: Partial<Task>): Task[] {
    return Array.from({ length: count }, () => this.createTask(overrides));
  }

  /**
   * Create a test work request with tasks
   */
  static createWorkRequest(overrides?: Partial<WorkRequest>): WorkRequest {
    return {
      id: randomUUID(),
      title: 'Test Work Request',
      description: 'Test description for work request',
      tasks: [this.createTask(), this.createTask()],
      priority: 'medium',
      createdAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Create an agent state
   */
  static createAgentState(overrides?: Partial<AgentState>): AgentState {
    return {
      agentId: randomUUID(),
      status: 'idle',
      currentTask: null,
      tasksCompleted: 0,
      lastHeartbeat: new Date(),
      ...overrides,
    };
  }

  /**
   * Create a queue state
   */
  static createQueueState(taskCount: number = 10): QueueState {
    return {
      tasks: this.createTasks(taskCount),
      metadata: {
        version: 1,
        lastModified: Date.now(),
      },
    };
  }

  /**
   * Create a task with dependencies
   */
  static createTaskWithDependencies(dependencyCount: number): Task {
    const dependencies = this.createTasks(dependencyCount);
    return this.createTask({
      dependencies: dependencies.map(t => t.id),
    });
  }

  /**
   * Create a complex work request with dependencies
   */
  static createComplexWorkRequest(taskCount: number = 5): WorkRequest {
    const tasks = this.createTasks(taskCount);

    // Add dependencies to create a DAG
    tasks[1].dependencies = [tasks[0].id];
    tasks[2].dependencies = [tasks[0].id];
    tasks[3].dependencies = [tasks[1].id, tasks[2].id];
    tasks[4].dependencies = [tasks[3].id];

    return this.createWorkRequest({
      tasks,
      priority: 'high',
    });
  }
}
