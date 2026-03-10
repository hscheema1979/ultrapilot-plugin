/**
 * Tests for GitHubAgentOrchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubAgentOrchestrator } from '../github-agent-orchestrator.js';
import { GitHubService } from '../github-service.js';
import { GitHubStateAdapter } from '../github-state-adapter.js';
import { GitHubTaskQueueAdapter } from '../github-task-queue-adapter.js';

describe('GitHubAgentOrchestrator', () => {
  let orchestrator: GitHubAgentOrchestrator;
  let github: GitHubService;
  let state: GitHubStateAdapter;
  let queue: GitHubTaskQueueAdapter;

  beforeEach(() => {
    // Mock dependencies
    github = {
      getOwner: () => 'test-owner',
      getRepo: () => 'test-repo',
      createIssue: vi.fn().mockResolvedValue({ number: 1 }),
      getIssue: vi.fn().mockResolvedValue({
        number: 1,
        body: `---
type: file_ownership
version: 1
---
/src/file1.ts: agent-1
/src/file2.ts: agent-2`
      }),
      updateIssue: vi.fn().mockResolvedValue({}),
      searchIssues: vi.fn().mockResolvedValue([{ number: 1 }])
    } as any;

    state = {
      get: vi.fn(),
      set: vi.fn()
    } as any;

    queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      getQueue: vi.fn()
    } as any;

    orchestrator = new GitHubAgentOrchestrator(github, state, queue, {
      maxParallel: 2,
      agentTimeout: 10000,
      cacheTTL: 30000,
      batchPersistInterval: 1000
    });
  });

  afterEach(async () => {
    await orchestrator.cleanup();
  });

  describe('File Ownership', () => {
    it('should claim an unowned file', async () => {
      const result = await orchestrator.claimFile('agent-3', '/src/new-file.ts');
      expect(result).toBe(true);
    });

    it('should fail to claim an owned file', async () => {
      const result = await orchestrator.claimFile('agent-3', '/src/file1.ts');
      expect(result).toBe(false);
    });

    it('should release an owned file', async () => {
      await orchestrator.releaseFile('agent-1', '/src/file1.ts');
      const owner = await orchestrator.getOwner('/src/file1.ts');
      expect(owner).toBe(null);
    });

    it('should get file owner', async () => {
      const owner = await orchestrator.getOwner('/src/file1.ts');
      expect(owner).toBe('agent-1');
    });

    it('should batch claim files', async () => {
      const results = await orchestrator.claimFiles('agent-3', [
        '/src/file3.ts',
        '/src/file4.ts',
        '/src/file5.ts'
      ]);

      expect(results['/src/file3.ts']).toBe(true);
      expect(results['/src/file4.ts']).toBe(true);
      expect(results['/src/file5.ts']).toBe(true);
    });

    it('should batch release files', async () => {
      await orchestrator.releaseFiles('agent-1', ['/src/file1.ts']);
      const owner = await orchestrator.getOwner('/src/file1.ts');
      expect(owner).toBe(null);
    });

    it('should get all files owned by agent', async () => {
      const files = await orchestrator.getAgentFiles('agent-1');
      expect(files).toContain('/src/file1.ts');
    });

    it('should transfer file ownership', async () => {
      const result = await orchestrator.transferFile('agent-1', 'agent-3', '/src/file1.ts');
      expect(result).toBe(true);

      const owner = await orchestrator.getOwner('/src/file1.ts');
      expect(owner).toBe('agent-3');
    });

    it('should fail transfer if not owner', async () => {
      const result = await orchestrator.transferFile('agent-3', 'agent-1', '/src/file1.ts');
      expect(result).toBe(false);
    });
  });

  describe('Parallel Execution', () => {
    it('should spawn single agent', async () => {
      const task = {
        id: 'task-1',
        agent: 'executor',
        description: 'Test task',
        files: []
      };

      const result = await orchestrator.spawnAgent('executor', task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toContain('agent-');
    });

    it('should coordinate parallel tasks', async () => {
      const tasks = [
        { id: 'task-1', agent: 'executor', description: 'Task 1', files: [] },
        { id: 'task-2', agent: 'executor', description: 'Task 2', files: [] },
        { id: 'task-3', agent: 'executor', description: 'Task 3', files: [] }
      ];

      const results = await orchestrator.coordinateParallel(tasks, 2);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should respect max parallelism', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        agent: 'executor',
        description: `Task ${i}`,
        files: []
      }));

      // Track concurrent executions
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const originalSpawn = orchestrator.spawnAgent.bind(orchestrator);
      orchestrator.spawnAgent = async (agentType, task) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        const result = await originalSpawn(agentType, task);

        currentConcurrent--;
        return result;
      };

      await orchestrator.coordinateParallel(tasks, 2);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('Caching and Persistence', () => {
    it('should cache ownership data', async () => {
      const owner1 = await orchestrator.getOwner('/src/file1.ts');
      const owner2 = await orchestrator.getOwner('/src/file1.ts');

      expect(owner1).toBe(owner2);
      expect(github.getIssue).toHaveBeenCalledTimes(1); // Only called once due to cache
    });

    it('should expire cache after TTL', async () => {
      await orchestrator.getOwner('/src/file1.ts');

      // Wait for cache expiry
      await new Promise(resolve => setTimeout(resolve, 31000));

      await orchestrator.getOwner('/src/file1.ts');

      expect(github.getIssue).toHaveBeenCalledTimes(2);
    });

    it('should batch persistence operations', async () => {
      await orchestrator.claimFile('agent-3', '/src/file3.ts');
      await orchestrator.claimFile('agent-3', '/src/file4.ts');
      await orchestrator.claimFile('agent-3', '/src/file5.ts');

      // Wait for batch persistence
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(github.updateIssue).toHaveBeenCalled();
    });

    it('should force immediate persistence', async () => {
      await orchestrator.claimFile('agent-3', '/src/file3.ts');
      await orchestrator.forcePersistence();

      expect(github.updateIssue).toHaveBeenCalled();
    });
  });

  describe('Statistics and State', () => {
    it('should get ownership statistics', async () => {
      const stats = await orchestrator.getOwnershipStats();

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.agentCounts).toBeDefined();
      expect(typeof stats.pendingChanges).toBe('number');
    });

    it('should get active agents', async () => {
      const task = {
        id: 'task-1',
        agent: 'executor',
        description: 'Test task',
        files: []
      };

      // Start a task (it will complete quickly)
      orchestrator.spawnAgent('executor', task);

      const active = orchestrator.getActiveAgents();
      expect(Array.isArray(active)).toBe(true);
    });

    it('should get ownership state', async () => {
      const state = await orchestrator.getOwnershipState();

      expect(typeof state).toBe('object');
      expect(state['/src/file1.ts']).toBe('agent-1');
    });
  });

  describe('Utilities', () => {
    it('should reset ownership', async () => {
      await orchestrator.resetOwnership();

      const stats = await orchestrator.getOwnershipStats();
      expect(stats.totalFiles).toBe(0);
    });

    it('should cleanup resources', async () => {
      await orchestrator.cleanup();

      // Should not throw error
      await orchestrator.cleanup();
    });
  });

  describe('Performance', () => {
    it('should claim file in under 100ms', async () => {
      const start = Date.now();
      await orchestrator.claimFile('agent-3', '/src/fast.ts');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should release file in under 100ms', async () => {
      const start = Date.now();
      await orchestrator.releaseFile('agent-1', '/src/file1.ts');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should get owner in under 100ms', async () => {
      const start = Date.now();
      await orchestrator.getOwner('/src/file1.ts');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle claim failures gracefully', async () => {
      vi.spyOn(orchestrator as any, 'loadOwnershipFromGitHub').mockRejectedValueOnce(new Error('Network error'));

      const result = await orchestrator.claimFile('agent-3', '/src/error.ts');
      expect(result).toBe(false);
    });

    it('should handle release failures gracefully', async () => {
      vi.spyOn(orchestrator as any, 'loadOwnershipFromGitHub').mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await orchestrator.releaseFile('agent-1', '/src/file1.ts');
    });

    it('should retry failed agent spawns', async () => {
      const task = {
        id: 'task-fail',
        agent: 'executor',
        description: 'Failing task',
        files: []
      };

      // Mock spawn to fail twice then succeed
      let attempts = 0;
      vi.spyOn(orchestrator as any, 'executeAgentWork').mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'Success';
      });

      const result = await orchestrator.spawnAgent('executor', task);

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const task = {
        id: 'task-fail',
        agent: 'executor',
        description: 'Failing task',
        files: []
      };

      vi.spyOn(orchestrator as any, 'executeAgentWork').mockRejectedValue(new Error('Permanent failure'));

      const result = await orchestrator.spawnAgent('executor', task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permanent failure');
    });
  });
});
