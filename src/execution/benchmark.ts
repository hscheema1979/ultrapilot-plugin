/**
 * Benchmark Suite for Parallel Execution Layer
 *
 * Demonstrates 3-5x speedup of parallel vs sequential execution
 */

import { ParallelExecutor, ParallelAgentTask } from './parallel-task.js';

/**
 * Simulate real-world Ultrapilot workloads
 */
const BENCHMARK_SCENARIOS = {
  // Phase 2: Small feature implementation (3 agents)
  smallFeature: {
    name: 'Small Feature Implementation',
    tasks: [
      {
        id: 'auth-middleware',
        agentType: 'ultra:team-implementer',
        prompt: 'Implement authentication middleware with JWT validation',
        fileOwnership: { ownedPaths: ['src/middleware/auth.ts'] }
      },
      {
        id: 'user-model',
        agentType: 'ultra:executor',
        prompt: 'Create user database model with validation',
        fileOwnership: { ownedPaths: ['src/models/user.ts'] }
      },
      {
        id: 'login-route',
        agentType: 'ultra:executor',
        prompt: 'Implement login POST endpoint',
        fileOwnership: { ownedPaths: ['src/routes/auth.ts'] }
      }
    ] as ParallelAgentTask[]
  },

  // Phase 2: Medium feature (5 agents)
  mediumFeature: {
    name: 'Medium Feature Implementation',
    tasks: [
      {
        id: 'task-model',
        agentType: 'ultra:executor',
        prompt: 'Create task database model with relationships',
        fileOwnership: { ownedPaths: ['src/models/task.ts'] }
      },
      {
        id: 'task-controller',
        agentType: 'ultra:team-implementer',
        prompt: 'Implement task CRUD controller',
        fileOwnership: { ownedPaths: ['src/controllers/task.ts'] }
      },
      {
        id: 'task-routes',
        agentType: 'ultra:executor',
        prompt: 'Define REST API routes for tasks',
        fileOwnership: { ownedPaths: ['src/routes/tasks.ts'] }
      },
      {
        id: 'task-service',
        agentType: 'ultra:executor',
        prompt: 'Implement business logic layer for tasks',
        fileOwnership: { ownedPaths: ['src/services/task.ts'] }
      },
      {
        id: 'task-tests',
        agentType: 'ultra:test-engineer',
        prompt: 'Write unit tests for task module',
        fileOwnership: { ownedPaths: ['tests/task.test.ts'] }
      }
    ] as ParallelAgentTask[]
  },

  // Phase 2: Large feature (10 agents)
  largeFeature: {
    name: 'Large Feature Implementation',
    tasks: [
      {
        id: 'project-model',
        agentType: 'ultra:executor',
        prompt: 'Create project database model',
        fileOwnership: { ownedPaths: ['src/models/project.ts'] }
      },
      {
        id: 'team-model',
        agentType: 'ultra:executor',
        prompt: 'Create team database model',
        fileOwnership: { ownedPaths: ['src/models/team.ts'] }
      },
      {
        id: 'project-controller',
        agentType: 'ultra:team-implementer',
        prompt: 'Implement project controller',
        fileOwnership: { ownedPaths: ['src/controllers/project.ts'] }
      },
      {
        id: 'team-controller',
        agentType: 'ultra:team-implementer',
        prompt: 'Implement team controller',
        fileOwnership: { ownedPaths: ['src/controllers/team.ts'] }
      },
      {
        id: 'project-routes',
        agentType: 'ultra:executor',
        prompt: 'Define project routes',
        fileOwnership: { ownedPaths: ['src/routes/projects.ts'] }
      },
      {
        id: 'team-routes',
        agentType: 'ultra:executor',
        prompt: 'Define team routes',
        fileOwnership: { ownedPaths: ['src/routes/teams.ts'] }
      },
      {
        id: 'project-service',
        agentType: 'ultra:executor',
        prompt: 'Implement project service layer',
        fileOwnership: { ownedPaths: ['src/services/project.ts'] }
      },
      {
        id: 'team-service',
        agentType: 'ultra:executor',
        prompt: 'Implement team service layer',
        fileOwnership: { ownedPaths: ['src/services/team.ts'] }
      },
      {
        id: 'project-tests',
        agentType: 'ultra:test-engineer',
        prompt: 'Write project tests',
        fileOwnership: { ownedPaths: ['tests/project.test.ts'] }
      },
      {
        id: 'team-tests',
        agentType: 'ultra:test-engineer',
        prompt: 'Write team tests',
        fileOwnership: { ownedPaths: ['tests/team.test.ts'] }
      }
    ] as ParallelAgentTask[]
  },

  // Phase 4: Multi-dimensional review (3 agents)
  multiReview: {
    name: 'Multi-Dimensional Code Review',
    tasks: [
      {
        id: 'security-review',
        agentType: 'ultra:security-reviewer',
        prompt: 'Review code for security vulnerabilities',
        fileOwnership: { ownedPaths: [] }
      },
      {
        id: 'quality-review',
        agentType: 'ultra:quality-reviewer',
        prompt: 'Review code for performance and quality',
        fileOwnership: { ownedPaths: [] }
      },
      {
        id: 'code-review',
        agentType: 'ultra:code-reviewer',
        prompt: 'Comprehensive code review',
        fileOwnership: { ownedPaths: [] }
      }
    ] as ParallelAgentTask[]
  },

  // Ralph Loop: Parallel debugging (4 agents)
  parallelDebug: {
    name: 'Parallel Hypothesis Testing',
    tasks: [
      {
        id: 'hypothesis-1',
        agentType: 'ultra:team-debugger',
        prompt: 'Test hypothesis: Race condition in auth flow',
        fileOwnership: { ownedPaths: ['src/auth/'] }
      },
      {
        id: 'hypothesis-2',
        agentType: 'ultra:team-debugger',
        prompt: 'Test hypothesis: Memory leak in task processor',
        fileOwnership: { ownedPaths: ['src/tasks/'] }
      },
      {
        id: 'hypothesis-3',
        agentType: 'ultra:team-debugger',
        prompt: 'Test hypothesis: Database connection pool exhaustion',
        fileOwnership: { ownedPaths: ['src/db/'] }
      },
      {
        id: 'hypothesis-4',
        agentType: 'ultra:team-debugger',
        prompt: 'Test hypothesis: API rate limiting bug',
        fileOwnership: { ownedPaths: ['src/api/'] }
      }
    ] as ParallelAgentTask[]
  }
};

