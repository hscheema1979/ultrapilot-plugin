/**
 * Agent Selector Tests
 *
 * Comprehensive tests for intelligent agent selection system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentSelector, SelectionOptions } from '../selector.js';
import type {
  Agent,
  IAgentRepository,
  Capability,
} from '../types.js';

/**
 * Mock repository for testing
 */
class MockRepository implements IAgentRepository {
  private agents: Map<string, Agent> = new Map();

  constructor(agents: Agent[]) {
    agents.forEach(agent => this.agents.set(agent.name, agent));
  }

  async findAgents(capability: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.some(cap => cap.name === capability)
    );
  }

  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => {
      const agentCaps = agent.capabilities.map(c => c.name);
      return capabilities.every(cap => agentCaps.includes(cap));
    });
  }

  async findAgentsByPlugin(pluginName: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => agent.plugin === pluginName);
  }

  async query(options: any): Promise<Agent[]> {
    let results = Array.from(this.agents.values());

    if (options.capabilities?.length > 0) {
      results = results.filter(agent => {
        const agentCaps = agent.capabilities.map(c => c.name);
        // Agent matches if it has AT LEAST ONE of the required capabilities
        // The scoring system will rank agents with more matches higher
        return options.capabilities.some((cap: string) => agentCaps.includes(cap));
      });
    }

    if (options.category) {
      results = results.filter(agent => agent.category === options.category);
    }

    if (options.status) {
      results = results.filter(agent => agent.status === options.status);
    }

    if (options.minSuccessRate !== undefined) {
      results = results.filter(agent => agent.successRate >= options.minSuccessRate);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async getAgent(name: string): Promise<Agent | undefined> {
    return this.agents.get(name);
  }

  async search(keyword: string): Promise<Agent[]> {
    const lower = keyword.toLowerCase();
    return Array.from(this.agents.values()).filter(agent =>
      agent.name.toLowerCase().includes(lower) ||
      agent.description.toLowerCase().includes(lower) ||
      agent.capabilities.some(cap => cap.name.toLowerCase().includes(lower))
    );
  }

  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.name, agent);
  }

  async saveBatch(agents: Agent[]): Promise<void> {
    agents.forEach(agent => this.agents.set(agent.name, agent));
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
      pluginCount: 1,
      agentCount: this.agents.size,
      capabilityCount: new Set(
        Array.from(this.agents.values()).flatMap(agent => agent.capabilities.map(c => c.name))
      ).size,
      scanTime: Date.now(),
      version: '1.0.0',
    };
  }

  async initialize(): Promise<void> {
    // No-op for mock
  }

  async load(): Promise<boolean> {
    return false;
  }

  async saveCache(): Promise<void> {
    // No-op for mock
  }

  async destroy(): Promise<void> {
    this.agents.clear();
  }
}

/**
 * Test agent factory
 */
function createAgent(
  name: string,
  category: string,
  capabilities: Partial<Capability>[],
  status: 'idle' | 'working' | 'failed' = 'idle',
  successRate = 0.8
): Agent {
  return {
    name,
    plugin: 'test-plugin',
    path: `/test/${name}.md`,
    description: `Test agent ${name}`,
    capabilities: capabilities.map(cap => ({
      name: cap.name || 'general',
      hierarchy: cap.hierarchy || [cap.name || 'general'],
      confidence: cap.confidence ?? 0.8,
    })),
    category,
    examples: [],
    metadata: {
      frontmatter: {},
      content: '',
    },
    status,
    lastUsed: 0,
    successRate,
  };
}

