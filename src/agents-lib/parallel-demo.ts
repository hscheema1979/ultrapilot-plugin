#!/usr/bin/env node
/**
 * Parallel Delegator Demo
 *
 * Demonstrates the parallel delegation capabilities of the wshobson system.
 * Shows concurrent execution, progress tracking, cancellation, and error handling.
 */

import { InMemoryAgentRepository } from './repositories/in-memory.js';
import { createParallelDelegator } from './parallel.js';
import type { ParallelDelegationRequest } from './parallel.js';

/**
 * Demo 1: Basic parallel execution
 */
async function demoBasicParallelExecution() {
  console.log('\n=== Demo 1: Basic Parallel Execution ===\n');

  // Create repository and delegator
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository, 30000);

  // Define parallel requests
  const requests: ParallelDelegationRequest[] = [
    {
      agentName: 'business-analyst',
      task: 'Analyze the market trends for AI-powered development tools in 2025',
    },
    {
      agentName: 'data-analyst',
      task: 'Process the sales data and identify top performing products',
    },
    {
      agentName: 'ux-designer',
      task: 'Create wireframes for the new dashboard interface',
    },
  ];

  console.log(`Executing ${requests.length} agents in parallel...`);

  // Execute in parallel
  const summary = await parallelDelegator.delegateParallel(requests, {
    batchTimeout: 60000,
    continueOnFailure: true,
    onProgress: (update) => {
      console.log(
        `Progress: ${update.percentComplete}% ` +
        `(${update.completedAgents}/${update.totalAgents} completed, ` +
        `${update.failedAgents} failed)`
      );
    },
  });

  // Display results
  console.log(`\nResults:`);
  console.log(`  Total: ${summary.totalAgents}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  Failed: ${summary.failed}`);
  console.log(`  Duration: ${summary.duration}ms`);
  console.log(`  Cancelled: ${summary.cancelled}`);

  console.log('\nIndividual Results:');
  for (const result of summary.results) {
    console.log(`\n  ${result.agentName}:`);
    console.log(`    Status: ${result.status}`);
    console.log(`    Success: ${result.success}`);
    console.log(`    Duration: ${result.duration}ms`);
    if (result.success && result.output) {
      console.log(`    Output: ${result.output.substring(0, 100)}...`);
    } else if (result.error) {
      console.log(`    Error: ${result.error.message}`);
    }
  }
}

/**
 * Demo 2: Partial failure handling
 */
