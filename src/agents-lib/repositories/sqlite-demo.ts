/**
 * SQLite Agent Repository Demo
 *
 * Demonstrates the SQLite repository implementation with:
 * - Basic CRUD operations
 * - Advanced queries
 * - Performance benchmarks
 * - Migration from InMemory
 */

import {
  SQLiteAgentRepository,
  createSQLiteRepository,
  createRepository,
  migrateInMemoryToSQLite,
  benchmarkRepositories,
} from './sqlite.js';
import { InMemoryAgentRepository, createInMemoryRepository } from './in-memory.js';

/**
 * Demo: Basic SQLite Repository Operations
 */
export async function demoSQLiteBasics(pluginsDir: string): Promise<void> {
  console.log('\n=== SQLite Repository Demo ===\n');

  // Create SQLite repository
  const repo = await createSQLiteRepository(pluginsDir);

  // Get statistics
  const stats = await repo.getStats();
  console.log(`Repository Stats:`);
  console.log(`  Plugins: ${stats.pluginCount}`);
  console.log(`  Agents: ${stats.agentCount}`);
  console.log(`  Capabilities: ${stats.capabilityCount}`);

  // Find agents by capability
  console.log('\n--- Find agents by capability ---');
  const analysisAgents = await repo.findAgents('analysis');
  console.log(`Found ${analysisAgents.length} agents with 'analysis' capability`);
  if (analysisAgents.length > 0) {
    console.log(`  Top agent: ${analysisAgents[0].name} (score: ${analysisAgents[0].successRate})`);
  }

  // Find agents by multiple capabilities
  console.log('\n--- Find agents by multiple capabilities ---');
  const multiCapAgents = await repo.findAgentsByCapabilities(['analysis', 'backend']);
  console.log(`Found ${multiCapAgents.length} agents with both 'analysis' and 'backend'`);

  // Advanced query
  console.log('\n--- Advanced query ---');
  const queryResults = await repo.query({
    capabilities: ['backend'],
    status: 'idle',
    minSuccessRate: 0.5,
    limit: 5,
  });
  console.log(`Found ${queryResults.length} idle backend agents with >50% success rate`);

  // Search by keyword
  console.log('\n--- Search by keyword ---');
  const searchResults = await repo.search('api');
  console.log(`Found ${searchResults.length} agents matching 'api'`);

  // Get specific agent
  console.log('\n--- Get specific agent ---');
  if (analysisAgents.length > 0) {
    const agent = await repo.getAgent(analysisAgents[0].name);
    if (agent) {
      console.log(`Retrieved agent: ${agent.name}`);
      console.log(`  Capabilities: ${agent.capabilities.map(c => c.name).join(', ')}`);
    }
  }

  await repo.destroy();
}

/**
 * Demo: Migration from InMemory to SQLite
 */
export async function demoMigration(pluginsDir: string): Promise<void> {
  console.log('\n=== Migration Demo ===\n');

  // Create InMemory repository
  console.log('Creating InMemory repository...');
  const inMemory = await createInMemoryRepository(pluginsDir);
  const stats = await inMemory.getStats();
  console.log(`InMemory: ${stats.agentCount} agents`);

  // Migrate to SQLite
  console.log('\nMigrating to SQLite...');
  const sqlitePath = `${pluginsDir}/.wshobson-migrated.db`;
  const sqliteRepo = await migrateInMemoryToSQLite(inMemory, sqlitePath);

  // Verify migration
  const sqliteStats = await sqliteRepo.getStats();
  console.log(`\nMigration complete!`);
  console.log(`SQLite: ${sqliteStats.agentCount} agents`);
  console.log(`Match: ${stats.agentCount === sqliteStats.agentCount ? '✓' : '✗'}`);

  await sqliteRepo.destroy();
}

/**
 * Demo: Performance Benchmark
 */
export async function demoBenchmark(pluginsDir: string): Promise<void> {
  console.log('\n=== Performance Benchmark ===\n');

  const results = await benchmarkRepositories(pluginsDir, 50);

  console.log('\nResults:');
  console.log(`  InMemory: ${results.inMemory}ms`);
  console.log(`  SQLite: ${results.sqlite}ms`);
  console.log(`  Winner: ${results.winner}`);

  const speedup = results.winner === 'InMemory'
    ? (results.sqlite / results.inMemory).toFixed(2)
    : (results.inMemory / results.sqlite).toFixed(2);
  console.log(`  Speedup: ${speedup}x`);
}

/**
 * Demo: Advanced Query Features
 */
