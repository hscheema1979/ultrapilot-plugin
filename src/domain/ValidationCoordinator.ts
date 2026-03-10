/**
 * Validation Coordinator - Coordinates multi-perspective validation (Phase 4)
 *
 * This module implements Phase 4: Multi-Perspective Validation
 * - Spawns 3 parallel reviewers (security, quality, code)
 * - Waits for unanimous approval
 * - Aggregates feedback
 * - Re-executes if any rejected
 *
 * Validation Flow:
 * 1. Spawn 3 reviewer agents in parallel:
 *    - Security Reviewer: Checks for vulnerabilities, auth issues, etc.
 *    - Quality Reviewer: Checks performance, maintainability, etc.
 *    - Code Reviewer: Checks code style, patterns, etc.
 * 2. Wait for all reviews to complete
 * 3. Aggregate feedback
 * 4. If all approve: proceed to Phase 5
 * 5. If any reject: fix issues and re-run validation
 */

import { EventEmitter } from 'events';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { TaskQueue } from './TaskQueue.js';

/**
 * Reviewer types
 */
export type ReviewerType = 'security' | 'quality' | 'code';

/**
 * Review decision
 */
export type ReviewDecision = 'approve' | 'reject' | 'conditional';

/**
 * Review result
 */
export interface ReviewResult {
  reviewerId: string;
  reviewerType: ReviewerType;
  decision: ReviewDecision;
  confidence: number; // 0-1
  duration: number;
  timestamp: Date;
  feedback: string[];
  issues: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    location?: string;
    suggestion?: string;
  }[];
  conditions?: string[]; // For conditional approval
}

/**
 * Validation aggregate result
 */
export interface ValidationResult {
  success: boolean;
  unanimous: boolean;
  duration: number;
  reviews: ReviewResult[];
  timestamp: Date;
  aggregatedFeedback: {
    critical: string[];
    high: string[];
    medium: string[];
    low: string[];
  };
  requiresReexecution: boolean;
  reexecutionReason?: string;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Enable parallel review execution */
  enableParallelReview: boolean;
  /** Maximum time per review (ms) */
  reviewTimeout: number;
  /** Require unanimous approval */
  requireUnanimous: boolean;
  /** Enable conditional approvals */
  enableConditional: boolean;
  /** Workspace path */
  workspacePath: string;
  /** Files to review */
  reviewPaths: string[];
  /** Review scope */
  reviewScope: 'full' | 'incremental' | 'changed';
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Omit<ValidationConfig, 'workspacePath' | 'reviewPaths'> = {
  enableParallelReview: true,
  reviewTimeout: 1800000, // 30 minutes
  requireUnanimous: true,
  enableConditional: false,
  reviewScope: 'changed'
};

/**
 * Validation task
 */
interface ValidationTask {
  taskId: string;
  reviewerType: ReviewerType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: ReviewResult;
  error?: string;
}

/**
 * Validation Coordinator class
 */
export class ValidationCoordinator extends EventEmitter {
  private config: ValidationConfig;
  private messageBus: AgentMessageBus;
  private taskQueue: TaskQueue;
  private isRunning: boolean = false;
  private currentTasks: Map<ReviewerType, ValidationTask> = new Map();
  private reviewHistory: ValidationResult[] = [];

