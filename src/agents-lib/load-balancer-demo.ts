/**
 * Load Balancer Demo
 *
 * Demonstrates the load balancing and fallback chain functionality.
 */

import { LoadBalancer, type LoadBalancingContext } from './load-balancer.js';
import type { Agent } from './types.js';

// Create mock agents
const createMockAgents = (): Agent[] => [
  {
    name: 'api-specialist-1',
    plugin: 'backend-plugin',
    path: '/agents/api-specialist-1.md',
    description: 'REST API specialist with high success rate',
    capabilities: [
      { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.95 },
      { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.92 },
    ],
    category: 'backend',
    examples: ['REST API endpoint development'],
    metadata: { frontmatter: {}, content: '' },
    status: 'idle',
    lastUsed: Date.now() - 3600000, // 1 hour ago
    successRate: 0.95,
  },
  {
    name: 'api-specialist-2',
    plugin: 'backend-plugin',
    path: '/agents/api-specialist-2.md',
    description: 'GraphQL API specialist',
    capabilities: [
      { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.88 },
      { name: 'graphql', hierarchy: ['backend', 'api', 'graphql'], confidence: 0.90 },
    ],
    category: 'backend',
    examples: ['GraphQL schema design'],
    metadata: { frontmatter: {}, content: '' },
    status: 'idle',
    lastUsed: Date.now() - 7200000, // 2 hours ago
    successRate: 0.88,
  },
  {
    name: 'backend-generalist',
    plugin: 'backend-plugin',
    path: '/agents/backend-generalist.md',
    description: 'General-purpose backend developer',
    capabilities: [
      { name: 'implementation', hierarchy: ['general'], confidence: 0.80 },
      { name: 'general-purpose', hierarchy: ['general'], confidence: 0.85 },
    ],
    category: 'backend',
    examples: ['General backend tasks'],
    metadata: { frontmatter: {}, content: '' },
    status: 'idle',
    lastUsed: Date.now() - 1800000, // 30 minutes ago
    successRate: 0.82,
  },
  {
    name: 'database-specialist',
    plugin: 'backend-plugin',
    path: '/agents/database-specialist.md',
    description: 'Database design and optimization specialist',
    capabilities: [
      { name: 'database-design', hierarchy: ['backend', 'database'], confidence: 0.93 },
      { name: 'sql-optimization', hierarchy: ['backend', 'database', 'sql'], confidence: 0.90 },
    ],
    category: 'backend',
    examples: ['Database schema design', 'Query optimization'],
    metadata: { frontmatter: {}, content: '' },
    status: 'idle',
    lastUsed: Date.now() - 5400000, // 1.5 hours ago
    successRate: 0.91,
  },
];

// Demo 1: Basic agent selection
function demoBasicSelection() {
  console.log('\n=== Demo 1: Basic Agent Selection ===\n');

  const balancer = new LoadBalancer();
  const agents = createMockAgents();

  const context: LoadBalancingContext = {
    currentAssignments: new Map([
      ['api-specialist-1', 2],
      ['api-specialist-2', 1],
    ]),
    lastUsed: new Map(
      agents.map(a => [a.name, a.lastUsed])
    ),
    taskComplexity: 'complex',
    preferSpecialists: true,
  };

  const result = balancer.selectAgent(agents, context);

  console.log(`Selected Agent: ${result.agent.name}`);
  console.log(`Score: ${result.score.toFixed(3)}`);
  console.log(`Reasoning: ${result.reasoning}`);
  console.log(`\nFallback Chain:`);
  console.log(`  Primary: ${result.fallbackChain.primary.name}`);
  console.log(`  Secondary: ${result.fallbackChain.secondary?.name || 'None'}`);
  console.log(`  Tertiary: ${result.fallbackChain.tertiary?.name || 'None'}`);
  console.log(`  Generalist: ${result.fallbackChain.generalist?.name || 'None'}`);
}

