# Agent Bridge

**Loads full agent behavioral definitions from agents-lib .md files and constructs complete system prompts for true specialist agent invocation.**

## The Problem

The `AGENT_CATALOG` in `src/agents.ts` contains only **metadata** (name, description, model) for 109 agents. But the actual agents-lib `.md` files contain:

- ✅ 100+ lines of specialized behavioral instructions per agent
- ✅ 50+ domain-specific patterns (APIs, microservices, security, etc.)
- ✅ Detailed protocols and workflows
- ✅ Best practices and decision frameworks

**We lost all of this behavioral expertise!** The Agent Bridge restores it.

## The Solution

The Agent Bridge:

1. **Loads** complete agent definitions from `.md` files (YAML + markdown)
2. **Builds** full system prompts with all behavioral context
3. **Invokes** agents with true expertise, not just names

## Quick Start

```typescript
import { AgentBridge } from './agent-bridge/index.js';

const bridge = new AgentBridge();

// Invoke agent with FULL behavioral context
const result = await bridge.invoke(
  'ultra:backend-architect',
  'Design a RESTful API for user management',
  {
    domain: domainContext,
    workspace: workspaceContext,
    task: taskContext
  }
);

console.log(result.message);  // Agent's response with full expertise
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Bridge                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         AgentDefinitionLoader                        │   │
│  │  • Finds agent .md files in agents-lib/             │   │
│  │  • Parses YAML frontmatter + markdown               │   │
│  │  • Caches definitions for performance               │   │
│  └─────────────────────────────────────────────────────┘   │
│                               │                              │
│                               ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         SystemPromptBuilder                         │   │
│  │  • Combines agent behavior + domain context         │   │
│  │  • Adds workspace info + task details               │   │
│  │  • Creates complete system prompt                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                               │                              │
│                               ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         AgentInvoker                                │   │
│  │  • Loads agent definition                           │   │
│  │  • Builds system prompt                             │   │
│  │  • Invokes Task tool with full context              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
                     agents-lib/plugins/*/agents/*.md
                     (177 full agent definitions)
```

## Components

### 1. AgentDefinitionLoader

Loads and parses agent `.md` files.

```typescript
import { AgentDefinitionLoader } from './agent-bridge/index.js';

const loader = new AgentDefinitionLoader({
  agentsLibPath: './agents-lib/plugins',
  enableCache: true,
  cacheMaxSize: 200
});

// Load full agent definition
const definition = await loader.loadAgentDefinition('ultra:backend-architect');

console.log(definition.systemPrompt);
// Returns 100+ lines of specialized behavioral instructions!
```

**Features:**
- ✅ Finds agent files across 72 plugins
- ✅ Handles duplicates with priority resolution
- ✅ Parses YAML frontmatter + markdown content
- ✅ Caches for performance
- ✅ Resolves model inheritance

### 2. SystemPromptBuilder

Constructs complete system prompts.

```typescript
import { SystemPromptBuilder } from './agent-bridge/index.js';

const builder = new SystemPromptBuilder({
  includeDomainContext: true,
  includeWorkspaceContext: true,
  includeTaskContext: true,
  format: 'full'
});

const prompt = await builder.buildSystemPrompt(definition, context);

// Prompt contains:
// 1. Agent's core behavioral instructions (100+ lines)
// 2. Domain context (tech stack, goals, available agents)
// 3. Workspace context (path, queues, file ownership)
// 4. Task context (description, priority, type)
// 5. Behavioral guidelines (quality, communication, etc.)
```

**Features:**
- ✅ Combines all context sections
- ✅ Multiple formats (full, concise, minimal)
- ✅ Domain-specific customization
- ✅ Clear separation of concerns

### 3. AgentInvoker

Invokes agents with full behavioral context.

```typescript
import { AgentInvoker } from './agent-bridge/index.js';

const invoker = new AgentInvoker(loader, builder, {
  defaultTimeout: 300000,
  maxConcurrentInvocations: 5,
  enableMetrics: true
});

const result = await invoker.invokeAgent({
  agentId: 'ultra:backend-architect',
  task: 'Design a RESTful API',
  context: invocationContext
});

console.log(result.success);  // true/false
console.log(result.message);  // Agent's response
console.log(result.duration);  // Execution time in ms
```

