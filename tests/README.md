# Ultrapilot Test Suite

## Overview

Comprehensive test coverage for the Ultrapilot unified infrastructure, including integration tests, benchmarks, and backward compatibility verification.

## Test Structure

```
tests/
├── integration/
│   ├── agent-registry.test.ts       # Agent catalog validation
│   ├── parallel-executor.test.ts    # Parallel execution tests
│   └── backward-compatibility.test.ts # OMC flow compatibility
├── chat-bot.test.ts                 # Google Chat bot tests
├── gateway.test.ts                  # UltraX Gateway tests
└── server.test.ts                   # Gateway server tests
```

## Running Tests

### Run All Tests

```bash
cd /home/ubuntu/hscheema1979/ultrapilot
npm test
```

### Run Specific Test File

```bash
npm test -- agent-registry
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Run Benchmarks

```bash
npm test -- benchmarks
```

## Test Categories

### Integration Tests (`tests/integration/`)

#### agent-registry.test.ts
Tests the unified agent catalog:
- Agent catalog validation
- Agent.invoke() for all agents
- Agent metadata verification
- Agent discovery by domain/capability/model
- Error handling and edge cases

**Coverage**: 20+ agents across multiple domains

#### parallel-executor.test.ts
Tests parallel execution system:
- Parallel execution with 3 agents
- File ownership boundaries
- Coordination and synchronization
- Error handling for failed tasks
- Performance characteristics

**Coverage**: Mock parallel executor with realistic scenarios

#### backward-compatibility.test.ts
Tests compatibility with legacy OMC flows:
- Legacy command support (`/ultrapilot`, `/ultra-team`, `/ultra-ralph`)
- Legacy skill invocation patterns
- State management continuity
- Plugin compatibility (context7, github, playwright)
- No breaking changes for users

**Coverage**: All legacy workflows and commands

### Unit Tests (`tests/*.test.ts`)

#### gateway.test.ts
Tests UltraX Gateway API server:
- Session management
- Message handling
- Agent integration
- Access control

#### server.test.ts
Tests Gateway HTTP server:
- Express server setup
- Route handling
- Error handling
- WebSocket support

#### chat-bot.test.ts
Tests Google Chat integration:
- Bot initialization
- Message handling
- Claude Code integration

## Benchmarks (`benchmarks/`)

### performance.md
Documentation of benchmark results:
- Sequential vs parallel execution
- Performance improvements (3-5x)
- Scaling analysis
- Bottleneck analysis
- Real-world scenarios

### parallel-benchmark.test.ts
Executable benchmarks:
- 3-agent parallel execution
- Scaling with agent count
- Memory overhead
- Feature development scenarios
- Bug investigation scenarios
- Code review scenarios

**Expected Results**:
- 3 agents: 2.75x speedup
- 5 agents: 3.9x speedup
- 10 agents: 6.1x speedup

## Test Data

### Mock Data

Tests use realistic mock data:
- Agent definitions from AGENT_CATALOG
- File ownership scenarios
- Task execution patterns
- State management structures

### Performance Baselines

Benchmarks establish performance baselines:
- Sequential execution: ~550ms per task
- Parallel execution: ~200ms per task (amortized)
- Memory overhead: ~3x for 3x parallelism

## Coverage Goals

Current coverage targets:
- Integration tests: 80%+
- Unit tests: 90%+
- Critical paths: 95%+

## Continuous Integration

Tests run on:
- Every commit
- Every pull request
- Release candidates

## Troubleshooting

### Tests Failing

1. Ensure dependencies are installed:
   ```bash
   npm install
   ```

2. Rebuild the project:
   ```bash
   npm run build
   ```

3. Clear test cache:
   ```bash
   npm test -- --clearCache
   ```

### Benchmarks Inconsistent

Benchmarks use mock delays and may vary:
- Focus on relative performance (speedup factor)
- Ignore absolute timing variations
- Run multiple times for stable results

## Adding New Tests

### Integration Test Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Benchmark Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Performance Benchmark', () => {
  it('should measure performance', async () => {
    const start = Date.now();
    // Execute code
    const time = Date.now() - start;

    expect(time).toBeLessThan(threshold);
  });
});
```

## Test Utilities

Available utilities:
- `MockParallelExecutor`: Mock parallel execution
- `BenchmarkSuite`: Performance measurement
- Mock agent definitions from AGENT_CATALOG

## Documentation

- See MIGRATION.md for backward compatibility details
- See benchmarks/performance.md for benchmark methodology
- See ULTRAPILOT-ARCHITECTURE.md for system architecture

---

*Last Updated: 2026-03-02*
*Test Framework: Vitest*
