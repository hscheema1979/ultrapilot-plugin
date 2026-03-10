/**
 * PlanWatcher - Atomic file watching for `.ultra/plan-final.md`
 *
 * Monitors plan file changes with race-condition-free atomic reading:
 * - Checks for `.tmp` file (write in progress)
 * - Reads with checksum validation
 * - Debounces changes (500ms after last write)
 * - Retries on corrupted reads (3 attempts)
 * - Parses and validates plan schema
 * - Triggers callback on valid plan changes
 *
 * "The boulder never stops." - Plan changes trigger immediate response
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import chokidar, { FSWatcher } from 'chokidar';

/**
 * Plan task status
 */
export enum PlanTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked'
}

/**
 * Plan task priority
 */
export enum PlanTaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Individual task in the plan
 */
export interface PlanTask {
  /** Task ID (e.g., "1.1", "2.3") */
  id: string;

  /** Task title */
  title: string;

  /** Detailed description */
  description?: string;

  /** Task status */
  status: PlanTaskStatus;

  /** Task priority */
  priority: PlanTaskPriority;

  /** File owner (agent ID) */
  fileOwner?: string;

  /** Estimated hours */
  estimatedHours?: number;

  /** Dependencies (task IDs) */
  dependencies?: string[];

  /** Files owned by this task */
  ownedFiles?: string[];

  /** Deliverables */
  deliverables?: string[];

  /** Commands to execute */
  commands?: string[];

  /** Success criteria */
  successCriteria?: string[];

  /** Phase ID */
  phaseId: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  /** Completion timestamp */
  completedAt?: string;

  /** Failure reason */
  failureReason?: string;
}

/**
 * Plan phase
 */
export interface PlanPhase {
  /** Phase ID (e.g., "1", "2") */
  id: string;

  /** Phase title */
  title: string;

  /** Phase description */
  description?: string;

  /** Week number (if applicable) */
  week?: number;

  /** Task IDs in this phase */
  tasks: string[];

  /** Phase status (derived from tasks) */
  status: PlanTaskStatus;

  /** Estimated hours for phase */
  estimatedHours?: number;

  /** Completion percentage */
  completionPercentage: number;
}

/**
 * Operational Plan schema
 */
export interface OperationalPlan {
  /** Plan title */
  title: string;

  /** Plan description/overview */
  overview: string;

  /** Plan version */
  version: string;

  /** Last modified timestamp */
  lastModified: string;

  /** Total estimated hours */
  estimatedHours: number;

  /** Phases in the plan */
  phases: PlanPhase[];

  /** All tasks (indexed by ID) */
  tasks: Record<string, PlanTask>;

  /** Plan status */
  status: PlanTaskStatus;

  /** Completion percentage */
  completionPercentage: number;

  /** Tags/categories */
  tags?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plan watcher configuration
 */
export interface PlanWatcherConfig {
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceDelay?: number;

  /** Maximum retry attempts for corrupted reads (default: 3) */
  maxRetries?: number;

  /** Retry delay in milliseconds (default: 100ms) */
  retryDelay?: number;

  /** Enable verbose logging (default: false) */
  verbose?: boolean;

  /** Temporary file suffix (default: '.tmp') */
  tmpSuffix?: string;

  /** Enable checksum validation (default: true) */
  enableChecksum?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<PlanWatcherConfig> = {
  debounceDelay: 500,
  maxRetries: 3,
  retryDelay: 100,
  verbose: false,
  tmpSuffix: '.tmp',
  enableChecksum: true
};

/**
 * Parse result with metadata
 */
export interface PlanParseResult {
  plan: OperationalPlan;
  checksum: string;
  parsedAt: string;
  parseDuration: number;
}

/**
 * Plan watcher events
 */
export interface PlanWatcherEvents {
  'plan:changed': (plan: OperationalPlan) => void;
  'plan:parse-error': (error: Error, content: string) => void;
  'plan:read-error': (error: Error) => void;
  'plan:corrupted': (attempts: number) => void;
}

/**
 * PlanWatcher class - Atomic file watching for plan changes
 */
export class PlanWatcher extends EventEmitter {
  private config: Required<PlanWatcherConfig>;
  private watcher?: FSWatcher;
  private planPath: string;
  private tmpPath: string;
  private debounceTimer?: NodeJS.Timeout;
  private currentPlan: OperationalPlan | null = null;
  private currentChecksum: string | null = null;
  private isWatching: boolean = false;
  private isReading: boolean = false;

