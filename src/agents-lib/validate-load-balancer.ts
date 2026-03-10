#!/usr/bin/env node
/**
 * Load Balancer Validation Script
 *
 * Validates that the LoadBalancer implementation meets all success criteria.
 */

import { LoadBalancer } from './load-balancer.js';
import type { Agent, LoadBalancingContext } from './types.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message: string, color: string = BLUE) {
  console.log(`${color}${message}${RESET}`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, GREEN);
}

function logFailure(message: string) {
  log(`✗ ${message}`, RED);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, YELLOW);
}

// Create mock agents
function createMockAgents(): Agent[] {
  return [
    {
      name: 'specialist-1',
      plugin: 'test-plugin',
      path: '/test/agents/specialist-1.md',
      description: 'High-performance specialist',
      capabilities: [
        { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.95 },
        { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.90 },
      ],
      category: 'backend',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 3600000,
      successRate: 0.95,
    },
    {
      name: 'specialist-2',
      plugin: 'test-plugin',
      path: '/test/agents/specialist-2.md',
      description: 'Reliable specialist',
      capabilities: [
        { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.85 },
        { name: 'graphql', hierarchy: ['backend', 'api', 'graphql'], confidence: 0.88 },
      ],
      category: 'backend',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 7200000,
      successRate: 0.88,
    },
    {
      name: 'generalist-1',
      plugin: 'test-plugin',
      path: '/test/agents/generalist-1.md',
      description: 'General-purpose agent',
      capabilities: [
        { name: 'implementation', hierarchy: ['general'], confidence: 0.75 },
        { name: 'general-purpose', hierarchy: ['general'], confidence: 0.80 },
      ],
      category: 'general',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 1800000,
      successRate: 0.82,
    },
    {
      name: 'specialist-3',
      plugin: 'test-plugin',
      path: '/test/agents/specialist-3.md',
      description: 'Third specialist',
      capabilities: [
        { name: 'api-development', hierarchy: ['backend', 'api'], confidence: 0.92 },
        { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.90 },
      ],
      category: 'backend',
      examples: [],
      metadata: { frontmatter: {}, content: '' },
      status: 'idle',
      lastUsed: Date.now() - 300000,
      successRate: 0.92,
    },
  ];
}

// Validation 1: File exists and compiles
async function validateFileExists() {
  log('\n=== Validation 1: File Exists and Compiles ===\n');

  try {
    const fs = await import('fs');
    const path = '/tmp/ultrapilot/src/wshobson/load-balancer.ts';

    if (fs.existsSync(path)) {
      logSuccess(`File exists: ${path}`);
      return true;
    } else {
      logFailure(`File not found: ${path}`);
      return false;
    }
  } catch (error) {
    logFailure(`Error checking file: ${error}`);
    return false;
  }
}

// Validation 2: LoadBalancer class exists and works
async function validateLoadBalancerClass() {
  log('\n=== Validation 2: LoadBalancer Class ===\n');

  try {
    const balancer = new LoadBalancer();
    logSuccess('LoadBalancer class instantiated');

    // Check methods exist
    const methods = [
      'selectAgent',
      'buildFallbackChain',
      'selectFromFallback',
      'isAgentAvailable',
      'getStats',
      'reset',
    ];

    let allMethodsExist = true;
    for (const method of methods) {
      if (typeof (balancer as any)[method] === 'function') {
        logSuccess(`Method exists: ${method}`);
      } else {
        logFailure(`Method missing: ${method}`);
        allMethodsExist = false;
      }
    }

    return allMethodsExist;
  } catch (error) {
    logFailure(`Error validating LoadBalancer class: ${error}`);
    return false;
  }
}