/**
 * Format milliseconds to human-readable string
 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Format speedup with color coding
 */
function formatSpeedup(speedup: number): string {
  if (speedup >= 4) return `${speedup.toFixed(2)}x (excellent)`;
  if (speedup >= 3) return `${speedup.toFixed(2)}x (good)`;
  if (speedup >= 2) return `${speedup.toFixed(2)}x (fair)`;
  return `${speedup.toFixed(2)}x (poor)`;
}

/**
 * Run a single benchmark scenario
 */
async function runBenchmark(
  scenarioName: string,
  tasks: ParallelAgentTask[],
  iterations: number = 3
) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Benchmark: ${scenarioName}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Tasks: ${tasks.length}`);
  console.log(`Iterations: ${iterations}`);
  console.log('');

  const results = [];

  for (let i = 0; i < iterations; i++) {
    console.log(`Run ${i + 1}/${iterations}...`);
    const result = await ParallelExecutor.benchmark(tasks);
    results.push(result);

    console.log(`  Parallel time: ${formatTime(result.parallel.totalTime)}`);
    console.log(`  Speedup: ${formatSpeedup(result.speedup)}`);
    console.log(`  Efficiency: ${(result.efficiency * 100).toFixed(1)}%`);
  }

  // Calculate averages
  const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
  const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.parallel.totalTime, 0) / results.length;

  console.log('');
  console.log(`Average Results:`);
  console.log(`  Time: ${formatTime(avgTime)}`);
  console.log(`  Speedup: ${formatSpeedup(avgSpeedup)}`);
  console.log(`  Efficiency: ${(avgEfficiency * 100).toFixed(1)}%`);

  return {
    scenarioName,
    taskCount: tasks.length,
    avgSpeedup,
    avgEfficiency,
    avgTime
  };
}

/**
 * Run all benchmarks
 */
export async function runAllBenchmarks() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║          ULTRAPILOT PARALLEL EXECUTION BENCHMARK SUITE              ║');
  console.log('║                                                                    ║');
  console.log('║  Demonstrating 3-5x speedup over sequential execution              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const allResults = [];

  // Run all scenarios
  for (const [key, scenario] of Object.entries(BENCHMARK_SCENARIOS)) {
    const result = await runBenchmark(scenario.name, scenario.tasks, 3);
    allResults.push(result);
  }

  // Summary table
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                         BENCHMARK SUMMARY                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`┌─ ${'Scenario'.padEnd(35)} ── ${'Tasks'.padStart(5)} ── ${'Speedup'.padStart(10)} ── ${'Efficiency'.padStart(12)} ┐`);
  console.log('├' + '─'.repeat(70) + '┤');

  for (const result of allResults) {
    const scenario = result.scenarioName.padEnd(35);
    const tasks = String(result.taskCount).padStart(5);
    const speedup = formatSpeedup(result.avgSpeedup).padStart(10);
    const efficiency = `${(result.avgEfficiency * 100).toFixed(1)}%`.padStart(12);

    console.log(`│ ${scenario} │ ${tasks} │ ${speedup} │ ${efficiency} │`);
  }

  console.log('└' + '─'.repeat(70) + '┘');
  console.log('');

  // Overall statistics
  const totalSpeedup = allResults.reduce((sum, r) => sum + r.avgSpeedup, 0) / allResults.length;
  const totalEfficiency = allResults.reduce((sum, r) => sum + r.avgEfficiency, 0) / allResults.length;

  console.log(`Overall Average Speedup: ${formatSpeedup(totalSpeedup)}`);
  console.log(`Overall Average Efficiency: ${(totalEfficiency * 100).toFixed(1)}%`);
  console.log('');

  // Performance classification
  if (totalSpeedup >= 4) {
    console.log('✓ EXCELLENT: Parallel execution achieving 4x+ speedup');
  } else if (totalSpeedup >= 3) {
    console.log('✓ GOOD: Parallel execution achieving 3x+ speedup');
  } else if (totalSpeedup >= 2) {
    console.log('⚠ FAIR: Parallel execution achieving 2x+ speedup (may have bottlenecks)');
  } else {
    console.log('✗ POOR: Parallel execution not achieving significant speedup');
  }

  return allResults;
}

/**
 * Quick benchmark for single scenario
 */
export async function quickBenchmark(scenarioName: keyof typeof BENCHMARK_SCENARIOS) {
  const scenario = BENCHMARK_SCENARIOS[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    return;
  }

  const result = await runBenchmark(scenario.name, scenario.tasks, 1);
  return result;
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllBenchmarks()
    .then(() => {
      console.log('\nBenchmark complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}
