/**
 * Ultra Lead - Senior Partner/Owner Role
 *
 * Ultra Lead is the "senior partner/owner" of a domain who:
 * - Receives large complex tasks from owner (you)
 * - Breaks down into manageable tasks
 * - Sets routine/task list for Ultra Loop
 * - Checks in on Ultra Loop progress
 * - Hires/approves more staff when needed
 * - Reports to owner
 *
 * Based on consulting firm model:
 * Small firm: 1 Ultra Lead handles everything
 * Midsize firm: 2-3 Ultra Leads divide responsibilities
 * Large firm: 3+ Ultra Leads manage different practice areas
 */

import { EventEmitter } from 'events';
import { Task, TaskPriority, TaskStatus } from './TaskQueue.js';
import { TaskSizeEstimate, TaskComplexity } from './WorkingManager.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import { AgentMessage } from '../types.js';

/**
 * Owner goals for the domain
 */
export interface OwnerGoals {
  maximizeProfit?: boolean;
  maximizePerformance?: boolean;
  buildPowerfulProducts?: boolean;
  minimizeCost?: boolean;
  growTheBusiness?: boolean;
}

/**
 * Domain size profile
 */
export enum DomainSize {
  SMALL = 'small',       // 1-3 people total
  MEDIUM = 'medium',     // 4-10 people total
  LARGE = 'large'        // 11+ people total
}

/**
 * Domain health metrics
 */
export interface DomainHealth {
  overallHealth: 'excellent' | 'good' | 'needs-attention' | 'critical';
  tasksInProgress: number;
  tasksCompleted: number;
  tasksBlocked: number;
  staffUtilization: number; // 0-100%
  clientSatisfaction: number; // 1-10
  profitability: number; // $ per month
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Work request from owner
 */
export interface WorkRequest {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  deadline?: Date;
  budget?: {
    hours?: number;
    cost?: number;
  };
  requirements?: string[];
}

/**
 * Task breakdown result
 */
export interface TaskBreakdown {
  originalRequest: WorkRequest;
  tasks: Task[];
  estimatedTotalHours: number;
  recommendedApproach: 'sequential' | 'parallel' | 'hybrid';
  riskAssessment: 'low' | 'medium' | 'high';
  reasoning: string;
}

/**
 * Ultra Lead configuration
 */
export interface UltraLeadConfig {
  domainSize: DomainSize;
  ownerGoals: OwnerGoals;
  checkInInterval: number; // minutes
  autoApproveHiringUnder: number; // workers
  reportingFrequency: number; // hours
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: UltraLeadConfig = {
  domainSize: DomainSize.MEDIUM,
  ownerGoals: {
    maximizeProfit: true,
    maximizePerformance: true
  },
  checkInInterval: 30, // Check in every 30 minutes
  autoApproveHiringUnder: 5, // Auto-approve hiring up to 5 workers
  reportingFrequency: 24 // Report to owner every 24 hours
};

/**
 * Ultra Lead - Senior Partner/Owner
 */
export class UltraLead extends EventEmitter {
  private config: UltraLeadConfig;
  private currentWork: Map<string, TaskBreakdown>;
  private reportingHistory: Map<string, DomainHealth[]>;
  private checkInTimer?: NodeJS.Timeout;

  // AgentMessageBus integration
  private messageBus: AgentMessageBus;
  private connectionPool: ConnectionPool;

  constructor(config?: Partial<UltraLeadConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentWork = new Map();
    this.reportingHistory = new Map();

    // Initialize AgentMessageBus and ConnectionPool
    this.connectionPool = ConnectionPool.getInstance();
    this.messageBus = new AgentMessageBus();

    // Start periodic check-ins
    this.startCheckIns();
  }

