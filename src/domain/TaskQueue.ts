/**
 * Task Queue Management for UltraPilot Domain Agency
 *
 * Provides task queue management with the following states:
 * - intake: New tasks awaiting assignment
 * - in-progress: Tasks currently being worked on
 * - review: Tasks completed, awaiting review
 * - completed: Tasks approved and finished
 * - failed: Tasks that failed and need attention
 */

import { EventEmitter } from 'events';

/**
 * Task status enum
 */
export enum TaskStatus {
  INTAKE = 'intake',
  IN_PROGRESS = 'in-progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Task priority enum
 */
export enum TaskPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 8,
  CRITICAL = 10
}

/**
 * Agent type for task assignment
 */
export type AgentType =
  | 'team-lead'
  | 'team-implementer'
  | 'team-reviewer'
  | 'team-debugger'
  | 'executor'
  | 'executor-low'
  | 'executor-high'
  | 'analyst'
  | 'architect'
  | 'planner'
  | 'critic'
  | 'test-engineer'
  | 'verifier'
  | 'security-reviewer'
  | 'quality-reviewer'
  | 'code-reviewer'
  | 'debugger'
  | 'build-fixer'
  | 'designer'
  | 'writer';

/**
 * Task definition
 */
export interface Task {
  /** Unique task identifier */
  id: string;

  /** Task title */
  title: string;

  /** Detailed task description */
  description: string;

  /** Current task status */
  status: TaskStatus;

  /** Task priority */
  priority: TaskPriority;

  /** Agent type assigned to this task */
  assignedAgent?: AgentType;

  /** Agent ID currently working on this task */
  agentId?: string;

  /** Files owned by this task (for conflict detection) */
  ownedFiles?: string[];

  /** Task dependencies (task IDs that must complete first) */
  dependencies?: string[];

  /** Task tags for categorization */
  tags?: string[];

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** When the task was started */
  startedAt?: Date;

  /** When the task was completed */
  completedAt?: Date;

  /** Task result/output */
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  };

  /** Failure reason if task failed */
  failureReason?: string;

  /** Retry count */
  retryCount: number;

  /** Maximum retries allowed */
  maxRetries: number;

  /** Estimated completion time */
  estimatedCompletion?: Date;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total tasks across all queues */
  totalTasks: number;

  /** Tasks in intake */
  intake: number;

  /** Tasks in progress */
  inProgress: number;

  /** Tasks in review */
  review: number;

  /** Tasks completed */
  completed: number;

  /** Tasks failed */
  failed: number;

  /** Tasks by priority */
  byPriority: Partial<Record<TaskPriority, number>>;

  /** Tasks by agent type */
  byAgent: Partial<Record<AgentType, number>>;

  /** Average task completion time (ms) */
  avgCompletionTime: number;

  /** Tasks completed in last hour */
  completedLastHour: number;
}

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
  /** Maximum queue size for each status */
  maxQueueSize: number;

  /** Maximum concurrent tasks per agent */
  maxConcurrentPerAgent: number;

  /** Task timeout in milliseconds */
  taskTimeout: number;

  /** Auto-fail stuck tasks */
  autoFailStuckTasks: boolean;

  /** Stuck task threshold (ms) */
  stuckTaskThreshold: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TaskQueueConfig = {
  maxQueueSize: 1000,
  maxConcurrentPerAgent: 5,
  taskTimeout: 3600000, // 1 hour
  autoFailStuckTasks: true,
  stuckTaskThreshold: 7200000 // 2 hours
};

/**
 * Task Queue Manager
 */
export class TaskQueue extends EventEmitter {
  private config: TaskQueueConfig;
  private queues: Map<TaskStatus, Map<string, Task>> = new Map();
  private tasks: Map<string, Task> = new Map();
  private isRunning: boolean = false;
  private stuckTaskTimer?: NodeJS.Timeout;

