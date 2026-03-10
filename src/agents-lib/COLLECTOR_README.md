# Result Collector for Parallel Agent Delegation

## Overview

The `ResultCollector` is a comprehensive system for collecting and aggregating results from parallel agent delegations. It handles partial failures, timeouts, duplicate results, and provides detailed statistics for multi-agent workflows.

## Features

- **Automatic Result Collection**: Collect results from multiple parallel agents
- **Timeout Handling**: Per-agent timeout with partial result support
- **Duplicate Detection**: Automatically detects and flags duplicate results
- **Comprehensive Statistics**: Success rate, duration metrics, percentiles, error breakdown
- **Multiple Export Formats**: JSON and CSV export
- **Progress Tracking**: Real-time progress updates during collection
- **Incremental Collection**: Stream results as they arrive

## Installation

```bash
cd /tmp/ultrapilot
npm install
```

## Quick Start

```typescript
import { ResultCollector } from './src/wshobson/collector.js';

// Create a collector
const collector = new ResultCollector({
  timeout: 30000,           // 30 second timeout per agent
  waitForAll: true,         // Wait for all agents to complete
  allowPartialResults: true, // Return partial results on timeout
  detectDuplicates: true,   // Detect and flag duplicate results
});

// Collect results from parallel execution
const results = await collector.collect(parallelResults, 'exec-123');

// Access statistics
console.log(`Success rate: ${results.statistics.successRate}`);
console.log(`Average duration: ${results.statistics.averageDuration}ms`);

// Get summary
console.log(collector.summarize(results));
```

## Core Concepts

### ParallelDelegationResult

A single result from one agent execution:

```typescript
interface ParallelDelegationResult extends DelegationResult {
  agentId: string;                    // Unique agent ID
  taskId: string;                     // Task identifier
  parallelExecutionId: string;        // Execution group ID
  startTime: number;                  // Start timestamp (ms)
  endTime: number;                    // End timestamp (ms)
  completed: boolean;                 // Whether completed
  timedOut: boolean;                  // Whether timed out
  duplicate: boolean;                 // Whether duplicate
  order: number;                      // Completion order
}
```

### CollectedResults

Aggregated results from all agents:

```typescript
interface CollectedResults {
  successful: ParallelDelegationResult[];      // Successful results
  failed: ParallelDelegationResult[];          // Failed results
  total: number;                               // Total count
  successCount: number;                        // Success count
  failureCount: number;                        // Failure count
  duration: number;                            // Total duration (ms)
  statistics: ResultStatistics;                // Detailed statistics
  agentBreakdown: Record<string, AgentResultInfo>;  // Per-agent info
  duplicateResults: ParallelDelegationResult[];     // Duplicate results
  timeoutResults: ParallelDelegationResult[];       // Timeout results
  partialResults: boolean;                     // Partial completion
  parallelExecutionId: string;                 // Execution ID
}
```

### ResultStatistics

Comprehensive statistics:

```typescript
interface ResultStatistics {
  successRate: number;         // 0-1
  averageDuration: number;     // milliseconds
  minDuration: number;         // milliseconds
  maxDuration: number;         // milliseconds
  medianDuration: number;      // milliseconds
  percentiles: {
    p50: number;  // Median
    p75: number;  // 75th percentile
    p90: number;  // 90th percentile
    p95: number;  // 95th percentile
    p99: number;  // 99th percentile
  };
  errorBreakdown: Record<string, number>;  // Error counts by code
  totalErrors: number;
  completionRate: number;      // 0-1
  duplicateRate: number;       // 0-1
  timeoutRate: number;         // 0-1
}
```

## Usage Examples

### Example 1: Basic Collection

```typescript
import { ResultCollector } from './src/wshobson/collector.js';

const collector = new ResultCollector();

// Assume you have results from parallel execution
const results = await collector.collect([
  {
    agentId: 'worker-1',
    taskId: 'task-1',
    parallelExecutionId: 'exec-001',
    success: true,
    output: 'Task completed',
    duration: 1000,
    agentName: 'business-analyst',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    completed: true,
    timedOut: false,
    duplicate: false,
    order: 0,
  },
  // ... more results
], 'exec-001');

console.log(`Success: ${results.successCount}/${results.total}`);
console.log(`Duration: ${results.duration}ms`);
```

### Example 2: Collection with Timeout

```typescript
// Start parallel agent executions
const pendingResults = agents.map(agent =>
  executeAgent(agent, task).then(result => ({
    ...result,
    agentId: agent.id,
    taskId: task.id,
    // ... other metadata
  }))
);

// Collect with 30s timeout per agent
const collected = await collector.collectWithTimeout(
  pendingResults,
  'exec-123'
);

console.log(`Completed: ${collected.successCount}`);
console.log(`Timed out: ${collected.timeoutResults.length}`);
```

### Example 3: Incremental Collection

