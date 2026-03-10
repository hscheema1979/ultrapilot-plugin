# wshobson Result Synthesis System

## Overview

The Result Synthesis System combines outputs from multiple parallel agents into unified documents with intelligent conflict detection and resolution.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ResultSynthesizer                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐    │
│  │   Conflict   │──│   Strategy    │──│    Merge     │    │
│  │   Detector   │  │   Selector    │  │    Engine    │    │
│  └──────────────┘  └───────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  SynthesisResult        │
              │  - unified: string      │
              │  - conflicts: Conflict[]│
              │  - metadata: {...}      │
              └─────────────────────────┘
```

## Components

### 1. ResultSynthesizer (`synthesizer.ts`)

Main orchestrator for the synthesis process.

**Key Methods:**
- `synthesize(results, strategy, options)`: Main entry point
- `detectConflicts(results)`: Find conflicts across all results
- `mergeContent(results, conflicts, resolutions)`: Combine resolved content

**Example:**
```typescript
const synthesizer = new ResultSynthesizer(repo, workspacePath);
const result = await synthesizer.synthesize(
  collectedResults,
  'weighted-vote',
  {
    securityVeto: true,
    architectTieBreaker: true,
    logConflicts: true
  }
);

console.log(result.unified);        // Merged document
console.log(result.conflicts);      // Any conflicts
console.log(result.metadata);       // Statistics
```

### 2. Conflict Detection

The `ConflictDetector` class identifies three types of conflicts:

#### Content Conflicts
Different recommendations for the same topic.
```typescript
// Agent 1 says: "Use tabs for indentation"
// Agent 2 says: "Use spaces for indentation"
// → Content conflict detected
```

#### Technical Conflicts
Different implementations or library choices.
```typescript
// Agent 1 uses: "import { foo } from 'lib-a'"
// Agent 2 uses: "import { bar } from 'lib-b'"
// → Technical conflict if libraries are incompatible
```

#### Security Conflicts
Different security approaches.
```typescript
// Agent 1 recommends: "Store session in localStorage"
// Agent 2 (security) recommends: "Store session in httpOnly cookie"
// → Security conflict detected
```

### 3. Synthesis Strategies

#### Merge Strategy (`merge-strategy.ts`)
Combines non-conflicting sections, marks conflicts for later review.

**Use case:** Preserve all contributions, manual review

```typescript
const result = await synthesizer.synthesize(results, 'merge');
// Output: Non-conflicting sections merged
// Conflicts marked with <!-- CONFLICT --> markers
```

#### Vote Strategy (`vote-strategy.ts`)
Majority vote for conflict resolution.

**Use case:** Democratic resolution with 3+ agents

```typescript
const result = await synthesizer.synthesize(results, 'vote');
// Output: Winning option per majority vote
// Annotation: <!-- Majority vote (67%) -->
```

#### Weighted Vote Strategy (`weighted-vote-strategy.ts`)
Weighted voting with special rules.

**Special rules:**
- Security reviewer: 2x weight, veto power for security conflicts
- Architect: 1.5x weight, tie-breaker for technical conflicts
- Quality reviewer: 1.2x weight
- Other agents: 1x weight

**Use case:** Domain expert influence

```typescript
const result = await synthesizer.synthesize(results, 'weighted-vote', {
  weights: {
    'ultra:security-reviewer': 2.0,
    'ultra:architect': 1.5
  },
  securityVeto: true,
  architectTieBreaker: true
});
// Output: Weighted vote winner with annotations
```

#### Conflict Strategy (`conflict-strategy.ts`)
Mark all conflicts for human resolution.

**Use case:** Manual review required

```typescript
const result = await synthesizer.synthesize(results, 'conflict');
// Output: All conflicts marked with detailed options
// Format: ⚠️ CONFLICT REQUIRES HUMAN RESOLUTION
```

#### Arbitrator Strategy (`arbitrator-strategy.ts`)
Delegate to `ultra:arbitrator` agent for resolution.

**Use case:** AI-assisted conflict resolution

```typescript
const result = await synthesizer.synthesize(results, 'arbitrator');
// Output: Arbitrator's decision (or fallback if unavailable)
// Annotation: <!-- Arbitrator decision -->
```

### 4. Voting Mechanism (`voting.ts`)

Standalone voting system for conflict resolution.

**Features:**
- Configurable agent weights
- Security veto power
- Architect tie-breaker
- Consensus threshold escalation
- Conflict logging to `.ultra/conflicts.json`

**Example:**
```typescript
const voting = new VotingMechanism(workspacePath);
const result = await voting.resolveConflict(
  {
    type: 'security',
    description: 'Authentication method choice',
    location: 'auth.ts'
  },
  [
    { agent: 'ultra:security-reviewer', content: 'Use OAuth 2.0' },
    { agent: 'ultra:executor', content: 'Use basic auth' }
  ],
  {
    securityVeto: true,
    architectTieBreaker: true,
    minConsensus: 0.6
  }
);

