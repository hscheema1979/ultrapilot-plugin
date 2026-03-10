/**
 * Autoloop Daemon - Persistent 60-second heartbeat for autonomous domain management
 *
 * Each workspace has its own autoloop daemon that:
 * - Runs forever (never stops)
 * - Checks task queues every 60 seconds
 * - Executes routine maintenance tasks
 * - Coordinates agents
 * - Updates heartbeat state
 *
 * "The boulder never stops."
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DomainManager, createDomainManager } from './DomainManager.js';
import { DomainConfig } from './DomainInitializer.js';
import { WorkingManager, createWorkingManager } from './WorkingManager.js';
import { Task } from './TaskQueue.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { SessionManager } from '../session/SessionManager.js';
import { createAutoloopEventPublisher, AutoloopEventPublisher } from './AutoloopEventPublisher.js';

const execAsync = promisify(exec);

/**
 * Autoloop state
 */
export interface AutoloopState {
  enabled: boolean;
  pid: number | null;
  startedAt: string | null;
  cycleCount: number;
  lastCycle: string | null;
  lastCycleDuration: number | null;
}

/**
 * Heartbeat state
 */
export interface HeartbeatState {
  status: 'idle' | 'running' | 'paused' | 'error';
  uptime: number; // milliseconds
  cyclesCompleted: number;
  tasksProcessed: number;
  lastError: string | null;
  lastUpdate: string;
}

/**
 * Routine execution result
 */
interface RoutineResult {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

/**
 * Autoloop cycle result
 */
interface CycleResult {
  cycleNumber: number;
  startTime: Date;
  endTime: Date;
  duration: number;
  tasksProcessed: number;
  routinesExecuted: RoutineResult[];
  errors: string[];
}

/**
 * Autoloop daemon configuration
 */
export interface AutoloopConfig {
  workspacePath: string;
  cycleTime: number; // seconds
  enableRoutines: boolean;
  enableTaskProcessing: boolean;
  enableHealthChecks: boolean;
  verboseLogging: boolean;
}

/**
 * Autoloop Daemon class
 */
export class AutoloopDaemon {
  private config: AutoloopConfig;
  private domainManager: DomainManager;
  private domainConfig: DomainConfig;
  private ultraPath: string;
  private workingManager: WorkingManager;

  // Message bus and session management
  private messageBus: AgentMessageBus;
  private sessionManager: SessionManager;
  private eventPublisher: AutoloopEventPublisher;

  // State
  private running: boolean = false;
  private paused: boolean = false;
  private cycleTimer?: NodeJS.Timeout;
  private startTime?: Date;
  private cycleCount: number = 0;

  // Statistics
  private totalTasksProcessed: number = 0;
  private totalRoutinesExecuted: number = 0;
  private totalErrors: number = 0;

  constructor(config: AutoloopConfig, messageBus?: AgentMessageBus, sessionManager?: SessionManager) {
    this.config = config;
    this.ultraPath = path.join(config.workspacePath, '.ultra');
    this.domainManager = createDomainManager({
      domainAgency: { enabled: false } // Start without domain-agency
    });

    // Initialize working manager (the "working manager" capability)
    this.workingManager = createWorkingManager({
      maxConcurrentTeams: 5,
      maxWorkersPerTeam: 5,
      preferIndividualExecutionUnderHours: 4,
      preferTeamExecutionOverHours: 8
    });

    // Initialize message bus and session manager (or use provided instances)
    this.messageBus = messageBus || new AgentMessageBus({
      dbPath: path.join(this.ultraPath, 'state', 'messages.db')
    });

    this.sessionManager = sessionManager || new SessionManager();

    // Initialize event publisher
    this.eventPublisher = createAutoloopEventPublisher({
      workspacePath: config.workspacePath,
      messageBus: this.messageBus,
      sessionManager: this.sessionManager,
      enabled: true
    });

    // Load domain config
    this.domainConfig = {} as DomainConfig; // Will load on start
  }

