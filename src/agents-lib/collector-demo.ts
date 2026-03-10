/**
 * Result Collector Demo
 *
 * Demonstrates the ResultCollector functionality for collecting
 * and aggregating results from parallel agent delegations.
 */

import type {
  ParallelDelegationResult,
  CollectedResults,
  CollectorConfig,
} from './collector.js';
import { ResultCollector, createCollector } from './collector.js';

/**
 * Demo 1: Basic collection
 *
 * Shows how to collect results from parallel agent execution.
 */
async function demoBasicCollection(): Promise<void> {
  console.log('\n=== Demo 1: Basic Collection ===\n');

  const collector = new ResultCollector();

  // Create sample results from 3 parallel agents
  const now = Date.now();
  const results: ParallelDelegationResult[] = [
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-001',
      success: true,
      output: 'Task 1 completed successfully',
      duration: 1200,
      agentName: 'business-analyst',
      startTime: now - 1200,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
      confidence: 0.9,
    },
    {
      agentId: 'worker-2',
      taskId: 'task-2',
      parallelExecutionId: 'exec-001',
      success: true,
      output: 'Task 2 completed successfully',
      duration: 1800,
      agentName: 'data-analyst',
      startTime: now - 1800,
      endTime: now - 600,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 1,
      confidence: 0.85,
    },
    {
      agentId: 'worker-3',
      taskId: 'task-3',
      parallelExecutionId: 'exec-001',
      success: false,
      error: {
        code: 'TIMEOUT',
        message: 'Agent timed out after 30s',
        retryable: true,
        retryDelay: 5000,
      },
      duration: 30000,
      agentName: 'ux-designer',
      startTime: now - 30000,
      endTime: now,
      completed: false,
      timedOut: true,
      duplicate: false,
      order: 2,
    },
  ];

  // Collect results
  const collected: CollectedResults = await collector.collect(results, 'exec-001');

  // Display summary
  console.log(collector.summarize(collected));

  // Show detailed statistics
  console.log('\nDetailed Statistics:');
  console.log(`  Success Rate: ${(collected.statistics.successRate * 100).toFixed(1)}%`);
  console.log(`  Average Duration: ${collected.statistics.averageDuration.toFixed(0)}ms`);
  console.log(`  Median Duration: ${collected.statistics.medianDuration.toFixed(0)}ms`);
  console.log(`  Min Duration: ${collected.statistics.minDuration}ms`);
  console.log(`  Max Duration: ${collected.statistics.maxDuration}ms`);
  console.log(`  Completion Rate: ${(collected.statistics.completionRate * 100).toFixed(1)}%`);
  console.log(`  Timeout Rate: ${(collected.statistics.timeoutRate * 100).toFixed(1)}%`);
}

/**
 * Demo 2: Duplicate detection
 *
 * Shows how the collector detects duplicate results.
 */
async function demoDuplicateDetection(): Promise<void> {
  console.log('\n=== Demo 2: Duplicate Detection ===\n');

  const collector = new ResultCollector({
    detectDuplicates: true,
  });

  const now = Date.now();
  const results: ParallelDelegationResult[] = [
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-002',
      success: true,
      output: 'First result',
      duration: 1000,
      agentName: 'agent-1',
      startTime: now - 1000,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
    },
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-002',
      success: true,
      output: 'Duplicate result',
      duration: 1100,
      agentName: 'agent-1',
      startTime: now - 1100,
      endTime: now - 100,
      completed: true,
      timedOut: false,
      duplicate: true,  // This will be detected as duplicate
      order: 1,
    },
    {
      agentId: 'worker-2',
      taskId: 'task-2',
      parallelExecutionId: 'exec-002',
      success: true,
      output: 'Unique result',
      duration: 1500,
      agentName: 'agent-2',
      startTime: now - 1500,
      endTime: now - 500,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 2,
    },
  ];

  const collected = await collector.collect(results, 'exec-002');

  console.log(collector.summarize(collected));

  console.log('\nDuplicate Results:');
  if (collected.duplicateResults.length > 0) {
    collected.duplicateResults.forEach(r => {
      console.log(`  - ${r.agentId}/${r.taskId}: ${r.output}`);
    });
  } else {
    console.log('  No duplicates found');
  }

  console.log(`\nDuplicate Rate: ${(collected.statistics.duplicateRate * 100).toFixed(1)}%`);
}

/**
 * Demo 3: Partial results
 *
 * Shows how the collector handles partial results when some agents fail.
 */