  constructor(
    messageBus: AgentMessageBus,
    taskQueue: TaskQueue,
    config: ValidationConfig
  ) {
    super();
    this.messageBus = messageBus;
    this.taskQueue = taskQueue;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run multi-perspective validation
   */
  async runValidation(): Promise<ValidationResult> {
    if (this.isRunning) {
      throw new Error('Validation Coordinator is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log('\n[ValidationCoordinator] ========================================');
    console.log('[ValidationCoordinator] MULTI-PERSPECTIVE VALIDATION (Phase 4)');
    console.log('[ValidationCoordinator] ========================================');
    console.log(`[ValidationCoordinator] Reviewers: 3 (security, quality, code)`);
    console.log(`[ValidationCoordinator] Parallel: ${this.config.enableParallelReview}`);
    console.log(`[ValidationCoordinator] Scope: ${this.config.reviewScope}`);

    try {
      // Step 1: Spawn reviewers
      const reviewerTasks = await this.spawnReviewers();

      // Step 2: Execute reviews
      const reviews = await this.executeReviews(reviewerTasks);

      // Step 3: Aggregate results
      const result = this.aggregateResults(reviews, startTime);

      // Step 4: Publish result
      await this.publishValidationEvent(result);

      console.log('\n[ValidationCoordinator] ========================================');
      console.log(`[ValidationCoordinator] VALIDATION ${result.success ? 'PASSED' : 'FAILED'}`);
      console.log('[ValidationCoordinator] ========================================');
      console.log(`[ValidationCoordinator] Unanimous: ${result.unanimous}`);
      console.log(`[ValidationCoordinator] Duration: ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`[ValidationCoordinator] Critical issues: ${result.aggregatedFeedback.critical.length}`);
      console.log(`[ValidationCoordinator] High issues: ${result.aggregatedFeedback.high.length}`);
      console.log(`[ValidationCoordinator] Medium issues: ${result.aggregatedFeedback.medium.length}`);
      console.log(`[ValidationCoordinator] Low issues: ${result.aggregatedFeedback.low.length}`);

      // Print summary
      for (const review of reviews) {
        const emoji = review.decision === 'approve' ? '✅' : review.decision === 'conditional' ? '⚠️' : '❌';
        console.log(`[ValidationCoordinator] ${emoji} ${review.reviewerType}: ${review.decision} (${review.issues.length} issues)`);
      }

      this.reviewHistory.push(result);
      this.emit('validation:complete', result);

      return result;

    } finally {
      this.isRunning = false;
      this.currentTasks.clear();
    }
  }

  /**
   * Spawn reviewer agents
   */
  private async spawnReviewers(): Promise<ValidationTask[]> {
    const reviewerTypes: ReviewerType[] = ['security', 'quality', 'code'];
    const tasks: ValidationTask[] = [];

    console.log('\n[ValidationCoordinator] Spawning reviewers...');

    for (const reviewerType of reviewerTypes) {
      const taskId = await this.taskQueue.addTask({
        title: `${reviewerType} review`,
        description: `Perform ${reviewerType} review of codebase`,
        priority: 7 as any, // TaskPriority.NORMAL
        assignedAgent: `${reviewerType}-reviewer` as any,
        tags: ['validation', 'phase-4', reviewerType],
        ownedFiles: [],
        dependencies: [],
        estimatedCompletion: undefined,
        maxRetries: 1,
        metadata: {
          reviewerType,
          reviewScope: this.config.reviewScope,
          reviewPaths: this.config.reviewPaths
        }
      });

      const task: ValidationTask = {
        taskId,
        reviewerType,
        status: 'pending'
      };

      this.currentTasks.set(reviewerType, task);
      tasks.push(task);

      console.log(`[ValidationCoordinator]    → ${reviewerType}-reviewer spawned (${taskId})`);
    }

    return tasks;
  }

  /**
   * Execute reviews
   */
  private async executeReviews(tasks: ValidationTask[]): Promise<ReviewResult[]> {
    const reviews: ReviewResult[] = [];

    if (this.config.enableParallelReview) {
      // Execute all reviews in parallel
      console.log('\n[ValidationCoordinator] Running reviews in parallel...');

      const results = await Promise.allSettled(
        tasks.map(task => this.executeSingleReview(task))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          reviews.push(result.value);
        } else {
          // Create a failed review result
          const task = tasks[i];
          reviews.push({
            reviewerId: task.taskId,
            reviewerType: task.reviewerType,
            decision: 'reject',
            confidence: 0,
            duration: 0,
            timestamp: new Date(),
            feedback: [`Review failed: ${result.reason}`],
            issues: [{
              severity: 'critical',
              category: 'execution',
              description: result.reason?.toString() || 'Unknown error'
            }]
          });
        }
      }
    } else {
      // Execute reviews sequentially
      console.log('\n[ValidationCoordinator] Running reviews sequentially...');

      for (const task of tasks) {
        const review = await this.executeSingleReview(task);
        reviews.push(review);
      }
    }

    return reviews;
  }

  /**
   * Execute a single review
   */
  private async executeSingleReview(task: ValidationTask): Promise<ReviewResult> {
    const startTime = Date.now();
    task.status = 'running';

    console.log(`[ValidationCoordinator] Running ${task.reviewerType} review...`);

    try {
      // In production, this would spawn an actual reviewer agent
      // For now, we simulate the review process
      const result = await this.simulateReview(task);

      const duration = Date.now() - startTime;

      const reviewResult: ReviewResult = {
        reviewerId: task.taskId,
        reviewerType: task.reviewerType,
        decision: result.decision,
        confidence: result.confidence,
        duration,
        timestamp: new Date(),
        feedback: result.feedback,
        issues: result.issues,
        conditions: result.conditions
      };

      task.status = 'completed';
      task.result = reviewResult;

      console.log(`[ValidationCoordinator]    ✅ ${task.reviewerType} review complete: ${reviewResult.decision}`);

      return reviewResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      task.status = 'failed';
      task.error = errorMsg;

      console.error(`[ValidationCoordinator]    ❌ ${task.reviewerType} review failed: ${errorMsg}`);

      return {
        reviewerId: task.taskId,
        reviewerType: task.reviewerType,
        decision: 'reject',
        confidence: 0,
        duration,
        timestamp: new Date(),
        feedback: [`Review execution failed: ${errorMsg}`],
        issues: [{
          severity: 'critical',
          category: 'execution',
          description: errorMsg
        }]
      };
    }
  }

  /**
   * Simulate review process (placeholder for actual agent spawning)
   */
  private async simulateReview(task: ValidationTask): Promise<{
    decision: ReviewDecision;
    confidence: number;
    feedback: string[];
    issues: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      category: string;
      description: string;
      location?: string;
      suggestion?: string;
    }>;
    conditions?: string[];
  }> {
    // In production, this would:
    // 1. Use AgentBridge to spawn the appropriate reviewer agent
    // 2. Execute the review with access to codebase
    // 3. Return the actual review results

    // For now, simulate a review based on reviewer type
    const simulatedDelay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, simulatedDelay));

    // Simulate different review results
    const success = Math.random() > 0.3; // 70% chance of approval

    const baseResult = {
      decision: (success ? 'approve' : 'reject') as ReviewDecision,
      confidence: 0.7 + Math.random() * 0.3,
      feedback: [] as string[],
      issues: [] as Array<{
        severity: 'critical' | 'high' | 'medium' | 'low';
        category: string;
        description: string;
        location?: string;
        suggestion?: string;
      }>
    };

    // Add reviewer-specific feedback
    switch (task.reviewerType) {
      case 'security':
        baseResult.feedback = [
          'Checked for common vulnerabilities',
          'Reviewed authentication flows',
          'Validated input sanitization'
        ];
        if (!success) {
          baseResult.issues.push({
            severity: 'high',
            category: 'security',
            description: 'Potential SQL injection vulnerability in user query',
            location: 'src/db/queries.ts:45',
            suggestion: 'Use parameterized queries'
          });
        }
        break;

      case 'quality':
        baseResult.feedback = [
          'Reviewed code complexity',
          'Checked for code smells',
          'Evaluated maintainability'
        ];
        if (!success) {
          baseResult.issues.push({
            severity: 'medium',
            category: 'quality',
            description: 'Function exceeds cyclomatic complexity threshold',
            location: 'src/utils/helpers.ts:120',
            suggestion: 'Consider refactoring into smaller functions'
          });
        }
        break;

      case 'code':
        baseResult.feedback = [
          'Checked code style consistency',
          'Verified naming conventions',
          'Reviewed documentation'
        ];
        if (!success) {
          baseResult.issues.push({
            severity: 'low',
            category: 'style',
            description: 'Inconsistent variable naming',
            location: 'src/components/Button.tsx:23',
            suggestion: 'Use camelCase for variable names'
          });
        }
        break;
    }

    return baseResult;
  }

  /**
   * Aggregate review results
   */
  private aggregateResults(reviews: ReviewResult[], startTime: number): ValidationResult {
    const duration = Date.now() - startTime;

    // Aggregate issues by severity
    const aggregatedFeedback = {
      critical: [] as string[],
      high: [] as string[],
      medium: [] as string[],
      low: [] as string[]
    };

    for (const review of reviews) {
      for (const issue of review.issues) {
        const message = `[${review.reviewerType}] ${issue.description}`;
        switch (issue.severity) {
          case 'critical':
            aggregatedFeedback.critical.push(message);
            break;
          case 'high':
            aggregatedFeedback.high.push(message);
            break;
          case 'medium':
            aggregatedFeedback.medium.push(message);
            break;
          case 'low':
            aggregatedFeedback.low.push(message);
            break;
        }
      }
    }

    // Determine overall result
    const approvals = reviews.filter(r => r.decision === 'approve').length;
    const rejections = reviews.filter(r => r.decision === 'reject').length;
    const conditionals = reviews.filter(r => r.decision === 'conditional').length;

    let success = false;
    let unanimous = false;
    let requiresReexecution = false;
    let reexecutionReason: string | undefined;

    if (this.config.requireUnanimous) {
      unanimous = approvals === reviews.length;
      success = unanimous;
      if (!this.config.enableConditional) {
        requiresReexecution = rejections > 0;
        reexecutionReason = `${rejections} reviewer(s) rejected the changes`;
      } else {
        requiresReexecution = rejections > 0;
        reexecutionReason = `${rejections} reviewer(s) rejected, ${conditionals} conditional`;
      }
    } else {
      // Majority vote
      success = approvals >= Math.ceil(reviews.length / 2);
      unanimous = approvals === reviews.length;
    }

    // If there are critical issues, always require re-execution
    if (aggregatedFeedback.critical.length > 0) {
      requiresReexecution = true;
      success = false;
      reexecutionReason = `${aggregatedFeedback.critical.length} critical issue(s) found`;
    }

    return {
      success,
      unanimous,
      duration,
      reviews,
      timestamp: new Date(),
      aggregatedFeedback,
      requiresReexecution,
      reexecutionReason
    };
  }

  /**
   * Publish validation event
   */
  private async publishValidationEvent(result: ValidationResult): Promise<void> {
    try {
      await this.messageBus.publish(
        'validation-coordinator',
        'workflow.validation.completed',
        {
          type: 'validation.completed',
          payload: {
            success: result.success,
            unanimous: result.unanimous,
            duration: result.duration,
            timestamp: result.timestamp.toISOString(),
            issues: result.aggregatedFeedback,
            requiresReexecution: result.requiresReexecution,
            workspacePath: this.config.workspacePath
          }
        }
      );
    } catch (error) {
      console.error('[ValidationCoordinator] Failed to publish event:', error);
    }
  }

  /**
   * Get review history
   */
  getReviewHistory(): ValidationResult[] {
    return [...this.reviewHistory];
  }

  /**
   * Check if validation is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Reset coordinator state
   */
  reset(): void {
    this.currentTasks.clear();
    this.reviewHistory = [];
    this.isRunning = false;
  }
}

/**
 * Factory function
 */
export function createValidationCoordinator(
  messageBus: AgentMessageBus,
  taskQueue: TaskQueue,
  config: ValidationConfig
): ValidationCoordinator {
  return new ValidationCoordinator(messageBus, taskQueue, config);
}
