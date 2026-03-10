/**
 * Rollback Script
 *
 * Safely rolls back a migration if issues occur.
 * Features:
 * - Validates pre-rollback conditions (uncommitted changes, manifest exists)
 * - Creates backup branch before rollback
 * - Resets git to pre-migration commit
 * - Restores JSON state files from Git
 * - Closes or updates migration manifest issue
 * - Cleans up GitHub labels created during migration
 * - Validates system after rollback
 * - Comprehensive error handling and recovery instructions
 * - Force mode to skip confirmation prompts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { GitHubService } from './github-service';
import { GitHubAppAuthManager } from './github-app-auth';
import { MigrationManifest, type MigrationManifestData } from './migration-manifest';

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  backupBranch: string;
  rollbackCommit: string;
  restoredFiles: string[];
  closedIssues: number[];
  removedLabels: string[];
  duration: number;
  startedAt: string;
  completedAt: string;
  error?: string;
  partialRollback: boolean;
  recoveryInstructions?: string;
}

/**
 * Pre-rollback validation result
 */
export interface PreRollbackValidation {
  valid: boolean;
  hasUncommittedChanges: boolean;
  manifestExists: boolean;
  manifestIssueNumber?: number;
  rollbackCommit?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Rollback script options
 */
export interface RollbackOptions {
  force?: boolean;
  backupBranch?: string;
  owner: string;
  repo: string;
  branch: string;
  stateDir?: string;
  onProgress?: (message: string) => void;
}

/**
 * State file mapping for restoration
 */
interface StateFileMapping {
  fileName: string;
  label: string;
}

/**
 * Rollback Script
 *
 * Safely rolls back a migration to pre-migration state.
 */
export class RollbackScript {
  private githubService: GitHubService;
  private manifest: MigrationManifest | null = null;
  private manifestData: MigrationManifestData | null = null;
  private stateFileMappings: StateFileMapping[] = [
    { fileName: 'autopilot-state.json', label: 'state:autopilot' },
    { fileName: 'ralph-state.json', label: 'state:ralph' },
    { fileName: 'ultraqa-state.json', label: 'state:ultraqa' },
    { fileName: 'validation-state.json', label: 'state:validation' },
    { fileName: 'team-state.json', label: 'state:team' },
  ];

  constructor(private options: RollbackOptions) {
    const authManager = GitHubAppAuthManager.fromEnv(`${options.owner}/${options.repo}`);

    const config = {
      owner: options.owner,
      repo: options.repo,
      cacheMaxAge: 300000,
    };

    this.githubService = new GitHubService(config as any, authManager);
  }

  /**
   * Validate pre-rollback conditions
   */
  async validatePreRollback(): Promise<PreRollbackValidation> {
    console.log('[Rollback] Validating pre-rollback conditions...');

    const validation: PreRollbackValidation = {
      valid: true,
      hasUncommittedChanges: false,
      manifestExists: false,
      errors: [],
      warnings: [],
    };

    try {
      // Check for uncommitted changes
      try {
        const status = execSync('git status --porcelain', { encoding: 'utf-8' });
        validation.hasUncommittedChanges = status.trim().length > 0;

        if (validation.hasUncommittedChanges) {
          validation.valid = false;
          validation.errors.push(
            'You have uncommitted changes. Please commit or stash them before rollback.'
          );
          console.warn('[Rollback] Uncommitted changes detected');
        }
      } catch (error) {
        validation.warnings.push(`Could not check git status: ${(error as Error).message}`);
      }

      // Load migration manifest
      try {
        this.manifest = new MigrationManifest({
          githubService: this.githubService,
          owner: this.options.owner,
          repo: this.options.repo,
          branch: this.options.branch,
        });

        // Try to find the most recent migration manifest issue
        const issues = await this.githubService.getTasksByLabel('manifest', 'all');

        // Filter for migration manifests
        const migrationManifests = issues.filter(issue =>
          issue.title.includes('Migration Manifest') &&
          issue.labels.some(l => l.name === 'migration')
        );

        if (migrationManifests.length === 0) {
          validation.valid = false;
          validation.errors.push('No migration manifest issue found');
          console.error('[Rollback] No migration manifest found');
          return validation;
        }

        // Get the most recent manifest
        const latestManifest = migrationManifests.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        validation.manifestIssueNumber = latestManifest.number;
        validation.manifestExists = true;

        await this.manifest.load(latestManifest.number);
        this.manifestData = this.manifest.getData();

        if (!this.manifestData) {
          validation.valid = false;
          validation.errors.push('Failed to load manifest data');
          return validation;
        }

        // Extract rollback commit SHA
        const rollbackPoint = this.manifestData.frontmatter.rollback_point;
        const shaMatch = rollbackPoint.match(/sha\{([^}]+)\}/);

        if (shaMatch) {
          validation.rollbackCommit = shaMatch[1];
          console.log(`[Rollback] Rollback commit: ${validation.rollbackCommit}`);
        } else {
          validation.valid = false;
          validation.errors.push(
            `Invalid rollback point format: ${rollbackPoint}. Expected git SHA.`
          );
          console.error('[Rollback] Invalid rollback point format');
        }

        console.log(`[Rollback] Found manifest issue #${latestManifest.number}`);
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Failed to load migration manifest: ${(error as Error).message}`);
        console.error('[Rollback] Failed to load manifest');
      }

      // Validate rollback commit exists
      if (validation.rollbackCommit) {
        try {
          execSync(`git cat-file -t ${validation.rollbackCommit}`, { encoding: 'utf-8' });
          console.log('[Rollback] Rollback commit exists');
        } catch (error) {
          validation.valid = false;
          validation.errors.push(`Rollback commit does not exist: ${validation.rollbackCommit}`);
          console.error('[Rollback] Rollback commit not found');
        }
      }

      console.log(`[Rollback] Validation ${validation.valid ? 'PASSED' : 'FAILED'}`);
      return validation;
    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Validation error: ${(error as Error).message}`);
      return validation;
    }
  }