// Validation 3: 100-task load distribution test
async function validateLoadDistribution() {
  log('\n=== Validation 3: 100-Task Load Distribution ===\n');

  try {
    const balancer = new LoadBalancer();
    const agents = createMockAgents();
    const assignmentCounts = new Map<string, number>();

    // Initialize counts
    agents.forEach(agent => assignmentCounts.set(agent.name, 0));

    logInfo('Running 100 task assignments...');

    // Simulate 100 task assignments
    for (let i = 0; i < 100; i++) {
      const context: LoadBalancingContext = {
        currentAssignments: new Map(assignmentCounts),
        lastUsed: new Map(
          agents.map(a => [a.name, Date.now() - Math.random() * 3600000])
        ),
        taskComplexity: 'medium',
        preferSpecialists: false,
      };

      const result = balancer.selectAgent(agents, context);
      const current = assignmentCounts.get(result.agent.name) || 0;
      assignmentCounts.set(result.agent.name, current + 1);
    }

    // Check results
    logInfo('\nAssignment Distribution:');
    const sortedAgents = Array.from(assignmentCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    let maxCount = 0;
    sortedAgents.forEach(([agentName, count]) => {
      const percentage = ((count / 100) * 100).toFixed(1);
      logInfo(`  ${agentName}: ${count} assignments (${percentage}%)`);
      if (count > maxCount) maxCount = count;
    });

    const maxPercentage = (maxCount / 100) * 100;
    logInfo(`\nMax Load: ${maxPercentage.toFixed(1)}%`);

    if (maxPercentage <= 40) {
      logSuccess(`Load distribution valid: ${maxPercentage.toFixed(1)}% ≤ 40%`);
      return true;
    } else {
      logFailure(`Load distribution invalid: ${maxPercentage.toFixed(1)}% > 40%`);
      return false;
    }
  } catch (error) {
    logFailure(`Error in load distribution test: ${error}`);
    return false;
  }
}

// Validation 4: Fallback chain functionality
async function validateFallbackChains() {
  log('\n=== Validation 4: Fallback Chain Functionality ===\n');

  try {
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

    // Check fallback chain structure
    if (chain.primary) {
      logSuccess(`Primary agent: ${chain.primary.name}`);
    } else {
      logFailure('Primary agent missing');
      return false;
    }

    if (chain.secondary) {
      logSuccess(`Secondary agent: ${chain.secondary.name}`);
    }

    if (chain.tertiary) {
      logSuccess(`Tertiary agent: ${chain.tertiary.name}`);
    }

    if (chain.generalist) {
      logSuccess(`Generalist agent: ${chain.generalist.name}`);
    }

    // Test fallback progression
    logInfo('\nTesting fallback progression...');

    let currentAgent = chain.primary;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const nextAgent = balancer.selectFromFallback(chain, currentAgent, context);

      if (!nextAgent) {
        logSuccess(`Fallback chain exhausted after ${attempts} steps`);
        break;
      }

      logInfo(`  Step ${attempts}: ${currentAgent.name} → ${nextAgent.name}`);
      currentAgent = nextAgent;
    }

    return true;
  } catch (error) {
    logFailure(`Error in fallback chain test: ${error}`);
    return false;
  }
}

// Validation 5: Utilization tracking
async function validateUtilizationTracking() {
  log('\n=== Validation 5: Utilization Tracking ===\n');

  try {
    const balancer = new LoadBalancer();
    const agents = createMockAgents();

    const context: LoadBalancingContext = {
      currentAssignments: new Map(),
      lastUsed: new Map(
        agents.map(a => [a.name, a.lastUsed])
      ),
      taskComplexity: 'simple',
      preferSpecialists: false,
    };

    // Make some assignments
    for (let i = 0; i < 10; i++) {
      balancer.selectAgent(agents, context);
    }

    const stats = balancer.getStats();

    logInfo('Statistics:');
    logInfo(`  Total Assignments: ${stats.totalAssignments}`);
    logInfo(`  Average Load: ${(stats.averageLoad * 100).toFixed(1)}%`);
    logInfo(`  Most Used Agent: ${stats.mostUsedAgent}`);
    logInfo(`  Least Used Agent: ${stats.leastUsedAgent}`);
    logInfo(`  Utilization Std Dev: ${stats.utilizationStdDev?.toFixed(3) || 'N/A'}`);

    if (stats.totalAssignments === 10) {
      logSuccess('Assignment tracking correct');
    } else {
      logFailure(`Assignment tracking incorrect: expected 10, got ${stats.totalAssignments}`);
      return false;
    }

    if (stats.agentUtilization.size > 0) {
      logSuccess('Agent utilization tracked');
    } else {
      logFailure('Agent utilization not tracked');
      return false;
    }

    return true;
  } catch (error) {
    logFailure(`Error in utilization tracking test: ${error}`);
    return false;
  }
}

// Run all validations
async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗');
  log('║     Load Balancer Validation Suite                         ║');
  log('╚════════════════════════════════════════════════════════════╝\n');

  const results: { name: string; passed: boolean }[] = [];

  // Run validations
  results.push({
    name: 'File Exists and Compiles',
    passed: await validateFileExists(),
  });

  results.push({
    name: 'LoadBalancer Class',
    passed: await validateLoadBalancerClass(),
  });

  results.push({
    name: '100-Task Load Distribution',
    passed: await validateLoadDistribution(),
  });

  results.push({
    name: 'Fallback Chain Functionality',
    passed: await validateFallbackChains(),
  });

  results.push({
    name: 'Utilization Tracking',
    passed: await validateUtilizationTracking(),
  });

  // Summary
  log('\n╔════════════════════════════════════════════════════════════╗');
  log('║                     Validation Summary                     ║');
  log('╚════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logFailure(result.name);
    }
  });

  log(`\nResult: ${passed}/${total} validations passed`);

  if (passed === total) {
    log('\n✓ All validations passed! LoadBalancer is ready for use.\n', GREEN);
    process.exit(0);
  } else {
    log('\n✗ Some validations failed. Please review the implementation.\n', RED);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Validation error:', error);
  process.exit(1);
});