async function demoPartialResults(): Promise<void> {
  console.log('\n=== Demo 3: Partial Results ===\n');

  const collector = new ResultCollector({
    allowPartialResults: true,
  });

  const now = Date.now();
  const results: ParallelDelegationResult[] = [
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-003',
      success: true,
      output: 'Completed',
      duration: 1000,
      agentName: 'agent-1',
      startTime: now - 1000,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
    },
    {
      agentId: 'worker-2',
      taskId: 'task-2',
      parallelExecutionId: 'exec-003',
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: 'Agent crashed',
        retryable: true,
        retryDelay: 2000,
      },
      duration: 500,
      agentName: 'agent-2',
      startTime: now - 500,
      endTime: now,
      completed: false,
      timedOut: false,
      duplicate: false,
      order: 1,
    },
    {
      agentId: 'worker-3',
      taskId: 'task-3',
      parallelExecutionId: 'exec-003',
      success: true,
      output: 'Also completed',
      duration: 1500,
      agentName: 'agent-3',
      startTime: now - 1500,
      endTime: now - 500,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 2,
    },
  ];

  const collected = await collector.collect(results, 'exec-003');

  console.log(collector.summarize(collected));

  console.log('\nAgent Breakdown:');
  for (const [agentId, info] of Object.entries(collected.agentBreakdown)) {
    console.log(`  ${agentId}:`);
    console.log(`    Success: ${info.success}`);
    console.log(`    Duration: ${info.duration}ms`);
    console.log(`    Order: ${info.order}`);
    if (!info.success) {
      console.log(`    Error: ${info.error} - ${info.errorMessage}`);
    }
  }

  console.log(`\nPartial Results: ${collected.partialResults ? 'Yes' : 'No'}`);
}

/**
 * Demo 4: Timeout handling
 *
 * Shows how to collect results with per-agent timeout.
 */
async function demoTimeoutHandling(): Promise<void> {
  console.log('\n=== Demo 4: Timeout Handling ===\n');

  const collector = new ResultCollector({
    timeout: 2000,  // 2 second timeout
  });

  // Simulate async results with different completion times
  const now = Date.now();
  const pendingResults: Promise<ParallelDelegationResult>[] = [
    // Fast agent
    Promise.resolve({
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-004',
      success: true,
      output: 'Fast result',
      duration: 500,
      agentName: 'fast-agent',
      startTime: now - 500,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
    }),
    // Slow agent (will timeout)
    new Promise<ParallelDelegationResult>(resolve =>
      setTimeout(() => resolve({
        agentId: 'worker-2',
        taskId: 'task-2',
        parallelExecutionId: 'exec-004',
        success: true,
        output: 'Slow result',
        duration: 3000,
        agentName: 'slow-agent',
        startTime: now - 3000,
        endTime: now,
        completed: true,
        timedOut: false,
        duplicate: false,
        order: 1,
      }), 3000)
    ),
    // Medium agent
    Promise.resolve({
      agentId: 'worker-3',
      taskId: 'task-3',
      parallelExecutionId: 'exec-004',
      success: true,
      output: 'Medium result',
      duration: 1000,
      agentName: 'medium-agent',
      startTime: now - 1000,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 2,
    }),
  ];

  try {
    const collected = await collector.collectWithTimeout(pendingResults, 'exec-004');
    console.log(collector.summarize(collected));
  } catch (error) {
    console.error('Collection failed:', error);
  }
}

/**
 * Demo 5: Statistics and percentiles
 *
 * Shows detailed statistics calculation.
 */
async function demoStatistics(): Promise<void> {
  console.log('\n=== Demo 5: Statistics and Percentiles ===\n');

  const collector = new ResultCollector({
    calculatePercentiles: true,
  });

  // Generate 100 results with varying durations
  const now = Date.now();
  const results: ParallelDelegationResult[] = [];

  for (let i = 0; i < 100; i++) {
    const duration = Math.random() * 5000 + 500;  // 500-5500ms
    const success = Math.random() > 0.1;  // 90% success rate

    results.push({
      agentId: `worker-${i % 10}`,
      taskId: `task-${i}`,
      parallelExecutionId: 'exec-005',
      success,
      output: success ? `Task ${i} completed` : undefined,
      error: success ? undefined : {
        code: 'EXECUTION_ERROR',
        message: `Task ${i} failed`,
        retryable: true,
        retryDelay: 1000,
      },
      duration,
      agentName: `agent-${i % 10}`,
      startTime: now - duration,
      endTime: now,
      completed: success,
      timedOut: duration > 5000,
      duplicate: false,
      order: i,
    });
  }

  const collected = await collector.collect(results, 'exec-005');

  console.log(collector.summarize(collected));

  console.log('\nPercentile Statistics:');
  console.log(`  P50 (Median): ${collected.statistics.percentiles.p50.toFixed(0)}ms`);
  console.log(`  P75: ${collected.statistics.percentiles.p75.toFixed(0)}ms`);
  console.log(`  P90: ${collected.statistics.percentiles.p90.toFixed(0)}ms`);
  console.log(`  P95: ${collected.statistics.percentiles.p95.toFixed(0)}ms`);
  console.log(`  P99: ${collected.statistics.percentiles.p99.toFixed(0)}ms`);

  console.log('\nError Breakdown:');
  for (const [code, count] of Object.entries(collected.statistics.errorBreakdown)) {
    console.log(`  ${code}: ${count}`);
  }
}