// result.method === 'veto' (security reviewer wins)
// result.winner === 'Use OAuth 2.0'
```

## Conflict Logging

All conflicts are logged to `.ultra/conflicts.json`:

```json
{
  "conflicts": [
    {
      "timestamp": "2026-03-02T12:00:00.000Z",
      "type": "security",
      "description": "Conflicting security recommendation for: authentication",
      "agents": ["ultra:security-reviewer", "ultra:executor"],
      "location": "auth.ts",
      "votingResult": {
        "winner": "Use OAuth 2.0...",
        "method": "veto",
        "escalated": false,
        "percentage": 100
      }
    }
  ]
}
```

## Metadata

Every synthesis result includes comprehensive metadata:

```typescript
{
  unified: string;              // Merged document
  conflicts: Conflict[];        // All conflicts (resolved or escalated)
  strategy: SynthesisStrategy;  // Strategy used
  metadata: {
    agentCount: number;         // Number of agents
    confidence: number;         // 0-1, based on agreement
    resolutionMethod: string;   // How conflicts were resolved
    duration: number;           // Synthesis time (ms)
    sectionsMerged: number;     // Number of sections
    conflictsDetected: number;  // Total conflicts
    conflictsResolved: number;  // Resolved conflicts
    conflictsEscalated: number; // Escalated to human
  };
  contributions: [              // Per-agent stats
    {
      agent: string;
      sectionsContributed: number;
      conflictsInitiated: number;
      conflictsResolved: number;
    }
  ]
}
```

## Unit Test Examples

### Test Merge Strategy
```typescript
const strategy = new MergeStrategy(repo);
const results = {
  successful: [
    { agentId: 'agent-1', output: '## Section A\nContent A' },
    { agentId: 'agent-2', output: '## Section B\nContent B' }
  ],
  failed: [],
  total: 2,
  // ... other fields
};
const conflicts = [];

const result = await strategy.resolve(results, conflicts, {});
assert(result.resolvedCount === 2);
assert(result.resolutions.has('## Section A'));
```

### Test Weighted Vote with Security Veto
```typescript
const voting = new VotingMechanism('/tmp/test');
const result = await voting.resolveConflict(
  {
    type: 'security',
    description: 'Auth method',
    location: 'auth.ts'
  },
  [
    { agent: 'ultra:security-reviewer', content: 'Use OAuth 2.0', weight: 2 },
    { agent: 'ultra:executor', content: 'Use basic auth', weight: 1 }
  ],
  { securityVeto: true }
);

assert(result.method === 'veto');
assert(result.winner.includes('OAuth 2.0'));
assert(result.percentage === 1.0); // 100% due to veto
```

### Test Architect Tie-Break
```typescript
const result = await voting.resolveConflict(
  {
    type: 'technical',
    description: 'Database choice',
    location: 'database.ts'
  },
  [
    { agent: 'ultra:architect', content: 'PostgreSQL', weight: 1.5 },
    { agent: 'ultra:executor-1', content: 'PostgreSQL', weight: 1 },
    { agent: 'ultra:executor-2', content: 'MySQL', weight: 1 },
    { agent: 'ultra:verifier', content: 'MySQL', weight: 1 }
  ],
  { architectTieBreaker: true }
);

// Tie: PostgreSQL (2.5) vs MySQL (2)
// Architect prefers PostgreSQL
assert(result.method === 'tie-break');
assert(result.winner.includes('PostgreSQL'));
```

### Test Escalation
```typescript
const result = await voting.resolveConflict(
  {
    type: 'content',
    description: 'Code style',
    location: 'style.md'
  },
  [
    { agent: 'ultra:executor-1', content: 'Use tabs', weight: 1 },
    { agent: 'ultra:executor-2', content: 'Use spaces', weight: 1 }
  ],
  { minConsensus: 0.6 }  // Require 60% consensus
);

// 50% consensus < 60% threshold
assert(result.escalated === true);
assert(result.method === 'escalated');
```

## File Structure

```
/tmp/ultrapilot/src/wshobson/
├── synthesizer.ts                    # Main synthesis orchestrator
├── voting.ts                         # Standalone voting mechanism
├── strategies/
│   ├── index.ts                      # Strategy exports
│   ├── merge-strategy.ts             # Merge non-conflicting sections
│   ├── vote-strategy.ts              # Majority vote
│   ├── weighted-vote-strategy.ts     # Weighted vote with special rules
│   ├── conflict-strategy.ts          # Mark for human resolution
│   └── arbitrator-strategy.ts        # Delegate to arbitrator agent
└── SYNTHESIS_README.md               # This file
```

## Integration with Parallel Delegation

The synthesis system integrates with the parallel delegation system:

```typescript
import { ParallelDelegator } from './delegator.js';
import { ResultCollector } from './collector.js';
import { ResultSynthesizer } from './synthesizer.js';

// 1. Delegate tasks in parallel
const delegator = new ParallelDelegator(repo, workspacePath);
const delegationIds = await delegator.delegateParallel(
  ['task-1', 'task-2', 'task-3'],
  {
    fileOwnership: {
      ownedPaths: ['/tmp/ultrapilot/src/task-1/'],
      readOnlyPaths: ['/tmp/ultrapilot/src/shared/'],
      transferOnCompletion: true
    }
  }
);

// 2. Collect results
const collector = new ResultCollector(repo);
const collected = await collector.collect(delegationIds);

// 3. Synthesize
const synthesizer = new ResultSynthesizer(repo, workspacePath);
const synthesis = await synthesizer.synthesize(
  collected,
  'weighted-vote',
  { securityVeto: true }
);

console.log(synthesis.unified);
```

## Performance Considerations

1. **Conflict Detection**: O(n²) pairwise comparison, where n = number of agents
2. **Voting**: O(n) for grouping and tallying votes
3. **Merging**: O(n × m) where n = agents, m = sections per agent

For large numbers of agents (>10), consider:
- Using `vote` or `weighted-vote` strategies (faster)
- Pre-filtering agents by capability
- Batching conflicts for parallel resolution

## Future Enhancements

1. **Custom Strategies**: Allow user-defined synthesis strategies
2. **Machine Learning**: Train models to predict best resolutions
3. **Conflict Precedence**: Learn from past conflict resolutions
4. **Incremental Synthesis**: Update synthesis as agents complete
5. **Conflict Visualization**: UI for reviewing and resolving conflicts
