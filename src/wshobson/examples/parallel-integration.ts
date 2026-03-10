/**
 * Parallel Delegation Integration Example
 *
 * Demonstrates how to use Phase 3 components for parallel agent delegation,
 * result collection, and synthesis.
 *
 * Usage: node examples/parallel-integration.ts
 */

import { WshobsonDelegator } from '../delegator.js';
import { AgentRepository } from '../repository.js';
import { ParallelDelegationEngine } from '../parallel.js';
import { ResultCollector } from '../collector.js';
import { ResultSynthesizer } from '../synthesizer.js';
import { VotingMechanism } from '../voting.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main integration example
 */
async function main() {
  console.log('=== UltraPilot Parallel Delegation Example ===\n');

  // Step 1: Initialize repository
  console.log('Step 1: Initializing agent repository...');
  const repository = new AgentRepository({
    pluginsPath: '~/.claude/plugins',
  });
  console.log('✓ Repository initialized\n');

  // Step 2: Initialize delegator
  console.log('Step 2: Initializing delegator...');
  const delegator = new WshobsonDelegator(repository);
  console.log('✓ Delegator initialized\n');

  // Step 3: Initialize parallel engine
  console.log('Step 3: Initializing parallel delegation engine...');
  const parallelEngine = new ParallelDelegationEngine(delegator, {
    maxConcurrency: 10,
    defaultTimeout: 5 * 60 * 1000, // 5 minutes
    continueOnFailure: true,
    onProgress: (progress) => {
      console.log(
        `  Progress: ${progress.completed}/${progress.total} (${progress.progress}%)`
      );
    },
  });
  console.log('✓ Parallel engine initialized\n');

  // Step 4: Define agents and tasks
  console.log('Step 4: Defining agents and tasks...');
  const agents = [
    'business-analyst',
    'api-designer',
    'typescript-expert',
    'security-reviewer',
    'quality-reviewer',
  ];

  const tasks = [
    'Extract requirements for OAuth2 authentication system',
    'Design REST API endpoints for authentication',
    'Define TypeScript types for user authentication',
    'Review security implications of OAuth2 implementation',
    'Check code quality and best practices for authentication',
  ];

  console.log(`  Agents: ${agents.join(', ')}`);
  console.log(`  Tasks: ${tasks.length} tasks defined\n`);

  // Step 5: Create trace context and ownership rules
  console.log('Step 5: Creating trace context and ownership rules...');
  const trace = {
    traceId: uuidv4(),
    spanId: uuidv4(),
    baggage: new Map([
      ['workflow', 'oauth2-implementation'],
      ['phase', 'execution'],
    ]),
  };

  const ownership = {
    ownedPaths: ['/home/ubuntu/hscheema1979/src'],
    readOnlyPaths: ['/home/ubuntu/hscheema1979/docs'],
    transferOnCompletion: false,
  };
  console.log('✓ Trace context and ownership rules created\n');

  // Step 6: Execute parallel delegation
  console.log('Step 6: Executing parallel delegation...');
  const startTime = Date.now();

  const parallelResult = await parallelEngine.delegateParallel(
    agents,
    tasks,
    trace,
    ownership,
    5 * 60 * 1000 // 5 minutes
  );

  const duration = Date.now() - startTime;
  console.log(`\n✓ Parallel delegation completed in ${duration}ms`);
  console.log(`  Successful: ${parallelResult.successCount}`);
  console.log(`  Failed: ${parallelResult.failureCount}`);
  console.log(`  Success rate: ${((parallelResult.successCount / agents.length) * 100).toFixed(1)}%\n`);

  // Step 7: Collect results
  console.log('Step 7: Collecting results...');
  const collector = new ResultCollector();

  // Mock executions for demo (in real usage, these would come from the engine)
  const executions = agents.map((agent, i) => ({
    agent,
    task: tasks[i],
    status: parallelResult.results.has(agent)
      ? ('completed' as const)
      : ('failed' as const),
    startedAt: Date.now() - duration,
    endedAt: Date.now(),
    timeout: 5 * 60 * 1000,
  }));

  const collection = await collector.collect(
    parallelResult,
    executions,
    await repository.getAgents()
  );

  console.log('✓ Results collected');
  console.log(`  Total agents: ${collection.stats.totalAgents}`);
  console.log(`  Successful: ${collection.stats.successCount}`);
  console.log(`  Failed: ${collection.stats.failureCount}`);
  console.log(`  Average duration: ${collection.stats.averageDuration.toFixed(0)}ms`);
  console.log(`  Success rate: ${(collection.stats.successRate * 100).toFixed(1)}%\n`);

  // Generate summary
  const summary = collector.generateSummary(collection);
  console.log(summary);
  console.log();

  // Step 8: Synthesize results with different strategies
  console.log('Step 8: Synthesizing results...\n');

  // Strategy 1: Merge Non-Conflicting
  console.log('Strategy 1: Merge Non-Conflicting');
  console.log('-----------------------------------');
  const synthesizer1 = new ResultSynthesizer({
    strategy: 'merge-non-conflicting',
    logConflicts: true,
    conflictLogPath: '/home/ubuntu/hscheema1979/.ultra/conflicts.json',
  });

  const synthesisResult1 = await synthesizer1.synthesize(collection);
  console.log(`  Conflicts detected: ${synthesisResult1.conflictCount}`);
  console.log(`  Synthesis duration: ${synthesisResult1.metadata.synthesisDuration}ms`);
  console.log();

  // Strategy 2: Majority Vote
  console.log('Strategy 2: Majority Vote');
  console.log('--------------------------');
  const synthesizer2 = new ResultSynthesizer({
    strategy: 'majority-vote',
    logConflicts: true,
    conflictLogPath: '/home/ubuntu/hscheema1979/.ultra/conflicts-majority.json',
  });

  const synthesisResult2 = await synthesizer2.synthesize(collection);
  console.log(`  Conflicts resolved: ${synthesisResult2.conflictCount}`);
  console.log(`  Synthesis duration: ${synthesisResult2.metadata.synthesisDuration}ms`);
  console.log();

  // Strategy 3: Weighted Vote
  console.log('Strategy 3: Weighted Vote');
  console.log('--------------------------');
  const synthesizer3 = new ResultSynthesizer({
    strategy: 'weighted-vote',
    logConflicts: true,
    conflictLogPath: '/home/ubuntu/hscheema1979/.ultra/conflicts-weighted.json',
    strategyOptions: {
      agentWeights: [
        { agent: 'security-reviewer', weight: 2.0, veto: true },
        { agent: 'architect', weight: 1.5, veto: false },
      ],
      defaultWeight: 1.0,
      vetoAction: 'reject-all',
    },
  });

  const synthesisResult3 = await synthesizer3.synthesize(collection);
  console.log(`  Conflicts resolved: ${synthesisResult3.conflictCount}`);
  console.log(`  Synthesis duration: ${synthesisResult3.metadata.synthesisDuration}ms`);
  console.log();

  // Step 9: Demonstrate voting mechanism
  console.log('Step 9: Demonstrating voting mechanism...');
  console.log('------------------------------------------');

  const voting = new VotingMechanism({
    weights: [
      { agent: 'security-reviewer', weight: 2.0, veto: true, tieBreakPriority: 100 },
      { agent: 'architect', weight: 1.5, veto: false, tieBreakPriority: 90 },
      { agent: 'developer', weight: 1.0, veto: false, tieBreakPriority: 50 },
    ],
    defaultWeight: 1.0,
    tieBreakMethod: 'priority',
    allowVeto: true,
    winThreshold: 0.5,
  });

  // Create a mock conflict for demonstration
  const mockConflict = {
    id: uuidv4(),
    type: 'recommendation' as const,
    agents: ['security-reviewer', 'developer', 'architect'],
    positions: [
      { agent: 'security-reviewer', position: 'reject-due-to-security' },
      { agent: 'developer', position: 'approve-with-changes' },
      { agent: 'architect', position: 'approve' },
    ],
    resolutionStrategy: 'weighted-vote' as const,
    decision: null,
    timestamp: Date.now(),
    metadata: { topic: 'feature-x-approval' },
  };

  const votingResult = voting.vote(mockConflict);
  const votingSummary = voting.generateVotingSummary(votingResult);
  console.log(votingSummary);
  console.log();

  // Step 10: Final summary
  console.log('=== Summary ===');
  console.log(`Total execution time: ${duration}ms`);
  console.log(`Agents used: ${agents.length}`);
  console.log(`Successful delegations: ${parallelResult.successCount}`);
  console.log(`Failed delegations: ${parallelResult.failureCount}`);
  console.log(`Conflicts detected and resolved: ${synthesisResult1.conflictCount}`);
  console.log(`\nConflicts logged to:`);
  console.log(`  - /home/ubuntu/hscheema1979/.ultra/conflicts.json`);
  console.log(`  - /home/ubuntu/hscheema1979/.ultra/conflicts-majority.json`);
  console.log(`  - /home/ubuntu/hscheema1979/.ultra/conflicts-weighted.json`);
  console.log('\n=== Example Complete ===');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
