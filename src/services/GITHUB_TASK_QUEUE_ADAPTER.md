# GitHubTaskQueueAdapter

## Overview

The `GitHubTaskQueueAdapter` manages task queues using GitHub issues and labels. It provides a queue-based task management system where each queue is represented as a GitHub label.

## File Location

`/home/ubuntu/.claude/plugins/ultrapilot/src/services/github-task-queue-adapter.ts`

## Architecture

### Queue Representation

Queues are GitHub labels with the prefix `queue:`:

- `queue:intake` - New tasks awaiting assignment
- `queue:active` - Tasks currently being worked on
- `queue:review` - Tasks completed, awaiting review
- `queue:done` - Tasks approved and finished
- `queue:failed` - Tasks that failed and need attention
- `queue:blocked` - Tasks blocked on dependencies

### Task Metadata

Each task issue includes YAML frontmatter with metadata:

```yaml
---
task_id: ULTRA-001
enqueued_at: 2026-03-04T12:00:00Z
queue: intake
priority: 5
agent: executor
---
```

## API Reference

### Constructor

```typescript
constructor(owner: string, repo: string, authManager?: GitHubAppAuthManager)
```

**Parameters:**
- `owner` - GitHub repository owner
- `repo` - GitHub repository name
- `authManager` - Optional GitHubAppAuthManager instance (created from env if not provided)

### Core Methods

#### `enqueue(queue: QueueName, task: GitHubTask): Promise<number>`

Add a task to a queue by creating a GitHub issue with the queue label.

**Parameters:**
- `queue` - Queue name ('intake', 'active', 'review', 'done', 'failed', 'blocked')
- `task` - Task to enqueue

**Returns:** Issue number of the created task

**Example:**
```typescript
const task: GitHubTask = {
  id: 'ULTRA-001',
  title: 'Implement feature X',
  description: 'Detailed description...',
  status: TaskStatus.INTAKE,
  priority: TaskPriority.HIGH,
  assignedAgent: 'executor',
  createdAt: new Date(),
  updatedAt: new Date(),
  retryCount: 0,
  maxRetries: 3,
};

const issueNumber = await adapter.enqueue('intake', task);
```

#### `dequeue(queue: string): Promise<GitHubTask | null>`

Remove and return the oldest task from a queue (FIFO ordering).

**Parameters:**
- `queue` - Queue name

**Returns:** Oldest task in queue or `null` if queue is empty

**Example:**
```typescript
const task = await adapter.dequeue('intake');
if (task) {
  console.log(`Processing task: ${task.title}`);
}
```

#### `moveToQueue(issueNumber: number, fromQueue: string, toQueue: string): Promise<void>`

Move a task from one queue to another by updating labels.

**Parameters:**
- `issueNumber` - GitHub issue number
- `fromQueue` - Source queue name
- `toQueue` - Destination queue name

**Example:**
```typescript
await adapter.moveToQueue(123, 'intake', 'active');
```

#### `getQueueSize(queue: string): Promise<number>`

Get the number of tasks in a queue.

**Parameters:**
- `queue` - Queue name

**Returns:** Number of tasks in the queue

**Example:**
```typescript
const size = await adapter.getQueueSize('active');
console.log(`Active tasks: ${size}`);
```

#### `peek(queue: string): Promise<GitHubTask[]>`

Get all tasks in a queue without removing them.

**Parameters:**
- `queue` - Queue name

**Returns:** Array of tasks in the queue

**Example:**
```typescript
const tasks = await adapter.peek('review');
tasks.forEach(task => console.log(task.title));
```

#### `getByQueue(queue: string): Promise<GitHubTask[]>`

Alias for `peek()` - get all tasks in a queue.

#### `getByAgent(agentLabel: string): Promise<GitHubTask[]>`

Get all tasks assigned to a specific agent.

**Parameters:**
- `agentLabel` - Agent label (e.g., 'executor', 'analyst')

**Returns:** Array of tasks assigned to the agent

**Example:**
```typescript
const executorTasks = await adapter.getByAgent('executor');
```

### Utility Methods

#### `getAllTasks(): Promise<GitHubTask[]>`

Get all tasks across all queues.

**Returns:** Array of all tasks

#### `getByIssueNumber(issueNumber: number): Promise<GitHubTask | null>`

Get a task by its GitHub issue number.

**Parameters:**
- `issueNumber` - GitHub issue number

**Returns:** Task or `null` if not found

#### `getQueueStats(): Promise<Record<QueueName, number>>`

Get statistics for all queues.

**Returns:** Object with task counts for each queue

**Example:**
```typescript
const stats = await adapter.getQueueStats();
console.log(stats);
// { intake: 5, active: 3, review: 2, done: 10, failed: 0, blocked: 1 }
```

#### `initializeQueues(): Promise<void>`

Create all queue labels in the repository if they don't exist.

**Example:**
```typescript
await adapter.initializeQueues();
```

