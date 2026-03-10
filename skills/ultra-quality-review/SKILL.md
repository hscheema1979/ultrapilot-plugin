# Ultra Quality Review

## Trigger Keywords
- "ultra quality review", "quality review", "performance review", "complexity review"
- "review performance", "check complexity", "memory review"
- "release readiness", "production readiness"

## Description
Comprehensive quality review covering performance, algorithmic complexity, memory usage, and release readiness. Provides detailed analysis with metrics and recommendations.

## Review Areas

### 1. Performance Analysis
- Algorithmic complexity (Big O notation)
- Database query efficiency
- I/O operation optimization
- Caching strategies
- Hot path identification
- Bottleneck detection

### 2. Complexity Metrics
- Cyclomatic complexity per function
- Nesting depth
- Function length
- File length
- Parameter count
- Cognitive load assessment

### 3. Memory Usage
- Memory allocation patterns
- Memory leak risks
- Data structure efficiency
- Buffer sizing
- Resource cleanup
- Garbage collection impact

### 4. Release Readiness
- Test coverage percentage
- Error handling completeness
- Logging adequacy
- Configuration management
- Documentation quality
- Breaking changes assessment

## Key Metrics

### Performance
- Function complexity targets
- Response time thresholds
- Throughput requirements
- Database query patterns
- Network call efficiency

### Code Health
- Maximum function length (target: <50 lines)
- Maximum file length (target: <300 lines)
- Maximum cyclomatic complexity (target: <10)
- Test coverage (target: >80%)

### Benchmarks
- Current performance measurements
- Comparison to baselines
- Regression detection
- SLA compliance

## Output Format

```markdown
# Ultra Quality Review

## Performance Analysis
- [ ] Algorithmic complexity reviewed
- [ ] Hot paths identified
- [ ] Bottlenecks documented
- [ ] Optimization opportunities listed

## Complexity Metrics
- [ ] Function complexity analyzed
- [ ] File length reviewed
- [ ] Nesting depth assessed
- [ ] Refactoring recommendations provided

## Memory Usage
- [ ] Allocation patterns reviewed
- [ ] Memory leak risks identified
- [ ] Data structure efficiency checked
- [ ] Resource cleanup verified

## Release Readiness
- [ ] Test coverage measured
- [ ] Error handling reviewed
- [ ] Logging adequacy checked
- [ ] Documentation quality assessed
- [ ] Breaking changes documented

## Detailed Findings

### Critical Issues
[Performance/complexity/memory issues that must be fixed]

### Recommendations
[Specific improvements with priority levels]

### Metrics Summary
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Test Coverage | X% | >80% | ✅/❌ |
| Avg Function Length | X | <50 | ✅/❌ |
| Max Complexity | X | <10 | ✅/❌ |
```

## Standards Enforced

### Algorithmic Standards
- Prefer O(n) over O(n²) where possible
- Use appropriate data structures (e.g., Map vs array for lookups)
- Avoid nested loops when single pass will do
- Consider space-time tradeoffs

### Memory Standards
- Minimize allocations in hot paths
- Reuse buffers where appropriate
- Clean up resources promptly
- Avoid memory leaks (event listeners, caches, timers)

### Async Standards
- Use async/await for I/O operations
- Avoid blocking the event loop
- Implement proper error handling
- Consider concurrency limits

## Usage

```bash
# Review entire codebase
/ultra-quality-review

# Review specific files
/ultra-quality-review src/api/users.ts

# Review with focus area
/ultra-quality-review --focus performance

# Review for release readiness
/ultra-quality-review --release
```

## Examples

### Before (High Complexity)
```typescript
// O(n²) nested loop
function findDuplicates(arr: string[]): string[] {
  const duplicates: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}
```

### After (Optimized)
```typescript
// O(n) using Set
function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    } else {
      seen.add(item);
    }
  }

  return Array.from(duplicates);
}
```

## Integration

Routes to `ultra-quality-reviewer` agent with model="sonnet" for standard reviews or model="opus" for complex systems.

Works with:
- `quality-reviewer` agent for general quality assessment
- `security-reviewer` agent for vulnerability analysis
- `code-reviewer` agent for comprehensive reviews