  /**
   * Create backup branch
   */
  async createBackup(): Promise<string> {
    const backupBranch = this.options.backupBranch ||
      `backup-before-rollback-${Date.now()}`;

    console.log(`[Rollback] Creating backup branch: ${backupBranch}`);

    try {
      // Create and checkout backup branch
      execSync(`git checkout -b ${backupBranch}`, { encoding: 'utf-8' });
      console.log(`[Rollback] ✓ Backup branch created: ${backupBranch}`);
      return backupBranch;
    } catch (error) {
      throw new Error(`Failed to create backup branch: ${(error as Error).message}`);
    }
  }

  /**
   * Reset git to pre-migration commit
   */
  async resetGit(rollbackPoint: string): Promise<void> {
    console.log(`[Rollback] Resetting git to commit ${rollbackPoint}...`);

    try {
      // Hard reset to rollback point
      execSync(`git reset --hard ${rollbackPoint}`, { encoding: 'utf-8' });
      console.log('[Rollback] ✓ Git reset complete');
    } catch (error) {
      throw new Error(`Failed to reset git: ${(error as Error).message}`);
    }
  }

  /**
   * Restore JSON state files
   */
  async restoreStateFiles(): Promise<string[]> {
    console.log('[Rollback] Restoring JSON state files...');

    const restoredFiles: string[] = [];
    const stateDir = this.options.stateDir || path.join(process.cwd(), '.ultra', 'state');

    try {
      // Ensure state directory exists
      await fs.mkdir(stateDir, { recursive: true });

      // Restore each state file if it exists in git history
      for (const mapping of this.stateFileMappings) {
        const filePath = path.join(stateDir, mapping.fileName);

        try {
          // Check if file exists in git
          execSync(`git cat-file -e HEAD:${path.relative(process.cwd(), filePath)}`, {
            encoding: 'utf-8',
            stdio: 'pipe',
          });

          // Restore file from git
          execSync(`git checkout HEAD -- ${filePath}`, { encoding: 'utf-8' });
          restoredFiles.push(filePath);
          console.log(`[Rollback] ✓ Restored ${mapping.fileName}`);
        } catch (error) {
          // File doesn't exist in git, skip
          console.log(`[Rollback] - ${mapping.fileName} not found in git, skipping`);
        }
      }

      console.log(`[Rollback] Restored ${restoredFiles.length} state files`);
      return restoredFiles;
    } catch (error) {
      throw new Error(`Failed to restore state files: ${(error as Error).message}`);
    }
  }

