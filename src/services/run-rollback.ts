#!/usr/bin/env node

/**
 * Rollback CLI
 *
 * Command-line interface for rolling back a migration.
 * Usage:
 *   npx tsx src/services/run-rollback.ts [--force] [--backup-branch=NAME]
 *
 * Options:
 *   --force: Skip confirmation prompts
 *   --backup-branch: Specify custom backup branch name
 *   --help, -h: Display help message
 */

import { createRollbackScript } from './rollback-script';
import * as readline from 'readline';

/**
 * Parse command line arguments
 */
interface CLIArgs {
  force: boolean;
  backupBranch: string | undefined;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    backupBranch: args.find(arg => arg.startsWith('--backup-branch='))?.split('=')[1],
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(`
Ultrapilot Migration Rollback CLI
=================================

Safely rolls back a migration to pre-migration state.

Usage:
  npx tsx src/services/run-rollback.ts [options]

Options:
  --force              Skip confirmation prompts
  --backup-branch=NAME Specify custom backup branch name
  --help, -h           Display this help message

Environment Variables:
  GITHUB_APP_ID              GitHub App ID (required)
  GITHUB_APP_PRIVATE_KEY     GitHub App private key (required)
  GITHUB_APP_INSTALLATION_ID GitHub App installation ID (optional)

Examples:
  # Rollback with confirmation
  npx tsx src/services/run-rollback.ts

  # Rollback without confirmation
  npx tsx src/services/run-rollback.ts --force

  # Rollback with custom backup branch
  npx tsx src/services/run-rollback.ts --backup-branch=my-backup

What it does:
  1. Validates pre-rollback conditions
  2. Creates backup branch
  3. Resets git to pre-migration commit
  4. Restores JSON state files
  5. Closes migrated state issues
  6. Updates migration manifest
  7. Validates rollback success

Safety Features:
  - Checks for uncommitted changes (aborts if found)
  - Creates backup branch before rollback
  - Confirms with user before proceeding (unless --force)
  - Provides recovery instructions if rollback fails
  - Keeps backup branch for manual recovery

For more information, see:
  - Migration Script documentation
  - GitHub Integration guide
`);
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Display help if requested
  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  // Check required environment variables
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey) {
    console.error('❌ Error: Missing required environment variables');
    console.error('');
    console.error('Required:');
    console.error('  GITHUB_APP_ID              GitHub App ID');
    console.error('  GITHUB_APP_PRIVATE_KEY     GitHub App private key');
    console.error('');
    console.error('Optional:');
    console.error('  GITHUB_APP_INSTALLATION_ID GitHub App installation ID');
    console.error('');
    console.error('Setup: See /docs/github-integration.md for configuration instructions');
    process.exit(1);
  }

  // Get repository info from environment or use defaults
  const repoPath = process.env.ULTRA_GITHUB_REPO || '';
  const [owner, repo] = repoPath.split('/');

  if (!owner || !repo) {
    console.error('❌ Error: ULTRA_GITHUB_REPO environment variable not set or invalid');
    console.error('Expected format: owner/repo (e.g., "myorg/myrepo")');
    process.exit(1);
  }

  const branch = process.env.ULTRA_GITHUB_BRANCH || 'main';

  console.log('');
  console.log('🔧 Configuration:');
  console.log(`  Repository: ${owner}/${repo}`);
  console.log(`  Branch: ${branch}`);
  console.log(`  Force: ${args.force ? 'Yes (skipping confirmation)' : 'No'}`);
  if (args.backupBranch) {
    console.log(`  Backup branch: ${args.backupBranch}`);
  }
  console.log('');

  // Confirm rollback if not forced
  if (!args.force) {
    const confirmed = await promptConfirmation(
      '⚠️  This will rollback the migration. Are you sure?'
    );

    if (!confirmed) {
      console.log('Rollback cancelled.');
      process.exit(0);
    }
  }

  // Create rollback script
  const rollback = createRollbackScript({
    force: args.force,
    backupBranch: args.backupBranch,
    owner,
    repo,
    branch,
    onProgress: (message) => {
      console.log(`  ${message}`);
    },
  });

  try {
    // Run rollback
    const result = await rollback.run(args.force);

    // Exit with appropriate code
    if (!result.success) {
      console.error('\n❌ Rollback failed!');
      if (result.error) {
        console.error(`Error: ${result.error}`);
      }

      if (result.recoveryInstructions) {
        console.error('\nRecovery instructions:');
        console.error(result.recoveryInstructions);
      }

      process.exit(1);
    }

    if (result.partialRollback) {
      console.log('\n⚠️  Rollback completed with warnings.');
      if (result.recoveryInstructions) {
        console.log(result.recoveryInstructions);
      }
      process.exit(2); // Exit code 2 for partial rollback
    }

    console.log('\n✅ Rollback completed successfully!');
    console.log(`\nBackup branch: ${result.backupBranch}`);
    console.log('You can delete this branch after verifying the rollback:');

    if (result.closedIssues.length > 0) {
      console.log(`\nClosed issues: ${result.closedIssues.map(i => '#' + i).join(', ')}`);
    }

    console.log(`\nTo delete the backup branch:`);
    console.log(`  git branch -D ${result.backupBranch}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Rollback failed:', (error as Error).message);
    console.error('');
    console.error('For troubleshooting, see:');
    console.error('  - Migration manifest issue in GitHub');
    console.error('  - /docs/github-integration.md');
    process.exit(1);
  } finally {
    await rollback.close();
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