  /**
   * Start the autoloop daemon
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('⚠️  Autoloop already running');
      return;
    }

    console.log('🚀 Starting autoloop daemon...');
    console.log(`   Workspace: ${this.config.workspacePath}`);
    console.log(`   Cycle time: ${this.config.cycleTime}s`);

    // Initialize event publisher (creates AUTOLOOP session)
    await this.eventPublisher.initialize();

    // Load domain configuration
    await this.loadDomainConfig();

    // Start domain manager
    await this.domainManager.start();

    // Initialize state
    this.running = true;
    this.paused = false;
    this.startTime = new Date();

    // Update autoloop state file
    await this.updateAutoloopState({
      enabled: true,
      pid: process.pid,
      startedAt: this.startTime.toISOString(),
      cycleCount: 0,
      lastCycle: null,
      lastCycleDuration: null
    });

    // Start heartbeat cycle
    this.startHeartbeat();

    // Publish daemon started event
    await this.eventPublisher.publishDaemonStarted();

    console.log('✅ Autoloop daemon started');
    console.log(`   PID: ${process.pid}`);
    console.log(`   Session: ${this.eventPublisher.getSessionId() || 'N/A'}`);
    console.log('   "The boulder never stops." 🪨\n');
  }

  /**
   * Stop the autoloop daemon
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('🛑 Stopping autoloop daemon...');

    this.running = false;

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = undefined;
    }

    // Shutdown event publisher (publishes stopped event, closes session)
    await this.eventPublisher.shutdown();

    // Stop domain manager
    await this.domainManager.stop();

    // Close message bus connection
    await this.messageBus.close();

    // Update autoloop state file
    await this.updateAutoloopState({
      enabled: false,
      pid: null,
      startedAt: null,
      cycleCount: this.cycleCount,
      lastCycle: new Date().toISOString(),
      lastCycleDuration: null
    });

    console.log('✅ Autoloop daemon stopped');
  }

  /**
   * Pause the autoloop (keeps running but skips cycles)
   */
  async pause(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.paused = true;
    console.log('⏸️  Autoloop paused');

    // Publish paused event
    await this.eventPublisher.publishDaemonPaused();
  }

  /**
   * Resume the autoloop
   */
  async resume(): Promise<void> {
    if (!this.running || !this.paused) {
      return;
    }

    this.paused = false;
    console.log('▶️  Autoloop resumed');

    // Publish resumed event
    await this.eventPublisher.publishDaemonResumed();
  }

  /**
   * Start the heartbeat cycle
   */
  private startHeartbeat(): void {
    const cycle = async () => {
      if (!this.running) {
        return;
      }

      if (!this.paused) {
        await this.runCycle();
      }

      // Schedule next cycle
      this.cycleTimer = setTimeout(cycle, this.config.cycleTime * 1000);
    };

    // Start first cycle immediately
    cycle();
  }