```typescript
// Create a result stream
async function* resultGenerator() {
  for (const agent of agents) {
    yield await executeAgent(agent);
  }
}

// Collect incrementally as results arrive
const collected = await collector.collectIncremental(
  resultGenerator(),
  'exec-123',
  agents.length
);

console.log(`Collected ${collected.total} results`);
```

### Example 4: Progress Tracking

```typescript
const collector = new ResultCollector({
  onProgress: (update) => {
    console.log(`Progress: ${update.collected}/${update.total}`);
    console.log(`Successful: ${update.successful}`);
    console.log(`Failed: ${update.failed}`);
  },
});

const results = await collector.collect(pendingResults, 'exec-123');
```

### Example 5: Export Results

```typescript
// Export to JSON
const json = collector.exportToJSON(results, true);
console.log(json);

// Export to CSV
const csv = collector.exportToCSV(results);
console.log(csv);

// Write to file
fs.writeFileSync('results.json', json);
fs.writeFileSync('results.csv', csv);
```

### Example 6: Custom Configuration

```typescript
const collector = new ResultCollector({
  timeout: 60000,              // 60 second timeout
  waitForAll: true,            // Wait for all agents
  allowPartialResults: true,   // Allow partial results
  detectDuplicates: true,      // Detect duplicates
  calculatePercentiles: true,  // Calculate percentiles
  maxResults: 1000,           // Max 1000 results
  onProgress: (update) => {
    // Handle progress updates
  },
});
```

## API Reference

### ResultCollector

#### Constructor

```typescript
constructor(config?: CollectorConfig)
```

Creates a new result collector.

**Parameters:**
- `config` - Optional configuration object

**Configuration Options:**
- `timeout` - Per-agent timeout in milliseconds (default: 60000)
- `waitForAll` - Whether to wait for all agents (default: true)
- `allowPartialResults` - Allow partial results on timeout (default: true)
- `detectDuplicates` - Detect duplicate results (default: true)
- `calculatePercentiles` - Calculate percentile statistics (default: true)
- `maxResults` - Maximum number of results (default: Infinity)
- `onProgress` - Progress callback function

#### Methods

##### `collect(results, parallelExecutionId?)`

Collect results from parallel execution.

```typescript
async collect(
  results: ParallelDelegationResult[],
  parallelExecutionId?: string
): Promise<CollectedResults>
```

##### `collectWithTimeout(pendingResults, parallelExecutionId?)`

Collect results with per-agent timeout.

```typescript
async collectWithTimeout(
  pendingResults: Promise<ParallelDelegationResult>[],
  parallelExecutionId?: string
): Promise<CollectedResults>
```

##### `collectIncremental(resultStream, parallelExecutionId, expectedCount?)`

Collect results incrementally as they arrive.

```typescript
async collectIncremental(
  resultStream: AsyncIterable<ParallelDelegationResult>,
  parallelExecutionId?: string,
  expectedCount?: number
): Promise<CollectedResults>
```

##### `summarize(results)`

Create a human-readable summary.

```typescript
summarize(results: CollectedResults): string
```

##### `exportToJSON(results, pretty?)`

Export results to JSON.

```typescript
exportToJSON(results: CollectedResults, pretty?: boolean): string
```

##### `exportToCSV(results)`

Export results to CSV.

```typescript
exportToCSV(results: CollectedResults): string
```

##### `getConfig()`

Get current configuration.

```typescript
getConfig(): Required<CollectorConfig>
```

### Factory Function

##### `createCollector(config?)`

Create a collector instance.

```typescript
function createCollector(config?: CollectorConfig): ResultCollector
```

## Demo

Run the comprehensive demo:

```bash
cd /tmp/ultrapilot
npx tsx src/wshobson/collector-demo.ts
```

The demo includes:
1. Basic collection
2. Duplicate detection
3. Partial results handling
4. Timeout handling
5. Statistics and percentiles
6. Export functionality
7. Factory function usage

## Integration with Parallel Delegation

The ResultCollector integrates seamlessly with the parallel delegation system:

```typescript
import { WshobsonDelegator } from './src/wshobson/delegator.js';
import { ResultCollector } from './src/wshobson/collector.js';

const delegator = new WshobsonDelegator(repository);
const collector = new ResultCollector();

// Execute agents in parallel
const parallelResults = await Promise.all(
  agents.map(agent => delegator.delegateToAgent(
    agent.name,
    task,
    context
  ))
);

// Collect and analyze results
const collected = await collector.collect(
  parallelResults.map((result, index) => ({
    ...result,
    agentId: agents[index].id,
    taskId: task.id,
    parallelExecutionId: 'exec-123',
    startTime: Date.now() - result.duration,
    endTime: Date.now(),
    completed: result.success,
    timedOut: !result.success && result.error?.code === 'TIMEOUT',
    duplicate: false,
    order: index,
  }))
);

// Use collected results
console.log(collector.summarize(collected));
```

## Best Practices

