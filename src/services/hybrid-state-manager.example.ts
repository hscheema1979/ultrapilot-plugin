/**
 * Hybrid State Manager - Integration Example
 *
 * This example demonstrates how to integrate the HybridStateManager
 * with the Ultrapilot system for task queue state management.
 */

import { HybridStateManager, createHybridStateManager } from './hybrid-state-manager';
import { GitHubService } from './github-service';
import { GitHubAppAuthManager } from './github-app-auth';
import { StateObject, StateType } from './github-state-adapter';

/**
 * Example: Initialize HybridStateManager
 */
async function initializeHybridStateManager() {
  // Create GitHub App auth manager
  const authManager = new GitHubAppAuthManager({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
    installationId: parseInt(process.env.GITHUB_INSTALLATION_ID!),
  });

  // Create GitHub service
  const githubService = new GitHubService(
    {
      owner: 'ultrapilot',
      repo: 'state-repository',
      cacheMaxAge: 300000, // 5 minutes
    },
    authManager
  );

  await githubService.initializeOctokit();

  // Create hybrid state manager
  const hybridManager = createHybridStateManager(githubService, {
    cacheDir: '.ultra/cache',
    stalenessThreshold: 30000, // 30 seconds
    syncDebounceDelay: 100,    // 100ms
    syncInterval: 1000,        // 1 second
    maxRetries: 3,
    enableBackgroundSync: true,
  });

  await hybridManager.initialize();

  return { githubService, hybridManager };
}

/**
 * Example: Migrate task queue state to hybrid storage
 */
async function migrateTaskQueueState() {
  const { hybridManager } = await initializeHybridStateManager();

  // Local task queue state (currently in .ultra/state/)
  const localTaskQueueState = {
    queue_name: 'intake',
    task_count: 5,
    tasks: [
      {
        id: 'task-1',
        title: 'Implement authentication module',
        priority: 'high',
        size: 'lg',
        created_at: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Create API endpoints',
        priority: 'critical',
        size: 'xl',
        created_at: new Date().toISOString(),
      },
    ],
  };

  // Convert to StateObject
  const stateObject: StateObject = {
    state_id: 'task-queue-intake',
    type: 'task_queue',
    updated_at: new Date().toISOString(),
    version: 1,
    data: localTaskQueueState,
  };

  // Write to hybrid storage (fast local + GitHub persistence)
  await hybridManager.write('task-queue-intake', stateObject);

  console.log('Task queue state migrated to hybrid storage');
}

/**
 * Example: Read task queue state with caching
 */
async function readTaskQueueState() {
  const { hybridManager } = await initializeHybridStateManager();

  // Read from hybrid storage (cache hit if fresh)
  const state = await hybridManager.read('task-queue-intake');

  console.log('Task queue state:', state.data);

  return state;
}

/**
 * Example: Force refresh from GitHub
 */
async function forceRefreshFromGitHub() {
  const { hybridManager } = await initializeHybridStateManager();

  // Force refresh from GitHub, bypassing cache
  const freshState = await hybridManager.read('task-queue-intake', {
    forceRefresh: true,
  });

  console.log('Fresh state from GitHub:', freshState.data);

  return freshState;
}

/**
 * Example: Accept stale cache during GitHub outage
 */
async function acceptStaleCache() {
  const { hybridManager } = await initializeHybridStateManager();

  // Accept stale cache if GitHub is unavailable
  const state = await hybridManager.read('task-queue-intake', {
    allowStale: true,
  });

  console.log('State (may be stale):', state.data);

  return state;
}

/**
 * Example: Manually trigger sync
 */
async function manualSync() {
  const { hybridManager } = await initializeHybridStateManager();

  // Manually sync state to GitHub
  await hybridManager.sync('task-queue-intake');

  console.log('State synced to GitHub');
}

/**
 * Example: Clear cache to force fresh read
 */
async function clearCache() {
  const { hybridManager } = await initializeHybridStateManager();

  // Clear cache for specific state
  await hybridManager.clearCache('task-queue-intake');

  console.log('Cache cleared, next read will fetch from GitHub');

  // Next read will fetch from GitHub
  const state = await hybridManager.read('task-queue-intake');
  console.log('Fresh state:', state.data);
}

/**
 * Example: Handle GitHub outage gracefully
 */
async function handleGitHubOutage() {
  const { hybridManager } = await initializeHybridStateManager();

  try {
    // Attempt to read from GitHub
    const state = await hybridManager.read('task-queue-intake');
    console.log('State from GitHub:', state.data);
  } catch (error) {
    // GitHub unavailable, fall back to stale cache
    console.warn('GitHub unavailable, using stale cache');

    const state = await hybridManager.read('task-queue-intake', {
      allowStale: true,
    });

    console.log('State from cache:', state.data);

    // Continue working, writes will be queued
    await hybridManager.write('task-queue-intake', state);
    console.log('Write queued for later sync');
  }
}

