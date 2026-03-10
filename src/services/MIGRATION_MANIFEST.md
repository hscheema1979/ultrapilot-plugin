# Migration Manifest Service

## Overview

The MigrationManifest service provides comprehensive tracking and rollback capabilities for GitHub migration operations. It creates a GitHub issue with YAML frontmatter to track migration progress, calculate validation checksums, and enable safe rollback to previous states.

## Features

- **GitHub Issue Tracking**: Creates a dedicated GitHub issue to track migration progress
- **YAML Frontmatter**: Stores manifest metadata in structured YAML format
- **Progress Tracking**: Real-time updates of migration progress with task counts
- **Phase Management**: Track multiple migration phases with individual status
- **Checksum Validation**: SHA-256 checksums for data integrity validation
- **Rollback Support**: Git commit SHA tracking for safe rollback capability
- **Error Handling**: Comprehensive error tracking and reporting
- **Comment Support**: Add comments to the manifest issue for additional context

## Installation

The service is part of the Ultrapilot plugin:

```typescript
import { MigrationManifest } from './services/migration-manifest';
```

## Usage

### Basic Setup

```typescript
import { GitHubService } from './services/github-service';
import { GitHubAppAuthManager } from './services/github-app-auth';
import { MigrationManifest } from './services/migration-manifest';

// Initialize services
const authManager = new GitHubAppAuthManager();
const githubService = await createGitHubService({
  owner: 'hscheema1979',
  repo: 'ultra-workspace',
  installationId: 123456,
}, authManager);

// Create migration manifest
const manifest = new MigrationManifest({
  githubService: githubService,
  owner: 'hscheema1979',
  repo: 'ultra-workspace',
  branch: 'main',
});
```

### Creating a Manifest

```typescript
// Create manifest with task count
const issueNumber = await manifest.create(50);

// Create with custom phases
const customPhases = [
  { name: 'Discovery', status: 'pending' as const },
  { name: 'Migration', status: 'pending' as const },
  { name: 'Verification', status: 'pending' as const },
];
const issueNumber = await manifest.create(50, customPhases);
```

### Tracking Progress

```typescript
// Update migration progress
await manifest.updateProgress(25, 50); // 25 of 50 tasks complete

// Update phase status
await manifest.updatePhase('Migration', 'in_progress', 25);
await manifest.updatePhase('Discovery', 'completed');
```

### Completion and Failure

```typescript
// Mark migration as complete
await manifest.complete();

// Mark migration as failed
try {
  await manifest.complete();
} catch (error) {
  await manifest.fail(error);
}

// Mark migration as rolled back
await manifest.markRolledBack();
```

### Checksum Validation

```typescript
// Calculate checksum for task validation
const tasks = [
  { id: 'task-1', title: 'Task 1' },
  { id: 'task-2', title: 'Task 2' },
];
const checksum = manifest.calculateChecksum(tasks);

// Validate tasks against stored checksum
const isValid = await manifest.validateTasks(tasks);
if (!isValid) {
  console.error('Task validation failed - data may be corrupted');
}
```

### Rollback

```typescript
// Get rollback point (git commit SHA)
const rollbackPoint = await manifest.getRollbackPoint();
console.log(`Rollback point: ${rollbackPoint}`);
// Output: main@sha{abc123def456}

// Perform rollback to previous state
await manifest.rollback();
```

### Loading Existing Manifest

```typescript
// Load manifest from existing GitHub issue
await manifest.load(123);
const data = manifest.getData();
console.log(`Migration status: ${data?.frontmatter.status}`);
```

### Adding Comments

```typescript
// Add comment to manifest issue
await manifest.addComment('Migration milestone reached: 50% complete');
```

## Manifest Structure

The manifest is stored in a GitHub issue with the following structure:

### YAML Frontmatter

```yaml
---
manifest_id: migration-2026-03-04
type: migration_manifest
status: in_progress
started_at: 2026-03-04T10:00:00Z
completed_at: null
tasks_migrated: 25
tasks_total: 50
checksum: abc123def456
rollback_point: main@sha{abc123def456}
error: null
---
```

### Progress Section

```markdown
# Migration Progress

- Phase 1: Discovery ✅
- Phase 2: Migration 🔄 (25 tasks)
- Phase 3: Verification ⏳
```

### Statistics Section

```markdown
## Statistics

- **Progress**: 50% (25/50 tasks)
- **Status**: in_progress
- **Started**: March 4, 2026, 10:00 AM
- **Completed**: null
- **Rollback Point**: `main@sha{abc123def456}`
```

### Rollback Instructions

```markdown
## Rollback

To rollback to the pre-migration state:
```bash
git reset --hard abc123def456
```
```

## API Reference

### Constructor

```typescript
constructor(config: MigrationManifestConfig)
```

**Parameters:**
- `config.githubService`: GitHubService instance
- `config.owner`: GitHub repository owner
- `config.repo`: GitHub repository name
- `config.branch`: Git branch name

### Methods

#### `create(totalTasks, phases?)`

Create a new migration manifest.

**Parameters:**
- `totalTasks`: Total number of tasks to migrate
- `phases`: Optional array of migration phases

