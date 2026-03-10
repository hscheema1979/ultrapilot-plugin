/**
 * Circuit Breaker & Health Monitor Demo
 *
 * Demonstrates the integration of CircuitBreaker and HealthMonitor components
 * for production-grade failure handling and system health monitoring.
 *
 * Run with: node --loader ts-node/esm src/wshobson/circuit-breaker-demo.ts
 */

import { CircuitBreaker, CircuitState, CircuitBreakerEvent, type CircuitBreakerConfig } from './circuit-breaker.js';
import { HealthMonitor, createHealthMonitor } from './health.js';
import type { Agent } from './types.js';

/**
 * Simulated agent for demonstration
 */
const mockAgent: Agent = {
  name: 'business-analyst',
  plugin: 'business-analytics',
  path: '/mock/path',
  description: 'Analyzes business requirements',
  capabilities: [
    { name: 'analysis', hierarchy: ['business', 'analysis'], confidence: 0.9 }
  ],
  category: 'analysis',
  examples: [],
  metadata: { frontmatter: {}, content: '' },
  status: 'idle',
  lastUsed: Date.now(),
  successRate: 0.85,
};

/**
 * Demo 1: Basic Circuit Breaker Usage
 */
async function demoBasicCircuitBreaker() {
  console.log('\n=== Demo 1: Basic Circuit Breaker Usage ===\n');

  const config: Partial<CircuitBreakerConfig> = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000,
    halfOpenMaxCalls: 2,
  };

  const breaker = new CircuitBreaker('demo-agent', config);

  // Add event listener
  breaker.on((event, data) => {
    console.log(`[Event] ${event}:`, {
      agent: data.agentName,
      state: data.newState || data.metrics.state,
      failures: data.metrics.failureCount,
    });
  });

  // Simulate failures
  console.log('Simulating 3 consecutive failures...');
  for (let i = 0; i < 3; i++) {
    await breaker.recordFailure();
    const state = await breaker.getState();
    console.log(`After failure ${i + 1}: State = ${state}`);
  }

  // Check if requests are allowed
  const allowed = await breaker.allowRequest();
  console.log(`\nRequest allowed after tripping: ${allowed}`);

  // Wait for timeout
  console.log('\nWaiting for timeout (5s)...');
  await new Promise(resolve => setTimeout(resolve, 5100));

  // Check state transition
  const stateAfterTimeout = await breaker.getState();
  console.log(`State after timeout: ${stateAfterTimeout}`);

  // Simulate recovery
  console.log('\nSimulating recovery with 2 successes...');
  for (let i = 0; i < 2; i++) {
    const allowed = await breaker.allowRequest();
    console.log(`Request allowed in HALF_OPEN: ${allowed}`);
    await breaker.recordSuccess();
    const state = await breaker.getState();
    console.log(`After success ${i + 1}: State = ${state}`);
  }

  const finalState = await breaker.getState();
  console.log(`\nFinal state: ${finalState}`);
}

/**
 * Demo 2: Exponential Backoff
 */
async function demoExponentialBackoff() {
  console.log('\n=== Demo 2: Exponential Backoff ===\n');

  const config: Partial<CircuitBreakerConfig> = {
    failureThreshold: 2,
    timeout: 2000,
    exponentialBackoff: true,
    maxBackoffDelay: 10000,
  };

  const breaker = new CircuitBreaker('backoff-demo', config);

  console.log('Tripping circuit breaker...');
  await breaker.recordFailure();
  await breaker.recordFailure();

  const metrics1 = await breaker.getMetrics();
  console.log(`First trip - next attempt in: ${metrics1.currentTimeout}ms`);

  console.log('\nSimulating failed recovery...');
  await new Promise(resolve => setTimeout(resolve, 2100));
  await breaker.allowRequest();
  await breaker.recordFailure();

  const metrics2 = await breaker.getMetrics();
  console.log(`Second trip - next attempt in: ${metrics2.currentTimeout}ms`);
  console.log('(Timeout doubled due to exponential backoff)');
}

/**
 * Demo 3: Health Monitor Integration
 */
