/**
 * Agent Bridge - Connects UltraPilot agents to domain-agency framework
 *
 * This module provides the bridge between:
 * - UltraPilot team agents (team-lead, team-implementer, team-reviewer, team-debugger)
 * - Domain agency components (RoutineScheduler, ConflictResolver, TieredAutonomy)
 *
 * Maps UltraPilot agent operations to domain operations and handles coordination.
 */

import { EventEmitter } from 'events';
// Import types from domain-agency package (with inline types to avoid build errors)
// The domain-agency package is located at /home/ubuntu/hscheema1979/domain-agency
// These types are defined inline to avoid import resolution issues during build

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  status: ConflictStatus;
  parties: ConflictParty[];
  description: string;
  detectedAt: Date;
  updatedAt: Date;
  resolutionStrategy?: ResolutionStrategy;
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

export type ConflictType =
  | 'resource_contention'
  | 'goal_conflict'
  | 'deadlock'
  | 'priority_inversion'
  | 'access_denied'
  | 'resource_exhaustion'
  | 'timeout'
  | 'inconsistency'
  | 'custom';

export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ConflictStatus = 'detected' | 'resolving' | 'resolved' | 'failed' | 'escalated' | 'deferred';

export type ResolutionStrategy =
  | 'first_come_first_served'
  | 'priority_based'
  | 'queue'
  | 'merge'
  | 'split'
  | 'cancel_one'
  | 'cancel_both'
  | 'random'
  | 'escalate'
  | 'custom';

export interface ConflictParty {
  id: string;
  type: 'agent' | 'operation' | 'resource' | 'system';
  name: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

export interface Operation {
  id: string;
  name: string;
  description?: string;
  category: OperationCategory;
  riskLevel: RiskLevel;
  agentId: string;
  agentAutonomyLevel: AutonomyLevel;
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

export type OperationCategory =
  | 'read'
  | 'write'
  | 'delete'
  | 'admin'
  | 'financial'
  | 'security'
  | 'external'
  | 'data_access'
  | 'config'
  | 'deployment'
  | 'custom';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type AutonomyLevel = 'full' | 'partial' | 'restricted' | 'none';

import type { TaskQueue, Task, TaskStatus } from './TaskQueue.js';
import type { FileOwnershipManager, FileConflict } from './FileOwnership.js';

/**
 * UltraPilot agent types that map to domain operations
 */
export type UltraPilotAgentType =
  | 'team-lead'
  | 'team-implementer'
  | 'team-reviewer'
  | 'team-debugger'
  | 'executor'
  | 'analyst'
  | 'architect'
  | 'verifier';

/**
 * Agent capability profile
 */
export interface AgentCapability {
  /** Agent type */
  type: UltraPilotAgentType;

  /** Operations this agent can perform */
  operations: OperationCategory[];

  /** Maximum risk level this agent can handle autonomously */
  maxRiskLevel: RiskLevel;

  /** Default priority for this agent's tasks */
  defaultPriority: number;

  /** Whether this agent can review other agents' work */
  canReview: boolean;

  /** Whether this agent can debug issues */
  canDebug: boolean;
}

/**
 * Default agent capability profiles
 */
const AGENT_CAPABILITIES: Map<UltraPilotAgentType, AgentCapability> = new Map([
  ['team-lead', {
    type: 'team-lead',
    operations: ['admin', 'config', 'deployment'],
    maxRiskLevel: 'high',
    defaultPriority: 8,
    canReview: true,
    canDebug: false
  }],
  ['team-implementer', {
    type: 'team-implementer',
    operations: ['write', 'read', 'delete'],
    maxRiskLevel: 'medium',
    defaultPriority: 5,
    canReview: false,
    canDebug: false
  }],
  ['team-reviewer', {
    type: 'team-reviewer',
    operations: ['read', 'data_access'],
    maxRiskLevel: 'low',
    defaultPriority: 7,
    canReview: true,
    canDebug: false
  }],
  ['team-debugger', {
    type: 'team-debugger',
    operations: ['read', 'write', 'config'],
    maxRiskLevel: 'high',
    defaultPriority: 9,
    canReview: true,
    canDebug: true
  }],
  ['executor', {
    type: 'executor',
    operations: ['write', 'read'],
    maxRiskLevel: 'medium',
    defaultPriority: 5,
    canReview: false,
    canDebug: false
  }],
  ['analyst', {
    type: 'analyst',
    operations: ['read', 'data_access'],
    maxRiskLevel: 'low',
    defaultPriority: 3,
    canReview: false,
    canDebug: false
  }],
  ['architect', {
    type: 'architect',
    operations: ['admin', 'config', 'write'],
    maxRiskLevel: 'high',
    defaultPriority: 8,
    canReview: true,
    canDebug: false
  }],
  ['verifier', {
    type: 'verifier',
    operations: ['read', 'data_access', 'external'],
    maxRiskLevel: 'low',
    defaultPriority: 6,
    canReview: true,
    canDebug: false
  }]
]);

/**
 * Bridge configuration
 */
export interface AgentBridgeConfig {
  /** Enable automatic conflict detection */
  enableConflictDetection: boolean;

