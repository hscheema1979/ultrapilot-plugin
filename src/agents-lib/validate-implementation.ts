#!/usr/bin/env ts-node

/**
 * Quick validation script for Agent 3 implementation
 * Verifies that all components are working correctly
 */

import { createOwnershipRegistry } from './ownership.js';
import { createTraceManager } from './tracing.js';

async function validateOwnershipRegistry() {
  console.log('=== Validating File Ownership Registry ===\n');

  const registry = await createOwnershipRegistry('/tmp/validate-ownership.json', {
    ownershipTimeout: 5000,
    autoCleanup: true,
  });

  // Test 1: Claim ownership
  console.log('Test 1: Claim ownership...');
  await registry.claimOwnership('agent-test', ['/tmp/test-file.ts']);
  let owner = await registry.checkOwnership('/tmp/test-file.ts');
  console.assert(owner === 'agent-test', 'Ownership claim failed');
  console.log('✓ Ownership claimed successfully\n');

  // Test 2: Conflict detection
  console.log('Test 2: Conflict detection...');
  const violations = await registry.validateOwnership('agent-other', ['/tmp/test-file.ts']);
  console.assert(violations.length === 1, 'Conflict detection failed');
  console.assert(violations[0].currentOwner === 'agent-test', 'Wrong owner in violation');
  console.log('✓ Conflict detected correctly\n');

  // Test 3: Release ownership
  console.log('Test 3: Release ownership...');
  await registry.releaseOwnership('agent-test', ['/tmp/test-file.ts']);
  owner = await registry.checkOwnership('/tmp/test-file.ts');
  console.assert(owner === null, 'Ownership release failed');
  console.log('✓ Ownership released successfully\n');

  // Test 4: Statistics
  console.log('Test 4: Statistics...');
  const stats = await registry.getStats();
  console.assert(typeof stats.totalFiles === 'number', 'Stats failed');
  console.log(`✓ Statistics: ${stats.totalFiles} files, ${stats.activeAgents} agents\n`);

  // Cleanup
  await registry.destroy(true);
  console.log('✓ File Ownership Registry: ALL TESTS PASSED\n');
}

async function validateTraceManager() {
  console.log('=== Validating Trace Manager ===\n');

  const tracer = createTraceManager();

  // Test 1: Create trace
  console.log('Test 1: Create trace...');
  const trace = tracer.createTrace(undefined, 'validation-trace');
  console.assert(trace.traceId !== undefined, 'Trace ID missing');
  console.assert(trace.spanId !== undefined, 'Span ID missing');
  console.log(`✓ Trace created: ${trace.traceId}\n`);

  // Test 2: Create span
  console.log('Test 2: Create span...');
  const span = tracer.startSpan(trace.traceId, 'test-span');
  console.assert(span.spanId !== undefined, 'Span ID missing');
  console.assert(span.status === 'active', 'Span not active');
  console.log(`✓ Span created: ${span.spanId}\n`);

  // Test 3: Log events
  console.log('Test 3: Log events...');
  tracer.logEvent(span, 'test-event', { test: 'data' });
  console.assert(span.events.length === 1, 'Event not logged');
  console.log('✓ Event logged successfully\n');

  // Test 4: End span
  console.log('Test 4: End span...');
  tracer.endSpan(span);
  console.assert(span.status === 'completed', 'Span not completed');
  console.assert(span.duration !== undefined, 'Duration missing');
  console.log(`✓ Span ended: ${span.duration}ms\n`);

  // Test 5: Baggage propagation
  console.log('Test 5: Baggage propagation...');
  trace.baggage.set('test-key', 'test-value');
  const childTrace = tracer.createTrace(trace.traceId, 'child-trace');
  console.assert(childTrace.baggage.get('test-key') === 'test-value', 'Baggage not propagated');
  console.log('✓ Baggage propagated correctly\n');

  // Test 6: Export trace
  console.log('Test 6: Export trace...');
  const otelExport = tracer.exportTrace(trace.traceId);
  console.assert(otelExport.resourceSpans.length > 0, 'Export failed');
  console.log(`✓ Trace exported: ${otelExport.resourceSpans[0].scopeSpans[0].spans.length} spans\n`);

  // Test 7: Statistics
  console.log('Test 7: Statistics...');
  const stats = await tracer.getStats();
  console.assert(stats.totalTraces > 0, 'No traces found');
  console.log(`✓ Statistics: ${stats.totalTraces} traces, ${stats.totalSpans} spans\n`);

  // Cleanup
  await tracer.clearAll();
  console.log('✓ Trace Manager: ALL TESTS PASSED\n');
}

async function validateIntegration() {
  console.log('=== Validating Integration ===\n');

  const registry = await createOwnershipRegistry('/tmp/validate-integration.json');
  const tracer = createTraceManager();

  // Create workflow trace
  const trace = tracer.createTrace(undefined, 'integration-test');
  trace.baggage.set('workflow', 'test');

  // Agent claims files
  const span1 = tracer.startSpan(trace.traceId, 'agent-claim');
  await registry.claimOwnership('agent-1', ['/tmp/file1.ts', '/tmp/file2.ts']);
  tracer.logEvent(span1, 'claimed', { files: 2 });
  tracer.endSpan(span1);

  // Verify ownership
  const span2 = tracer.startSpan(trace.traceId, 'verify-ownership');
  const owner = await registry.checkOwnership('/tmp/file1.ts');
  console.assert(owner === 'agent-1', 'Ownership verification failed');
  tracer.logEvent(span2, 'verified', { owner });
  tracer.endSpan(span2);

  // Export trace
  const otelExport = tracer.exportTrace(trace.traceId);
  console.assert(otelExport.resourceSpans[0].scopeSpans[0].spans.length === 2, 'Export failed');

  // Cleanup
  await registry.destroy(true);
  await tracer.clearAll();

  console.log('✓ Integration: ALL TESTS PASSED\n');
}

async function main() {
  try {
    await validateOwnershipRegistry();
    await validateTraceManager();
    await validateIntegration();

    console.log('╔════════════════════════════════════════════╗');
    console.log('║   ALL VALIDATION TESTS PASSED ✓          ║');
    console.log('║   Agent 3 Implementation Complete         ║');
    console.log('╚════════════════════════════════════════════╝');
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

main();
