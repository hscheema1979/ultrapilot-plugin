/**
 * File Ownership and Distributed Tracing Demo
 *
 * Demonstrates how to use the FileOwnershipRegistry and TraceManager together
 * for parallel agent execution with proper conflict prevention and debugging.
 */

import { FileOwnershipRegistry, createOwnershipRegistry } from './ownership.js';
import { TraceManager, createTraceManager } from './tracing.js';

/**
 * Demo: Parallel agent execution with file ownership and tracing
 */
async function demoParallelExecution() {
  console.log('=== File Ownership & Distributed Tracing Demo ===\n');

  // Initialize components
  const registry = await createOwnershipRegistry('/tmp/demo-ownership.json', {
    ownershipTimeout: 300000,  // 5 minutes
    autoCleanup: true,
  });

  const tracer = createTraceManager({
    maxTraces: 100,
    maxSpansPerTrace: 100,
  });

  // Create a trace for the workflow
  const trace = tracer.createTrace(undefined, 'parallel-workflow');
  console.log(`Created trace: ${trace.traceId}\n`);

  // Span: Agent 1 claims files
  console.log('--- Agent 1: Claiming ownership ---');
  const agent1Span = tracer.startSpan(trace.traceId, 'agent-1-claim-ownership');
  tracer.logEvent(agent1Span, 'claim-started', { agent: 'agent-1' });

  try {
    await registry.claimOwnership('agent-1', [
      '/project/src/auth.ts',
      '/project/src/auth/types.ts',
      '/project/src/auth/utils.ts',
    ]);
    tracer.logEvent(agent1Span, 'claim-success', {
      files: 3,
      paths: ['auth.ts', 'auth/types.ts', 'auth/utils.ts'],
    });
  } catch (error) {
    agent1Span.status = 'error';
    agent1Span.error = error instanceof Error ? error.message : String(error);
  }
  tracer.endSpan(agent1Span);
  console.log('Agent 1 claimed 3 files\n');

  // Span: Agent 2 tries to claim same files (fails)
  console.log('--- Agent 2: Attempting to claim conflicting files ---');
  const agent2Span = tracer.startSpan(trace.traceId, 'agent-2-claim-attempt');
  tracer.logEvent(agent2Span, 'claim-started', { agent: 'agent-2' });

  const violations = await registry.validateOwnership('agent-2', [
    '/project/src/auth.ts',  // CONFLICT!
    '/project/src/user/types.ts',  // OK
  ]);

  if (violations.length > 0) {
    tracer.logEvent(agent2Span, 'claim-failed', {
      reason: 'ownership-conflict',
      violations: violations.length,
    });
    console.log(`Agent 2 blocked: ${violations.length} conflicts`);
    violations.forEach(v => {
      console.log(`  - ${v.filePath} owned by ${v.currentOwner}`);
    });
  } else {
    tracer.logEvent(agent2Span, 'claim-success', { files: 2 });
  }
  tracer.endSpan(agent2Span);
  console.log();

  // Span: Agent 1 releases files
  console.log('--- Agent 1: Releasing ownership ---');
  const releaseSpan = tracer.startSpan(trace.traceId, 'agent-1-release');
  await registry.releaseOwnership('agent-1', [
    '/project/src/auth.ts',
    '/project/src/auth/types.ts',
  ]);
  tracer.logEvent(releaseSpan, 'release-success', {
    agent: 'agent-1',
    files: 2,
  });
  tracer.endSpan(releaseSpan);
  console.log('Agent 1 released 2 files\n');

  // Span: Agent 2 claims released files
  console.log('--- Agent 2: Claiming released files ---');
  const agent2ClaimSpan = tracer.startSpan(trace.traceId, 'agent-2-claim-success');
  await registry.claimOwnership('agent-2', [
    '/project/src/auth.ts',  // Now available!
    '/project/src/user/types.ts',
  ]);
  tracer.logEvent(agent2ClaimSpan, 'claim-success', {
    agent: 'agent-2',
    files: 2,
  });
  tracer.endSpan(agent2ClaimSpan);
  console.log('Agent 2 successfully claimed 2 files\n');

  // Get ownership statistics
  console.log('--- Ownership Statistics ---');
  const stats = await registry.getStats();
  console.log(`Total owned files: ${stats.totalFiles}`);
  console.log(`Active agents: ${stats.activeAgents}`);
  Object.entries(stats.agentsWithOwnership).forEach(([agent, count]) => {
    console.log(`  ${agent}: ${count} files`);
  });
  console.log();

  // Get trace statistics
  console.log('--- Trace Statistics ---');
  const traceStats = await tracer.getStats();
  console.log(`Total traces: ${traceStats.totalTraces}`);
  console.log(`Active traces: ${traceStats.activeTraces}`);
  console.log(`Total spans: ${traceStats.totalSpans}`);
  console.log(`Active spans: ${traceStats.activeSpans}`);
  console.log(`Avg spans per trace: ${traceStats.avgSpansPerTrace.toFixed(2)}`);
  console.log();

  // Export trace to OpenTelemetry format
  console.log('--- OpenTelemetry Export ---');
  const otelExport = tracer.exportTrace(trace.traceId);
  console.log(
    `Exported ${otelExport.resourceSpans[0].scopeSpans[0].spans.length} spans`
  );
  console.log();

  // Display trace tree
  console.log('--- Trace Timeline ---');
  const fullTrace = tracer.getTrace(trace.traceId);
  if (fullTrace) {
    fullTrace.spans.forEach(span => {
      const duration = span.duration ? `${span.duration}ms` : 'active';
      const indent = span.parentSpanId ? '  ' : '';
      console.log(`${indent}${span.name} [${span.status}] (${duration})`);
      if (span.events.length > 0) {
        span.events.forEach(event => {
          console.log(
            `${indent}  @ ${event.name}: ${JSON.stringify(event.attributes)}`
          );
        });
      }
    });
  }
  console.log();

  // Cleanup
  console.log('--- Cleanup ---');
  await registry.destroy(true);
  await tracer.clearAll();
  console.log('Registry and tracer cleaned up');

  console.log('\n=== Demo Complete ===');
}

