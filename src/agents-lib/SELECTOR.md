# Agent Selector System

## Overview

The `AgentSelector` is an intelligent task-to-agent matching system that analyzes natural language task descriptions and selects the most appropriate agent based on multiple factors:

- **Capability matching** (exact > partial > no match)
- **Historical success rate**
- **Category alignment**
- **Current status** (prefer idle agents)
- **Task complexity** (simple vs. complex)

## Installation

```typescript
import { AgentSelector } from './wshobson/selector.js';
import { InMemoryAgentRepository } from './wshobson/repositories/in-memory.js';

// Initialize repository
const repository = new InMemoryAgentRepository();
await repository.initialize('/path/to/plugins');

// Create selector
const selector = new AgentSelector(repository);
```

## Basic Usage

### Simple Selection

```typescript
const selection = await selector.selectAgent(
  'Create a REST API for user management'
);

console.log(`Selected: ${selection.agent.name}`);
console.log(`Confidence: ${(selection.confidence * 100).toFixed(1)}%`);
console.log(`Reasoning: ${selection.reasoning}`);
```

### Selection with Options

```typescript
const selection = await selector.selectAgent(
  'Create a REST API',
  {
    maxAgents: 3,              // Get top 3 candidates
    minConfidence: 0.5,        // Minimum 50% confidence
    fallbackChain: true,       // Generate fallback chain
    considerSuccessRate: true, // Weight by historical success
    preferIdle: true,          // Prefer idle agents
    category: 'backend',       // Filter by category
  }
);

// Primary selection
console.log('Primary:', selection.agent.name);

// Fallback chain (if primary fails)
console.log('Fallbacks:', selection.fallbackChain.map(a => a.name).join(', '));

// Alternatives (next best candidates)
console.log('Alternatives:', selection.alternatives.map(a => a.name).join(', '));
```

## Task Analysis

The selector analyzes tasks to extract:

### Capabilities

Extracts required capabilities using keyword mapping:

```typescript
const analysis = selector.analyzeTask('Write integration tests for the API');

console.log(analysis.capabilities);
// ['testing', 'integration-test', 'api']
```

Supported keyword mappings:
- `api` → ['api', 'rest-api', 'backend']
- `test` → ['testing', 'unit-test']
- `react` → ['frontend', 'react', 'ui']
- `deploy` → ['deployment', 'devops']
- ... and many more

### Complexity Detection

Automatically detects task complexity:

```typescript
const simple = selector.analyzeTask('Fix a simple bug');
console.log(simple.complexity); // 'simple'

const complex = selector.analyzeTask('Design a comprehensive distributed system');
console.log(complex.complexity); // 'complex'
```

Complexity affects confidence scoring:
- **Simple tasks**: +10% confidence boost
- **Complex tasks**: -15% confidence penalty
- **Medium tasks**: No adjustment

### Category Detection

Detects task category for better matching:

```typescript
const analysis = selector.analyzeTask('Build a React component');
console.log(analysis.category); // 'frontend'
```

Supported categories:
- `backend`, `frontend`, `devops`
- `testing`, `documentation`, `analysis`
- `architecture`, `quality`, `security`

## Scoring System

### Capability Score

How well an agent matches required capabilities:

- **Exact match**: 1.0 (e.g., "api" matches "api")
- **Partial match**: 0.5-0.9 (e.g., "api" matches "rest-api")
- **No match**: 0.0

```typescript
// Exact match
const agent1 = { capabilities: [{ name: 'api', confidence: 0.8 }] };
// Score: 0.8 * 1.0 = 0.8

// Partial match (hierarchical)
const agent2 = { capabilities: [{ name: 'rest-api', confidence: 0.9 }] };
// Score: 0.9 * 0.7 = 0.63
```

### Success Rate Score

Historical performance (0-1):

```typescript
const agent = { successRate: 0.95 };
// Success score: 0.95
```

### Category Score

Alignment between task category and agent category:

- **Exact match**: 1.0
- **Related**: 0.7
- **Unrelated**: 0.3

### Status Score

Current agent status (when `preferIdle: true`):

- **Idle**: 1.0
- **Working**: 0.5
- **Failed**: 0.2

### Final Score Calculation

```
totalScore =
  (capabilityScore * 0.5) +
  (successRateScore * 0.3) +
  (categoryScore * 0.1) +
  (statusScore * 0.1)

confidence = adjustForComplexity(totalScore)
```

## Advanced Usage

### Get Multiple Candidates

```typescript
const candidates = await selector.getCandidates('Create an API', 5);

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  console.log(`${i + 1}. ${c.agent.name}`);
  console.log(`   Total: ${(c.totalScore * 100).toFixed(0)}%`);
  console.log(`   Capability: ${(c.capabilityScore * 100).toFixed(0)}%`);
  console.log(`   Success: ${(c.successRateScore * 100).toFixed(0)}%`);
  console.log(`   Category: ${(c.categoryScore * 100).toFixed(0)}%`);
  console.log(`   Status: ${(c.statusScore * 100).toFixed(0)}%`);
}
```

### Custom Category Filtering