## Queue Workflow

### Typical Task Lifecycle

1. **Intake**: Task created with `queue:intake` label
2. **Assignment**: Task moved to `queue:active` when assigned to agent
3. **Completion**: Task moved to `queue:review` when agent completes work
4. **Approval**: Task moved to `queue:done` when approved
5. **Failure**: Task moved to `queue:failed` if it fails
6. **Blocking**: Task moved to `queue:blocked` if blocked on dependencies

### State Transitions

```typescript
// Create new task
const issueNumber = await adapter.enqueue('intake', task);

// Assign to agent
await adapter.moveToQueue(issueNumber, 'intake', 'active');

// Complete work
await adapter.moveToQueue(issueNumber, 'active', 'review');

// Approve
await adapter.moveToQueue(issueNumber, 'review', 'done');
```

## Integration with GitHubService

The adapter uses the following GitHubService methods:

- `createTask()` - Create GitHub issue
- `getTask()` - Fetch issue by number
- `updateTask()` - Update issue
- `addLabel()` - Add label to issue
- `removeLabel()` - Remove label from issue
- `createLabel()` - Create label in repository
- `graphql()` - Execute GraphQL queries

## GraphQL Queries

The adapter uses GraphQL for efficient querying:

### Get Tasks by Label

```graphql
query($owner: String!, $repo: String!, $label: String!) {
  repository(owner: $owner, name: $repo) {
    issues(
      labels: [$label]
      first: 100
      states: [OPEN]
      orderBy: {field: CREATED_AT, direction: ASC}
    ) {
      nodes {
        number
        title
        body
        created_at
        updated_at
        labels(first: 20) {
          nodes {
            name
          }
        }
      }
    }
  }
}
```

## Type Definitions

### QueueName

```typescript
type QueueName = 'intake' | 'active' | 'review' | 'done' | 'failed' | 'blocked';
```

### GitHubTask

```typescript
interface GitHubTask extends Task {
  issueNumber?: number;
  queue?: QueueName;
}
```

### QueueMetadata

```typescript
interface QueueMetadata {
  task_id: string;
  enqueued_at: string;
  queue: QueueName;
  priority?: TaskPriority;
  agent?: string;
}
```

## Error Handling

The adapter handles various error scenarios:

- **Empty queues**: Returns `null` or empty arrays
- **Missing labels**: Silently handles missing labels in `removeLabel()`
- **Invalid metadata**: Falls back to default values
- **GraphQL errors**: Returns empty arrays on query failures

## Best Practices

1. **Initialize queues**: Call `initializeQueues()` before first use
2. **Use FIFO ordering**: Tasks are returned in creation date order
3. **Handle empty queues**: Always check for `null` when dequeuing
4. **Update metadata**: Use `moveToQueue()` to keep metadata in sync
5. **Monitor queue sizes**: Use `getQueueStats()` to monitor queue health

## Example Usage

```typescript
import { GitHubTaskQueueAdapter } from './services/github-task-queue-adapter';
import { GitHubAppAuthManager } from './services/github-app-auth';
import { Task, TaskStatus, TaskPriority } from './domain/TaskQueue';

// Initialize adapter
const authManager = GitHubAppAuthManager.fromEnv('owner/repo');
const adapter = new GitHubTaskQueueAdapter('owner', 'repo', authManager);

// Initialize queue labels
await adapter.initializeQueues();

// Create and enqueue task
const task: GitHubTask = {
  id: 'ULTRA-001',
  title: 'Implement feature',
  description: 'Description',
  status: TaskStatus.INTAKE,
  priority: TaskPriority.HIGH,
  assignedAgent: 'executor',
  createdAt: new Date(),
  updatedAt: new Date(),
  retryCount: 0,
  maxRetries: 3,
};

const issueNumber = await adapter.enqueue('intake', task);

// Process tasks
const nextTask = await adapter.dequeue('intake');
if (nextTask) {
  await adapter.moveToQueue(nextTask.issueNumber!, 'intake', 'active');
  // ... process task ...
  await adapter.moveToQueue(nextTask.issueNumber!, 'active', 'review');
}

// Get statistics
const stats = await adapter.getQueueStats();
console.log('Queue stats:', stats);
```

## Testing

See test file: `/home/ubuntu/.claude/plugins/ultrapilot/src/services/__tests__/github-task-queue-adapter.test.ts`

## Dependencies

- `GitHubService` - Core GitHub API client
- `GitHubAppAuthManager` - GitHub App authentication
- `Task` from `../domain/TaskQueue` - Task domain model
- `TaskStatus`, `TaskPriority` from `../domain/TaskQueue` - Task enums

## Notes

- Queue labels are created with specific colors for visual distinction
- FIFO ordering is maintained by sorting on creation date
- GraphQL queries are used for efficiency with pagination support
- Metadata is stored in YAML frontmatter for easy parsing
- Each task can only be in one queue at a time (mutually exclusive labels)
