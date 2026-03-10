/**
 * WshobsonDelegator Usage Demonstration
 *
 * This file demonstrates how to use the WshobsonDelegator class
 * for delegating tasks to wshobson agents.
 */

import { WshobsonDelegator, type DelegationContext } from './delegator.js';
import { InMemoryAgentRepository } from './repositories/in-memory.js';

/**
 * Example 1: Basic Delegation
 */
async function basicDelegation() {
  console.log('\n=== Example 1: Basic Delegation ===\n');

  // Create repository
  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  // Create delegator
  const delegator = new WshobsonDelegator(repository);

  // Delegate a task
  const result = await delegator.delegateToAgent(
    'business-analyst',
    'Analyze the requirements for the new authentication feature'
  );

  if (result.success) {
    console.log(`✓ Success: ${result.output}`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Confidence: ${result.confidence}`);
  } else {
    console.error(`✗ Error: ${result.error?.message}`);
    console.error(`  Code: ${result.error?.code}`);
    console.error(`  Retryable: ${result.error?.retryable}`);
  }
}

/**
 * Example 2: Delegation with Context
 */
async function delegationWithContext() {
  console.log('\n=== Example 2: Delegation with Context ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  const delegator = new WshobsonDelegator(repository);

  // Create delegation context
  const context: DelegationContext = {
    workspacePath: '/home/user/project',
    traceId: 'auth-analysis-001',
    timeout: 30000,
    metadata: {
      priority: 'high',
      owner: 'orchestrator',
      tags: ['security', 'authentication'],
    },
    fileOwnership: {
      ownedPaths: ['/home/user/project/src/auth/'],
      readOnlyPaths: ['/home/user/project/src/core/'],
      transferOnCompletion: true,
    },
  };

  const result = await delegator.delegateToAgent(
    'security-auditor',
    'Review the authentication module for security vulnerabilities',
    context
  );

  console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`Trace ID: ${result.traceId}`);

  if (result.success && result.metadata) {
    console.log(`Modified files: ${result.metadata.modifiedFiles?.join(', ')}`);
    console.log(`Capabilities used: ${result.metadata.capabilitiesUsed?.join(', ')}`);
  }
}

/**
 * Example 3: Delegation with Retry
 */
async function delegationWithRetry() {
  console.log('\n=== Example 3: Delegation with Retry ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  const delegator = new WshobsonDelegator(repository);

  const result = await delegator.delegateToAgent(
    'data-analyst',
    'Analyze sales trends from Q4 data',
    undefined,  // No context
    {
      timeout: 15000,
      retry: {
        maxAttempts: 5,
        baseDelay: 1000,
        exponentialBackoff: true,
      },
      updateAgentStats: true,
    }
  );

  console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
  console.log(`Duration: ${result.duration}ms`);

  if (!result.success) {
    console.error(`Error code: ${result.error?.code}`);
    console.error(`Retry delay: ${result.error?.retryDelay}ms`);
  }
}

/**
 * Example 4: Cancellation
 */
async function cancellationExample() {
  console.log('\n=== Example 4: Cancellation ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  const delegator = new WshobsonDelegator(repository);

  const context: DelegationContext = {
    traceId: 'long-running-task-001',
    timeout: 60000,
  };

  // Start a long-running task
  const taskPromise = delegator.delegateToAgent(
    'code-generator',
    'Generate a complete REST API with 50 endpoints',
    context
  );

  // Cancel after 2 seconds
  setTimeout(() => {
    console.log('Cancelling task...');
    delegator.cancelDelegation(context.traceId!);
  }, 2000);

  const result = await taskPromise;

  console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
  console.log(`Error: ${result.error?.message}`);
}

/**
 * Example 5: Multiple Parallel Delegations
 */
async function parallelDelegations() {
  console.log('\n=== Example 5: Parallel Delegations ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  const delegator = new WshobsonDelegator(repository, 30000);

  // Run multiple delegations in parallel
  const tasks = [
    delegator.delegateToAgent('business-analyst', 'Analyze requirements'),
    delegator.delegateToAgent('security-auditor', 'Review security'),
    delegator.delegateToAgent('performance-expert', 'Optimize performance'),
    delegator.delegateToAgent('test-engineer', 'Generate test cases'),
  ];

  console.log(`Active delegations: ${delegator.getActiveDelegationCount()}`);

  const results = await Promise.all(tasks);

  console.log('\nResults:');
  results.forEach((result, index) => {
    console.log(`  ${index + 1}. ${result.agentName}: ${result.success ? '✓' : '✗'} (${result.duration}ms)`);
  });
}

/**
 * Example 6: Error Handling
 */
async function errorHandling() {
  console.log('\n=== Example 6: Error Handling ===\n');

  const repository = new InMemoryAgentRepository();
  await repository.initialize('/path/to/plugins');

  const delegator = new WshobsonDelegator(repository);

  // Try to delegate to non-existent agent
  const result = await delegator.delegateToAgent(
    'non-existent-agent',
    'Do something'
  );

  if (!result.success) {
    console.log(`Error code: ${result.error?.code}`);
    console.log(`Error message: ${result.error?.message}`);
    console.log(`Retryable: ${result.error?.retryable}`);

    // Handle specific error codes
    switch (result.error?.code) {
      case 'AGENT_NOT_FOUND':
        console.log('Action: Check agent name spelling or scan plugins');
        break;
      case 'TIMEOUT':
        console.log('Action: Increase timeout or optimize task');
        break;
      case 'VALIDATION_ERROR':
        console.log('Action: Fix request format');
        break;
      case 'EXECUTION_ERROR':
        console.log('Action: Check agent logs and retry');
        break;
    }
  }
}

/**
 * Run all examples
 */
async function main() {
  try {
    await basicDelegation();
    await delegationWithContext();
    await delegationWithRetry();
    await cancellationExample();
    await parallelDelegations();
    await errorHandling();

    console.log('\n=== All Examples Complete ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export examples for use in tests or documentation
export {
  basicDelegation,
  delegationWithContext,
  delegationWithRetry,
  cancellationExample,
  parallelDelegations,
  errorHandling,
};

// Run if executed directly
if (require.main === module) {
  main();
}