```typescript
const selection = await selector.selectAgent(
  'Create a user interface',
  { category: 'frontend' }
);
```

### Success Rate Optimization

```typescript
const selection = await selector.selectAgent(
  'Implement complex feature',
  {
    considerSuccessRate: true,
    minConfidence: 0.7,
  }
);
```

## Interface Reference

### `SelectionOptions`

```typescript
interface SelectionOptions {
  maxAgents?: number;        // Return top N candidates (default: 1)
  minConfidence?: number;    // Minimum confidence (default: 0.3)
  fallbackChain?: boolean;   // Generate fallbacks (default: true)
  considerSuccessRate?: boolean;  // Weight by success (default: true)
  preferIdle?: boolean;      // Prefer idle agents (default: true)
  category?: string;         // Filter by category
}
```

### `AgentSelection`

```typescript
interface AgentSelection {
  agent: Agent;              // Selected agent
  confidence: number;        // Confidence score (0-1)
  reasoning: string;         // Human-readable explanation
  fallbackChain: Agent[];    // Alternatives if primary fails
  alternatives: Agent[];     // Next best candidates
  taskAnalysis: TaskAnalysis; // Analysis details
}
```

### `TaskAnalysis`

```typescript
interface TaskAnalysis {
  capabilities: string[];    // Required capabilities
  category?: string;         // Detected category
  complexity: 'simple' | 'medium' | 'complex';
  keyPhrases: string[];      // Key influencing phrases
}
```

## Examples

### Example 1: API Development

```typescript
const selection = await selector.selectAgent(
  'Create a REST API for user management with authentication'
);

// Output:
// Selected: backend-developer
// Confidence: 89%
// Reasoning: Selected "backend-developer" (backend) with capabilities:
//             api, rest-api, authentication (capability: 90%, success rate: 95%,
//             category: 100%) for medium task from 2 candidates
```

### Example 2: Frontend Task

```typescript
const selection = await selector.selectAgent(
  'Build a responsive React component with TypeScript'
);

// Output:
// Selected: frontend-developer
// Confidence: 92%
// Reasoning: Selected "frontend-developer" (frontend) with capabilities:
//             ui, react (capability: 85%, success rate: 90%, category: 100%)
//             for simple task from 2 candidates
```

### Example 3: Complex Architecture

```typescript
const selection = await selector.selectAgent(
  'Design a comprehensive distributed microservices architecture'
);

// Output:
// Selected: system-architect
// Confidence: 75%
// Reasoning: Selected "system-architect" (architecture) with capabilities:
//             architecture, system-design (capability: 95%, success rate: 85%,
//             category: 100%) for complex task from 1 candidate
```

## Best Practices

1. **Provide clear task descriptions**: Include specific technologies and goals
   ```
   Good: "Create a REST API with JWT authentication"
   Bad: "Do backend stuff"
   ```

2. **Use fallback chains**: Enable fallback chains for resilience
   ```typescript
   const selection = await selector.selectAgent(task, {
     fallbackChain: true,
   });
   ```

3. **Adjust confidence thresholds**: Set appropriate minimums for your use case
   ```typescript
   const selection = await selector.selectAgent(task, {
     minConfidence: 0.7, // High confidence for critical tasks
   });
   ```

4. **Consider task complexity**: Simple tasks get confidence boost
   ```typescript
   // Simple task: +10% confidence
   await selector.selectAgent('Fix a simple bug');

   // Complex task: -15% confidence
   await selector.selectAgent('Design distributed system');
   ```

5. **Filter by category**: When you know the domain
   ```typescript
   await selector.selectAgent(task, { category: 'testing' });
   ```

## Performance Considerations

- **Capability extraction**: O(n) where n = number of keywords
- **Candidate filtering**: O(m) where m = number of agents
- **Scoring**: O(m * k) where k = average capabilities per agent
- **Typical performance**: <10ms for 100 agents

## Error Handling

```typescript
try {
  const selection = await selector.selectAgent(task);
} catch (error) {
  if (error.message.includes('No agents found')) {
    console.log('No agents match the requirements');
    // Handle gracefully: use general agent or prompt user
  }
}
```

## Testing

Run the demo to see the selector in action:

```bash
node src/wshobson/selector-demo.ts
```

Run tests:

```bash
npm test -- selector.test.ts
```

## Future Enhancements

Potential improvements:

1. **Learning from selections**: Track which selections worked well
2. **User feedback**: Incorporate user ratings of selections
3. **Multi-agent tasks**: Select teams for complex tasks
4. **Time-based selection**: Consider agent availability schedules
5. **Cost optimization**: Select based on resource cost

## Contributing

When adding new keyword mappings:

1. Add to `KEYWORD_CAPABILITY_MAP` in selector.ts
2. Add category keywords to `CATEGORY_KEYWORDS`
3. Update this documentation
4. Add tests for new mappings

Example:

```typescript
const KEYWORD_CAPABILITY_MAP: Record<string, string[]> = {
  // ... existing mappings
  'graphql': ['graphql', 'api', 'backend'],
  'websocket': ['websocket', 'realtime', 'backend'],
};
```

## License

MIT
