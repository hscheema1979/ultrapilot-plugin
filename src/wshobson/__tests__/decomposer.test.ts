/**
 * Unit tests for TaskDecomposer
 * Phase 4: Smart Selection & Backend Decision
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TaskDecomposer } from '../decomposer.js';
import { AgentSelector } from '../selector.js';
import type { IAgentRepository } from '../types.js';

// Mock repository
class MockRepository implements IAgentRepository {
  async findAgents(capability: string): Promise<any[]> {
    return [];
  }
  async findAgentsByCapabilities(capabilities: string[]): Promise<any[]> {
    return [];
  }
  async getAgent(name: string): Promise<any> {
    return undefined;
  }
  async findByPlugin(pluginName: string): Promise<any[]> {
    return [];
  }
  async search(keyword: string): Promise<any[]> {
    return [];
  }
  async save(agent: any): Promise<void> {}
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

describe('TaskDecomposer', () => {
  let decomposer: TaskDecomposer;
  let selector: AgentSelector;

  beforeEach(() => {
    const repository = new MockRepository();
    selector = new AgentSelector(repository);
    decomposer = new TaskDecomposer(selector);
  });

  describe('decompose', () => {
    it('should decompose API development task', async () => {
      const task = 'Build REST API for user management';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.originalTask).toBe(task);
      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.executionOrder.length).toBeGreaterThan(0);
      expect(decomposed.parallelizable).toBe(true);
    });

    it('should decompose frontend development task', async () => {
      const task = 'Build UI dashboard for analytics';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.parallelizable).toBe(true);
    });

    it('should decompose security review task', async () => {
      const task = 'Review code for security vulnerabilities';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.subtasks.has('static-analysis')).toBe(true);
      expect(decomposed.subtasks.has('code-review')).toBe(true);
    });

    it('should decompose testing task', async () => {
      const task = 'Write comprehensive tests for API';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.subtasks.has('test-strategy')).toBe(true);
      expect(decomposed.subtasks.has('unit-tests')).toBe(true);
    });

    it('should decompose bug fix task', async () => {
      const task = 'Fix authentication bug in login flow';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.subtasks.has('root-cause')).toBe(true);
      expect(decomposed.subtasks.has('implement-fix')).toBe(true);
    });

    it('should decompose generic task', async () => {
      const task = 'Implement feature for data processing';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.subtasks.size).toBeGreaterThan(0);
      expect(decomposed.subtasks.has('analyze')).toBe(true);
      expect(decomposed.subtasks.has('implement')).toBe(true);
    });
  });

  describe('execution order', () => {
    it('should respect dependencies', async () => {
      const task = 'Build REST API';
      const decomposed = await decomposer.decompose(task);

      const implementIndex = decomposed.executionOrder.indexOf('implement-api');
      const testIndex = decomposed.executionOrder.indexOf('test-api');

      expect(implementIndex).toBeLessThan(testIndex);
    });
  });

  describe('parallelizable', () => {
    it('should detect parallelizable tasks', async () => {
      const task = 'Build REST API with database';
      const decomposed = await decomposer.decompose(task);

      expect(decomposed.parallelizable).toBe(true);
    });
  });

  describe('matchSubtasksToAgents', () => {
    it('should return empty map for mock repository', async () => {
      const task = 'Build REST API';
      const decomposed = await decomposer.decompose(task);
      const assignments = await decomposer.matchSubtasksToAgents(decomposed);

      expect(assignments.size).toBe(0);
    });
  });

  describe('getParallelGroups', () => {
    it('should identify parallel execution groups', async () => {
      const task = 'Build REST API';
      const decomposed = await decomposer.decompose(task);
      const groups = decomposer.getParallelGroups(decomposed);

      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].length).toBeGreaterThan(0);
    });
  });

  describe('subtask structure', () => {
    it('should create subtasks with required fields', async () => {
      const task = 'Build REST API';
      const decomposed = await decomposer.decompose(task);

      for (const [id, subtask] of decomposed.subtasks) {
        expect(subtask.description).toBeTruthy();
        expect(subtask.requiredCapabilities).toBeInstanceOf(Array);
        expect(subtask.dependencies).toBeInstanceOf(Array);
        expect(subtask.estimatedDuration).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(subtask.priority);
      }
    });
  });
});