describe('AgentSelector', () => {
  describe('Task Analysis', () => {
    it('should extract API capabilities from task', () => {
      const agents = [
        createAgent('backend-dev', 'backend', [
          { name: 'api', confidence: 0.9 },
          { name: 'rest-api', confidence: 0.8 },
        ]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Create a REST API for user management');

      expect(analysis.capabilities).toContain('api');
      expect(analysis.capabilities).toContain('rest-api');
      expect(analysis.category).toBe('backend');
    });

    it('should detect simple complexity', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Fix a simple bug');

      expect(analysis.complexity).toBe('simple');
    });

    it('should detect complex complexity', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Design a comprehensive distributed system architecture');

      expect(analysis.complexity).toBe('complex');
    });

    it('should default to medium complexity', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Create a feature for user login');

      expect(analysis.complexity).toBe('medium');
    });

    it('should extract key phrases', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Create a REST API with authentication');

      expect(analysis.keyPhrases).toEqual(
        expect.arrayContaining(['REST', 'API', 'authentication'])
      );
    });

    it('should detect frontend category', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Build a responsive React component');

      expect(analysis.category).toBe('frontend');
    });

    it('should detect testing category', () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('Write integration tests for the API');

      expect(analysis.category).toBe('testing');
    });
  });

  describe('Agent Selection', () => {
    const testAgents = [
      createAgent('backend-dev', 'backend', [
        { name: 'api', confidence: 0.9 },
        { name: 'rest-api', confidence: 0.8 },
        { name: 'database', confidence: 0.7 },
      ], 'idle', 0.95),
      createAgent('frontend-dev', 'frontend', [
        { name: 'ui', confidence: 0.9 },
        { name: 'react', confidence: 0.8 },
        { name: 'css', confidence: 0.7 },
      ], 'idle', 0.85),
      createAgent('fullstack-dev', 'backend', [
        { name: 'api', confidence: 0.7 },
        { name: 'ui', confidence: 0.7 },
        { name: 'database', confidence: 0.6 },
      ], 'idle', 0.75),
      createAgent('tester', 'testing', [
        { name: 'testing', confidence: 0.9 },
        { name: 'unit-test', confidence: 0.8 },
      ], 'idle', 0.9),
    ];

    it('should select backend agent for API task', async () => {
      const repository = new MockRepository(testAgents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create a REST API for user management');

      expect(selection.agent.name).toBe('backend-dev');
      expect(selection.confidence).toBeGreaterThan(0.5);
      expect(selection.taskAnalysis.capabilities).toContain('api');
    });

    it('should select frontend agent for UI task', async () => {
      const repository = new MockRepository(testAgents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Build a React component');

      expect(selection.agent.name).toBe('frontend-dev');
      expect(selection.confidence).toBeGreaterThan(0.5);
    });

    it('should select testing agent for test task', async () => {
      const repository = new MockRepository(testAgents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Write unit tests for the service');

      expect(selection.agent.name).toBe('tester');
      expect(selection.confidence).toBeGreaterThan(0.5);
    });

    it('should prefer idle agents over working ones', async () => {
      const agents = [
        createAgent('agent-1', 'backend', [{ name: 'api' }], 'working', 0.9),
        createAgent('agent-2', 'backend', [{ name: 'api' }], 'idle', 0.8),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', { preferIdle: true });

      expect(selection.agent.name).toBe('agent-2');
    });

    it('should consider success rate in selection', async () => {
      const agents = [
        createAgent('agent-1', 'backend', [{ name: 'api', confidence: 0.8 }], 'idle', 0.95),
        createAgent('agent-2', 'backend', [{ name: 'api', confidence: 0.9 }], 'idle', 0.6),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', { considerSuccessRate: true });

      // Agent 1 should win due to higher success rate despite slightly lower capability confidence
      expect(selection.agent.name).toBe('agent-1');
    });

    it('should return multiple agents when requested', async () => {
      const repository = new MockRepository(testAgents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', { maxAgents: 3 });

      // Should return multiple alternatives
      expect(selection.alternatives.length).toBeGreaterThan(0);
    });

    it('should generate fallback chain', async () => {
      const repository = new MockRepository(testAgents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', { fallbackChain: true });

      expect(selection.fallbackChain).toBeDefined();
      expect(Array.isArray(selection.fallbackChain)).toBe(true);
    });

    it('should throw error when no agents match', async () => {
      const agents = [
        createAgent('tester', 'testing', [{ name: 'testing' }]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      await expect(selector.selectAgent('Create a REST API')).rejects.toThrow();
    });
  });

  describe('Capability Scoring', () => {
    it('should score exact match highest', async () => {
      const agents = [
        createAgent('agent-1', 'backend', [
          { name: 'api', confidence: 0.5 },
        ]),
        createAgent('agent-2', 'backend', [
          { name: 'rest-api', confidence: 0.9 },
        ]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API');

      // Agent 1 should win due to exact match despite lower confidence
      expect(selection.agent.name).toBe('agent-1');
    });

    it('should score partial match lower than exact', async () => {
      const agents = [
        createAgent('exact-match', 'backend', [
          { name: 'api', confidence: 0.7 },
        ]),
        createAgent('partial-match', 'backend', [
          { name: 'rest-api', confidence: 0.9 },
        ]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API');

      expect(selection.agent.name).toBe('exact-match');
    });

    it('should boost score with high capability confidence', async () => {
      const agents = [
        createAgent('low-conf', 'backend', [
          { name: 'api', confidence: 0.5 },
        ], 'idle', 0.8),
        createAgent('high-conf', 'backend', [
          { name: 'api', confidence: 0.95 },
        ], 'idle', 0.8),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API');

      expect(selection.agent.name).toBe('high-conf');
    });
  });

  describe('Confidence Calculation', () => {
    it('should have higher confidence for simple tasks', async () => {
      const agents = [createAgent('agent', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const simpleTask = await selector.selectAgent('Fix a simple bug');
      const mediumTask = await selector.selectAgent('Create a feature');
      const complexTask = await selector.selectAgent('Design a complex system');

      expect(simpleTask.confidence).toBeGreaterThan(mediumTask.confidence);
      expect(mediumTask.confidence).toBeGreaterThan(complexTask.confidence);
    });

    it('should respect minConfidence threshold', async () => {
      const agents = [createAgent('agent', 'general', [{ name: 'general' }], 'idle', 0.3)];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create a complex system', {
        minConfidence: 0.1,
      });

      // Should still return agent even with low confidence
      expect(selection.agent.name).toBe('agent');
      expect(selection.confidence).toBeLessThan(0.5);
    });
  });

  describe('Reasoning Generation', () => {
    it('should generate clear reasoning', async () => {
      const agents = [createAgent('backend-dev', 'backend', [{ name: 'api' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create a REST API');

      expect(selection.reasoning).toBeDefined();
      expect(selection.reasoning).toContain('backend-dev');
      expect(selection.reasoning).toContain('backend');
      expect(selection.reasoning.length).toBeGreaterThan(0);
    });

    it('should include capability match in reasoning', async () => {
      const agents = [createAgent('backend-dev', 'backend', [{ name: 'api' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API');

      expect(selection.reasoning).toContain('api');
    });
  });

  describe('Multiple Candidates', () => {
    it('should return top candidates without selecting', async () => {
      const agents = [
        createAgent('agent-1', 'backend', [{ name: 'api', confidence: 0.9 }]),
        createAgent('agent-2', 'backend', [{ name: 'api', confidence: 0.7 }]),
        createAgent('agent-3', 'backend', [{ name: 'api', confidence: 0.5 }]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const candidates = await selector.getCandidates('Create an API', 3);

      expect(candidates).toHaveLength(3);
      expect(candidates[0].agent.name).toBe('agent-1');
      expect(candidates[1].agent.name).toBe('agent-2');
      expect(candidates[2].agent.name).toBe('agent-3');
    });

    it('should include score breakdown in candidates', async () => {
      const agents = [createAgent('agent', 'backend', [{ name: 'api' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const candidates = await selector.getCandidates('Create an API', 1);

      expect(candidates[0].capabilityScore).toBeDefined();
      expect(candidates[0].successRateScore).toBeDefined();
      expect(candidates[0].categoryScore).toBeDefined();
      expect(candidates[0].statusScore).toBeDefined();
      expect(candidates[0].totalScore).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty task description', async () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const analysis = selector.analyzeTask('');

      expect(analysis.capabilities).toContain('general');
      expect(analysis.complexity).toBe('medium');
    });

    it('should handle task with no matching keywords', async () => {
      const agents = [createAgent('general', 'general', [{ name: 'general' }])];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Do some random task');

      expect(selection.agent.name).toBe('general');
    });

    it('should handle failed agents', async () => {
      const agents = [
        createAgent('failed-agent', 'backend', [{ name: 'api' }], 'failed', 0.5),
        createAgent('idle-agent', 'backend', [{ name: 'api' }], 'idle', 0.5),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', { preferIdle: true });

      expect(selection.agent.name).toBe('idle-agent');
    });

    it('should handle category filter', async () => {
      const agents = [
        createAgent('backend', 'backend', [{ name: 'api' }]),
        createAgent('frontend', 'frontend', [{ name: 'ui' }]),
      ];
      const repository = new MockRepository(agents);
      const selector = new AgentSelector(repository);

      const selection = await selector.selectAgent('Create an API', {
        category: 'backend',
      });

      expect(selection.agent.name).toBe('backend');
    });
  });
});