  /**
   * Run a single heartbeat cycle
   */
  private async runCycle(): Promise<void> {
    const cycleNumber = ++this.cycleCount;
    const startTime = new Date();

    if (this.config.verboseLogging) {
      console.log(`\n[${new Date().toISOString()}] Cycle #${cycleNumber} starting...`);
    }

    const errors: string[] = [];
    let tasksProcessed = 0;
    const routineResults: RoutineResult[] = [];

    try {
      // 1. Process tasks (if enabled)
      if (this.config.enableTaskProcessing) {
        const processed = await this.processTasks();
        tasksProcessed = processed;
      }

      // 2. Execute routine maintenance tasks (if enabled)
      if (this.config.enableRoutines) {
        const routines = await this.executeRoutines();
        routineResults.push(...routines);
      }

      // 3. Health checks (if enabled)
      if (this.config.enableHealthChecks) {
        await this.runHealthChecks();
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);
      this.totalErrors++;
      console.error(`   ❌ Error: ${errorMsg}`);
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Update statistics
    this.totalTasksProcessed += tasksProcessed;
    this.totalRoutinesExecuted += routineResults.length;

    // Publish heartbeat event
    await this.eventPublisher.publishHeartbeat(cycleNumber, {
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      cyclesCompleted: this.cycleCount,
      tasksProcessed: this.totalTasksProcessed,
      routinesExecuted: this.totalRoutinesExecuted,
      errors: this.totalErrors
    });

    // Update heartbeat state
    await this.updateHeartbeatState({
      status: this.paused ? 'paused' : 'running',
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      cyclesCompleted: this.cycleCount,
      tasksProcessed: this.totalTasksProcessed,
      lastError: errors.length > 0 ? errors[0] : null,
      lastUpdate: new Date().toISOString()
    });

    // Update autoloop state
    await this.updateAutoloopState({
      enabled: true,
      pid: process.pid,
      startedAt: this.startTime?.toISOString() || null,
      cycleCount: this.cycleCount,
      lastCycle: endTime.toISOString(),
      lastCycleDuration: duration
    });

    // Publish cycle complete event
    await this.eventPublisher.publishCycleComplete({
      cycleNumber,
      startTime,
      endTime,
      duration,
      tasksProcessed,
      routinesExecuted: routineResults,
      errors
    });

    // Log cycle summary
    if (this.config.verboseLogging || errors.length > 0) {
      console.log(`   ✅ Cycle #${cycleNumber} complete (${duration}ms)`);
      console.log(`      Tasks: ${tasksProcessed}`);
      console.log(`      Routines: ${routineResults.length}`);
      if (errors.length > 0) {
        console.log(`      Errors: ${errors.length}`);
      }
    }
  }

  /**
   * Process tasks from queues
   * Implements the working manager pattern:
   * - Analyze task size/complexity
   * - Execute small tasks myself
   * - Spawn teams for medium/large tasks
   * - Coordinate multiple teams for huge tasks
   */
  private async processTasks(): Promise<number> {
    const taskQueue = this.domainManager.getTaskQueue();
    let processed = 0;

    // Get next task from intake
    const nextTask = taskQueue.getNextTask();
    if (!nextTask) {
      return 0;
    }

    try {
      console.log(`\n   [Autoloop] Processing task: ${nextTask.title}`);
      console.log(`   [Autoloop] Task ID: ${nextTask.id}`);

      // Publish task queued event
      const category = this.categorizeTask(nextTask);
      await this.eventPublisher.publishTaskQueued(nextTask.id, nextTask.title, category);

      // Step 1: Analyze task and determine execution strategy
      const strategy = this.workingManager.analyzeTask(nextTask);
      console.log(`   [Autoloop] Strategy: ${strategy.approach}`);

      // Step 2: Assign task to ultra-loop (this moves it to in-progress)
      await taskQueue.assignTask(nextTask.id, 'executor', 'ultra-loop');

      // Step 3: Execute by routing to appropriate skill
      console.log(`   [Autoloop] → Routing to specialist skill...`);

      const result = await this.routeAndExecuteTask(nextTask);

      // Step 4: Update task with result
      if (result?.success) {
        taskQueue.completeTask(nextTask.id, result);
        console.log(`   [Autoloop] ✅ Task completed successfully`);

        // Publish task completed event
        await this.eventPublisher.publishTaskCompleted(
          nextTask.id,
          nextTask.title,
          result,
          result.metadata?.duration as number || 0
        );

        processed++;
      } else {
        taskQueue.failTask(nextTask.id, result?.error || 'Unknown error');
        console.log(`   [Autoloop] ❌ Task failed: ${result?.error}`);
        this.totalErrors++;

        // Publish task failed event
        await this.eventPublisher.publishTaskFailed(
          nextTask.id,
          nextTask.title,
          result?.error || 'Unknown error',
          result.metadata?.duration as number || 0
        );
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   [Autoloop] ❌ Error processing task: ${errorMsg}`);
      this.totalErrors++;

      // Mark task as failed
      try {
        taskQueue.failTask(nextTask.id, errorMsg);
      } catch (failError) {
        console.error(`   [Autoloop] ❌ Failed to mark task as failed: ${failError}`);
      }
    }

    return processed;
  }

  /**
   * Route task to appropriate skill and execute using Claude CLI
   * Routes based on task category to specialist skills
   */
  private async routeAndExecuteTask(task: Task): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }> {
    const startTime = Date.now();

    try {
      // Step 1: Categorize task to determine which skill to use
      const category = this.categorizeTask(task);
      const skill = this.getSkillForCategory(category);

      console.log(`   [Autoloop] Task category: ${category}`);
      console.log(`   [Autoloop] Routing to skill: ${skill}`);

      // Publish task started event
      await this.eventPublisher.publishTaskStarted(task.id, task.title, skill);

      // Step 2: Build prompt for the skill
      const prompt = `/${skill} ${task.title}

Task ID: ${task.id}
Description: ${task.description}
Priority: ${task.priority === 10 ? 'CRITICAL' : task.priority >= 8 ? 'HIGH' : task.priority >= 5 ? 'NORMAL' : 'LOW'}
Status: ${task.status}
Tags: ${task.tags?.join(', ') || 'none'}

You are being spawned by autoloop to process this task from the intake queue.
Work autonomously:
- Analyze the requirements
- Execute the task using appropriate agents
- Complete the work
- Report results

Autoloop will trigger again in 60 seconds to process more tasks.`;

      // Invoke Claude CLI non-interactively using spawn to handle stdin
      const { spawn } = await import('child_process');

      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('claude', ['--print', '--output-format', 'json', '--no-session-persistence'], {
          cwd: this.config.workspacePath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data; });
        child.stderr?.on('data', (data) => { stderr += data; });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          }
        });

        child.on('error', reject);

        // Write prompt to stdin
        child.stdin?.write(prompt);
        child.stdin?.end();

        // Timeout after 5 minutes
        setTimeout(() => {
          child.kill();
          reject(new Error('Claude CLI timeout after 5 minutes'));
        }, 300000);
      });

      const { stdout, stderr } = result;

      const duration = Date.now() - startTime;

      // Parse output
      let output: string;
      let success = true;

      try {
        const result = JSON.parse(stdout);
        output = result.message || result.text || JSON.stringify(result);
      } catch {
        // If not JSON, use raw output
        output = stdout;
      }

      // Check for errors
      if (stderr && stderr.includes('error')) {
        success = false;
        console.error(`   [Autoloop] Claude CLI error: ${stderr}`);
      }

      console.log(`   [Autoloop] Agent completed in ${duration}ms`);

      // Publish agent spawned event
      const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.eventPublisher.publishAgentSpawned(agentId, skill, task.id);

      return {
        success,
        output,
        metadata: {
          executedBy: 'autoloop-daemon',
          executionMethod: `claude-cli-${skill}`,
          category,
          skill,
          duration,
          timestamp: new Date().toISOString(),
          agentId
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`   [Autoloop] ❌ Failed to spawn agent: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        metadata: {
          executedBy: 'autoloop-daemon',
          executionMethod: 'claude-cli-autoloop',
          duration,
          timestamp: new Date().toISOString(),
          failureReason: errorMsg
        }
      };
    }
  }

  /**
   * Categorize task based on tags, title, and description
   */
  private categorizeTask(task: Task): 'feature' | 'bug' | 'refactor' | 'security' | 'performance' | 'quality' | 'test' {
    const text = `${task.title} ${task.description} ${task.tags?.join(' ') || ''}`.toLowerCase();

    // Check for security-related keywords
    if (text.includes('security') || text.includes('vulnerability') || text.includes('auth') ||
        text.includes('injection') || text.includes('xss') || text.includes('csrf')) {
      return 'security';
    }

    // Check for performance keywords
    if (text.includes('performance') || text.includes('slow') || text.includes('optimize') ||
        text.includes('latency') || text.includes('memory') || text.includes('cpu')) {
      return 'performance';
    }

    // Check for bug keywords
    if (text.includes('bug') || text.includes('fix') || text.includes('error') ||
        text.includes('broken') || text.includes('fail') || text.includes('crash')) {
      return 'bug';
    }

    // Check for refactor keywords
    if (text.includes('refactor') || text.includes('clean up') || text.includes('reorganize') ||
        text.includes('rewrite') || text.includes('simplify')) {
      return 'refactor';
    }

    // Check for test keywords
    if (text.includes('test') || text.includes('testing') || text.includes('coverage') ||
        text.includes('spec') || text.includes('tdd')) {
      return 'test';
    }

    // Check for quality keywords
    if (text.includes('review') || text.includes('quality') || text.includes('lint') ||
        text.includes('code smell') || text.includes('technical debt')) {
      return 'quality';
    }

    // Default to feature
    return 'feature';
  }

  /**
   * Get the appropriate skill for a task category
   */
  private getSkillForCategory(category: string): string {
    const skillMap: Record<string, string> = {
      'feature': 'ultra-team',
      'bug': 'ultra-debugging',
      'refactor': 'ultra-code-review',
      'security': 'ultra-security-review',
      'performance': 'ultra-quality-review',
      'quality': 'ultra-quality-review',
      'test': 'ultra-tdd'
    };

    return skillMap[category] || 'ultra-team';
  }

  /**
   * Execute routine maintenance tasks
   */
  private async executeRoutines(): Promise<RoutineResult[]> {
    const results: RoutineResult[] = [];

    // Load routine configurations
    const routinesDir = path.join(this.ultraPath, 'routines');
    const routineFiles = await fs.readdir(routinesDir);

    for (const file of routineFiles) {
      if (!file.endsWith('.json')) continue;

      const routinePath = path.join(routinesDir, file);
      const routineConfig = JSON.parse(await fs.readFile(routinePath, 'utf-8'));

      if (!routineConfig.enabled) {
        continue;
      }

      const result = await this.executeRoutine(routineConfig);
      results.push(result);

      // Publish routine executed event
      await this.eventPublisher.publishRoutineExecuted(result);

      // Update routine file with last run
      routineConfig.lastRun = new Date().toISOString();
      if (!result.success) {
        routineConfig.failures++;
      }
      await fs.writeFile(routinePath, JSON.stringify(routineConfig, null, 2));
    }

    return results;
  }

  /**
   * Execute a single routine
   */
  private async executeRoutine(routine: any): Promise<RoutineResult> {
    const startTime = Date.now();

    try {
      // Execute the command
      const { exec } = await import('child_process');
      const output = await new Promise<string>((resolve, reject) => {
        exec(routine.command, { cwd: this.config.workspacePath }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout + stderr);
          }
        });
      });

