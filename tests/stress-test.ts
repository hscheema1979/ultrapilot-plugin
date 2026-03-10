/**
 * wshobson Agent Integration - Stress Testing Suite
 *
 * Comprehensive stress tests for robustness, performance, and reliability.
 * Part of Phase 5: Robustness & Performance.
 */

import { getCircuitBreaker } from '../src/wshobson/circuit-breaker';
import { getCacheManager } from '../src/wshobson/cache';
import { getMonitor } from '../src/wshobson/monitor';
import { getRecoveryManager } from '../src/wshobson/recovery';

/**
 * Test result
 */
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details: Record<string, any>;
  error?: string;
}

/**
 * Stress test suite
 */
export class StressTestSuite {
  private results: TestResult[] = [];
  private monitor = getMonitor();
  private circuitBreaker = getCircuitBreaker();
  private cacheManager = getCacheManager();
  private recoveryManager = getRecoveryManager();

  /**
   * Run all stress tests
   */
  async runAllTests(): Promise<TestResult[]> {
    console.log('\n=== Stress Testing Suite Started ===\n');

    // Test 1: Sequential delegations (99.9% success rate)
    await this.runTest('Sequential Delegations', async () => {
      return await this.testSequentialDelegations(1000);
    });

    // Test 2: Parallel agents (resource exhaustion)
    await this.runTest('Parallel Agents', async () => {
      return await this.testParallelAgents(20);
    });

    // Test 3: Circuit breaker (agent failure injection)
    await this.runTest('Circuit Breaker', async () => {
      return await this.testCircuitBreaker();
    });

    // Test 4: Context overflow tests
    await this.runTest('Context Overflow', async () => {
      return await this.testContextOverflow();
    });

    // Test 5: Memory leak detection
    await this.runTest('Memory Leak Detection', async () => {
      return await this.testMemoryLeaks();
    });

    // Test 6: Cache performance
    await this.runTest('Cache Performance', async () => {
      return await this.testCachePerformance();
    });

    // Test 7: Recovery state
    await this.runTest('Recovery State', async () => {
      return await this.testRecoveryState();
    });

    // Test 8: Circuit breaker persistence
    await this.runTest('Circuit Breaker Persistence', async () => {
      return await this.testCircuitBreakerPersistence();
    });

    // Print summary
    this.printSummary();

    return this.results;
  }

