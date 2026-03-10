/**
 * GitHubAgentOrchestrator Usage Examples
 *
 * This file demonstrates how to use the GitHubAgentOrchestrator
 * for parallel agent execution with file ownership tracking.
 */

import { GitHubAgentOrchestrator } from '../github-agent-orchestrator.js';
import { GitHubService } from '../github-service.js';
import { GitHubStateAdapter } from '../github-state-adapter.js';
import { GitHubTaskQueueAdapter } from '../github-task-queue-adapter.js';

/**
 * Example 1: Basic Setup
 */
async function basicSetup() {
  // Initialize services
  const github = new GitHubService({
    owner: 'my-org',
    repo: 'my-project',
    token: process.env.GITHUB_TOKEN
  });

  const state = new GitHubStateAdapter(github);
  const queue = new GitHubTaskQueueAdapter(github, state);

  // Create orchestrator with custom config
  const orchestrator = new GitHubAgentOrchestrator(
    github,
    state,
    queue,
    {
      maxParallel: 3,
      agentTimeout: 300000, // 5 minutes
      cacheTTL: 30000, // 30 seconds
      batchPersistInterval: 5000 // 5 seconds
    }
  );

  return orchestrator;
}

/**
 * Example 2: File Ownership Management
 */
async function fileOwnershipExample(orchestrator: GitHubAgentOrchestrator) {
  const agentId = 'agent-auth-service-001';

  // Claim files before working on them
  const claimed1 = await orchestrator.claimFile(
    agentId,
    '/src/services/auth-service.ts'
  );
  console.log(`Claimed auth-service.ts: ${claimed1}`);

  const claimed2 = await orchestrator.claimFile(
    agentId,
    '/src/middleware/auth-middleware.ts'
  );
  console.log(`Claimed auth-middleware.ts: ${claimed2}`);

  // Check ownership
  const owner = await orchestrator.getOwner('/src/services/auth-service.ts');
  console.log(`Owner of auth-service.ts: ${owner}`);

  // Release files when done
  await orchestrator.releaseFile(agentId, '/src/services/auth-service.ts');
  await orchestrator.releaseFile(agentId, '/src/middleware/auth-middleware.ts');
}

/**
 * Example 3: Batch File Operations
 */
async function batchOperationsExample(orchestrator: GitHubAgentOrchestrator) {
  const agentId = 'agent-database-002';

  // Batch claim multiple files
  const files = [
    '/src/models/user.ts',
    '/src/models/post.ts',
    '/src/models/comment.ts',
    '/src/repositories/user-repo.ts',
    '/src/repositories/post-repo.ts'
  ];

  const results = await orchestrator.claimFiles(agentId, files);

  for (const [path, claimed] of Object.entries(results)) {
    if (claimed) {
      console.log(`✓ Claimed: ${path}`);
    } else {
      console.log(`✗ Failed to claim: ${path}`);
    }
  }

  // Work on files...

  // Batch release all files
  await orchestrator.releaseFiles(agentId, files);
}

/**
 * Example 4: Parallel Task Execution
 */