**Features:**
- ✅ Concurrency limiting
- ✅ Metrics tracking
- ✅ Error handling
- ✅ Parallel and sequential invocation modes

## Usage Examples

### Basic Invocation

```typescript
const bridge = new AgentBridge();

const result = await bridge.invoke(
  'ultra:backend-architect',
  'Design a RESTful API for user management',
  {
    domain: {
      domainId: 'domain-001',
      name: 'ecommerce-api',
      type: 'web-api',
      description: 'E-commerce REST API',
      stack: {
        language: 'TypeScript',
        framework: 'Express',
        testing: 'Jest',
        packageManager: 'npm'
      },
      agents: ['ultra:backend-architect', 'ultra:test-engineer'],
      routing: { rules: [], ownership: 'auto-assign' }
    },
    workspace: {
      path: '/workspace/ecommerce-api',
      domainId: 'domain-001',
      availableAgents: ['ultra:backend-architect'],
      queuePaths: {
        intake: '.ultra/queues/intake.json',
        inProgress: '.ultra/queues/in-progress.json',
        review: '.ultra/queues/review.json',
        completed: '.ultra/queues/completed.json',
        failed: '.ultra/queues/failed.json'
      }
    },
    task: {
      taskId: 'task-001',
      description: 'Design a RESTful API for user management',
      priority: 'high',
      type: 'feature',
      assignedBy: 'ultra:team-lead',
      createdAt: new Date()
    }
  }
);
```

### Load Agent Definition

```typescript
const definition = await bridge.loadAgent('ultra:backend-architect');

console.log(definition.name);           // 'backend-architect'
console.log(definition.model);          // 'sonnet'
console.log(definition.systemPrompt.length);  // 5000+ characters!
console.log(definition.domain);         // 'software-dev'
console.log(definition.plugin);         // 'backend-development'
```

### List Available Agents

```typescript
const agents = await bridge.listAgents();

console.log(`Found ${agents.length} agents`);
// ['backend-architect', 'django-pro', 'fastapi-pro', ...]
```

### Preload for Performance

```typescript
// Preload frequently used agents
await bridge.preloadAgents([
  'ultra:backend-architect',
  'ultra:team-lead',
  'ultra:test-engineer'
]);

// Subsequent invocations are instant (from cache)
const result = await bridge.invoke('ultra:backend-architect', task, context);
```

### Check Metrics

```typescript
const metrics = bridge.getMetrics('ultra:backend-architect');

console.log(metrics);
// {
//   count: 42,
//   totalDuration: 125000,
//   successCount: 40,
//   failureCount: 2
// }
```

## Convenience Functions

### One-Liner Invocation

```typescript
import { invokeAgent } from './agent-bridge/index.js';

const result = await invokeAgent(
  'ultra:backend-architect',
  task,
  context
);
```

### Load Definition

```typescript
import { loadAgentDefinition } from './agent-bridge/index.js';

const definition = await loadAgentDefinition('ultra:backend-architect');
```

### Build Prompt

```typescript
import { buildSystemPrompt } from './agent-bridge/index.js';

const prompt = await buildSystemPrompt(
  'ultra:backend-architect',
  context
);
```

## Integration Points

### Domain Initializer

```typescript
import { AgentBridge } from './agent-bridge/index.js';

export class DomainInitializer {
  private agentBridge: AgentBridge;

  constructor() {
    this.agentBridge = new AgentBridge();
  }

  async initializeAgent(agentName: string): Promise<void> {
    // Load full agent definition (not just metadata!)
    const definition = await this.agentBridge.loadAgent(agentName);

    // Agent now has complete behavioral context
    console.log(`Loaded ${definition.systemPrompt.length} bytes of behavioral instructions`);
  }
}
```

### Autoloop Daemon

```typescript
export class AutoloopDaemon {
  private agentBridge: AgentBridge;

  async processTask(task: Task): Promise<void> {
    // Determine which agent should handle this task
    const agentId = this.routeTaskToAgent(task);

    // Invoke agent with FULL behavioral context
    const result = await this.agentBridge.invoke(
      agentId,
      task.description,
      {
        domain: this.domain,
        workspace: this.workspace,
        task: task
      }
    );

    if (result.success) {
      console.log(`Task completed: ${result.message}`);
    } else {
      console.error(`Task failed: ${result.errors?.join(', ')}`);
    }
  }
}
```

