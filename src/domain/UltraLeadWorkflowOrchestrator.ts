/**
 * Ultra-Lead Workflow Orchestrator - Main orchestration engine
 *
 * This module ties together all phase executors to implement the complete
 * Ultra-Lead workflow orchestration system (Task 2.1c).
 *
 * Workflow Phases:
 * - Phase 2: Queue-Based Task Processing (PhaseExecutor)
 * - Phase 3: QA Cycles (QACoordinator)
 * - Phase 4: Multi-Perspective Validation (ValidationCoordinator)
 * - Phase 5: Evidence-Based Verification (VerificationEngine)
 *
 * The orchestrator:
 * - Reads plan-final.md
 * - Executes Phases 2-5 sequentially
 * - Handles failures and retries
 * - Generates completion reports with evidence
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

import { TaskQueue } from './TaskQueue.js';
import { AgentBridge } from './AgentBridge.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { SessionManager } from '../session/SessionManager.js';

import { PhaseExecutor, PhaseDefinition, PhaseResult } from './PhaseExecutor.js';
import { QACoordinator, QAReport, QAConfig } from './QACoordinator.js';
import { ValidationCoordinator, ValidationResult, ValidationConfig } from './ValidationCoordinator.js';
import { VerificationEngine, VerificationResult, VerificationConfig } from './VerificationEngine.js';

/**
 * Operational plan from plan-final.md
 */
export interface OperationalPlan {
  metadata: {
    planId: string;
    version: string;
    createdAt: Date;
    workspacePath: string;
  };
  phases: PhaseDefinition[];
  totalTasks: number;
  estimatedHours: number;
}

/**
 * Workflow execution state
 */
export interface WorkflowExecutionState {
  workflowId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentPhase: number;
  totalPhases: number;
  startedAt?: Date;
  completedAt?: Date;
  errors: string[];
  phaseResults: Map<number, PhaseResult | QAReport | ValidationResult | VerificationResult>;
}

/**
 * Complete workflow result
 */
export interface WorkflowExecutionResult {
  workflowId: string;
  success: boolean;
  duration: number;
  startedAt: Date;
  completedAt: Date;
  phases: {
    phase2: PhaseResult;
    phase3: QAReport;
    phase4: ValidationResult;
    phase5: VerificationResult;
  };
  finalReport: CompletionReport;
  errors: string[];
}

/**
 * Completion report
 */
export interface CompletionReport {
  workflowId: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  summary: {
    totalTasks: number;
    completedTasks: number;
    totalQACycles: number;
    validationPassed: boolean;
    verificationPassed: boolean;
  };
  phases: Array<{
    phaseNumber: number;
    name: string;
    success: boolean;
    duration: number;
    details: any;
  }>;
  recommendations: string[];
  artifacts: {
    planPath: string;
    reportPath?: string;
    evidencePath?: string;
  };
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  workspacePath: string;
  planPath?: string;
  enableAutoRecovery: boolean;
  maxRetries: number;
  enableParallelTasks: boolean;
  qaConfig?: Partial<QAConfig>;
  validationConfig?: Partial<ValidationConfig>;
  verificationConfig?: Partial<VerificationConfig>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<Omit<OrchestratorConfig, 'workspacePath'>> = {
  planPath: path.join(process.cwd(), '.ultra', 'plan-final.md'),
  enableAutoRecovery: true,
  maxRetries: 3,
  enableParallelTasks: true
};

/**
 * Ultra-Lead Workflow Orchestrator class
 */
export class UltraLeadWorkflowOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private workspacePath: string;

  // Core components
  private taskQueue: TaskQueue;
  private agentBridge: AgentBridge;
  private messageBus: AgentMessageBus;
  private sessionManager: SessionManager;

  // Phase executors
  private phaseExecutor: PhaseExecutor;
  private qaCoordinator: QACoordinator;
  private validationCoordinator: ValidationCoordinator;
  private verificationEngine: VerificationEngine;

  // State
  private state: WorkflowExecutionState;
  private currentPlan: OperationalPlan | null = null;
  private isRunning: boolean = false;

  constructor(config: OrchestratorConfig) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workspacePath = config.workspacePath;

    // Initialize core components
    this.taskQueue = new TaskQueue();
    this.messageBus = new AgentMessageBus({
      dbPath: path.join(this.workspacePath, '.ultra', 'state', 'messages.db')
    });
    this.sessionManager = new SessionManager();

