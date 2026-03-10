/**
 * Domain Manager - Main integration point for UltraPilot domain-agency framework
 *
 * This class provides a unified interface to:
 * - TaskQueue: Manage task lifecycle across queues
 * - FileOwnership: Track file ownership and prevent conflicts
 * - AgentBridge: Coordinate UltraPilot agents with domain operations
 * - Integration with domain-agency package (RoutineScheduler, ConflictResolver, TieredAutonomy)
 */

import { EventEmitter } from 'events';
// Import types from domain-agency package (with inline types to avoid build errors)
// These types are defined inline to avoid import resolution issues during build

export interface DomainAgency {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
  getConflictResolver?(): { getStats(): ConflictStats };
}

export interface ConflictStats {
  totalDetected: number;
  totalResolved: number;
  activeConflicts: number;
}

export interface Conflict {
  id: string;
  type: string;
  severity: string;
  status: string;
  parties: Array<{
    id: string;
    type: string;
    name: string;
    priority: number;
    metadata?: Record<string, unknown>;
  }>;
  description: string;
  detectedAt: Date;
  updatedAt: Date;
  resolutionStrategy?: string;
  resolution?: {
    action: string;
    winnerId?: string;
    details: Record<string, unknown>;
  };
  resolutionAttempts: number;
  maxResolutionAttempts: number;
  escalatedTo?: 'COO' | 'CEO' | 'manual';
  escalationReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ConflictResolutionResult {
  success: boolean;
  action: string;
  winnerId?: string;
  loserIds?: string[];
  error?: string;
  shouldEscalate: boolean;
  metadata?: Record<string, unknown>;
}

export interface Operation {
  id: string;
  name: string;
  description?: string;
  category: string;
  riskLevel: string;
  agentId: string;
  agentAutonomyLevel: string;
  parameters?: Record<string, unknown>;
  affectedResources?: string[];
  impact?: {
    usersAffected?: number;
    executionTime?: number;
    cost?: number;
  };
  requestedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  operation: Operation;
  status: string;
  approver?: string;
  requester: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  denialReason?: string;
  comments?: string;
  conditions?: ApprovalCondition[];
  metadata?: Record<string, unknown>;
}

export interface ApprovalCondition {
  type: string;
  description: string;
  met: boolean;
  value?: unknown;
}

import { TaskQueue, Task, TaskStatus, TaskPriority } from './TaskQueue.js';
import { FileOwnershipManager, FileConflict, OwnershipStatus } from './FileOwnership.js';
import { AgentBridge, UltraPilotAgentType } from './AgentBridge.js';

/**
 * Domain manager configuration
 */
export interface DomainManagerConfig {
  /** Task queue configuration */
  taskQueue?: {
    maxQueueSize?: number;
    maxConcurrentPerAgent?: number;
    taskTimeout?: number;
    autoFailStuckTasks?: boolean;
    stuckTaskThreshold?: number;
  };

  /** File ownership configuration */
  fileOwnership?: {
    autoExpireOwnership?: boolean;
    defaultOwnershipTimeout?: number;
    maxWaitingAgents?: number;
    enableConflictDetection?: boolean;
    enableAutoResolution?: boolean;
  };

  /** Agent bridge configuration */
  agentBridge?: {
    enableConflictDetection?: boolean;
    enableAutoResolution?: boolean;
    enableTieredAutonomy?: boolean;
    maxConcurrentPerAgent?: number;
  };

