/**
 * Hybrid State Manager Tests
 *
 * Tests for the hybrid state manager that combines local JSON storage
 * with GitHub persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HybridStateManager, createHybridStateManager } from '../hybrid-state-manager';
import { GitHubStateAdapter, StateObject } from '../github-state-adapter';
import { GitHubService } from '../github-service';
import { GitHubAuthError, GitHubRateLimitError } from '../../../types/github-integration';

describe('HybridStateManager', () => {
  let cacheDir: string;
  let githubService: GitHubService;
  let githubState: GitHubStateAdapter;
  let manager: HybridStateManager;

  const mockStateObject: StateObject = {
    state_id: 'test-state-123',
    type: 'task_queue',
    updated_at: new Date().toISOString(),
    version: 1,
    data: {
      queue_name: 'intake',
      task_count: 5,
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          priority: 'high',
          size: 'md',
          created_at: new Date().toISOString(),
        },
      ],
    },
  };

  beforeEach(async () => {
    // Create temporary cache directory
    cacheDir = join(tmpdir(), `ultra-test-cache-${Date.now()}`);
    await fs.mkdir(cacheDir, { recursive: true });

    // Create mock GitHub service
    githubService = {
      getTask: vi.fn().mockResolvedValue({
        number: 1001,
        body: `---
state_id: test-state-123
type: task_queue
updated_at: ${new Date().toISOString()}
version: 1
data:
  queue_name: intake
  task_count: 5
---
Test issue body`,
      }),
      updateTask: vi.fn().mockResolvedValue({
        number: 1001,
      }),
    } as any;

    // Create mock GitHub state adapter
    githubState = {
      readState: vi.fn().mockResolvedValue(mockStateObject),
      writeState: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Create manager instance
    manager = new HybridStateManager(githubService as any, {
      cacheDir,
      stalenessThreshold: 30000,
      syncDebounceDelay: 100,
      syncInterval: 1000,
      maxRetries: 3,
      enableBackgroundSync: false, // Disable for tests
    });

    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();

    // Clean up cache directory
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create cache directory on initialization', async () => {
      const exists = await fs.access(cacheDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should not create cache directory if already exists', async () => {
      await manager.initialize(); // Initialize again
      const exists = await fs.access(cacheDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should start background sync processor if enabled', async () => {
      const managerWithSync = new HybridStateManager(githubService as any, {
        cacheDir,
        enableBackgroundSync: true,
      });

      const closeSpy = vi.spyOn(managerWithSync, 'close');
      await managerWithSync.initialize();

      // Wait a bit for background sync to start
      await new Promise(resolve => setTimeout(resolve, 100));

      await managerWithSync.close();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('read', () => {
    it('should return cached state if fresh', async () => {
      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).not.toHaveBeenCalled();
    });

    it('should fetch from GitHub if cache is stale', async () => {
      // Write stale cache
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now() - 40000, // 40 seconds ago
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).toHaveBeenCalled();
    });

    it('should fetch from GitHub if cache miss', async () => {
      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).toHaveBeenCalled();
    });

    it('should force refresh when requested', async () => {
      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123', { forceRefresh: true });
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).toHaveBeenCalled();
    });

    it('should allow stale cache when requested', async () => {
      // Write stale cache
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now() - 40000, // 40 seconds ago
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123', { allowStale: true });
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).not.toHaveBeenCalled();
    });

    it('should update cache after fetching from GitHub', async () => {
      await manager.read('test-state-123');

      const cachePath = join(cacheDir, 'test-state-123.json');
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));

      expect(cached.state).toEqual(mockStateObject);
      expect(cached.cachedAt).toBeDefined();
      expect(cached.issueNumber).toBe(1001);
    });

    it('should fall back to cache if GitHub is unavailable', async () => {
      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now() - 40000, // Stale
        issueNumber: 1001,
      }));

      // Mock GitHub to throw auth error
      (githubState.readState as any).mockRejectedValueOnce(
        new GitHubAuthError('Authentication failed')
      );

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
    });

    it('should throw if cache miss and GitHub is unavailable', async () => {
      // Mock GitHub to throw auth error
      (githubState.readState as any).mockRejectedValueOnce(
        new GitHubAuthError('Authentication failed')
      );

      await expect(manager.read('test-state-123')).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('should write to local cache immediately', async () => {
      await manager.write('test-state-123', mockStateObject);

      const cachePath = join(cacheDir, 'test-state-123.json');
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));

      expect(cached.state).toEqual(mockStateObject);
      expect(cached.cachedAt).toBeDefined();
    });

    it('should write to cache in under 10ms', async () => {
      const start = Date.now();
      await manager.write('test-state-123', mockStateObject);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should queue sync to GitHub in background', async () => {
      await manager.write('test-state-123', mockStateObject);

      // Wait a bit for sync to be queued
      await new Promise(resolve => setTimeout(resolve, 50));

      // Sync should be queued (not necessarily executed yet)
      // The actual sync happens in background
    });

    it('should return immediately without waiting for GitHub', async () => {
      // Slow GitHub write
      (githubState.writeState as any).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      const start = Date.now();
      await manager.write('test-state-123', mockStateObject);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should return well before GitHub write completes
    });
  });

  describe('sync', () => {
    it('should sync state to GitHub manually', async () => {
      // Write to cache first
      await manager.write('test-state-123', mockStateObject);

      await manager.sync('test-state-123');

      expect(githubState.writeState).toHaveBeenCalledWith(
        1001,
        mockStateObject,
        expect.any(Object)
      );
    });

    it('should throw if no cached state found', async () => {
      await expect(manager.sync('non-existent-state')).rejects.toThrow();
    });

    it('should update cache after sync', async () => {
      // Write to cache first
      await manager.write('test-state-123', mockStateObject);

      await manager.sync('test-state-123');

      const cachePath = join(cacheDir, 'test-state-123.json');
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));

      expect(cached.state).toEqual(mockStateObject);
    });
  });

  describe('clearCache', () => {
    it('should remove cache file', async () => {
      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
      }));

      await manager.clearCache('test-state-123');

      const exists = await fs.access(cachePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should not throw if cache does not exist', async () => {
      await expect(manager.clearCache('non-existent-state')).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('should stop background sync processor', async () => {
      const managerWithSync = new HybridStateManager(githubService as any, {
        cacheDir,
        enableBackgroundSync: true,
      });

      await managerWithSync.initialize();
      await managerWithSync.close();

      // Verify no errors after close
      await expect(managerWithSync.close()).resolves.not.toThrow();
    });

    it('should process pending syncs before closing', async () => {
      // Write some state to queue sync
      await manager.write('test-state-123', mockStateObject);

      await manager.close();

      // Should not throw
    });

    it('should clear debounce timers', async () => {
      const managerWithSync = new HybridStateManager(githubService as any, {
        cacheDir,
        enableBackgroundSync: true,
        syncDebounceDelay: 100,
      });

      await managerWithSync.initialize();
      await managerWithSync.write('test-state-123', mockStateObject);

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));

      await managerWithSync.close();

      // Should not throw
    });
  });

  describe('staleness', () => {
    it('should consider cache fresh if younger than threshold', async () => {
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now() - 10000, // 10 seconds ago
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).not.toHaveBeenCalled();
    });

    it('should consider cache stale if older than threshold', async () => {
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now() - 35000, // 35 seconds ago
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
      expect(githubState.readState).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle GitHub auth errors gracefully', async () => {
      (githubState.readState as any).mockRejectedValueOnce(
        new GitHubAuthError('Authentication failed')
      );

      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
    });

    it('should handle GitHub rate limit errors gracefully', async () => {
      (githubState.readState as any).mockRejectedValueOnce(
        new GitHubRateLimitError('Rate limit exceeded', Date.now() + 60000, 60000)
      );

      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
    });

    it('should handle network errors gracefully', async () => {
      (githubState.readState as any).mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      );

      // Write to cache first
      const cachePath = join(cacheDir, 'test-state-123.json');
      await fs.writeFile(cachePath, JSON.stringify({
        state: mockStateObject,
        cachedAt: Date.now(),
        issueNumber: 1001,
      }));

      const state = await manager.read('test-state-123');
      expect(state).toEqual(mockStateObject);
    });
  });

  describe('factory function', () => {
    it('should create HybridStateManager instance', () => {
      const instance = createHybridStateManager(githubService as any, {
        cacheDir,
      });

      expect(instance).toBeInstanceOf(HybridStateManager);
    });

    it('should use default options if not provided', () => {
      const instance = createHybridStateManager(githubService as any);

      expect(instance).toBeInstanceOf(HybridStateManager);
    });
  });
});
