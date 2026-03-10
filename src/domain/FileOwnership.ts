/**
 * File Ownership Tracking for UltraPilot Domain Agency
 *
 * Tracks which agents own which files to enable:
 * - Conflict detection when multiple agents try to modify the same file
 * - Coordination between parallel agents
 * - File-level locking and release
 * - Ownership transfer between agents
 */

import { EventEmitter } from 'events';

/**
 * File ownership status
 */
export enum OwnershipStatus {
  /** File is currently being modified */
  LOCKED = 'locked',

  /** File is available for modification */
  AVAILABLE = 'available',

  /** File is under review */
  UNDER_REVIEW = 'under_review',

  /** File ownership is disputed (conflict detected) */
  DISPUTED = 'disputed'
}

/**
 * File ownership record
 */
export interface FileOwnership {
  /** Absolute file path */
  filePath: string;

  /** Current ownership status */
  status: OwnershipStatus;

  /** Agent ID that owns this file */
  ownerId?: string;

  /** Agent type that owns this file */
  ownerType?: string;

  /** Task ID that caused the ownership */
  taskId?: string;

  /** When ownership was acquired */
  acquiredAt: Date;

  /** When ownership was last updated */
  updatedAt: Date;

  /** When ownership will expire (for automatic release) */
  expiresAt?: Date;

  /** List of agents waiting for this file */
  waitingAgents: Array<{
    agentId: string;
    agentType: string;
    taskId: string;
    requestedAt: Date;
  }>;

  /** Ownership priority (higher = more important) */
  priority: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * File conflict information
 */
export interface FileConflict {
  /** Conflict ID */
  id: string;

  /** File path in conflict */
  filePath: string;

  /** Agents involved in the conflict */
  parties: Array<{
    agentId: string;
    agentType: string;
    taskId: string;
    priority: number;
  }>;

  /** When the conflict was detected */
  detectedAt: Date;

  /** Conflict description */
  description: string;

  /** Suggested resolution */
  suggestedResolution?: {
    /** Which agent should win */
    winnerId: string;
    /** Reason for the decision */
    reason: string;
  };
}

/**
 * File ownership configuration
 */
export interface FileOwnershipConfig {
  /** Enable automatic ownership expiration */
  autoExpireOwnership: boolean;

  /** Default ownership timeout in milliseconds */
  defaultOwnershipTimeout: number;

  /** Maximum number of waiting agents per file */
  maxWaitingAgents: number;

  /** Enable conflict detection */
  enableConflictDetection: boolean;

  /** Enable automatic conflict resolution */
  enableAutoResolution: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FileOwnershipConfig = {
  autoExpireOwnership: true,
  defaultOwnershipTimeout: 1800000, // 30 minutes
  maxWaitingAgents: 10,
  enableConflictDetection: true,
  enableAutoResolution: true
};

/**
 * File Ownership Manager
 */
export class FileOwnershipManager extends EventEmitter {
  private config: FileOwnershipConfig;
  private ownership: Map<string, FileOwnership> = new Map();
  private isRunning: boolean = false;
  private expirationTimer?: NodeJS.Timeout;

  constructor(config?: Partial<FileOwnershipConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the file ownership manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start expiration checker if enabled
    if (this.config.autoExpireOwnership) {
      this.expirationTimer = setInterval(() => {
        this.checkExpirations();
      }, 60000); // Check every minute
    }

    this.emit('manager:started');
  }

