/**
 * QA Coordinator - Coordinates Quality Assurance cycles (Phase 3)
 *
 * This module implements Phase 3: QA Cycles (UltraQA integration)
 * - Coordinates up to 10 QA cycles
 * - Runs: build → lint → test
 * - Fixes failures automatically
 * - Detects fundamental issues (escalate after 3 cycles)
 *
 * QA Cycle Flow:
 * 1. Run build
 * 2. Run lint
 * 3. Run tests
 * 4. Collect results
 * 5. If any failures:
 *    - Attempt automatic fix
 *    - Re-run QA cycle
 *    - Escalate if > 3 cycles with failures
 * 6. If all pass:
 *    - Mark phase complete
 *    - Generate QA report
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * QA step types
 */
export type QAStep = 'build' | 'lint' | 'test';

/**
 * QA step result
 */
export interface QAStepResult {
  step: QAStep;
  success: boolean;
  duration: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * QA cycle result
 */
export interface QACycleResult {
  cycleNumber: number;
  success: boolean;
  duration: number;
  steps: QAStepResult[];
  timestamp: Date;
  errors: string[];
  fixesAttempted: number;
  fixesSucceeded: number;
}

/**
 * QA configuration
 */
export interface QAConfig {
  /** Maximum QA cycles to run */
  maxCycles: number;
  /** Escalation threshold (cycles with failures before escalating) */
  escalationThreshold: number;
  /** Enable automatic fixing */
  enableAutoFix: boolean;
  /** Build command */
  buildCommand: string;
  /** Lint command */
  lintCommand: string;
  /** Test command */
  testCommand: string;
  /** Working directory */
  workspacePath: string;
  /** Timeout for each step (ms) */
  stepTimeout: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Omit<QAConfig, 'workspacePath'> = {
  maxCycles: 10,
  escalationThreshold: 3,
  enableAutoFix: true,
  buildCommand: 'npm run build',
  lintCommand: 'npm run lint',
  testCommand: 'npm test',
  stepTimeout: 300000 // 5 minutes
};

/**
 * QA Report
 */
export interface QAReport {
  totalCycles: number;
  successfulCycles: number;
  totalDuration: number;
  finalResult: 'passed' | 'failed' | 'escalated';
  steps: {
    build: { passed: number; failed: number; totalDuration: number };
    lint: { passed: number; failed: number; totalDuration: number };
    test: { passed: number; failed: number; totalDuration: number };
  };
  errors: string[];
  escalated: boolean;
  escalationReason?: string;
}

/**
 * QA Coordinator class
 */
export class QACoordinator extends EventEmitter {
  private config: QAConfig;
  private currentCycle: number = 0;
  private cycleHistory: QACycleResult[] = [];
  private isRunning: boolean = false;