async function demoHealthMonitor() {
  console.log('\n=== Demo 3: Health Monitor Integration ===\n');

  // Create circuit breakers
  const breaker1 = new CircuitBreaker('agent-1', { failureThreshold: 3 });
  const breaker2 = new CircuitBreaker('agent-2', { failureThreshold: 5 });
  const breaker3 = new CircuitBreaker('agent-3', { failureThreshold: 2 });

  // Create health monitor
  const monitor = new HealthMonitor({
    version: '1.0.0',
    startTime: Date.now(),
    defaultCheckInterval: 5000,
    memoryThreshold: 0.7,
  });

  // Register circuit breakers
  monitor.registerCircuitBreaker('agent-1', breaker1);
  monitor.registerCircuitBreaker('agent-2', breaker2);
  monitor.registerCircuitBreaker('agent-3', breaker3);

  // Register agents
  const agents = new Map([
    ['agent-1', { ...mockAgent, name: 'agent-1', status: 'idle' as const }],
    ['agent-2', { ...mockAgent, name: 'agent-2', status: 'working' as const }],
    ['agent-3', { ...mockAgent, name: 'agent-3', status: 'idle' as const }],
  ]);
  monitor.registerAgents(agents);

  // Add custom health check
  monitor.registerCheck('custom-service', async () => {
    const isHealthy = Math.random() > 0.1; // 90% chance of healthy
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      message: isHealthy ? 'Service operational' : 'Service experiencing issues',
    };
  }, { critical: true, interval: 3000 });

  // Start monitoring
  await monitor.start();
  console.log('Health monitor started');

  // Get initial health
  const health1 = await monitor.getHealth();
  console.log('\nInitial Health Status:');
  console.log(`  Overall: ${health1.status}`);
  console.log(`  Checks: ${health1.checks.length}`);
  console.log(`  Memory: ${(health1.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Active Agents: ${health1.metrics.activeAgents}`);

  // Trip some circuit breakers
  console.log('\nTripping agent-3 circuit breaker...');
  await breaker3.recordFailure();
  await breaker3.recordFailure();

  // Get updated health
  const health2 = await monitor.getHealth();
  console.log('\nHealth Status After Tripping Circuit Breaker:');
  console.log(`  Overall: ${health2.status}`);
  health2.checks.forEach(check => {
    console.log(`  - ${check.name}: ${check.status}`);
  });

  // Stop monitoring
  await monitor.stop();
  console.log('\nHealth monitor stopped');
}

/**
 * Demo 4: Thread-Safe Operations
 */
async function demoThreadSafety() {
  console.log('\n=== Demo 4: Thread-Safe Operations ===\n');

  const breaker = new CircuitBreaker('concurrent-demo', {
    failureThreshold: 5,
    halfOpenMaxCalls: 10,
  });

  // Simulate concurrent operations
  console.log('Running 20 concurrent operations...');

  const operations = Array.from({ length: 20 }, async (_, i) => {
    // Random mix of successes and failures
    const isSuccess = Math.random() > 0.3;

    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    if (isSuccess) {
      await breaker.recordSuccess();
      return `Op ${i + 1}: SUCCESS`;
    } else {
      await breaker.recordFailure();
      return `Op ${i + 1}: FAILURE`;
    }
  });

  const results = await Promise.all(operations);

  const metrics = await breaker.getMetrics();
  console.log('\nResults:');
  console.log(`  Total operations: ${results.length}`);
  console.log(`  Final state: ${metrics.state}`);
  console.log(`  Failure count: ${metrics.failureCount}`);
  console.log(`  Trip count: ${metrics.tripCount}`);
}

/**
 * Demo 5: Persistence
 */
async function demoPersistence() {
  console.log('\n=== Demo 5: State Persistence ===\n');

  const breaker1 = new CircuitBreaker('persistent-agent', {
    failureThreshold: 3,
    timeout: 10000,
  });

  // Trip the circuit
  console.log('Tripping circuit breaker...');
  await breaker1.recordFailure();
  await breaker1.recordFailure();
  await breaker1.recordFailure();

  const state1 = await breaker1.getState();
  console.log(`State: ${state1}`);

  // Export state
  const exportedState = await breaker1.exportState();
  console.log('\nExported state:', exportedState);

  // Create new breaker and import state
  const breaker2 = new CircuitBreaker('persistent-agent');
  await breaker2.importState(exportedState);

  const state2 = await breaker2.getState();
  console.log(`State after import: ${state2}`);

  const metrics = await breaker2.getMetrics();
  console.log(`Failure count restored: ${metrics.failureCount}`);
  console.log(`Next attempt time: ${new Date(metrics.nextAttemptTime).toISOString()}`);
}

/**
 * Main entry point
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Circuit Breaker & Health Monitor Demonstration            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demoBasicCircuitBreaker();
    await demoExponentialBackoff();
    await demoHealthMonitor();
    await demoThreadSafety();
    await demoPersistence();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  All demos completed successfully!                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run demos
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
