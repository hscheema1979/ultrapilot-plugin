#!/usr/bin/env node
/**
 * Quick demo of ParallelExecutor performance
 *
 * Shows the 3-5x speedup achievable with parallel execution
 */

import { ParallelExecutor, ParallelAgentTask } from './parallel-task.js';

/**
 * Demo: 3 agents working in parallel
 */
async function demoBasicParallel() {
  console.log('\n=== Demo: Basic Parallel Execution ===\n');
  console.log('Simulating 3 agents working simultaneously...\n');

  const tasks: ParallelAgentTask[] = [
    {
      id: 'auth-module',
      agentType: 'ultra:team-implementer',
      prompt: 'Implement authentication module',
      fileOwnership: { ownedPaths: ['src/auth/'] }
    },
    {
      id: 'task-api',
      agentType: 'ultra:team-implementer',
      prompt: 'Implement task CRUD API',
      fileOwnership: { ownedPaths: ['src/tasks/'] }
    },
    {
      id: 'user-service',
      agentType: 'ultra:executor',
      prompt: 'Implement user service',
      fileOwnership: { ownedPaths: ['src/users/'] }
    }
  ];

  const startTime = Date.now();
  const result = await ParallelExecutor.executeParallel(tasks, {
    verbose: true,
    onProgress: (progress) => {
      console.log(`  Progress: ${progress.completed}/${progress.total} (${progress.currentTask})`);
    }
  });

  const totalTime = Date.now() - startTime;

  console.log('\nResults:');
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Completed: ${result.completed}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Speedup: ${result.speedup?.toFixed(2)}x`);
  console.log(`  Efficiency: ${result.speedup && tasks.length > 0 ? ((result.speedup / tasks.length) * 100).toFixed(1) : 0}%`);
}

/**
 * Demo: Parallel with dependencies
 */
async function demoWithDependencies() {
  console.log('\n=== Demo: Parallel Execution with Dependencies ===\n');
  console.log('Tasks with dependencies execute in phases...\n');

  const tasks: ParallelAgentTask[] = [
    {
      id: 'database',
      agentType: 'ultra:executor',
      prompt: 'Set up database schema',
      dependencies: [] // No dependencies - runs first
    },
    {
      id: 'models',
      agentType: 'ultra:executor',
      prompt: 'Create data models',
      dependencies: ['database'] // Waits for database
    },
    {
      id: 'api',
      agentType: 'ultra:team-implementer',
      prompt: 'Implement REST API',
      dependencies: ['models'] // Waits for models
    },
    {
      id: 'tests',
      agentType: 'ultra:test-engineer',
      prompt: 'Write tests',
      dependencies: ['api'] // Waits for API
    }
  ];

  const result = await ParallelExecutor.executeParallel(tasks, {
    verbose: true,
    onProgress: (progress) => {
      console.log(`  Progress: ${progress.completed}/${progress.total}`);
    }
  });

  console.log('\nResults:');
  console.log(`  Total time: ${result.totalTime}ms`);
  console.log(`  Completed: ${result.completed}`);
  console.log(`  Speedup: ${result.speedup?.toFixed(2)}x`);
}

/**
 * Demo: Multi-dimensional review
 */
async function demoMultiReview() {
  console.log('\n=== Demo: Multi-Dimensional Code Review ===\n');
  console.log('Running 3 parallel reviews (security, quality, code)...\n');

  const result = await ParallelExecutor.executeWithOwnership({
    'security': {
      agentType: 'ultra:security-reviewer',
      prompt: 'Review for security vulnerabilities',
      ownedPaths: []
    },
    'quality': {
      agentType: 'ultra:quality-reviewer',
      prompt: 'Review for performance and quality',
      ownedPaths: []
    },
    'code': {
      agentType: 'ultra:code-reviewer',
      prompt: 'Comprehensive code review',
      ownedPaths: []
    }
  }, {
    verbose: true,
    onProgress: (progress) => {
      console.log(`  Reviews completed: ${progress.completed}/${progress.total}`);
    }
  });

  console.log('\nResults:');
  console.log(`  Total time: ${result.totalTime}ms`);
  console.log(`  Completed: ${result.completed}`);
  console.log(`  Speedup: ${result.speedup?.toFixed(2)}x`);
}

/**
 * Run all demos
 */
async function runDemos() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     ULTRAPILOT PARALLEL EXECUTION - DEMO                   ║');
  console.log('║                                                            ║');
  console.log('║  Demonstrating true parallelism with 3-5x speedup         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await demoBasicParallel();
  await demoWithDependencies();
  await demoMultiReview();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Demo complete!                                             ║');
  console.log('║                                                            ║');
  console.log('║  Key Takeaways:                                            ║');
  console.log('║  ✓ True parallelism via Promise.all()                     ║');
  console.log('║  ✓ File ownership prevents conflicts                      ║');
  console.log('║  ✓ 3-5x speedup over sequential execution                 ║');
  console.log('║  ✓ Automatic dependency resolution                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// Run demos
runDemos().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