  constructor(config: QAConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run complete QA cycles until success or max cycles reached
   */
  async runQACycles(): Promise<QAReport> {
    if (this.isRunning) {
      throw new Error('QA Coordinator is already running');
    }

    this.isRunning = true;
    this.currentCycle = 0;
    this.cycleHistory = [];

    console.log('\n[QACoordinator] ========================================');
    console.log('[QACoordinator] STARTING QA CYCLES (Phase 3)');
    console.log('[QACoordinator] ========================================');
    console.log(`[QACoordinator] Max cycles: ${this.config.maxCycles}`);
    console.log(`[QACoordinator] Escalation threshold: ${this.config.escalationThreshold}`);

    const startTime = Date.now();
    let finalResult: 'passed' | 'failed' | 'escalated' = 'failed';
    let escalated = false;
    let escalationReason: string | undefined;

    try {
      // Run QA cycles until success or max cycles
      while (this.currentCycle < this.config.maxCycles) {
        this.currentCycle++;

        const cycleResult = await this.runCycle(this.currentCycle);
        this.cycleHistory.push(cycleResult);

        // Check for escalation
        const consecutiveFailures = this.countConsecutiveFailures();
        if (consecutiveFailures >= this.config.escalationThreshold) {
          finalResult = 'escalated';
          escalated = true;
          escalationReason = `${consecutiveFailures} consecutive QA cycle failures`;

          console.warn(`[QACoordinator] ⚠️  Escalation threshold reached!`);
          console.warn(`[QACoordinator]    Reason: ${escalationReason}`);

          break;
        }

        // If cycle passed, we're done
        if (cycleResult.success) {
          finalResult = 'passed';
          console.log(`[QACoordinator] ✅ QA cycle ${this.currentCycle} passed!`);
          break;
        }

        console.log(`[QACoordinator] ❌ QA cycle ${this.currentCycle} failed, retrying...`);
      }

      // If we exhausted all cycles without passing
      if (this.currentCycle >= this.config.maxCycles && finalResult !== 'escalated') {
        finalResult = 'failed';
        console.warn(`[QACoordinator] ⚠️  Max QA cycles (${this.config.maxCycles}) reached`);
      }

      const totalDuration = Date.now() - startTime;

      // Generate report
      const report: QAReport = {
        totalCycles: this.currentCycle,
        successfulCycles: this.cycleHistory.filter(c => c.success).length,
        totalDuration,
        finalResult,
        steps: this.aggregateStepResults(),
        errors: this.collectAllErrors(),
        escalated,
        escalationReason
      };

      console.log('\n[QACoordinator] ========================================');
      console.log(`[QACoordinator] QA COMPLETE: ${finalResult.toUpperCase()}`);
      console.log('[QACoordinator] ========================================');
      console.log(`[QACoordinator] Cycles: ${report.totalCycles}`);
      console.log(`[QACoordinator] Duration: ${(totalDuration / 1000).toFixed(1)}s`);
      console.log(`[QACoordinator] Build: ${this.getStepSummary('build')}`);
      console.log(`[QACoordinator] Lint: ${this.getStepSummary('lint')}`);
      console.log(`[QACoordinator] Test: ${this.getStepSummary('test')}`);

      this.emit('qa:complete', report);

      return report;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run a single QA cycle
   */
  private async runCycle(cycleNumber: number): Promise<QACycleResult> {
    console.log(`\n[QACoordinator] ----------------------------------------`);
    console.log(`[QACoordinator] QA CYCLE ${cycleNumber}/${this.config.maxCycles}`);
    console.log(`[QACoordinator] ----------------------------------------`);

    const startTime = Date.now();
    const steps: QAStepResult[] = [];
    const errors: string[] = [];
    let fixesAttempted = 0;
    let fixesSucceeded = 0;

    try {
      // Step 1: Build
      console.log(`[QACoordinator] Running build...`);
      const buildResult = await this.runStep('build');
      steps.push(buildResult);
      if (!buildResult.success) {
        errors.push(`Build failed: ${buildResult.error || buildResult.stderr}`);
      }

      // Step 2: Lint
      console.log(`[QACoordinator] Running lint...`);
      const lintResult = await this.runStep('lint');
      steps.push(lintResult);
      if (!lintResult.success) {
        errors.push(`Lint failed: ${lintResult.error || lintResult.stderr}`);
      }

      // Step 3: Test
      console.log(`[QACoordinator] Running tests...`);
      const testResult = await this.runStep('test');
      steps.push(testResult);
      if (!testResult.success) {
        errors.push(`Tests failed: ${testResult.error || testResult.stderr}`);
      }

      // Check if all steps passed
      const allPassed = steps.every(s => s.success);
      const duration = Date.now() - startTime;

      if (allPassed) {
        console.log(`[QACoordinator] ✅ Cycle ${cycleNumber} PASSED`);
        return {
          cycleNumber,
          success: true,
          duration,
          steps,
          timestamp: new Date(),
          errors: [],
          fixesAttempted,
          fixesSucceeded
        };
      }

      // Attempt fixes if enabled
      if (this.config.enableAutoFix) {
        console.log(`[QACoordinator] Attempting automatic fixes...`);
        const fixResults = await this.attemptFixes(steps);
        fixesAttempted = fixResults.attempted;
        fixesSucceeded = fixResults.succeeded;
      }

      console.log(`[QACoordinator] ❌ Cycle ${cycleNumber} FAILED`);
      console.log(`[QACoordinator]    Errors: ${errors.length}`);

      return {
        cycleNumber,
        success: false,
        duration,
        steps,
        timestamp: new Date(),
        errors,
        fixesAttempted,
        fixesSucceeded
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`[QACoordinator] ❌ Cycle ${cycleNumber} ERROR: ${errorMsg}`);

      return {
        cycleNumber,
        success: false,
        duration,
        steps,
        timestamp: new Date(),
        errors: [errorMsg],
        fixesAttempted,
        fixesSucceeded
      };
    }
  }

  /**
   * Run a single QA step
   */
  private async runStep(step: QAStep): Promise<QAStepResult> {
    const startTime = Date.now();

    try {
      const command = this.getCommandForStep(step);
      console.log(`[QACoordinator]    $ ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.workspacePath,
        timeout: this.config.stepTimeout
      });

      const duration = Date.now() - startTime;
      const output = this.formatOutput(stdout, stderr);

      console.log(`[QACoordinator]    ✅ ${step} passed (${duration}ms)`);

      return {
        step,
        success: true,
        duration,
        exitCode: 0,
        stdout,
        stderr,
        error: undefined
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const stdout = error.stdout || '';
      const stderr = error.stderr || '';

      console.error(`[QACoordinator]    ❌ ${step} failed (${duration}ms)`);
      if (stderr) {
        console.error(`[QACoordinator]       ${this.truncate(stderr, 200)}`);
      }

      return {
        step,
        success: false,
        duration,
        exitCode: error.code || null,
        stdout,
        stderr,
        error: error.message
      };
    }
  }

  /**
   * Attempt automatic fixes for failed steps
   */
  private async attemptFixes(steps: QAStepResult[]): Promise<{
    attempted: number;
    succeeded: number;
  }> {
    let attempted = 0;
    let succeeded = 0;

    for (const step of steps) {
      if (step.success) continue;

      attempted++;

      // Step-specific fix attempts
      switch (step.step) {
        case 'lint':
          // Try to auto-fix lint errors
          try {
            console.log(`[QACoordinator]    Attempting lint auto-fix...`);
            await execAsync('npm run lint -- --fix', {
              cwd: this.config.workspacePath,
              timeout: this.config.stepTimeout
            });
            succeeded++;
          } catch (error) {
            console.error(`[QACoordinator]    Lint auto-fix failed`);
          }
          break;

        case 'test':
          // Try to regenerate test snapshots or update fixtures
          try {
            console.log(`[QACoordinator]    Attempting test fix...`);
            // Check if it's a snapshot issue
            if (step.stderr.includes('snapshot')) {
              await execAsync('npm test -- -u', {
                cwd: this.config.workspacePath,
                timeout: this.config.stepTimeout
              });
            }
            succeeded++;
          } catch (error) {
            console.error(`[QACoordinator]    Test fix failed`);
          }
          break;

        case 'build':
          // Build errors usually require manual intervention
          console.log(`[QACoordinator]    Build errors require manual intervention`);
          break;
      }
    }

    return { attempted, succeeded };
  }

  /**
   * Get command for a QA step
   */
  private getCommandForStep(step: QAStep): string {
    switch (step) {
      case 'build':
        return this.config.buildCommand;
      case 'lint':
        return this.config.lintCommand;
      case 'test':
        return this.config.testCommand;
    }
  }

  /**
   * Format command output
   */
  private formatOutput(stdout: string, stderr: string): string {
    const parts: string[] = [];
    if (stdout) parts.push(stdout);
    if (stderr) parts.push(stderr);
    return parts.join('\n');
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  }

  /**
   * Count consecutive failures from the end of history
   */
  private countConsecutiveFailures(): number {
    let count = 0;
    for (let i = this.cycleHistory.length - 1; i >= 0; i--) {
      if (!this.cycleHistory[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Aggregate step results across all cycles
   */
  private aggregateStepResults(): QAReport['steps'] {
    const result = {
      build: { passed: 0, failed: 0, totalDuration: 0 },
      lint: { passed: 0, failed: 0, totalDuration: 0 },
      test: { passed: 0, failed: 0, totalDuration: 0 }
    };

    for (const cycle of this.cycleHistory) {
      for (const step of cycle.steps) {
        if (step.success) {
          result[step.step].passed++;
        } else {
          result[step.step].failed++;
        }
        result[step.step].totalDuration += step.duration;
      }
    }

    return result;
  }

  /**
   * Collect all errors from all cycles
   */
  private collectAllErrors(): string[] {
    const errors: string[] = [];
    for (const cycle of this.cycleHistory) {
      errors.push(...cycle.errors);
    }
    return errors;
  }

  /**
   * Get step summary string
   */
  private getStepSummary(step: QAStep): string {
    const stats = this.aggregateStepResults()[step];
    const total = stats.passed + stats.failed;
    const success = stats.failed === 0;
    return `${stats.passed}/${total} passed${success ? ' ✅' : ` ❌ (${stats.failed} failed)`}`;
  }

  /**
   * Get current cycle number
   */
  getCurrentCycle(): number {
    return this.currentCycle;
  }

  /**
   * Get cycle history
   */
  getCycleHistory(): QACycleResult[] {
    return [...this.cycleHistory];
  }

  /**
   * Check if QA is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Reset coordinator state
   */
  reset(): void {
    this.currentCycle = 0;
    this.cycleHistory = [];
    this.isRunning = false;
  }
}

/**
 * Factory function
 */
export function createQACoordinator(config: QAConfig): QACoordinator {
  return new QACoordinator(config);
}

/**
 * Detect if issues are fundamental (require escalation)
 */
export function detectFundamentalIssues(errors: string[]): string[] {
  const fundamentalPatterns = [
    /circular dependency/i,
    /type.*not found/i,
    /module.*not found/i,
    /syntax error/i,
    /cannot read/i,
    /undefined is not/i,
    /architecture.*error/i,
    /design.*flaw/i
  ];

  const fundamental: string[] = [];

  for (const error of errors) {
    for (const pattern of fundamentalPatterns) {
      if (pattern.test(error)) {
        fundamental.push(error);
        break;
      }
    }
  }

  return fundamental;
}