  constructor(config?: Partial<TaskQueueConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  private initializeQueues(): void {
    this.queues.set(TaskStatus.INTAKE, new Map());
    this.queues.set(TaskStatus.IN_PROGRESS, new Map());
    this.queues.set(TaskStatus.REVIEW, new Map());
    this.queues.set(TaskStatus.COMPLETED, new Map());
    this.queues.set(TaskStatus.FAILED, new Map());
  }

  /**
   * Start the task queue
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start stuck task checker if enabled
    if (this.config.autoFailStuckTasks) {
      this.stuckTaskTimer = setInterval(() => {
        this.checkStuckTasks();
      }, 60000); // Check every minute
    }

    this.emit('queue:started');
  }

  /**
   * Stop the task queue
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.stuckTaskTimer) {
      clearInterval(this.stuckTaskTimer);
      this.stuckTaskTimer = undefined;
    }

    this.emit('queue:stopped');
  }

  /**
   * Add a task to the intake queue
   */
  async addTask(task: Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'retryCount'>): Promise<string> {
    const taskId = this.generateTaskId();

    const newTask: Task = {
      id: taskId,
      ...task,
      status: TaskStatus.INTAKE,
      createdAt: new Date(),
      updatedAt: new Date(),
      retryCount: 0,
      maxRetries: task.maxRetries ?? 3
    };

    // Check queue size
    const intakeQueue = this.queues.get(TaskStatus.INTAKE)!;
    if (intakeQueue.size >= this.config.maxQueueSize) {
      throw new Error('Intake queue is full');
    }

    // Add to queue and task map
    intakeQueue.set(taskId, newTask);
    this.tasks.set(taskId, newTask);

    this.emit('task:added', newTask);
    this.emit('task:intaked', newTask);

    return taskId;
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(taskId: string, agentType: AgentType, agentId?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TaskStatus.INTAKE) {
      throw new Error(`Task ${taskId} is not in intake queue`);
    }

    // Check agent concurrency
    if (agentId) {
      const concurrentCount = this.getAgentConcurrentTasks(agentId);
      if (concurrentCount >= this.config.maxConcurrentPerAgent) {
        throw new Error(`Agent ${agentId} has too many concurrent tasks`);
      }
    }

    // Move task to in-progress
    this.moveTask(taskId, TaskStatus.IN_PROGRESS);

    // Update task
    task.assignedAgent = agentType;
    task.agentId = agentId;
    task.startedAt = new Date();
    task.updatedAt = new Date();

    this.emit('task:assigned', task, agentType, agentId);
  }

  /**
   * Update task progress
   */
  async updateTask(taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'ownedFiles' | 'estimatedCompletion' | 'metadata'>>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    Object.assign(task, updates);
    task.updatedAt = new Date();

    this.emit('task:updated', task);
  }

  /**
   * Complete a task and move to review
   */
  async completeTask(taskId: string, result: Task['result']): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new Error(`Task ${taskId} is not in progress`);
    }

    // Move to review
    this.moveTask(taskId, TaskStatus.REVIEW);

    // Update task
    task.result = result;
    task.updatedAt = new Date();