async function parallelExecutionExample(orchestrator: GitHubAgentOrchestrator) {
  // Define tasks for parallel execution
  const tasks = [
    {
      id: 'task-auth',
      agent: 'ultra:executor',
      description: 'Implement authentication service',
      files: [
        '/src/services/auth-service.ts',
        '/src/middleware/auth-middleware.ts'
      ]
    },
    {
      id: 'task-database',
      agent: 'ultra:executor',
      description: 'Set up database models',
      files: [
        '/src/models/user.ts',
        '/src/models/post.ts',
        '/src/repositories/user-repo.ts'
      ]
    },
    {
      id: 'task-api',
      agent: 'ultra:executor',
      description: 'Create REST API endpoints',
      files: [
        '/src/routes/auth-routes.ts',
        '/src/routes/user-routes.ts',
        '/src/controllers/auth-controller.ts'
      ]
    },
    {
      id: 'task-tests',
      agent: 'ultra:test-engineer',
      description: 'Write unit tests',
      files: [
        '/tests/auth.test.ts',
        '/tests/user.test.ts'
      ]
    }
  ];

  // Execute with max 2 parallel agents
  const results = await orchestrator.coordinateParallel(tasks, 2);

  // Process results
  for (const result of results) {
    if (result.success) {
      console.log(`✓ ${result.taskId}: Completed in ${result.duration}ms`);
      console.log(`  Output: ${result.output}`);
    } else {
      console.log(`✗ ${result.taskId}: Failed - ${result.error}`);
    }
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\nSummary: ${successful} succeeded, ${failed} failed`);
}

/**
 * Example 5: Single Agent with Retry
 */
async function singleAgentExample(orchestrator: GitHubAgentOrchestrator) {
  const task = {
    id: 'task-migration',
    agent: 'ultra:executor-high',
    description: 'Implement database migration',
    files: [
      '/migrations/001-create-users.sql',
      '/src/db/migration-runner.ts'
    ]
  };

  // Spawn agent with automatic retry on failure
  const result = await orchestrator.spawnAgent('ultra:executor-high', task);

  if (result.success) {
    console.log(`✓ Task completed: ${result.output}`);
    console.log(`  Duration: ${result.duration}ms`);
  } else {
    console.log(`✗ Task failed: ${result.error}`);
    console.log(`  Duration: ${result.duration}ms`);
  }
}

/**
 * Example 6: File Ownership Transfer
 */
async function transferExample(orchestrator: GitHubAgentOrchestrator) {
  const fromAgent = 'agent-designer-001';
  const toAgent = 'agent-implementer-002';
  const filePath = '/src/components/button.tsx';

  // Designer initially claims the file
  await orchestrator.claimFile(fromAgent, filePath);
  console.log(`${fromAgent} owns ${filePath}`);

  // Transfer ownership to implementer
  const transferred = await orchestrator.transferFile(
    fromAgent,
    toAgent,
    filePath
  );

  if (transferred) {
    console.log(`✓ Transferred ownership to ${toAgent}`);
  } else {
    console.log(`✗ Transfer failed`);
  }
}

/**
 * Example 7: Monitoring and Statistics
 */
async function monitoringExample(orchestrator: GitHubAgentOrchestrator) {
  // Get ownership statistics
  const stats = await orchestrator.getOwnershipStats();
  console.log('Ownership Statistics:');
  console.log(`  Total files: ${stats.totalFiles}`);
  console.log(`  Pending changes: ${stats.pendingChanges}`);
  console.log(`  Agents:`);

  for (const [agentId, count] of Object.entries(stats.agentCounts)) {
    console.log(`    ${agentId}: ${count} files`);
  }

  // Get active agents
  const activeAgents = orchestrator.getActiveAgents();
  console.log(`\nActive agents: ${activeAgents.length}`);

  for (const agent of activeAgents) {
    const elapsed = Date.now() - agent.startTime;
    console.log(`  ${agent.id}: ${agent.taskId} (${elapsed}ms)`);
  }

  // Get files owned by specific agent
  const agentFiles = await orchestrator.getAgentFiles('agent-auth-service-001');
  console.log(`\nAgent files: ${agentFiles.join(', ')}`);
}

/**
 * Example 8: Error Handling and Cleanup
 */
async function errorHandlingExample(orchestrator: GitHubAgentOrchestrator) {
  try {
    // Attempt to claim already owned file
    const claimed = await orchestrator.claimFile(
      'new-agent',
      '/src/services/auth-service.ts'
    );

    if (!claimed) {
      console.log('File already owned, handling conflict...');

      // Get current owner
      const owner = await orchestrator.getOwner('/src/services/auth-service.ts');
      console.log(`Current owner: ${owner}`);

      // Wait for owner to release or transfer
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Always cleanup
    await orchestrator.cleanup();
  }
}

/**
 * Example 9: Full Workflow
 */
async function fullWorkflowExample() {
  let orchestrator: GitHubAgentOrchestrator;

  try {
    // Setup
    orchestrator = await basicSetup();

    // Phase 1: Initial file claims
    await batchOperationsExample(orchestrator);

    // Phase 2: Parallel execution
    await parallelExecutionExample(orchestrator);

    // Phase 3: Monitor progress
    await monitoringExample(orchestrator);

    // Phase 4: Transfer ownership between phases
    await transferExample(orchestrator);

    // Phase 5: Force final persistence
    await orchestrator.forcePersistence();

    console.log('✓ Workflow completed successfully');
  } catch (error) {
    console.error('Workflow failed:', error);
  } finally {
    if (orchestrator) {
      await orchestrator.cleanup();
    }
  }
}

/**
 * Example 10: Performance Optimization
 */
async function performanceExample(orchestrator: GitHubAgentOrchestrator) {
  // Measure claim performance
  const startClaim = Date.now();
  await orchestrator.claimFile('agent-perf', '/src/test.ts');
  const claimDuration = Date.now() - startClaim;

  console.log(`Claim operation: ${claimDuration}ms (target: < 100ms)`);

  // Measure release performance
  const startRelease = Date.now();
  await orchestrator.releaseFile('agent-perf', '/src/test.ts');
  const releaseDuration = Date.now() - startRelease;

  console.log(`Release operation: ${releaseDuration}ms (target: < 100ms)`);

  // Measure get owner performance
  const startGet = Date.now();
  await orchestrator.getOwner('/src/test.ts');
  const getDuration = Date.now() - startGet;

  console.log(`Get owner operation: ${getDuration}ms (target: < 100ms)`);

  // Batch operations are more efficient
  const files = Array.from({ length: 10 }, (_, i) => `/src/file${i}.ts`);

  const startBatch = Date.now();
  await orchestrator.claimFiles('agent-perf', files);
  const batchDuration = Date.now() - startBatch;

  console.log(`Batch claim (10 files): ${batchDuration}ms`);
  console.log(`Average per file: ${batchDuration / 10}ms`);
}

/**
 * Export examples
 */
export {
  basicSetup,
  fileOwnershipExample,
  batchOperationsExample,
  parallelExecutionExample,
  singleAgentExample,
  transferExample,
  monitoringExample,
  errorHandlingExample,
  fullWorkflowExample,
  performanceExample
};

// Run examples if executed directly
if (require.main === module) {
  fullWorkflowExample().catch(console.error);
}
