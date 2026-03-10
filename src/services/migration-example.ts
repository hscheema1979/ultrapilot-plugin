/**
 * Migration Script Example
 *
 * This file demonstrates how to use the migration script programmatically.
 * It shows various scenarios including dry run, live migration, validation, and rollback.
 */

import { createMigrationScript } from './migration-script';
import { MigrationResult } from './migration-script';

/**
 * Example 1: Basic Dry Run
 *
 * Always run a dry run first to see what will be migrated.
 */
async function example1_dryRun() {
  console.log('=== Example 1: Dry Run ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
  });

  // Run dry run
  const result = await migration.run(true);

  console.log('\nDry Run Results:');
  console.log(`  Total files: ${result.totalFiles}`);
  console.log(`  Valid files: ${result.successfulFiles}`);
  console.log(`  Invalid files: ${result.failedFiles + result.skippedFiles}`);

  await migration.close();
}

/**
 * Example 2: Live Migration with Progress Callback
 *
 * Run live migration with progress tracking.
 */
async function example2_liveMigration() {
  console.log('=== Example 2: Live Migration ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
    onProgress: (current, total, file) => {
      const progress = Math.round((current / total) * 100);
      console.log(`[${progress}%] Migrating ${file} (${current}/${total})`);
    },
  });

  // Run live migration
  const result = await migration.run(false);

  console.log('\nMigration Results:');
  console.log(`  Success: ${result.success ? '✅' : '❌'}`);
  console.log(`  Duration: ${Math.round(result.duration / 1000)}s`);
  console.log(`  Manifest: #${result.manifestIssueNumber}`);

  await migration.close();
}

/**
 * Example 3: Migration with Validation
 *
 * Run migration and validate results.
 */
async function example3_migrationWithValidation() {
  console.log('=== Example 3: Migration with Validation ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
  });

  // Run migration
  const result = await migration.run(false);

  // Validate results
  const validation = await migration.validate(result);

  console.log('\nValidation Results:');
  console.log(`  Valid: ${validation.valid ? '✅' : '❌'}`);
  console.log(`  Missing issues: ${validation.missingIssues.length}`);
  console.log(`  Corrupt issues: ${validation.corruptIssues.length}`);
  console.log(`  Checksum match: ${validation.checksumMatch ? '✅' : '❌'}`);

  if (!validation.valid) {
    console.log('\n⚠️  Validation failed!');
    console.log('Missing issues:', validation.missingIssues);
    console.log('Corrupt issues:', validation.corruptIssues);

    // Rollback if validation fails
    console.log('\nRolling back...');
    await migration.rollback();
  }

  await migration.close();
}

/**
 * Example 4: Custom State Directory
 *
 * Migrate state from a custom directory.
 */
async function example4_customStateDirectory() {
  console.log('=== Example 4: Custom State Directory ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
    stateDir: '/custom/path/to/.ultra/state',
  });

  const result = await migration.run(true);

  console.log('\nResults:', result);

  await migration.close();
}

/**
 * Example 5: Error Handling
 *
 * Demonstrate proper error handling.
 */
async function example5_errorHandling() {
  console.log('=== Example 5: Error Handling ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
  });

  try {
    const result = await migration.run(false);

    // Check for errors
    if (result.errors.length > 0) {
      console.warn('\n⚠️  Some files failed to migrate:');
      result.errors.forEach((error, index) => {
        console.warn(`  ${index + 1}. ${error}`);
      });
    }

    // Check overall success
    if (result.success) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log('\n❌ Migration completed with errors.');
      console.log(`  Successful: ${result.successfulFiles}`);
      console.log(`  Failed: ${result.failedFiles}`);
    }

    // Validate even if some files failed
    const validation = await migration.validate(result);
    if (!validation.valid) {
      console.log('\n⚠️  Validation failed, rolling back...');
      await migration.rollback();
    }

  } catch (error) {
    console.error('\n❌ Fatal error during migration:');
    console.error(error);
  } finally {
    await migration.close();
  }
}

/**
 * Example 6: Retry Failed Migrations
 *
 * Retry only the files that failed.
 */
async function example6_retryFailed() {
  console.log('=== Example 6: Retry Failed Migrations ===\n');

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
  });

  // First attempt
  const result = await migration.run(false);

  if (result.failedFiles > 0) {
    console.log(`\n⚠️  ${result.failedFiles} files failed, retrying...`);

    // Get failed file paths
    const failedFiles = result.results
      .filter(r => !r.success)
      .map(r => r.filePath);

    console.log('Failed files:', failedFiles);

    // Note: In a real scenario, you might want to:
    // 1. Fix the issues with the failed files
    // 2. Delete the partially-created issues
    // 3. Retry the migration

    // For now, just report the failures
    console.log('\nPlease fix the following files and retry:');
    failedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
  }

  await migration.close();
}

/**
 * Example 7: Load Existing Manifest
 *
 * Load and inspect an existing migration manifest.
 */
async function example7_loadManifest() {
  console.log('=== Example 7: Load Existing Manifest ===\n');

  // Note: This example assumes you have a migration manifest issue number
  const manifestIssueNumber = 123;

  const migration = createMigrationScript({
    owner: 'my-org',
    repo: 'my-repo',
    branch: 'main',
  });

  try {
    // Load manifest (this would be implemented in MigrationManifest)
    // const manifest = await migration.loadManifest(manifestIssueNumber);
    // console.log('Manifest data:', manifest);

    console.log(`\nManifest #${manifestIssueNumber} would be loaded here.`);
  } catch (error) {
    console.error('Failed to load manifest:', error);
  }

  await migration.close();
}

/**
 * Example 8: Batch Migration
 *
 * Migrate multiple repositories sequentially.
 */
async function example8_batchMigration() {
  console.log('=== Example 8: Batch Migration ===\n');

  const repositories = [
    { owner: 'org1', repo: 'repo1' },
    { owner: 'org1', repo: 'repo2' },
    { owner: 'org2', repo: 'repo1' },
  ];

  const results: Array<{ repo: string; result: MigrationResult }> = [];

  for (const repo of repositories) {
    console.log(`\nMigrating ${repo.owner}/${repo.repo}...`);

    const migration = createMigrationScript({
      owner: repo.owner,
      repo: repo.repo,
      branch: 'main',
    });

    try {
      const result = await migration.run(false);
      results.push({ repo: `${repo.owner}/${repo.repo}`, result });

      console.log(`✅ ${repo.owner}/${repo.repo}: ${result.success ? 'Success' : 'Failed'}`);
    } catch (error) {
      console.error(`❌ ${repo.owner}/${repo.repo}: Error`);
    } finally {
      await migration.close();
    }
  }

  // Summary
  console.log('\n=== Batch Migration Summary ===');
  results.forEach(({ repo, result }) => {
    console.log(`${repo}: ${result.success ? '✅' : '❌'} (${result.successfulFiles}/${result.totalFiles} files)`);
  });
}

/**
 * Main function to run examples
 */
async function main() {
  // Run specific examples
  // await example1_dryRun();
  // await example2_liveMigration();
  // await example3_migrationWithValidation();
  // await example4_customStateDirectory();
  // await example5_errorHandling();
  // await example6_retryFailed();
  // await example7_loadManifest();
  // await example8_batchMigration();

  console.log('Examples completed. Uncomment the examples you want to run in main().');
}

// Export examples for use in tests or other modules
export {
  example1_dryRun,
  example2_liveMigration,
  example3_migrationWithValidation,
  example4_customStateDirectory,
  example5_errorHandling,
  example6_retryFailed,
  example7_loadManifest,
  example8_batchMigration,
};

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
