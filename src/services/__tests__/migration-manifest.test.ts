/**
 * Migration Manifest Tests
 *
 * Tests for MigrationManifest including:
 * - Manifest creation with YAML frontmatter
 * - Progress tracking
 * - Phase management
 * - Checksum calculation
 * - Rollback functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MigrationManifest } from '../migration-manifest';
import { GitHubService } from '../github-service';
import type { GitHubServiceConfig } from '../../../../types/github-integration';

// Mock child_process at the top level
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('MigrationManifest', () => {
  let manifest: MigrationManifest;
  let mockGitHubService: GitHubService;
  let config: any;

  beforeEach(() => {
    // Mock GitHubService
    mockGitHubService = {
      createTask: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Migration',
        body: '',
        labels: [],
      }),
      updateTask: vi.fn().mockResolvedValue({}),
      getTask: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Migration',
        body: '---\nmanifest_id: test-123\n---',
        labels: [],
      }),
      createComment: vi.fn().mockResolvedValue({}),
    } as unknown as GitHubService;

    config = {
      githubService: mockGitHubService,
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    };

    manifest = new MigrationManifest(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Manifest Creation', () => {
    beforeEach(async () => {
      // Setup mock for execSync to return valid SHA
      const { execSync } = await import('child_process');
      (execSync as any).mockReturnValue('abc123def456');
    });

    it('should create a manifest with YAML frontmatter', async () => {
      const issueNumber = await manifest.create(50);

      expect(issueNumber).toBe(123);
      expect(mockGitHubService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Migration Manifest'),
          labels: ['migration', 'manifest', 'in-progress'],
        })
      );
    });

    it('should include all required frontmatter fields', async () => {
      await manifest.create(50);
      const data = manifest.getData();

      expect(data?.frontmatter).toMatchObject({
        manifest_id: expect.stringContaining('migration-'),
        type: 'migration_manifest',
        status: 'in_progress',
        tasks_migrated: 0,
        tasks_total: 50,
        rollback_point: expect.stringContaining('main@sha{'),
      });
    });

    it('should create default phases if none provided', async () => {
      await manifest.create(50);
      const data = manifest.getData();

      expect(data?.phases).toHaveLength(3);
      expect(data?.phases[0].name).toBe('Phase 1: Discovery');
      expect(data?.phases[1].name).toBe('Phase 2: Migration');
      expect(data?.phases[2].name).toBe('Phase 3: Verification');
    });

    it('should use custom phases if provided', async () => {
      const customPhases = [
        { name: 'Custom Phase 1', status: 'pending' as const },
        { name: 'Custom Phase 2', status: 'pending' as const },
      ];

      await manifest.create(30, customPhases);
      const data = manifest.getData();

      expect(data?.phases).toHaveLength(2);
      expect(data?.phases[0].name).toBe('Custom Phase 1');
    });
  });

  describe('Progress Tracking', () => {
    beforeEach(async () => {
      await manifest.create(100);
      vi.clearAllMocks();
    });

    it('should update progress correctly', async () => {
      await manifest.updateProgress(45, 100);

      const data = manifest.getData();
      expect(data?.frontmatter.tasks_migrated).toBe(45);
      expect(data?.frontmatter.tasks_total).toBe(100);
      expect(mockGitHubService.updateTask).toHaveBeenCalled();
    });

    it('should mark as in_progress when partially complete', async () => {
      await manifest.updateProgress(50, 100);

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('in_progress');
    });

    it('should mark as completed when all tasks done', async () => {
      await manifest.updateProgress(100, 100);

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('completed');
    });

    it('should mark as pending when no tasks done', async () => {
      await manifest.updateProgress(0, 100);

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('pending');
    });

    it('should throw error if manifest not created', async () => {
      const newManifest = new MigrationManifest(config);

      await expect(newManifest.updateProgress(10, 100)).rejects.toThrow(
        'Manifest not created'
      );
    });
  });

  describe('Phase Management', () => {
    beforeEach(async () => {
      await manifest.create(100);
      vi.clearAllMocks();
    });

    it('should update phase status', async () => {
      await manifest.updatePhase('Phase 1: Discovery', 'completed');

      const data = manifest.getData();
      expect(data?.phases[0].status).toBe('completed');
    });

    it('should update phase with task count', async () => {
      await manifest.updatePhase('Phase 2: Migration', 'in_progress', 45);

      const data = manifest.getData();
      expect(data?.phases[1].status).toBe('in_progress');
      expect(data?.phases[1].tasks_count).toBe(45);
    });

    it('should throw error for unknown phase', async () => {
      await expect(
        manifest.updatePhase('Unknown Phase', 'in_progress')
      ).rejects.toThrow('Phase "Unknown Phase" not found');
    });
  });

  describe('Completion and Failure', () => {
    beforeEach(async () => {
      await manifest.create(100);
      vi.clearAllMocks();
    });

    it('should mark migration as completed', async () => {
      await manifest.complete();

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('completed');
      expect(data?.frontmatter.completed_at).not.toBeNull();
      expect(mockGitHubService.updateTask).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          state: 'closed',
          labels: ['migration', 'manifest', 'completed'],
        })
      );
    });

    it('should mark migration as failed', async () => {
      const error = new Error('Migration failed due to network error');
      await manifest.fail(error);

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('failed');
      expect(data?.frontmatter.error).toBe('Migration failed due to network error');
      expect(mockGitHubService.updateTask).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          labels: ['migration', 'manifest', 'failed'],
        })
      );
    });

    it('should mark migration as rolled back', async () => {
      await manifest.markRolledBack();

      const data = manifest.getData();
      expect(data?.frontmatter.status).toBe('rolled_back');
      expect(data?.frontmatter.completed_at).not.toBeNull();
      expect(mockGitHubService.updateTask).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          labels: ['migration', 'manifest', 'rolled-back'],
        })
      );
    });
  });

  describe('Checksum Calculation', () => {
    it('should calculate checksum from task IDs', () => {
      const tasks = [
        { id: 'task-3', title: 'Task 3' },
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ];

      const checksum = manifest.calculateChecksum(tasks);

      expect(checksum).toMatch(/^[a-f0-9]{12}$/);
      expect(checksum).toHaveLength(12);
    });

    it('should produce consistent checksum for same tasks', () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ];

      const checksum1 = manifest.calculateChecksum(tasks);
      const checksum2 = manifest.calculateChecksum(tasks);

      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksum for different tasks', () => {
      const tasks1 = [{ id: 'task-1', title: 'Task 1' }];
      const tasks2 = [{ id: 'task-2', title: 'Task 2' }];

      const checksum1 = manifest.calculateChecksum(tasks1);
      const checksum2 = manifest.calculateChecksum(tasks2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty task list', () => {
      const checksum = manifest.calculateChecksum([]);
      expect(checksum).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  describe('Task Validation', () => {
    beforeEach(async () => {
      await manifest.create(100);
    });

    it('should validate tasks against checksum', async () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ];

      // Update manifest with these tasks' checksum
      const expectedChecksum = manifest.calculateChecksum(tasks);
      manifest.getData()!.frontmatter.checksum = expectedChecksum;

      const isValid = await manifest.validateTasks(tasks);
      expect(isValid).toBe(true);
    });

    it('should reject tasks with different checksum', async () => {
      const tasks1 = [{ id: 'task-1', title: 'Task 1' }];
      const tasks2 = [{ id: 'task-2', title: 'Task 2' }];

      // Set checksum for tasks1
      const expectedChecksum = manifest.calculateChecksum(tasks1);
      manifest.getData()!.frontmatter.checksum = expectedChecksum;

      // Validate with tasks2
      const isValid = await manifest.validateTasks(tasks2);
      expect(isValid).toBe(false);
    });
  });

  describe('Rollback Point', () => {
    it('should get current git commit SHA', async () => {
      const { execSync } = await import('child_process');
      (execSync as any).mockReturnValue('abc123def456');

      const rollbackPoint = await manifest.getRollbackPoint();

      expect(rollbackPoint).toMatch(/^main@sha\{[a-f0-9]+\}$/);
    });

    it('should handle git command failure gracefully', async () => {
      const { execSync } = await import('child_process');
      (execSync as any).mockImplementation(() => {
        throw new Error('Git not found');
      });

      const rollbackPoint = await manifest.getRollbackPoint();
      expect(rollbackPoint).toContain('main@');
    });
  });

  describe('Rollback Functionality', () => {
    beforeEach(async () => {
      // Mock execSync to return a valid SHA before creating manifest
      const { execSync } = await import('child_process');
      (execSync as any).mockReturnValue('abc123def456');

      await manifest.create(100);
    });

    it('should rollback to previous commit', async () => {
      const { execSync } = await import('child_process');
      const mockExecSync = execSync as any;

      await manifest.rollback();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git reset --hard'),
        expect.any(Object)
      );
    });

    it('should throw error if manifest not created', async () => {
      const newManifest = new MigrationManifest(config);

      await expect(newManifest.rollback()).rejects.toThrow(
        'Manifest not created'
      );
    });

    it('should throw error for invalid rollback point format', async () => {
      await manifest.create(100);
      manifest.getData()!.frontmatter.rollback_point = 'invalid-format';

      await expect(manifest.rollback()).rejects.toThrow(
        /rollback point does not contain git SHA/i
      );
    });
  });

  describe('Loading Existing Manifest', () => {
    it('should load manifest from GitHub issue', async () => {
      const mockIssue = {
        number: 456,
        title: 'Existing Migration',
        body: `---
manifest_id: migration-2026-03-04
type: migration_manifest
status: in_progress
started_at: 2026-03-04T10:00:00Z
completed_at: null
tasks_migrated: 25
tasks_total: 50
checksum: abc123def456
rollback_point: main@sha{abc123}
---
# Migration Progress

- Phase 1: Discovery ✅
- Phase 2: Migration 🔄
- Phase 3: Verification ⏳
`,
        labels: [],
      };

      mockGitHubService.getTask = vi.fn().mockResolvedValue(mockIssue);

      await manifest.load(456);

      expect(manifest.getIssueNumber()).toBe(456);
      const data = manifest.getData();
      expect(data?.frontmatter.manifest_id).toBe('migration-2026-03-04');
      expect(data?.frontmatter.tasks_migrated).toBe(25);
      expect(data?.phases).toHaveLength(3);
    });

    it('should throw error for invalid manifest format', async () => {
      mockGitHubService.getTask = vi.fn().mockResolvedValue({
        number: 456,
        title: 'Invalid Manifest',
        body: 'No frontmatter here',
        labels: [],
      });

      await expect(manifest.load(456)).rejects.toThrow(
        'Invalid manifest format'
      );
    });
  });

  describe('Comments', () => {
    beforeEach(async () => {
      await manifest.create(100);
      vi.clearAllMocks();
    });

    it('should add comment to manifest issue', async () => {
      await manifest.addComment('Test comment');

      expect(mockGitHubService.createComment).toHaveBeenCalledWith(
        123,
        { body: 'Test comment' }
      );
    });

    it('should throw error if manifest not created', async () => {
      const newManifest = new MigrationManifest(config);

      await expect(newManifest.addComment('Test')).rejects.toThrow(
        'Manifest not created'
      );
    });
  });

  describe('YAML Frontmatter Formatting', () => {
    it('should format manifest body correctly', async () => {
      await manifest.create(50);
      const data = manifest.getData();

      // Check that frontmatter is properly formatted
      expect(data?.frontmatter.type).toBe('migration_manifest');
      expect(data?.frontmatter.manifest_id).toContain('migration-');
    });

    it('should include statistics in formatted body', async () => {
      await manifest.create(100);
      await manifest.updateProgress(75, 100);

      const updateCalls = (mockGitHubService.updateTask as any).mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];
      const body = lastCall[1].body;

      expect(body).toContain('75%');
      expect(body).toContain('75/100');
      expect(body).toContain('Statistics');
    });

    it('should include rollback instructions', async () => {
      await manifest.create(100);
      await manifest.updateProgress(0, 100); // Trigger an update

      const updateCalls = (mockGitHubService.updateTask as any).mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];
      const body = lastCall[1].body;

      expect(body).toContain('Rollback');
      expect(body).toContain('git reset --hard');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero total tasks', async () => {
      await manifest.create(0);

      const data = manifest.getData();
      expect(data?.frontmatter.tasks_total).toBe(0);
    });

    it('should handle very large task numbers', async () => {
      await manifest.create(1000000);

      const data = manifest.getData();
      expect(data?.frontmatter.tasks_total).toBe(1000000);
    });

    it('should handle special characters in error messages', async () => {
      await manifest.create(100);

      const error = new Error('Error: "special" \'chars\' <test>');
      await manifest.fail(error);

      const data = manifest.getData();
      expect(data?.frontmatter.error).toContain('special');
    });

    it('should handle phases with same name', async () => {
      const duplicatePhases = [
        { name: 'Same Phase', status: 'pending' as const },
        { name: 'Same Phase', status: 'pending' as const },
      ];

      await manifest.create(50, duplicatePhases);

      const data = manifest.getData();
      expect(data?.phases).toHaveLength(2);
    });
  });
});