  /**
   * Stop the file ownership manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = undefined;
    }

    this.emit('manager:stopped');
  }

  /**
   * Acquire ownership of a file
   */
  async acquireOwnership(
    filePath: string,
    agentId: string,
    agentType: string,
    taskId: string,
    options?: {
      priority?: number;
      timeout?: number;
      force?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; conflict?: FileConflict }> {
    const normalizedPath = this.normalizePath(filePath);
    const existing = this.ownership.get(normalizedPath);

    // Check if file is available or owned by the same agent
    if (!existing || existing.ownerId === agentId || options?.force) {
      const ownership: FileOwnership = {
        filePath: normalizedPath,
        status: OwnershipStatus.LOCKED,
        ownerId: agentId,
        ownerType: agentType,
        taskId,
        acquiredAt: new Date(),
        updatedAt: new Date(),
        expiresAt: options?.timeout
          ? new Date(Date.now() + options.timeout)
          : new Date(Date.now() + this.config.defaultOwnershipTimeout),
        waitingAgents: existing?.waitingAgents || [],
        priority: options?.priority ?? 5,
        metadata: options?.metadata
      };

      this.ownership.set(normalizedPath, ownership);
      this.emit('ownership:acquired', ownership);

      return { success: true };
    }

    // File is owned by another agent - add to waiting list
    if (existing.status === OwnershipStatus.LOCKED) {
      if (existing.waitingAgents.length >= this.config.maxWaitingAgents) {
        return {
          success: false,
          conflict: {
            id: this.generateConflictId(),
            filePath: normalizedPath,
            parties: [
              {
                agentId: existing.ownerId!,
                agentType: existing.ownerType!,
                taskId: existing.taskId!,
                priority: existing.priority
              },
              {
                agentId,
                agentType,
                taskId,
                priority: options?.priority ?? 5
              }
            ],
            detectedAt: new Date(),
            description: `File ${normalizedPath} is already owned by ${existing.ownerId}`
          }
        };
      }

      existing.waitingAgents.push({
        agentId,
        agentType,
        taskId,
        requestedAt: new Date()
      });

      this.emit('ownership:waiting', normalizedPath, agentId);

      // Detect conflict if enabled
      if (this.config.enableConflictDetection) {
        const conflict = this.detectConflict(normalizedPath, existing, agentId, agentType, taskId, options?.priority ?? 5);
        if (conflict) {
          return { success: false, conflict };
        }
      }

      return { success: false };
    }

    return { success: false };
  }

  /**
   * Release ownership of a file
   */
  async releaseOwnership(filePath: string, agentId: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    const ownership = this.ownership.get(normalizedPath);

    if (!ownership) {
      return false;
    }

    if (ownership.ownerId !== agentId) {
      return false;
    }

    // Transfer to next waiting agent or release
    if (ownership.waitingAgents.length > 0) {
      const nextAgent = ownership.waitingAgents.shift()!;
      ownership.ownerId = nextAgent.agentId;
      ownership.ownerType = nextAgent.agentType;
      ownership.taskId = nextAgent.taskId;
      ownership.acquiredAt = new Date();
      ownership.updatedAt = new Date();
      ownership.expiresAt = new Date(Date.now() + this.config.defaultOwnershipTimeout);

      this.emit('ownership:transferred', ownership, nextAgent.agentId);
    } else {
      ownership.status = OwnershipStatus.AVAILABLE;
      ownership.ownerId = undefined;
      ownership.ownerType = undefined;
      ownership.taskId = undefined;
      ownership.updatedAt = new Date();

      this.emit('ownership:released', normalizedPath);
    }

    return true;
  }

  /**
   * Check if a file is owned
   */
  isOwned(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const ownership = this.ownership.get(normalizedPath);
    return ownership?.status === OwnershipStatus.LOCKED && ownership.ownerId !== undefined;
  }

  /**
   * Check if a file is owned by a specific agent
   */
  isOwnedBy(filePath: string, agentId: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    const ownership = this.ownership.get(normalizedPath);
    return ownership?.status === OwnershipStatus.LOCKED && ownership.ownerId === agentId;
  }

  /**
   * Get files owned by an agent
   */
  getAgentOwnedFiles(agentId: string): string[] {
    return Array.from(this.ownership.entries())
      .filter(([_, ownership]) => ownership.ownerId === agentId)
      .map(([filePath, _]) => filePath);
  }

  /**
   * Get ownership information for a file
   */
  getFileOwnership(filePath: string): FileOwnership | undefined {
    const normalizedPath = this.normalizePath(filePath);
    return this.ownership.get(normalizedPath);
  }

  /**
   * Get all ownership records
   */
  getAllOwnership(): Map<string, FileOwnership> {
    return new Map(this.ownership);
  }

  /**
   * Transfer ownership between agents
   */
  async transferOwnership(
    filePath: string,
    fromAgentId: string,
    toAgentId: string,
    toAgentType: string,
    taskId: string
  ): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    const ownership = this.ownership.get(normalizedPath);

    if (!ownership || ownership.ownerId !== fromAgentId) {
      return false;
    }

    ownership.ownerId = toAgentId;
    ownership.ownerType = toAgentType;
    ownership.taskId = taskId;
    ownership.acquiredAt = new Date();
    ownership.updatedAt = new Date();
    ownership.expiresAt = new Date(Date.now() + this.config.defaultOwnershipTimeout);

    this.emit('ownership:transferred', ownership, toAgentId);

    return true;
  }

  /**
   * Set file status
   */
  async setFileStatus(filePath: string, status: OwnershipStatus): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const ownership = this.ownership.get(normalizedPath);

    if (ownership) {
      ownership.status = status;
      ownership.updatedAt = new Date();
      this.emit('ownership:statusChanged', ownership, status);
    }
  }