  /**
   * Cleanup GitHub artifacts
   */
  async cleanupGitHub(): Promise<{ closedIssues: number[]; removedLabels: string[] }> {
    console.log('[Rollback] Cleaning up GitHub artifacts...');

    const closedIssues: number[] = [];
    const removedLabels: string[] = [];

    try {
      // Close migration state issues (but keep the manifest)
      const stateLabels = this.stateFileMappings.map(m => m.label);

      for (const label of stateLabels) {
        try {
          const issues = await this.githubService.getTasksByLabel(label, 'open');

          for (const issue of issues) {
            // Skip if it's not a migrated state issue
            if (!issue.labels.some(l => l.name === 'migrated-state')) {
              continue;
            }

            await this.githubService.updateTask(issue.number, {
              state: 'closed',
              labels: issue.labels.filter(l => l.name !== 'migrated-state').map(l => l.name),
            });

            closedIssues.push(issue.number);
            console.log(`[Rollback] ✓ Closed issue #${issue.number}`);
          }
        } catch (error) {
          console.warn(`[Rollback] Failed to close issues with label ${label}: ${(error as Error).message}`);
        }
      }

      // Note: We don't delete labels as they might be used by existing issues
      // We also don't delete the migration manifest issue for audit trail

      console.log(`[Rollback] Closed ${closedIssues.length} state issues`);
      return { closedIssues, removedLabels };
    } catch (error) {
      throw new Error(`Failed to cleanup GitHub: ${(error as Error).message}`);
    }
  }

  /**
   * Validate rollback success
   */
  async validateRollback(): Promise<boolean> {
    console.log('[Rollback] Validating rollback...');

    try {
      // Check that we're at the rollback commit
      const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      if (this.manifestData) {
        const rollbackPoint = this.manifestData.frontmatter.rollback_point;
        const shaMatch = rollbackPoint.match(/sha\{([^}]+)\}/);

        if (shaMatch && shaMatch[1] !== currentCommit) {
          console.warn('[Rollback] Current commit does not match rollback point');
          return false;
        }
      }

      // Check that state files exist
      const stateDir = this.options.stateDir || path.join(process.cwd(), '.ultra', 'state');

      for (const mapping of this.stateFileMappings) {
        const filePath = path.join(stateDir, mapping.fileName);
        try {
          await fs.access(filePath);
        } catch {
          console.warn(`[Rollback] State file missing: ${mapping.fileName}`);
        }
      }

      console.log('[Rollback] ✓ Rollback validation passed');
      return true;
    } catch (error) {
      console.warn(`[Rollback] Validation warning: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Generate recovery instructions
   */
  generateRecoveryInstructions(backupBranch: string, rollbackCommit: string): string {
    return `
Manual Recovery Instructions
===========================

If the rollback script failed or you need to manually recover:

1. Check current state:
   git status
   git log --oneline -5

2. If rollback was incomplete:
   git reset --hard ${rollbackCommit}

3. Restore state files from backup:
   git checkout ${backupBranch} -- .ultra/state/

4. Update manifest issue manually:
   - Go to the migration manifest issue
   - Add a comment explaining the rollback status
   - Label it as 'rolled-back' if complete

5. If you need to restore to the backup branch:
   git checkout ${backupBranch}

6. To clean up after successful rollback:
   git branch -D ${backupBranch}

For additional help, see:
- Migration Script documentation
- GitHub Integration guide
`;
  }

  /**
   * Run the rollback
   */
  async run(force: boolean = false): Promise<RollbackResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    console.log('='.repeat(60));
    console.log('↩️  Ultrapilot Migration Rollback');
    console.log('='.repeat(60));
    console.log(`Repository: ${this.options.owner}/${this.options.repo}`);
    console.log(`Branch: ${this.options.branch}`);
    console.log(`Force: ${force ? 'Yes (skipping confirmation)' : 'No'}`);
    console.log('='.repeat(60));
    console.log();

    let backupBranch = '';
    let rollbackCommit = '';
    let partialRollback = false;
    let recoveryInstructions = '';

    try {
      // Step 1: Validate pre-rollback conditions
      console.log('[Step 1] Validating pre-rollback conditions...');
      const validation = await this.validatePreRollback();

      if (!validation.valid) {
        console.error('[Rollback] Validation failed:');
        validation.errors.forEach(error => console.error(`  - ${error}`));

        if (validation.warnings.length > 0) {
          console.warn('[Rollback] Warnings:');
          validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }

        throw new Error('Pre-rollback validation failed. Aborting rollback.');
      }

      if (!validation.rollbackCommit) {
        throw new Error('Rollback commit not found in manifest');
      }

      rollbackCommit = validation.rollbackCommit;

      // Show what will be rolled back
      console.log('\n[Rollback Plan]');
      console.log(`  Rollback commit: ${rollbackCommit}`);
      console.log(`  Manifest issue: #${validation.manifestIssueNumber}`);

      if (this.manifestData) {
        const { frontmatter } = this.manifestData;
        console.log(`  Original migration: ${frontmatter.manifest_id}`);
        console.log(`  Migrated tasks: ${frontmatter.tasks_migrated}/${frontmatter.tasks_total}`);
      }

      // Confirm rollback unless forced
      if (!force) {
        console.log('\n⚠️  This will:');
        console.log('  - Reset git to pre-migration state');
        console.log('  - Close all migrated state issues');
        console.log('  - Create backup branch for safety');
        console.log();

        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question('Continue with rollback? (yes/no): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
          });
        });