export async function demoAdvancedQueries(pluginsDir: string): Promise<void> {
  console.log('\n=== Advanced Query Demo ===\n');

  const repo = await createRepository('sqlite', pluginsDir);

  // Query 1: High-performing backend agents
  console.log('Query 1: High-performing backend agents');
  const q1 = await repo.query({
    capabilities: ['backend'],
    minSuccessRate: 0.7,
    status: 'idle',
    limit: 3,
  });
  console.log(`  Found ${q1.length} agents`);
  q1.forEach(agent => {
    console.log(`    - ${agent.name}: ${agent.successRate.toFixed(2)} success rate`);
  });

  // Query 2: Frontend developers with specific category
  console.log('\nQuery 2: Frontend developers');
  const q2 = await repo.query({
    capabilities: ['frontend', 'ui'],
    category: 'development',
  });
  console.log(`  Found ${q2.length} agents`);

  // Query 3: All agents with analysis capability
  console.log('\nQuery 3: All analysis agents (sorted by score)');
  const q3 = await repo.findAgents('analysis');
  console.log(`  Found ${q3.length} agents`);
  if (q3.length > 0) {
    console.log(`    Top 3:`);
    q3.slice(0, 3).forEach((agent, i) => {
      console.log(`      ${i + 1}. ${agent.name} (${agent.capabilities.find(c => c.name === 'analysis')?.confidence.toFixed(2)})`);
    });
  }

  await repo.destroy();
}

/**
 * Demo: Transaction Support
 */
export async function demoTransactions(pluginsDir: string): Promise<void> {
  console.log('\n=== Transaction Demo ===\n');

  const repo = await createSQLiteRepository(pluginsDir);

  // Get initial count
  const initialStats = await repo.getStats();
  console.log(`Initial agent count: ${initialStats.agentCount}`);

  // Transaction 1: Successful batch insert
  console.log('\nTransaction 1: Batch save agents');
  try {
    await repo.transaction(async (txRepo) => {
      // Simulate saving multiple agents
      const agents = await txRepo.query({ limit: 3 });
      console.log(`  Read ${agents.length} agents in transaction`);

      // In a real scenario, you'd modify agents here
      // For demo, we just read them
    });
    console.log('  ✓ Transaction committed');
  } catch (error) {
    console.log('  ✗ Transaction rolled back:', error);
  }

  // Transaction 2: Demonstrating rollback
  console.log('\nTransaction 2: Rollback demonstration');
  try {
    await repo.transaction(async (txRepo) => {
      // Simulate an operation that fails
      const agents = await txRepo.query({ limit: 3 });
      console.log(`  Read ${agents.length} agents`);

      // Simulate error
      throw new Error('Simulated error - transaction should rollback');
    });
  } catch (error) {
    console.log(`  ✓ Transaction rolled back as expected: ${(error as Error).message}`);
  }

  const finalStats = await repo.getStats();
  console.log(`\nFinal agent count: ${finalStats.agentCount} (unchanged, as expected)`);

  await repo.destroy();
}

/**
 * Demo: Export/Import
 */
export async function demoExportImport(pluginsDir: string): Promise<void> {
  console.log('\n=== Export/Import Demo ===\n');

  const repo1 = await createSQLiteRepository(pluginsDir);

  // Export to JSON
  console.log('Exporting database to JSON...');
  const jsonData = await repo1.exportToJSON();
  console.log(`  Exported ${jsonData.length} bytes`);

  // Parse to show structure
  const data = JSON.parse(jsonData);
  console.log(`  Version: ${data.version}`);
  console.log(`  Agents: ${data.agents.length}`);
  console.log(`  Exported: ${new Date(data.metadata.exportTime).toISOString()}`);

  // Import to new database
  console.log('\nImporting to new database...');
  const importPath = `${pluginsDir}/.wshobson-imported.db`;
  const repo2 = new SQLiteAgentRepository(importPath);
  await repo2.initialize(pluginsDir);
  await repo2.importFromJSON(jsonData);

  const stats = await repo2.getStats();
  console.log(`  Imported ${stats.agentCount} agents`);

  await repo1.destroy();
  await repo2.destroy();
}

/**
 * Main demo runner
 */
export async function runAllDemos(pluginsDir: string): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   SQLite Agent Repository - Complete Demo Suite      ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    await demoSQLiteBasics(pluginsDir);
    await demoMigration(pluginsDir);
    await demoBenchmark(pluginsDir);
    await demoAdvancedQueries(pluginsDir);
    await demoTransactions(pluginsDir);
    await demoExportImport(pluginsDir);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   All demos completed successfully! ✓                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n✗ Demo failed:', error);
    throw error;
  }
}

// Run demos if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pluginsDir = process.argv[2] || '/home/ubuntu/.claude/plugins';
  runAllDemos(pluginsDir).catch(console.error);
}