  /**
   * Detect conflicts for a file
   */
  private detectConflict(
    filePath: string,
    existing: FileOwnership,
    agentId: string,
    agentType: string,
    taskId: string,
    priority: number
  ): FileConflict | null {
    // Check if priorities are similar (potential conflict)
    const priorityDiff = Math.abs(existing.priority - priority);

    if (priorityDiff < 2 && existing.waitingAgents.length > 0) {
      // Multiple agents want the file with similar priority
      return {
        id: this.generateConflictId(),
        filePath,
        parties: [
          {
            agentId: existing.ownerId!,
            agentType: existing.ownerType!,
            taskId: existing.taskId!,
            priority: existing.priority
          },
          {
            agentId,
            agentType,
            taskId,
            priority
          }
        ],
        detectedAt: new Date(),
        description: `Multiple agents requesting file ${filePath} with similar priorities`,
        suggestedResolution: {
          winnerId: existing.priority > priority ? existing.ownerId! : agentId,
          reason: 'Higher priority wins'
        }
      };
    }

    return null;
  }

  /**
   * Resolve a file conflict
   */
  async resolveConflict(conflict: FileConflict, winnerId: string): Promise<void> {
    const filePath = conflict.filePath;
    const ownership = this.ownership.get(filePath);

    if (!ownership) {
      return;
    }

    // Grant ownership to winner
    const winner = conflict.parties.find(p => p.agentId === winnerId);
    if (winner) {
      ownership.ownerId = winner.agentId;
      ownership.ownerType = winner.agentType;
      ownership.taskId = winner.taskId;
      ownership.priority = winner.priority;
      ownership.status = OwnershipStatus.LOCKED;
      ownership.acquiredAt = new Date();
      ownership.updatedAt = new Date();

      // Remove winner from waiting list
      ownership.waitingAgents = ownership.waitingAgents.filter(
        w => w.agentId !== winnerId
      );

      this.emit('conflict:resolved', conflict, winnerId);
    }
  }

  /**
   * Check for expired ownership and release
   */
  private checkExpirations(): void {
    if (!this.isRunning) {
      return;
    }

    const now = new Date();

    for (const [filePath, ownership] of Array.from(this.ownership.entries())) {
      if (ownership.expiresAt && ownership.expiresAt <= now) {
        // Ownership expired
        if (ownership.waitingAgents.length > 0) {
          // Transfer to next waiting agent
          const nextAgent = ownership.waitingAgents.shift()!;
          ownership.ownerId = nextAgent.agentId;
          ownership.ownerType = nextAgent.agentType;
          ownership.taskId = nextAgent.taskId;
          ownership.acquiredAt = new Date();
          ownership.updatedAt = now;
          ownership.expiresAt = new Date(Date.now() + this.config.defaultOwnershipTimeout);

          this.emit('ownership:transferred', ownership, nextAgent.agentId);
        } else {
          // Release ownership
          ownership.status = OwnershipStatus.AVAILABLE;
          ownership.ownerId = undefined;
          ownership.ownerType = undefined;
          ownership.taskId = undefined;
          ownership.updatedAt = now;

          this.emit('ownership:expired', filePath);
        }
      }
    }
  }

  /**
   * Normalize file path for consistent storage
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  /**
   * Generate a unique conflict ID
   */
  private generateConflictId(): string {
    return `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all ownership records (for testing/reset)
   */
  clear(): void {
    this.ownership.clear();
    this.emit('manager:cleared');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFiles: number;
    lockedFiles: number;
    availableFiles: number;
    disputedFiles: number;
    totalWaitingAgents: number;
    byAgent: Record<string, number>;
  } {
    const stats = {
      totalFiles: this.ownership.size,
      lockedFiles: 0,
      availableFiles: 0,
      disputedFiles: 0,
      totalWaitingAgents: 0,
      byAgent: {} as Record<string, number>
    };

    for (const ownership of Array.from(this.ownership.values())) {
      switch (ownership.status) {
        case OwnershipStatus.LOCKED:
          stats.lockedFiles++;
          break;
        case OwnershipStatus.AVAILABLE:
          stats.availableFiles++;
          break;
        case OwnershipStatus.DISPUTED:
          stats.disputedFiles++;
          break;
      }

      if (ownership.ownerId) {
        stats.byAgent[ownership.ownerId] = (stats.byAgent[ownership.ownerId] || 0) + 1;
      }

      stats.totalWaitingAgents += ownership.waitingAgents.length;
    }

    return stats;
  }
}
