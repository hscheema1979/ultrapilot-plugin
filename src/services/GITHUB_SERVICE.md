# GitHub Service

Production-ready GitHub API client with advanced features for Ultrapilot.

## Features

### GitHub App Authentication
- Uses GitHub Apps (NOT Personal Access Tokens)
- Auto-rotating installation tokens (expire every hour)
- Per-installation rate limits (5000 requests/hour)
- Better security audit trail

### Sliding Window Rate Limiting
Respects GitHub's actual rate limit headers:
- Tracks `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Limit`
- Waits automatically when limit is reached
- Warns when approaching limit (configurable threshold)
- Per-resource tracking (core, GraphQL, search)

### ETag-based Caching
Efficient data retrieval with HTTP caching:
- Stores ETag headers from responses
- Uses `If-None-Match` for conditional requests
- Returns 304 Not Modified when data unchanged
- Configurable cache max age (default: 5 minutes)
- Automatic cache invalidation on updates

### Comprehensive Error Handling
Smart error handling with appropriate retry logic:
- **401, 403, 404, 422**: Fail fast, no retry
- **Rate limits**: Wait for reset, retry once
- **5xx errors**: Retry with exponential backoff (max 3)
- Custom error types for different scenarios

### GraphQL with Pagination
Efficient bulk data retrieval:
- Automatic cursor-based pagination
- GraphQL cost tracking and warnings
- Batch queries for labels, assignees, comments
- Transforms GraphQL to REST format for consistency

## Usage

### Basic Setup

```typescript
import { GitHubService } from './services/github-service';
import { GitHubAppAuthManager } from './services/github-app-auth';

// Create auth manager
const authManager = GitHubAppAuthManager.fromEnv('owner/repo');

// Create GitHub service
const service = new GitHubService({
  owner: 'owner',
  repo: 'repo',
  installationId: 123456,
  cacheMaxAge: 300000, // 5 minutes
}, authManager);

// Initialize
await service.initializeOctokit();
```

### Environment Variables

Required:
```bash
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=789012
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem
```

### Issue Operations

```typescript
// Create issue
const issue = await service.createTask({
  title: 'My Issue',
  body: 'Description',
  labels: ['bug', 'high-priority'],
  assignees: ['username']
});

// Get issue (with ETag caching)
const cached = await service.getTask(123);

// Update issue
const updated = await service.updateTask(123, {
  state: 'closed',
  labels: ['bug', 'done']
});

// Add label
await service.addLabel(123, 'priority:high');

// Remove label
await service.removeLabel(123, 'priority:low');

// Add comment
const comment = await service.createComment(123, {
  body: 'Comment text'
});
```

### Queue Operations

```typescript
// Get all tasks in "ready" queue
const readyTasks = await service.getTasksByQueue('ready');

// Get tasks by custom label
const bugs = await service.getTasksByLabel('bug');

// Get closed tasks
const closed = await service.getTasksByLabel('done', 'closed');
```

### Rate Limit Monitoring

```typescript
// Get current rate limit info
const rateLimit = service.getRateLimitInfo();
console.log(`Remaining: ${rateLimit.remaining}/${rateLimit.limit}`);
console.log(`Resets at: ${new Date(rateLimit.reset * 1000)}`);

// Get GraphQL cost info
const graphqlCost = service.getGraphQLCostInfo();
console.log(`Cost: ${graphqlCost.used}/${graphqlCost.limit}`);
```

## Architecture

### Class Structure

```
GitHubService
├── GitHubAppAuthManager (authentication)
├── GitHubRateLimiter (sliding window rate limiting)
├── GitHubCache (ETag-based caching)
└── Octokit (GitHub API client)
```

### Error Types

```typescript
// Base error class
GitHubServiceError

// Specific errors
GitHubAuthError        // 401 - Authentication failed
GitHubRateLimitError   // 403 - Rate limit exceeded
GitHubNotFoundError    // 404 - Resource not found
GitHubValidationError  // 422 - Validation error
```

### Rate Limiting Strategy

**Sliding Window** (not token bucket):
- Uses GitHub's `X-RateLimit-Reset` header
- Waits until reset time when limit reached
- No premature request blocking
- Respects per-resource limits

### Caching Strategy

**ETag-based** (not time-based):
- Stores `ETag` header from responses
- Sends `If-None-Match` on subsequent requests
- Server returns 304 if unchanged
- Reduces bandwidth and API quota usage

## Performance

### API Efficiency

| Operation | REST Calls | GraphQL Cost | Cached |
|-----------|------------|--------------|--------|
| getTask | 1 (conditional) | 0 | Yes |
| getTasksByQueue | N (pagination) | ~1 per page | No |
| createTask | 1 | 0 | No |
| updateTask | 1 | 0 | No |
| addLabel | 1 | 0 | No |

### Rate Limit Impact

- REST API: 5000 requests/hour per installation
- GraphQL: 5000 points/hour
- ETag caching reduces actual API usage by ~60-80%

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { GitHubService } from './services/github-service';

describe('GitHubService', () => {
  it('should handle rate limiting', async () => {
    const service = new GitHubService(config, authManager);
    // Test implementation
  });
});
```

## Best Practices

1. **Use Queue Labels**: Organize tasks with `queue:backlog`, `queue:ready`, etc.
2. **Monitor Rate Limits**: Check `getRateLimitInfo()` in long-running processes
3. **Leverage Caching**: ETag caching is automatic, use `getTask()` frequently
4. **Handle Errors**: Catch specific error types for better UX
5. **GraphQL for Bulk**: Use `getTasksByQueue()` for multiple issues

## Troubleshooting

### Rate Limit Exceeded

```typescript
try {
  await service.createTask(params);
} catch (error) {
  if (error instanceof GitHubRateLimitError) {
    console.log(`Wait ${error.retryAfter}ms until reset`);
  }
}
```

### Authentication Failed

```typescript
try {
  await service.initializeOctokit();
} catch (error) {
  if (error instanceof GitHubAuthError) {
    console.log('Check GitHub App credentials');
  }
}
```

### Token Rotation

Tokens auto-rotate, but you can force refresh:

```typescript
await authManager.clearCache();
await service.initializeOctokit();
```

## Migration from REST

The service transforms GraphQL responses to REST format for consistency:

```typescript
// Both return same type
const rest = await service.getTask(123); // REST API
const graphql = await service.getTasksByQueue('ready'); // GraphQL
```

## See Also

- [GitHub App Authentication](./github-app-auth.ts)
- [Type Definitions](../../../types/github-integration.ts)
- [Tests](./__tests__/github-service.test.ts)
