# Rollback Script Documentation

## Overview

The **Rollback Script** (`rollback-script.ts`) provides safe rollback capabilities for GitHub migrations. It automatically rolls back to the pre-migration state while preserving data and providing recovery options.

## Files

- **`/home/ubuntu/.claude/plugins/ultrapilot/src/services/rollback-script.ts`** - Main rollback implementation
- **`/home/ubuntu/.claude/plugins/ultrapilot/src/services/run-rollback.ts`** - CLI entry point

## Features

### Safety Features

1. **Pre-Rollback Validation**
   - Checks for uncommitted changes (aborts if found)
   - Validates migration manifest exists
   - Verifies rollback commit is valid

2. **Backup Creation**
   - Creates backup branch before rollback
   - Preserves current state for recovery
   - Customizable branch name

3. **Confirmation Prompts**
   - Requires user confirmation (unless `--force`)
   - Shows what will be rolled back
   - Displays recovery instructions

4. **Comprehensive Rollback**
   - Resets git to pre-migration commit
   - Restores JSON state files from git
   - Closes migrated state issues
   - Updates migration manifest

5. **Post-Rollback Validation**
   - Verifies rollback success
   - Detects partial rollbacks
   - Provides recovery instructions if needed

## Usage

### Command Line

```bash
# Rollback with confirmation
npx tsx src/services/run-rollback.ts

# Rollback without confirmation
npx tsx src/services/run-rollback.ts --force

# Rollback with custom backup branch
npx tsx src/services/run-rollback.ts --backup-branch=my-backup

# Display help
npx tsx src/services/run-rollback.ts --help
```

### Programmatic Usage

```typescript
import { createRollbackScript } from './services/rollback-script';

const rollback = createRollbackScript({
  owner: 'myorg',
  repo: 'myrepo',
  branch: 'main',
  force: false,
  onProgress: (message) => console.log(message),
});

const result = await rollback.run();

if (result.success) {
  console.log('Rollback successful!');
  console.log(`Backup branch: ${result.backupBranch}`);
} else {
  console.error('Rollback failed:', result.error);
  if (result.recoveryInstructions) {
    console.log(result.recoveryInstructions);
  }
}

await rollback.close();
```

## Rollback Process

### Step 1: Validation

The script validates pre-rollback conditions:

- ✓ No uncommitted changes
- ✓ Migration manifest exists
- ✓ Rollback commit SHA is valid
- ✓ Commit exists in git history

**If validation fails:** Script aborts with error message.

### Step 2: Backup Creation

Creates a backup branch with current state:

```bash
git checkout -b backup-before-rollback-TIMESTAMP
```

**Custom name:** Use `--backup-branch=NAME` option.

### Step 3: Git Reset

Resets git to pre-migration commit:

```bash
git reset --hard <rollback-commit>
```

### Step 4: State File Restoration

Restores JSON state files from git:

- `.ultra/state/autopilot-state.json`
- `.ultra/state/ralph-state.json`
- `.ultra/state/ultraqa-state.json`
- `.ultra/state/validation-state.json`
- `.ultra/state/team-state.json`

Files are restored from the rollback commit if they exist.

### Step 5: GitHub Cleanup

Closes migrated state issues and updates manifest:

- Closes all issues with `migrated-state` label
- Updates migration manifest with `rolled-back` status
- Adds rollback comment to manifest issue

**Note:** Labels are not deleted (may be used by other issues).

### Step 6: Validation

Verifies rollback success:

- Checks current commit matches rollback point
- Verifies state files exist
- Reports any inconsistencies

## API Reference

### RollbackScript Class

#### Constructor

```typescript
constructor(options: RollbackOptions)
```

**Options:**
- `force?: boolean` - Skip confirmation prompts
- `backupBranch?: string` - Custom backup branch name
- `owner: string` - GitHub repository owner
- `repo: string` - GitHub repository name
- `branch: string` - Git branch name
- `stateDir?: string` - State directory path (default: `.ultra/state`)
- `onProgress?: (message: string) => void` - Progress callback

#### Methods

##### `validatePreRollback(): Promise<PreRollbackValidation>`

Validates conditions before rollback.

**Returns:**
```typescript
{
  valid: boolean;
  hasUncommittedChanges: boolean;
  manifestExists: boolean;
  manifestIssueNumber?: number;
  rollbackCommit?: string;
  errors: string[];
  warnings: string[];
}
```

##### `createBackup(): Promise<string>`

Creates backup branch.

**Returns:** Backup branch name

##### `resetGit(rollbackPoint: string): Promise<void>`

Resets git to pre-migration commit.

**Parameters:**
- `rollbackPoint` - Git commit SHA

##### `restoreStateFiles(): Promise<string[]>`

Restores JSON state files from git.

**Returns:** Array of restored file paths

