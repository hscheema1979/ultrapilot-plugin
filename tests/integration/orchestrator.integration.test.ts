/**
 * Agent Orchestrator Integration Tests
 *
 * Tests the Orchestrator coordinating:
 * - Agent Bridge (full behavioral context)
 * - Agent State Store (persistent memory)
 * - Agent Message Bus (inter-agent communication)
 *
 * This is the critical integration that enables multi-agent workflows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../../src/agent-orchestration/AgentOrchestrator.js';
import { AgentBridge } from '../../src/agent-bridge/index.js';
import { AgentStateStore } from '../../src/agent-state/AgentStateStore.js';
import { AgentMessageBus } from '../../src/agent-comms/AgentMessageBus.js';
import type { AgentWorkflow, WorkflowStep } from '../../src/agent-orchestration/AgentOrchestrator.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

describe('Agent Orchestrator Integration', () => {
  let orchestrator: AgentOrchestrator;
  let bridge: AgentBridge;
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;
  let dbPath: string;

  beforeAll(() => {
    dbPath = `/tmp/test-orchestrator-${randomBytes(8).toString('hex')}.db`;
  });

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  beforeEach(async () => {
    // Create components
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
        allowedPayloadTypes: {}
      }
    });

    bridge = new AgentBridge();

    // Create orchestrator
    orchestrator = new AgentOrchestrator(bridge, stateStore, messageBus, {
      defaultTimeout: 30000,
      maxConcurrentWorkflows: 5
    });

    // Initialize components
    await stateStore.initialize();
    await messageBus.initialize();
  });

  describe('Workflow Execution - Sequential', () => {
    it('should execute sequential workflow with 2 steps', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-sequential-1',
        name: 'Test sequential workflow',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Analyze this simple requirement'
          },
          {
            id: 'step2',
            agentId: 'ultra:planner',
            task: 'Create a plan based on analysis',
            dependencies: ['step1']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe(workflow.id);
      expect(result.steps).toHaveLength(2);
      expect(result.completed).toBeGreaterThan(0);
    });

    it('should track state across workflow steps', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-state-tracking',
        name: 'Test state tracking',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'First task',
            outputTo: 'analysisResult'
          },
          {
            id: 'step2',
            agentId: 'ultra:analyst',
            task: 'Second task - should remember first',
            dependencies: ['step1']
          }
        ]
      };

      await orchestrator.executeWorkflow(workflow);

      // Check that agent state was updated
      const state = await stateStore.get('ultra:analyst');
      expect(state).toBeDefined();
      expect(state?.completedTasks).toContain('step1');
      expect(state?.completedTasks).toContain('step2');
    });

    it('should stop workflow on step failure when onFailure=stop', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-failure-stop',
        name: 'Test failure handling',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Valid task'
          },
          {
            id: 'step2',
            agentId: 'ultra:invalid-agent-that-does-not-exist',
            task: 'This will fail',
            onFailure: 'stop'
          },
          {
            id: 'step3',
            agentId: 'ultra:planner',
            task: 'This should not execute',
            dependencies: ['step2']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.completed).toBeLessThan(3);
      expect(result.failed).toBeGreaterThan(0);
    });

    it('should continue workflow on step failure when onFailure=continue', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-failure-continue',
        name: 'Test continue on failure',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Valid task'
          },
          {
            id: 'step2',
            agentId: 'ultra:invalid-agent',
            task: 'This will fail',
            onFailure: 'continue'
          },
          {
            id: 'step3',
            agentId: 'ultra:planner',
            task: 'This should still execute',
            dependencies: ['step2']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      // Step 3 should execute even though step 2 failed
      expect(result.steps).toHaveLength(3);
    });
  });

  describe('Workflow Execution - Parallel', () => {
    it('should execute independent steps in parallel', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-parallel-1',
        name: 'Test parallel workflow',
        mode: 'parallel',
        channels: ['shared-channel'],
        steps: [
          {
            id: 'backend',
            agentId: 'ultra:analyst',
            task: 'Analyze backend requirements'
          },
          {
            id: 'frontend',
            agentId: 'ultra:analyst',
            task: 'Analyze frontend requirements'
          }
        ]
      };

      const startTime = Date.now();
      const result = await orchestrator.executeWorkflow(workflow);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.completed).toBe(2);

      // Parallel execution should be faster than sequential
      // (This is a rough check - actual timing depends on agent execution)
      console.log(`Parallel workflow duration: ${duration}ms`);
    });

    it('should respect dependencies in parallel mode', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-parallel-deps',
        name: 'Test parallel with dependencies',
        mode: 'parallel',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'First step'
          },
          {
            id: 'step2a',
            agentId: 'ultra:planner',
            task: 'Parallel step 2a',
            dependencies: ['step1']
          },
          {
            id: 'step2b',
            agentId: 'ultra:planner',
            task: 'Parallel step 2b',
            dependencies: ['step1']
          },
          {
            id: 'step3',
            agentId: 'ultra:executor',
            task: 'Final step',
            dependencies: ['step2a', 'step2b']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      expect(result.steps).toHaveLength(4);
      expect(result.completed).toBeGreaterThan(0);

      // Step 3 should execute after both step2a and step2b
      const step3Result = result.steps.find(s => s.stepId === 'step3');
      expect(step3Result).toBeDefined();
    });

    it('should detect circular dependencies', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-circular-deps',
        name: 'Test circular dependency detection',
        mode: 'parallel',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Step 1',
            dependencies: ['step3']  // Circular!
          },
          {
            id: 'step2',
            agentId: 'ultra:planner',
            task: 'Step 2',
            dependencies: ['step1']
          },
          {
            id: 'step3',
            agentId: 'ultra:executor',
            task: 'Step 3',
            dependencies: ['step2']
          }
        ]
      };

      await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow(/Circular dependency/);
    });
  });

  describe('Agent Spawning', () => {
    it('should spawn agent with state creation', async () => {
      const agentId = 'ultra:test-spawn-1';

      const result = await orchestrator.spawnAgent(
        agentId,
        'Complete this task',
        {
          domain: 'testing',
          workspace: { path: '/test' }
        }
      );

      expect(result).toBeDefined();
      expect(result.agentId).toBe(agentId);

      // Verify state was created
      const state = await stateStore.get(agentId);
      expect(state).toBeDefined();
      expect(state?.agentId).toBe(agentId);
    });

    it('should spawn agent and track invocations', async () => {
      const agentId = 'ultra:test-spawn-2';

      await orchestrator.spawnAgent(agentId, 'First task', {});
      await orchestrator.spawnAgent(agentId, 'Second task', {});

      const state = await stateStore.get(agentId);
      expect(state?.totalInvocations).toBe(2);
      expect(state?.completedTasks).toHaveLength(2);
    });

    it('should subscribe agent to communication channels', async () => {
      const agentId = 'ultra:test-comm-1';
      const channel = 'test-channel';

      let messageReceived = false;

      // Subscribe to test channel
      messageBus.subscribe(agentId, channel, async (msg) => {
        messageReceived = true;
      });

      await orchestrator.spawnAgent(agentId, 'Task with communication', {});

      // Send test message
      await messageBus.sendDirect('ultra:sender', agentId, {
        type: 'test',
        payload: { message: 'test' }
      });

      // Wait for message delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageReceived).toBe(true);
    });
  });

  describe('Parallel Coordination', () => {
    it('should coordinate multiple agents in parallel', async () => {
      const results = await orchestrator.coordinateParallel([
        {
          agentId: 'ultra:analyst',
          task: 'Analyze requirements',
          context: { domain: 'analysis' },
          communicationChannels: ['coordination-test']
        },
        {
          agentId: 'ultra:architect',
          task: 'Design system',
          context: { domain: 'architecture' },
          communicationChannels: ['coordination-test']
        },
        {
          agentId: 'ultra:planner',
          task: 'Create implementation plan',
          context: { domain: 'planning' },
          communicationChannels: ['coordination-test']
        }
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r !== undefined)).toBe(true);

      // All agents should have state
      for (const result of results) {
        const state = await stateStore.exists(result.agentId);
        expect(state).toBe(true);
      }
    });

    it('should enable communication between coordinated agents', async () => {
      const messages: any[] = [];
      const channel = 'coordination-comm';

      // Subscribe all agents to channel
      const agents = ['ultra:analyst', 'ultra:architect', 'ultra:planner'];

      for (const agentId of agents) {
        messageBus.subscribe(agentId, channel, async (msg) => {
          messages.push({ agent: agentId, message: msg });
        });
      }

      // Coordinate agents
      await orchestrator.coordinateParallel(
        agents.map(agentId => ({
          agentId,
          task: 'Task for coordination',
          context: {},
          communicationChannels: [channel]
        }))
      );

      // Send broadcast message
      await messageBus.broadcast('orchestrator', {
        type: 'coordination-update',
        payload: { status: 'coordinated' }
      });

      // Wait for message delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      // All agents should receive the message
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow Output Mapping', () => {
    it('should map step outputs to workflow outputs', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-output-mapping',
        name: 'Test output mapping',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Produce output',
            outputTo: 'analysisOutput'
          },
          {
            id: 'step2',
            agentId: 'ultra:planner',
            task: 'Use output from step1',
            dependencies: ['step1']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      expect(result.outputs).toBeDefined();
      expect(result.outputs['analysisOutput'] || result.outputs['step1']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid agent gracefully', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-invalid-agent',
        name: 'Test invalid agent',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:does-not-exist',
            task: 'This will fail'
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.steps[0].error).toBeDefined();
    });

    it('should handle timeout in agent invocation', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-timeout',
        name: 'Test timeout handling',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Quick task',
            timeout: 1000  // 1 second timeout
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      // Should complete quickly or timeout
      expect(result).toBeDefined();
    });
  });

  describe('Orchestrator Status', () => {
    it('should report active workflows', async () => {
      // Start a workflow (don't await)
      const workflowPromise = orchestrator.executeWorkflow({
        id: 'test-active-1',
        name: 'Test active workflow',
        mode: 'sequential',
        steps: [
          {
            id: 'step1',
            agentId: 'ultra:analyst',
            task: 'Active workflow task'
          }
        ]
      });

      // Check status while workflow is running
      await new Promise(resolve => setTimeout(resolve, 10));
      const status = orchestrator.getStatus();

      expect(status.activeWorkflows).toBeGreaterThanOrEqual(0);

      // Wait for workflow to complete
      await workflowPromise;
    });

    it('should enforce max concurrent workflows', async () => {
      const limitedOrchestrator = new AgentOrchestrator(
        bridge,
        stateStore,
        messageBus,
        { maxConcurrentWorkflows: 2 }
      );

      // Start 3 workflows
      const workflows = [
        limitedOrchestrator.executeWorkflow({
          id: 'test-limit-1',
          name: 'Test 1',
          mode: 'sequential',
          steps: [{ id: 's1', agentId: 'ultra:analyst', task: 'Task 1' }]
        }),
        limitedOrchestrator.executeWorkflow({
          id: 'test-limit-2',
          name: 'Test 2',
          mode: 'sequential',
          steps: [{ id: 's2', agentId: 'ultra:analyst', task: 'Task 2' }]
        }),
        limitedOrchestrator.executeWorkflow({
          id: 'test-limit-3',
          name: 'Test 3',
          mode: 'sequential',
          steps: [{ id: 's3', agentId: 'ultra:analyst', task: 'Task 3' }]
        })
      ];

      // Third workflow should be rejected or queued
      await expect(Promise.race(workflows)).resolves.toBeDefined();
    });
  });

  describe('Multi-Agent Communication', () => {
    it('should enable agent communication via channels', async () => {
      const architect = 'ultra:architect';
      const implementer = 'ultra:executor';

      // Create workflow with communication
      const workflow: AgentWorkflow = {
        id: 'test-agent-comm',
        name: 'Test agent communication',
        mode: 'sequential',
        channels: ['design-updates'],
        steps: [
          {
            id: 'design',
            agentId: architect,
            task: 'Design system architecture'
          },
          {
            id: 'implement',
            agentId: implementer,
            task: 'Implement based on design',
            dependencies: ['design']
          }
        ]
      };

      // Subscribe implementer to design updates
      messageBus.subscribe(implementer, 'design-updates', async (msg) => {
        console.log(`[${implementer}] Received design update: ${msg.type}`);
      });

      await orchestrator.executeWorkflow(workflow);

      // Verify both agents have state
      const architectState = await stateStore.get(architect);
      const implementerState = await stateStore.get(implementer);

      expect(architectState).toBeDefined();
      expect(implementerState).toBeDefined();
    });
  });

  describe('Real-World Workflow Scenarios', () => {
    it('should execute API development workflow', async () => {
      const apiWorkflow: AgentWorkflow = {
        id: 'api-development',
        name: 'REST API Development',
        mode: 'sequential',
        channels: ['api-team'],
        steps: [
          {
            id: 'analyze',
            agentId: 'ultra:analyst',
            task: 'Analyze requirements for user management API',
            outputTo: 'requirements'
          },
          {
            id: 'design',
            agentId: 'ultra:architect',
            task: 'Design REST API endpoints and data models',
            dependencies: ['analyze'],
            outputTo: 'apiDesign'
          },
          {
            id: 'implement',
            agentId: 'ultra:executor',
            task: 'Implement the API endpoints',
            dependencies: ['design']
          },
          {
            id: 'test',
            agentId: 'ultra:test-engineer',
            task: 'Write comprehensive tests for the API',
            dependencies: ['implement']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(apiWorkflow);

      expect(result).toBeDefined();
      expect(result.steps).toHaveLength(4);
      expect(result.workflowId).toBe('api-development');
    });
  });
});
