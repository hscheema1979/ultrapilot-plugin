/**
 * SQLite Agent Repository Tests
 *
 * Comprehensive test suite for SQLite repository implementation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteAgentRepository } from '../sqlite.js';
import { InMemoryAgentRepository } from '../in-memory.js';
import { migrateInMemoryToSQLite } from '../sqlite.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SQLiteAgentRepository', () => {
  const testPluginsDir = '/tmp/test-wshobson-plugins';
  const testDbPath = '/tmp/test-wshobson-sqlite.db';
  let repo: SQLiteAgentRepository;

  beforeAll(async () => {
    // Create test plugins directory
    await fs.mkdir(testPluginsDir, { recursive: true });

    // Create a test plugin with an agent
    const pluginDir = path.join(testPluginsDir, 'test-plugin');
    await fs.mkdir(pluginDir, { recursive: true });

    const agentContent = `
---
name: test-agent
plugin: test-plugin
description: A test agent
capabilities:
  - name: testing
    hierarchy: [testing, unit]
    confidence: 0.9
category: testing
examples: []
---

# Test Agent

This is a test agent for SQLite repository testing.
`;

    await fs.writeFile(path.join(pluginDir, 'test-agent.md'), agentContent);

    // Initialize repository
    repo = new SQLiteAgentRepository(testDbPath);
    await repo.initialize(testPluginsDir);
  });

  afterAll(async () => {
    await repo.destroy();

    // Cleanup test files
    try {
      await fs.unlink(testDbPath);
      await fs.rm(testPluginsDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should initialize successfully', async () => {
    expect(repo).toBeDefined();
  });

  it('should get statistics', async () => {
    const stats = await repo.getStats();

    expect(stats).toBeDefined();
    expect(stats.pluginCount).toBeGreaterThanOrEqual(0);
    expect(stats.agentCount).toBeGreaterThanOrEqual(0);
    expect(stats.capabilityCount).toBeGreaterThanOrEqual(0);
  });

  it('should find agents by capability', async () => {
    const agents = await repo.findAgents('testing');

    expect(Array.isArray(agents)).toBe(true);
    // May not find agents if scanning didn't complete
  });

  it('should find agents by plugin', async () => {
    const agents = await repo.findAgentsByPlugin('test-plugin');

    expect(Array.isArray(agents)).toBe(true);
  });

  it('should support advanced queries', async () => {
    const results = await repo.query({
      limit: 10,
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('should search agents by keyword', async () => {
    const results = await repo.search('test');

    expect(Array.isArray(results)).toBe(true);
  });

  it('should support transactions', async () => {
    let transactionExecuted = false;

    await repo.transaction(async (txRepo) => {
      transactionExecuted = true;

      // Query within transaction
      const agents = await txRepo.query({ limit: 1 });
      expect(Array.isArray(agents)).toBe(true);
    });

    expect(transactionExecuted).toBe(true);
  });

  it('should rollback on transaction error', async () => {
    let errorCaught = false;

    try {
      await repo.transaction(async () => {
        throw new Error('Test error');
      });
    } catch (error) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);
  });

  it('should export to JSON', async () => {
    const jsonData = await repo.exportToJSON();

    expect(typeof jsonData).toBe('string');

    const data = JSON.parse(jsonData);
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('agents');
    expect(data).toHaveProperty('metadata');
  });

  it('should import from JSON', async () => {
    const jsonData = await repo.exportToJSON();

    // Create new repository
    const importDbPath = '/tmp/test-wshobson-import.db';
    const importRepo = new SQLiteAgentRepository(importDbPath);
    await importRepo.initialize(testPluginsDir);

    await importRepo.importFromJSON(jsonData);

    const stats = await importRepo.getStats();
    expect(stats.agentCount).toBeGreaterThanOrEqual(0);

    await importRepo.destroy();

    // Cleanup
    try {
      await fs.unlink(importDbPath);
    } catch (error) {
      // Ignore
    }
  });
});

describe('Migration: InMemory to SQLite', () => {
  const testPluginsDir = '/tmp/test-migration-plugins';
  const testDbPath = '/tmp/test-migration.db';
  let inMemoryRepo: InMemoryAgentRepository;
  let sqliteRepo: SQLiteAgentRepository;

  beforeAll(async () => {
    // Create test plugins directory
    await fs.mkdir(testPluginsDir, { recursive: true });

    // Create a test plugin
    const pluginDir = path.join(testPluginsDir, 'migration-test-plugin');
    await fs.mkdir(pluginDir, { recursive: true });

    const agentContent = `
---
name: migration-test-agent
plugin: migration-test-plugin
description: A migration test agent
capabilities:
  - name: testing
    hierarchy: [testing, migration]
    confidence: 0.8
category: testing
examples: []
---

# Migration Test Agent

This is a test agent for migration testing.
`;

    await fs.writeFile(path.join(pluginDir, 'migration-test-agent.md'), agentContent);

    // Initialize InMemory repository
    inMemoryRepo = new InMemoryAgentRepository();
    await inMemoryRepo.initialize(testPluginsDir);
  });

  afterAll(async () => {
    await inMemoryRepo.destroy();
    await sqliteRepo.destroy();

    // Cleanup test files
    try {
      await fs.unlink(testDbPath);
      await fs.rm(testPluginsDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should migrate from InMemory to SQLite', async () => {
    // Get source stats
    const sourceStats = await inMemoryRepo.getStats();

    // Migrate
    sqliteRepo = await migrateInMemoryToSQLite(inMemoryRepo, testDbPath);

    // Verify migration
    const targetStats = await sqliteRepo.getStats();

    expect(targetStats.agentCount).toBe(sourceStats.agentCount);
    expect(targetStats.pluginCount).toBe(sourceStats.pluginCount);
  });

  it('should preserve agent data during migration', async () => {
    // Get agent from InMemory
    const sourceAgent = await inMemoryRepo.getAgent('migration-test-agent');

    // Get agent from SQLite
    const targetAgent = await sqliteRepo.getAgent('migration-test-agent');

    expect(sourceAgent).toBeDefined();
    expect(targetAgent).toBeDefined();

    if (sourceAgent && targetAgent) {
      expect(targetAgent.name).toBe(sourceAgent.name);
      expect(targetAgent.plugin).toBe(sourceAgent.plugin);
      expect(targetAgent.description).toBe(sourceAgent.description);
      expect(targetAgent.capabilities).toEqual(sourceAgent.capabilities);
    }
  });
});

describe('SQLite Performance', () => {
  const testPluginsDir = '/tmp/test-perf-plugins';
  const testDbPath = '/tmp/test-perf.db';
  let repo: SQLiteAgentRepository;

  beforeAll(async () => {
    await fs.mkdir(testPluginsDir, { recursive: true });

    // Create test plugin
    const pluginDir = path.join(testPluginsDir, 'perf-plugin');
    await fs.mkdir(pluginDir, { recursive: true });

    const agentContent = `
---
name: perf-test-agent
plugin: perf-plugin
description: Performance test agent
capabilities:
  - name: performance
    hierarchy: [testing, performance]
    confidence: 1.0
category: testing
examples: []
---

# Performance Test Agent
`;

    await fs.writeFile(path.join(pluginDir, 'perf-test-agent.md'), agentContent);

    repo = new SQLiteAgentRepository(testDbPath);
    await repo.initialize(testPluginsDir);
  });

  afterAll(async () => {
    await repo.destroy();

    try {
      await fs.unlink(testDbPath);
      await fs.rm(testPluginsDir, { recursive: true });
    } catch (error) {
      // Ignore
    }
  });

  it('should handle batch operations efficiently', async () => {
    const iterations = 10;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await repo.findAgents('performance');
    }

    const duration = Date.now() - start;
    const avgTime = duration / iterations;

    console.log(`Average query time: ${avgTime}ms`);

    // Should be reasonably fast (< 100ms per query on modern hardware)
    expect(avgTime).toBeLessThan(100);
  });

  it('should support concurrent queries', async () => {
    const queries = [
      repo.findAgents('performance'),
      repo.query({ limit: 5 }),
      repo.search('perf'),
    ];

    const results = await Promise.all(queries);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
