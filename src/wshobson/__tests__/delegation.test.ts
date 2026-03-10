/**
 * Delegation System Tests
 *
 * Comprehensive tests for Phase 2 delegation functionality including:
 * - Single agent delegation
 * - Parallel delegation
 * - Fallback delegation
 * - Ownership validation
 * - Trace context propagation
 * - Error handling and retries
 *
 * Run with: npm test -- delegation.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WshobsonDelegator } from '../delegator.js';
import { FileOwnershipRegistry } from '../ownership.js';
import { TraceManager } from '../tracing.js';
import { ErrorHandler } from '../errors.js';
import { WorkspaceContext } from '../context.js';
import { IAgentRepository, Agent, FileOwnership, TraceContext } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mock repository for testing
 */
class MockAgentRepository implements IAgentRepository {
  private agents: Map<string, Agent> = new Map();

  constructor() {
    // Initialize with test agents
    this.addAgent({
      name: 'business-analyst',
      plugin: 'business-analytics',
      path: '/fake/path/business-analyst.md',
      description: 'Business analysis specialist',
      capabilities: [
        { name: 'requirements', hierarchy: ['business', 'requirements'], confidence: 0.9 },
      ],
      category: 'analysis',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.95,
    });

    this.addAgent({
      name: 'api-designer',
      plugin: 'backend-development',
      path: '/fake/path/api-designer.md',
      description: 'API design specialist',
      capabilities: [
        { name: 'api-design', hierarchy: ['backend', 'api', 'rest'], confidence: 0.95 },
        { name: 'typescript', hierarchy: ['backend', 'typescript'], confidence: 0.85 },
      ],
      category: 'development',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.9,
    });

    this.addAgent({
      name: 'typescript-expert',
      plugin: 'backend-development',
      path: '/fake/path/typescript-expert.md',
      description: 'TypeScript specialist',
      capabilities: [
        { name: 'typescript', hierarchy: ['backend', 'typescript'], confidence: 1.0 },
      ],
      category: 'development',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.98,
    });
  }

  addAgent(agent: Agent): void {
    this.agents.set(agent.name, agent);
  }

  async findAgents(capability: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.some(cap => cap.name === capability)
    );
  }

  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      capabilities.every(reqCap =>
        agent.capabilities.some(cap => cap.name === reqCap)
      )
    );
  }

  async getAgent(name: string): Promise<Agent | undefined> {
    return this.agents.get(name);
  }

  async findByPlugin(pluginName: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.plugin === pluginName
    );
  }

  async search(keyword: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.name.includes(keyword) ||
      agent.description.includes(keyword)
    );
  }

  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.name, agent);
  }

  async invalidate(agentName: string): Promise<void> {
    this.agents.delete(agentName);
  }

  async refresh(): Promise<void> {
    // No-op for mock
  }

  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getStats(): Promise<any> {
    return {
      pluginCount: 2,
      agentCount: this.agents.size,
      capabilityCount: 3,
      cacheHitRate: 1.0,
      lastScanTime: Date.now(),
      scanDuration: 0,
    };
  }
}

/**
 * Test fixtures
 */
function createMockOwnership(): FileOwnership {
  return {
    ownedPaths: ['/tmp/test-owned'],
    readOnlyPaths: ['/tmp/test-readonly'],
    transferOnCompletion: true,
  };
}

function createMockTrace(): TraceContext {
  return {
    traceId: uuidv4(),
    spanId: uuidv4(),
    baggage: new Map([
      ['agent-name', 'test-agent'],
      ['session-id', 'test-session'],
    ]),
  };
}