  /** Enable automatic conflict resolution */
  enableAutoResolution: boolean;

  /** Enable tiered autonomy checks */
  enableTieredAutonomy: boolean;

  /** Maximum concurrent operations per agent */
  maxConcurrentPerAgent: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AgentBridgeConfig = {
  enableConflictDetection: true,
  enableAutoResolution: true,
  enableTieredAutonomy: true,
  maxConcurrentPerAgent: 5
};

/**
 * Agent Bridge class
 */
export class AgentBridge extends EventEmitter {
  private config: AgentBridgeConfig;
  private taskQueue: TaskQueue;
  private fileOwnership: FileOwnershipManager;
  private isRunning: boolean = false;

  // Agent registries
  private activeAgents: Map<string, {
    type: UltraPilotAgentType;
    agentId: string;
    currentTasks: Set<string>;
  }> = new Map();

  constructor(
    taskQueue: TaskQueue,
    fileOwnership: FileOwnershipManager,
    config?: Partial<AgentBridgeConfig>
  ) {
    super();
    this.taskQueue = taskQueue;
    this.fileOwnership = fileOwnership;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the agent bridge
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Set up event listeners
    this.setupEventListeners();

    this.emit('bridge:started');
  }

  /**
   * Stop the agent bridge
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    this.emit('bridge:stopped');
  }

  /**
   * Register an agent
   */
  registerAgent(agentId: string, type: UltraPilotAgentType): void {
    this.activeAgents.set(agentId, {
      type,
      agentId,
      currentTasks: new Set()
    });

    this.emit('agent:registered', agentId, type);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.activeAgents.get(agentId);
    if (agent) {
      // Release all file ownership
      const ownedFiles = this.fileOwnership.getAgentOwnedFiles(agentId);
      for (const filePath of ownedFiles) {
        this.fileOwnership.releaseOwnership(filePath, agentId);
      }

      this.activeAgents.delete(agentId);
      this.emit('agent:unregistered', agentId);
    }
  }

  /**
   * Assign a task to an agent
   */
  async assignTaskToAgent(taskId: string, agentId: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Check agent concurrency
    if (agent.currentTasks.size >= this.config.maxConcurrentPerAgent) {
      throw new Error(`Agent ${agentId} has too many concurrent tasks`);
    }

    // Check if agent can handle this task type
    const capability = AGENT_CAPABILITIES.get(agent.type);
    if (!capability) {
      throw new Error(`Unknown agent type: ${agent.type}`);
    }

    // Acquire file ownership if task has files
    if (task.ownedFiles && task.ownedFiles.length > 0) {
      for (const filePath of task.ownedFiles) {
        const result = await this.fileOwnership.acquireOwnership(
          filePath,
          agentId,
          agent.type,
          taskId,
          { priority: task.priority }
        );

        if (!result.success) {
          // Release any acquired files
          for (const acquiredFile of task.ownedFiles) {
            if (acquiredFile === filePath) break;
            this.fileOwnership.releaseOwnership(acquiredFile, agentId);
          }

          if (result.conflict) {
            throw new Error(`File conflict detected for ${filePath}: ${result.conflict.description}`);
          }

          throw new Error(`Failed to acquire ownership of ${filePath}`);
        }
      }
    }

    // Assign task
    await this.taskQueue.assignTask(taskId, agent.type, agentId);
    agent.currentTasks.add(taskId);

    this.emit('agent:taskAssigned', agentId, taskId);
  }

  /**
   * Complete a task as an agent
   */
  async completeTask(agentId: string, taskId: string, result: Task['result']): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    if (!agent.currentTasks.has(taskId)) {
      throw new Error(`Agent ${agentId} is not working on task ${taskId}`);
    }

    // Complete the task
    await this.taskQueue.completeTask(taskId, result);

    // Release file ownership
    const task = this.taskQueue.getTask(taskId);
    if (task && task.ownedFiles) {
      for (const filePath of task.ownedFiles) {
        await this.fileOwnership.releaseOwnership(filePath, agentId);
      }
    }

    this.emit('agent:taskCompleted', agentId, taskId);
  }

  /**
   * Get agent capability profile
   */
  getAgentCapability(type: UltraPilotAgentType): AgentCapability | undefined {
    return AGENT_CAPABILITIES.get(type);
  }

