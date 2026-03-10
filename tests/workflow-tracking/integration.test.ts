/**
 * UltraPilot Workflow Tracking System - Integration Tests
 *
 * @version 1.0
 * @date 2026-03-03
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowExecutionStore } from '../src/workflow-tracking/WorkflowExecutionStore.js';
import { WorkflowTracker } from '../src/workflow-tracking/WorkflowTracker.js';
import { WorkflowQueryAPI } from '../src/workflow-tracking/WorkflowQueryAPI.js';
import { redactData, truncateText } from '../src/workflow-tracking/redaction.js';
import type { WorkflowRecord, AgentExecutionRecord } from '../src/workflow-tracking/types.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Workflow Tracking System - Integration Tests', () => {
  let store: WorkflowExecutionStore;
  let tracker: WorkflowTracker;
  let queryAPI: WorkflowQueryAPI;
  const testDbPath = path.join(process.cwd(), '.ultra/state/test-workflows.db');

  beforeEach(async () => {
    // Clean up test database
    if (await fs.access(testDbPath).then(() => true).catch(() => false)) {
      await fs.unlink(testDbPath);
    }

    // Initialize components
    store = new WorkflowExecutionStore({ dbPath: testDbPath });
    tracker = new WorkflowTracker(store);
    queryAPI = new WorkflowQueryAPI(store);
  });

  afterEach(async () => {
    // Close components
    await tracker.close();
    await store.close();

    // Clean up test database
    if (await fs.access(testDbPath).then(() => true).catch(() => false)) {
      await fs.unlink(testDbPath);
    }
  });

  describe('Workflow Lifecycle', () => {
    it('should track complete workflow lifecycle', async () => {
      const sessionId = 'test-session-1';
      const workflowId = 'test-workflow-1';

      // Start workflow
      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Test Workflow',
        mode: 'sequential',
        stepsCount: 3
      });

      // Record phase transition
      await tracker.recordPhaseTransition(
        'expansion',
        null,
        'planning',
        { passed: ['requirements'], failed: [] },
        { phaseDuration: 1000, totalDuration: 1000 }
      );

      // Record agent invocation
      await tracker.recordAgentInvocation('ultra:executor', {
        sessionId,
        workflowId,
        phaseId: 'planning',
        stepId: 'step-1',
        task: 'Write code',
        input: { file: 'test.ts' },
        output: { code: 'console.log("hello")' },
        model: 'sonnet',
        tokens: { input: 100, output: 50, total: 150 },
        duration: 2000,
        success: true
      });

      // Record decision
      await tracker.recordDecision({
        sessionId,
        workflowId,
        phaseId: 'planning',
        type: 'routing',
        input: { task: 'Write code' },
        decision: 'ultra:executor',
        reasoning: 'Task type matches implementation pattern',
        confidence: 0.95
      });

      // End workflow
      await tracker.endWorkflow('success', {
        totalDuration: 3000,
        phasesCompleted: 1,
        agentsInvoked: 1,
        messagesExchanged: 0,
        decisionsMade: 1,
        errors: 0
      });

      // Verify workflow was saved
      const workflow = await store.getWorkflow(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.status).toBe('completed');
      expect(workflow?.name).toBe('Test Workflow');
    });

    it('should record phase transitions', async () => {
      const sessionId = 'test-session-2';
      const workflowId = 'test-workflow-2';

      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Phase Test',
        mode: 'sequential',
        stepsCount: 1
      });

      // Record multiple phases
      await tracker.recordPhaseTransition('expansion', null, 'planning', {}, { phaseDuration: 500, totalDuration: 500 });
      await tracker.recordPhaseTransition('planning', 'expansion', 'execution', {}, { phaseDuration: 1000, totalDuration: 1500 });
      await tracker.recordPhaseTransition('execution', 'planning', 'qa', {}, { phaseDuration: 2000, totalDuration: 3500 });

      await tracker.endWorkflow('success', {
        totalDuration: 3500,
        phasesCompleted: 3,
        agentsInvoked: 0,
        messagesExchanged: 0,
        decisionsMade: 0,
        errors: 0
      });

      // Verify phases
      const phases = await store.getPhases(workflowId);
      expect(phases).toHaveLength(3);
      expect(phases[0].toPhase).toBe('planning');
      expect(phases[1].toPhase).toBe('execution');
      expect(phases[2].toPhase).toBe('qa');
    });
  });

  describe('Query API', () => {
    it('should retrieve workflow timeline', async () => {
      const sessionId = 'test-session-3';
      const workflowId = 'test-workflow-3';

      // Create test workflow
      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Timeline Test',
        mode: 'sequential',
        stepsCount: 2
      });

      await tracker.recordPhaseTransition('expansion', null, 'planning', {}, { phaseDuration: 500, totalDuration: 500 });
      await tracker.recordAgentInvocation('ultra:planner', {
        sessionId,
        workflowId,
        phaseId: 'planning',
        stepId: 'step-1',
        task: 'Plan',
        input: {},
        output: { plan: 'done' },
        model: 'opus',
        tokens: { input: 200, output: 100, total: 300 },
        duration: 3000,
        success: true
      });

      await tracker.endWorkflow('success', {
        totalDuration: 3500,
        phasesCompleted: 1,
        agentsInvoked: 1,
        messagesExchanged: 0,
        decisionsMade: 0,
        errors: 0
      });

      // Query timeline
      const timeline = await queryAPI.getWorkflowTimeline(workflowId);

      expect(timeline.workflow).toBeDefined();
      expect(timeline.workflow.name).toBe('Timeline Test');
      expect(timeline.phases).toHaveLength(1);
      expect(timeline.executions).toHaveLength(1);
      expect(timeline.timeline).toHaveLength(2); // 1 phase + 1 execution
    });

    it('should get decision trace', async () => {
      const sessionId = 'test-session-4';
      const workflowId = 'test-workflow-4';

      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Decision Test',
        mode: 'sequential',
        stepsCount: 1
      });

      // Record multiple decisions
      await tracker.recordDecision({
        sessionId,
        workflowId,
        phaseId: 'planning',
        type: 'routing',
        input: { task: 'implement' },
        decision: 'ultra:executor',
        reasoning: 'Task requires implementation',
        confidence: 0.9
      });

      await tracker.recordDecision({
        sessionId,
        workflowId,
        phaseId: 'planning',
        type: 'escalation',
        input: { error: 'Complexity too high' },
        decision: 'escalate-to-human',
        reasoning: 'Task exceeds agent capabilities',
        confidence: 1.0
      });

      await tracker.endWorkflow('success', {
        totalDuration: 1000,
        phasesCompleted: 0,
        agentsInvoked: 0,
        messagesExchanged: 0,
        decisionsMade: 2,
        errors: 0
      });

      // Query decisions
      const trace = await queryAPI.getDecisionTrace(workflowId);

      expect(trace.totalDecisions).toBe(2);
      expect(trace.byType.routing).toBe(1);
      expect(trace.byType.escalation).toBe(1);
      expect(trace.decisions).toHaveLength(2);
    });

    it('should cache query results', async () => {
      const sessionId = 'test-session-5';
      const workflowId = 'test-workflow-5';

      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Cache Test',
        mode: 'sequential',
        stepsCount: 1
      });

      await tracker.endWorkflow('success', {
        totalDuration: 100,
        phasesCompleted: 0,
        agentsInvoked: 0,
        messagesExchanged: 0,
        decisionsMade: 0,
        errors: 0
      });

      // First query - should hit database
      const timeline1 = await queryAPI.getWorkflowTimeline(workflowId);
      const stats1 = queryAPI.getCacheStats();
      expect(stats1.l1.size).toBeGreaterThan(0);

      // Second query - should hit cache
      const timeline2 = await queryAPI.getWorkflowTimeline(workflowId);
      const stats2 = queryAPI.getCacheStats();
      expect(stats2.l1.size).toBeGreaterThan(0);

      // Verify same data
      expect(timeline2.workflow.id).toBe(timeline1.workflow.id);
    });
  });

  describe('Redaction', () => {
    it('should redact sensitive field names', () => {
      const data = {
        apiKey: 'sk-1234567890',
        secret: 'my-secret',
        normalField: 'safe-data',
        nested: {
          password: 'hunter2'
        }
      };

      const redacted = redactData(data);

      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.secret).toBe('[REDACTED]');
      expect(redacted.normalField).toBe('safe-data');
      expect(redacted.nested.password).toBe('[REDACTED]');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(2000);
      const truncated = truncateText(longString, 100);

      expect(truncated.length).toBeLessThanOrEqual(110); // 100 + '...[TRUNCATED]'
      expect(truncated).toContain('...[TRUNCATED]');
    });
  });

  describe('Performance', () => {
    it('should handle batch writes efficiently', async () => {
      const sessionId = 'test-session-perf';
      const workflowId = 'test-workflow-perf';

      await tracker.startWorkflow(sessionId, workflowId, {
        name: 'Performance Test',
        mode: 'sequential',
        stepsCount: 100
      });

      // Record many agent executions
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        await tracker.recordAgentInvocation('ultra:executor', {
          sessionId,
          workflowId,
          phaseId: 'execution',
          stepId: `step-${i}`,
          task: `Task ${i}`,
          input: {},
          output: {},
          model: 'sonnet',
          tokens: { input: 100, output: 50, total: 150 },
          duration: 100,
          success: true
        });
      }

      const mid = Date.now();

      await tracker.endWorkflow('success', {
        totalDuration: mid - start,
        phasesCompleted: 0,
        agentsInvoked: 100,
        messagesExchanged: 0,
        decisionsMade: 0,
        errors: 0
      });

      const end = Date.now();

      // Verify all executions were saved
      const executions = await store.getExecutions(workflowId, 1000);
      expect(executions).toHaveLength(100);

      // Check performance (should be fast with batching)
      const recordTime = mid - start;
      const endTime = end - mid;

      console.log(`Recording 100 executions: ${recordTime}ms`);
      console.log(`End workflow: ${endTime}ms`);

      // These should complete quickly (<5 seconds)
      expect(recordTime).toBeLessThan(5000);
      expect(endTime).toBeLessThan(1000);
    });
  });
});