##### `cleanupGitHub(): Promise<{ closedIssues: number[]; removedLabels: string[] }>`

Closes migrated state issues and updates manifest.

**Returns:**
```typescript
{
  closedIssues: number[];
  removedLabels: string[];
}
```

##### `validateRollback(): Promise<boolean>`

Validates rollback success.

**Returns:** `true` if validation passed

##### `run(force?: boolean): Promise<RollbackResult>`

Executes the complete rollback process.

**Parameters:**
- `force` - Override instance force option

**Returns:**
```typescript
{
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
```

##### `close(): Promise<void>`

Closes connections and cleanup.

### Factory Function

```typescript
function createRollbackScript(options: RollbackOptions): RollbackScript
```

Creates a new RollbackScript instance.

## Error Handling

### Validation Errors

The script aborts if:

- Uncommitted changes detected
- Migration manifest not found
- Rollback commit invalid
- Git operations fail

**Recovery:** Fix the issue and retry rollback.

### Partial Rollback

If rollback completes with warnings:

- `result.partialRollback` is `true`
- `result.recoveryInstructions` contains manual steps
- Exit code is `2` (vs `0` for success)

**Recovery:** Follow the provided recovery instructions.

### Complete Failure

If rollback fails completely:

- `result.success` is `false`
- `result.error` contains error message
- `result.recoveryInstructions` contains manual steps
- Exit code is `1`

**Recovery:** Follow the provided recovery instructions.

## Recovery Instructions

If the rollback script fails, manual recovery instructions are provided:

```bash
# 1. Check current state
git status
git log --oneline -5

# 2. If rollback was incomplete
git reset --hard <rollback-commit>

# 3. Restore state files from backup
git checkout <backup-branch> -- .ultra/state/

# 4. Update manifest issue manually
# (Go to GitHub and add comment)

# 5. If you need to restore to the backup branch
git checkout <backup-branch>

# 6. To clean up after successful rollback
git branch -D <backup-branch>
```

## Environment Variables

Required:

- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - GitHub App private key

Optional:

- `GITHUB_APP_INSTALLATION_ID` - GitHub App installation ID
- `ULTRA_GITHUB_REPO` - Repository path (format: `owner/repo`)
- `ULTRA_GITHUB_BRANCH` - Branch name (default: `main`)

## Integration

### With Migration Script

The rollback script is designed to work with the migration script:

```typescript
import { createMigrationScript } from './services/migration-script';
import { createRollbackScript } from './services/rollback-script';

// Run migration
const migration = createMigrationScript({ /* ... */ });
const migrationResult = await migration.run();

if (!migrationResult.success) {
  // Rollback on failure
  const rollback = createRollbackScript({ /* ... */ });
  await rollback.run();
}
```

### With Migration Manifest

The rollback script uses the migration manifest to:

- Get the rollback commit SHA
- Update manifest with rollback status
- Add rollback comments for audit trail

## Testing

To test the rollback script:

```bash
# 1. Run a test migration
npx tsx src/services/run-migration.ts --dry-run

# 2. Check validation without rolling back
# (Modify code to stop after validation)

# 3. Test with a test repository
# (Use a test repo to avoid data loss)
```

## Best Practices

1. **Always validate first** - Check pre-rollback conditions
2. **Use backup branches** - Never skip backup creation
3. **Test in staging** - Test rollback in a non-production environment
4. **Keep audit trail** - Don't delete migration manifest issues
5. **Monitor validation** - Check post-rollback validation results
6. **Document custom changes** - If you modify rollback behavior

## Troubleshooting

### "Uncommitted changes detected"

**Cause:** You have uncommitted changes in your working directory.

**Solution:** Commit or stash changes before rollback:

```bash
git stash
# or
git commit -am "WIP"
```

### "No migration manifest found"

**Cause:** No migration manifest issue exists in GitHub.

**Solution:**
- Check GitHub for migration manifest issues
- Verify repository owner/repo are correct
- Check GitHub authentication

### "Rollback commit does not exist"

**Cause:** The rollback commit SHA is invalid or not in git history.

**Solution:**
- Check git history: `git log --oneline`
- Verify manifest has correct rollback point
- Check if commit was garbage collected

### Rollback completes but state files are missing

**Cause:** State files didn't exist at rollback commit.

**Solution:**
- Check backup branch for state files
- Restore from backup: `git checkout <backup-branch> -- .ultra/state/`

## Exit Codes

- `0` - Success
- `1` - Failure
- `2` - Partial rollback (completed with warnings)

## See Also

- [Migration Script Documentation](./MIGRATION_SCRIPT.md)
- [Migration Manifest Documentation](./MIGRATION_MANIFEST.md)
- [GitHub Integration Documentation](./GITHUB_SERVICE.md)