/**
 * Demo: Trace context propagation across agents
 */
async function demoTracePropagation() {
  console.log('\n=== Trace Propagation Demo ===\n');

  const tracer = createTraceManager();

  // Create root trace
  const rootTrace = tracer.createTrace(undefined, 'orchestrator-workflow');
  console.log(`Root trace: ${rootTrace.traceId}`);
  console.log(`Root span: ${rootTrace.spanId}\n`);

  // Add baggage to root
  rootTrace.baggage.set('workflow-id', 'parallel-task-123');
  rootTrace.baggage.set('priority', 'high');

  // Child trace inherits baggage
  const childTrace = tracer.createTrace(rootTrace.traceId, 'agent-subtask');
  console.log(`Child trace: ${childTrace.traceId}`);
  console.log(`Child parent: ${childTrace.parentSpanId}`);
  console.log(`Inherited baggage:`);
  childTrace.baggage.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  // Add baggage to child
  childTrace.baggage.set('agent', 'business-analyst');
  childTrace.baggage.set('task', 'analyze-requirements');

  // Create spans with parent-child relationship
  const parentSpan = tracer.startSpan(childTrace.traceId, 'orchestrator-delegation');
  const childSpan = tracer.startSpan(
    childTrace.traceId,
    'agent-execution',
    parentSpan.spanId  // Nested span
  );

  // End spans
  tracer.endSpan(childSpan);
  tracer.endSpan(parentSpan);

  console.log('\n=== Trace Propagation Complete ===\n');
}

/**
 * Demo: Automatic timeout cleanup
 */
async function demoTimeoutCleanup() {
  console.log('\n=== Timeout Cleanup Demo ===\n');

  // Create registry with short timeout for demo
  const registry = await createOwnershipRegistry('/tmp/demo-ownership-timeout.json', {
    ownershipTimeout: 2000,  // 2 seconds
    autoCleanup: true,
    cleanupInterval: 1000,   // Check every second
  });

  // Agent claims files
  await registry.claimOwnership('agent-1', ['/project/src/timeout.ts']);
  console.log('Agent 1 claimed timeout.ts');

  // Check ownership
  let owner = await registry.checkOwnership('/project/src/timeout.ts');
  console.log(`Current owner: ${owner || 'none'}\n`);

  // Wait for timeout
  console.log('Waiting 3 seconds for timeout...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Check ownership again (should be null due to timeout)
  owner = await registry.checkOwnership('/project/src/timeout.ts');
  console.log(`Current owner after timeout: ${owner || 'none (timed out)'}`);

  // Cleanup
  await registry.destroy(true);
  console.log('\n=== Timeout Cleanup Demo Complete ===\n');
}

// Run demos
async function main() {
  try {
    await demoParallelExecution();
    await demoTracePropagation();
    await demoTimeoutCleanup();
  } catch (error) {
    console.error('Demo error:', error);
  }
}

// Run if executed directly
main();
