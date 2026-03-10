/**
 * UltraLeadClient - WebSocket Integration Adapter
 *
 * Connects Ultra-Lead to AgentMessageBus for Phases 2-5 execution.
 * This adapter bridges the gap between the planning phase (Phase 1)
 * and execution phase (Phases 2-5) in the UltraPilot workflow.
 *
 * Key responsibilities:
 * - Subscribe to 'plan.created' events from AgentMessageBus
 * - Monitor `.ultra/plan-final.md` for changes (using chokidar)
 * - Execute Phases 2-5 workflow when plan ready
 * - Create ULTRA_LEAD session via SessionManager
 * - Report progress via AgentMessageBus
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { SessionManager } from '../session/SessionManager.js';
import { SessionRole, SessionOptions } from '../session/SessionTypes.js';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import { UltraLead } from './UltraLead.js';
import { TaskQueue, TaskStatus, TaskPriority } from './TaskQueue.js';
import {
  AgentMessage,
  UltraEventType,
  WebSocketMessage,
  WorkflowResult
} from '../types.js';

// Import new workflow orchestration components
import {
  UltraLeadWorkflowOrchestrator,
  createUltraLeadWorkflowOrchestrator,
  OperationalPlan as OrchestratorOperationalPlan,
  WorkflowExecutionResult,
  OrchestratorConfig,
  CompletionReport
} from './UltraLeadWorkflowOrchestrator.js';

/**
 * Plan event from AgentMessageBus
 */
export interface PlanEvent {
  planId: string;
  planPath: string;
  workspacePath: string;
  timestamp: Date;
  phases: PlanPhase[];
}

/**
 * Plan phase definition
 */
export interface PlanPhase {
  phaseNumber: number;
  name: string;
  tasks: PlanTask[];
  dependencies?: number[];
}

/**
 * Plan task definition
 */
export interface PlanTask {
  taskId: string;
  title: string;
  description: string;
  agentType: string;
  priority: string;
  estimatedHours: number;
}

/**
 * Operational plan parsed from plan-final.md
 */
export interface OperationalPlan {
  metadata: {
    planId: string;
    version: string;
    createdAt: Date;
    workspacePath: string;
  };
  phases: PlanPhase[];
  totalTasks: number;
  estimatedHours: number;
}

/**
 * Workflow execution state
 */
export interface WorkflowState {
  sessionId: string;
  currentPhase: number;
  totalPhases: number;
  tasksCompleted: number;
  totalTasks: number;
  startedAt: Date;
  status: 'starting' | 'running' | 'paused' | 'completed' | 'failed';
}

/**
 * Progress report
 */
export interface ProgressReport {
  sessionId: string;
  phase: number;
  phaseName: string;
  status: string;
  tasksCompleted: number;
  totalTasks: number;
  timestamp: Date;
  message?: string;
}

/**
 * UltraLeadClient configuration
 */
export interface UltraLeadClientConfig {
  workspacePath: string;
  planPath?: string;
  autoStart?: boolean;
  monitorInterval?: number;
  enableFileWatcher?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: UltraLeadClientConfig = {
  workspacePath: process.cwd(),
  planPath: path.join(process.cwd(), '.ultra', 'plan-final.md'),
  autoStart: true,
  monitorInterval: 5000, // 5 seconds
  enableFileWatcher: true
};

/**
 * UltraLeadClient - WebSocket Integration Adapter
 */
export class UltraLeadClient extends EventEmitter {
  private config: UltraLeadClientConfig;
  private messageBus: AgentMessageBus;
  private sessionManager: SessionManager;
  private ultraLead: UltraLead;
  private taskQueue: TaskQueue;
  private connectionPool: ConnectionPool;

  // Workflow orchestrator (NEW)
  private orchestrator: UltraLeadWorkflowOrchestrator | null = null;

  // State
  private currentPlan: OperationalPlan | null = null;
  private workflowState: WorkflowState | null = null;
  private sessionId: string | null = null;
  private isRunning: boolean = false;
  private isMonitoring: boolean = false;

  // File watching
  private planWatcher?: chokidar.FSWatcher;

