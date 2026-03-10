# SQLite Agent Repository

## Overview

The `SQLiteAgentRepository` is a production-quality SQLite backend for the agent registry, providing persistent storage with indexed queries, transaction support, and data migration capabilities.

## Features

### Core Capabilities

- **Persistent Storage**: SQLite database with ACID guarantees
- **Fast Indexed Queries**: Optimized indexes for common query patterns
- **Transaction Support**: Multi-operation atomic transactions
- **Migration Utilities**: Import/export and InMemory-to-SQLite migration
- **Circuit Breaker Persistence**: Stateful circuit breaker data
- **Performance Optimized**: WAL mode, prepared statements, batch operations

### Database Schema

```sql
-- Agents table
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  plugin TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  category TEXT,
  examples TEXT,              -- JSON array
  metadata TEXT,              -- JSON object
  status TEXT NOT NULL DEFAULT 'idle',
  lastUsed INTEGER NOT NULL DEFAULT 0,
  successRate REAL NOT NULL DEFAULT 0.0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Capabilities table (many-to-many)
CREATE TABLE capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  hierarchy TEXT,             -- JSON array
  confidence REAL NOT NULL DEFAULT 0.0,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Circuit breaker state
CREATE TABLE circuit_breaker (
  agent_name TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed',
  failureCount INTEGER NOT NULL DEFAULT 0,
  lastFailureTime INTEGER NOT NULL DEFAULT 0,
  nextAttemptTime INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0
);
```

### Indexes

Performance-optimized indexes for common queries:

- `idx_agents_name`: Unique index on agent name
- `idx_agents_plugin`: Plugin-based queries
- `idx_agents_category`: Category filtering
- `idx_agents_status`: Status-based queries
- `idx_agents_success_rate`: Smart selection queries
- `idx_capabilities_name`: Capability lookups
- `idx_capabilities_agent_id`: JOIN operations
- `idx_agents_plugin_status`: Composite (plugin + status)
- `idx_capabilities_name_confidence`: Composite (name + confidence)

## Installation

```bash
npm install better-sqlite3 @types/better-sqlite3
```

## Usage

### Basic Usage

```typescript
import { createSQLiteRepository } from './repositories/sqlite.js';

// Create repository
const repo = await createSQLiteRepository('/path/to/plugins');

// Find agents by capability
const agents = await repo.findAgents('analysis');

// Advanced query
const results = await repo.query({
  capabilities: ['backend', 'api'],
  minSuccessRate: 0.7,
  status: 'idle',
  limit: 5,
});

// Cleanup
await repo.destroy();
```

### Factory Function

```typescript
import { createRepository } from './repositories/sqlite.js';

// Create by backend type
const sqliteRepo = await createRepository('sqlite', '/path/to/plugins');
const memoryRepo = await createRepository('memory', '/path/to/plugins');
```

### Migration from InMemory

```typescript
import { InMemoryAgentRepository } from './repositories/in-memory.js';
import { migrateInMemoryToSQLite } from './repositories/sqlite.js';

// Create InMemory repository
const memoryRepo = new InMemoryAgentRepository();
await memoryRepo.initialize('/path/to/plugins');

// Migrate to SQLite
const sqliteRepo = await migrateInMemoryToSQLite(
  memoryRepo,
  '/path/to/database.db'
);
```

### Performance Benchmarking

```typescript
import { benchmarkRepositories } from './repositories/sqlite.js';

const results = await benchmarkRepositories('/path/to/plugins', 100);
console.log(`InMemory: ${results.inMemory}ms`);
console.log(`SQLite: ${results.sqlite}ms`);
console.log(`Winner: ${results.winner}`);
```

### Export/Import

```typescript
// Export to JSON
const jsonData = await repo.exportToJSON();
await fs.writeFile('backup.json', jsonData);

// Import from JSON
const jsonData = await fs.readFile('backup.json', 'utf-8');
await repo.importFromJSON(jsonData);
```

## API Reference

### Constructor

```typescript
new SQLiteAgentRepository(dbPath?: string)
```

- `dbPath`: Optional database path (defaults to `.wshobson-sqlite.db` in plugins directory)

### Methods

#### Query Operations

- `findAgents(capability: string): Promise<Agent[]>` - Find agents by capability (sorted by score)
- `findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]>` - Find agents with ALL capabilities (AND logic)
- `findAgentsByPlugin(pluginName: string): Promise<Agent[]>` - Find agents by plugin
- `query(options: QueryOptions): Promise<Agent[]>` - Advanced multi-criteria query
- `getAgent(name: string): Promise<Agent | undefined>` - Get specific agent
- `search(keyword: string): Promise<Agent[]>` - Search by keyword