/**
 * Demo 6: Export functionality
 *
 * Shows how to export collected results.
 */
async function demoExport(): Promise<void> {
  console.log('\n=== Demo 6: Export Functionality ===\n');

  const collector = new ResultCollector();

  const now = Date.now();
  const results: ParallelDelegationResult[] = [
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-006',
      success: true,
      output: 'Result 1',
      duration: 1000,
      agentName: 'agent-1',
      startTime: now - 1000,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
    },
    {
      agentId: 'worker-2',
      taskId: 'task-2',
      parallelExecutionId: 'exec-006',
      success: false,
      error: {
        code: 'TIMEOUT',
        message: 'Timeout',
        retryable: true,
        retryDelay: 5000,
      },
      duration: 3000,
      agentName: 'agent-2',
      startTime: now - 3000,
      endTime: now,
      completed: false,
      timedOut: true,
      duplicate: false,
      order: 1,
    },
  ];

  const collected = await collector.collect(results, 'exec-006');

  // Export to JSON
  const json = collector.exportToJSON(collected, true);
  console.log('JSON Export (first 500 chars):');
  console.log(json.substring(0, 500) + '...\n');

  // Export to CSV
  const csv = collector.exportToCSV(collected);
  console.log('CSV Export:');
  console.log(csv);
}

/**
 * Demo 7: Factory function
 *
 * Shows how to use the createCollector factory function.
 */
async function demoFactoryFunction(): Promise<void> {
  console.log('\n=== Demo 7: Factory Function ===\n');

  // Create collector with custom config using factory
  const collector = createCollector({
    timeout: 15000,
    waitForAll: true,
    allowPartialResults: true,
    detectDuplicates: true,
    calculatePercentiles: true,
    maxResults: 1000,
    onProgress: (update) => {
      console.log(`Progress: ${update.collected}/${update.total} collected`);
    },
  });

  console.log('Collector configuration:');
  const config = collector.getConfig();
  console.log(`  Timeout: ${config.timeout}ms`);
  console.log(`  Wait for all: ${config.waitForAll}`);
  console.log(`  Allow partial: ${config.allowPartialResults}`);
  console.log(`  Detect duplicates: ${config.detectDuplicates}`);
  console.log(`  Calculate percentiles: ${config.calculatePercentiles}`);
  console.log(`  Max results: ${config.maxResults}`);

  // Use the collector
  const now = Date.now();
  const results: ParallelDelegationResult[] = [
    {
      agentId: 'worker-1',
      taskId: 'task-1',
      parallelExecutionId: 'exec-007',
      success: true,
      output: 'Test result',
      duration: 1000,
      agentName: 'agent-1',
      startTime: now - 1000,
      endTime: now,
      completed: true,
      timedOut: false,
      duplicate: false,
      order: 0,
    },
  ];

  const collected = await collector.collect(results, 'exec-007');
  console.log(`\nCollected ${collected.total} result(s)`);
}

/**
 * Main demo runner
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Result Collector Demo');
  console.log('='.repeat(60));

  try {
    await demoBasicCollection();
    await demoDuplicateDetection();
    await demoPartialResults();
    await demoTimeoutHandling();
    await demoStatistics();
    await demoExport();
    await demoFactoryFunction();

    console.log('\n' + '='.repeat(60));
    console.log('All demos completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run demos if this file is executed directly
main().catch(console.error);

export {
  demoBasicCollection,
  demoDuplicateDetection,
  demoPartialResults,
  demoTimeoutHandling,
  demoStatistics,
  demoExport,
  demoFactoryFunction,
};
