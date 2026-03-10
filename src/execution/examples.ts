/**
 * Integration Examples for Parallel Execution Layer
 *
 * Shows how to integrate ParallelExecutor into Ultrapilot workflows
 */

import { ParallelExecutor } from './parallel-task.js';
import { writeState, readState, initAutopilotState, AutopilotState, RalphState } from '../state.js';
import { join } from 'path';

/**
 * Example 1: Phase 2 Execution - Team Implementation
 *
 * Demonstrates how Phase 2 (Execution) uses parallel execution
 * for team-based implementation with file ownership boundaries.
 */
export async function phase2ExecutionExample(projectRoot: string) {
  console.log('\n=== Phase 2: Parallel Team Execution ===\n');

  // Read implementation plan from .ultra/plan.md
  const plan = readImplementationPlan(projectRoot);

  // Create parallel tasks with file ownership
  const tasks = plan.phases.execution.tasks.map(task => ({
    id: task.id,
    agentType: task.agentType || 'ultra:team-implementer',
    prompt: task.description,
    fileOwnership: {
      ownedPaths: task.ownedPaths || []
    }
  }));

  console.log(`Executing ${tasks.length} tasks in parallel...`);

  // Execute with progress tracking
  const result = await ParallelExecutor.executeParallel(tasks, {
    verbose: true,
    onProgress: (progress) => {
      // Update autopilot state
      const state = readState<AutopilotState>(projectRoot, 'autopilot');
      if (state) {
        writeState(projectRoot, 'autopilot', {
          ...state,
          tasks: {
            total: progress.total,
            completed: progress.completed,
            pending: progress.total - progress.completed
          },
          activeAgents: tasks.length,
          agentDetails: tasks.map(t => ({
            type: t.agentType,
            model: getAgentModel(t.agentType),
            duration: 0,
            description: t.prompt.substring(0, 50) + '...'
          }))
        });
      }

      // Update HUD
      updateHUD(
        `EXEC | tasks:${progress.completed}/${progress.total} | agents:${tasks.length}`
      );
    }
  });

  console.log(`\nExecution complete!`);
  console.log(`  Completed: ${result.completed}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Speedup: ${result.speedup?.toFixed(2)}x`);
  console.log(`  Total time: ${result.totalTime}ms`);

  return result;
}

/**
 * Example 2: Ralph Loop - Parallel Hypothesis Testing
 *
 * Demonstrates how Ralph mode can test multiple hypotheses in parallel
 * when debugging independent issues.
 */
export async function ralphParallelDebugging(
  projectRoot: string,
  errors: Array<{ id: string; message: string; affectedFiles: string[] }>
) {
  console.log('\n=== Ralph Loop: Parallel Hypothesis Testing ===\n');

  const ralphState = readState<RalphState>(projectRoot, 'ralph');
  if (!ralphState) {
    throw new Error('Ralph mode not active');
  }

  // Group errors by independence (non-overlapping files)
  const independentGroups = groupIndependentErrors(errors);

  for (const group of independentGroups) {
    if (group.length === 1) {
      // Sequential execution for single error
      const errorGroup = Array.isArray(group) ? group : [group];
      console.log(`Sequential fix for: ${errorGroup[0].id}`);
      await fixErrorSequentially(errorGroup[0]);
    } else {
      // Parallel execution for independent errors
      const errorGroup = Array.isArray(group) ? group : [group];
      console.log(`Parallel fix for ${errorGroup.length} independent errors`);

      const tasks = errorGroup.map(error => ({
        id: `fix-${error.id}`,
        agentType: 'ultra:team-debugger',
        prompt: `Fix error: ${error.message}`,
        fileOwnership: {
          ownedPaths: error.affectedFiles
        }
      }));

      const result = await ParallelExecutor.executeParallel(tasks, {
        onProgress: (progress) => {
          updateHUD(
            `RALPH | ralph:${ralphState.iteration}/10 | ` +
            `fixing:${progress.completed}/${progress.total} | ` +
            `errors:${errors.length}`
          );
        }
      });

      // Update error history
      if (result.failed > 0) {
        ralphState.errorHistory?.push(
          ...result.results
            .filter(r => r.status === 'failed')
            .map(r => ({
              iteration: ralphState.iteration,
              error: r.error?.message || 'Unknown error',
              timestamp: new Date().toISOString()
            }))
        );
      }

      writeState(projectRoot, 'ralph', ralphState);
    }
  }
}

