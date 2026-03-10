/**
 * Unit tests for LoadBalancer
 * Phase 4: Smart Selection & Backend Decision
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LoadBalancer } from '../balancer.js';
import type { Agent, IAgentRepository } from '../types.js';

// Mock repository
class MockRepository implements IAgentRepository {
  private agents: Map<string, Agent> = new Map();

  constructor() {
    this.agents.set('agent-1', {
      name: 'agent-1',
      plugin: 'test',
      path: '/test/1.md',
      description: 'Test agent 1',
      capabilities: [{ name: 'test', hierarchy: ['test'], confidence: 0.9 }],
      category: 'test',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.9,
    });

    this.agents.set('agent-2', {
      name: 'agent-2',
      plugin: 'test',
      path: '/test/2.md',
      description: 'Test agent 2',
      capabilities: [{ name: 'test', hierarchy: ['test'], confidence: 0.9 }],
      category: 'test',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.9,
    });

    this.agents.set('agent-3', {
      name: 'agent-3',
      plugin: 'test',
      path: '/test/3.md',
      description: 'Test agent 3',
      capabilities: [{ name: 'test', hierarchy: ['test'], confidence: 0.9 }],
      category: 'test',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.9,
    });
  }

  async findAgents(capability: string): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
  async getAgent(name: string): Promise<Agent | undefined> {
    return this.agents.get(name);
  }
  async findByPlugin(pluginName: string): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
  async search(keyword: string): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
  async save(agent: Agent): Promise<void> {}
  async invalidate(agentName: string): Promise<void> {}
  async refresh(): Promise<void> {}
  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
  async getStats(): Promise<any> {
    return {};
  }
  async getCapabilityIndex(): Promise<any> {
    return {};
  }
  async updateCapabilityIndex(index: any): Promise<void> {}
}

describe('LoadBalancer', () => {
  let balancer: LoadBalancer;
  let repository: MockRepository;
  let agents: Agent[];

  beforeEach(() => {
    repository = new MockRepository();
    balancer = new LoadBalancer(repository);
    agents = Array.from(await repository.findAgents('test'));
  });

  describe('selectAgent', () => {
    it('should select agent from candidates', async () => {
      const selected = await balancer.selectAgent(agents);
      expect(selected).not.toBeNull();
      expect(agents).toContainEqual(selected);
    });

    it('should return null for empty candidates', async () => {
      const selected = await balancer.selectAgent([]);
      expect(selected).toBeNull();
    });

    it('should return only candidate if only one', async () => {
      const selected = await balancer.selectAgent([agents[0]]);
      expect(selected).toEqual(agents[0]);
    });

    it('should avoid overloaded agents', async () => {
      // Overload agent-1
      for (let i = 0; i < 10; i++) {
        balancer.recordAssignment(agents[0]);
      }

      const selected = await balancer.selectAgent(agents);
      expect(selected?.name).not.toBe('agent-1');
    });
  });

  describe('isAgentAvailable', () => {
    it('should return true for new agent', () => {
      expect(balancer.isAgentAvailable(agents[0])).toBe(true);
    });

    it('should return false for overloaded agent', () => {
      const config = { maxConcurrentTasks: 2 };
      const customBalancer = new LoadBalancer(repository, config);

      // Assign 3 tasks
      for (let i = 0; i < 3; i++) {
        customBalancer.recordAssignment(agents[0]);
      }

      expect(customBalancer.isAgentAvailable(agents[0])).toBe(false);
    });
  });

  describe('recordAssignment', () => {
    it('should track task assignment', () => {
      balancer.recordAssignment(agents[0]);

      const stats = balancer.getLoadStats();
      const load = stats.get('agent-1');

      expect(load).toBeDefined();
      expect(load?.activeTasks).toBe(1);
      expect(load?.totalTasks).toBe(1);
    });
  });

  describe('recordCompletion', () => {
    it('should decrement active tasks', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordCompletion(agents[0], 1000);

      const stats = balancer.getLoadStats();
      const load = stats.get('agent-1');

      expect(load?.activeTasks).toBe(0);
      expect(load?.totalTasks).toBe(1);
    });

    it('should update average task duration', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordCompletion(agents[0], 1000);
      balancer.recordAssignment(agents[0]);
      balancer.recordCompletion(agents[0], 2000);

      const stats = balancer.getLoadStats();
      const load = stats.get('agent-1');

      expect(load?.avgTaskDuration).toBe(1500);
    });
  });

  describe('recordFailure', () => {
    it('should decrement active tasks but not total', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordFailure(agents[0]);

      const stats = balancer.getLoadStats();
      const load = stats.get('agent-1');

      expect(load?.activeTasks).toBe(0);
      expect(load?.totalTasks).toBe(1);
    });
  });

  describe('load distribution', () => {
    it('should distribute load evenly', () => {
      // Distribute 10 tasks across 3 agents
      for (let i = 0; i < 10; i++) {
        const agent = agents[i % 3];
        balancer.recordAssignment(agent);
      }

      expect(balancer.isLoadBalanced()).toBe(true);
    });

    it('should detect load imbalance', () => {
      // Overload agent-1
      for (let i = 0; i < 10; i++) {
        balancer.recordAssignment(agents[0]);
      }

      expect(balancer.isLoadBalanced()).toBe(false);
    });

    it('should identify overloaded agents', () => {
      for (let i = 0; i < 10; i++) {
        balancer.recordAssignment(agents[0]);
      }

      const overloaded = balancer.getOverloadedAgents();
      expect(overloaded).toContain('agent-1');
    });
  });

  describe('load distribution percentage', () => {
    it('should calculate load percentages', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordAssignment(agents[0]);
      balancer.recordAssignment(agents[1]);
      balancer.recordAssignment(agents[2]);

      const distribution = balancer.getLoadDistribution();

      expect(distribution.get('agent-1')).toBeCloseTo(0.5, 1);
      expect(distribution.get('agent-2')).toBeCloseTo(0.25, 1);
      expect(distribution.get('agent-3')).toBeCloseTo(0.25, 1);
    });
  });

  describe('getRecommendations', () => {
    it('should provide load balancing recommendations', () => {
      // Overload agent-1
      for (let i = 0; i < 10; i++) {
        balancer.recordAssignment(agents[0]);
      }

      const recommendations = balancer.getRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('Load imbalance'))).toBe(true);
    });

    it('should identify idle agents', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordCompletion(agents[0], 1000);

      const recommendations = balancer.getRecommendations();

      expect(recommendations.some(r => r.includes('Idle agents'))).toBe(true);
    });
  });

  describe('resetTracking', () => {
    it('should clear all tracking data', () => {
      balancer.recordAssignment(agents[0]);
      balancer.recordAssignment(agents[1]);
      balancer.resetTracking();

      const stats = balancer.getLoadStats();

      expect(stats.size).toBe(0);
    });
  });

  describe('max load percentage enforcement', () => {
    it('should respect max load percentage', () => {
      const config = { maxLoadPercentage: 0.3 }; // 30%
      const customBalancer = new LoadBalancer(repository, config);

      // Give agent-1 40% of load
      for (let i = 0; i < 8; i++) {
        customBalancer.recordAssignment(agents[0]);
      }
      // Give others 30% each
      for (let i = 0; i < 6; i++) {
        customBalancer.recordAssignment(agents[1]);
        customBalancer.recordAssignment(agents[2]);
      }

      expect(customBalancer.isAgentAvailable(agents[0])).toBe(false);
      expect(customBalancer.isAgentAvailable(agents[1])).toBe(true);
    });
  });
});
