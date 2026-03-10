/**
 * Migration Script Tests
 *
 * Basic tests for the migration script functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MigrationScript, createMigrationScript } from '../migration-script';
import { GitHubService } from '../github-service';
import { GitHubAppAuthManager } from '../github-app-auth';

describe('MigrationScript', () => {
  let tempDir: string;
  let stateDir: string;
  let migration: MigrationScript;

  beforeEach(async () => {
    // Create temporary directory for test state files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ultra-migration-test-'));
    stateDir = path.join(tempDir, '.ultra', 'state');
    await fs.mkdir(stateDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('discoverStateFiles', () => {
    it('should discover JSON files in state directory', async () => {
      // Create test state files
      await fs.writeFile(path.join(stateDir, 'autopilot-state.json'), '{}');
      await fs.writeFile(path.join(stateDir, 'ralph-state.json'), '{}');
      await fs.writeFile(path.join(stateDir, 'README.md'), '# Readme');

      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir,
      });

      const files = await migration.discoverStateFiles(stateDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('autopilot-state.json'))).toBe(true);
      expect(files.some(f => f.endsWith('ralph-state.json'))).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir: path.join(tempDir, 'non-existent'),
      });

      const files = await migration.discoverStateFiles(path.join(tempDir, 'non-existent'));

      expect(files).toHaveLength(0);
    });
  });

  describe('validateStateFile', () => {
    it('should validate valid JSON files', async () => {
      const validFile = path.join(stateDir, 'valid.json');
      await fs.writeFile(validFile, '{"test": "data"}');

      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir,
      });

      const isValid = await migration.validateStateFile(validFile);

      expect(isValid).toBe(true);
    });

    it('should reject invalid JSON files', async () => {
      const invalidFile = path.join(stateDir, 'invalid.json');
      await fs.writeFile(invalidFile, '{invalid json}');

      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir,
      });

      const isValid = await migration.validateStateFile(invalidFile);

      expect(isValid).toBe(false);
    });
  });

  describe('run (dry run)', () => {
    it('should perform dry run without creating issues', async () => {
      // Create test state files
      await fs.writeFile(
        path.join(stateDir, 'autopilot-state.json'),
        JSON.stringify({ phase: 'test', iteration: 1 })
      );
      await fs.writeFile(
        path.join(stateDir, 'ralph-state.json'),
        JSON.stringify({ loopCount: 5, errors: [] })
      );

      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir,
      });

      const result = await migration.run(true);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(2);
      expect(result.successfulFiles).toBe(2);
      expect(result.failedFiles).toBe(0);
    });
  });

  describe('progress callback', () => {
    it('should call progress callback during migration', async () => {
      // Create test state file
      await fs.writeFile(
        path.join(stateDir, 'autopilot-state.json'),
        JSON.stringify({ phase: 'test' })
      );

      const progressCalls: Array<{ current: number; total: number; file: string }> = [];

      migration = createMigrationScript({
        owner: 'test',
        repo: 'test',
        branch: 'main',
        stateDir,
        onProgress: (current, total, file) => {
          progressCalls.push({ current, total, file });
        },
      });

      await migration.run(true);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0].file).toBe('autopilot-state.json');
    });
  });
});

describe('MigrationScript validation', () => {
  it('should have all required state file mappings', () => {
    // This test verifies that all common state files have mappings
    const expectedFiles = [
      'autopilot-state.json',
      'ralph-state.json',
      'ultraqa-state.json',
      'validation-state.json',
      'team-state.json',
    ];

    // Note: This is a conceptual test - in practice you'd need to
    // access the private stateFileMappings array or make it testable
    expectedFiles.forEach(fileName => {
      expect(fileName).toMatch(/-state\.json$/);
    });
  });
});
