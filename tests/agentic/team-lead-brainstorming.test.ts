/**
 * Team Lead Brainstorming and Analysis Tests
 *
 * Tests that si-agent-team-lead and ultra-team-lead can:
 * - Facilitate brainstorming sessions
 * - Coordinate analysis across specialist agents
 * - Synthesize insights from multiple perspectives
 * - Maintain session memory throughout the process
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentBridge, AgentOrchestrator, AgentStateStore, AgentMessageBus } from '../../src/index.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

class MockTaskTool {
  async call(params: {
    subagent_type: string;
    description: string;
    prompt: string;
  }): Promise<any> {
    // Simulate different agent responses
    const responses: Record<string, any> = {
      'ultra:analyst': {
        success: true,
        output: 'Requirements analysis complete:\n- User authentication needed\n- Role-based access control\n- Session management\n- Password reset flow'
      },
      'ultra:architect': {
        success: true,
        output: 'Architecture proposal:\n- JWT-based stateless auth\n- REST API design\n- Database schema with users, roles, sessions tables\n- Redis for session storage'
      },
      'ultra:security-reviewer': {
        success: true,
        output: 'Security recommendations:\n- Use bcrypt for password hashing\n- Implement rate limiting\n- Add CSRF protection\n- Enable 2FA support\n- Security headers (CORS, CSP, etc.)'
      },
      'frontend-developer': {
        success: true,
        output: 'UI/UX considerations:\n- Login/register forms\n- Password strength indicator\n- Remember me checkbox\n- Social login buttons\n- Responsive design'
      },
      'backend-architect': {
        success: true,
        output: 'Backend implementation:\n- Node.js with Express\n- PostgreSQL database\n- Passport.js for auth\n- JWT token management\n- API endpoints for auth'
      }
    };

    return responses[params.subagent_type] || {
      success: true,
      output: `[Mock ${params.subagent_type}] Completed: ${params.description}`
    };
  }
}

describe('Team Lead: Brainstorming and Analysis Sessions', () => {
  let bridge: AgentBridge;
  let orchestrator: AgentOrchestrator;
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;
  let mockTask: MockTaskTool;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = `/tmp/test-brainstorm-${randomBytes(8).toString('hex')}.db`;

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
  });

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('si-agent-team-lead Brainstorming Session', () => {
    it('should coordinate multi-agent brainstorming for new feature', async () => {
      // Scenario: Team needs to brainstorm "User Authentication System"

      const sessionId = 'brainstorm-auth-1';

      // si-agent-team-lead creates session
      await stateStore.create(sessionId, {
        currentTask: 'Coordinate brainstorming for user authentication',
        context: {
          feature: 'User Authentication System',
          goal: 'Design comprehensive auth system',
          participants: ['analyst', 'architect', 'security', 'frontend', 'backend'],
          stage: 'brainstorming'
        }
      });

      // Subscribe team lead to all agent communications
      messageBus.subscribe(sessionId, 'brainstorm-channel', async (msg) => {
        // Team lead collects insights from all agents
        await stateStore.update(sessionId, {
          context: {
            latestInsight: {
              from: msg.from,
              type: msg.type,
              timestamp: new Date().toISOString()
            }
          }
        });
      });

      // Phase 1: Parallel brainstorming (all specialists contribute)
      const brainstormingResults = await orchestrator.coordinateParallel([
        {
          agentId: 'ultra:analyst',
          task: 'What are the requirements for user authentication?',
          context: { domain: 'analysis' },
          communicationChannels: ['brainstorm-channel']
        },
        {
          agentId: 'ultra:architect',
          task: 'What architectural patterns should we consider?',
          context: { domain: 'architecture' },
          communicationChannels: ['brainstorm-channel']
        },
        {
          agentId: 'ultra:security-reviewer',
          task: 'What security considerations are critical?',
          context: { domain: 'security' },
          communicationChannels: ['brainstorm-channel']
        },
        {
          agentId: 'frontend-developer',
          task: 'What UX patterns work well for authentication?',
          context: { domain: 'frontend' },
          communicationChannels: ['brainstorm-channel']
        },
        {
          agentId: 'backend-architect',
          task: 'What backend implementation approaches work best?',
          context: { domain: 'backend' },
          communicationChannels: ['brainstorm-channel']
        }
      ]);

      // Verify all specialists contributed
      expect(brainstormingResults).toHaveLength(5);
      expect(brainstormingResults.every(r => r.success)).toBe(true);

      // Verify team lead collected insights
      const sessionState = await stateStore.get(sessionId);
      expect(sessionState).toBeDefined();
      expect(sessionState?.context?.participants).toHaveLength(5);

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Team lead now has 5 different perspectives to synthesize
      expect(sessionState?.context?.latestInsight).toBeDefined();
    });

    it('should analyze and synthesize brainstorming results', async () => {
      const sessionId = 'synthesis-1';

      // After brainstorming, team lead synthesizes insights

      // Record insights from brainstorming
      await stateStore.create(sessionId, {
        currentTask: 'Synthesize brainstorming insights',
        decisions: [],
        context: {
          topic: 'User Authentication'
        }
      });

      // Record each agent's contribution
      const insights = [
        {
          agent: 'ultra:analyst',
          insight: 'Need: JWT tokens, role-based access, session management',
          category: 'requirements'
        },
        {
          agent: 'ultra:architect',
          insight: 'Approach: Stateless auth, REST API, Redis sessions',
          category: 'architecture'
        },
        {
          agent: 'ultra:security-reviewer',
          insight: 'Security: bcrypt, rate limiting, 2FA, CSRF protection',
          category: 'security'
        },
        {
          agent: 'frontend-developer',
          insight: 'UX: Simple forms, social login, password strength',
          category: 'ux'
        },
        {
          agent: 'backend-architect',
          insight: 'Implementation: Node.js, PostgreSQL, Passport.js',
          category: 'implementation'
        }
      ];

      for (const insight of insights) {
        await stateStore.recordDecision(sessionId, {
          decision: `[${insight.category}] ${insight.insight}`,
          reasoning: `Contributed by ${insight.agent}`,
          agentId: insight.agent
        });
      }

      // Verify all insights recorded
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.decisions).toHaveLength(5);

      // Team lead can now present synthesized view
      const synthesis = {
        requirements: finalState?.decisions.filter(d => d.decision.includes('[requirements]')),
        architecture: finalState?.decisions.filter(d => d.decision.includes('[architecture]')),
        security: finalState?.decisions.filter(d => d.decision.includes('[security]')),
        ux: finalState?.decisions.filter(d => d.decision.includes('[ux]')),
        implementation: finalState?.decisions.filter(d => d.decision.includes('[implementation]'))
      };

      expect(synthesis.requirements).toHaveLength(1);
      expect(synthesis.architecture).toHaveLength(1);
      expect(synthesis.security).toHaveLength(1);
      expect(synthesis.ux).toHaveLength(1);
      expect(synthesis.implementation).toHaveLength(1);
    });
  });

  describe('ultra-team-lead Analysis Session', () => {
    it('should coordinate deep analysis across domain dimensions', async () => {
      // Scenario: Deep analysis of existing authentication system

      const sessionId = 'deep-analysis-auth-1';

      // ultra-team-lead creates comprehensive analysis session
      await stateStore.create(sessionId, {
        currentTask: 'Coordinate comprehensive analysis',
        context: {
          target: 'Existing authentication system',
          analysisDimensions: [
            'security',
            'performance',
            'maintainability',
            'scalability',
            'user-experience'
          ]
        }
      });

      // Execute analysis workflow (sequential with dependencies)
      const analysisWorkflow = {
        id: sessionId,
        name: 'Comprehensive Authentication Analysis',
        mode: 'sequential' as const,
        channels: ['analysis-sync'],
        steps: [
          {
            id: 'security-analysis',
            agentId: 'ultra:security-reviewer',
            task: 'Analyze security: OWASP Top 10, auth flows, encryption',
            outputTo: 'securityReport'
          },
          {
            id: 'performance-analysis',
            agentId: 'si:performance-specialist',
            task: 'Analyze performance: database queries, token validation, caching',
            dependencies: ['security-analysis'],
            outputTo: 'performanceReport'
          },
          {
            id: 'code-quality-analysis',
            agentId: 'si:code-reviewer',
            task: 'Analyze code quality: maintainability, technical debt, patterns',
            dependencies: ['performance-analysis'],
            outputTo: 'qualityReport'
          },
          {
            id: 'synthesis',
            agentId: 'ultra:architect',
            task: 'Synthesize all analysis reports into recommendations',
            dependencies: ['code-quality-analysis'],
            outputTo: 'finalReport'
          }
        ]
      };

      const result = await orchestrator.executeWorkflow(analysisWorkflow);

      // Verify analysis completed
      expect(result.success).toBe(true);
      expect(result.completed).toBe(4);

      // Verify each dimension analyzed
      expect(result.outputs['securityReport'] || result.outputs['security-analysis']).toBeDefined();
      expect(result.outputs['performanceReport'] || result.outputs['performance-analysis']).toBeDefined();
      expect(result.outputs['qualityReport'] || result.outputs['code-quality-analysis']).toBeDefined();
      expect(result.outputs['finalReport'] || result.outputs['synthesis']).toBeDefined();

      // Verify session captured analysis
      const sessionState = await stateStore.get(sessionId);
      expect(sessionState?.completedTasks).toContain('security-analysis');
      expect(sessionState?.completedTasks).toContain('performance-analysis');
      expect(sessionState?.completedTasks).toContain('code-quality-analysis');
      expect(sessionState?.completedTasks).toContain('synthesis');
    });

    it('should facilitate iterative analysis with feedback loops', async () => {
      const sessionId = 'iterative-analysis-1';

      // Analysis that refines based on previous findings

      await stateStore.create(sessionId, {
        currentTask: 'Iterative security analysis',
        context: {
          iteration: 1,
          findings: []
        }
      });

      // Iteration 1: Initial analysis
      const iter1 = await orchestrator.spawnAgent(
        'ultra:security-reviewer',
        'Initial security assessment',
        { domain: 'security' }
      );

      expect(iter1.success).toBe(true);

      // Record findings
      await stateStore.update(sessionId, {
        context: {
          iteration: 2,
          findings: ['Potential SQL injection', 'Missing rate limiting']
        }
      });

      // Iteration 2: Deep dive based on findings
      const iter2 = await orchestrator.spawnAgent(
        'ultra:security-reviewer',
        'Deep dive: SQL injection and rate limiting vulnerabilities',
        {
          domain: 'security',
          context: {
            focusAreas: ['SQL injection', 'rate limiting']
          }
        }
      );

      expect(iter2.success).toBe(true);

      // Verify iteration tracking
      const finalState = await stateStore.get(sessionId);
      expect(finalState?.context?.iteration).toBe(2);
      expect(finalState?.context?.findings).toHaveLength(2);
    });
  });

  describe('Team Lead Decision Making', () => {
    it('should evaluate conflicting recommendations and make decision', async () => {
      const sessionId = 'decision-making-1';

      // Team lead receives conflicting recommendations

      await stateStore.create(sessionId, {
        currentTask: 'Resolve architectural conflict',
        decisions: [],
        context: {
          conflict: 'State management approach'
        }
      });

      // Recommendation A: Redux
      await stateStore.recordDecision(sessionId, {
        decision: 'Use Redux for state management',
        reasoning: 'Predictable state container, great devtools, middleware ecosystem',
        alternatives: ['Context API', 'Zustand', 'Recoil'],
        agentId: 'si:frontend-architect-a',
        confidence: 0.8,
        pros: ['Predictable', 'Debuggable', 'Large community'],
        cons: ['Boilerplate', 'Complex for simple cases']
      });

      // Recommendation B: Context API
      await stateStore.recordDecision(sessionId, {
        decision: 'Use React Context API for state management',
        reasoning: 'Built into React, simpler for this use case, no extra dependencies',
        alternatives: ['Redux', 'Zustand', 'Recoil'],
        agentId: 'si:frontend-architect-b',
        confidence: 0.7,
        pros: ['Simple', 'Built-in', 'Less boilerplate'],
        cons: ['No devtools', 'Re-renders', 'Limited for complex state']
      });

      // Team lead evaluates both
      const state = await stateStore.get(sessionId);
      expect(state?.decisions).toHaveLength(2);

      const decisionA = state?.decisions[0];
      const decisionB = state?.decisions[1];

      // Team lead can now make informed decision
      expect(decisionA?.agentId).toBe('si:frontend-architect-a');
      expect(decisionB?.agentId).toBe('si:frontend-architect-b');

      // Decision criteria available:
      expect(decisionA?.pros).toBeDefined();
      expect(decisionA?.cons).toBeDefined();
      expect(decisionA?.confidence).toBe(0.8);

      expect(decisionB?.pros).toBeDefined();
      expect(decisionB?.cons).toBeDefined();
      expect(decisionB?.confidence).toBe(0.7);

      // Team lead would choose based on:
      // - Project complexity (Redux if complex, Context if simple)
      // - Team expertise (what team knows better)
      // - Long-term maintenance (Redux has larger ecosystem)
    });

    it('should track decision evolution and rationale', async () => {
      const sessionId = 'decision-evolution-1';

      // Track how decisions change over time

      await stateStore.create(sessionId, {
        currentTask: 'Track decision evolution',
        decisions: [],
        context: {
          topic: 'API design approach'
        }
      });

      // Initial decision
      await stateStore.recordDecision(sessionId, {
        decision: 'Use REST API',
        reasoning: 'Simple, widely adopted, sufficient for current needs',
        timestamp: new Date('2026-03-01T10:00:00Z')
      });

      // Decision evolves based on new information
      await stateStore.recordDecision(sessionId, {
        decision: 'Use GraphQL + REST hybrid',
        reasoning: 'GraphQL for client queries (flexibility), REST for mutations (simplicity)',
        timestamp: new Date('2026-03-02T14:00:00Z'),
        evolutionFrom: 'Use REST API',
        evolutionReason: 'Client needs complex data fetching, REST alone insufficient'
      });

      // Verify evolution tracked
      const state = await stateStore.get(sessionId);
      expect(state?.decisions).toHaveLength(2);

      const initial = state?.decisions[0];
      const evolved = state?.decisions[1];

      expect(evolved?.evolutionFrom).toBe(initial?.decision);
      expect(evolved?.evolutionReason).toBeDefined();

      // Team lead has complete audit trail
      expect(initial?.timestamp).toBeDefined();
      expect(evolved?.timestamp).toBeDefined();
    });
  });

  describe('Team Lead Session Management', () => {
    it('should maintain session memory across multiple workflows', async () => {
      const sessionId = 'session-memory-1';

      // Workflow 1: Requirements gathering
      await stateStore.create(sessionId, {
        currentTask: 'Requirements gathering',
        completedTasks: [],
        decisions: [],
        context: {
          project: 'E-commerce platform',
          phase: 'requirements'
        }
      });

      const reqWorkflow = await orchestrator.executeWorkflow({
        id: 'req-gathering',
        name: 'Gather Requirements',
        mode: 'sequential' as const,
        steps: [
          {
            id: 'analyze-needs',
            agentId: 'ultra:analyst',
            task: 'Analyze business requirements'
          },
          {
            id: 'document-requirements',
            agentId: 'ultra:analyst',
            task: 'Document requirements',
            dependencies: ['analyze-needs']
          }
        ]
      });

      expect(reqWorkflow.success).toBe(true);

      // Update session state
      await stateStore.update(sessionId, {
        currentTask: 'Architecture design',
        completedTasks: ['Requirements gathering'],
        context: {
          phase: 'architecture',
          requirementsComplete: true
        }
      });

      // Workflow 2: Architecture design (can read requirements phase)
      const archWorkflow = await orchestrator.executeWorkflow({
        id: 'arch-design',
        name: 'Design Architecture',
        mode: 'sequential' as const,
        steps: [
          {
            id: 'design-system',
            agentId: 'ultra:architect',
            task: 'Design system architecture'
          },
          {
            id: 'document-architecture',
            agentId: 'ultra:architect',
            task: 'Document architecture',
            dependencies: ['design-system']
          }
        ]
      });

      expect(archWorkflow.success).toBe(true);

      // Verify session maintained memory
      const sessionState = await stateStore.get(sessionId);
      expect(sessionState?.completedTasks).toHaveLength(2);
      expect(sessionState?.context?.project).toBe('E-commerce platform');
      expect(sessionState?.context?.requirementsComplete).toBe(true);
    });

    it('should provide session summary and insights', async () => {
      const sessionId = 'session-summary-1';

      // After extensive session, team lead provides summary

      await stateStore.create(sessionId, {
        currentTask: 'Generate session summary',
        completedTasks: [
          'Brainstorming',
          'Requirements analysis',
          'Architecture design',
          'Security review',
          'Implementation planning'
        ],
        decisions: [
          { decision: 'Use JWT for auth', reasoning: 'Stateless, scalable' },
          { decision: 'PostgreSQL database', reasoning: 'ACID compliance, reliability' },
          { decision: 'React frontend', reasoning: 'Team expertise, ecosystem' }
        ],
        context: {
          duration: '3 hours',
          participants: 5,
          iterations: 2
        },
        totalInvocations: 12,
        successRate: 0.92
      });

      // Team lead generates summary
      const sessionState = await stateStore.get(sessionId);

      const summary = {
        session: sessionId,
        workCompleted: sessionState?.completedTasks,
        decisionsMade: sessionState?.decisions?.length,
        keyDecisions: sessionState?.decisions?.map(d => d.decision),
        effectiveness: {
          invocations: sessionState?.totalInvocations,
          successRate: sessionState?.successRate,
          iterations: sessionState?.context?.iterations
        },
        metadata: {
          duration: sessionState?.context?.duration,
          participants: sessionState?.context?.participants
        }
      };

      // Verify summary is comprehensive
      expect(summary.workCompleted).toHaveLength(5);
      expect(summary.decisionsMade).toBe(3);
      expect(summary.keyDecisions).toContain('Use JWT for auth');
      expect(summary.effectiveness.invocations).toBe(12);
      expect(summary.effectiveness.successRate).toBe(0.92);
    });
  });
});