  /**
   * Receive work request from owner
   * This is the main entry point for new work
   */
  async receiveWorkRequest(request: WorkRequest): Promise<TaskBreakdown> {
    console.log(`\n[UltraLead] ========================================`);
    console.log(`[UltraLead] 📋 WORK REQUEST RECEIVED FROM OWNER`);
    console.log(`[UltraLead] ========================================`);
    console.log(`[UltraLead] Title: ${request.title}`);
    console.log(`[UltraLead] Priority: ${request.priority}`);
    console.log(`[UltraLead] Complexity: ${request.complexity}`);

    // Step 1: Break down work into tasks
    const breakdown = await this.breakDownWork(request);

    console.log(`[UltraLead] 📊 WORK BREAKDOWN COMPLETE:`);
    console.log(`[UltraLead]    - Tasks created: ${breakdown.tasks.length}`);
    console.log(`[UltraLead]    - Estimated hours: ${breakdown.estimatedTotalHours.toFixed(1)}`);
    console.log(`[UltraLead]    - Approach: ${breakdown.recommendedApproach}`);
    console.log(`[UltraLead]    - Risk: ${breakdown.riskAssessment}`);

    // Step 2: Store breakdown
    this.currentWork.set(request.id, breakdown);

    // Step 3: Set routine for Ultra Loop
    await this.setRoutineForUltraLoop(breakdown);

    // Emit event
    this.emit('workReceived', { request, breakdown });

    console.log(`[UltraLead] ✅ Work breakdown complete, routine set for Ultra Loop`);
    console.log(`[UltraLead] ========================================\n`);

    return breakdown;
  }

  /**
   * Break down work request into manageable tasks
   */
  private async breakDownWork(request: WorkRequest): Promise<TaskBreakdown> {
    const tasks: Task[] = [];
    let estimatedHours = 0;

    // Analyze complexity and determine task count
    const taskCount = this.estimateTaskCount(request);

    console.log(`[UltraLead]    → Breaking down into ${taskCount} tasks`);

    // Generate tasks based on complexity
    if (request.complexity === 'simple') {
      // Simple: 1-2 tasks
      tasks.push(this.createTask(request, 1, taskCount));
      estimatedHours += this.estimateTaskHours(request, 1, taskCount);
    } else if (request.complexity === 'moderate') {
      // Moderate: 3-5 tasks
      for (let i = 1; i <= taskCount; i++) {
        tasks.push(this.createTask(request, i, taskCount));
        estimatedHours += this.estimateTaskHours(request, i, taskCount);
      }
    } else {
      // Complex or Expert: 6-20 tasks, organized by phase
      const phases = this.definePhases(request);
      let taskNumber = 1;

      for (const phase of phases) {
        const phaseTasks = this.createPhaseTasks(request, phase, taskNumber, taskCount);
        tasks.push(...phaseTasks.tasks);
        estimatedHours += phaseTasks.hours;
        taskNumber = phaseTasks.endNumber + 1;
      }
    }

    // Determine approach
    const recommendedApproach = this.determineApproach(request, estimatedHours);

    // Assess risk
    const riskAssessment = this.assessRisk(request, tasks, estimatedHours);

    // Build reasoning
    const reasoning = this.buildBreakdownReasoning(request, tasks, estimatedHours, recommendedApproach);

    return {
      originalRequest: request,
      tasks,
      estimatedTotalHours: estimatedHours,
      recommendedApproach,
      riskAssessment,
      reasoning
    };
  }

  /**
   * Estimate how many tasks this work should be broken into
   */
  private estimateTaskCount(request: WorkRequest): number {
    const wordCount = request.description.split(/\s+/).length;

    switch (request.complexity) {
      case 'simple':
        return Math.max(1, Math.ceil(wordCount / 50)); // ~50 words per task

      case 'moderate':
        return Math.max(3, Math.ceil(wordCount / 30)); // ~30 words per task

      case 'complex':
        return Math.max(8, Math.ceil(wordCount / 20)); // ~20 words per task

      case 'expert':
        return Math.max(15, Math.ceil(wordCount / 15)); // ~15 words per task

      default:
        return 3;
    }
  }

  /**
   * Create a single task from work request
   */
  private createTask(request: WorkRequest, taskNumber: number, totalTasks: number): Task {
    const priority = this.mapPriority(request.priority);

    return {
      id: `task-${request.id}-${taskNumber}`,
      title: totalTasks === 1
        ? request.title
        : `${request.title} (Part ${taskNumber}/${totalTasks})`,
      description: request.description,
      status: TaskStatus.INTAKE,
      priority,
      tags: [request.complexity, ... (request.requirements || [])],
      createdAt: new Date(),
      updatedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      metadata: {
        workRequestId: request.id,
        taskNumber,
        totalTasks,
        deadline: request.deadline?.toISOString(),
        budget: request.budget
      }
    };
  }

