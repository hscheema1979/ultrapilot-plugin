/**
 * Agentic Orchestration Tests
 *
 * Tests that ACTUAL AGENTS (like si-agent-team-lead, ultra-team-lead) can:
 * - Orchestrate other agents
 * - Maintain persistent state across the session
 * - Coordinate workflows with communication
 * - Make intelligent decisions
 *
 * This is NOT unit testing (testing classes directly)
 * This is NOT full domain e2e (testing complete business workflow)
 * This IS agentic integration (testing agents coordinating agents)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentBridge, AgentOrchestrator, AgentStateStore, AgentMessageBus } from '../../src/index.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

// Mock Task tool for testing
class MockTaskTool {
  async call(params: {
    subagent_type: string;
    description: string;
    prompt: string;
  }): Promise<any> {
    // Simulate agent execution
    return {
      success: true,
      agentId: params.subagent_type,
      output: `[Mock ${params.subagent_type}] Completed: ${params.description}`,
      message: 'Task completed successfully'
    };
  }
}

describe('Agentic Orchestration: Session Coordinator', () => {
  let bridge: AgentBridge;
  let orchestrator: AgentOrchestrator;
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;
  let mockTask: MockTaskTool;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = `/tmp/test-agentic-${randomBytes(8).toString('hex')}.db`;

    // Create infrastructure
    stateStore = new AgentStateStore({
      dbPath,
      enableAccessControl: false,  // Disable for tests
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

    // Inject Task function
    bridge.setTaskFunction(mockTask.call.bind(mockTask));

    orchestrator = new AgentOrchestrator(bridge, stateStore, messageBus, {
      defaultTimeout: 30000,
      maxConcurrentWorkflows: 10
    });

    // Initialize
    await stateStore.initialize();
    await messageBus.initialize();
  });

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('Session Coordinator Agent', () => {
    it('should orchestrate brainstorming session with multiple agents', async () => {
      // Simulate: si-agent-team-lead coordinates brainstorming

      const sessionId = 'brainstorm-1';

      // Create session coordinator state
      await stateStore.create(sessionId, {
        currentTask: 'Coordinate brainstorming for new feature',
        context: {
          feature: 'User authentication system',
          participants: ['ultra:analyst', 'ultra:architect', 'si:designer']
        }
      });

      // Execute brainstorming workflow
      const workflow = {
        id: sessionId,
        name: 'Brainstorming Session',
        mode: 'sequential' as const,
        channels: ['brainstorm-sync'],
        steps: [
          {
            id: 'analyze-requirements',
            agentId: 'ultra:analyst',
            task: 'Analyze requirements for user authentication system',
            outputTo: 'requirements'
          },
          {
            id: 'propose-architecture',
            agentId: 'ultra:architect',
            task: 'Propose system architecture for authentication',
            dependencies: ['analyze-requirements']
          },
          {
            id: 'design-ui-flows',
            agentId: 'si:designer',
            task: 'Design user authentication flows',
            dependencies: ['propose-architecture']
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(workflow);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.completed).toBe(3);
      expect(result.steps).toHaveLength(3);

      // Verify session coordinator state updated
      const sessionState = await stateStore.get(sessionId);
      expect(sessionState).toBeDefined();
      expect(sessionState?.completedTasks).toContain('analyze-requirements');
      expect(sessionState?.completedTasks).toContain('propose-architecture');
      expect(sessionState?.completedTasks).toContain('design-ui-flows');
    });

    it('should maintain session context across agent interactions', async () => {
      // Session: si-agent-team-lead coordinates analysis

      const sessionId = 'analysis-session-1';

      // Step 1: Analyst gathers requirements
      await stateStore.create(sessionId, {
        currentTask: 'Feature analysis',
        decisions: [],
        context: {
          feature: 'Shopping cart checkout',
          domain: 'e-commerce'
        }
      });

      // Simulate analyst making decision
      await stateStore.recordDecision(sessionId, {
        decision: 'Use React for frontend',
        reasoning: 'Component reusability and ecosystem support',
        alternatives: ['Vue.js', 'Angular']
      });

      // Step 2: Architect reads analyst's decision
      const architectResult = await orchestrator.spawnAgent(
        'ultra:architect',
        'Design system architecture considering React frontend',
        {
          domain: 'architecture',
          workspace: { path: '/project' }
        }
      );

      expect(architectResult.success).toBe(true);

      // Verify architect can see analyst's decision
      const sessionState = await stateStore.get(sessionId);
      expect(sessionState?.decisions).toHaveLength(1);
      expect(sessionState?.decisions[0].decision).toBe('Use React for frontend');

      // Step 3: Designer considers both analyst and architect decisions
      await stateStore.recordDecision(sessionId, {
        decision: 'Use Material-UI component library',
        reasoning: 'Consistent with React choice and provides pre-built components',
        alternatives: ['Chakra UI', 'Ant Design']
      });

      // Verify all decisions accumulated
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.decisions).toHaveLength(2);
    });

    it('should enable parallel analysis with cross-agent communication', async () => {
      // Session: ultra-team-lead coordinates parallel domain analysis

      const sessionId = 'parallel-analysis-1';

      await stateStore.create(sessionId, {
        currentTask: 'Analyze authentication across domains',
        context: {
          domains: ['backend', 'frontend', 'security']
        }
      });

      // Subscribe to coordination channel
      let messagesReceived: any[] = [];
      messageBus.subscribe(sessionId, 'coordination', async (msg) => {
        messagesReceived.push(msg);
      });

      // Execute parallel analysis
      const results = await orchestrator.coordinateParallel([
        {
          agentId: 'si:backend-architect',
          task: 'Analyze backend authentication requirements',
          context: { domain: 'backend' },
          communicationChannels: ['coordination']
        },
        {
          agentId: 'frontend-developer',
          task: 'Analyze frontend authentication UI',
          context: { domain: 'frontend' },
          communicationChannels: ['coordination']
        },
        {
          agentId: 'ultra:security-reviewer',
          task: 'Analyze security implications',
          context: { domain: 'security' },
          communicationChannels: ['coordination']
        }
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);

      // Verify all agents have state
      for (const result of results) {
        const agentExists = await stateStore.exists(result.agentId);
        expect(agentExists).toBe(true);
      }
    });
  });

  describe('Session Coordinator Intelligence', () => {
    it('should accumulate insights from multiple agents', async () => {
      // Session: si-agent-team-lead gathers and synthesizes insights

      const sessionId = 'insight-synthesis-1';

      // Agent 1 provides insight
      await stateStore.create(sessionId, {
        currentTask: 'Synthesize team insights',
        decisions: [],
        context: {
          topic: 'Database scaling strategy'
        }
      });

      await stateStore.recordDecision(sessionId, {
        decision: 'Use PostgreSQL with read replicas',
        reasoning: 'Handles read scaling while maintaining consistency',
        alternatives: ['MongoDB sharding', 'Cassandra']
      });

      // Agent 2 provides additional insight
      await stateStore.recordDecision(sessionId, {
        decision: 'Add Redis caching layer',
        reasoning: 'Reduces database load for frequently accessed data',
        alternatives: ['Memcached', 'In-memory cache']
      });

      // Agent 3 provides implementation insight
      await stateStore.recordDecision(sessionId, {
        decision: 'Implement connection pooling',
        reasoning: 'Optimizes database connection management',
        alternatives: ['Serverless connections', 'Direct connections']
      });

      // Verify all insights accumulated
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.decisions).toHaveLength(3);

      // Session coordinator can now synthesize
      const decisions = finalState?.decisions || [];
      expect(decisions.some(d => d.decision.includes('PostgreSQL'))).toBe(true);
      expect(decisions.some(d => d.decision.includes('Redis'))).toBe(true);
      expect(decisions.some(d => d.decision.includes('connection pooling'))).toBe(true);
    });

    it('should handle conflicting recommendations and resolve them', async () => {
      // Session: si-agent-team-lead resolves conflicts

      const sessionId = 'conflict-resolution-1';

      await stateStore.create(sessionId, {
        currentTask: 'Resolve architectural conflicts',
        decisions: [],
        context: {
          conflict: 'API design approach'
        }
      });

      // Agent A recommends REST
      await stateStore.recordDecision(sessionId, {
        decision: 'Use REST API',
        reasoning: 'Simple, widely adopted, good for CRUD operations',
        alternatives: ['GraphQL', 'gRPC'],
        agentId: 'ultra:architect-a'
      });

      // Agent B recommends GraphQL
      await stateStore.recordDecision(sessionId, {
        decision: 'Use GraphQL',
        reasoning: 'Flexible queries, reduces over-fetching, good for complex data',
        alternatives: ['REST', 'gRPC'],
        agentId: 'ultra:architect-b'
      });

      // Session coordinator should see both recommendations
      const state = await stateStore.get(sessionId);
      expect(state?.decisions).toHaveLength(2);

      const restRecommendation = state?.decisions.find(d => d.decision.includes('REST'));
      const graphqlRecommendation = state?.decisions.find(d => d.decision.includes('GraphQL'));

      expect(restRecommendation).toBeDefined();
      expect(graphqlRecommendation).toBeDefined();

      // Coordinator now has context to make decision or ask user
      expect(restRecommendation?.agentId).toBe('ultra:architect-a');
      expect(graphqlRecommendation?.agentId).toBe('ultra:architect-b');
    });
  });

  describe('Session Workflow Orchestration', () => {
    it('should execute multi-phase workflow with checkpointing', async () => {
      // Session: ultra-team-lead runs phased analysis

      const sessionId = 'phased-workflow-1';

      // Phase 1: Requirements
      await stateStore.create(sessionId, {
        currentTask: 'Phase 1: Requirements',
        context: { phase: 'requirements' }
      });

      const phase1 = await orchestrator.spawnAgent(
        'ultra:analyst',
        'Gather and document requirements',
        { domain: 'analysis' }
      );

      expect(phase1.success).toBe(true);

      // Checkpoint: Phase 1 complete
      await stateStore.update(sessionId, {
        currentTask: 'Phase 2: Architecture',
        completedTasks: ['Phase 1: Requirements'],
        context: {
          phase: 'architecture',
          phase1Complete: true
        }
      });

      // Phase 2: Architecture (can read Phase 1 output)
      const phase2 = await orchestrator.spawnAgent(
        'ultra:architect',
        'Design system architecture based on requirements',
        { domain: 'architecture' }
      );

      expect(phase2.success).toBe(true);

      // Verify both phases recorded
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.completedTasks).toHaveLength(2);
      expect(finalState?.context?.phase1Complete).toBe(true);
    });

    it('should recover from agent failure and retry with different approach', async () => {
      // Session: si-agent-team-lead handles failures

      const sessionId = 'failure-recovery-1';

      await stateStore.create(sessionId, {
        currentTask: 'Implement feature with fallback',
        context: {
          attempts: 0,
          approaches: ['direct', 'iterative', 'incremental']
        }
      });

      // Attempt 1: Fails (simulated)
      await stateStore.recordInvocation(sessionId, 'attempt-1', false, 5000);
      await stateStore.update(sessionId, {
        context: {
          attempts: 1,
          lastFailure: 'approach too complex',
          nextApproach: 'iterative'
        }
      });

      // Session coordinator decides to retry with different approach
      const retry = await orchestrator.spawnAgent(
        'si:executor',
        'Try iterative approach instead',
        {
          domain: 'implementation',
          context: {
            approach: 'iterative',
            learnFromFailure: true
          }
        }
      );

      // Verify state tracks recovery
      const state = await stateStore.get(sessionId);
      expect(state?.context?.attempts).toBe(1);
      expect(state?.context?.nextApproach).toBe('iterative');
    });
  });

  describe('Session Communication Patterns', () => {
    it('should facilitate broadcast communication from coordinator to agents', async () => {
      const sessionId = 'broadcast-test-1';
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      // Session coordinator broadcasts message
      await stateStore.create(sessionId, {
        currentTask: 'Coordinate team',
        context: {
          teamSize: agents.length
        }
      });

      // Subscribe all agents
      for (const agent of agents) {
        messageBus.subscribe(agent, 'team-updates', async (msg) => {
          // Agent receives coordinator message
          await stateStore.update(agent, {
            context: {
              lastMessage: msg.type
            }
          });
        });
      }

      // Coordinator broadcasts
      await messageBus.broadcast(sessionId, {
        type: 'new-requirement',
        payload: { requirement: 'Add authentication' }
      });

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all agents received
      for (const agent of agents) {
        const agentState = await stateStore.get(agent);
        expect(agentState?.context?.lastMessage).toBe('new-requirement');
      }
    });

    it('should facilitate peer-to-peer communication between agents', async () => {
      const sessionId = 'p2p-test-1';
      const agentA = 'backend-architect';
      const agentB = 'frontend-architect';

      await stateStore.create(sessionId, {
        currentTask: 'Coordinate architectures',
        context: {}
      });

      // Agent B subscribes to messages from Agent A
      let messageReceived = false;
      messageBus.subscribe(agentB, 'architecture-sync', async (msg) => {
        if (msg.from === agentA) {
          messageReceived = true;
          await stateStore.update(agentB, {
            context: {
              peerUpdate: msg.type
            }
          });
        }
      });

      // Agent A sends to Agent B
      await messageBus.sendDirect(agentA, agentB, {
        type: 'api-changed',
        payload: { endpoint: '/api/users', change: 'added pagination' }
      });

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageReceived).toBe(true);

      // Verify Agent B received update
      const agentBState = await stateStore.get(agentB);
      expect(agentBState?.context?.peerUpdate).toBe('api-changed');
    });
  });

  describe('Session Persistence and Memory', () => {
    it('should remember context across multiple workflow executions', async () => {
      // Session: si-agent-team-lead maintains context

      const sessionId = 'persistent-context-1';

      // Workflow 1: Initial design
      await stateStore.create(sessionId, {
        currentTask: 'Design authentication system',
        decisions: [],
        context: {
          project: 'E-commerce platform',
          techStack: ['React', 'Node.js']
        }
      });

      await stateStore.recordDecision(sessionId, {
        decision: 'Use JWT for authentication',
        reasoning: 'Stateless, scalable, widely supported'
      });

      // Workflow 2: Extend system (should remember previous decisions)
      const sessionState = await stateStore.get(sessionId);

      expect(sessionState?.decisions).toHaveLength(1);
      expect(sessionState?.context?.project).toBe('E-commerce platform');
      expect(sessionState?.context?.techStack).toContain('React');

      // Agent can now build on previous context
      const extension = await orchestrator.spawnAgent(
        'ultra:architect',
        'Extend authentication to support OAuth providers (Google, GitHub)',
        {
          domain: 'architecture',
          context: {
            previousDecision: sessionState?.decisions[0].decision
          }
        }
      );

      expect(extension.success).toBe(true);
    });

    it('should track session evolution over time', async () => {
      const sessionId = 'session-evolution-1';

      await stateStore.create(sessionId, {
        currentTask: 'Initial analysis',
        completedTasks: [],
        decisions: [],
        context: { stage: 'beginning' },
        totalInvocations: 0,
        successRate: 0
      });

      // Simulate session evolution
      const stages = [
        { task: 'Analysis', stage: 'beginning' },
        { task: 'Design', stage: 'middle' },
        { task: 'Implementation', stage: 'middle' },
        { task: 'Testing', stage: 'end' }
      ];

      for (const { task, stage } of stages) {
        await stateStore.update(sessionId, {
          currentTask: task,
          completedTasks: [...(await stateStore.get(sessionId))?.completedTasks || [], task],
          context: { stage }
        });

        await stateStore.recordInvocation(sessionId, task, true, 1000);
      }

      // Verify evolution tracked
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.completedTasks).toHaveLength(4);
      expect(finalState?.totalInvocations).toBe(4);
      expect(finalState?.successRate).toBe(1.0); // 100% success rate
      expect(finalState?.context?.stage).toBe('end');
    });
  });
});