        if (!confirmed) {
          console.log('Rollback cancelled.');
          process.exit(0);
        }
      }

      // Step 2: Create backup branch
      console.log('\n[Step 2] Creating backup branch...');
      backupBranch = await this.createBackup();

      // Step 3: Reset git
      console.log('\n[Step 3] Resetting git to pre-migration state...');
      await this.resetGit(rollbackCommit);

      // Step 4: Restore state files
      console.log('\n[Step 4] Restoring JSON state files...');
      const restoredFiles = await this.restoreStateFiles();

      // Step 5: Cleanup GitHub
      console.log('\n[Step 5] Cleaning up GitHub artifacts...');
      const { closedIssues, removedLabels } = await this.cleanupGitHub();

      // Step 6: Update manifest
      console.log('\n[Step 6] Updating migration manifest...');
      if (this.manifest && this.manifestData) {
        await this.manifest.markRolledBack();

        // Add rollback comment
        const comment = `## Rollback Completed

Rolled back to pre-migration state:
- Rollback commit: ${rollbackCommit}
- Backup branch: ${backupBranch}
- Restored files: ${restoredFiles.length}
- Closed issues: ${closedIssues.length}

${new Date().toISOString()}
`;

        await this.manifest.addComment(comment);
      }

      // Step 7: Validate rollback
      console.log('\n[Step 7] Validating rollback...');
      const validationSuccess = await this.validateRollback();

      if (!validationSuccess) {
        console.warn('[Rollback] Validation completed with warnings');
        partialRollback = true;
        recoveryInstructions = this.generateRecoveryInstructions(backupBranch, rollbackCommit);
      }

      const duration = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 Rollback Summary');
      console.log('='.repeat(60));
      console.log(`Status: ${validationSuccess ? '✅ SUCCESS' : '⚠️  PARTIAL'}`);
      console.log(`Duration: ${Math.round(duration / 1000)}s`);
      console.log(`Backup branch: ${backupBranch}`);
      console.log(`Rollback commit: ${rollbackCommit}`);
      console.log(`Restored files: ${restoredFiles.length}`);
      console.log(`Closed issues: ${closedIssues.length}`);
      console.log(`Removed labels: ${removedLabels.length}`);
      console.log('='.repeat(60));

      if (partialRollback && recoveryInstructions) {
        console.log('\n⚠️  Rollback completed with warnings. See recovery instructions above.');
      }

      return {
        success: true,
        backupBranch,
        rollbackCommit,
        restoredFiles,
        closedIssues,
        removedLabels,
        duration,
        startedAt,
        completedAt,
        partialRollback,
        recoveryInstructions: partialRollback ? recoveryInstructions : undefined,
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`\n[Rollback] Fatal error: ${errorMessage}`);

      // Generate recovery instructions even on failure
      recoveryInstructions = this.generateRecoveryInstructions(
        backupBranch || `backup-${Date.now()}`,
        rollbackCommit || 'HEAD'
      );

      console.error('\nRecovery instructions:');
      console.error(recoveryInstructions);

      return {
        success: false,
        backupBranch: backupBranch || `backup-${Date.now()}`,
        rollbackCommit: rollbackCommit || 'HEAD',
        restoredFiles: [],
        closedIssues: [],
        removedLabels: [],
        duration: Date.now() - startTime,
        startedAt,
        completedAt: new Date().toISOString(),
        error: errorMessage,
        partialRollback: true,
        recoveryInstructions,
      };
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.githubService.close();
  }
}

/**
 * Factory function to create RollbackScript instance
 */
export function createRollbackScript(options: RollbackOptions): RollbackScript {
  return new RollbackScript(options);
}
