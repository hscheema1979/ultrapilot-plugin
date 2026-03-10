/**
 * wshobson Agent Integration - Recovery State and Checkpointing
 *
 * Implements checkpoint system for crash recovery and delegation resumption.
 * Part of Phase 5: Robustness & Performance.
 */

import { EventEmitter } from 'events';
import { TraceContext, DelegationResult } from './types';
import { getMonitor } from './monitor';
import { createHash } from 'crypto';

/**
 * Delegation checkpoint state
 */
export interface DelegationCheckpoint {
  checkpointId: string;
  traceId: string;
  agent: string;
  task: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime: number;
  updateTime: number;
  partialResult?: any;
  error?: string;
  retryCount: number;
  ownership: {
    ownedPaths: string[];
    readOnlyPaths: string[];
  };
  metadata: Record<string, any>;
}

/**
 * Recovery state structure
 */
export interface RecoveryState {
  version: string;
  lastCheckpoint: number;
  activeDelegations: DelegationCheckpoint[];
  completedDelegations: DelegationCheckpoint[];
  systemMetadata: {
    startTime: number;
    crashCount: number;
    lastCrashTime?: number;
  };
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  /** Enable recovery system */
  enabled?: boolean;
  /** Path to recovery state file */
  recoveryPath?: string;
  /** Checkpoint interval in ms */
  checkpointInterval?: number;
  /** Maximum checkpoints to keep */
  maxCheckpoints?: number;
  /** Enable automatic recovery on startup */
  autoRecover?: boolean;
}

/**
 * Recovery state manager
 */
export class RecoveryManager extends EventEmitter {
  private state: RecoveryState;
  private config: Required<RecoveryConfig>;
  private monitor = getMonitor();
  private checkpointInterval?: NodeJS.Timeout;
  private activeDelegations = new Map<string, DelegationCheckpoint>();

  constructor(config: RecoveryConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      recoveryPath: config.recoveryPath ?? '.ultra/recovery-state.json',
      checkpointInterval: config.checkpointInterval ?? 30000, // 30 seconds
      maxCheckpoints: config.maxCheckpoints ?? 100,
      autoRecover: config.autoRecover ?? true,
    };

    this.state = this.createInitialState();

    // Load existing state
    this.loadState();

    // Start checkpoint timer
    if (this.config.enabled) {
      this.startCheckpointTimer();
    }