  /**
   * Map a task to domain operation
   */
  taskToOperation(task: Task, agentType: UltraPilotAgentType): Operation {
    const capability = AGENT_CAPABILITIES.get(agentType);

    // Determine operation category based on task tags and description
    let category: OperationCategory = 'write';
    let riskLevel: RiskLevel = 'medium';

    if (task.tags) {
      if (task.tags.includes('read')) {
        category = 'read';
        riskLevel = 'none';
      } else if (task.tags.includes('delete')) {
        category = 'delete';
        riskLevel = 'high';
      } else if (task.tags.includes('deploy')) {
        category = 'deployment';
        riskLevel = 'high';
      } else if (task.tags.includes('config')) {
        category = 'config';
        riskLevel = 'medium';
      } else if (task.tags.includes('security')) {
        category = 'security';
        riskLevel = 'critical';
      }
    }

    // Determine risk level based on priority
    if (task.priority >= 9) {
      riskLevel = 'critical';
    } else if (task.priority >= 7) {
      riskLevel = 'high';
    } else if (task.priority >= 5) {
      riskLevel = 'medium';
    } else if (task.priority >= 3) {
      riskLevel = 'low';
    }

    return {
      id: task.id,
      name: task.title,
      description: task.description,
      category,
      riskLevel,
      agentId: task.agentId || '',
      agentAutonomyLevel: capability?.maxRiskLevel === 'critical' ? 'full' :
                          capability?.maxRiskLevel === 'high' ? 'full' :
                          capability?.maxRiskLevel === 'medium' ? 'partial' : 'restricted',
      parameters: task.metadata,
      affectedResources: task.ownedFiles,
      requestedAt: task.createdAt,
      metadata: {
        taskId: task.id,
        taskTags: task.tags,
        agentType
      }
    };
  }

  /**
   * Map file conflict to domain conflict
   */
  fileConflictToDomainConflict(fileConflict: FileConflict): Conflict {
    const parties: ConflictParty[] = fileConflict.parties.map(p => ({
      id: p.agentId,
      type: 'agent' as const,
      name: `${p.agentType}:${p.agentId}`,
      priority: p.priority,
      metadata: {
        taskId: p.taskId,
        agentType: p.agentType
      }
    }));

    // Determine conflict type and severity
    let conflictType: ConflictType = 'resource_contention';
    let severity: ConflictSeverity = 'medium';

    const priorityDiff = Math.max(
      ...parties.map(p => p.priority)
    ) - Math.min(
      ...parties.map(p => p.priority)
    );

    if (priorityDiff === 0) {
      conflictType = 'resource_contention';
      severity = 'high';
    } else if (priorityDiff < 2) {
      conflictType = 'resource_contention';
      severity = 'medium';
    } else {
      conflictType = 'priority_inversion';
      severity = 'low';
    }

    return {
      id: fileConflict.id,
      type: conflictType,
      severity,
      status: 'detected',
      parties,
      description: fileConflict.description,
      detectedAt: fileConflict.detectedAt,
      updatedAt: fileConflict.detectedAt,
      resolutionAttempts: 0,
      maxResolutionAttempts: 3,
      metadata: {
        filePath: fileConflict.filePath,
        suggestedResolution: fileConflict.suggestedResolution
      }
    };
  }

  /**
   * Get active agents
   */
  getActiveAgents(): Array<{ agentId: string; type: UltraPilotAgentType; taskCount: number }> {
    return Array.from(this.activeAgents.values()).map(agent => ({
      agentId: agent.agentId,
      type: agent.type,
      taskCount: agent.currentTasks.size
    }));
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): { type: UltraPilotAgentType; agentId: string; currentTasks: Set<string> } | undefined {
    return this.activeAgents.get(agentId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    byAgentType: Partial<Record<UltraPilotAgentType, number>>;
  } {
    const byAgentType: Partial<Record<UltraPilotAgentType, number>> = {};

    for (const agent of Array.from(this.activeAgents.values())) {
      byAgentType[agent.type] = (byAgentType[agent.type] || 0) + 1;
    }

    return {
      totalAgents: this.activeAgents.size,
      activeAgents: Array.from(this.activeAgents.values()).filter(a => a.currentTasks.size > 0).length,
      totalTasks: Array.from(this.activeAgents.values()).reduce((sum, a) => sum + a.currentTasks.size, 0),
      byAgentType
    };
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for task events
    this.taskQueue.on('task:completed', (task: Task) => {
      const agent = Array.from(this.activeAgents.values()).find(a => a.currentTasks.has(task.id));
      if (agent) {
        agent.currentTasks.delete(task.id);
      }
    });

    this.taskQueue.on('task:failed', (task: Task) => {
      const agent = Array.from(this.activeAgents.values()).find(a => a.currentTasks.has(task.id));
      if (agent) {
        agent.currentTasks.delete(task.id);
      }
    });

    // Listen for file ownership events
    this.fileOwnership.on('ownership:transferred', (ownership, toAgentId) => {
      this.emit('bridge:fileTransferred', ownership.filePath, toAgentId);
    });

    this.fileOwnership.on('ownership:expired', (filePath: string) => {
      this.emit('bridge:fileExpired', filePath);
    });
  }
}

/**
 * Export agent capabilities for use by other modules
 */
export function getAgentCapabilities(): Map<UltraPilotAgentType, AgentCapability> {
  return new Map(AGENT_CAPABILITIES);
}

/**
 * Get capability for a specific agent type
 */
export function getCapability(agentType: UltraPilotAgentType): AgentCapability | undefined {
  return AGENT_CAPABILITIES.get(agentType);
}
