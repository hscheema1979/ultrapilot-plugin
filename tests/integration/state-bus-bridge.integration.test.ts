/**
 * Integration Tests: State Store + Message Bus + Agent Bridge
 *
 * Tests the three core components working together:
 * 1. AgentStateStore - Persistent agent state
 * 2. AgentMessageBus - Inter-agent communication
 * 3. AgentBridge - Agent invocation with full context
 *
 * These tests verify that the components integrate properly
 * and can support multi-agent workflows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentStateStore } from '../../src/agent-state/AgentStateStore.js';
import { AgentMessageBus } from '../../src/agent-comms/AgentMessageBus.js';
import { AgentBridge } from '../../src/agent-bridge/index.js';
import type { InvocationContext } from '../../src/agent-bridge/types.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

describe('State + Bus + Bridge Integration', () => {
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;
  let bridge: AgentBridge;
  let dbPath: string;

  beforeAll(() => {
    dbPath = `/tmp/test-state-${randomBytes(8).toString('hex')}.db`;
  });

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  beforeEach(async () => {
    // Create fresh instances for each test
    stateStore = new AgentStateStore({
      dbPath,
      enableAccessControl: true,
      enableEncryption: true,
      auditLogging: true
    });

    messageBus = new AgentMessageBus({
      dbPath: `/tmp/test-bus-${randomBytes(8).toString('hex')}.db`,
      security: {
        enableSigning: true,
        enableEncryption: false,
        maxPayloadSize: 1024 * 1024,
        allowedPayloadTypes: {
          'task-update': {
            required: ['taskId', 'status'],
            properties: {
              taskId: { type: 'string', required: true },
              status: { type: 'string', required: true, enum: ['pending', 'in-progress', 'completed', 'failed'] },
              result: { type: 'object', required: false }
            }
          },
          'agent-notification': {
            required: ['message'],
            properties: {
              message: { type: 'string', required: true, minLength: 1, maxLength: 1000 },
              priority: { type: 'string', required: false, enum: ['low', 'normal', 'high', 'critical'] }
            }
          }
        }
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

    // Initialize components
    await stateStore.initialize();
    await messageBus.initialize();
  });

  describe('Agent Lifecycle with State', () => {
    it('should create and retrieve agent state', async () => {
      const agentId = 'ultra:test-agent';

      // Create initial state
      await stateStore.create(agentId, {
        currentTask: 'test-task',
        context: { test: 'data' }
      });

      // Retrieve state
      const state = await stateStore.get(agentId);
      expect(state).toBeDefined();
      expect(state?.agentId).toBe(agentId);
      expect(state?.currentTask).toBe('test-task');
      expect(state?.context).toEqual({ test: 'data' });
    });

    it('should track agent invocations', async () => {
      const agentId = 'ultra:counter';

      await stateStore.create(agentId);

      // Simulate invocations
      await stateStore.recordInvocation(agentId, 'task-1', true, 100);
      await stateStore.recordInvocation(agentId, 'task-2', true, 150);
      await stateStore.recordInvocation(agentId, 'task-3', false, 50);

      const state = await stateStore.get(agentId);
      expect(state?.totalInvocations).toBe(3);
      expect(state?.successRate).toBeCloseTo(0.667, 2); // 2/3
    });

    it('should enforce access control', async () => {
      const agentId = 'ultra:secure-agent';
      const otherAgent = 'ultra:other-agent';

      await stateStore.create(agentId, { secret: 'data' });

      // Agent can access own state
      const ownState = await stateStore.get(agentId, agentId);
      expect(ownState).toBeDefined();

      // Other agent cannot access
      await expect(stateStore.get(agentId, otherAgent)).rejects.toThrow();
    });
  });

  describe('Inter-Agent Communication', () => {
    it('should send direct messages between agents', async () => {
      const sender = 'ultra:agent-a';
      const receiver = 'ultra:agent-b';

      let receivedMessage: any = null;

      // Subscribe receiver
      messageBus.subscribe(receiver, 'direct', async (msg) => {
        receivedMessage = msg;
      });

      // Send message
      const messageId = await messageBus.sendDirect(sender, receiver, {
        type: 'agent-notification',
        payload: {
          message: 'Hello from agent A',
          priority: 'high'
        }
      });

      expect(messageId).toBeDefined();

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.from).toBe(sender);
      expect(receivedMessage.payload.message).toBe('Hello from agent A');
    });

    it('should validate payload schemas', async () => {
      const sender = 'ultra:sender';

      // Valid message
      await expect(messageBus.sendDirect(sender, 'ultra:receiver', {
        type: 'task-update',
        payload: {
          taskId: 'task-123',
          status: 'in-progress'
        }
      })).resolves.toBeDefined();

      // Invalid status (not in enum)
      await expect(messageBus.sendDirect(sender, 'ultra:receiver', {
        type: 'task-update',
        payload: {
          taskId: 'task-123',
          status: 'invalid-status'
        }
      })).rejects.toThrow();
    });

    it('should enforce payload size limits', async () => {
      const sender = 'ultra:sender';

      // Create large payload (>1MB)
      const largePayload = {
        data: 'x'.repeat(2 * 1024 * 1024) // 2MB
      };

      await expect(messageBus.sendDirect(sender, 'ultra:receiver', {
        type: 'test',
        payload: largePayload
      })).rejects.toThrow(/Payload too large/);
    });
  });

  describe('Agent State + Communication Integration', () => {
    it('should update agent state based on messages', async () => {
      const agentId = 'ultra:task-worker';

      // Create agent state
      await stateStore.create(agentId, {
        currentTask: 'initial-task'
      });

      // Subscribe to task updates
      messageBus.subscribe(agentId, 'tasks', async (msg) => {
        if (msg.type === 'task-update') {
          // Update state based on message
          await stateStore.update(agentId, {
            currentTask: msg.payload.taskId,
            context: {
              lastUpdate: new Date().toISOString(),
              status: msg.payload.status
            }
          });
        }
      });

      // Send task update message
      await messageBus.publish(agentId, 'tasks', {
        type: 'task-update',
        payload: {
          taskId: 'new-task',
          status: 'in-progress'
        }
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify state was updated
      const state = await stateStore.get(agentId);
      expect(state?.currentTask).toBe('new-task');
      expect(state?.context?.status).toBe('in-progress');
    });

    it('should track decisions in agent state', async () => {
      const agentId = 'ultra:architect';

      await stateStore.create(agentId);

      // Record architectural decision
      await stateStore.recordDecision(agentId, {
        decision: 'Use REST API',
        reasoning: 'Simpler than GraphQL for this use case',
        alternatives: ['GraphQL', 'gRPC']
      });

      const state = await stateStore.get(agentId);
      expect(state?.decisions).toHaveLength(1);
      expect(state?.decisions[0].decision).toBe('Use REST API');
    });
  });

  describe('Multi-Agent Workflow Simulation', () => {
    it('should coordinate two agents via messaging', async () => {
      const architect = 'ultra:architect';
      const implementer = 'ultra:implementer';

      // Setup state for both agents
      await stateStore.create(architect, {
        currentTask: 'design-api'
      });
      await stateStore.create(implementer, {
        currentTask: null
      });

      // Implementer subscribes to architecture updates
      messageBus.subscribe(implementer, 'architecture', async (msg) => {
        if (msg.type === 'design-complete') {
          // Implementer receives design and starts implementation
          await stateStore.update(implementer, {
            currentTask: 'implement-api',
            context: {
              designSpec: msg.payload.spec
            }
          });
        }
      });

      // Architect completes design and notifies
      await messageBus.publish(architect, 'architecture', {
        type: 'design-complete',
        payload: {
          spec: { endpoints: ['/users', '/posts'] }
        }
      });

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify workflow completed
      const architectState = await stateStore.get(architect);
      const implementerState = await stateStore.get(implementer);

      expect(architectState?.completedTasks).toContain('design-api');
      expect(implementerState?.currentTask).toBe('implement-api');
      expect(implementerState?.context?.designSpec).toBeDefined();
    });

    it('should handle message delivery failures', async () => {
      const failingAgent = 'ultra:failing-agent';

      // Subscribe with a handler that throws
      messageBus.subscribe(failingAgent, 'test', async () => {
        throw new Error('Handler failed');
      });

      // Send message
      const messageId = await messageBus.sendDirect('ultra:sender', failingAgent, {
        type: 'test',
        payload: { message: 'test' }
      });

      // Wait for delivery attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that message ended up in dead letter queue or was retried
      const history = await messageBus.getHistory(failingAgent);
      const failedMessage = history.find(msg => msg.id === messageId);

      expect(failedMessage).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent state updates', async () => {
      const agentId = 'ultra:concurrent-test';

      await stateStore.create(agentId);

      // Perform 100 concurrent updates
      const updates = Array.from({ length: 100 }, (_, i) =>
        stateStore.update(agentId, {
          context: { counter: i }
        })
      );

      await Promise.all(updates);

      const state = await stateStore.get(agentId);
      expect(state?.version).toBeGreaterThan(0);
    });

    it('should batch messages efficiently', async () => {
      const agentId = 'ultra:batch-receiver';

      let messageCount = 0;
      messageBus.subscribe(agentId, 'batch-test', async () => {
        messageCount++;
      });

      // Send 50 messages rapidly
      const sendPromises = Array.from({ length: 50 }, (_, i) =>
        messageBus.sendDirect('ultra:sender', agentId, {
          type: 'batch-test',
          payload: { index: i }
        })
      );

      await Promise.all(sendPromises);

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(messageCount).toBe(50);
    });
  });

  describe('Security Integration', () => {
    it('should encrypt sensitive state data', async () => {
      const agentId = 'ultra:secure-agent';

      await stateStore.create(agentId, {
        context: {
          apiKey: 'sk-test-12345',
          password: 'secret-password'
        }
      });

      const state = await stateStore.get(agentId);
      expect(state?.context).toBeDefined();

      // Verify secrets are encrypted in storage
      const row = stateStore['db'].prepare(
        'SELECT context_json FROM agent_states WHERE id = ?'
      ).get(agentId);

      const storedContext = JSON.parse(row.context_json);
      // Encrypted fields should NOT contain plain text values
      expect(storedContext.apiKey).not.toBe('sk-test-12345');
    });

    it('should sign messages for authentication', async () => {
      const sender = 'ultra:authenticated-sender';
      const receiver = 'ultra:receiver';

      let receivedSignature: string | undefined;

      messageBus.subscribe(receiver, 'signed', async (msg) => {
        receivedSignature = msg.signature;
      });

      await messageBus.sendDirect(sender, receiver, {
        type: 'signed',
        payload: { message: 'authenticated message' }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedSignature).toBeDefined();
      expect(receivedSignature?.length).toBeGreaterThan(0);
    });
  });
});