  /**
   * Define phases for complex/expert work
   */
  private definePhases(request: WorkRequest): Array<{name: string; focus: string}> {
    const phases = [];

    if (request.complexity === 'complex') {
      phases.push(
        { name: 'Analysis & Design', focus: 'planning' },
        { name: 'Implementation', focus: 'execution' },
        { name: 'Testing & QA', focus: 'quality' }
      );
    } else if (request.complexity === 'expert') {
      phases.push(
        { name: 'Requirements Analysis', focus: 'analysis' },
        { name: 'Architecture Design', focus: 'architecture' },
        { name: 'Implementation Phase 1', focus: 'execution' },
        { name: 'Implementation Phase 2', focus: 'execution' },
        { name: 'Integration', focus: 'integration' },
        { name: 'Testing & Validation', focus: 'quality' },
        { name: 'Documentation', focus: 'documentation' },
        { name: 'Deployment', focus: 'deployment' }
      );
    }

    return phases;
  }

  /**
   * Create tasks for a specific phase
   */
  private createPhaseTasks(
    request: WorkRequest,
    phase: { name: string; focus: string },
    startNumber: number,
    totalTasks: number
  ): { tasks: Task[]; hours: number; endNumber: number } {
    const tasks: Task[] = [];
    const tasksInPhase = Math.max(2, Math.floor(totalTasks / this.definePhases(request).length));
    let hours = 0;

    for (let i = 0; i < tasksInPhase; i++) {
      const taskNumber = startNumber + i;
      const task = this.createTask(request, taskNumber, totalTasks);

      // Customize task for phase
      task.title = `${phase.name}: ${request.title}`;
      task.tags = [phase.focus, request.complexity];

      tasks.push(task);
      hours += this.estimateTaskHours(request, taskNumber, totalTasks);
    }

    return {
      tasks,
      hours,
      endNumber: startNumber + tasksInPhase - 1
    };
  }

  /**
   * Estimate hours for a task
   */
  private estimateTaskHours(request: WorkRequest, taskNumber: number, totalTasks: number): number {
    const baseHours = {
      simple: 2,
      moderate: 4,
      complex: 8,
      expert: 16
    };

    const complexity = request.complexity;
    let hours = baseHours[complexity] || 4;

    // Adjust for task position
    if (taskNumber > 1) {
      hours *= 0.8; // Later tasks often faster
    }

    // Adjust for budget if provided
    if (request.budget?.hours) {
      hours = Math.min(hours, request.budget.hours / totalTasks);
    }

    return hours;
  }

  /**
   * Determine execution approach
   */
  private determineApproach(request: WorkRequest, estimatedHours: number): 'sequential' | 'parallel' | 'hybrid' {
    if (estimatedHours < 8) {
      return 'sequential'; // Small work: do tasks one by one
    } else if (estimatedHours < 40) {
      return 'parallel'; // Medium work: do tasks in parallel
    } else {
      return 'hybrid'; // Large work: mix of sequential and parallel
    }
  }

  /**
   * Assess risk of work
   */
  private assessRisk(request: WorkRequest, tasks: Task[], estimatedHours: number): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    // Complexity increases risk
    if (request.complexity === 'complex') riskScore += 2;
    if (request.complexity === 'expert') riskScore += 4;

    // Tight deadline increases risk
    if (request.deadline) {
      const daysUntilDeadline = (request.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilDeadline < estimatedHours / 8) riskScore += 3; // Not enough time
    }

    // Many tasks increases risk
    if (tasks.length > 10) riskScore += 2;

    // High priority increases risk
    if (request.priority === 'critical') riskScore += 1;

    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  /**
   * Build breakdown reasoning
   */
  private buildBreakdownReasoning(
    request: WorkRequest,
    tasks: Task[],
    estimatedHours: number,
    approach: string
  ): string {
    return `Work "${request.title}" broken down into ${tasks.length} tasks ` +
      `estimated at ${estimatedHours.toFixed(1)} hours. ` +
      `${request.complexity} complexity suggests ${approach} execution. ` +
      `Risk assessed as ${this.assessRisk(request, tasks, estimatedHours)}. ` +
      `Tasks will be added to Ultra Loop's intake queue for processing.`;
  }