// Demo 2: Load distribution test
function demoLoadDistribution() {
  console.log('\n=== Demo 2: Load Distribution (100 tasks) ===\n');

  const balancer = new LoadBalancer();
  const agents = createMockAgents();
  const assignmentCounts = new Map<string, number>();

  // Initialize counts
  agents.forEach(agent => assignmentCounts.set(agent.name, 0));

  // Simulate 100 task assignments
  for (let i = 0; i < 100; i++) {
    const context: LoadBalancingContext = {
      currentAssignments: new Map(assignmentCounts),
      lastUsed: new Map(
        agents.map(a => [a.name, Date.now() - Math.random() * 3600000])
      ),
      taskComplexity: i % 3 === 0 ? 'complex' : 'medium',
      preferSpecialists: i % 2 === 0,
    };

    const result = balancer.selectAgent(agents, context);
    const current = assignmentCounts.get(result.agent.name) || 0;
    assignmentCounts.set(result.agent.name, current + 1);
  }

  // Display results
  console.log('Assignment Distribution:');
  const sortedAgents = Array.from(assignmentCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  sortedAgents.forEach(([agentName, count]) => {
    const percentage = ((count / 100) * 100).toFixed(1);
    console.log(`  ${agentName}: ${count} assignments (${percentage}%)`);
  });

  // Verify no single agent handles >40%
  const maxCount = Math.max(...Array.from(assignmentCounts.values()));
  const maxPercentage = (maxCount / 100) * 100;

  console.log(`\nMax Load: ${maxPercentage.toFixed(1)}%`);
  console.log(`Distribution Check: ${maxPercentage <= 40 ? '✓ PASS' : '✗ FAIL'} (≤40% per agent)`);

  // Display statistics
  const stats = balancer.getStats();
  console.log(`\nLoad Balancer Statistics:`);
  console.log(`  Total Assignments: ${stats.totalAssignments}`);
  console.log(`  Average Load: ${(stats.averageLoad * 100).toFixed(1)}%`);
  console.log(`  Most Used Agent: ${stats.mostUsedAgent}`);
  console.log(`  Least Used Agent: ${stats.leastUsedAgent}`);
  console.log(`  Utilization Std Dev: ${stats.utilizationStdDev?.toFixed(3) || 'N/A'}`);
}

// Demo 3: Fallback chain progression
function demoFallbackProgression() {
  console.log('\n=== Demo 3: Fallback Chain Progression ===\n');

  const balancer = new LoadBalancer();
  const agents = createMockAgents();

  const context: LoadBalancingContext = {
    currentAssignments: new Map(),
    lastUsed: new Map(
      agents.map(a => [a.name, a.lastUsed])
    ),
    taskComplexity: 'complex',
    preferSpecialists: true,
  };

  const result = balancer.selectAgent(agents, context);
  const chain = result.fallbackChain;

  console.log('Attempting delegation with fallback progression...\n');

  let currentAgent = chain.primary;
  let attempt = 1;

  console.log(`Attempt ${attempt}: Try ${currentAgent.name} (primary)`);
  console.log(`  → Simulated failure\n`);

  // Try fallback chain
  while (true) {
    attempt++;
    const nextAgent = balancer.selectFromFallback(chain, currentAgent, context);

    if (!nextAgent) {
      console.log(`Attempt ${attempt}: Fallback chain exhausted`);
      break;
    }

    const level = nextAgent.name === chain.secondary?.name ? 'secondary'
      : nextAgent.name === chain.tertiary?.name ? 'tertiary'
      : nextAgent.name === chain.generalist?.name ? 'generalist'
      : 'unknown';

    console.log(`Attempt ${attempt}: Try ${nextAgent.name} (${level})`);

    if (level === 'generalist') {
      console.log(`  → Simulated success! ✓`);
      break;
    }

    console.log(`  → Simulated failure\n`);
  }
}

// Demo 4: Capability filtering
function demoCapabilityFiltering() {
  console.log('\n=== Demo 4: Capability-Based Filtering ===\n');

  const balancer = new LoadBalancer();
  const agents = createMockAgents();

  // Filter by GraphQL capability
  const context1: LoadBalancingContext = {
    currentAssignments: new Map(),
    lastUsed: new Map(
      agents.map(a => [a.name, a.lastUsed])
    ),
    taskComplexity: 'complex',
    preferSpecialists: true,
    requiredCapabilities: ['graphql'],
  };

  const result1 = balancer.selectAgent(agents, context1);
  console.log(`Required: GraphQL capability`);
  console.log(`Selected: ${result1.agent.name}`);
  console.log(`Expected: api-specialist-2 (only GraphQL-capable agent)\n`);

  // Filter by database capability
  const context2: LoadBalancingContext = {
    currentAssignments: new Map(),
    lastUsed: new Map(
      agents.map(a => [a.name, a.lastUsed])
    ),
    taskComplexity: 'complex',
    preferSpecialists: true,
    requiredCapabilities: ['database-design'],
  };

  const result2 = balancer.selectAgent(agents, context2);
  console.log(`Required: Database design capability`);
  console.log(`Selected: ${result2.agent.name}`);
  console.log(`Expected: database-specialist (only database-capable agent)`);
}

// Demo 5: Utilization threshold enforcement
function demoUtilizationThreshold() {
  console.log('\n=== Demo 5: Utilization Threshold Enforcement ===\n');

  const balancer = new LoadBalancer();
  const agents = createMockAgents();

  // Create scenario where specialist-1 is overloaded
  const context: LoadBalancingContext = {
    currentAssignments: new Map([
      ['api-specialist-1', 5], // Overloaded
      ['api-specialist-2', 1],
      ['backend-generalist', 0],
    ]),
    lastUsed: new Map(
      agents.map(a => [a.name, a.lastUsed])
    ),
    taskComplexity: 'medium',
    preferSpecialists: true,
    maxUtilizationThreshold: 0.5, // 50% threshold
  };

  const result = balancer.selectAgent(agents, context);

  console.log(`Utilization Threshold: 50%`);
  console.log(`Agent Loads:`);
  console.log(`  api-specialist-1: 5 tasks (over threshold)`);
  console.log(`  api-specialist-2: 1 task (under threshold)`);
  console.log(`  backend-generalist: 0 tasks (idle)`);
  console.log(`\nSelected Agent: ${result.agent.name}`);
  console.log(`Expected: api-specialist-2 (not overloaded)`);
  console.log(`Check: ${result.agent.name !== 'api-specialist-1' ? '✓ PASS' : '✗ FAIL'}`);
}

// Run all demos
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      Load Balancer & Fallback Chain Demonstration        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  demoBasicSelection();
  demoLoadDistribution();
  demoFallbackProgression();
  demoCapabilityFiltering();
  demoUtilizationThreshold();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    All Demos Complete                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Run if executed directly
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname;
if (isMainModule) {
  main().catch(console.error);
}

export { main as runLoadBalancerDemo };
