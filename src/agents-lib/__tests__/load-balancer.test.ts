/**
 * Load Balancer Tests
 *
 * Comprehensive tests for load balancing and fallback chain functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoadBalancer, createLoadBalancer, LoadBalancingContext } from '../load-balancer.js';
import type { Agent } from '../types.js';

describe('LoadBalancer', () => {
  let balancer: LoadBalancer;
  let mockAgents: Agent[];

  beforeEach(() => {
    balancer = new LoadBalancer();

    // Create mock agents with varying capabilities and success rates
    mockAgents = [
      {
        name: 'specialist-1',
        plugin: 'test-plugin',
        path: '/test/agents/specialist-1.md',
        description: 'High-performance specialist',
        capabilities: [
          { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.95 },
          { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.90 },
        ],
        category: 'backend',
        examples: [],
        metadata: { frontmatter: {}, content: '' },
        status: 'idle',
        lastUsed: Date.now() - 3600000, // 1 hour ago
        successRate: 0.95,
      },
      {
        name: 'specialist-2',
        plugin: 'test-plugin',
        path: '/test/agents/specialist-2.md',
        description: 'Reliable specialist',
        capabilities: [
          { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.85 },
          { name: 'graphql', hierarchy: ['backend', 'api', 'graphql'], confidence: 0.88 },
        ],
        category: 'backend',
        examples: [],
        metadata: { frontmatter: {}, content: '' },
        status: 'idle',
        lastUsed: Date.now() - 7200000, // 2 hours ago
        successRate: 0.88,
      },
      {
        name: 'generalist-1',
        plugin: 'test-plugin',
        path: '/test/agents/generalist-1.md',
        description: 'General-purpose agent',
        capabilities: [
          { name: 'implementation', hierarchy: ['general'], confidence: 0.75 },
          { name: 'general-purpose', hierarchy: ['general'], confidence: 0.80 },
        ],
        category: 'general',
        examples: [],
        metadata: { frontmatter: {}, content: '' },
        status: 'idle',
        lastUsed: Date.now() - 1800000, // 30 minutes ago
        successRate: 0.82,
      },
      {
        name: 'specialist-3',
        plugin: 'test-plugin',
        path: '/test/agents/specialist-3.md',
        description: 'Overloaded specialist',
        capabilities: [
          { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.92 },
          { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.90 },
        ],
        category: 'backend',
        examples: [],
        metadata: { frontmatter: {}, content: '' },
        status: 'idle',
        lastUsed: Date.now() - 300000, // 5 minutes ago
        successRate: 0.92,
      },
    ];
  });

  describe('selectAgent', () => {
    it('should select the best agent based on scoring', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map([
          ['specialist-1', 1],
          ['specialist-2', 2],
          ['generalist-1', 0],
          ['specialist-3', 5], // Overloaded
        ]),
        lastUsed: new Map([
          ['specialist-1', Date.now() - 3600000],
          ['specialist-2', Date.now() - 7200000],
          ['generalist-1', Date.now() - 1800000],
          ['specialist-3', Date.now() - 300000],
        ]),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const result = balancer.selectAgent(mockAgents, context);

      expect(result).toBeDefined();
      expect(result.agent).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.reasoning).toBeDefined();
      expect(result.fallbackChain).toBeDefined();
      expect(result.isFallback).toBe(false);
    });

    it('should prefer idle agents over busy agents', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map([
          ['specialist-1', 5], // Busy
          ['specialist-2', 0], // Idle
        ]),
        lastUsed: new Map([
          ['specialist-1', Date.now()],
          ['specialist-2', Date.now() - 3600000],
        ]),
        taskComplexity: 'medium',
        preferSpecialists: true,
      };

      const result = balancer.selectAgent(
        [mockAgents[0], mockAgents[1]],
        context
      );

      // Should prefer specialist-2 (idle) over specialist-1 (busy)
      expect(result.agent.name).toBe('specialist-2');
    });

    it('should respect utilization threshold', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map([
          ['specialist-3', 5], // Over threshold
        ]),
        lastUsed: new Map([
          ['specialist-3', Date.now()],
        ]),
        taskComplexity: 'complex',
        preferSpecialists: true,
        maxUtilizationThreshold: 0.5,
      };

      const result = balancer.selectAgent(
        [mockAgents[3], mockAgents[0]], // Overloaded agent first
        context
      );

      // Should select agent below threshold
      expect(result.agent.name).not.toBe('specialist-3');
    });

    it('should filter by required capabilities', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
        requiredCapabilities: ['graphql'],
      };

      const result = balancer.selectAgent(mockAgents, context);

      // Only specialist-2 has graphql capability
      expect(result.agent.name).toBe('specialist-2');
    });

    it('should throw error if no candidates provided', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      expect(() => balancer.selectAgent([], context)).toThrow('No candidate agents provided');
    });

    it('should throw error if no agents match required capabilities', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
        requiredCapabilities:['non-existent-capability'],
      };

      expect(() => balancer.selectAgent(mockAgents, context)).toThrow('No agents match required capabilities');
    });
  });

  describe('buildFallbackChain', () => {
    it('should build complete fallback chain', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const chain = balancer.buildFallbackChain(mockAgents, mockAgents[0], context);

      expect(chain.primary).toBeDefined();
      expect(chain.primary.name).toBe('specialist-1');
      expect(chain.secondary).toBeDefined();
      expect(chain.generalist).toBeDefined();
      expect(chain.generalist?.name).toBe('generalist-1');
    });

    it('should handle missing generalist', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      const specialistsOnly = mockAgents.filter(a => a.category !== 'general');
      const chain = balancer.buildFallbackChain(specialistsOnly, specialistsOnly[0], context);

      expect(chain.generalist).toBeUndefined();
    });
  });

  describe('selectFromFallback', () => {
    it('should select secondary agent when primary fails', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const chain = balancer.buildFallbackChain(mockAgents, mockAgents[0], context);
      const next = balancer.selectFromFallback(chain, chain.primary, context);

      expect(next).toBeDefined();
      expect(next?.name).toBe(chain.secondary?.name);
    });

    it('should select tertiary agent when secondary fails', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const chain = balancer.buildFallbackChain(mockAgents, mockAgents[0], context);
      const next = balancer.selectFromFallback(chain, chain.secondary!, context);

      expect(next).toBeDefined();
      expect(next?.name).toBe(chain.tertiary?.name);
    });

    it('should select generalist when tertiary fails', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const chain = balancer.buildFallbackChain(mockAgents, mockAgents[0], context);
      const next = balancer.selectFromFallback(chain, chain.tertiary!, context);

      expect(next).toBeDefined();
      expect(next?.name).toBe(chain.generalist?.name);
    });

    it('should return null when chain is exhausted', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'complex',
        preferSpecialists: true,
      };

      const chain = balancer.buildFallbackChain(mockAgents, mockAgents[0], context);
      const next = balancer.selectFromFallback(chain, chain.generalist!, context);

      expect(next).toBeNull();
    });
  });

  describe('isAgentAvailable', () => {
    it('should return true for idle agent with low utilization', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map([['specialist-1', 1]]),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      const available = balancer.isAgentAvailable(mockAgents[0], context);
      expect(available).toBe(true);
    });

    it('should return false for working agent', () => {
      const busyAgent = { ...mockAgents[0], status: 'working' as const };

      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      const available = balancer.isAgentAvailable(busyAgent, context);
      expect(available).toBe(false);
    });

    it('should return false for overloaded agent', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map([['specialist-1', 10]]),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
        maxUtilizationThreshold: 0.5,
      };

      const available = balancer.isAgentAvailable(mockAgents[0], context);
      expect(available).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return statistics after assignments', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      // Make some assignments
      balancer.selectAgent(mockAgents, context);
      balancer.selectAgent(mockAgents, context);
      balancer.selectAgent(mockAgents, context);

      const stats = balancer.getStats();

      expect(stats.totalAssignments).toBe(3);
      expect(stats.agentUtilization.size).toBeGreaterThan(0);
      expect(stats.averageLoad).toBeGreaterThanOrEqual(0);
      expect(stats.mostUsedAgent).toBeDefined();
      expect(stats.leastUsedAgent).toBeDefined();
      expect(stats.timestamp).toBeDefined();
    });

    it('should calculate standard deviation', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      // Create uneven distribution
      for (let i = 0; i < 10; i++) {
        balancer.selectAgent([mockAgents[0]], context);
      }
      for (let i = 0; i < 2; i++) {
        balancer.selectAgent([mockAgents[1]], context);
      }

      const stats = balancer.getStats();

      expect(stats.utilizationStdDev).toBeDefined();
      expect(stats.utilizationStdDev).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(),
        lastUsed: new Map(),
        taskComplexity: 'simple',
        preferSpecialists: false,
      };

      balancer.selectAgent(mockAgents, context);
      expect(balancer.getStats().totalAssignments).toBe(1);

      balancer.reset();

      const stats = balancer.getStats();
      expect(stats.totalAssignments).toBe(0);
      expect(stats.agentUtilization.size).toBe(0);
    });
  });

  describe('Load Distribution Test (100 tasks)', () => {
    it('should distribute load evenly across agents', () => {
      const assignmentCounts = new Map<string, number>();

      // Initialize counts
      mockAgents.forEach(agent => assignmentCounts.set(agent.name, 0));

      // Simulate 100 task assignments
      for (let i = 0; i < 100; i++) {
        const context: LoadBalancingContext = {
          currentAssignments: new Map(assignmentCounts),
          lastUsed: new Map(
            mockAgents.map(a => [a.name, Date.now() - Math.random() * 3600000])
          ),
          taskComplexity: 'medium',
          preferSpecialists: false,
        };

        const result = balancer.selectAgent(mockAgents, context);
        const current = assignmentCounts.get(result.agent.name) || 0;
        assignmentCounts.set(result.agent.name, current + 1);
      }

      const stats = balancer.getStats();

      // Verify no single agent handles >40% of delegations
      const maxAssignments = Math.max(...assignmentCounts.values());
      const maxPercentage = (maxAssignments / 100) * 100;

      expect(maxPercentage).toBeLessThanOrEqual(40);

      // Verify distribution is relatively balanced
      expect(stats.utilizationStdDev).toBeLessThan(0.3);
    });
  });
});

describe('createLoadBalancer', () => {
  it('should create a LoadBalancer instance', () => {
    const balancer = createLoadBalancer();
    expect(balancer).toBeInstanceOf(LoadBalancer);
  });

  it('should accept custom history size', () => {
    const balancer = createLoadBalancer(500);
    expect(balancer).toBeInstanceOf(LoadBalancer);
  });
});