**Returns:** Promise<number> - GitHub issue number

#### `updateProgress(completed, total)`

Update migration progress.

**Parameters:**
- `completed`: Number of completed tasks
- `total`: Total number of tasks

#### `updatePhase(phaseName, status, tasksCount?)`

Update phase status.

**Parameters:**
- `phaseName`: Name of the phase
- `status`: Phase status ('pending', 'in_progress', 'completed', 'failed')
- `tasksCount`: Optional task count for the phase

#### `complete()`

Mark migration as completed.

#### `fail(error)`

Mark migration as failed.

**Parameters:**
- `error`: Error object

#### `markRolledBack()`

Mark migration as rolled back.

#### `getRollbackPoint()`

Get the rollback point (git commit SHA).

**Returns:** Promise<string> - Rollback point in format `branch@sha{commit}`

#### `calculateChecksum(tasks)`

Calculate checksum of task IDs.

**Parameters:**
- `tasks`: Array of task objects

**Returns:** string - SHA-256 checksum (first 12 characters)

#### `validateTasks(tasks)`

Validate tasks against stored checksum.

**Parameters:**
- `tasks`: Array of task objects to validate

**Returns:** Promise<boolean> - True if checksums match

#### `rollback()`

Rollback to the previous git state.

#### `load(issueNumber)`

Load existing manifest from GitHub issue.

**Parameters:**
- `issueNumber`: GitHub issue number

#### `getData()`

Get current manifest data.

**Returns:** MigrationManifestData | null

#### `getIssueNumber()`

Get manifest issue number.

**Returns:** number | null

#### `addComment(message)`

Add comment to manifest issue.

**Parameters:**
- `message`: Comment message

## Type Definitions

### MigrationStatus

```typescript
type MigrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
```

### Task

```typescript
interface Task {
  id: string;
  title?: string;
  status?: string;
  [key: string]: any;
}
```

### MigrationPhase

```typescript
interface MigrationPhase {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  tasks_count?: number;
}
```

### MigrationManifestFrontmatter

```typescript
interface MigrationManifestFrontmatter {
  manifest_id: string;
  type: 'migration_manifest';
  status: MigrationStatus;
  started_at: string;
  completed_at: string | null;
  tasks_migrated: number;
  tasks_total: number;
  checksum: string;
  rollback_point: string;
  error?: string;
}
```

## Error Handling

The service throws specific errors for different failure scenarios:

- **Manifest not created**: When methods are called before `create()` or `load()`
- **Phase not found**: When updating a non-existent phase
- **Invalid rollback point**: When rollback point doesn't contain a git SHA
- **Rollback failed**: When git reset command fails

## Best Practices

1. **Always create a manifest before starting migration**
   ```typescript
   const issueNumber = await manifest.create(totalTasks);
   ```

2. **Update progress regularly**
   ```typescript
   for (const task of tasks) {
     await migrateTask(task);
     await manifest.updateProgress(completed++, totalTasks);
   }
   ```

3. **Use phases for complex migrations**
   ```typescript
   const phases = [
     { name: 'Backup', status: 'pending' },
     { name: 'Migration', status: 'pending' },
     { name: 'Cleanup', status: 'pending' },
   ];
   await manifest.create(totalTasks, phases);
   ```

4. **Validate data integrity**
   ```typescript
   const isValid = await manifest.validateTasks(tasks);
   if (!isValid) {
     throw new Error('Data validation failed');
   }
   ```

5. **Handle errors gracefully**
   ```typescript
   try {
     await migration();
     await manifest.complete();
   } catch (error) {
     await manifest.fail(error);
     await manifest.rollback();
   }
   ```

## Testing

The service includes comprehensive test coverage:

```bash
npm test -- migration-manifest
```

Test suite includes:
- Manifest creation
- Progress tracking
- Phase management
- Completion and failure handling
- Checksum calculation
- Task validation
- Rollback functionality
- YAML frontmatter parsing
- Edge cases

## Integration with GitHub Migration

The MigrationManifest service integrates with the GitHubTaskQueueAdapter:

```typescript
import { MigrationManifest } from './services/migration-manifest';
import { GitHubTaskQueueAdapter } from './services/github-task-queue-adapter';

// Create manifest
const manifest = new MigrationManifest(config);
await manifest.create(totalTasks);

// Migrate tasks
const adapter = new GitHubTaskQueueAdapter(githubService);
for (const task of tasks) {
  await adapter.createTask(task);
  await manifest.updateProgress(++completed, totalTasks);
}

// Complete migration
await manifest.complete();
```

## Security Considerations

1. **Checksum Validation**: Always validate task checksums to detect data corruption
2. **Rollback Safety**: Rollback points are git commit SHAs for reliable restoration
3. **Error Tracking**: All errors are logged to the manifest issue
4. **Access Control**: Manifest issues are created in private repositories

## Performance

- **Efficient Updates**: Only updates GitHub issue when progress changes
- **Checksum Calculation**: O(n log n) complexity for sorting task IDs
- **Rollback Speed**: Depends on git repository size

## License

MIT License - See Ultrapilot plugin LICENSE file for details.