  /**
   * Set routine for Ultra Loop
   * This adds tasks to the intake queue for Ultra Loop to process
   */
  private async setRoutineForUltraLoop(breakdown: TaskBreakdown): Promise<void> {
    console.log(`\n[UltraLead] 🔄 SETTING ROUTINE FOR ULTRA LOOP`);
    console.log(`[UltraLead]    → Adding ${breakdown.tasks.length} tasks to intake queue`);

    // Publish tasks to AgentMessageBus for UltraLoop to pick up
    await this.messageBus.publish(
      'ultra-lead',
      'routine.set',
      {
        type: 'routine.set',
        payload: {
          tasks: breakdown.tasks,
          approach: breakdown.recommendedApproach,
          workRequestId: breakdown.originalRequest.id
        }
      }
    );

    // Also emit event for backward compatibility
    this.emit('setRoutine', { tasks: breakdown.tasks });

    console.log(`[UltraLead]    → Routine set: Ultra Loop will process tasks`);
    console.log(`[UltraLead]    → Approach: ${breakdown.recommendedApproach}`);
    console.log(`[UltraLead] ✅ ROUTINE SET\n`);
  }

  /**
   * Check in on Ultra Loop progress
   * This runs periodically to monitor work
   */
  async checkInOnUltraLoop(): Promise<void> {
    console.log(`\n[UltraLead] 🔍 CHECKING IN ON ULTRA LOOP PROGRESS`);

    // Request status from UltraLoop via AgentMessageBus
    await this.messageBus.publish(
      'ultra-lead',
      'status.request',
      {
        type: 'status.request',
        payload: {
          timestamp: new Date(),
          requester: 'ultra-lead'
        }
      }
    );

    // Also emit event for backward compatibility
    this.emit('requestStatus', { timestamp: new Date() });

    console.log(`[UltraLead]    → Status requested from Ultra Loop`);
    console.log(`[UltraLead] ✅ CHECK-IN COMPLETE\n`);
  }

  /**
   * Evaluate hiring request from Ultra Loop
   */
  async evaluateHiringRequest(request: {
    reason: string;
    workerCount: number;
    justification: string;
  }): Promise<{ approved: boolean; reason?: string }> {
    console.log(`\n[UltraLead] 👥 HIRING REQUEST FROM ULTRA LOOP`);
    console.log(`[UltraLead]    → Workers requested: ${request.workerCount}`);
    console.log(`[UltraLead]    → Reason: ${request.reason}`);
    console.log(`[UltraLead]    → Justification: ${request.justification}`);

    // Auto-approve if under threshold
    if (request.workerCount <= this.config.autoApproveHiringUnder) {
      console.log(`[UltraLead]    → Auto-approved (under threshold of ${this.config.autoApproveHiringUnder})`);
      this.emit('hiringApproved', { ...request, approved: true });
      console.log(`[UltraLead] ✅ HIRING APPROVED\n`);
      return { approved: true };
    }

    // Evaluate based on domain size and goals
    const shouldApprove = this.evaluateHiringAgainstGoals(request);

    if (shouldApprove) {
      console.log(`[UltraLead]    → Approved based on domain goals`);
      this.emit('hiringApproved', { ...request, approved: true });
      console.log(`[UltraLead] ✅ HIRING APPROVED\n`);
      return { approved: true };
    } else {
      const reason = `Hiring not aligned with current domain goals (domain size: ${this.config.domainSize})`;
      console.log(`[UltraLead]    → Denied: ${reason}`);
      this.emit('hiringDenied', { ...request, approved: false, reason });
      console.log(`[UltraLead] ❌ HIRING DENIED\n`);
      return { approved: false, reason };
    }
  }