    // Auto-recover on startup if enabled
    if (this.config.autoRecover) {
      this.autoRecover();
    }
  }

  /**
   * Create initial recovery state
   */
  private createInitialState(): RecoveryState {
    return {
      version: '1.0.0',
      lastCheckpoint: Date.now(),
      activeDelegations: [],
      completedDelegations: [],
      systemMetadata: {
        startTime: Date.now(),
        crashCount: 0,
      },
    };
  }

  /**
   * Start a delegation with checkpointing
   */
  async startDelegation(
    traceId: string,
    agent: string,
    task: string,
    ownership: { ownedPaths: string[]; readOnlyPaths: string[] },
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.config.enabled) {
      return traceId;
    }

    const checkpoint: DelegationCheckpoint = {
      checkpointId: this.generateCheckpointId(traceId, agent),
      traceId,
      agent,
      task,
      status: 'pending',
      startTime: Date.now(),
      updateTime: Date.now(),
      retryCount: 0,
      ownership,
      metadata: metadata || {},
    };

    this.activeDelegations.set(checkpoint.checkpointId, checkpoint);
    this.state.activeDelegations.push(checkpoint);

    this.monitor.log({
      level: 'info',
      message: `Started delegation with checkpointing`,
      metadata: {
        checkpointId: checkpoint.checkpointId,
        agent,
        traceId,
      },
    });

    this.emit('delegationStarted', checkpoint);

    return checkpoint.checkpointId;
  }

  /**
   * Update delegation progress
   */
  async updateProgress(
    checkpointId: string,
    progress: {
      status: DelegationCheckpoint['status'];
      partialResult?: any;
      error?: string;
    }
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const checkpoint = this.activeDelegations.get(checkpointId);
    if (!checkpoint) {
      this.monitor.log({
        level: 'warn',
        message: `Checkpoint not found: ${checkpointId}`,
      });
      return;
    }

    checkpoint.status = progress.status;
    checkpoint.updateTime = Date.now();

    if (progress.partialResult !== undefined) {
      checkpoint.partialResult = progress.partialResult;
    }

    if (progress.error) {
      checkpoint.error = progress.error;
    }

    this.monitor.log({
      level: 'debug',
      message: `Updated delegation progress`,
      metadata: {
        checkpointId,
        status: progress.status,
      },
    });

    this.emit('progressUpdated', checkpoint);
  }

  /**
   * Complete a delegation
   */
  async completeDelegation(
    checkpointId: string,
    result: DelegationResult
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const checkpoint = this.activeDelegations.get(checkpointId);
    if (!checkpoint) {
      return;
    }

    checkpoint.status = result.success ? 'completed' : 'failed';
    checkpoint.updateTime = Date.now();
    checkpoint.partialResult = result.result;
    checkpoint.error = result.error?.message;

    // Move from active to completed
    this.state.activeDelegations = this.state.activeDelegations.filter(
      (c) => c.checkpointId !== checkpointId
    );
    this.state.completedDelegations.push(checkpoint);

    this.activeDelegations.delete(checkpointId);

    this.monitor.log({
      level: 'info',
      message: `Delegation ${result.success ? 'completed' : 'failed'}`,
      metadata: {
        checkpointId,
        success: result.success,
        duration: result.duration,
      },
    });

    this.emit('delegationCompleted', checkpoint);

    // Cleanup old completed delegations
    this.cleanupOldCheckpoints();
  }

  /**
   * Resume incomplete delegations
   */
  async resumeIncomplete(): Promise<DelegationCheckpoint[]> {
    if (!this.config.enabled) {
      return [];
    }

    const incomplete = this.state.activeDelegations.filter(
      (c) => c.status === 'pending' || c.status === 'in-progress'
    );

    this.monitor.log({
      level: 'info',
      message: `Found ${incomplete.length} incomplete delegations to resume`,
      metadata: { count: incomplete.length },
    });

    // Restore to active map
    for (const checkpoint of incomplete) {
      this.activeDelegations.set(checkpoint.checkpointId, checkpoint);
    }

    this.emit('resuming', incomplete);

    return incomplete;
  }

  /**
   * Auto-recover from crash
   */
  private async autoRecover(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCheckpoint = now - this.state.lastCheckpoint;

    // If it's been more than 2x checkpoint interval, assume crash
    if (timeSinceLastCheckpoint > this.config.checkpointInterval * 2) {
      this.state.systemMetadata.crashCount++;
      this.state.systemMetadata.lastCrashTime = now;

      this.monitor.log({
        level: 'warn',
        message: 'Crash detected, initiating recovery',
        metadata: {
          timeSinceLastCheckpoint,
          crashCount: this.state.systemMetadata.crashCount,
        },
      });

      this.emit('crashDetected', {
        timeSinceLastCheckpoint,
        crashCount: this.state.systemMetadata.crashCount,
      });

      // Resume incomplete delegations
      await this.resumeIncomplete();
    } else {
      this.monitor.log({
        level: 'info',
        message: 'Clean shutdown detected',
        metadata: {
          timeSinceLastCheckpoint,
        },
      });
    }
  }

  /**
   * Start checkpoint timer
   */
  private startCheckpointTimer(): void {
    this.checkpointInterval = setInterval(async () => {
      await this.checkpoint();
    }, this.config.checkpointInterval);

    this.monitor.log({
      level: 'info',
      message: 'Checkpoint timer started',
      metadata: {
        interval: this.config.checkpointInterval,
      },
    });
  }

  /**
   * Create checkpoint
   */
  private async checkpoint(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.state.lastCheckpoint = Date.now();

    // Sync active delegations from map
    this.state.activeDelegations = Array.from(this.activeDelegations.values());

    try {
      await this.saveState();

      this.monitor.log({
        level: 'debug',
        message: 'Checkpoint created',
        metadata: {
          activeDelegations: this.state.activeDelegations.length,
          completedDelegations: this.state.completedDelegations.length,
        },
      });

      this.emit('checkpoint', this.state);
    } catch (error) {
      this.monitor.log({
        level: 'error',
        message: 'Failed to create checkpoint',
        metadata: { error: (error as Error).message },
      });
    }
  }

  /**
   * Load state from disk
   */
  private async loadState(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(this.config.recoveryPath, 'utf-8');
      const loaded = JSON.parse(data) as RecoveryState;

      // Validate version
      if (loaded.version !== this.state.version) {
        this.monitor.log({
          level: 'warn',
          message: 'Recovery state version mismatch, creating new state',
          metadata: {
            loaded: loaded.version,
            current: this.state.version,
          },
        });
        return;
      }

      this.state = loaded;

      this.monitor.log({
        level: 'info',
        message: 'Recovery state loaded from disk',
        metadata: {
          activeDelegations: this.state.activeDelegations.length,
          completedDelegations: this.state.completedDelegations.length,
        },
      });
    } catch (error) {
      this.monitor.log({
        level: 'warn',
        message: 'Failed to load recovery state, will create new state',
        metadata: { error: (error as Error).message },
      });
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const data = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.config.recoveryPath, data, 'utf-8');
    } catch (error) {
      this.monitor.log({
        level: 'error',
        message: 'Failed to save recovery state',
        metadata: { error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Cleanup old checkpoints
   */
  private cleanupOldCheckpoints(): void {
    const maxCompleted = this.config.maxCheckpoints;

    if (this.state.completedDelegations.length > maxCompleted) {
      // Remove oldest completed checkpoints
      const toRemove = this.state.completedDelegations.length - maxCompleted;
      this.state.completedDelegations = this.state.completedDelegations.slice(toRemove);

      this.monitor.log({
        level: 'debug',
        message: `Cleaned up ${toRemove} old checkpoints`,
      });
    }
  }

  /**
   * Generate checkpoint ID
   */
  private generateCheckpointId(traceId: string, agent: string): string {
    const data = `${traceId}-${agent}-${Date.now()}`;
    return createHash('md5').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Get recovery statistics
   */
  getStats(): {
    activeDelegations: number;
    completedDelegations: number;
    crashCount: number;
    uptime: number;
  } {
    return {
      activeDelegations: this.state.activeDelegations.length,
      completedDelegations: this.state.completedDelegations.length,
      crashCount: this.state.systemMetadata.crashCount,
      uptime: Date.now() - this.state.systemMetadata.startTime,
    };
  }

  /**
   * Manual checkpoint
   */
  async checkpointNow(): Promise<void> {
    await this.checkpoint();
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }

    // Create final checkpoint
    await this.checkpoint();

    this.removeAllListeners();
  }
}

/**
 * Singleton recovery manager instance
 */
let recoveryManagerInstance: RecoveryManager | null = null;

/**
 * Get or create the recovery manager singleton
 */
export function getRecoveryManager(config?: RecoveryConfig): RecoveryManager {
  if (!recoveryManagerInstance) {
    recoveryManagerInstance = new RecoveryManager(config);
  }
  return recoveryManagerInstance;
}

/**
 * Reset the recovery manager singleton (for testing)
 */
export function resetRecoveryManager(): void {
  if (recoveryManagerInstance) {
    recoveryManagerInstance.destroy();
    recoveryManagerInstance = null;
  }
}
