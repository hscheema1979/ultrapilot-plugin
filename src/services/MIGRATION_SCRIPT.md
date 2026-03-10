# Migration Script

## Overview

The Migration Script (`migration-script.ts`) migrates all existing Ultrapilot state from JSON files to GitHub issues. This enables the new GitHub-backed state management system while preserving existing data.

## Features

- **State Discovery**: Automatically discovers all JSON state files in `.ultra/state/`
- **Validation**: Validates JSON structure before migration
- **GitHub Integration**: Creates corresponding GitHub issues with proper labels
- **Metadata Preservation**: Preserves all state metadata
- **Progress Tracking**: Creates manifest issue for tracking migration progress
- **Post-Migration Validation**: Verifies migration success
- **Rollback Support**: Enables rollback to pre-migration state
- **Dry Run Mode**: Preview migration without making changes
- **Error Handling**: Continues migration even if individual files fail
- **Progress Reporting**: Shows current file, percentage complete, and ETA

## Architecture

### Components

1. **MigrationScript** - Main migration orchestrator
2. **MigrationManifest** - Tracks migration progress and enables rollback
3. **GitHubStateAdapter** - Manages state in GitHub issue bodies
4. **GitHubTaskQueueAdapter** - Manages task queues via GitHub labels

### State File Mappings

The script maps JSON state files to GitHub issues:

| JSON File | GitHub Label | Title |
|-----------|--------------|-------|
| `autopilot-state.json` | `state:autopilot` | 🤖 Autopilot State |
| `ralph-state.json` | `state:ralph` | 🔄 Ralph State |
| `ultraqa-state.json` | `state:ultraqa` | 🧪 UltraQA State |
| `validation-state.json` | `state:validation` | 👁️ Validation State |
| `team-state.json` | `state:team` | 👥 Team State |

### Migration Phases

1. **Discovery**: Find all JSON state files
2. **Validation**: Validate JSON structure
3. **Manifest Creation**: Create tracking issue
4. **Label Initialization**: Ensure GitHub labels exist
5. **Migration**: Migrate each file to GitHub issue
6. **Validation**: Verify migration success

## Usage

### Basic Usage

```bash
# Live migration (with confirmation)
npx tsx src/services/run-migration.ts

# Live migration (skip confirmation)
npx tsx src/services/run-migration.ts --force

# Dry run (preview without changes)
npx tsx src/services/run-migration.ts --dry-run
```

### Environment Variables

Required:
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - GitHub App private key
- `ULTRA_GITHUB_REPO` - Repository in format `owner/repo`

Optional:
- `GITHUB_APP_INSTALLATION_ID` - GitHub App installation ID
- `ULTRA_GITHUB_BRANCH` - Branch name (default: `main`)

### Programmatic Usage

```typescript
import { createMigrationScript } from './services/migration-script';

const migration = createMigrationScript({
  owner: 'myorg',
  repo: 'myrepo',
  branch: 'main',
  stateDir: '/path/to/.ultra/state',
  onProgress: (current, total, file) => {
    console.log(`Migrating ${current}/${total}: ${file}`);
  },
});

// Run dry run first
const dryRunResult = await migration.run(true);
console.log('Dry run:', dryRunResult);

// Run live migration
const result = await migration.run(false);
console.log('Migration:', result);

// Validate results
const validation = await migration.validate(result);
console.log('Validation:', validation);

// Rollback if needed
if (!validation.valid) {
  await migration.rollback();
}
```

## Error Handling

The migration script uses robust error handling:

1. **Invalid JSON**: Files with invalid JSON are skipped and logged
2. **GitHub API Errors**: Retried with exponential backoff
3. **Partial Failures**: Migration continues even if individual files fail
4. **Error Collection**: All errors collected and reported in summary

## Migration Result

```typescript
interface MigrationResult {
  success: boolean;              // Overall success status
  totalFiles: number;            // Total files discovered
  successfulFiles: number;       // Successfully migrated
  failedFiles: number;           // Failed migrations
  skippedFiles: number;          // Skipped (invalid JSON)
  results: FileMigrationResult[]; // Individual file results
  manifestIssueNumber?: number;  // Manifest issue number
  duration: number;              // Duration in ms
  startedAt: string;             // ISO timestamp
  completedAt: string;           // ISO timestamp
  errors: string[];              // Error messages
}
```

## Validation

After migration, the script validates:

- All expected issues exist
- Issues have valid state data
- State data is not empty
- Checksums match (optional)

## Rollback

If validation fails or you need to revert:

```bash
# Via manifest issue
# 1. Go to the migration manifest issue
# 2. Find the rollback_point (git SHA)
# 3. Run: git reset --hard <sha>

# Programmatically
await migration.rollback();
```

## Migration Manifest

The migration creates a manifest issue that tracks:

- Migration status (pending/in_progress/completed/failed/rolled_back)
- Tasks migrated vs total
- Progress percentage
- Rollback point (git commit SHA)
- Phase status
- Errors

Example manifest title: `🔄 Migration Manifest: migration-2026-03-04`

## Dry Run Mode

Dry run mode shows what would happen without making changes:

```
[Phase 1] Discovering state files...
Discovered 5 JSON state files

[Phase 2] Validating JSON structure...
✓ Valid files: 5
✗ Invalid files: 0

[DRY RUN] Migration preview:
Would migrate 5 valid files
  - autopilot-state.json → state:autopilot
  - ralph-state.json → state:ralph
  - ultraqa-state.json → state:ultraqa
  - validation-state.json → state:validation
  - team-state.json → state:team
```

## Progress Tracking

During migration, progress is reported:

```
[Phase 5] Migrating state files...
Migrating autopilot-state.json...
✓ autopilot-state.json → Issue #123
Progress: 1/5 (20%)

Migrating ralph-state.json...
✓ ralph-state.json → Issue #124
Progress: 2/5 (40%)
...
```

## Testing

Run tests:

```bash
npm test -- migration-script.test.ts
```

## Troubleshooting

### Migration Fails

1. Check the migration manifest issue for errors
2. Verify GitHub App credentials are correct
3. Check GitHub API rate limits
4. Review individual file errors in results

### Validation Fails

1. Check missing issues in validation report
2. Verify issues have valid state data
3. Check for corrupt issues in report
4. Use rollback if needed

### Rollback Issues

1. Ensure you have git access
2. Verify rollback point contains git SHA
3. Check git history exists
4. Manual rollback: `git reset --hard <sha>`

## Security Considerations

- GitHub App credentials should be kept secure
- Private keys should never be committed
- Use environment variables for sensitive data
- Migration issues are created in private repositories
- State data may contain sensitive information

## Performance

- Migration speed: ~10-50 files per second (varies by file size)
- GitHub API rate limiting handled automatically
- Progress updates every file
- Dry run is instant (no API calls)

## Future Enhancements

- [ ] Incremental migration (only new/changed files)
- [ ] Parallel migration (multiple files at once)
- [ ] Compression for large state files
- [ ] Encryption for sensitive state data
- [ ] Migration scheduling
- [ ] Webhook notifications
- [ ] Rollback via GitHub actions
