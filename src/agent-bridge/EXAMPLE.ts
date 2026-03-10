/**
 * Agent Bridge Usage Examples
 *
 * Demonstrates how to use the Agent Bridge to load agent definitions
 * and invoke agents with full behavioral context.
 */

import { AgentBridge, invokeAgent, loadAgentDefinition } from './index.js';

/**
 * Example 1: Basic Agent Invocation
 */
async function example1_BasicInvocation() {
  console.log('\n=== Example 1: Basic Agent Invocation ===\n');

  const bridge = new AgentBridge();

  const result = await bridge.invoke(
    'ultra:backend-architect',
    'Design a RESTful API for user management',
    {
      domain: {
        domainId: 'domain-ecommerce-001',
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
        routing: {
          rules: [],
          ownership: 'auto-assign'
        }
      },
      workspace: {
        path: '/workspace/ecommerce-api',
        domainId: 'domain-ecommerce-001',
        availableAgents: ['ultra:backend-architect', 'ultra:test-engineer'],
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

  console.log('Result:', result);
  console.log('Success:', result.success);
  console.log('Duration:', result.duration, 'ms');
}

/**
 * Example 2: Load Agent Definition
 */
async function example2_LoadDefinition() {
  console.log('\n=== Example 2: Load Agent Definition ===\n');

  const bridge = new AgentBridge();

  // Load full agent definition
  const definition = await bridge.loadAgent('ultra:backend-architect');

  console.log('Agent Name:', definition.name);
  console.log('Description:', definition.description);
  console.log('Model:', definition.model);
  console.log('Tools:', definition.tools);
  console.log('System Prompt Length:', definition.systemPrompt.length, 'characters');
  console.log('Plugin:', definition.plugin);
  console.log('Domain:', definition.domain);
  console.log('File Size:', definition.size, 'bytes');
}

/**
 * Example 3: Build System Prompt
 */
async function example3_BuildPrompt() {
  console.log('\n=== Example 3: Build System Prompt ===\n');

  const bridge = new AgentBridge();

  // Build complete system prompt
  const prompt = await bridge.buildPrompt(
    'ultra:backend-architect',
    {
      domain: {
        domainId: 'domain-ecommerce-001',
        name: 'ecommerce-api',
        type: 'web-api',
        description: 'E-commerce REST API',
        stack: {
          language: 'TypeScript',
          framework: 'Express',
          testing: 'Jest',
          packageManager: 'npm'
        },
        agents: ['ultra:backend-architect'],
        routing: {
          rules: [],
          ownership: 'auto-assign'
        }
      },
      workspace: {
        path: '/workspace/ecommerce-api',
        domainId: 'domain-ecommerce-001',
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
        description: 'Design user management API',
        priority: 'high',
        type: 'feature',
        assignedBy: 'ultra:team-lead',
        createdAt: new Date()
      }
    }
  );

  console.log('System Prompt (first 500 chars):');
  console.log(prompt.substring(0, 500) + '...');
  console.log('\nFull Prompt Length:', prompt.length, 'characters');
}

/**
 * Example 4: Convenience Function
 */
async function example4_ConvenienceFunction() {
  console.log('\n=== Example 4: Convenience Function ===\n');

  // One-liner invocation
  const result = await invokeAgent(
    'ultra:backend-architect',
    'Design a GraphQL API for product catalog',
    {
      domain: {
        domainId: 'domain-ecommerce-001',
        name: 'ecommerce-api',
        type: 'web-api',
        description: 'E-commerce REST API',
        stack: {
          language: 'TypeScript',
          framework: 'Express',
          testing: 'Jest',
          packageManager: 'npm'
        },
        agents: ['ultra:backend-architect'],
        routing: {
          rules: [],
          ownership: 'auto-assign'
        }
      },
      workspace: {
        path: '/workspace/ecommerce-api',
        domainId: 'domain-ecommerce-001',
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
        taskId: 'task-002',
        description: 'Design a GraphQL API for product catalog',
        priority: 'medium',
        type: 'feature',
        assignedBy: 'ultra:team-lead',
        createdAt: new Date()
      }
    }
  );

  console.log('Quick Result:', result.success ? '✓ Success' : '✗ Failed');
}

/**
 * Example 5: List Available Agents
 */
async function example5_ListAgents() {
  console.log('\n=== Example 5: List Available Agents ===\n');

  const bridge = new AgentBridge();

  const agents = await bridge.listAgents();

  console.log(`Found ${agents.length} agents:`);
  console.log(agents.slice(0, 10).join(', '));

  if (agents.length > 10) {
    console.log(`... and ${agents.length - 10} more`);
  }
}

/**
 * Example 6: Preload Agents for Performance
 */
async function example6_PreloadAgents() {
  console.log('\n=== Example 6: Preload Agents ===\n');

  const bridge = new AgentBridge();

  // Preload frequently used agents
  await bridge.preloadAgents([
    'ultra:backend-architect',
    'ultra:team-lead',
    'ultra:test-engineer',
    'ultra:code-reviewer'
  ]);

  console.log('Agents preloaded into cache');

  const stats = bridge.getCacheStats();
  console.log('Cache Stats:', stats);
}

/**
 * Example 7: Check Metrics
 */
async function example7_CheckMetrics() {
  console.log('\n=== Example 7: Check Metrics ===\n');

  const bridge = new AgentBridge();

  // Invoke some agents
  await bridge.invoke('ultra:backend-architect', 'Task 1', {
    domain: {} as any,
    workspace: {} as any,
    task: {} as any
  });

  // Get metrics
  const metrics = bridge.getMetrics('ultra:backend-architect');
  console.log('Metrics for ultra:backend-architect:', metrics);
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await example1_BasicInvocation();
    await example2_LoadDefinition();
    await example3_BuildPrompt();
    await example4_ConvenienceFunction();
    await example5_ListAgents();
    await example6_PreloadAgents();
    await example7_CheckMetrics();

    console.log('\n=== All Examples Complete ===\n');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

export {
  example1_BasicInvocation,
  example2_LoadDefinition,
  example3_BuildPrompt,
  example4_ConvenienceFunction,
  example5_ListAgents,
  example6_PreloadAgents,
  example7_CheckMetrics,
  runExamples
};