    // Initialize AgentBridge with FileOwnershipManager
    const { FileOwnershipManager } = require('./FileOwnership.js');
    const fileOwnership = new FileOwnershipManager(this.workspacePath);
    this.agentBridge = new AgentBridge(this.taskQueue, fileOwnership);

    // Initialize phase executors
    this.phaseExecutor = new PhaseExecutor(
      this.taskQueue,
      this.agentBridge,
      this.messageBus,
      this.workspacePath,
      { enableParallelExecution: this.config.enableParallelTasks }
    );

    this.qaCoordinator = new QACoordinator({
      workspacePath: this.workspacePath,
      ...this.config.qaConfig
    } as QAConfig);

    this.validationCoordinator = new ValidationCoordinator(
      this.messageBus,
      this.taskQueue,
      {
        workspacePath: this.workspacePath,
        reviewPaths: [this.workspacePath],
        ...this.config.validationConfig
      } as ValidationConfig
    );

    this.verificationEngine = new VerificationEngine({
      workspacePath: this.workspacePath,
      ...this.config.verificationConfig
    } as VerificationConfig);

    // Initialize state
    this.state = {
      workflowId: this.generateWorkflowId(),
      status: 'idle',
      currentPhase: 0,
      totalPhases: 4,
      errors: [],
      phaseResults: new Map()
    };

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] STARTING ULTRA-LEAD WORKFLOW ORCHESTRATOR');
    console.log('[UltraLeadOrchestrator] ========================================');
    console.log(`[UltraLeadOrchestrator] Workspace: ${this.workspacePath}`);
    console.log(`[UltraLeadOrchestrator] Plan: ${this.config.planPath}`);

    // Start components
    await this.taskQueue.start();
    await this.agentBridge.start();
    // AgentMessageBus doesn't have a start method in the interface
    // await this.messageBus.start?.();

    this.emit('orchestrator:started');
    console.log('[UltraLeadOrchestrator] Orchestrator started\n');
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    console.log('\n[UltraLeadOrchestrator] Stopping orchestrator...');

    this.isRunning = false;

    await this.taskQueue.stop();
    await this.agentBridge.stop();
    await this.messageBus.close();

    this.emit('orchestrator:stopped');
    console.log('[UltraLeadOrchestrator] Orchestrator stopped\n');
  }

  /**
   * Execute complete workflow (Phases 2-5)
   */
  async executeWorkflow(plan?: OperationalPlan): Promise<WorkflowExecutionResult> {
    if (this.isRunning) {
      throw new Error('Workflow is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    // Reset state for new workflow
    this.state = {
      workflowId: this.generateWorkflowId(),
      status: 'running',
      currentPhase: 0,
      totalPhases: 4,
      startedAt: new Date(),
      errors: [],
      phaseResults: new Map()
    };

    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] EXECUTING WORKFLOW (Phases 2-5)');
    console.log('[UltraLeadOrchestrator] ========================================');
    console.log(`[UltraLeadOrchestrator] Workflow ID: ${this.state.workflowId}`);

    try {
      // Load plan if not provided
      const operationalPlan = plan || await this.loadPlan();

      this.currentPlan = operationalPlan;

      console.log(`[UltraLeadOrchestrator] Plan loaded: ${operationalPlan.metadata.planId}`);
      console.log(`[UltraLeadOrchestrator] Total phases: ${operationalPlan.phases.length}`);
      console.log(`[UltraLeadOrchestrator] Total tasks: ${operationalPlan.totalTasks}`);

      // Publish workflow started event
      await this.publishEvent('workflow.started', {
        workflowId: this.state.workflowId,
        planId: operationalPlan.metadata.planId,
        totalPhases: this.state.totalPhases
      });

      // Execute Phase 2: Queue-Based Task Processing
      this.state.currentPhase = 2;
      const phase2Result = await this.executePhase2(operationalPlan);
      this.state.phaseResults.set(2, phase2Result);

      if (!phase2Result.success && this.config.enableAutoRecovery) {
        console.warn('[UltraLeadOrchestrator] Phase 2 failed, attempting recovery...');
        // In production, would attempt recovery here
      }

      // Execute Phase 3: QA Cycles
      this.state.currentPhase = 3;
      const phase3Result = await this.executePhase3();
      this.state.phaseResults.set(3, phase3Result);

      // Execute Phase 4: Multi-Perspective Validation
      this.state.currentPhase = 4;
      const phase4Result = await this.executePhase4();
      this.state.phaseResults.set(4, phase4Result);

      // Execute Phase 5: Evidence-Based Verification
      this.state.currentPhase = 5;
      const phase5Result = await this.executePhase5();
      this.state.phaseResults.set(5, phase5Result);

      // Generate completion report
      const completedAt = new Date();
      const duration = completedAt.getTime() - startTime;

      const finalReport = await this.generateCompletionReport(duration);

      const workflowResult: WorkflowExecutionResult = {
        workflowId: this.state.workflowId,
        success: this.determineWorkflowSuccess(),
        duration,
        startedAt: this.state.startedAt!,
        completedAt,
        phases: {
          phase2: phase2Result as PhaseResult,
          phase3: phase3Result as QAReport,
          phase4: phase4Result as ValidationResult,
          phase5: phase5Result as VerificationResult
        },
        finalReport,
        errors: this.state.errors
      };

      this.state.status = workflowResult.success ? 'completed' : 'failed';
      this.state.completedAt = completedAt;

      console.log('\n[UltraLeadOrchestrator] ========================================');
      console.log(`[UltraLeadOrchestrator] WORKFLOW ${workflowResult.success ? 'COMPLETED' : 'FAILED'}`);
      console.log('[UltraLeadOrchestrator] ========================================');
      console.log(`[UltraLeadOrchestrator] Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`[UltraLeadOrchestrator] Phase 2: ${phase2Result.success ? '✅' : '❌'}`);
      console.log(`[UltraLeadOrchestrator] Phase 3: ${(phase3Result.finalResult || 'failed') === 'passed' ? '✅' : '❌'}`);
      console.log(`[UltraLeadOrchestrator] Phase 4: ${phase4Result.success ? '✅' : '❌'}`);
      console.log(`[UltraLeadOrchestrator] Phase 5: ${phase5Result.success ? '✅' : '❌'}`);

      // Publish workflow completed event
      await this.publishEvent('workflow.completed', {
        workflowId: this.state.workflowId,
        success: workflowResult.success,
        duration,
        report: finalReport
      });

      this.emit('workflow:complete', workflowResult);

      return workflowResult;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.state.errors.push(errorMsg);
      this.state.status = 'failed';

      console.error(`[UltraLeadOrchestrator] ❌ Workflow failed: ${errorMsg}`);

      throw error;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute Phase 2: Queue-Based Task Processing
   */
  private async executePhase2(plan: OperationalPlan): Promise<PhaseResult> {
    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] PHASE 2: Queue-Based Task Processing');
    console.log('[UltraLeadOrchestrator] ========================================');

    // For each phase in the plan, execute tasks
    let allTasksCompleted = 0;
    let allTasksTotal = 0;
    let allErrors: string[] = [];
    let phaseDuration = 0;

    for (const planPhase of plan.phases) {
      const result = await this.phaseExecutor.executePhase(planPhase);
      allTasksCompleted += result.tasksCompleted;
      allTasksTotal += result.totalTasks;
      allErrors.push(...result.errors);
      phaseDuration += result.duration;

      // If any phase failed critically, stop
      if (!result.success && allErrors.filter(e => e.includes('critical')).length > 0) {
        break;
      }
    }

    return {
      phaseNumber: 2,
      name: 'Queue-Based Task Processing',
      success: allErrors.filter(e => e.includes('critical')).length === 0,
      duration: phaseDuration,
      tasksCompleted: allTasksCompleted,
      totalTasks: allTasksTotal,
      errors: allErrors
    };
  }

  /**
   * Execute Phase 3: QA Cycles
   */
  private async executePhase3(): Promise<QAReport> {
    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] PHASE 3: QA Cycles (UltraQA)');
    console.log('[UltraLeadOrchestrator] ========================================');

    const report = await this.qaCoordinator.runQACycles();

    return report;
  }

  /**
   * Execute Phase 4: Multi-Perspective Validation
   */
  private async executePhase4(): Promise<ValidationResult> {
    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] PHASE 4: Multi-Perspective Validation');
    console.log('[UltraLeadOrchestrator] ========================================');

    const result = await this.validationCoordinator.runValidation();

    return result;
  }

  /**
   * Execute Phase 5: Evidence-Based Verification
   */
  private async executePhase5(): Promise<VerificationResult> {
    console.log('\n[UltraLeadOrchestrator] ========================================');
    console.log('[UltraLeadOrchestrator] PHASE 5: Evidence-Based Verification');
    console.log('[UltraLeadOrchestrator] ========================================');

    // Gather phase results for report
    const phaseResults = Array.from(this.state.phaseResults.values());

    const result = await this.verificationEngine.runVerification(
      phaseResults.map((r: any) => ({
        phaseNumber: r.phaseNumber || 0,
        name: r.name || 'Unknown',
        success: r.success || false,
        duration: r.duration || 0
      }))
    );

    return result;
  }

  /**
   * Generate completion report
   */
  private async generateCompletionReport(duration: number): Promise<CompletionReport> {
    const phase2 = this.state.phaseResults.get(2) as PhaseResult;
    const phase3 = this.state.phaseResults.get(3) as QAReport;
    const phase4 = this.state.phaseResults.get(4) as ValidationResult;
    const phase5 = this.state.phaseResults.get(5) as VerificationResult;

    const summary = {
      totalTasks: phase2?.totalTasks || 0,
      completedTasks: phase2?.tasksCompleted || 0,
      totalQACycles: phase3?.totalCycles || 0,
      validationPassed: phase4?.success || false,
      verificationPassed: phase5?.success || false
    };

    const phases = [
      {
        phaseNumber: 2,
        name: 'Queue-Based Task Processing',
        success: phase2?.success || false,
        duration: phase2?.duration || 0,
        details: phase2
      },
      {
        phaseNumber: 3,
        name: 'QA Cycles',
        success: (phase3?.finalResult || 'failed') === 'passed',
        duration: phase3?.totalDuration || 0,
        details: phase3
      },
      {
        phaseNumber: 4,
        name: 'Multi-Perspective Validation',
        success: phase4?.success || false,
        duration: phase4?.duration || 0,
        details: phase4
      },
      {
        phaseNumber: 5,
        name: 'Evidence-Based Verification',
        success: phase5?.success || false,
        duration: phase5?.duration || 0,
        details: phase5
      }
    ];

    // Generate recommendations
    const recommendations: string[] = [];

    if (!phase2?.success) {
      recommendations.push('Some tasks failed to complete. Review task errors and retry.');
    }
    if (phase3?.finalResult === 'escalated') {
      recommendations.push(`QA escalated: ${phase3.escalationReason}`);
    }
    if (!phase4?.success) {
      recommendations.push('Validation failed. Address reviewer feedback before proceeding.');
    }
    if (!phase5?.success) {
      recommendations.push('Verification failed. Fix build, lint, or test issues.');
    }
    if (recommendations.length === 0) {
      recommendations.push('All phases completed successfully. Ready for deployment.');
    }

    const report: CompletionReport = {
      workflowId: this.state.workflowId,
      timestamp: new Date(),
      duration,
      success: this.determineWorkflowSuccess(),
      summary,
      phases,
      recommendations,
      artifacts: {
        planPath: this.config.planPath || ''
      }
    };

    // Optionally save report to file
    const reportPath = path.join(this.workspacePath, '.ultra', 'reports', `${this.state.workflowId}.json`);
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      report.artifacts.reportPath = reportPath;
    } catch (error) {
      console.warn('[UltraLeadOrchestrator] Could not save report:', error);
    }

    return report;
  }

  /**
   * Determine overall workflow success
   */
  private determineWorkflowSuccess(): boolean {
    const phase2 = this.state.phaseResults.get(2) as PhaseResult;
    const phase3 = this.state.phaseResults.get(3) as QAReport;
    const phase4 = this.state.phaseResults.get(4) as ValidationResult;
    const phase5 = this.state.phaseResults.get(5) as VerificationResult;

    // All phases must pass
    return (
      (phase2?.success || false) &&
      ((phase3?.finalResult || 'failed') === 'passed') &&
      (phase4?.success || false) &&
      (phase5?.success || false)
    );
  }

  /**
   * Load plan from file
   */
  private async loadPlan(): Promise<OperationalPlan> {
    const planPath = this.config.planPath || path.join(this.workspacePath, '.ultra', 'plan-final.md');

    try {
      const content = await fs.readFile(planPath, 'utf-8');
      return this.parsePlan(content);
    } catch (error) {
      throw new Error(`Failed to load plan from ${planPath}: ${error}`);
    }
  }

  /**
   * Parse plan from markdown content
   */
  private parsePlan(content: string): OperationalPlan {
    const lines = content.split('\n');
    const phases: PhaseDefinition[] = [];
    let currentPhase: PhaseDefinition | null = null;
    let currentTasks: Array<{
      taskId: string;
      title: string;
      description: string;
      agentType: string;
      priority: string;
      estimatedHours: number;
    }> = [];
    let phaseNumber = 0;

    for (const line of lines) {
      // Check for phase headers (## Phase N: Name)
      const phaseMatch = line.match(/^##\s+Phase\s+(\d+):\s+(.+)$/);
      if (phaseMatch) {
        // Save previous phase
        if (currentPhase) {
          currentPhase.tasks = currentTasks;
          phases.push(currentPhase);
        }

        // Start new phase
        phaseNumber = parseInt(phaseMatch[1], 10);
        currentPhase = {
          phaseNumber,
          name: phaseMatch[2].trim(),
          tasks: [],
          dependencies: []
        };
        currentTasks = [];
        continue;
      }

      // Check for task items (- [ ] Task title: description)
      const taskMatch = line.match(/^-\s+\[\s*\]\s+(.+)/);
      if (taskMatch && currentPhase) {
        const taskText = taskMatch[1].trim();

        // Parse task details
        const parts = taskText.split(':');
        const title = parts[0].trim();
        const description = parts.slice(1).join(':').trim() || title;

        // Determine agent type from title
        let agentType = 'executor';
        if (title.toLowerCase().includes('test')) agentType = 'test-engineer';
        else if (title.toLowerCase().includes('review')) agentType = 'code-reviewer';
        else if (title.toLowerCase().includes('security')) agentType = 'security-reviewer';
        else if (title.toLowerCase().includes('architecture')) agentType = 'architect';
        else if (title.toLowerCase().includes('plan')) agentType = 'planner';

        currentTasks.push({
          taskId: `task-${phaseNumber}-${currentTasks.length + 1}`,
          title,
          description,
          agentType,
          priority: 'normal',
          estimatedHours: 2
        });
      }
    }

    // Save last phase
    if (currentPhase) {
      currentPhase.tasks = currentTasks;
      phases.push(currentPhase);
    }

    // Calculate totals
    let totalTasks = 0;
    let estimatedHours = 0;

    for (const phase of phases) {
      totalTasks += phase.tasks.length;
      for (const task of phase.tasks) {
        estimatedHours += task.estimatedHours;
      }
    }

    return {
      metadata: {
        planId: `plan-${Date.now()}`,
        version: '1.0',
        createdAt: new Date(),
        workspacePath: this.workspacePath
      },
      phases,
      totalTasks,
      estimatedHours
    };
  }

  /**
   * Publish event to message bus
   */
  private async publishEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.messageBus.publish(
        'ultra-lead-orchestrator',
        `workflow.${eventType}`,
        {
          type: eventType,
          payload: {
            ...payload,
            workspacePath: this.workspacePath,
            timestamp: new Date().toISOString()
          }
        }
      );
    } catch (error) {
      console.error('[UltraLeadOrchestrator] Failed to publish event:', error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Forward events from phase executors
    this.phaseExecutor.on('phase:started', (data) => {
      this.emit('phase:started', data);
    });

    this.phaseExecutor.on('phase:completed', (data) => {
      this.emit('phase:completed', data);
    });

    this.qaCoordinator.on('qa:complete', (data) => {
      this.emit('qa:complete', data);
    });

    this.validationCoordinator.on('validation:complete', (data) => {
      this.emit('validation:complete', data);
    });

    this.verificationEngine.on('verification:complete', (data) => {
      this.emit('verification:complete', data);
    });
  }

  /**
   * Generate workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current state
   */
  getState(): WorkflowExecutionState {
    return {
      ...this.state,
      phaseResults: new Map(this.state.phaseResults)
    };
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): OperationalPlan | null {
    return this.currentPlan;
  }

  /**
   * Check if workflow is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    isRunning: boolean;
    workflowId: string;
    currentPhase: number;
    totalPhases: number;
    taskQueueStats: any;
  } {
    return {
      isRunning: this.isRunning,
      workflowId: this.state.workflowId,
      currentPhase: this.state.currentPhase,
      totalPhases: this.state.totalPhases,
      taskQueueStats: this.taskQueue.getStats()
    };
  }

  /**
   * Reset orchestrator state
   */
  reset(): void {
    this.state = {
      workflowId: this.generateWorkflowId(),
      status: 'idle',
      currentPhase: 0,
      totalPhases: 4,
      errors: [],
      phaseResults: new Map()
    };
    this.currentPlan = null;
    this.phaseExecutor.reset();
    this.qaCoordinator.reset();
    this.validationCoordinator.reset();
    this.verificationEngine.reset();
  }
}

/**
 * Factory function
 */
export function createUltraLeadWorkflowOrchestrator(
  config: OrchestratorConfig
): UltraLeadWorkflowOrchestrator {
  return new UltraLeadWorkflowOrchestrator(config);
}