describe('Phase 2 Delegation System', () => {
  let repository: MockAgentRepository;
  let delegator: WshobsonDelegator;
  let ownershipRegistry: FileOwnershipRegistry;
  let traceManager: TraceManager;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    repository = new MockAgentRepository();
    delegator = new WshobsonDelegator(repository);
    ownershipRegistry = new FileOwnershipRegistry();
    traceManager = new TraceManager();
    errorHandler = new ErrorHandler();
  });

  afterEach(() => {
    ownershipRegistry.clearOwnership();
    traceManager.clearTrace();
  });

  describe('Task 1: WshobsonDelegator', () => {
    describe('Single Agent Delegation', () => {
      it('should delegate to a valid agent', async () => {
        const result = await delegator.delegate({
          agent: 'business-analyst',
          task: 'Extract requirements for OAuth2',
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(result.agent).toBe('business-analyst');
        expect(result.success).toBe(true);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.traceId).toBeDefined();
      });

      it('should fail for non-existent agent', async () => {
        const result = await delegator.delegate({
          agent: 'non-existent-agent',
          task: 'Test task',
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('Agent not found');
      });

      it('should measure delegation latency', async () => {
        const startTime = Date.now();

        const result = await delegator.delegate({
          agent: 'business-analyst',
          task: 'Test task',
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        const endTime = Date.now();
        const latency = endTime - startTime;

        expect(result.duration).toBeGreaterThan(0);
        expect(result.duration).toBeLessThan(5000); // Should be fast (< 5s)
        console.log(`✓ Delegation latency: ${result.duration}ms (target: <500ms)`);
      });

      it('should respect timeout', async () => {
        const result = await delegator.delegate({
          agent: 'business-analyst',
          task: 'Test task',
          trace: createMockTrace(),
          ownership: createMockOwnership(),
          timeout: 100, // 100ms timeout
        });

        // Should complete or timeout within reasonable time
        expect(result.duration).toBeLessThan(1000);
      });
    });

    describe('Parallel Delegation', () => {
      it('should delegate to multiple agents in parallel', async () => {
        const results = await delegator.delegateParallel({
          agents: ['business-analyst', 'api-designer', 'typescript-expert'],
          tasks: [
            'Extract requirements',
            'Design API',
            'Implement types',
          ],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(results.size).toBe(3);
        expect(results.get('business-analyst')?.agent).toBe('business-analyst');
        expect(results.get('api-designer')?.agent).toBe('api-designer');
        expect(results.get('typescript-expert')?.agent).toBe('typescript-expert');

        // Check that all completed
        for (const [agentName, result] of results) {
          expect(result.success).toBe(true);
          expect(result.duration).toBeGreaterThan(0);
        }
      });

      it('should complete parallel delegation within 2 seconds', async () => {
        const startTime = Date.now();

        const results = await delegator.delegateParallel({
          agents: ['business-analyst', 'api-designer', 'typescript-expert'],
          tasks: ['Task 1', 'Task 2', 'Task 3'],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        const duration = Date.now() - startTime;

        expect(results.size).toBe(3);
        expect(duration).toBeLessThan(2000); // Target: <2s for 3 agents
        console.log(`✓ Parallel delegation (${results.size} agents): ${duration}ms (target: <2000ms)`);
      });

      it('should handle partial failures in parallel delegation', async () => {
        const results = await delegator.delegateParallel({
          agents: ['business-analyst', 'non-existent-agent', 'api-designer'],
          tasks: ['Task 1', 'Task 2', 'Task 3'],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(results.size).toBe(3);
        expect(results.get('business-analyst')?.success).toBe(true);
        expect(results.get('non-existent-agent')?.success).toBe(false);
        expect(results.get('api-designer')?.success).toBe(true);
      });
    });

    describe('Fallback Delegation', () => {
      it('should try fallback chain until success', async () => {
        const result = await delegator.delegateWithFallback({
          task: 'Design REST API',
          requiredCapabilities: ['api-design'],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
          fallbackChain: ['api-designer', 'typescript-expert', 'business-analyst'],
        });

        expect(result.success).toBe(true);
        expect(['api-designer', 'typescript-expert', 'business-analyst']).toContain(result.agent);
      });

      it('should auto-select agents based on capabilities', async () => {
        const result = await delegator.delegateWithFallback({
          task: 'Design REST API',
          requiredCapabilities: ['api-design', 'typescript'],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(result.success).toBe(true);
        // Should select api-designer (has both capabilities)
        expect(result.agent).toBe('api-designer');
      });

      it('should fail if no agents match capabilities', async () => {
        const result = await delegator.delegateWithFallback({
          task: 'Impossible task',
          requiredCapabilities: ['non-existent-capability'],
          trace: createMockTrace(),
          ownership: createMockOwnership(),
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('No agents found');
      });
    });
  });

  describe('Task 2: File Ownership Protocol', () => {
    it('should validate ownership rules', async () => {
      const ownership = createMockOwnership();
      const result = await ownershipRegistry.validateOwnership(ownership);

      expect(result.valid).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should detect ownership conflicts', async () => {
      const ownership1 = createMockOwnership();
      const ownership2 = { ...createMockOwnership(), ownedPaths: ['/tmp/test-owned'] };

      await ownershipRegistry.transferOwnership(ownership1, 'agent-1');

      const conflict = ownershipRegistry.checkConflict('/tmp/test-owned', 'agent-2');

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflicts.length).toBeGreaterThan(0);
      expect(conflict.conflicts[0].currentOwner).toBe('agent-1');
    });

    it('should transfer ownership', async () => {
      const ownership = createMockOwnership();

      const result = await ownershipRegistry.transferOwnership(ownership, 'worker');

      expect(result.success).toBe(true);
      expect(result.transferredPaths).toContain('/tmp/test-owned');
    });

    it('should release ownership', async () => {
      const ownership = createMockOwnership();

      await ownershipRegistry.transferOwnership(ownership, 'worker');
      await ownershipRegistry.releaseOwnership(ownership);

      const isLocked = ownershipRegistry.isLocked('/tmp/test-owned');

      expect(isLocked).toBe(false);
    });

    it('should prevent concurrent edits', async () => {
      const ownership1 = { ...createMockOwnership() };
      const ownership2 = { ...createMockOwnership() };

      // First transfer succeeds
      const result1 = await ownershipRegistry.transferOwnership(ownership1, 'agent-1');
      expect(result1.success).toBe(true);

      // Second transfer fails (path locked)
      const result2 = await ownershipRegistry.transferOwnership(ownership2, 'agent-2');
      expect(result2.success).toBe(false);
      expect(result2.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Task 3: Distributed Tracing', () => {
    it('should create trace context', () => {
      const trace = traceManager.createTrace('test-operation');

      expect(trace.traceId).toBeDefined();
      expect(trace.spanId).toBeDefined();
      expect(trace.baggage).toBeInstanceOf(Map);
    });

    it('should create child spans', () => {
      const trace = traceManager.createTrace('parent-operation');
      const childSpanId = traceManager.createSpan(trace, 'child-operation');

      expect(childSpanId).toBeDefined();
      expect(childSpanId).not.toBe(trace.spanId);
    });

    it('should end spans and record duration', () => {
      const trace = traceManager.createTrace('test-operation');
      const spanId = traceManager.createSpan(trace, 'test-span');

      traceManager.endSpan(trace, spanId, true);

      const spans = traceManager.getSpans(trace.traceId);
      expect(spans).toBeDefined();
      expect(spans!.length).toBe(2); // Root span + child span
      expect(spans![1].endTime).toBeDefined();
      expect(spans![1].success).toBe(true);
    });

    it('should log trace messages', () => {
      const trace = traceManager.createTrace('test-operation');

      traceManager.log(trace.traceId, trace.spanId, 'info', 'Test message');

      const logs = traceManager.getLogs(trace.traceId);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].message).toBe('Test message');
    });

    it('should generate trace report', () => {
      const trace = traceManager.createTrace('test-operation');
      const spanId = traceManager.createSpan(trace, 'test-span');

      traceManager.endSpan(trace, spanId, true);

      const report = traceManager.generateTraceReport(trace.traceId);

      expect(report).toContain('Trace Report');
      expect(report).toContain('test-operation');
      expect(report).toContain('Statistics');
    });

    it('should propagate baggage', () => {
      const trace = traceManager.createTrace('test-operation');

      traceManager.setBaggage(trace, 'key1', 'value1');
      const value = traceManager.getBaggage(trace, 'key1');

      expect(value).toBe('value1');
    });
  });

  describe('Task 4: Error Handling', () => {
    it('should retry transient failures', async () => {
      let attempts = 0;

      const result = await errorHandler.withRetry(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      let attempts = 0;

      await expect(
        errorHandler.withRetry(async () => {
          attempts++;
          throw new Error('Always fails');
        })
      ).rejects.toThrow();

      expect(attempts).toBe(3); // maxAttempts
    });

    it('should normalize errors to DelegationError', async () => {
      const error = new Error('Test error');
      const normalized = errorHandler.normalizeError(error, 1, { context: 'test' });

      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBeDefined();
    });

    it('should record error telemetry', async () => {
      try {
        await errorHandler.withRetry(async () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected to fail
      }

      const telemetry = errorHandler.getTelemetry();
      expect(telemetry.length).toBeGreaterThan(0);
    });

    it('should provide error statistics', async () => {
      try {
        await errorHandler.withRetry(async () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected to fail
      }

      const stats = errorHandler.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.byCode).toBeDefined();
    });
  });

  describe('Task 5: Context Propagation', () => {
    it('should create workspace context', async () => {
      const ownership = createMockOwnership();
      const trace = createMockTrace();

      const context = await WorkspaceContext.create(ownership, trace);

      expect(context).toBeInstanceOf(WorkspaceContext);
      expect(context.getOwnership()).toEqual(ownership);
      expect(context.getTrace()).toEqual(trace);
    });

    it('should capture environment information', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const env = context.getEnvironment();

      expect(env.cwd).toBeDefined();
      expect(env.platform).toBeDefined();
      expect(env.nodeVersion).toBeDefined();
    });

    it('should capture git information', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const gitInfo = context.getGitInfo();

      expect(gitInfo).toBeDefined();
      expect(typeof gitInfo.hasChanges).toBe('boolean');
    });

    it('should validate context', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const validation = context.validate();

      expect(validation.valid).toBeDefined();
      expect(Array.isArray(validation.errors)).toBe(true);
    });

    it('should clone context', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const cloned = context.clone();

      expect(cloned).not.toBe(context);
      expect(cloned.getTrace().traceId).toBe(context.getTrace().traceId);
    });

    it('should create child context', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const child = context.createChild('new-span-id');

      expect(child.getTrace().spanId).toBe('new-span-id');
      expect(child.getTrace().parentSpanId).toBe(context.getTrace().spanId);
    });

    it('should serialize to JSON', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const json = context.toJSON();

      expect(json.ownership).toBeDefined();
      expect(json.trace).toBeDefined();
      expect(json.environment).toBeDefined();
      expect(json.gitInfo).toBeDefined();
    });

    it('should deserialize from JSON', async () => {
      const context = await WorkspaceContext.create(
        createMockOwnership(),
        createMockTrace()
      );

      const json = context.toJSON();
      const restored = WorkspaceContext.fromJSON(json);

      expect(restored.getTrace().traceId).toBe(context.getTrace().traceId);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full delegation flow', async () => {
      const trace = traceManager.createTrace('test-delegation-flow');
      const ownership = createMockOwnership();

      const result = await delegator.delegate({
        agent: 'business-analyst',
        task: 'Extract requirements for OAuth2',
        trace,
        ownership,
      });

      expect(result.success).toBe(true);
      expect(result.agent).toBe('business-analyst');

      // Verify trace was recorded
      const spans = traceManager.getSpans(trace.traceId);
      expect(spans!.length).toBeGreaterThan(0);

      // Verify ownership was transferred
      const stats = ownershipRegistry.getStats();
      expect(stats.totalRecords).toBeGreaterThan(0);
    });

    it('should measure end-to-end latency', async () => {
      const startTime = Date.now();

      const result = await delegator.delegate({
        agent: 'api-designer',
        task: 'Design API',
        trace: createMockTrace(),
        ownership: createMockOwnership(),
      });

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      expect(result.success).toBe(true);
      expect(totalLatency).toBeLessThan(500); // Target: <500ms
      console.log(`✓ End-to-end latency: ${totalLatency}ms (target: <500ms)`);
    });

    it('should handle ownership violations', async () => {
      const ownership1 = createMockOwnership();
      const ownership2 = { ...createMockOwnership() };

      // First delegation owns the path
      await ownershipRegistry.transferOwnership(ownership1, 'agent-1');

      // Second delegation should detect conflict
      const conflict = ownershipRegistry.checkConflict(
        ownership2.ownedPaths[0],
        'agent-2'
      );

      expect(conflict.hasConflict).toBe(true);
    });

    it('should propagate trace context through delegation chain', async () => {
      const rootTrace = traceManager.createTrace('root-operation');
      const childSpanId = traceManager.createSpan(rootTrace, 'delegate-to-agent');

      const result = await delegator.delegate({
        agent: 'business-analyst',
        task: 'Test task',
        trace: { ...rootTrace, spanId: childSpanId, parentSpanId: rootTrace.spanId },
        ownership: createMockOwnership(),
      });

      expect(result.success).toBe(true);
      expect(result.traceId).toBe(rootTrace.traceId);

      // Verify trace hierarchy
      const spans = traceManager.getSpans(rootTrace.traceId);
      expect(spans!.length).toBeGreaterThan(1);
    });
  });
});

/**
 * Performance benchmarks
 */
describe('Performance Benchmarks', () => {
  let repository: MockAgentRepository;
  let delegator: WshobsonDelegator;

  beforeEach(() => {
    repository = new MockAgentRepository();
    delegator = new WshobsonDelegator(repository);
  });

  it('should achieve <500ms delegation latency', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();

      await delegator.delegate({
        agent: 'business-analyst',
        task: `Test task ${i}`,
        trace: createMockTrace(),
        ownership: createMockOwnership(),
      });

      const latency = Date.now() - startTime;
      latencies.push(latency);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Max latency: ${maxLatency}ms`);
    console.log(`Target: <500ms`);

    expect(avgLatency).toBeLessThan(500);
    expect(maxLatency).toBeLessThan(1000); // Allow some variance
  });

  it('should achieve 99.9% success rate', async () => {
    const attempts = 1000;
    let successes = 0;

    for (let i = 0; i < attempts; i++) {
      const result = await delegator.delegate({
        agent: 'business-analyst',
        task: `Test task ${i}`,
        trace: createMockTrace(),
        ownership: createMockOwnership(),
      });

      if (result.success) {
        successes++;
      }
    }

    const successRate = successes / attempts;

    console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);
    console.log(`Target: 99.9%`);

    expect(successRate).toBeGreaterThan(0.999); // 99.9%
  });
});