/**
 * Example: Batch migrate multiple task queues
 */
async function batchMigrateTaskQueues() {
  const { hybridManager } = await initializeHybridStateManager();

  const taskQueues = [
    { name: 'intake', count: 5 },
    { name: 'active', count: 3 },
    { name: 'review', count: 2 },
    { name: 'done', count: 10 },
  ];

  // Migrate all task queues (fast parallel writes)
  await Promise.all(
    taskQueues.map(async (queue) => {
      const stateObject: StateObject = {
        state_id: `task-queue-${queue.name}`,
        type: 'task_queue',
        updated_at: new Date().toISOString(),
        version: 1,
        data: {
          queue_name: queue.name,
          task_count: queue.count,
          tasks: [],
        },
      };

      await hybridManager.write(`task-queue-${queue.name}`, stateObject);
      console.log(`Migrated ${queue.name} queue`);
    })
  );

  console.log('All task queues migrated');
}

/**
 * Example: Close manager gracefully
 */
async function closeGracefully() {
  const { hybridManager } = await initializeHybridStateManager();

  // Write some state
  const stateObject: StateObject = {
    state_id: 'test-state',
    type: 'task_queue',
    updated_at: new Date().toISOString(),
    version: 1,
    data: { test: true },
  };

  await hybridManager.write('test-state', stateObject);

  // Close manager (flushes pending syncs)
  await hybridManager.close();

  console.log('Manager closed, all syncs flushed');
}

/**
 * Example: Monitor sync queue
 */
async function monitorSyncQueue() {
  const { hybridManager } = await initializeHybridStateManager();

  // Write multiple states rapidly
  for (let i = 0; i < 10; i++) {
    const stateObject: StateObject = {
      state_id: `rapid-state-${i}`,
      type: 'task_queue',
      updated_at: new Date().toISOString(),
      version: 1,
      data: { index: i },
    };

    await hybridManager.write(`rapid-state-${i}`, stateObject);
  }

  // Wait for debounce
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Close to flush syncs
  await hybridManager.close();

  console.log('All rapid writes synced to GitHub');
}

/**
 * Example: Integration with Ultrapilot state
 */
async function integrateWithUltrapilotState() {
  const { hybridManager } = await initializeHybridStateManager();

  // Ultrapilot autopilot state
  const autopilotState = {
    active: true,
    timestamp: new Date().toISOString(),
    sessionId: 'session-123',
    phase: 'execution' as const,
    status: 'running' as const,
    specPath: '.ultra/spec.md',
    planPath: '.ultra/plan.md',
    tasks: {
      total: 10,
      completed: 5,
      pending: 5,
    },
    activeAgents: 3,
  };

  // Convert to StateObject
  const stateObject: StateObject = {
    state_id: 'autopilot-state',
    type: 'autopilot_state',
    updated_at: new Date().toISOString(),
    version: 1,
    data: autopilotState,
  };

  // Write to hybrid storage
  await hybridManager.write('autopilot-state', stateObject);

  console.log('Autopilot state saved to hybrid storage');

  // Read back
  const restored = await hybridManager.read('autopilot-state');
  console.log('Restored autopilot state:', restored.data);
}

/**
 * Example: Performance benchmarking
 */
async function benchmarkPerformance() {
  const { hybridManager } = await initializeHybridStateManager();

  const stateObject: StateObject = {
    state_id: 'benchmark-state',
    type: 'task_queue',
    updated_at: new Date().toISOString(),
    version: 1,
    data: { benchmark: true },
  };

  // Benchmark write (should be < 10ms)
  const writeStart = Date.now();
  await hybridManager.write('benchmark-state', stateObject);
  const writeTime = Date.now() - writeStart;

  console.log(`Write time: ${writeTime}ms`);

  // Benchmark read (cache hit, should be < 5ms)
  const readStart = Date.now();
  await hybridManager.read('benchmark-state');
  const readTime = Date.now() - readStart;

  console.log(`Read time (cache hit): ${readTime}ms`);

  await hybridManager.close();
}

// Export examples for use in tests or documentation
export const examples = {
  initializeHybridStateManager,
  migrateTaskQueueState,
  readTaskQueueState,
  forceRefreshFromGitHub,
  acceptStaleCache,
  manualSync,
  clearCache,
  handleGitHubOutage,
  batchMigrateTaskQueues,
  closeGracefully,
  monitorSyncQueue,
  integrateWithUltrapilotState,
  benchmarkPerformance,
};
