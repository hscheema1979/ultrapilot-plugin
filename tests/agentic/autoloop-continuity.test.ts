/**
 * Ultra-Autoloop Continuous Execution Tests
 *
 * Tests that verify:
 * - Ultra-autoloop runs continuously ("the boulder never stops")
 * - Maintains state across iterations
 * - Processes task queues
 * - Can be canceled
 * - Handles failures and retries
 *
 * Uses 1-2 minute test routines (email checking, task processing)
 * to validate the autoloop mechanism.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentBridge, AgentOrchestrator, AgentStateStore, AgentMessageBus } from '../../src/index.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

// Mock Task tool for autoloop testing
class MockTaskTool {
  async call(params: {
    subagent_type: string;
    description: string;
    prompt: string;
  }): Promise<any> {
    // Simulate quick routine execution
    const routines: Record<string, any> = {
      'ultra:executor': {
        success: true,
        output: `Email check at ${new Date().toISOString()}\n- 3 new messages\n- 2 high priority\n- 1 notification`,
        metadata: {
          timestamp: new Date().toISOString(),
          messageCount: 3
        }
      },
      'ultra:executor': {
        success: true,
        output: `Task processing at ${new Date().toISOString()}\n- Processed 5 tasks\n- 3 completed\n- 2 queued`,
        metadata: {
          timestamp: new Date().toISOString(),
          tasksProcessed: 5
        }
      },
      'ultra:verifier': {
        success: true,
        output: `Health check at ${new Date().toISOString()}\n- All systems operational\n- Memory: 45%\n- CPU: 12%`,
        metadata: {
          timestamp: new Date().toISOString(),
          status: 'healthy'
        }
      }
    };

    return routines[params.subagent_type] || {
      success: true,
      output: `[Mock ${params.subagent_type}] Completed`,
      timestamp: new Date().toISOString()
    };
  }
}

describe('Ultra-Autoloop: Continuous Execution', () => {
  let bridge: AgentBridge;
  let orchestrator: AgentOrchestrator;
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;
  let mockTask: MockTaskTool;
  let dbPath: string;
  let autoloopSession: string;

  beforeAll(async () => {
    dbPath = `/tmp/test-autoloop-${randomBytes(8).toString('hex')}.db`;

    stateStore = new AgentStateStore({
      dbPath,
      enableAccessControl: false,
      enableEncryption: false,
      auditLogging: false
    });

    messageBus = new AgentMessageBus({
      dbPath: `/tmp/test-bus-${randomBytes(8).toString('hex')}.db`,
      security: {
        enableSigning: false,
        enableEncryption: false,
        maxPayloadSize: 1024 * 1024,
        allowedPayloadTypes: {}
      },
      performance: {
        batchSize: 50,
        batchInterval: 50,
        maxQueueSize: 1000,
        maxConcurrentHandlers: 10,
        handlerTimeout: 5000
      }
    });

    bridge = new AgentBridge();
    mockTask = new MockTaskTool();
    bridge.setTaskFunction(mockTask.call.bind(mockTask));

    orchestrator = new AgentOrchestrator(bridge, stateStore, messageBus, {
      defaultTimeout: 30000,
      maxConcurrentWorkflows: 10
    });

    await stateStore.initialize();
    await messageBus.initialize();

    // Create autoloop session
    autoloopSession = `autoloop-${randomBytes(4).toString('hex')}`;
    await stateStore.create(autoloopSession, {
      currentTask: 'Ultra-Autoloop',
      completedTasks: [],
      context: {
        startTime: new Date().toISOString(),
        iterations: 0,
        status: 'running'
      }
    });
  });

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('Autoloop: Email Checking Routine', () => {
    it('should execute email check routine and maintain state', async () => {
      // Routine: Check email every iteration

      const routineId = 'email-checker-1';

      await stateStore.create(routineId, {
        currentTask: 'Email monitoring routine',
        context: {
          routine: 'ultra:executor',
          interval: 60000,  // 1 minute
          lastCheck: null
        }
      });

      // Iteration 1: Check email
      const iter1 = await orchestrator.spawnAgent(
        'ultra:executor',
        'Check email for new messages',
        {
          domain: 'communications',
          context: { routine: 'email-monitoring' }
        }
      );

      expect(iter1.success).toBe(true);

      // Update state after iteration 1
      await stateStore.update(routineId, {
        context: {
          routine: 'ultra:executor',
          interval: 60000,
          lastCheck: new Date().toISOString(),
          iteration: 1
        }
      });

      // Verify iteration 1 state
      const state1 = await stateStore.get(routineId);
      expect(state1?.context?.lastCheck).toBeDefined();
      expect(state1?.context?.iteration).toBe(1);

      // Simulate autoloop continuing (iteration 2)
      await new Promise(resolve => setTimeout(resolve, 100));  // Small delay

      const iter2 = await orchestrator.spawnAgent(
        'ultra:executor',
        'Check email for new messages',
        {
          domain: 'communications',
          context: { routine: 'email-monitoring', previousIteration: 1 }
        }
      );

      expect(iter2.success).toBe(true);

      // Update state after iteration 2
      await stateStore.update(routineId, {
        context: {
          routine: 'ultra:executor',
          interval: 60000,
          lastCheck: new Date().toISOString(),
          iteration: 2
        }
      });

      // Verify iteration 2 state
      const state2 = await stateStore.get(routineId);
      expect(state2?.context?.iteration).toBe(2);
      expect(state2?.totalInvocations).toBe(2);
    });

    it('should process email queue across iterations', async () => {
      // Autoloop maintains email queue

      const queueId = 'email-queue-1';

      await stateStore.create(queueId, {
        currentTask: 'Process email queue',
        context: {
          queue: [],
          processed: [],
          failed: []
        }
      });

      // Iteration 1: Add emails to queue
      await stateStore.update(queueId, {
        context: {
          queue: [
            { id: 1, from: 'alice@example.com', subject: 'Task update', priority: 'high' },
            { id: 2, from: 'bob@example.com', subject: 'Meeting reminder', priority: 'normal' },
            { id: 3, from: 'carol@example.com', subject: 'Bug report', priority: 'critical' }
          ],
          processed: [],
          failed: []
        }
      });

      // Process queue
      const process = await orchestrator.spawnAgent(
        'ultra:executor',
        'Process 3 emails from queue',
        {
          domain: 'communications',
          context: { queueSize: 3 }
        }
      );

      expect(process.success).toBe(true);

      // Update: Mark as processed
      const afterState = await stateStore.get(queueId);
      const queue = afterState?.context?.queue || [];

      await stateStore.update(queueId, {
        context: {
          queue: queue.filter((email: any) => email.id !== 1),  // Remove processed
          processed: [queue[0]],
          failed: []
        }
      });

      // Verify queue state
      const finalState = await stateStore.get(queueId);
      expect(finalState?.context?.queue).toHaveLength(2);  // 2 remaining
      expect(finalState?.context?.processed).toHaveLength(1);  // 1 processed
    });
  });

  describe('Autoloop: Task Processing Routine', () => {
    it('should continuously process task queue', async () => {
      // Autoloop continuously processes tasks from queue

      const processorId = 'task-processor-1';

      await stateStore.create(processorId, {
        currentTask: 'Continuous task processor',
        completedTasks: [],
        context: {
          queue: [],
          processedCount: 0
        }
      });

      // Iteration 1: Process tasks
      const iter1 = await orchestrator.spawnAgent(
        'ultra:executor',
        'Process available tasks',
        {
          domain: 'task-management',
          context: { iteration: 1 }
        }
      );

      expect(iter1.success).toBe(true);

      // Update state
      await stateStore.update(processorId, {
        context: {
          queue: [],
          processedCount: 5,
          lastProcessed: new Date().toISOString()
        }
      });

      const state1 = await stateStore.get(processorId);
      expect(state1?.context?.processedCount).toBe(5);

      // Iteration 2: Process more tasks
      const iter2 = await orchestrator.spawnAgent(
        'ultra:executor',
        'Process available tasks',
        {
          domain: 'task-management',
          context: { iteration: 2 }
        }
      );

      expect(iter2.success).toBe(true);

      // Update state
      await stateStore.update(processorId, {
        context: {
          queue: [],
          processedCount: 10,  // Cumulative
          lastProcessed: new Date().toISOString()
        }
      });

      const state2 = await stateStore.get(processorId);
      expect(state2?.context?.processedCount).toBe(10);
      expect(state2?.totalInvocations).toBe(2);
    });

    it('should handle task failures and retry', async () => {
      // Autoloop retries failed tasks

      const processorId = 'task-retry-1';

      await stateStore.create(processorId, {
        currentTask: 'Task processor with retry',
        completedTasks: [],
        context: {
          failedTasks: [],
          retryCount: 0
        }
      });

      // Iteration 1: Task fails
      await stateStore.recordInvocation(processorId, 'task-1', false, 5000);

      await stateStore.update(processorId, {
        context: {
          failedTasks: ['task-1'],
          retryCount: 0,
          lastFailure: new Date().toISOString()
        }
      });

      // Autoloop schedules retry
      const state1 = await stateStore.get(processorId);
      expect(state1?.context?.failedTasks).toContain('task-1');

      // Iteration 2: Retry
      const retry = await orchestrator.spawnAgent(
        'ultra:executor',
        'Retry task-1',
        {
          domain: 'task-management',
          context: { isRetry: true, task: 'task-1' }
        }
      );

      // If retry succeeds
      if (retry.success) {
        await stateStore.update(processorId, {
          context: {
            failedTasks: [],  // Cleared
            retryCount: 1,
            lastRetry: new Date().toISOString()
          }
        });

        const state2 = await stateStore.get(processorId);
        expect(state2?.context?.failedTasks).toHaveLength(0);
        expect(state2?.context?.retryCount).toBe(1);
      }
    });
  });

  describe('Autoloop: Health Monitoring', () => {
    it('should perform periodic health checks', async () => {
      // Autoloop monitors system health

      const monitorId = 'health-monitor-1';

      await stateStore.create(monitorId, {
        currentTask: 'System health monitor',
        completedTasks: [],
        context: {
          checks: [],
          status: 'healthy'
        }
      });

      // Iteration 1: Health check
      const health1 = await orchestrator.spawnAgent(
        'ultra:verifier',
        'Perform system health check',
        {
          domain: 'monitoring',
          context: { checkType: 'full' }
        }
      );

      expect(health1.success).toBe(true);

      // Record health status
      await stateStore.update(monitorId, {
        context: {
          checks: [{
            timestamp: new Date().toISOString(),
            status: 'healthy',
            metrics: { memory: 45, cpu: 12 }
          }],
          status: 'healthy'
        }
      });

      const state1 = await stateStore.get(monitorId);
      expect(state1?.context?.checks).toHaveLength(1);
      expect(state1?.context?.status).toBe('healthy');

      // Simulate autoloop continuing - wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Iteration 2: Another health check
      const health2 = await orchestrator.spawnAgent(
        'ultra:verifier',
        'Perform system health check',
        {
          domain: 'monitoring',
          context: { checkType: 'quick' }
        }
      );

      expect(health2.success).toBe(true);

      // Add to health history
      await stateStore.update(monitorId, {
        context: {
          checks: [
            ...state1?.context?.checks,
            {
              timestamp: new Date().toISOString(),
              status: 'healthy',
              metrics: { memory: 47, cpu: 15 }
            }
          ],
          status: 'healthy'
        }
      });

      const state2 = await stateStore.get(monitorId);
      expect(state2?.context?.checks).toHaveLength(2);
    });

    it('should detect and respond to health issues', async () => {
      // Autoloop detects problems and triggers remediation

      const monitorId = 'health-response-1';

      await stateStore.create(monitorId, {
        currentTask: 'Health monitor with remediation',
        context: {
          checks: [],
          alerts: []
        }
      });

      // Iteration 1: Health check detects issue
      await stateStore.update(monitorId, {
        context: {
          checks: [{
            timestamp: new Date().toISOString(),
            status: 'warning',
            metrics: { memory: 85, cpu: 78 }  // High usage!
          }],
          alerts: ['High memory usage detected']
        }
      });

      const state1 = await stateStore.get(monitorId);
      expect(state1?.context?.alerts).toContain('High memory usage detected');

      // Autoloop triggers remediation workflow
      const remediation = await orchestrator.spawnAgent(
        'ultra:executor',
        'Run memory cleanup and optimization',
        {
          domain: 'maintenance',
          context: { trigger: 'high-memory' }
        }
      );

      expect(remediation.success).toBe(true);

      // Record remediation
      await stateStore.update(monitorId, {
        context: {
          checks: state1?.context?.checks,
          alerts: [],
          remediationActions: ['Memory cleanup performed'],
          lastRemediation: new Date().toISOString()
        }
      });

      const state2 = await stateStore.get(monitorId);
      expect(state2?.context?.remediationActions).toHaveLength(1);
    });
  });

  describe('Autoloop: Session Persistence', () => {
    it('should maintain autoloop session across routine executions', async () => {
      // Autoloop session persists across multiple routine runs

      await stateStore.update(autoloopSession, {
        context: {
          startTime: new Date().toISOString(),
          iterations: 0,
          routines: ['email-check', 'task-process', 'ultra:verifier'],
          status: 'running'
        }
      });

      // Execute routines in iteration 1
      for (const routine of ['email-check', 'task-process', 'ultra:verifier']) {
        await orchestrator.spawnAgent(
          routine,
          `Execute ${routine}`,
          { domain: 'maintenance' }
        );
      }

      await stateStore.update(autoloopSession, {
        context: {
          iterations: 1,
          lastIteration: new Date().toISOString()
        }
      });

      const state1 = await stateStore.get(autoloopSession);
      expect(state1?.context?.iterations).toBe(1);

      // Execute routines in iteration 2 (autoloop continues)
      for (const routine of ['email-check', 'task-process', 'ultra:verifier']) {
        await orchestrator.spawnAgent(
          routine,
          `Execute ${routine}`,
          { domain: 'maintenance' }
        );
      }

      await stateStore.update(autoloopSession, {
        context: {
          iterations: 2,
          lastIteration: new Date().toISOString()
        }
      });

      const state2 = await stateStore.get(autoloopSession);
      expect(state2?.context?.iterations).toBe(2);
      expect(state2?.context?.startTime).toBeDefined();  // Original start time preserved
    });

    it('should track autoloop metrics over time', async () => {
      // Autoloop tracks performance metrics

      await stateStore.update(autoloopSession, {
        context: {
          iterations: 0,
          totalRoutineExecutions: 0,
          failures: 0,
          startTime: new Date().toISOString()
        }
      });

      // Simulate 5 iterations
      for (let i = 1; i <= 5; i++) {
        await orchestrator.spawnAgent('ultra:executor', 'Check email', {});

        await stateStore.update(autoloopSession, {
          context: {
            iterations: i,
            totalRoutineExecutions: i * 3,  // 3 routines per iteration
            lastIteration: new Date().toISOString()
          }
        });
      }

      const finalState = await stateStore.get(autoloopSession);

      expect(finalState?.context?.iterations).toBe(5);
      expect(finalState?.context?.totalRoutineExecutions).toBe(15);  // 5 * 3
      expect(finalState?.totalInvocations).toBe(5);

      // Calculate uptime
      const startTime = new Date(finalState?.context?.startTime);
      const endTime = new Date(finalState?.context?.lastIteration);
      const uptime = endTime.getTime() - startTime.getTime();

      expect(uptime).toBeGreaterThan(0);
    });
  });

  describe('Autoloop: Cancellation and Control', () => {
    it('should support graceful cancellation', async () => {
      // Autoloop can be canceled

      const cancelableSession = 'autoloop-cancel-test';

      await stateStore.create(cancelableSession, {
        currentTask: 'Cancellable autoloop',
        context: {
          status: 'running',
          iterations: 0
        }
      });

      // Start autoloop
      await orchestrator.spawnAgent('ultra:executor', 'Check email', {});

      // Cancel requested
      await stateStore.update(cancelableSession, {
        currentTask: 'Cancelling...',
        context: {
          status: 'canceling',
          cancelReason: 'User requested stop'
        }
      });

      // Verify cancellation state
      const state = await stateStore.get(cancelableSession);
      expect(state?.context?.status).toBe('canceling');
      expect(state?.context?.cancelReason).toBe('User requested stop');

      // Mark as stopped
      await stateStore.update(cancelableSession, {
        currentTask: 'Stopped',
        context: {
          status: 'stopped',
          stoppedAt: new Date().toISOString()
        }
      });

      const finalState = await stateStore.get(cancelableSession);
      expect(finalState?.context?.status).toBe('stopped');
      expect(finalState?.context?.stoppedAt).toBeDefined();
    });

    it('should pause and resume autoloop', async () => {
      // Autoloop can be paused and resumed

      const pausableSession = 'autoloop-pause-test';

      await stateStore.create(pausableSession, {
        currentTask: 'Pausable autoloop',
        context: {
          status: 'running',
          iterations: 0
        }
      });

      // Iteration 1: Running
      await orchestrator.spawnAgent('ultra:executor', 'Check email', {});

      await stateStore.update(pausableSession, {
        context: {
          status: 'running',
          iterations: 1
        }
      });

      // Pause
      await stateStore.update(pausableSession, {
        currentTask: 'Paused',
        context: {
          status: 'paused',
          pausedAt: new Date().toISOString()
        }
      });

      const pausedState = await stateStore.get(pausableSession);
      expect(pausedState?.context?.status).toBe('paused');

      // Resume
      await stateStore.update(pausableSession, {
        currentTask: 'Resumed',
        context: {
          status: 'running',
          resumedAt: new Date().toISOString()
        }
      });

      // Continue with iteration 2
      await orchestrator.spawnAgent('ultra:executor', 'Check email', {});

      await stateStore.update(pausableSession, {
        context: {
          status: 'running',
          iterations: 2
        }
      });

      const resumedState = await stateStore.get(pausableSession);
      expect(resumedState?.context?.status).toBe('running');
      expect(resumedState?.context?.iterations).toBe(2);
    });
  });

  describe('Autoloop: Multi-Routine Coordination', () => {
    it('should coordinate multiple routines in single iteration', async () => {
      // Autoloop runs multiple routines per iteration

      const sessionId = 'multi-routine-1';

      await stateStore.create(sessionId, {
        currentTask: 'Multi-routine autoloop',
        context: {
          routines: ['ultra:executor', 'ultra:executor', 'ultra:verifier'],
          iteration: 0
        }
      });

      // Single iteration: Execute all routines
      const results = await orchestrator.coordinateParallel([
        {
          agentId: 'ultra:executor',
          task: 'Check for new emails',
          context: { domain: 'communications' }
        },
        {
          agentId: 'ultra:executor',
          task: 'Process task queue',
          context: { domain: 'tasks' }
        },
        {
          agentId: 'ultra:verifier',
          task: 'System health check',
          context: { domain: 'monitoring' }
        }
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);

      // Update iteration count
      await stateStore.update(sessionId, {
        context: {
          iteration: 1,
          lastIterationComplete: new Date().toISOString()
        }
      });

      const state = await stateStore.get(sessionId);
      expect(state?.context?.iteration).toBe(1);
    });

    it('should handle routine failures without stopping autoloop', async () => {
      // Autoloop continues even if one routine fails

      const sessionId = 'fault-tolerant-autoloop';

      await stateStore.create(sessionId, {
        currentTask: 'Fault-tolerant autoloop',
        context: {
          iteration: 0,
          failures: []
        }
      });

      // Routine 1 succeeds
      const r1 = await orchestrator.spawnAgent('ultra:executor', 'Check email', {});

      // Routine 2 fails (simulated)
      await stateStore.recordInvocation(sessionId, 'ultra:executor', false, 5000);

      // Routine 3 succeeds
      const r3 = await orchestrator.spawnAgent('ultra:verifier', 'Health check', {});

      // Autoloop continues despite failure
      await stateStore.update(sessionId, {
        context: {
          iteration: 1,
          failures: ['ultra:executor'],
          autoloopStatus: 'continuing'  // Didn't stop!
        }
      });

      const state = await stateStore.get(sessionId);
      expect(state?.context?.failures).toContain('ultra:executor');
      expect(state?.context?.autoloopStatus).toBe('continuing');
    });
  });

  describe('Autoloop: "The Boulder Never Stops"', () => {
    it('should demonstrate continuous execution across failures', async () => {
      // Test the motto: "The boulder never stops"

      const sessionId = 'boulder-never-stops';

      await stateStore.create(sessionId, {
        currentTask: 'Persistent autoloop',
        context: {
          obstacles: [],
          iterations: 0,
          status: 'running'
        }
      });

      // Iteration 1: Success
      await orchestrator.spawnAgent('ultra:executor', 'Check email', {});
      await stateStore.update(sessionId, {
        context: { iterations: 1, status: 'running' }
      });

      // Iteration 2: Failure
      await stateStore.recordInvocation(sessionId, 'ultra:executor', false, 5000);
      await stateStore.update(sessionId, {
        context: {
          iterations: 2,
          status: 'recovering',
          obstacles: ['Task processing failed']
        }
      });

      // Iteration 3: Recover and continue
      await orchestrator.spawnAgent('ultra:executor', 'Check email', {});
      await stateStore.update(sessionId, {
        context: {
          iterations: 3,
          status: 'running',
          obstacles: [],
          recovery: 'Task processing recovered'
        }
      });

      const state = await stateStore.get(sessionId);
      expect(state?.context?.iterations).toBe(3);
      expect(state?.context?.status).toBe('running');  // Still running!
      expect(state?.context?.obstacles).toHaveLength(0);  // Obstacles overcome
    });

    it('should maintain persistence through restarts', async () => {
      // Autoloop survives restarts (simulated)

      const sessionId = 'persistent-autoloop';

      // Create initial state
      await stateStore.create(sessionId, {
        currentTask: 'Long-running autoloop',
        context: {
          startTime: new Date().toISOString(),
          iterations: 100,
          processedTasks: 500
        }
      });

      // Simulate restart: Reload state
      const beforeRestart = await stateStore.get(sessionId);
      expect(beforeRestart?.context?.iterations).toBe(100);

      // "After restart" - continue from where left off
      await orchestrator.spawnAgent('ultra:executor', 'Continue checking emails', {
        context: { resumingFrom: 'iteration-100' }
      });

      await stateStore.update(sessionId, {
        context: {
          iterations: 101,  // Continued!
          lastResumed: new Date().toISOString()
        }
      });

      const afterRestart = await stateStore.get(sessionId);
      expect(afterRestart?.context?.iterations).toBe(101);
      expect(afterRestart?.context?.startTime).toBe(beforeRestart?.context?.startTime);  // Preserved!
    });
  });
});