    this.emit('task:completed', task);
  }

  /**
   * Approve a task in review
   */
  async approveTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TaskStatus.REVIEW) {
      throw new Error(`Task ${taskId} is not in review`);
    }

    // Move to completed
    this.moveTask(taskId, TaskStatus.COMPLETED);

    // Update task
    task.completedAt = new Date();
    task.updatedAt = new Date();

    this.emit('task:approved', task);
  }

  /**
   * Reject a task in review (return to in-progress)
   */
  async rejectTask(taskId: string, reason: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TaskStatus.REVIEW) {
      throw new Error(`Task ${taskId} is not in review`);
    }

    // Move back to in-progress
    this.moveTask(taskId, TaskStatus.IN_PROGRESS);

    // Update task
    task.result = undefined;
    task.updatedAt = new Date();
    task.failureReason = reason;

    this.emit('task:rejected', task, reason);
  }

  /**
   * Fail a task
   */
  async failTask(taskId: string, error: string, retry: boolean = true): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.retryCount++;
    task.failureReason = error;
    task.updatedAt = new Date();

    if (retry && task.retryCount < task.maxRetries) {
      // Move back to intake for retry
      this.moveTask(taskId, TaskStatus.INTAKE);
      this.emit('task:retry', task);
    } else {
      // Move to failed
      this.moveTask(taskId, TaskStatus.FAILED);
      this.emit('task:failed', task);
    }
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    const queue = this.queues.get(status);
    return queue ? Array.from(queue.values()) : [];
  }

  /**
   * Get tasks by agent
   */
  getTasksByAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.agentId === agentId);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get next task from intake queue (for agent assignment)
   */
  getNextTask(agentType?: AgentType): Task | undefined {
    const intakeQueue = this.queues.get(TaskStatus.INTAKE)!;
    const tasks = Array.from(intakeQueue.values());

    // Filter by agent type if specified
    let filteredTasks = tasks;
    if (agentType) {
      filteredTasks = tasks.filter(task => !task.assignedAgent || task.assignedAgent === agentType);
    }

    // Sort by priority (highest first) and then by creation time
    filteredTasks.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return filteredTasks[0];
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const stats: QueueStats = {
      totalTasks: this.tasks.size,
      intake: this.queues.get(TaskStatus.INTAKE)!.size,
      inProgress: this.queues.get(TaskStatus.IN_PROGRESS)!.size,
      review: this.queues.get(TaskStatus.REVIEW)!.size,
      completed: this.queues.get(TaskStatus.COMPLETED)!.size,
      failed: this.queues.get(TaskStatus.FAILED)!.size,
      byPriority: {},
      byAgent: {},
      avgCompletionTime: 0,
      completedLastHour: 0
    };

    // Calculate byPriority, byAgent, and avgCompletionTime
    let totalCompletionTime = 0;
    let completedCount = 0;
    const oneHourAgo = new Date(Date.now() - 3600000);

    for (const task of Array.from(this.tasks.values())) {
      // By priority
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;

      // By agent
      if (task.assignedAgent) {
        stats.byAgent[task.assignedAgent] = (stats.byAgent[task.assignedAgent] || 0) + 1;
      }

      // Completion time
      if (task.status === TaskStatus.COMPLETED && task.startedAt && task.completedAt) {
        const completionTime = task.completedAt.getTime() - task.startedAt.getTime();
        totalCompletionTime += completionTime;
        completedCount++;

        // Completed in last hour
        if (task.completedAt >= oneHourAgo) {
          stats.completedLastHour++;
        }
      }
    }

    stats.avgCompletionTime = completedCount > 0 ? totalCompletionTime / completedCount : 0;

    return stats;
  }

  /**
   * Move a task between queues
   */
  private moveTask(taskId: string, newStatus: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Remove from current queue
    const currentQueue = this.queues.get(task.status);
    if (currentQueue) {
      currentQueue.delete(taskId);
    }

    // Add to new queue
    const newQueue = this.queues.get(newStatus);
    if (newQueue) {
      newQueue.set(taskId, task);
    }

    // Update task status
    task.status = newStatus;
  }

  /**
   * Get concurrent tasks for an agent
   */
  private getAgentConcurrentTasks(agentId: string): number {
    return Array.from(this.tasks.values()).filter(
      task => task.agentId === agentId && task.status === TaskStatus.IN_PROGRESS
    ).length;
  }

  /**
   * Check for stuck tasks and fail them
   */
  private checkStuckTasks(): void {
    if (!this.isRunning) {
      return;
    }

    const now = Date.now();
    const inProgressQueue = this.queues.get(TaskStatus.IN_PROGRESS)!;

    for (const [taskId, task] of Array.from(inProgressQueue.entries())) {
      if (task.startedAt && (now - task.startedAt.getTime() > this.config.stuckTaskThreshold)) {
        this.failTask(taskId, 'Task timed out', false).catch(error => {
          console.error(`Error failing stuck task ${taskId}:`, error);
        });
      }
    }
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all tasks (for testing/reset)
   */
  clear(): void {
    this.tasks.clear();
    this.initializeQueues();
    this.emit('queue:cleared');
  }
}