  /** Domain agency integration */
  domainAgency?: {
    enabled?: boolean;
    packagePath?: string;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DomainManagerConfig = {
  taskQueue: {
    maxQueueSize: 1000,
    maxConcurrentPerAgent: 5,
    taskTimeout: 3600000,
    autoFailStuckTasks: true,
    stuckTaskThreshold: 7200000
  },
  fileOwnership: {
    autoExpireOwnership: true,
    defaultOwnershipTimeout: 1800000,
    maxWaitingAgents: 10,
    enableConflictDetection: true,
    enableAutoResolution: true
  },
  agentBridge: {
    enableConflictDetection: true,
    enableAutoResolution: true,
    enableTieredAutonomy: true,
    maxConcurrentPerAgent: 5
  },
  domainAgency: {
    enabled: false
  }
};

/**
 * Domain manager statistics
 */
export interface DomainManagerStats {
  /** Task queue statistics */
  tasks: {
    total: number;
    intake: number;
    inProgress: number;
    review: number;
    completed: number;
    failed: number;
  };

  /** File ownership statistics */
  files: {
    totalFiles: number;
    lockedFiles: number;
    availableFiles: number;
    disputedFiles: number;
  };

  /** Agent statistics */
  agents: {
    totalAgents: number;
    activeAgents: number;
    byType: Partial<Record<UltraPilotAgentType, number>>;
  };

  /** Conflict statistics */
  conflicts: {
    totalDetected: number;
    totalResolved: number;
    activeConflicts: number;
  };

  /** System health */
  health: {
    isRunning: boolean;
    uptime: number;
  };
}

/**
 * Domain Manager class
 */
export class DomainManager extends EventEmitter {
  private config: DomainManagerConfig;
  private taskQueue: TaskQueue;
  private fileOwnership: FileOwnershipManager;
  private agentBridge: AgentBridge;

  // Domain agency integration
  private domainAgency?: DomainAgency;
  private domainAgencyLoaded: boolean = false;

  // State
  private isRunning: boolean = false;
  private startTime?: Date;

  constructor(config?: DomainManagerConfig) {
    super();

    this.config = this.mergeConfig(config);

    // Initialize components
    this.taskQueue = new TaskQueue(this.config.taskQueue);
    this.fileOwnership = new FileOwnershipManager(this.config.fileOwnership);
    this.agentBridge = new AgentBridge(
      this.taskQueue,
      this.fileOwnership,
      this.config.agentBridge
    );

    this.setupEventForwarding();
  }

  /**
   * Start the domain manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.startTime = new Date();
    this.isRunning = true;

    // Start components
    await this.taskQueue.start();
    await this.fileOwnership.start();
    await this.agentBridge.start();

    // Load domain agency if enabled
    if (this.config.domainAgency?.enabled) {
      await this.loadDomainAgency();
    }

    this.emit('manager:started');
  }

  /**
   * Stop the domain manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop components
    await this.agentBridge.stop();
    await this.fileOwnership.stop();
    await this.taskQueue.stop();

    // Stop domain agency if loaded
    if (this.domainAgency) {
      await this.domainAgency.stop();
    }

    this.emit('manager:stopped');
  }

  /**
   * Get the task queue
   */
  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }

  /**
   * Get the file ownership manager
   */
  getFileOwnership(): FileOwnershipManager {
    return this.fileOwnership;
  }

  /**
   * Get the agent bridge
   */
  getAgentBridge(): AgentBridge {
    return this.agentBridge;
  }

  /**
   * Get domain agency instance (if loaded)
   */
  getDomainAgency(): DomainAgency | undefined {
    return this.domainAgency;
  }

  /**
   * Check if domain agency is loaded
   */
  isDomainAgencyLoaded(): boolean {
    return this.domainAgencyLoaded;
  }

  /**
   * Load domain agency package
   */
  private async loadDomainAgency(): Promise<void> {
    if (this.domainAgencyLoaded) {
      return;
    }

    try {
      // Try to load from the local domain-agency package
      const packagePath = this.config.domainAgency?.packagePath ||
        '/home/ubuntu/hscheema1979/domain-agency/src/domain-agency/index.ts';

      // Dynamic import (TypeScript ES modules)
      const agencyModule = await import(packagePath);
      const DomainAgencyClass = agencyModule.default || agencyModule.DomainAgency;

      if (DomainAgencyClass) {
        this.domainAgency = new DomainAgencyClass({
          enableLogging: true,
          logLevel: 'info',
          scheduler: { enabled: true },
          conflictResolver: { enabled: true },
          tieredAutonomy: { enabled: true }
        });

        await this.domainAgency!.start();
        this.domainAgencyLoaded = true;

        this.setupDomainAgencyEvents();
        this.emit('domainAgency:loaded');
      }
    } catch (error) {
      console.warn('Failed to load domain-agency package:', error);
      this.emit('domainAgency:loadFailed', error);
    }
  }

  /**
   * Create a new task
   */
  async createTask(
    title: string,
    description: string,
    options?: {
      priority?: TaskPriority;
      tags?: string[];
      dependencies?: string[];
      ownedFiles?: string[];
      assignedAgent?: UltraPilotAgentType;
      estimatedCompletion?: Date;
      metadata?: Record<string, unknown>;
      maxRetries?: number;
    }
  ): Promise<string> {
    const taskId = await this.taskQueue.addTask({
      title,
      description,
      priority: options?.priority ?? TaskPriority.NORMAL,
      tags: options?.tags,
      dependencies: options?.dependencies,
      ownedFiles: options?.ownedFiles,
      assignedAgent: options?.assignedAgent,
      estimatedCompletion: options?.estimatedCompletion,
      metadata: options?.metadata,
      maxRetries: options?.maxRetries ?? 3
    });

    this.emit('task:created', taskId);
    return taskId;
  }

  /**
   * Register an agent
   */
  registerAgent(agentId: string, type: UltraPilotAgentType): void {
    this.agentBridge.registerAgent(agentId, type);
    this.emit('agent:registered', agentId, type);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentBridge.unregisterAgent(agentId);
    this.emit('agent:unregistered', agentId);
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(taskId: string, agentId: string): Promise<void> {
    await this.agentBridge.assignTaskToAgent(taskId, agentId);
    this.emit('task:assigned', taskId, agentId);
  }

  /**
   * Complete a task
   */
  async completeTask(agentId: string, taskId: string, result: Task['result']): Promise<void> {
    await this.agentBridge.completeTask(agentId, taskId, result);
    this.emit('task:completed', taskId);
  }

  /**
   * Approve a task in review
   */
  async approveTask(taskId: string): Promise<void> {
    await this.taskQueue.approveTask(taskId);
    this.emit('task:approved', taskId);
  }

  /**
   * Reject a task in review
   */
  async rejectTask(taskId: string, reason: string): Promise<void> {
    await this.taskQueue.rejectTask(taskId, reason);
    this.emit('task:rejected', taskId, reason);
  }

  /**
   * Acquire file ownership
   */
  async acquireFileOwnership(
    filePath: string,
    agentId: string,
    agentType: string,
    taskId: string,
    options?: {
      priority?: number;
      timeout?: number;
      force?: boolean;
    }
  ): Promise<{ success: boolean; conflict?: FileConflict }> {
    return await this.fileOwnership.acquireOwnership(
      filePath,
      agentId,
      agentType,
      taskId,
      options
    );
  }

  /**
   * Release file ownership
   */
  async releaseFileOwnership(filePath: string, agentId: string): Promise<boolean> {
    const result = await this.fileOwnership.releaseOwnership(filePath, agentId);
    if (result) {
      this.emit('fileOwnership:released', filePath, agentId);
    }
    return result;
  }

  /**
   * Resolve a file conflict
   */
  async resolveFileConflict(conflict: FileConflict, winnerId: string): Promise<void> {
    await this.fileOwnership.resolveConflict(conflict, winnerId);
    this.emit('conflict:resolved', conflict, winnerId);
  }

  /**
   * Get next available task for an agent
   */
  getNextTask(agentType?: UltraPilotAgentType): Task | undefined {
    return this.taskQueue.getNextTask(agentType);
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): DomainManagerStats {
    const queueStats = this.taskQueue.getStats();
    const fileStats = this.fileOwnership.getStats();
    const agentStats = this.agentBridge.getStats();

    let conflictStats = {
      totalDetected: 0,
      totalResolved: 0,
      activeConflicts: 0
    };

    if (this.domainAgency) {
      const resolverStats = this.domainAgency.getConflictResolver?.()?.getStats();
      if (resolverStats) {
        conflictStats = {
          totalDetected: resolverStats.totalDetected,
          totalResolved: resolverStats.totalResolved,
          activeConflicts: resolverStats.activeConflicts
        };
      }
    }

    return {
      tasks: {
        total: queueStats.totalTasks,
        intake: queueStats.intake,
        inProgress: queueStats.inProgress,
        review: queueStats.review,
        completed: queueStats.completed,
        failed: queueStats.failed
      },
      files: {
        totalFiles: fileStats.totalFiles,
        lockedFiles: fileStats.lockedFiles,
        availableFiles: fileStats.availableFiles,
        disputedFiles: fileStats.disputedFiles
      },
      agents: {
        totalAgents: agentStats.totalAgents,
        activeAgents: agentStats.activeAgents,
        byType: agentStats.byAgentType
      },
      conflicts: conflictStats,
      health: {
        isRunning: this.isRunning,
        uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
      }
    };
  }

  /**
   * Set up event forwarding between components
   */
  private setupEventForwarding(): void {
    // Task queue events
    this.taskQueue.on('task:added', (task: Task) => this.emit('task:added', task));
    this.taskQueue.on('task:assigned', (task: Task, agentType: string, agentId: string) => {
      this.emit('task:assigned', task.id, agentId);
    });
    this.taskQueue.on('task:completed', (task: Task) => this.emit('task:completed', task.id));
    this.taskQueue.on('task:failed', (task: Task) => this.emit('task:failed', task.id));

    // File ownership events
    this.fileOwnership.on('ownership:acquired', (ownership) => {
      this.emit('fileOwnership:acquired', ownership.filePath, ownership.ownerId);
    });
    this.fileOwnership.on('ownership:released', (filePath: string) => {
      this.emit('fileOwnership:released', filePath);
    });

    // Agent bridge events
    this.agentBridge.on('agent:registered', (agentId: string, type: UltraPilotAgentType) => {
      this.emit('agent:registered', agentId, type);
    });
    this.agentBridge.on('agent:taskAssigned', (agentId: string, taskId: string) => {
      this.emit('agent:taskAssigned', agentId, taskId);
    });
  }

  /**
   * Set up domain agency event handlers
   */
  private setupDomainAgencyEvents(): void {
    if (!this.domainAgency) {
      return;
    }

    // Conflict events
    this.domainAgency.on('conflict:detected', (conflict: Conflict) => {
      this.emit('conflict:detected', conflict);
    });

    this.domainAgency.on('conflict:resolved', (conflict: Conflict, result: ConflictResolutionResult) => {
      this.emit('conflict:resolved', conflict, result);
    });

    this.domainAgency.on('conflict:escalated', (conflict: Conflict, level: string) => {
      this.emit('conflict:escalated', conflict, level);
    });

    // Approval events
    this.domainAgency.on('approval:requested', (request: ApprovalRequest) => {
      this.emit('approval:requested', request);
    });

    this.domainAgency.on('approval:granted', (request: ApprovalRequest) => {
      this.emit('approval:granted', request);
    });

    this.domainAgency.on('approval:denied', (request: ApprovalRequest) => {
      this.emit('approval:denied', request);
    });
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: DomainManagerConfig): DomainManagerConfig {
    return {
      taskQueue: { ...DEFAULT_CONFIG.taskQueue, ...config?.taskQueue },
      fileOwnership: { ...DEFAULT_CONFIG.fileOwnership, ...config?.fileOwnership },
      agentBridge: { ...DEFAULT_CONFIG.agentBridge, ...config?.agentBridge },
      domainAgency: { ...DEFAULT_CONFIG.domainAgency, ...config?.domainAgency }
    };
  }

  /**
   * Check if manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Clear all state (for testing/reset)
   */
  clear(): void {
    this.taskQueue.clear();
    this.fileOwnership.clear();
    this.emit('manager:cleared');
  }
}

/**
 * Factory function to create a domain manager
 */
export function createDomainManager(config?: DomainManagerConfig): DomainManager {
  return new DomainManager(config);
}