async function demoPartialFailureHandling() {
  console.log('\n=== Demo 2: Partial Failure Handling ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository);

  // Mix of valid and invalid agents
  const requests: ParallelDelegationRequest[] = [
    {
      agentName: 'business-analyst',
      task: 'Valid task for existing agent',
    },
    {
      agentName: 'non-existent-agent',
      task: 'This agent does not exist',
    },
    {
      agentName: 'data-analyst',
      task: 'Another valid task',
    },
  ];

  console.log('Executing with mixed valid/invalid agents...');

  const summary = await parallelDelegator.delegateParallel(requests, {
    continueOnFailure: true, // Continue even if some fail
  });

  console.log(`\nResults:`);
  console.log(`  Total: ${summary.totalAgents}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  Failed: ${summary.failed}`);

  console.log('\nDetails:');
  for (const result of summary.results) {
    if (result.success) {
      console.log(`  ✓ ${result.agentName}: SUCCESS`);
    } else {
      console.log(`  ✗ ${result.agentName}: FAILED - ${result.error?.message}`);
    }
  }
}

/**
 * Demo 3: Cancellation
 */
async function demoCancellation() {
  console.log('\n=== Demo 3: Cancellation ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository);

  // Create long-running tasks
  const requests: ParallelDelegationRequest[] = [
    {
      agentName: 'business-analyst',
      task: 'Perform deep market analysis (this will take a while)',
    },
    {
      agentName: 'data-analyst',
      task: 'Process large dataset',
    },
    {
      agentName: 'ux-designer',
      task: 'Design comprehensive UI system',
    },
  ];

  console.log('Starting parallel execution...');

  // Start execution (don't await)
  const executionPromise = parallelDelegator.delegateParallel(requests, {
    onProgress: (update) => {
      console.log(`Progress: ${update.percentComplete}%`);
    },
  });

  // Wait a bit, then cancel
  console.log('Waiting 2 seconds before cancelling...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Cancelling all batches...');
  parallelDelegator.cancelAllBatches();

  // Wait for cancellation to complete
  const summary = await executionPromise;

  console.log(`\nResults after cancellation:`);
  console.log(`  Total: ${summary.totalAgents}`);
  console.log(`  Cancelled: ${summary.cancelled}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  Failed: ${summary.failed}`);

  for (const result of summary.results) {
    console.log(`  ${result.agentName}: ${result.status}`);
  }
}

/**
 * Demo 4: Concurrency limit
 */
async function demoConcurrencyLimit() {
  console.log('\n=== Demo 4: Concurrency Limit ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository);

  // Create many requests
  const requests: ParallelDelegationRequest[] = Array.from({ length: 10 }, (_, i) => ({
    agentName: 'business-analyst',
    task: `Task ${i + 1}: Analyze market segment ${i + 1}`,
  }));

  console.log(`Executing ${requests.length} tasks with max concurrency of 3...`);

  const startTime = Date.now();
  const summary = await parallelDelegator.delegateParallel(requests, {
    maxConcurrency: 3, // Only 3 agents run at a time
    onProgress: (update) => {
      console.log(
        `Progress: ${update.percentComplete}% ` +
        `(Pending: ${update.status.pending}, ` +
        `Running: ${update.status.running}, ` +
        `Completed: ${update.status.completed})`
      );
    },
  });

  const duration = Date.now() - startTime;

  console.log(`\nResults:`);
  console.log(`  Total: ${summary.totalAgents}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  Failed: ${summary.failed}`);
  console.log(`  Total duration: ${duration}ms`);
  console.log(`  Average per task: ${Math.round(duration / summary.totalAgents)}ms`);
}

/**
 * Demo 5: Real-time status monitoring
 */
async function demoStatusMonitoring() {
  console.log('\n=== Demo 5: Real-time Status Monitoring ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository);

  const requests: ParallelDelegationRequest[] = [
    { agentName: 'business-analyst', task: 'Task 1' },
    { agentName: 'data-analyst', task: 'Task 2' },
    { agentName: 'ux-designer', task: 'Task 3' },
  ];

  console.log('Starting execution with monitoring...');

  // Start execution in background
  const executionPromise = parallelDelegator.delegateParallel(requests);

  // Monitor status periodically
  const monitorInterval = setInterval(() => {
    const batchCount = parallelDelegator.getActiveBatchCount();
    console.log(`Active batches: ${batchCount}`);
  }, 500);

  // Wait for completion
  await executionPromise;

  // Stop monitoring
  clearInterval(monitorInterval);

  console.log('Execution completed');
}

/**
 * Demo 6: Performance test
 */
async function demoPerformanceTest() {
  console.log('\n=== Demo 6: Performance Test ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/tmp/ultrapilot/.claude/plugins');

  const parallelDelegator = createParallelDelegator(repository);

  // Test with 5 agents
  const requests: ParallelDelegationRequest[] = [
    { agentName: 'business-analyst', task: 'Quick analysis task 1' },
    { agentName: 'business-analyst', task: 'Quick analysis task 2' },
    { agentName: 'business-analyst', task: 'Quick analysis task 3' },
    { agentName: 'business-analyst', task: 'Quick analysis task 4' },
    { agentName: 'business-analyst', task: 'Quick analysis task 5' },
  ];

  console.log(`Executing ${requests.length} agents concurrently...`);

  const startTime = Date.now();
  const summary = await parallelDelegator.delegateParallel(requests, {
    onProgress: (update) => {
      if (update.latestResult) {
        console.log(
          `Agent ${update.latestResult.agentName} completed in ` +
          `${update.latestResult.duration}ms`
        );
      }
    },
  });

  const totalTime = Date.now() - startTime;

  console.log(`\nPerformance Results:`);
  console.log(`  Total agents: ${summary.totalAgents}`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Average time: ${Math.round(totalTime / summary.totalAgents)}ms per agent`);
  console.log(`  Success rate: ${Math.round((summary.successful / summary.totalAgents) * 100)}%`);

  // Check if it completed within 2 seconds (success criteria)
  if (totalTime < 2000) {
    console.log(`  ✓ PASS: Completed within 2 seconds (${totalTime}ms)`);
  } else {
    console.log(`  ✗ FAIL: Took longer than 2 seconds (${totalTime}ms)`);
  }
}

/**
 * Run all demos
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Parallel Delegator Demo Suite');
  console.log('='.repeat(60));

  try {
    await demoBasicParallelExecution();
    await demoPartialFailureHandling();
    await demoCancellation();
    await demoConcurrencyLimit();
    await demoStatusMonitoring();
    await demoPerformanceTest();

    console.log('\n' + '='.repeat(60));
    console.log('All demos completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nDemo failed with error:', error);
    process.exit(1);
  }
}

// Run demos if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  demoBasicParallelExecution,
  demoPartialFailureHandling,
  demoCancellation,
  demoConcurrencyLimit,
  demoStatusMonitoring,
  demoPerformanceTest,
};