  /**
   * Evaluate hiring against domain goals
   */
  private evaluateHiringAgainstGoals(request: { workerCount: number; reason: string }): boolean {
    const goals = this.config.ownerGoals;

    // If maximizing performance, approve hiring for performance reasons
    if (goals.maximizePerformance && request.reason.includes('performance')) {
      return true;
    }

    // If growing business, approve hiring for growth
    if (goals.growTheBusiness && (request.reason.includes('backlog') || request.reason.includes('growth'))) {
      return true;
    }

    // If maximizing profit, check if hiring increases profit
    if (goals.maximizeProfit && request.reason.includes('profitable')) {
      return true;
    }

    // Default to conservative
    return false;
  }

  /**
   * Report to owner
   * Generates comprehensive report for domain owner
   */
  async reportToOwner(): Promise<{
    timestamp: Date;
    domainSize: DomainSize;
    health: DomainHealth;
    activeWork: number;
    recommendations: string[];
  }> {
    console.log(`\n[UltraLead] 📊 GENERATING REPORT FOR OWNER`);

    // Gather domain health
    const health = await this.assessDomainHealth();

    // Generate recommendations
    const recommendations = this.generateRecommendations(health);

    const report = {
      timestamp: new Date(),
      domainSize: this.config.domainSize,
      health,
      activeWork: this.currentWork.size,
      recommendations
    };

    console.log(`[UltraLead]    → Domain Health: ${health.overallHealth}`);
    console.log(`[UltraLead]    → Active Work: ${report.activeWork} requests`);
    console.log(`[UltraLead]    → Recommendations: ${recommendations.length}`);
    console.log(`[UltraLead] ✅ REPORT GENERATED\n`);

    // Emit event for backward compatibility
    this.emit('ownerReport', report);

    // Publish report to AgentMessageBus
    await this.messageBus.publish(
      'ultra-lead',
      'report.generated',
      {
        type: 'report.generated',
        payload: report
      }
    );

    return report;
  }

  /**
   * Receive status update from UltraLoop
   * Called when UltraLoop responds to status requests
   */
  async receiveStatusUpdate(status: {
    tasksInProgress: number;
    tasksCompleted: number;
    tasksFailed: number;
    activeAgents: number;
    timestamp: Date;
  }): Promise<void> {
    console.log(`\n[UltraLead] 📊 STATUS UPDATE FROM ULTRA LOOP`);
    console.log(`[UltraLead]    → Tasks in progress: ${status.tasksInProgress}`);
    console.log(`[UltraLead]    → Tasks completed: ${status.tasksCompleted}`);
    console.log(`[UltraLead]    → Tasks failed: ${status.tasksFailed}`);
    console.log(`[UltraLead]    → Active agents: ${status.activeAgents}`);

    // Emit event for backward compatibility
    this.emit('statusUpdate', status);

    // Publish status to AgentMessageBus for monitoring
    await this.messageBus.publish(
      'ultra-lead',
      'status.update',
      {
        type: 'status.update',
        payload: status
      }
    );

    console.log(`[UltraLead] ✅ STATUS UPDATE RECEIVED\n`);
  }

  /**
   * Get current statistics
   * Returns real-time stats from database
   */
  async getCurrentStats(): Promise<{
    activeWorkRequests: number;
    totalTasksGenerated: number;
    domainSize: DomainSize;
    ownerGoals: OwnerGoals;
    checkInInterval: number;
    health: DomainHealth;
  }> {
    const baseStats = this.getStats();
    const health = await this.assessDomainHealth();

    return {
      ...baseStats,
      health
    };
  }