/**
 * Example 3: Phase 4 - Multi-Dimensional Review
 *
 * Demonstrates parallel execution of multiple review agents
 * (security, quality, architecture, code) simultaneously.
 */
export async function phase4MultiReview(projectRoot: string, filesToReview: string[]) {
  console.log('\n=== Phase 4: Multi-Dimensional Review ===\n');

  const tasks = [
    {
      id: 'security-review',
      agentType: 'ultra:security-reviewer',
      prompt: `Review these files for security vulnerabilities:\n${filesToReview.join('\n')}`,
      fileOwnership: { ownedPaths: [] } // Reviewers don't modify files
    },
    {
      id: 'quality-review',
      agentType: 'ultra:quality-reviewer',
      prompt: `Review these files for performance and quality issues:\n${filesToReview.join('\n')}`,
      fileOwnership: { ownedPaths: [] }
    },
    {
      id: 'architecture-review',
      agentType: 'ultra:architect',
      prompt: `Review these files for architectural concerns:\n${filesToReview.join('\n')}`,
      fileOwnership: { ownedPaths: [] }
    },
    {
      id: 'code-review',
      agentType: 'ultra:code-reviewer',
      prompt: `Comprehensive code review of:\n${filesToReview.join('\n')}`,
      fileOwnership: { ownedPaths: [] }
    }
  ];

  console.log(`Running ${tasks.length} parallel reviews...`);

  const result = await ParallelExecutor.executeParallel(tasks, {
    onProgress: (progress) => {
      updateHUD(
        `VALID | review:${progress.completed}/${tasks.length} | ` +
        `files:${filesToReview.length}`
      );
    }
  });

  // Aggregate findings
  const findings = result.results
    .filter(r => r.status === 'completed' && r.result)
    .flatMap(r => (r.result as any).findings || []);

  console.log(`\nReview complete!`);
  console.log(`  Total findings: ${findings.length}`);
  console.log(`  Critical: ${findings.filter(f => f.severity === 'critical').length}`);
  console.log(`  High: ${findings.filter(f => f.severity === 'high').length}`);

  return { result, findings };
}

/**
 * Example 4: UltraQA - Parallel Test Execution
 *
 * Demonstrates parallel execution of test suites
 */
export async function ultraqaParallelTests(projectRoot: string) {
  console.log('\n=== UltraQA: Parallel Test Execution ===\n');

  const testSuites = [
    { name: 'unit', paths: ['tests/unit/**/*.test.ts'] },
    { name: 'integration', paths: ['tests/integration/**/*.test.ts'] },
    { name: 'e2e', paths: ['tests/e2e/**/*.test.ts'] }
  ];

  const tasks = testSuites.map(suite => ({
    id: `test-${suite.name}`,
    agentType: 'ultra:test-engineer',
    prompt: `Run test suite: ${suite.paths.join(', ')}`,
    fileOwnership: { ownedPaths: [] }
  }));

  const result = await ParallelExecutor.executeParallel(tasks, {
    onProgress: (progress) => {
      updateHUD(
        `QA | test:${progress.completed}/${tasks.length} | ` +
        `running`
      );
    }
  });

  // Aggregate test results
  const totalPassed = result.results.reduce((sum, r) =>
    sum + ((r.result as any)?.passed || 0), 0
  );
  const totalFailed = result.results.reduce((sum, r) =>
    sum + ((r.result as any)?.failed || 0), 0
  );

  console.log(`\nTest results: ${totalPassed} passed, ${totalFailed} failed`);

  return { result, totalPassed, totalFailed };
}

/**
 * Helper: Read implementation plan
 */