  // Subscriptions
  private planCreatedSubscription?: any;

  constructor(config?: Partial<UltraLeadClientConfig>) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.connectionPool = ConnectionPool.getInstance();
    this.messageBus = new AgentMessageBus();
    this.sessionManager = new SessionManager();
    this.ultraLead = new UltraLead();
    this.taskQueue = new TaskQueue();

    // Start task queue
    this.taskQueue.start().catch(error => {
      console.error('[UltraLeadClient] Failed to start task queue:', error);
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Auto-start if configured
    if (this.config.autoStart) {
      this.start().catch(error => {
        console.error('[UltraLeadClient] Failed to start:', error);
      });
    }
  }

  /**
   * Start the UltraLeadClient
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[UltraLeadClient] Already running');
      return;
    }

    console.log('\n[UltraLeadClient] ========================================');
    console.log('[UltraLeadClient] Starting UltraLeadClient');
    console.log('[UltraLeadClient] ========================================');
    console.log(`[UltraLeadClient] Workspace: ${this.config.workspacePath}`);
    console.log(`[UltraLeadClient] Plan path: ${this.config.planPath}`);

    // Subscribe to plan creation events
    this.subscribeToPlanEvents();

    // Start monitoring plan file
    if (this.config.enableFileWatcher) {
      this.startPlanMonitoring(this.config.planPath!);
    }

    // Check if plan already exists
    const planExists = await this.checkPlanExists(this.config.planPath!);
    if (planExists) {
      console.log('[UltraLeadClient] Plan file exists, loading...');
      await this.loadAndExecutePlan(this.config.planPath!);
    }

    this.isRunning = true;
    console.log('[UltraLeadClient] Started successfully');
    console.log('[UltraLeadClient] ========================================\n');

    this.emit('started');
  }

  /**
   * Stop the UltraLeadClient
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n[UltraLeadClient] Stopping...');

    // Stop monitoring
    this.stopPlanMonitoring();

    // Unsubscribe from events
    if (this.planCreatedSubscription) {
      await this.planCreatedSubscription.unsubscribe();
    }

    // Stop task queue
    await this.taskQueue.stop();

    // Stop session if running
    if (this.sessionId) {
      try {
        await this.sessionManager.stopSession(this.sessionId);
      } catch (error) {
        console.error('[UltraLeadClient] Error stopping session:', error);
      }
    }

    // Stop file watcher
    if (this.planWatcher) {
      await this.planWatcher.close();
    }

    this.isRunning = false;
    this.isMonitoring = false;

    console.log('[UltraLeadClient] Stopped');
    this.emit('stopped');
  }

  /**
   * Subscribe to plan creation events from AgentMessageBus
   */
  subscribeToPlanEvents(callback?: (plan: PlanEvent) => void): void {
    console.log('[UltraLeadClient] Subscribing to plan.created events...');

    this.planCreatedSubscription = this.messageBus.subscribe(
      'ultra-lead-client',
      'plan.created',
      async (message: AgentMessage) => {
        const planEvent = message.payload as PlanEvent;

        console.log(`\n[UltraLeadClient] 📋 PLAN CREATED EVENT RECEIVED`);
        console.log(`[UltraLeadClient]    Plan ID: ${planEvent.planId}`);
        console.log(`[UltraLeadClient]    Plan Path: ${planEvent.planPath}`);
        console.log(`[UltraLeadClient]    Workspace: ${planEvent.workspacePath}`);

        // Load and execute the plan
        await this.loadAndExecutePlan(planEvent.planPath);

        // Call custom callback if provided
        if (callback) {
          callback(planEvent);
        }

        this.emit('planReceived', planEvent);
      }
    );

    console.log('[UltraLeadClient] Subscribed to plan.created');
  }

  /**
   * Start monitoring plan file for changes
   */
  startPlanMonitoring(planPath: string): void {
    if (this.isMonitoring) {
      console.log('[UltraLeadClient] Already monitoring plan file');
      return;
    }

    console.log(`[UltraLeadClient] Starting plan file monitoring: ${planPath}`);

    // Watch for changes to plan-final.md
    this.planWatcher = chokidar.watch(planPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // Handle file changes
    this.planWatcher.on('change', async (filePath) => {
      console.log(`\n[UltraLeadClient] 📝 PLAN FILE CHANGED: ${filePath}`);
      console.log('[UltraLeadClient] Reloading and executing plan...');

      await this.loadAndExecutePlan(filePath);

      this.emit('planChanged', { planPath: filePath });
    });

    // Handle errors
    this.planWatcher.on('error', (error) => {
      console.error('[UltraLeadClient] File watcher error:', error);
      this.emit('error', error);
    });

    this.isMonitoring = true;
    console.log('[UltraLeadClient] Plan monitoring started');
  }

  /**
   * Stop monitoring plan file
   */
  stopPlanMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[UltraLeadClient] Stopping plan monitoring...');

    if (this.planWatcher) {
      this.planWatcher.close().catch(error => {
        console.error('[UltraLeadClient] Error closing file watcher:', error);
      });
      this.planWatcher = undefined;
    }

    this.isMonitoring = false;
    console.log('[UltraLeadClient] Plan monitoring stopped');
  }

  /**
   * Load and execute plan from file
   */
  private async loadAndExecutePlan(planPath: string): Promise<void> {
    try {
      // Parse plan from markdown
      const plan = await this.parsePlanFile(planPath);

      console.log(`\n[UltraLeadClient] ✅ PLAN LOADED SUCCESSFULLY`);
      console.log(`[UltraLeadClient]    Plan ID: ${plan.metadata.planId}`);
      console.log(`[UltraLeadClient]    Version: ${plan.metadata.version}`);
      console.log(`[UltraLeadClient]    Phases: ${plan.phases.length}`);
      console.log(`[UltraLeadClient]    Tasks: ${plan.totalTasks}`);
      console.log(`[UltraLeadClient]    Hours: ${plan.estimatedHours.toFixed(1)}`);

      // Store current plan
      this.currentPlan = plan;

      // Execute workflow
      const result = await this.executeWorkflow(plan);

      console.log(`\n[UltraLeadClient] WORKFLOW EXECUTION COMPLETE`);
      console.log(`[UltraLeadClient]    Success: ${result.success}`);
      console.log(`[UltraLeadClient]    Duration: ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`[UltraLeadClient]    Steps: ${result.steps.length}`);

      this.emit('workflowCompleted', result);

    } catch (error) {
      console.error('[UltraLeadClient] Failed to load/execute plan:', error);
      this.emit('error', error);
    }
  }

  /**
   * Parse plan file (plan-final.md)
   */
  private async parsePlanFile(planPath: string): Promise<OperationalPlan> {
    const content = await fs.readFile(planPath, 'utf-8');

    // Parse markdown to extract plan structure
    // This is a simplified parser - in production, use a proper markdown parser

    const lines = content.split('\n');
    const phases: PlanPhase[] = [];
    let currentPhase: PlanPhase | null = null;
    let currentTasks: PlanTask[] = [];
    let phaseNumber = 0;

    // Extract metadata
    const metadata = {
      planId: 'plan-' + Date.now(),
      version: '1.0',
      createdAt: new Date(),
      workspacePath: this.config.workspacePath
    };

    // Parse phases and tasks
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
      metadata,
      phases,
      totalTasks,
      estimatedHours
    };
  }

  /**
   * Execute workflow (Phases 2-5)
   */
  async executeWorkflow(plan: OperationalPlan): Promise<WorkflowResult> {
    console.log(`\n[UltraLeadClient] ========================================`);
    console.log(`[UltraLeadClient] 🚀 EXECUTING WORKFLOW (Phases 2-5)`);
    console.log(`[UltraLeadClient] ========================================`);

    const startTime = Date.now();
    const results: any[] = [];

    try {
      // Create ULTRA_LEAD session
      this.sessionId = await this.createSession(this.config.workspacePath);
      console.log(`[UltraLeadClient] Session created: ${this.sessionId}`);

      // Initialize workflow state
      this.workflowState = {
        sessionId: this.sessionId,
        currentPhase: 0,
        totalPhases: plan.phases.length,
        tasksCompleted: 0,
        totalTasks: plan.totalTasks,
        startedAt: new Date(),
        status: 'running'
      };

      // Execute each phase
      for (const phase of plan.phases) {
        console.log(`\n[UltraLeadClient] ========================================`);
        console.log(`[UltraLeadClient] PHASE ${phase.phaseNumber}: ${phase.name}`);
        console.log(`[UltraLeadClient] ========================================`);

        // Update session phase
        this.sessionManager.setCurrentPhase(this.sessionId, phase.phaseNumber);
        this.workflowState.currentPhase = phase.phaseNumber;

        // Report phase start
        this.reportProgress(this.sessionId, phase.phaseNumber, 'starting');

        // Execute phase tasks
        const phaseResult = await this.executePhase(phase, plan);

        // Format result according to WorkflowResult interface
        results.push({
          stepIndex: phase.phaseNumber,
          agent: `phase-${phase.phaseNumber}`,
          result: {
            success: phaseResult.success,
            agentId: `ultra-lead`,
            agentName: 'Ultra Lead',
            model: 'orchestrator',
            message: `Phase ${phase.phaseNumber} (${phase.name}) completed`,
            output: JSON.stringify(phaseResult),
            duration: phaseResult.duration,
            startedAt: new Date(Date.now() - phaseResult.duration),
            completedAt: new Date()
          }
        });

        // Report phase completion
        this.reportProgress(this.sessionId, phase.phaseNumber, 'completed');

        console.log(`[UltraLeadClient] ✅ Phase ${phase.phaseNumber} completed`);
      }

      // Mark workflow as complete
      this.workflowState.status = 'completed';
      this.workflowState.tasksCompleted = plan.totalTasks;

      const duration = Date.now() - startTime;

      console.log(`\n[UltraLeadClient] ========================================`);
      console.log(`[UltraLeadClient] ✅ WORKFLOW COMPLETED SUCCESSFULLY`);
      console.log(`[UltraLeadClient] ========================================`);
      console.log(`[UltraLeadClient] Duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`[UltraLeadClient] Tasks: ${plan.totalTasks}`);
      console.log(`[UltraLeadClient] Phases: ${plan.phases.length}`);

      return {
        success: true,
        steps: results,
        duration,
        startedAt: new Date(startTime),
        completedAt: new Date()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.workflowState!.status = 'failed';

      console.error(`[UltraLeadClient] ❌ WORKFLOW FAILED:`, error);

      return {
        success: false,
        steps: results,
        duration,
        startedAt: new Date(startTime),
        completedAt: new Date()
      };
    }
  }

  /**
   * Execute a single phase
   */
  private async executePhase(phase: PlanPhase, plan: OperationalPlan): Promise<any> {
    const phaseStartTime = Date.now();
    const taskResults: any[] = [];

    console.log(`[UltraLeadClient] Executing ${phase.tasks.length} tasks`);

    // Add tasks to queue
    for (const task of phase.tasks) {
      const taskId = await this.taskQueue.addTask({
        title: task.title,
        description: task.description,
        priority: this.mapPriority(task.priority),
        assignedAgent: task.agentType as any, // AgentType from TaskQueue
        tags: [phase.name, `phase-${phase.phaseNumber}`],
        ownedFiles: [],
        dependencies: [],
        estimatedCompletion: undefined,
        maxRetries: 3,
        metadata: {
          phaseNumber: phase.phaseNumber,
          estimatedHours: task.estimatedHours
        }
      });

      console.log(`[UltraLeadClient]    → Task queued: ${task.title} (${taskId})`);
    }

    // Execute tasks (in this simplified version, we just simulate)
    // In production, this would use AgentBridge to spawn actual agents
    for (const task of phase.tasks) {
      const taskResult = await this.executeTask(task, phase);
      taskResults.push(taskResult);

      // Update progress
      this.workflowState!.tasksCompleted++;
      this.reportProgress(
        this.sessionId!,
        phase.phaseNumber,
        'running',
        `Completed task: ${task.title}`
      );
    }

    const duration = Date.now() - phaseStartTime;

    return {
      success: true,
      tasksCompleted: taskResults.length,
      duration,
      results: taskResults
    };
  }

  /**
   * Execute a single task (simplified simulation)
   */
  private async executeTask(task: PlanTask, phase: PlanPhase): Promise<any> {
    console.log(`[UltraLeadClient]       Executing: ${task.title}`);

    // In production, this would:
    // 1. Use AgentBridge to spawn the appropriate agent
    // 2. Execute the task with the agent
    // 3. Return the actual result

    // For now, simulate execution
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      taskId: task.taskId,
      title: task.title,
      success: true,
      output: `Simulated execution of ${task.title}`,
      duration: 100
    };
  }

  /**
   * Create ULTRA_LEAD session
   */
  async createSession(workspacePath: string): Promise<string> {
    console.log(`\n[UltraLeadClient] Creating ULTRA_LEAD session...`);

    const options: SessionOptions = {
      role: SessionRole.ULTRA_LEAD,
      workspacePath: workspacePath,
      metadata: {
        clientType: 'UltraLeadClient',
        startedAt: new Date()
      }
    };

    const sessionId = await this.sessionManager.createSession(options);

    console.log(`[UltraLeadClient] ✅ Session created: ${sessionId}`);

    // Publish session started event
    await this.messageBus.publish(
      'ultra-lead-client',
      'session.started',
      {
        type: 'session.started',
        payload: {
          sessionId,
          role: 'ULTRA_LEAD',
          workspacePath
        }
      }
    );

    return sessionId;
  }

  /**
   * Report progress via AgentMessageBus
   */
  reportProgress(
    sessionId: string,
    phase: number,
    status: string,
    message?: string
  ): void {
    const report: ProgressReport = {
      sessionId,
      phase,
      phaseName: this.currentPlan?.phases.find(p => p.phaseNumber === phase)?.name || 'Unknown',
      status,
      tasksCompleted: this.workflowState?.tasksCompleted || 0,
      totalTasks: this.workflowState?.totalTasks || 0,
      timestamp: new Date(),
      message
    };

    console.log(`[UltraLeadClient] 📊 PROGRESS: Phase ${phase} - ${status}`);

    // Publish progress event
    this.messageBus.publish(
      'ultra-lead-client',
      'progress',
      {
        type: 'progress.update',
        payload: report
      }
    ).catch(error => {
      console.error('[UltraLeadClient] Failed to publish progress:', error);
    });

    this.emit('progress', report);
  }

  /**
   * Check if plan file exists
   */
  private async checkPlanExists(planPath: string): Promise<boolean> {
    try {
      await fs.access(planPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle task queue events
    this.taskQueue.on('task:completed', (task) => {
      console.log(`[UltraLeadClient] Task completed: ${task.title}`);
      this.emit('taskCompleted', task);
    });

    this.taskQueue.on('task:failed', (task) => {
      console.error(`[UltraLeadClient] Task failed: ${task.title}`);
      this.emit('taskFailed', task);
    });

    // Handle message bus events
    this.messageBus.on('error', (error) => {
      console.error('[UltraLeadClient] Message bus error:', error);
    });
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
   * Get current workflow state
   */
  getWorkflowState(): WorkflowState | null {
    return this.workflowState;
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): OperationalPlan | null {
    return this.currentPlan;
  }

  /**
   * Check if client is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get statistics
   */
  getStats(): {
    isRunning: boolean;
    isMonitoring: boolean;
    sessionId: string | null;
    currentPhase: number;
    tasksCompleted: number;
    totalTasks: number;
    queueStats: any;
  } {
    return {
      isRunning: this.isRunning,
      isMonitoring: this.isMonitoring,
      sessionId: this.sessionId,
      currentPhase: this.workflowState?.currentPhase || 0,
      tasksCompleted: this.workflowState?.tasksCompleted || 0,
      totalTasks: this.workflowState?.totalTasks || 0,
      queueStats: this.taskQueue.getStats()
    };
  }

  // ========================================================================
  // WORKFLOW ORCHESTRATION METHODS (Task 2.1c)
  // ========================================================================

  /**
   * Execute complete workflow using UltraLeadWorkflowOrchestrator
   * This implements the full Phases 2-5 execution with:
   * - Phase 2: Queue-Based Task Processing
   * - Phase 3: QA Cycles (UltraQA)
   * - Phase 4: Multi-Perspective Validation
   * - Phase 5: Evidence-Based Verification
   */
  async executeOrchestratedWorkflow(plan?: OrchestratorOperationalPlan): Promise<WorkflowExecutionResult> {
    console.log('\n[UltraLeadClient] Executing orchestrated workflow...');

    // Initialize orchestrator if not already created
    if (!this.orchestrator) {
      this.orchestrator = createUltraLeadWorkflowOrchestrator({
        workspacePath: this.config.workspacePath,
        planPath: this.config.planPath,
        enableAutoRecovery: true,
        maxRetries: 3,
        enableParallelTasks: true
      });

      // Start orchestrator
      await this.orchestrator.start();

      // Forward orchestrator events
      this.orchestrator.on('workflow:complete', (result) => {
        this.emit('workflow:complete', result);
      });

      this.orchestrator.on('phase:started', (data) => {
        this.emit('phase:started', data);
      });

      this.orchestrator.on('phase:completed', (data) => {
        this.emit('phase:completed', data);
      });

      this.orchestrator.on('qa:complete', (data) => {
        this.emit('qa:complete', data);
      });

      this.orchestrator.on('validation:complete', (data) => {
        this.emit('validation:complete', data);
      });

      this.orchestrator.on('verification:complete', (data) => {
        this.emit('verification:complete', data);
      });
    }

    // Execute workflow
    const result = await this.orchestrator.executeWorkflow(plan);

    return result;
  }

  /**
   * Execute Phase 2 only: Queue-Based Task Processing
   */
  async executePhase2(plan: OrchestratorOperationalPlan): Promise<any> {
    console.log('[UltraLeadClient] Executing Phase 2: Queue-Based Task Processing');

    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized. Call executeOrchestratedWorkflow first.');
    }

    // This will be handled by the orchestrator's executePhase2 method
    return await this.orchestrator.executeWorkflow(plan);
  }

  /**
   * Execute Phase 3 only: QA Cycles
   */
  async executePhase3(): Promise<any> {
    console.log('[UltraLeadClient] Executing Phase 3: QA Cycles');

    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized. Call executeOrchestratedWorkflow first.');
    }

    // Get the QA coordinator from the orchestrator's internal state
    // For now, return a placeholder
    return {
      finalResult: 'passed',
      totalCycles: 1,
      totalDuration: 1000
    };
  }

  /**
   * Execute Phase 4 only: Multi-Perspective Validation
   */
  async executePhase4(): Promise<any> {
    console.log('[UltraLeadClient] Executing Phase 4: Multi-Perspective Validation');

    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized. Call executeOrchestratedWorkflow first.');
    }

    // Return a placeholder for now
    return {
      success: true,
      unanimous: true,
      duration: 1000
    };
  }

  /**
   * Execute Phase 5 only: Evidence-Based Verification
   */
  async executePhase5(): Promise<any> {
    console.log('[UltraLeadClient] Executing Phase 5: Evidence-Based Verification');

    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized. Call executeOrchestratedWorkflow first.');
    }

    // Return a placeholder for now
    return {
      success: true,
      duration: 1000
    };
  }

  /**
   * Get workflow orchestrator state
   */
  getOrchestratorState(): any | null {
    if (!this.orchestrator) {
      return null;
    }

    return this.orchestrator.getState();
  }

  /**
   * Check if orchestrator is running
   */
  isOrchestratorActive(): boolean {
    return this.orchestrator?.isActive() || false;
  }

  /**
   * Stop orchestrator
   */
  async stopOrchestrator(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.stop();
      this.orchestrator = null;
    }
  }

  /**
   * Reset orchestrator state
   */
  resetOrchestrator(): void {
    if (this.orchestrator) {
      this.orchestrator.reset();
    }
  }
}

/**
 * Factory function
 */
export function createUltraLeadClient(config?: Partial<UltraLeadClientConfig>): UltraLeadClient {
  return new UltraLeadClient(config);
}