#### State Operations

- `save(agent: Agent): Promise<void>` - Save or update agent
- `saveBatch(agents: Agent[]): Promise<void>` - Bulk save agents
- `invalidate(agentName: string): Promise<void>` - Remove agent from cache
- `refresh(): Promise<void>` - Rescan plugins

#### Transactions

- `transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T>` - Execute transaction

#### Lifecycle

- `initialize(pluginsDir: string): Promise<void>` - Initialize repository
- `load(): Promise<boolean>` - Load from cache
- `saveCache(): Promise<void>` - Save cache (no-op for SQLite)
- `destroy(): Promise<void>` - Cleanup and close

#### Statistics

- `getStats(): Promise<RegistryStats>` - Get repository statistics

#### Utilities

- `optimize(): Promise<void>` - VACUUM + ANALYZE for performance
- `exportToJSON(): Promise<string>` - Export database to JSON
- `importFromJSON(jsonData: string): Promise<void>` - Import from JSON

## Query Options

```typescript
interface QueryOptions {
  capabilities?: string[];      // Filter by capabilities (AND logic)
  category?: string;             // Filter by category
  status?: 'idle' | 'working' | 'failed';  // Filter by status
  limit?: number;                // Max results
  minScore?: number;             // Minimum capability score
  minSuccessRate?: number;       // Minimum success rate (0-1)
}
```

## Performance Characteristics

### Query Performance

- **Single capability lookup**: O(log n) with index
- **Multi-capability query**: O(n) with index optimization
- **Plugin-based query**: O(log n) with index
- **Full-text search**: O(n) with LIKE operator

### Write Performance

- **Single agent save**: O(1) for agent, O(m) for capabilities (m = capabilities per agent)
- **Batch save**: O(n*m) within transaction
- **Index rebuild**: Automatic on data modification

### Optimization Recommendations

1. **Use transactions** for batch operations
2. **Run `optimize()`** periodically for best performance
3. **Use indexed queries** (capability, plugin, status) when possible
4. **Limit result sets** with `limit` option

## Comparison: InMemory vs SQLite

| Feature | InMemory | SQLite |
|---------|----------|--------|
| **Query Speed** | Fastest (in-process) | Fast (indexed) |
| **Persistence** | JSON cache | SQLite database |
| **Concurrency** | Mutex protected | WAL mode |
| **Memory Usage** | High (all in RAM) | Low (disk-backed) |
| **Scalability** | Limited (~10K agents) | High (100K+ agents) |
| **Transaction Support** | No-op | Full ACID |
| **Use Case** | Development, small datasets | Production, large datasets |

## Error Handling

The repository throws errors for:

- Invalid plugins directory path
- Database access errors
- Constraint violations (duplicate agent names)
- Transaction failures

Always use try-catch when calling repository methods:

```typescript
try {
  await repo.save(agent);
} catch (error) {
  console.error('Failed to save agent:', error);
}
```

## Circuit Breaker Integration

```typescript
// Get circuit breaker state
const state = repo.getCircuitBreakerState();

// Update circuit breaker state
repo.saveCircuitBreakerState({
  'agent-name': {
    state: 'open',
    failureCount: 5,
    lastFailureTime: Date.now(),
    nextAttemptTime: Date.now() + 60000,
    successCount: 0,
  },
});
```

## Best Practices

1. **Always close connections**: Call `destroy()` when done
2. **Use transactions**: For multi-step operations
3. **Optimize periodically**: Run `optimize()` after bulk changes
4. **Monitor performance**: Use `benchmarkRepositories()` to compare backends
5. **Handle errors**: Always wrap calls in try-catch
6. **Use appropriate backend**: InMemory for dev, SQLite for production

## Testing

Run the demo suite:

```bash
node dist/wshobson/repositories/sqlite-demo.js /path/to/plugins
```

Or run specific demos:

```typescript
import { runAllDemos } from './repositories/sqlite-demo.js';
await runAllDemos('/path/to/plugins');
```

## Troubleshooting

### Database locked errors

- Ensure only one process accesses the database at a time
- Use WAL mode (enabled by default)
- Close connections properly with `destroy()`

### Slow queries

- Run `optimize()` to rebuild indexes
- Check query execution plan with `EXPLAIN QUERY PLAN`
- Ensure indexes are created for common query patterns

### Migration issues

- Verify InMemory repository is fully initialized before migration
- Check database file permissions
- Ensure sufficient disk space for target database

## License

MIT