      const duration = Date.now() - startTime;

      return {
        name: routine.name,
        success: true,
        duration,
        output
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      return {
        name: routine.name,
        success: false,
        duration,
        error: errorMsg
      };
    }
  }

  /**
   * Run health checks
   */
  private async runHealthChecks(): Promise<void> {
    const stats = this.domainManager.getStats();

    // Check for stuck tasks
    const taskQueue = this.domainManager.getTaskQueue();
    const inProgressTasks = taskQueue.getTasksByStatus('in-progress' as any);

    const now = Date.now();
    for (const task of inProgressTasks) {
      if (task.startedAt) {
        const elapsed = now - new Date(task.startedAt).getTime();
        const threshold = 2 * 60 * 60 * 1000; // 2 hours

        if (elapsed > threshold) {
          console.warn(`   ⚠️  Stuck task detected: ${task.id} (${Math.floor(elapsed / 1000 / 60)}min)`);
          // Could publish stuck task event here if needed
        }
      }
    }

    // Check queue health
    if (stats.tasks.failed > 10) {
      console.warn(`   ⚠️  High failure count: ${stats.tasks.failed} failed tasks`);
      // Could publish high failure count event here if needed
    }
  }

  /**
   * Load domain configuration
   */
  private async loadDomainConfig(): Promise<void> {
    const configPath = path.join(this.ultraPath, 'domain.json');
    const content = await fs.readFile(configPath, 'utf-8');
    this.domainConfig = JSON.parse(content);
  }

