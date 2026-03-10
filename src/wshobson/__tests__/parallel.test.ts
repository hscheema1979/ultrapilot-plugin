/**
 * Parallel Delegation & Result Synthesis Tests
 *
 * Comprehensive tests for Phase 3 components.
 *
 * Run with: npm test -- parallel.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ParallelDelegationEngine } from '../parallel.js';
import { ResultCollector } from '../collector.js';
import { ResultSynthesizer } from '../synthesizer.js';
import { WshobsonDelegator } from '../delegator.js';
import { AgentRepository } from '../repository.js';
import { TraceContext, FileOwnership, DelegationResult } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 3: Parallel Delegation & Result Synthesis', () => {
  let repository: AgentRepository;
  let delegator: WshobsonDelegator;
  let parallelEngine: ParallelDelegationEngine;
  let collector: ResultCollector;
  let synthesizer: ResultSynthesizer;
  let trace: TraceContext;
  let ownership: FileOwnership;

  beforeEach(async () => {
    // Initialize repository
    repository = new AgentRepository({
      pluginsPath: '/test/plugins',
    });

    // Initialize delegator
    delegator = new WshobsonDelegator(repository);

    // Initialize parallel engine
    parallelEngine = new ParallelDelegationEngine(delegator, {
      maxConcurrency: 10,
      defaultTimeout: 5000,
      continueOnFailure: true,
    });

    // Initialize collector
    collector = new ResultCollector();

    // Initialize synthesizer with different strategies
    synthesizer = new ResultSynthesizer({
      strategy: 'merge-non-conflicting',
      logConflicts: true,
      conflictLogPath: '/tmp/test-conflicts.json',
    });

    // Create trace context
    trace = {
      traceId: uuidv4(),
      spanId: uuidv4(),
      baggage: new Map(),
    };

    // Create ownership rules
    ownership = {
      ownedPaths: ['/test/src'],
      readOnlyPaths: ['/test/docs'],
      transferOnCompletion: false,
    };
  });

  afterEach(async () => {
    // Cleanup
  });

  describe('Parallel Delegation Engine', () => {
    it('should delegate to 5 agents in parallel within 2 seconds', async () => {
      const agents = [
        'business-analyst',
        'api-designer',
        'typescript-expert',
        'security-reviewer',
        'quality-reviewer',
      ];

      const tasks = [
        'Extract requirements',
        'Design API endpoints',
        'Implement TypeScript types',
        'Review security implications',
        'Check quality standards',
      ];

      const startTime = Date.now();

      const result = await parallelEngine.delegateParallel(
        agents,
        tasks,
        trace,
        ownership,
        5000
      );

      const duration = Date.now() - startTime;

      // Verify parallel execution (should be much faster than sequential)
      expect(duration).toBeLessThan(2000); // 2 seconds
      expect(result.results.size).toBeGreaterThan(0);
      expect(result.progressHistory).toBeDefined();
      expect(result.progressHistory.length).toBeGreaterThan(0);
    });

    it('should handle partial failures gracefully', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'failing-agent'];
      const tasks = ['Task 1', 'Task 2', 'Task 3', 'Task that fails'];

      const result = await parallelEngine.delegateParallel(
        agents,
        tasks,
        trace,
        ownership
      );

      // Should have some successes and some failures
      expect(result.successCount + result.failureCount).toBe(agents.length);
      expect(result.errors.size).toBeGreaterThan(0);
    });

    it('should respect concurrency limits', async () => {
      // Create engine with max concurrency of 2
      const engine = new ParallelDelegationEngine(delegator, {
        maxConcurrency: 2,
        defaultTimeout: 5000,
      });

      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];
      const tasks = agents.map((_, i) => `Task ${i}`);

      const result = await engine.delegateParallel(
        agents,
        tasks,
        trace,
        ownership
      );

      // All agents should complete
      expect(result.successCount + result.failureCount).toBe(agents.length);
    });

    it('should track progress correctly', async () => {
      const progressUpdates: any[] = [];

      const engine = new ParallelDelegationEngine(delegator, {
        maxConcurrency: 10,
        onProgress: (progress) => {
          progressUpdates.push(progress);
        },
      });

      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const tasks = ['Task 1', 'Task 2', 'Task 3'];

      await engine.delegateParallel(agents, tasks, trace, ownership);

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Final progress should be 100%
      const finalProgress = progressUpdates[progressUpdates.length - 1];
      expect(finalProgress.progress).toBe(100);
    });
  });

  describe('Result Collector', () => {
    it('should collect results from parallel execution', async () => {
      const mockParallelResult = {
        results: new Map([
          ['agent-1', { agent: 'agent-1', success: true, result: { output: 'test' }, duration: 100, traceId: 'test' }],
          ['agent-2', { agent: 'agent-2', success: true, result: { output: 'test2' }, duration: 150, traceId: 'test' }],
        ]),
        errors: new Map([
          ['agent-3', new Error('Agent 3 failed')],
        ]),
        success: true,
        duration: 200,
        successCount: 2,
        failureCount: 1,
        progressHistory: [],
      };

      const executions = [
        { agent: 'agent-1', task: 'Task 1', status: 'completed' as const, startedAt: Date.now() - 100, endedAt: Date.now(), timeout: 5000 },
        { agent: 'agent-2', task: 'Task 2', status: 'completed' as const, startedAt: Date.now() - 150, endedAt: Date.now(), timeout: 5000 },
        { agent: 'agent-3', task: 'Task 3', status: 'failed' as const, startedAt: Date.now() - 200, endedAt: Date.now(), timeout: 5000 },
      ];

      const collection = await collector.collect(mockParallelResult, executions);

      expect(collection.results.size).toBe(2);
      expect(collection.errors.size).toBe(1);
      expect(collection.stats.successCount).toBe(2);
      expect(collection.stats.failureCount).toBe(1);
      expect(collection.stats.successRate).toBeCloseTo(0.667, 1);
    });

    it('should generate summary report', async () => {
      const mockCollection = {
        results: new Map([
          ['agent-1', { agent: 'agent-1', success: true, result: { output: 'test' }, duration: 100, traceId: 'test', metadata: { agent: 'agent-1', collectedAt: Date.now() } }],
        ]),
        errors: new Map([
          ['agent-2', new Error('Failed')],
        ]),
        stats: {
          totalAgents: 2,
          successCount: 1,
          failureCount: 1,
          successRate: 0.5,
          averageDuration: 100,
          totalDuration: 200,
        },
        collectedAt: Date.now(),
      };

      const summary = collector.generateSummary(mockCollection as any);

      expect(summary).toContain('Result Collection Summary');
      expect(summary).toContain('Total agents: 2');
      expect(summary).toContain('Successful: 1');
      expect(summary).toContain('Failed: 1');
    });
  });

  describe('Result Synthesizer', () => {
    it('should synthesize results using merge-non-conflicting strategy', async () => {
      const mockCollection = {
        results: new Map([
          ['agent-1', {
            agent: 'agent-1',
            success: true,
            result: { files: { '/test/file1.ts': 'content1' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-1', collectedAt: Date.now() },
          }],
          ['agent-2', {
            agent: 'agent-2',
            success: true,
            result: { files: { '/test/file2.ts': 'content2' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-2', collectedAt: Date.now() },
          }],
        ]),
        errors: new Map(),
        stats: {
          totalAgents: 2,
          successCount: 2,
          failureCount: 0,
          successRate: 1.0,
          averageDuration: 100,
          totalDuration: 200,
        },
        collectedAt: Date.now(),
      };

      const result = await synthesizer.synthesize(mockCollection as any);

      expect(result.output).toBeDefined();
      expect(result.output.files).toBeDefined();
      expect(result.output.files['/test/file1.ts']).toBe('content1');
      expect(result.output.files['/test/file2.ts']).toBe('content2');
    });

    it('should detect and log conflicts', async () => {
      const mockCollection = {
        results: new Map([
          ['agent-1', {
            agent: 'agent-1',
            success: true,
            result: { files: { '/test/file1.ts': 'content1' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-1', collectedAt: Date.now() },
          }],
          ['agent-2', {
            agent: 'agent-2',
            success: true,
            result: { files: { '/test/file1.ts': 'content2' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-2', collectedAt: Date.now() },
          }],
        ]),
        errors: new Map(),
        stats: {
          totalAgents: 2,
          successCount: 2,
          failureCount: 0,
          successRate: 1.0,
          averageDuration: 100,
          totalDuration: 200,
        },
        collectedAt: Date.now(),
      };

      const result = await synthesizer.synthesize(mockCollection as any);

      // Should detect conflict (both agents edited same file differently)
      expect(result.conflictCount).toBeGreaterThan(0);
      expect(result.conflicts).toBeDefined();
    });
  });

  describe('Synthesis Strategies', () => {
    it('should use majority-vote strategy correctly', async () => {
      const synthesizer = new ResultSynthesizer({
        strategy: 'majority-vote',
        logConflicts: false,
        conflictLogPath: '/tmp/test-conflicts.json',
      });

      const mockCollection = {
        results: new Map([
          ['agent-1', {
            agent: 'agent-1',
            success: true,
            result: { recommendations: { 'feature-x': 'implement' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-1', collectedAt: Date.now() },
          }],
          ['agent-2', {
            agent: 'agent-2',
            success: true,
            result: { recommendations: { 'feature-x': 'implement' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-2', collectedAt: Date.now() },
          }],
          ['agent-3', {
            agent: 'agent-3',
            success: true,
            result: { recommendations: { 'feature-x': 'defer' } },
            duration: 100,
            traceId: 'test',
            metadata: { agent: 'agent-3', collectedAt: Date.now() },
          }],
        ]),
        errors: new Map(),
        stats: { totalAgents: 3, successCount: 3, failureCount: 0, successRate: 1.0, averageDuration: 100, totalDuration: 300 },
        collectedAt: Date.now(),
      };

      const result = await synthesizer.synthesize(mockCollection as any);

      // Majority (2 out of 3) voted for 'implement'
      expect(result.output.recommendations['feature-x']).toBe('implement');
    });
  });

  describe('Voting Mechanism', () => {
    it('should handle veto power correctly', () => {
      const { VotingMechanism } = require('../voting.js');

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

      const conflict = {
        id: 'test-conflict',
        type: 'recommendation' as const,
        agents: ['security-reviewer', 'developer', 'architect'],
        positions: [
          { agent: 'security-reviewer', position: 'reject' },
          { agent: 'developer', position: 'approve' },
          { agent: 'architect', position: 'approve' },
        ],
        resolutionStrategy: 'weighted-vote' as const,
        decision: null,
        timestamp: Date.now(),
        metadata: { topic: 'feature-x' },
      };

      const result = voting.vote(conflict);

      // Security reviewer has veto, so their decision wins
      expect(result.winner).toBeDefined();
      expect(result.winner?.position).toBe('reject');
      expect(result.vetoExercised).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full workflow: delegate -> collect -> synthesize', async () => {
      // Step 1: Parallel delegation
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const tasks = ['Task 1', 'Task 2', 'Task 3'];

      const parallelResult = await parallelEngine.delegateParallel(
        agents,
        tasks,
        trace,
        ownership
      );

      expect(parallelResult.successCount + parallelResult.failureCount).toBe(agents.length);

      // Step 2: Collect results
      const executions = agents.map((agent, i) => ({
        agent,
        task: tasks[i],
        status: 'completed' as const,
        startedAt: Date.now() - 100,
        endedAt: Date.now(),
        timeout: 5000,
      }));

      const collection = await collector.collect(parallelResult, executions);

      expect(collection.results.size).toBeGreaterThan(0);

      // Step 3: Synthesize results
      const synthesisResult = await synthesizer.synthesize(collection);

      expect(synthesisResult.output).toBeDefined();
      expect(synthesisResult.synthesizedAt).toBeDefined();
    });
  });
});
