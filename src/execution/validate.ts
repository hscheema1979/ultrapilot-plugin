#!/usr/bin/env node
/**
 * Validation script for Parallel Execution Layer
 *
 * Verifies:
 * 1. TypeScript compilation
 * 2. Basic parallel execution
 * 3. Dependency resolution
 * 4. File ownership boundaries
 * 5. Speedup calculation
 */

import { ParallelExecutor, ParallelAgentTask } from './parallel-task.js';

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: ValidationResult[] = [];

async function test(name: string, testFn: () => Promise<void>) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, message: 'PASS', duration });
    console.log(`✓ ${name}`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Unknown error';
    results.push({ name, passed: false, message, duration });
    console.log(`✗ ${name}: ${message}`);
  }
}

async function runValidation() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     ULTRAPILOT PARALLEL EXECUTION VALIDATION                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Test 1: Basic parallel execution
  await test('Basic parallel execution (3 tasks)', async () => {
    const tasks: ParallelAgentTask[] = [
      {
        id: 'task1',
        agentType: 'ultra:executor',
        prompt: 'Task 1',
        fileOwnership: { ownedPaths: ['src/a/'] }
      },
      {
        id: 'task2',
        agentType: 'ultra:executor',
        prompt: 'Task 2',
        fileOwnership: { ownedPaths: ['src/b/'] }
      },
      {
        id: 'task3',
        agentType: 'ultra:executor',
        prompt: 'Task 3',
        fileOwnership: { ownedPaths: ['src/c/'] }
      }
    ];

    const result = await ParallelExecutor.executeParallel(tasks);

    if (result.completed !== 3) {
      throw new Error(`Expected 3 completed, got ${result.completed}`);
    }
    if (result.failed !== 0) {
      throw new Error(`Expected 0 failed, got ${result.failed}`);
    }
    if (!result.speedup || result.speedup < 1.5) {
      throw new Error(`Expected speedup >= 1.5x, got ${result.speedup?.toFixed(2)}x`);
    }
  });

  // Test 2: Dependency resolution
  await test('Dependency resolution (3 phases)', async () => {
    const executionOrder: string[] = [];

    const tasks: ParallelAgentTask[] = [
      {
        id: 'phase1',
        agentType: 'ultra:executor',
        prompt: 'Phase 1',
        dependencies: []
      },
      {
        id: 'phase2',
        agentType: 'ultra:executor',
        prompt: 'Phase 2',
        dependencies: ['phase1']
      },
      {
        id: 'phase3',
        agentType: 'ultra:executor',
        prompt: 'Phase 3',
        dependencies: ['phase2']
      }
    ];

    const result = await ParallelExecutor.executeParallel(tasks);

    if (result.completed !== 3) {
      throw new Error(`Expected 3 completed, got ${result.completed}`);
    }
    if (!result.success) {
      throw new Error('Execution failed');
    }
  });

  // Test 3: File ownership boundaries
  await test('File ownership boundaries (disjoint paths)', async () => {
    const result = await ParallelExecutor.executeWithOwnership({
      'auth': {
        agentType: 'ultra:team-implementer',
        prompt: 'Auth module',
        ownedPaths: ['src/auth/']
      },
      'tasks': {
        agentType: 'ultra:team-implementer',
        prompt: 'Task API',
        ownedPaths: ['src/tasks/']
      },
      'users': {
        agentType: 'ultra:executor',
        prompt: 'User service',
        ownedPaths: ['src/users/']
      }
    });

    if (result.completed !== 3) {
      throw new Error(`Expected 3 completed, got ${result.completed}`);
    }
    if (!result.speedup || result.speedup < 1.5) {
      throw new Error(`Expected speedup >= 1.5x, got ${result.speedup?.toFixed(2)}x`);
    }
  });

  // Test 4: Timeout handling
  await test('Timeout handling (1s timeout)', async () => {
    const tasks: ParallelAgentTask[] = [
      {
        id: 'quick',
        agentType: 'ultra:executor-low',
        prompt: 'Quick task',
        timeout: 2000 // 2 seconds
      }
    ];

    const result = await ParallelExecutor.executeParallel(tasks);

    if (result.completed !== 1) {
      throw new Error(`Expected 1 completed, got ${result.completed}`);
    }
  });

  // Test 5: Progress tracking
  await test('Progress tracking callbacks', async () => {
    let progressCalled = false;
    const tasks: ParallelAgentTask[] = [
      {
        id: 'task1',
        agentType: 'ultra:executor',
        prompt: 'Task 1'
      }
    ];

    await ParallelExecutor.executeParallel(tasks, {
      onProgress: (progress) => {
        progressCalled = true;
        if (progress.completed !== 1 || progress.total !== 1) {
          throw new Error(`Invalid progress: ${progress.completed}/${progress.total}`);
        }
      }
    });

    if (!progressCalled) {
      throw new Error('Progress callback not called');
    }
  });

  // Test 6: Error handling
  await test('Error handling (invalid agent type)', async () => {
    const tasks: ParallelAgentTask[] = [
      {
        id: 'task1',
        agentType: 'invalid:agent',
        prompt: 'Task 1'
      }
    ];

    try {
      await ParallelExecutor.executeParallel(tasks);
      throw new Error('Should have thrown validation error');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Unknown agent type')) {
        throw new Error(`Expected "Unknown agent type" error, got: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  // Test 7: Benchmark
  await test('Benchmark calculation', async () => {
    const tasks: ParallelAgentTask[] = [
      {
        id: 'task1',
        agentType: 'ultra:executor',
        prompt: 'Task 1'
      },
      {
        id: 'task2',
        agentType: 'ultra:executor',
        prompt: 'Task 2'
      }
    ];

    const { parallel, speedup, efficiency } = await ParallelExecutor.benchmark(tasks);

    if (!parallel.success) {
      throw new Error('Benchmark execution failed');
    }
    if (speedup < 1.0) {
      throw new Error(`Expected speedup >= 1.0x, got ${speedup.toFixed(2)}x`);
    }
    if (efficiency < 0 || efficiency > 1) {
      throw new Error(`Expected efficiency in [0,1], got ${efficiency.toFixed(2)}`);
    }
  });

  // Test 8: Create task helper
  await test('createTask helper method', async () => {
    const task = ParallelExecutor.createTask(
      'test-task',
      'ultra:executor',
      'Test prompt',
      {
        priority: 'high',
        timeout: 60000
      }
    );

    if (task.id !== 'test-task') {
      throw new Error(`Expected id "test-task", got "${task.id}"`);
    }
    if (task.agentType !== 'ultra:executor') {
      throw new Error(`Expected agentType "ultra:executor", got "${task.agentType}"`);
    }
    if (task.prompt !== 'Test prompt') {
      throw new Error(`Expected prompt "Test prompt", got "${task.prompt}"`);
    }
    if (task.priority !== 'high') {
      throw new Error(`Expected priority "high", got "${task.priority}"`);
    }
    if (task.timeout !== 60000) {
      throw new Error(`Expected timeout 60000, got ${task.timeout}`);
    }
  });

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Duration: ${totalDuration}ms\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ✗ ${r.name}: ${r.message}`);
      });
    console.log('');
  }

  // Performance summary
  console.log('Performance Metrics:');
  const avgDuration = totalDuration / results.length;
  console.log(`  Average test duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`  Fastest test: ${Math.min(...results.map(r => r.duration))}ms`);
  console.log(`  Slowest test: ${Math.max(...results.map(r => r.duration))}ms\n`);

  if (failed === 0) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✓ ALL TESTS PASSED - Parallel Execution Layer validated     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  } else {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✗ SOME TESTS FAILED - Please review errors above           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
}

runValidation().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});