function readImplementationPlan(projectRoot: string) {
  const planPath = join(projectRoot, '.ultra', 'plan.md');
  // In production, this would parse the actual plan.md file
  return {
    phases: {
      execution: {
        tasks: [
          {
            id: 'auth-module',
            agentType: 'ultra:team-implementer',
            description: 'Implement authentication module',
            ownedPaths: ['src/auth/', 'src/middleware/auth.ts']
          },
          {
            id: 'task-crud',
            agentType: 'ultra:team-implementer',
            description: 'Implement task CRUD',
            ownedPaths: ['src/tasks/', 'src/api/tasks.ts']
          },
          {
            id: 'user-service',
            agentType: 'ultra:executor',
            description: 'Implement user service',
            ownedPaths: ['src/users/', 'src/services/user.ts']
          }
        ]
      }
    }
  };
}

/**
 * Helper: Group independent errors for parallel fixing
 */
function groupIndependentErrors(
  errors: Array<{ id: string; message: string; affectedFiles: string[] }>
): Array<Array<{ id: string; message: string; affectedFiles: string[] }>> {
  // Simple implementation - in production, would analyze file overlap
  const groups: Array<Array<{ id: string; message: string; affectedFiles: string[] }>> = [];
  const used = new Set<string>();

  for (const error of errors) {
    if (!used.has(error.id)) {
      const independent = errors.filter(e =>
        e.id !== error.id &&
        !e.affectedFiles.some(f => error.affectedFiles.includes(f))
      );
      groups.push([error, ...independent]);
      independent.forEach(e => used.add(e.id));
      used.add(error.id);
    }
  }

  return groups.length > 0 ? groups : [errors];
}

/**
 * Helper: Fix error sequentially
 */
async function fixErrorSequentially(error: { id: string; message: string }) {
  console.log(`Sequentially fixing: ${error.id}`);
  // Implementation would use Task tool
}

/**
 * Helper: Get agent model tier
 */
function getAgentModel(agentType: string): 'opus' | 'sonnet' | 'haiku' {
  // In production, import from agents.ts
  const tierMap: Record<string, 'opus' | 'sonnet' | 'haiku'> = {
    'ultra:team-implementer': 'sonnet',
    'ultra:security-reviewer': 'sonnet',
    'ultra:quality-reviewer': 'sonnet',
    'ultra:code-reviewer': 'opus',
    'ultra:test-engineer': 'sonnet',
    'ultra:architect': 'opus',
    'ultra:executor': 'sonnet'
  };
  return tierMap[agentType] || 'sonnet';
}

/**
 * Helper: Generate progress bar
 */
function generateProgressBar(completed: number, total: number): string {
  const filled = Math.round((completed / total) * 8);
  return '█'.repeat(filled) + '░'.repeat(8 - filled);
}

/**
 * Helper: Update HUD (placeholder)
 */
function updateHUD(message: string) {
  // In production, this would update the actual HUD
  console.log(`[HUD] ${message}`);
}

/**
 * Example 5: Real-world workflow integration
 */
export async function realWorldWorkflow(projectRoot: string) {
  console.log('\n=== Real-World Ultrapilot Workflow ===\n');

  // Initialize state
  const state = initAutopilotState(projectRoot);
  writeState(projectRoot, 'autopilot', state);

  // Phase 2: Execution
  console.log('Phase 2: Executing implementation tasks...');
  const executionResult = await phase2ExecutionExample(projectRoot);

  if (executionResult.failed > 0) {
    // Enter Ralph loop for fixes
    console.log('\nEntering Ralph loop for fixes...');
    await ralphParallelDebugging(projectRoot, []);
  }

  // Phase 4: Validation
  console.log('\nPhase 4: Running multi-dimensional review...');
  const reviewResult = await phase4MultiReview(projectRoot, [
    'src/auth/',
    'src/tasks/',
    'src/api/'
  ]);

  // Phase 5: Verification
  console.log('\nPhase 5: Running tests...');
  const testResult = await ultraqaParallelTests(projectRoot);

  console.log('\n=== Workflow Complete ===');
  console.log(`Implementation: ${executionResult.completed}/${executionResult.results.length} tasks`);
  console.log(`Review: ${reviewResult.findings.length} findings`);
  console.log(`Tests: ${testResult.totalPassed} passed`);
}
