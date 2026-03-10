/**
 * Unit tests for AgentSelector
 * Phase 4: Smart Selection & Backend Decision
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentSelector } from '../selector.js';
import type { Agent, IAgentRepository } from '../types.js';

// Mock repository
class MockRepository implements IAgentRepository {
  private agents: Map<string, Agent> = new Map();

  constructor() {
    // Setup test agents
    this.agents.set('typescript-expert', {
      name: 'typescript-expert',
      plugin: 'backend-development',
      path: '/test/typescript.md',
      description: 'TypeScript expert',
      capabilities: [
        { name: 'typescript', hierarchy: ['backend', 'typescript'], confidence: 0.95 },
        { name: 'api-design', hierarchy: ['backend', 'api'], confidence: 0.85 },
      ],
      category: 'backend',
      examples: ['Build REST API'],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
      successRate: 0.95,
    });

    this.agents.set('api-designer', {
      name: 'api-designer',
      plugin: 'backend-development',
      path: '/test/api.md',
      description: 'API designer',
      capabilities: [
        { name: 'api-design', hierarchy: ['backend', 'api'], confidence: 0.9 },
        { name: 'rest', hierarchy: ['backend', 'api', 'rest'], confidence: 0.92 },
      ],
      category: 'backend',
      examples: ['Design REST API'],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 1, // 1 day ago
      successRate: 0.88,
    });

    this.agents.set('security-reviewer', {
      name: 'security-reviewer',
      plugin: 'security',
      path: '/test/security.md',
      description: 'Security reviewer',
      capabilities: [
        { name: 'security', hierarchy: ['security'], confidence: 0.95 },
        { name: 'authentication', hierarchy: ['security', 'auth'], confidence: 0.9 },
      ],
      category: 'security',
      examples: ['Review code for security'],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
      successRate: 0.92,
    });
  }

  async findAgents(capability: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.some(cap => cap.name === capability || cap.hierarchy.includes(capability))
    );
  }

  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      capabilities.every(cap =>
        agent.capabilities.some(ac => ac.name === cap || ac.hierarchy.includes(cap))
      )
    );
  }

  async getAgent(name: string): Promise<Agent | undefined> {
    return this.agents.get(name);
  }

  async findByPlugin(pluginName: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent => agent.plugin === pluginName);
  }

  async search(keyword: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter(agent =>
      agent.name.includes(keyword) || agent.description.includes(keyword)
    );
  }

  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.name, agent);
  }

  async invalidate(agentName: string): Promise<void> {
    // No-op for mock
  }

  async refresh(): Promise<void> {
    // No-op for mock
  }

  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async getStats(): Promise<any> {
    return {
      pluginCount: 2,
      agentCount: this.agents.size,
      capabilityCount: 5,
      cacheHitRate: 1.0,
      lastScanTime: Date.now(),
      scanDuration: 0,
    };
  }

  async getCapabilityIndex(): Promise<any> {
    return {};
  }

  async updateCapabilityIndex(index: any): Promise<void> {
    // No-op for mock
  }
}

describe('AgentSelector', () => {
  let selector: AgentSelector;
  let repository: MockRepository;

  beforeEach(() => {
    repository = new MockRepository();
    selector = new AgentSelector(repository);
  });

  describe('selectAgent', () => {
    it('should select best agent for single capability', async () => {
      const result = await selector.selectAgent({
        requiredCapabilities: ['typescript'],
        minSuccessRate: 0.8,
      });

      expect(result).not.toBeNull();
      expect(result?.agent.name).toBe('typescript-expert');
      expect(result?.score).toBeGreaterThan(0.8);
      expect(result?.matchReason).toContain('high success rate');
    });

    it('should select agent with multiple capabilities', async () => {
      const result = await selector.selectAgent({
        requiredCapabilities: ['typescript', 'api-design'],
        minSuccessRate: 0.8,
      });

      expect(result).not.toBeNull();
      expect(result?.agent.name).toBe('typescript-expert');
      expect(result?.matchReason).toContain('matches required capabilities');
    });

    it('should return null when no agents match', async () => {
      const result = await selector.selectAgent({
        requiredCapabilities:['nonexistent'],
        minSuccessRate: 0.8,
      });

      expect(result).toBeNull();
    });

    it('should exclude failed agents', async () => {
      const result = await selector.selectAgent({
        requiredCapabilities: ['typescript'],
        excludeStatus: ['failed'],
      });

      expect(result).not.toBeNull();
      expect(result?.agent.status).not.toBe('failed');
    });
  });

  describe('selectAgents', () => {
    it('should select multiple agents for parallel delegation', async () => {
      const results = await selector.selectAgents(
        {
          requiredCapabilities: ['api-design'],
          minSuccessRate: 0.8,
        },
        2
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('selectWithFallback', () => {
    it('should build fallback chain', async () => {
      const results = await selector.selectWithFallback({
        requiredCapabilities: ['typescript'],
        minSuccessRate: 0.8,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
    });
  });

  describe('parseTaskCapabilities', () => {
    it('should extract TypeScript capability', () => {
      const capabilities = selector.parseTaskCapabilities('Build REST API with TypeScript');
      expect(capabilities).toContain('typescript');
      expect(capabilities).toContain('api');
    });

    it('should extract security capability', () => {
      const capabilities = selector.parseTaskCapabilities('Review code for security vulnerabilities');
      expect(capabilities).toContain('security');
    });

    it('should extract testing capability', () => {
      const capabilities = selector.parseTaskCapabilities('Write unit tests for API');
      expect(capabilities).toContain('testing');
    });

    it('should extract multiple capabilities', () => {
      const capabilities = selector.parseTaskCapabilities('Build secure REST API with TypeScript');
      expect(capabilities).toContain('typescript');
      expect(capabilities).toContain('api');
      expect(capabilities).toContain('security');
    });
  });

  describe('autoSelect', () => {
    it('should auto-select agent for simple task', async () => {
      const result = await selector.autoSelect('Build REST API with TypeScript');

      expect(result).not.toBeNull();
      expect(result?.agent.capabilities.some(cap => cap.name === 'typescript' || cap.name === 'api-design')).toBe(true);
    });

    it('should return generalist for unknown task', async () => {
      // Add a generalist agent
      const generalist = {
        name: 'generalist',
        plugin: 'general',
        path: '/test/general.md',
        description: 'Generalist agent',
        capabilities: [{ name: 'general', hierarchy: ['general'], confidence: 0.7 }],
        category: 'general',
        examples: [],
        metadata: { frontmatter: {}, content: '' },
        status: 'idle',
        lastUsed: 0,
        successRate: 0.7,
      };
      await repository.save(generalist);

      const result = await selector.autoSelect('Do something completely unrelated');

      expect(result).not.toBeNull();
      expect(result?.agent.name).toBe('generalist');
    });
  });
});