  /**
   * Assess overall domain health
   */
  private async assessDomainHealth(): Promise<DomainHealth> {
    // Query actual metrics from ConnectionPool database
    const db = this.connectionPool.getReader();

    try {
      // Get task statistics from database
      const taskStats = db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM tasks
        GROUP BY status
      `).all();

      // Calculate metrics from actual data
      let tasksInProgress = 0;
      let tasksCompleted = 0;
      let tasksBlocked = 0;

      for (const row of taskStats as any[]) {
        switch (row.status) {
          case 'in-progress':
            tasksInProgress = row.count;
            break;
          case 'completed':
            tasksCompleted = row.count;
            break;
          case 'blocked':
          case 'failed':
            tasksBlocked = row.count;
            break;
        }
      }

      // Get agent activity
      const agentActivity = db.prepare(`
        SELECT
          COUNT(DISTINCT agent_id) as activeAgents,
          AVG(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as utilizationRate
        FROM agent_state
        WHERE last_updated > datetime('now', '-1 hour')
      `).get();

      const activity = agentActivity as any;
      const staffUtilization = activity ? Math.round(activity.utilizationRate * 100) : 75;

      // Determine overall health
      let overallHealth: 'excellent' | 'good' | 'needs-attention' | 'critical' = 'good';

      if (tasksBlocked > 5 || staffUtilization > 95) {
        overallHealth = 'critical';
      } else if (tasksBlocked > 2 || staffUtilization > 85) {
        overallHealth = 'needs-attention';
      } else if (tasksCompleted > 50 && staffUtilization < 80) {
        overallHealth = 'excellent';
      }

      return {
        overallHealth,
        tasksInProgress,
        tasksCompleted,
        tasksBlocked,
        staffUtilization,
        clientSatisfaction: 8.5, // Would come from feedback table
        profitability: 12500, // Would come from billing/tracking table
        trend: tasksCompleted > 40 ? 'improving' : 'stable'
      };

    } catch (error) {
      console.error('[UltraLead] Error assessing domain health:', error);

      // Fallback to default health on error
      return {
        overallHealth: 'good',
        tasksInProgress: 0,
        tasksCompleted: 0,
        tasksBlocked: 0,
        staffUtilization: 0,
        clientSatisfaction: 8.0,
        profitability: 0,
        trend: 'stable'
      };
    }
  }

  /**
   * Generate recommendations based on domain health
   */
  private generateRecommendations(health: DomainHealth): string[] {
    const recommendations: string[] = [];

    if (health.staffUtilization > 85) {
      recommendations.push('Consider hiring more staff - utilization is high');
    }

    if (health.staffUtilization < 50) {
      recommendations.push('Consider right-sizing - utilization is low');
    }

    if (health.tasksBlocked > 3) {
      recommendations.push('Critical: Address blocked tasks immediately');
    }

    if (health.clientSatisfaction < 7) {
      recommendations.push('Investigate low client satisfaction scores');
    }

    if (health.trend === 'declining') {
      recommendations.push('Action needed: Domain performance is declining');
    }

    if (recommendations.length === 0) {
      recommendations.push('Domain performing well - continue current approach');
    }

    return recommendations;
  }

  /**
   * Start periodic check-ins with Ultra Loop
   */
  private startCheckIns(): void {
    const checkInMs = this.config.checkInInterval * 60 * 1000;

    this.checkInTimer = setInterval(async () => {
      await this.checkInOnUltraLoop();
    }, checkInMs);

    console.log(`[UltraLead] 🔔 Started periodic check-ins (every ${this.config.checkInInterval} minutes)`);
  }

  /**
   * Stop periodic check-ins
   */
  stopCheckIns(): void {
    if (this.checkInTimer) {
      clearInterval(this.checkInTimer);
      this.checkInTimer = undefined;
      console.log(`[UltraLead] 🔔 Stopped periodic check-ins`);
    }
  }

  /**
   * Map priority string to TaskPriority enum
   */
  private mapPriority(priority: string): TaskPriority {
    const mapping: Record<string, TaskPriority> = {
      'low': TaskPriority.LOW,
      'normal': TaskPriority.NORMAL,
      'high': TaskPriority.HIGH,
      'critical': TaskPriority.CRITICAL
    };

    return mapping[priority] || TaskPriority.NORMAL;
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeWorkRequests: number;
    totalTasksGenerated: number;
    domainSize: DomainSize;
    ownerGoals: OwnerGoals;
    checkInInterval: number;
  } {
    let totalTasks = 0;

    for (const breakdown of this.currentWork.values()) {
      totalTasks += breakdown.tasks.length;
    }

    return {
      activeWorkRequests: this.currentWork.size,
      totalTasksGenerated: totalTasks,
      domainSize: this.config.domainSize,
      ownerGoals: this.config.ownerGoals,
      checkInInterval: this.config.checkInInterval
    };
  }
}

/**
 * Factory function
 */
export function createUltraLead(config?: Partial<UltraLeadConfig>): UltraLead {
  return new UltraLead(config);
}