  /**
   * Update autoloop state file
   */
  private async updateAutoloopState(state: Partial<AutoloopState>): Promise<void> {
    const statePath = path.join(this.ultraPath, 'state', 'autoloop.json');

    let current: AutoloopState = {
      enabled: false,
      pid: null,
      startedAt: null,
      cycleCount: 0,
      lastCycle: null,
      lastCycleDuration: null
    };

    if (await this.fileExists(statePath)) {
      const content = await fs.readFile(statePath, 'utf-8');
      current = JSON.parse(content);
    }

    const updated = { ...current, ...state };
    await fs.writeFile(statePath, JSON.stringify(updated, null, 2));
  }

  /**
   * Update heartbeat state file
   */
  private async updateHeartbeatState(state: Partial<HeartbeatState>): Promise<void> {
    const statePath = path.join(this.ultraPath, 'state', 'heartbeat.json');

    let current: HeartbeatState = {
      status: 'idle',
      uptime: 0,
      cyclesCompleted: 0,
      tasksProcessed: 0,
      lastError: null,
      lastUpdate: new Date().toISOString()
    };

    if (await this.fileExists(statePath)) {
      const content = await fs.readFile(statePath, 'utf-8');
      current = JSON.parse(content);
    }

    const updated = { ...current, ...state };
    await fs.writeFile(statePath, JSON.stringify(updated, null, 2));
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get daemon statistics
   */
  getStats(): {
    running: boolean;
    paused: boolean;
    uptime: number;
    cyclesCompleted: number;
    tasksProcessed: number;
    routinesExecuted: number;
    errors: number;
  } {
    return {
      running: this.running,
      paused: this.paused,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      cyclesCompleted: this.cycleCount,
      tasksProcessed: this.totalTasksProcessed,
      routinesExecuted: this.totalRoutinesExecuted,
      errors: this.totalErrors
    };
  }

  /**
   * Force run a single cycle immediately
   */
  async forceCycle(): Promise<void> {
    if (!this.running) {
      throw new Error('Autoloop not running');
    }

    await this.runCycle();
  }
}

/**
 * Factory function to create autoloop daemon
 */
export function createAutoloopDaemon(config: AutoloopConfig): AutoloopDaemon {
  return new AutoloopDaemon(config);
}

/**
 * Run autoloop daemon as standalone process
 */
export async function runAutoloopDaemon(workspacePath: string = process.cwd()): Promise<void> {
  const daemon = createAutoloopDaemon({
    workspacePath,
    cycleTime: 60,
    enableRoutines: true,
    enableTaskProcessing: true,
    enableHealthChecks: true,
    verboseLogging: true
  });

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received SIGINT, shutting down gracefully...');
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n⚠️  Received SIGTERM, shutting down gracefully...');
    await daemon.stop();
    process.exit(0);
  });

  // Start the daemon
  await daemon.start();

  // Keep process alive
  process.stdin.resume();
}