## Comparison: Before vs. After

### Before (Just Metadata)

```typescript
const agent = AGENT_CATALOG['ultra:backend-architect'];
console.log(agent.description);
// "Expert backend architect specializing in scalable API design..."
// Just 1 sentence!

// Agent has NO specialized knowledge when invoked
// No API patterns, no microservices patterns, no best practices
```

### After (With Agent Bridge)

```typescript
const definition = await bridge.loadAgent('ultra:backend-architect');
console.log(definition.systemPrompt);
// "You are a backend system architect specializing in...
//
// ## Core Philosophy
// Design backend systems with clear boundaries...
//
// ## Capabilities
// ### API Design & Patterns
// - RESTful APIs: Resource modeling, HTTP methods...
// - GraphQL APIs: Schema design, resolvers...
// - gRPC Services: Protocol Buffers, streaming...
// [100+ lines of specialized knowledge!]
//
// ## Best Practices
// [Specific protocols and guidelines]
// "

// Agent invoked with FULL behavioral context and expertise!
```

## Performance

### Caching

Agent definitions are cached in memory for fast repeated access:

```typescript
const stats = bridge.getCacheStats();

console.log(stats);
// {
//   size: 50,              // 50 agents in cache
//   entries: 50,
//   totalSize: 2500000,    // 2.5MB of cached data
//   oldestEntry: Date,
//   newestEntry: Date
// }
```

### Preloading

Preload frequently used agents at startup:

```typescript
await bridge.preloadAgents([
  'ultra:team-lead',
  'ultra:backend-architect',
  'ultra:test-engineer',
  'ultra:code-reviewer'
]);
```

### Concurrency Control

Limit concurrent invocations to prevent resource exhaustion:

```typescript
const invoker = new AgentInvoker(loader, builder, {
  maxConcurrentInvocations: 5
});
```

## API Reference

### AgentBridge

```typescript
class AgentBridge {
  constructor(loaderOptions?, builderOptions?, invokerOptions?)

  // Core methods
  async invoke(agentId, task, context): Promise<InvocationResult>
  async loadAgent(agentId): Promise<AgentDefinition>
  async buildPrompt(agentId, context): Promise<string>

  // Utility methods
  async agentExists(agentId): Promise<boolean>
  async listAgents(): Promise<string[]>
  async preloadAgents(agentIds): Promise<void>

  // Cache & metrics
  clearCache(): void
  getCacheStats(): CacheStats
  getMetrics(agentId?): Metrics
  resetMetrics(agentId?): void
}
```

See `types.ts` for complete interface definitions.

## File Structure

```
src/agent-bridge/
├── index.ts                    # Main entry point
├── types.ts                    # TypeScript interfaces
├── AgentDefinitionLoader.ts    # Load/parse .md files
├── SystemPromptBuilder.ts      # Build complete prompts
├── AgentInvoker.ts             # Invoke agents
├── EXAMPLE.ts                  # Usage examples
└── README.md                   # This file
```

## Testing

Run the example file to see the bridge in action:

```bash
npm run build
node dist/agent-bridge/EXAMPLE.js
```

## Next Steps

1. **Integrate with DomainInitializer** - Load full definitions during domain setup
2. **Integrate with AutoloopDaemon** - Invoke agents with full context
3. **Add to ultra-agents-list** - Show agent "depth" (size of system prompt)
4. **Performance testing** - Benchmark cache hit rates, invocation times

## Status

✅ **COMPLETE** - All components implemented and ready for integration

- AgentDefinitionLoader: Loads 177 agent definitions
- SystemPromptBuilder: Constructs complete prompts
- AgentInvoker: Invokes with full behavioral context
- Convenience functions: Easy-to-use API
- Examples: Comprehensive usage examples

---

**The Agent Bridge restores the full behavioral expertise of the agents-lib agents, enabling true specialist agent invocation in UltraPilot.**