### 1. Always Set Appropriate Timeouts

```typescript
const collector = new ResultCollector({
  timeout: 30000,  // Adjust based on your use case
});
```

### 2. Enable Partial Results for Long-Running Tasks

```typescript
const collector = new ResultCollector({
  allowPartialResults: true,  // Get partial results on timeout
});
```

### 3. Use Progress Callbacks for UI Updates

```typescript
const collector = new ResultCollector({
  onProgress: (update) => {
    updateUI(update);
  },
});
```

### 4. Export Results for Analysis

```typescript
const json = collector.exportToJSON(results);
fs.writeFileSync(`results-${Date.now()}.json`, json);
```

### 5. Handle Partial Results Gracefully

```typescript
const collected = await collector.collect(results);

if (collected.partialResults) {
  console.warn('Some agents did not complete');
  // Handle partial results
  console.log(`Successful: ${collected.successCount}`);
  console.log(`Failed: ${collected.failureCount}`);
}
```

## Error Handling

The collector handles various error scenarios:

### Timeouts

```typescript
const collector = new ResultCollector({
  timeout: 30000,
  allowPartialResults: true,
});

try {
  const collected = await collector.collectWithTimeout(pendingResults);
  if (collected.timeoutResults.length > 0) {
    console.warn(`${collected.timeoutResults.length} agents timed out`);
  }
} catch (error) {
  console.error('Collection failed:', error);
}
```

### Duplicates

```typescript
const collector = new ResultCollector({
  detectDuplicates: true,
});

const collected = await collector.collect(results);

if (collected.duplicateResults.length > 0) {
  console.warn(`Found ${collected.duplicateResults.length} duplicate results`);
  collected.duplicateResults.forEach(result => {
    console.log(`  Duplicate: ${result.agentId}/${result.taskId}`);
  });
}
```

### Validation Errors

```typescript
try {
  const collected = await collector.collect(results);
} catch (error) {
  if (error.message.includes('Results must be an array')) {
    console.error('Invalid input: results must be an array');
  } else if (error.message.includes('missing agentId')) {
    console.error('Invalid result: missing agentId');
  }
}
```

## Performance Considerations

### Memory Usage

- Set `maxResults` to limit memory usage
- Use incremental collection for large result sets
- Export and clear old results periodically

```typescript
const collector = new ResultCollector({
  maxResults: 10000,  // Limit to 10,000 results
});
```

### Calculation Overhead

- Disable percentiles for large result sets if not needed
- Use `calculatePercentiles: false` for faster collection

```typescript
const collector = new ResultCollector({
  calculatePercentiles: false,  // Faster collection
});
```

### Timeout Strategy

- Set appropriate timeouts based on task complexity
- Use `allowPartialResults: true` to avoid blocking on slow agents

```typescript
const collector = new ResultCollector({
  timeout: 60000,              // 60 second timeout
  allowPartialResults: true,   // Don't wait for slow agents
});
```

## Troubleshooting

### Issue: Collector returns empty results

**Solution**: Ensure results are properly formatted with required fields:

```typescript
{
  agentId: string,      // Required
  taskId: string,       // Required
  startTime: number,    // Required
  endTime: number,      // Required
  duration: number,     // Required
  // ... other fields
}
```

### Issue: Timeout occurs too quickly

**Solution**: Increase timeout value:

```typescript
const collector = new ResultCollector({
  timeout: 120000,  // 2 minutes
});
```

### Issue: Duplicates not detected

**Solution**: Ensure duplicate detection is enabled:

```typescript
const collector = new ResultCollector({
  detectDuplicates: true,
});
```

### Issue: Statistics are inaccurate

**Solution**: Ensure all results have valid duration values:

```typescript
results.forEach(result => {
  if (typeof result.duration !== 'number') {
    result.duration = result.endTime - result.startTime;
  }
});
```

## Testing

Run the demo to verify functionality:

```bash
cd /tmp/ultrapilot
npx tsx src/wshobson/collector-demo.ts
```

Expected output:
- All 7 demos complete successfully
- Statistics are calculated correctly
- Duplicates are detected
- Timeouts are handled properly
- Export formats work correctly

## Future Enhancements

Potential improvements for the ResultCollector:

1. **Streaming Export**: Export results incrementally to reduce memory usage
2. **Custom Aggregations**: Allow custom aggregation functions
3. **Real-Time Monitoring**: WebSocket support for real-time updates
4. **Persistence**: Save results to database automatically
5. **Visualization**: Built-in charts and graphs
6. **Filtering**: Filter results by various criteria
7. **Sorting**: Sort results by duration, success, etc.
8. **Grouping**: Group results by agent, task, etc.

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass
- TypeScript compilation succeeds
- JSDoc comments are complete
- Demo examples work correctly

## Support

For issues or questions:
1. Check the troubleshooting section
2. Run the demo to verify setup
3. Review the API reference
4. Check existing issues in the repository