  constructor(planPath: string, config?: PlanWatcherConfig) {
    super();

    this.planPath = path.resolve(planPath);
    this.tmpPath = `${this.planPath}${(config?.tmpSuffix ?? DEFAULT_CONFIG.tmpSuffix)}`;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.verbose) {
      console.log(`[PlanWatcher] Initialized for: ${this.planPath}`);
      console.log(`[PlanWatcher] Tmp file: ${this.tmpPath}`);
      console.log(`[PlanWatcher] Config:`, this.config);
    }
  }

  /**
   * Start watching the plan file
   */
  watch(onChange: (plan: OperationalPlan) => void): void {
    if (this.isWatching) {
      console.warn('[PlanWatcher] Already watching');
      return;
    }

    // Register change handler
    this.on('plan:changed', onChange);

    // Initialize watcher
    this.watcher = chokidar.watch(this.planPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    // Set up event handlers
    this.watcher.on('add', () => this.handleFileChange('add'));
    this.watcher.on('change', () => this.handleFileChange('change'));
    this.watcher.on('error', (error) => {
      console.error('[PlanWatcher] Watcher error:', error);
      this.emit('plan:read-error', error);
    });

    this.isWatching = true;

    if (this.config.verbose) {
      console.log(`[PlanWatcher] Started watching: ${this.planPath}`);
    }
  }

  /**
   * Stop watching the plan file
   */
  unwatch(): void {
    if (!this.isWatching) {
      return;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // Close watcher
    if (this.watcher) {
      this.watcher.close().catch(error => {
        console.error('[PlanWatcher] Error closing watcher:', error);
      });
      this.watcher = undefined;
    }

    // Remove all listeners
    this.removeAllListeners();

    this.isWatching = false;

    if (this.config.verbose) {
      console.log('[PlanWatcher] Stopped watching');
    }
  }

  /**
   * Handle file change event with debouncing
   */
  private handleFileChange(eventType: string): void {
    if (this.config.verbose) {
      console.log(`[PlanWatcher] File ${eventType}: ${this.planPath}`);
    }

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(async () => {
      await this.readAndParsePlan();
    }, this.config.debounceDelay);
  }

  /**
   * Read and parse plan with atomic reading and retry logic
   */
  private async readAndParsePlan(): Promise<void> {
    // Prevent concurrent reads
    if (this.isReading) {
      if (this.config.verbose) {
        console.log('[PlanWatcher] Read already in progress, skipping');
      }
      return;
    }

    this.isReading = true;

    try {
      // Attempt atomic read with retries
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          const result = await this.atomicReadPlan();

          // Validate checksum to detect actual changes
          if (this.currentChecksum === result.checksum) {
            if (this.config.verbose) {
              console.log('[PlanWatcher] Plan unchanged (checksum match)');
            }
            return;
          }

          // Parse plan
          const startTime = Date.now();
          const plan = this.parsePlanContent(result.content);

          // Emit change event
          this.currentPlan = plan;
          this.currentChecksum = result.checksum;

          if (this.config.verbose) {
            console.log(`[PlanWatcher] Plan changed:`);
            console.log(`  - Title: ${plan.title}`);
            console.log(`  - Version: ${plan.version}`);
            console.log(`  - Phases: ${plan.phases.length}`);
            console.log(`  - Tasks: ${Object.keys(plan.tasks).length}`);
            console.log(`  - Status: ${plan.status}`);
            console.log(`  - Completion: ${plan.completionPercentage}%`);
            console.log(`  - Parse time: ${Date.now() - startTime}ms`);
          }

          this.emit('plan:changed', plan);
          return;

        } catch (error) {
          lastError = error as Error;

          if (attempt < this.config.maxRetries) {
            if (this.config.verbose) {
              console.log(`[PlanWatcher] Read attempt ${attempt} failed, retrying...`);
            }
            this.emit('plan:corrupted', attempt);

            // Wait before retry (CORRECT implementation - v3.1 fix)
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
          } else {
            console.error(`[PlanWatcher] All ${this.config.maxRetries} read attempts failed`);

            if (lastError.message.includes('parse')) {
              this.emit('plan:parse-error', lastError, '');
            } else {
              this.emit('plan:read-error', lastError);
            }
          }
        }
      }
    } finally {
      this.isReading = false;
    }
  }