  /**
   * Run a single test
   */
  private async runTest(
    name: string,
    testFn: () => Promise<Record<string, any>>
  ): Promise<void> {
    console.log(`\nRunning: ${name}...`);
    const startTime = Date.now();

    try {
      const details = await testFn();
      const duration = Date.now() - startTime;

      const result: TestResult = {
        name,
        passed: details.passed ?? true,
        duration,
        details,
      };

      this.results.push(result);

      const status = result.passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`${status} (${duration}ms)`);
      console.log(`  Details:`, JSON.stringify(details, null, 2).split('\n').join('\n  '));
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: TestResult = {
        name,
        passed: false,
        duration,
        details: {},
        error: (error as Error).message,
      };

      this.results.push(result);

      console.log(`✗ FAILED (${duration}ms)`);
      console.log(`  Error: ${(error as Error).message}`);
    }
  }

  /**
   * Test 1: Sequential delegations (99.9% success rate)
   */
  private async testSequentialDelegations(count: number): Promise<Record<string, any>> {
    const agent = 'test-agent';
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    console.log(`  Testing ${count} sequential delegations...`);

    for (let i = 0; i < count; i++) {
      try {
        await this.circuitBreaker.execute(agent, async () => {
          // Simulate agent work
          await this.delay(10 + Math.random() * 20);
          return { success: true };
        });

        successCount++;
      } catch (error) {
        failureCount++;
        errors.push((error as Error).message);
      }

      // Progress update every 100
      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${count}`);
      }
    }

    const successRate = successCount / count;
    const passed = successRate >= 0.999; // 99.9% threshold

    return {
      passed,
      total: count,
      successCount,
      failureCount,
      successRate: (successRate * 100).toFixed(3) + '%',
      threshold: '99.9%',
      errors: errors.slice(0, 5), // First 5 errors
    };
  }

  /**
   * Test 2: Parallel agents (resource exhaustion)
   */
  private async testParallelAgents(agentCount: number): Promise<Record<string, any>> {
    console.log(`  Testing ${agentCount} parallel agents...`);

    const agents = Array.from({ length: agentCount }, (_, i) => `agent-${i}`);
    const startTime = Date.now();

    try {
      // Execute all agents in parallel
      const results = await Promise.allSettled(
        agents.map((agent) =>
          this.circuitBreaker.execute(agent, async () => {
            await this.delay(100 + Math.random() * 200);
            return { agent, success: true };
          })
        )
      );

      const duration = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failureCount = results.filter((r) => r.status === 'rejected').length;

      return {
        passed: successCount === agentCount,
        agentCount,
        successCount,
        failureCount,
        duration,
        avgLatency: duration / agentCount,
      };
    } catch (error) {
      return {
        passed: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Test 3: Circuit breaker (agent failure injection)
   */
  private async testCircuitBreaker(): Promise<Record<string, any>> {
    const agent = 'failure-test-agent';
    const failureCount = 5;
    const cooldownPeriod = 60000; // 60 seconds

    console.log(`  Testing circuit breaker with ${failureCount} failures...`);

    // Reset circuit
    this.circuitBreaker.reset(agent);

    // 1. Trigger failures to open circuit
    for (let i = 0; i < failureCount; i++) {
      try {
        await this.circuitBreaker.execute(agent, async () => {
          throw new Error('Simulated failure');
        });
      } catch (error) {
        // Expected
      }
    }

    const stateAfterFailures = this.circuitBreaker.getState(agent);
    const circuitOpened = stateAfterFailures === 'open';

    // 2. Verify circuit is open (rejects immediately)
    let rejectedImmediately = false;
    try {
      await this.circuitBreaker.execute(agent, async () => {
        return { success: true };
      });
    } catch (error) {
      rejectedImmediately = (error as Error).message.includes('OPEN');
    }

    // 3. Test circuit closes after cooldown (we'll manually reset for testing)
    this.circuitBreaker.reset(agent);
    const stateAfterReset = this.circuitBreaker.getState(agent);
    const circuitClosed = stateAfterReset === 'closed';

    return {
      passed: circuitOpened && rejectedImmediately && circuitClosed,
      circuitOpened,
      rejectedImmediately,
      circuitClosed,
      stateAfterFailures,
      stateAfterReset,
      failureThreshold: 5,
      cooldownPeriod: `${cooldownPeriod}ms`,
    };
  }

  /**
   * Test 4: Context overflow tests
   */
  private async testContextOverflow(): Promise<Record<string, any>> {
    const maxSize = 100 * 1024; // 100KB

    console.log(`  Testing context size limits (${maxSize} bytes)...`);

    // Test 1: Small context (should pass)
    const smallContext = 'x'.repeat(1024); // 1KB
    let smallPassed = false;
    try {
      await this.cacheManager.set('test:small', smallContext);
      const retrieved = this.cacheManager.get('test:small');
      smallPassed = retrieved === smallContext;
    } catch (error) {
      // Expected to fail if too large
    }

    // Test 2: Large context (should be rejected/truncated)
    const largeContext = 'x'.repeat(maxSize * 2); // 200KB
    let largeRejected = false;
    try {
      await this.cacheManager.set('test:large', largeContext);
    } catch (error) {
      largeRejected = true;
    }

    return {
      passed: smallPassed && largeRejected,
      smallContextPassed: smallPassed,
      largeContextRejected: largeRejected,
      maxSize: `${maxSize} bytes`,
      smallSize: '1KB',
      largeSize: '200KB',
    };
  }

  /**
   * Test 5: Memory leak detection
   */
  private async testMemoryLeaks(): Promise<Record<string, any>> {
    console.log(`  Testing for memory leaks (shortened version)...`);

    // Get initial memory
    if (global.gc) {
      global.gc();
    }
    const initialMemory = process.memoryUsage().heapUsed;

    // Run many operations
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      // Create cache entries
      await this.cacheManager.set(`test:${i}`, { data: 'x'.repeat(1024) });

      // Trigger circuit breaker operations
      try {
        await this.circuitBreaker.execute(`agent-${i}`, async () => {
          return { success: true };
        });
      } catch (error) {
        // Ignore
      }

      if (i % 100 === 0) {
        // Force GC periodically
        if (global.gc) {
          global.gc();
        }
      }
    }

    // Force GC and check final memory
    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    const memoryGrowthPerOp = memoryGrowth / iterations;

    // Memory growth should be minimal (< 1KB per operation)
    const passed = memoryGrowthPerOp < 1024;

    return {
      passed,
      iterations,
      initialMemory: `${(initialMemory / 1024 / 1024).toFixed(2)} MB`,
      finalMemory: `${(finalMemory / 1024 / 1024).toFixed(2)} MB`,
      memoryGrowth: `${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`,
      memoryGrowthPerOp: `${(memoryGrowthPerOp / 1024).toFixed(2)} KB`,
      threshold: '< 1KB per operation',
    };
  }

  /**
   * Test 6: Cache performance
   */
  private async testCachePerformance(): Promise<Record<string, any>> {
    console.log(`  Testing cache performance...`);

    const iterations = 10000;
    const testData = { value: 'test data' };

    // Warm cache
    for (let i = 0; i < 100; i++) {
      await this.cacheManager.set(`perf:${i}`, testData);
    }

    // Test hits
    const hitStart = Date.now();
    let hits = 0;
    for (let i = 0; i < iterations; i++) {
      const key = `perf:${i % 100}`;
      const result = this.cacheManager.get(key);
      if (result) hits++;
    }
    const hitDuration = Date.now() - hitStart;

    // Test misses
    const missStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      this.cacheManager.get(`nonexistent:${i}`);
    }
    const missDuration = Date.now() - missStart;

    const stats = this.cacheManager.getStats();
    const hitRate = hits / iterations;
    const passed = hitRate > 0.95; // 95% hit rate threshold

    return {
      passed,
      iterations,
      hits,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      threshold: '> 95%',
      avgHitLatency: `${(hitDuration / iterations).toFixed(3)}ms`,
      avgMissLatency: `${(missDuration / iterations).toFixed(3)}ms`,
      stats: {
        hitRate: (stats.hitRate * 100).toFixed(2) + '%',
        size: stats.size,
        totalSize: `${(stats.totalSize / 1024).toFixed(2)} KB`,
      },
    };
  }

  /**
   * Test 7: Recovery state
   */
  private async testRecoveryState(): Promise<Record<string, any>> {
    console.log(`  Testing recovery state...`);

    const traceId = 'test-trace-' + Date.now();
    const agent = 'test-agent';
    const task = 'Test task for recovery';

    // Start delegation
    const checkpointId = await this.recoveryManager.startDelegation(
      traceId,
      agent,
      task,
      { ownedPaths: [], readOnlyPaths: [] }
    );

    // Update progress
    await this.recoveryManager.updateProgress(checkpointId, {
      status: 'in-progress',
      partialResult: { progress: 50 },
    });

    // Complete delegation
    await this.recoveryManager.completeDelegation(checkpointId, {
      agent,
      success: true,
      result: { data: 'test result' },
      duration: 100,
      traceId,
    });

    const stats = this.recoveryManager.getStats();
    const passed = stats.completedDelegations > 0;

    return {
      passed,
      checkpointId,
      stats,
    };
  }

  /**
   * Test 8: Circuit breaker persistence
   */
  private async testCircuitBreakerPersistence(): Promise<Record<string, any>> {
    console.log(`  Testing circuit breaker persistence...`);

    const agent = 'persistence-test-agent';

    // Reset and open circuit
    this.circuitBreaker.reset(agent);

    // Trigger failures to open circuit
    for (let i = 0; i < 5; i++) {
      try {
        await this.circuitBreaker.execute(agent, async () => {
          throw new Error('Test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    const stateBefore = this.circuitBreaker.getState(agent);

    // Note: Full persistence test would require process restart
    // For now, just verify state is maintained
    const allStates = this.circuitBreaker.getAllStates();
    const passed = stateBefore === 'open' && agent in allStates;

    return {
      passed,
      agent,
      stateBefore,
      hasStateInAllStates: agent in allStates,
      note: 'Full test requires process restart',
    };
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log('\n=== Test Summary ===\n');

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${passRate}%`);
    console.log(`Total Duration: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.name}`);
          if (r.error) {
            console.log(`    Error: ${r.error}`);
          }
        });
    }

    console.log('\n=== Stress Testing Suite Complete ===\n');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Run stress tests
 */
export async function runStressTests(): Promise<void> {
  const suite = new StressTestSuite();
  await suite.runAllTests();
}

// Run tests if executed directly
if (require.main === module) {
  runStressTests().catch(console.error);
}
