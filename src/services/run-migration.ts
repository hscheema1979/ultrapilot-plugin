#!/usr/bin/env node

/**
 * Migration CLI
 *
 * Command-line interface for running the migration script.
 * Usage:
 *   npx tsx src/services/run-migration.ts [--dry-run] [--force]
 *
 * Options:
 *   --dry-run: Show what would be done without actually doing it
 *   --force: Skip confirmation prompts
 */

import { createMigrationScript } from './migration-script';
import { GitHubAuthManager } from './github-auth';
import * as readline from 'readline';

/**
 * Parse command line arguments
 */
interface CLIArgs {
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(`
Ultrapilot State Migration CLI
===============================

Migrates all existing state from JSON files to GitHub issues.

Usage:
  npx tsx src/services/run-migration.ts [options]

Options:
  --dry-run    Show what would be done without actually doing it
  --force      Skip confirmation prompts
  --help, -h   Display this help message

Environment Variables:
  GITHUB_TOKEN               GitHub Personal Access Token (for development)
  GITHUB_APP_ID              GitHub App ID (for production)
  GITHUB_APP_PRIVATE_KEY     GitHub App private key (for production)
  GITHUB_APP_INSTALLATION_ID GitHub App installation ID (optional)

Examples:
  # Dry run to see what would be migrated
  npx tsx src/services/run-migration.ts --dry-run

  # Live migration with confirmation
  npx tsx src/services/run-migration.ts

  # Live migration without confirmation
  npx tsx src/services/run-migration.ts --force
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
  const hasToken = process.env.GITHUB_TOKEN;
  const hasApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY;

  if (!hasToken && !hasApp) {
    console.error('❌ Error: Missing GitHub credentials');
    console.error('');
    console.error('Choose one:');
    console.error('  1. GITHUB_TOKEN (for development)');
    console.error('     Get token at: https://github.com/settings/tokens');
    console.error('     Set: export GITHUB_TOKEN=your_token_here');
    console.error('');
    console.error('  2. GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (for production)');
    console.error('     See: .github/GITHUB_APP_SETUP.md');
    process.exit(1);
  }

  // Auto-detect auth type
  const auth = GitHubAuthManager.fromEnv();
  console.log(`📝 Using ${auth.isPATAuth() ? 'Personal Access Token' : 'GitHub App'} authentication`);

  // Get repository info from environment or use defaults
  // Format: owner/repo or use default
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
  console.log(`  Dry Run: ${args.dryRun ? 'Yes' : 'No'}`);
  console.log('');

  // Confirm migration if not forced and not dry run
  if (!args.force && !args.dryRun) {
    const confirmed = await promptConfirmation(
      '⚠️  This will migrate all state files to GitHub issues. Continue?'
    );

    if (!confirmed) {
      console.log('Migration cancelled.');
      process.exit(0);
    }
  }

  // Create migration script
  const migration = createMigrationScript({
    dryRun: args.dryRun,
    force: args.force,
    owner,
    repo,
    branch,
    onProgress: (current, total, file) => {
      const progress = Math.round((current / total) * 100);
      process.stdout.write(`\r  Progress: ${current}/${total} (${progress}%) - ${file}`);
    },
  });

  try {
    // Run migration
    const results = await migration.run(args.dryRun);

    // Validate migration if not dry run
    if (!args.dryRun && results.success) {
      console.log('\n');
      const validation = await migration.validate(results);

      if (!validation.valid) {
        console.log('\n⚠️  Validation completed with warnings:');
        if (validation.missingIssues.length > 0) {
          console.log(`  Missing issues: ${validation.missingIssues.join(', ')}`);
        }
        if (validation.corruptIssues.length > 0) {
          console.log(`  Corrupt issues: ${validation.corruptIssues.map(i => '#' + i.issueNumber).join(', ')}`);
        }
      }
    }

    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Migration failed:', (error as Error).message);
    console.error('');
    console.error('For troubleshooting, see:');
    console.error('  - Migration manifest issue in GitHub');
    console.error('  - /docs/github-integration.md');
    process.exit(1);
  } finally {
    await migration.close();
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