  /**
   * Atomic file read with write-in-progress detection
   */
  private async atomicReadPlan(): Promise<{ content: string; checksum: string }> {
    // Check for temporary file (write in progress)
    try {
      await fs.access(this.tmpPath);

      if (this.config.verbose) {
        console.log('[PlanWatcher] Temporary file detected, waiting...');
      }

      // Wait for writer to finish (max 5 seconds)
      const maxWait = 5000;
      const waited = await this.waitForTmpFile(maxWait);

      if (waited >= maxWait) {
        throw new Error('Temporary file persists after maximum wait time');
      }

      if (this.config.verbose) {
        console.log(`[PlanWatcher] Waited ${waited}ms for write to complete`);
      }
    } catch (error) {
      // Tmp file doesn't exist, which is expected
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Read file content
    const content = await fs.readFile(this.planPath, 'utf-8');

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Plan file is empty');
    }

    // Calculate checksum
    const checksum = this.calculateChecksum(content);

    return { content, checksum };
  }

  /**
   * Wait for temporary file to be removed
   */
  private async waitForTmpFile(maxWait: number): Promise<number> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        await fs.access(this.tmpPath);
        // File still exists, wait
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // File doesn't exist anymore
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return Date.now() - startTime;
        }
        throw error;
      }
    }

    return Date.now() - startTime;
  }

  /**
   * Calculate checksum for content
   */
  private calculateChecksum(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content, 'utf-8')
      .digest('hex');
  }

  /**
   * Parse plan content from markdown
   */
  private parsePlanContent(content: string): OperationalPlan {
    const lines = content.split('\n');
    const tasks: Record<string, PlanTask> = {};
    const phases: PlanPhase[] = [];
    let currentPhase: PlanPhase | null = null;
    let currentTask: Partial<PlanTask> | null = null;
    let inTaskBlock = false;
    let taskDescription: string[] = [];

    // Parse header
    let title = 'Untitled Plan';
    let overview = '';
    let version = '1.0.0';
    let lastModified = new Date().toISOString();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Parse title (first H1)
      if (line.startsWith('# ') && !title) {
        title = line.substring(2).trim();
        continue;
      }

      // Parse overview
      if (line.startsWith('## Overview')) {
        overview = this.extractSection(lines, i + 1);
        continue;
      }

      // Parse phase
      if (line.startsWith('## Phase ')) {
        // Save previous task
        if (currentTask && currentPhase) {
          const task = this.finalizeTask(currentTask, taskDescription, currentPhase.id);
          tasks[task.id] = task;
          currentPhase.tasks.push(task.id);
        }

        // Save previous phase
        if (currentPhase) {
          this.finalizePhase(currentPhase, tasks);
          phases.push(currentPhase);
        }

        // Start new phase
        currentPhase = this.parsePhaseHeader(line);
        currentTask = null;
        inTaskBlock = false;
        taskDescription = [];
        continue;
      }

      // Parse task
      if (line.startsWith('### Task ')) {
        // Save previous task
        if (currentTask && currentPhase) {
          const task = this.finalizeTask(currentTask, taskDescription, currentPhase.id);
          tasks[task.id] = task;
          currentPhase.tasks.push(task.id);
        }

        // Start new task
        currentTask = this.parseTaskHeader(line);
        inTaskBlock = true;
        taskDescription = [];
        continue;
      }

      // Parse task properties
      if (inTaskBlock && currentTask) {
        this.parseTaskProperty(line, currentTask, taskDescription);
      }
    }

    // Save last task
    if (currentTask && currentPhase) {
      const task = this.finalizeTask(currentTask, taskDescription, currentPhase.id);
      tasks[task.id] = task;
      currentPhase.tasks.push(task.id);
    }

    // Save last phase
    if (currentPhase) {
      this.finalizePhase(currentPhase, tasks);
      phases.push(currentPhase);
    }

    // Calculate totals
    const totalHours = Object.values(tasks).reduce(
      (sum, task) => sum + (task.estimatedHours || 0),
      0
    );

    const completedTasks = Object.values(tasks).filter(
      task => task.status === PlanTaskStatus.COMPLETED
    ).length;

    const completionPercentage = Object.keys(tasks).length > 0
      ? Math.round((completedTasks / Object.keys(tasks).length) * 100)
      : 0;

    // Determine overall status
    let status = PlanTaskStatus.PENDING;
    if (completionPercentage === 100) {
      status = PlanTaskStatus.COMPLETED;
    } else if (completionPercentage > 0) {
      status = PlanTaskStatus.IN_PROGRESS;
    }

    const hasFailed = Object.values(tasks).some(
      task => task.status === PlanTaskStatus.FAILED
    );

    if (hasFailed) {
      status = PlanTaskStatus.FAILED;
    }

    const hasBlocked = Object.values(tasks).some(
      task => task.status === PlanTaskStatus.BLOCKED
    );

    if (hasBlocked) {
      status = PlanTaskStatus.BLOCKED;
    }

    return {
      title,
      overview,
      version,
      lastModified,
      estimatedHours: totalHours,
      phases,
      tasks,
      status,
      completionPercentage,
      tags: [],
      metadata: {}
    };
  }

  /**
   * Extract a section's content
   */
  private extractSection(lines: string[], startLine: number): string {
    const content: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      // Stop at next header
      if (line.startsWith('#')) {
        break;
      }

      content.push(line);
    }

    return content.join('\n').trim();
  }

  /**
   * Parse phase header line
   */
  private parsePhaseHeader(line: string): PlanPhase {
    // Format: "## Phase 1: Foundation Setup (Week 1)"
    const match = line.match(/## Phase (\d+):\s*(.+?)(?:\s*\((Week \d+)\))?$/);

    if (!match) {
      throw new Error(`Invalid phase header: ${line}`);
    }

    return {
      id: match[1],
      title: match[2].trim(),
      description: '',
      week: match[3] ? parseInt(match[3].replace(/\D/g, '')) : undefined,
      tasks: [],
      status: PlanTaskStatus.PENDING,
      estimatedHours: 0,
      completionPercentage: 0
    };
  }

  /**
   * Parse task header line
   */
  private parseTaskHeader(line: string): Partial<PlanTask> {
    // Format: "### Task 1.1: Project Initialization"
    const match = line.match(/### Task ([\d.]+):\s*(.+)/);

    if (!match) {
      throw new Error(`Invalid task header: ${line}`);
    }

    return {
      id: match[1],
      title: match[2].trim(),
      status: PlanTaskStatus.PENDING,
      priority: PlanTaskPriority.NORMAL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Parse task property line
   */
  private parseTaskProperty(
    line: string,
    task: Partial<PlanTask>,
    description: string[]
  ): void {
    // Skip empty lines
    if (!line.trim()) {
      return;
    }

    // Property markers
    if (line.startsWith('**File Owner:**')) {
      task.fileOwner = line.replace('**File Owner:**', '').trim();
    } else if (line.startsWith('**Estimated:**')) {
      const match = line.match(/(\d+(?:\.\d+)?)\s*hours?/i);
      if (match) {
        task.estimatedHours = parseFloat(match[1]);
      }
    } else if (line.startsWith('**Status:**')) {
      const status = line.replace('**Status:**', '').trim().toLowerCase();
      task.status = this.parseTaskStatus(status);
    } else if (line.startsWith('**Priority:**')) {
      const priority = line.replace('**Priority:**', '').trim().toLowerCase();
      task.priority = this.parseTaskPriority(priority);
    } else if (line.startsWith('**')) {
      // Other properties - skip for now
    } else {
      // Description line
      description.push(line);
    }
  }

  /**
   * Parse task status string
   */
  private parseTaskStatus(status: string): PlanTaskStatus {
    const statusMap: Record<string, PlanTaskStatus> = {
      'pending': PlanTaskStatus.PENDING,
      'in-progress': PlanTaskStatus.IN_PROGRESS,
      'in progress': PlanTaskStatus.IN_PROGRESS,
      'completed': PlanTaskStatus.COMPLETED,
      'done': PlanTaskStatus.COMPLETED,
      'failed': PlanTaskStatus.FAILED,
      'blocked': PlanTaskStatus.BLOCKED
    };

    return statusMap[status] || PlanTaskStatus.PENDING;
  }

  /**
   * Parse task priority string
   */
  private parseTaskPriority(priority: string): PlanTaskPriority {
    const priorityMap: Record<string, PlanTaskPriority> = {
      'low': PlanTaskPriority.LOW,
      'normal': PlanTaskPriority.NORMAL,
      'medium': PlanTaskPriority.NORMAL,
      'high': PlanTaskPriority.HIGH,
      'critical': PlanTaskPriority.CRITICAL,
      'urgent': PlanTaskPriority.CRITICAL
    };

    return priorityMap[priority] || PlanTaskPriority.NORMAL;
  }

  /**
   * Finalize task and add to phase
   */
  private finalizeTask(
    task: Partial<PlanTask>,
    description: string[],
    phaseId: string
  ): PlanTask {
    return {
      id: task.id!,
      title: task.title!,
      description: description.join('\n').trim(),
      status: task.status!,
      priority: task.priority!,
      fileOwner: task.fileOwner,
      estimatedHours: task.estimatedHours,
      dependencies: task.dependencies,
      ownedFiles: task.ownedFiles,
      deliverables: task.deliverables,
      commands: task.commands,
      successCriteria: task.successCriteria,
      phaseId,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || new Date().toISOString(),
      completedAt: task.completedAt,
      failureReason: task.failureReason
    };
  }

  /**
   * Finalize phase statistics
   */
  private finalizePhase(phase: PlanPhase, tasks: Record<string, PlanTask>): void {
    const phaseTasks = phase.tasks.map(id => tasks[id]).filter(Boolean);

    phase.estimatedHours = phaseTasks.reduce(
      (sum, task) => sum + (task?.estimatedHours || 0),
      0
    );

    const completed = phaseTasks.filter(
      task => task?.status === PlanTaskStatus.COMPLETED
    ).length;

    phase.completionPercentage = phaseTasks.length > 0
      ? Math.round((completed / phaseTasks.length) * 100)
      : 0;

    // Determine phase status
    if (phase.completionPercentage === 100) {
      phase.status = PlanTaskStatus.COMPLETED;
    } else if (phase.completionPercentage > 0) {
      phase.status = PlanTaskStatus.IN_PROGRESS;
    } else {
      phase.status = PlanTaskStatus.PENDING;
    }

    const hasFailed = phaseTasks.some(
      task => task?.status === PlanTaskStatus.FAILED
    );

    if (hasFailed) {
      phase.status = PlanTaskStatus.FAILED;
    }

    const hasBlocked = phaseTasks.some(
      task => task?.status === PlanTaskStatus.BLOCKED
    );

    if (hasBlocked) {
      phase.status = PlanTaskStatus.BLOCKED;
    }
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): OperationalPlan | null {
    return this.currentPlan;
  }

  /**
   * Check if currently watching
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get watcher statistics
   */
  getStats(): {
    planPath: string;
    isWatching: boolean;
    isReading: boolean;
    hasCurrentPlan: boolean;
    currentChecksum: string | null;
    debounceDelay: number;
  } {
    return {
      planPath: this.planPath,
      isWatching: this.isWatching,
      isReading: this.isReading,
      hasCurrentPlan: this.currentPlan !== null,
      currentChecksum: this.currentChecksum,
      debounceDelay: this.config.debounceDelay
    };
  }
}

/**
 * Factory function to create a PlanWatcher
 */
export function createPlanWatcher(
  planPath: string,
  config?: PlanWatcherConfig
): PlanWatcher {
  return new PlanWatcher(planPath, config);
}
