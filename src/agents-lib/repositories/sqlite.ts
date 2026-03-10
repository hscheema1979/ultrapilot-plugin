/**
 * SQLite Agent Repository Implementation
 *
 * Production-quality SQLite backend for agent registry with:
 * - Proper indexing for fast queries
 * - Transaction support for data consistency
 * - Migration utility from InMemory to SQLite
 * - Comprehensive error handling
 * - Performance optimizations
 *
 * Database Schema:
 * - agents table: Stores agent metadata with unique constraint on name
 * - capabilities table: Many-to-many relationship with scoring
 * - Indexes on: agent name (unique), plugin, capabilities, category
 *
 * @module wshobson/repositories/sqlite
 */

// Import better-sqlite3 with proper ESM handling
const Database = require('better-sqlite3');
import * as path from 'path';
import * as fs from 'fs/promises';

import type {
  IAgentRepository,
  Agent,
  Plugin,
  QueryOptions,
  RegistryStats,
  Capability,
  CircuitBreakerState,
} from '../types.js';
import { InMemoryAgentRepository } from './in-memory.js';

/**
 * Database schema version for migrations
 */
const DB_SCHEMA_VERSION = 1;

/**
 * SQLite database instance wrapper
 */
class SQLiteDatabase {
  private db: any | null = null;
  private dbPath: string = '';

  /**
   * Open database connection
   */
  open(dbPath: string): void {
    this.dbPath = dbPath;
    this.db = (Database as any)(dbPath);

    if (!this.db) {
      throw new Error('Failed to open database');
    }

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get database instance
   */
  getDatabase(): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db !== null && this.db.open;
  }

  /**
   * Initialize database schema
   */
  initializeSchema(): void {
    const db = this.getDatabase();

    // Create agents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        plugin TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        category TEXT,
        examples TEXT,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        lastUsed INTEGER NOT NULL DEFAULT 0,
        successRate REAL NOT NULL DEFAULT 0.0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create capabilities table
    db.exec(`
      CREATE TABLE IF NOT EXISTS capabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        hierarchy TEXT,
        confidence REAL NOT NULL DEFAULT 0.0,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      )
    `);

    // Create circuit_breaker table
    db.exec(`
      CREATE TABLE IF NOT EXISTS circuit_breaker (
        agent_name TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'closed',
        failureCount INTEGER NOT NULL DEFAULT 0,
        lastFailureTime INTEGER NOT NULL DEFAULT 0,
        nextAttemptTime INTEGER NOT NULL DEFAULT 0,
        successCount INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create metadata table for version tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Insert schema version if not exists
    const versionStmt = db.prepare('SELECT value FROM metadata WHERE key = ?');
    const version = versionStmt.get('schema_version');
    if (!version) {
      const insertStmt = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');
      insertStmt.run('schema_version', DB_SCHEMA_VERSION.toString());
    }

    // Create indexes for performance
    this.createIndexes();
  }

  /**
   * Create indexes for optimized queries
   */
  private createIndexes(): void {
    const db = this.getDatabase();

    // Index on agent name (already unique, but explicit index helps)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name)
    `);

    // Index on plugin for fast plugin-based queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_plugin ON agents(plugin)
    `);

    // Index on category for category filtering
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)
    `);

    // Index on status for status-based queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)
    `);

    // Index on successRate for smart selection queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_success_rate ON agents(successRate)
    `);

    // Index on capability name for fast capability lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_capabilities_name ON capabilities(name)
    `);

    // Index on agent_id for JOIN operations
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_capabilities_agent_id ON capabilities(agent_id)
    `);

    // Composite index for common queries (plugin + status)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_plugin_status ON agents(plugin, status)
    `);

    // Composite index for capability + confidence (for ranked queries)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_capabilities_name_confidence ON capabilities(name, confidence DESC)
    `);
  }

  /**
   * Begin transaction
   */
  beginTransaction(): void {
    const db = this.getDatabase();
    db.exec('BEGIN IMMEDIATE TRANSACTION');
  }

  /**
   * Commit transaction
   */
  commit(): void {
    const db = this.getDatabase();
    db.exec('COMMIT');
  }

  /**
   * Rollback transaction
   */
  rollback(): void {
    const db = this.getDatabase();
    db.exec('ROLLBACK');
  }

  /**
   * Execute vacuum to optimize database
   */
  vacuum(): void {
    const db = this.getDatabase();
    db.exec('VACUUM');
  }

  /**
   * Analyze database for query optimization
   */
  analyze(): void {
    const db = this.getDatabase();
    db.exec('ANALYZE');
  }
}

/**
 * SQLite Agent Repository
 *
 * Production-quality implementation with:
 * - Fast indexed queries
 * - Transaction support
 * - Migration utilities
 * - Circuit breaker state persistence
 */
export class SQLiteAgentRepository implements IAgentRepository {
  private database: SQLiteDatabase;
  private pluginsDir: string = '';
  private initialized = false;
  private cachePath: string = '';

  constructor(dbPath?: string) {
    this.database = new SQLiteDatabase();
    if (dbPath) {
      this.database.open(dbPath);
    }
  }

  /**
   * Initialize repository with plugins directory
   */
  async initialize(pluginsDir: string): Promise<void> {
    // Validate plugins directory
    const validatedPluginsDir = await this.validatePluginsDir(pluginsDir);
    this.pluginsDir = validatedPluginsDir;

    // Set cache path
    this.cachePath = path.join(validatedPluginsDir, '.wshobson-sqlite.db');

    // Open database
    this.database.open(this.cachePath);

    // Initialize schema
    this.database.initializeSchema();

    // Try to load from cache
    const loaded = await this.load();

    if (!loaded) {
      // Database is empty, need to scan
      console.log('[SQLiteRepository] Database empty, scanning plugins...');
      await this.refresh();
    } else {
      console.log('[SQLiteRepository] Loaded from SQLite cache');
    }

    this.initialized = true;
  }

  /**
   * Find agents by capability with scoring
   *
   * Returns agents sorted by capability score (confidence + success rate)
   */
  async findAgents(capability: string): Promise<Agent[]> {
    const db = this.database.getDatabase();

    const stmt = db.prepare(`
      SELECT DISTINCT
        a.id, a.name, a.plugin, a.path, a.description, a.category,
        a.examples, a.metadata, a.status, a.lastUsed, a.successRate
      FROM agents a
      INNER JOIN capabilities c ON a.id = c.agent_id
      WHERE c.name = ?
      ORDER BY
        ((c.confidence + a.successRate) / 2) DESC,
        a.lastUsed ASC
    `);

    const rows = stmt.all(capability) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Find agents by multiple capabilities (AND logic)
   *
   * Returns agents that have ALL specified capabilities
   */
  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    if (capabilities.length === 0) {
      return this.getAllAgents();
    }

    const db = this.database.getDatabase();

    // Build query with multiple JOINs for AND logic
    const capabilityPlaceholders = capabilities.map(() => '?').join(',');
    const capabilityJoins = capabilities.map((_, i) =>
      `INNER JOIN capabilities c${i} ON a.id = c${i}.agent_id`
    ).join(' ');
    const capabilityFilters = capabilities.map((_, i) => `c${i}.name = ?`).join(' AND ');

    const query = `
      SELECT DISTINCT
        a.id, a.name, a.plugin, a.path, a.description, a.category,
        a.examples, a.metadata, a.status, a.lastUsed, a.successRate
      FROM agents a
      ${capabilityJoins}
      WHERE ${capabilityFilters}
      ORDER BY a.successRate DESC, a.lastUsed ASC
    `;

    const stmt = db.prepare(query);
    const rows = stmt.all(...capabilities, ...capabilities) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Find agents by plugin
   */
  async findAgentsByPlugin(pluginName: string): Promise<Agent[]> {
    const db = this.database.getDatabase();

    const stmt = db.prepare(`
      SELECT
        id, name, plugin, path, description, category,
        examples, metadata, status, lastUsed, successRate
      FROM agents
      WHERE plugin = ?
      ORDER BY successRate DESC, lastUsed ASC
    `);

    const rows = stmt.all(pluginName) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Advanced query with multi-criteria filtering
   *
   * Supports filtering by:
   * - capabilities (AND logic)
   * - category
   * - status
   * - minScore
   * - minSuccessRate
   * - limit
   */
  async query(options: QueryOptions): Promise<Agent[]> {
    const db = this.database.getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];

    // Build WHERE clause
    if (options.capabilities && options.capabilities.length > 0) {
      // Subquery for capability filtering
      const capabilityFilters = options.capabilities.map(() =>
        'EXISTS (SELECT 1 FROM capabilities c WHERE c.agent_id = a.id AND c.name = ?)'
      ).join(' AND ');
      conditions.push(`(${capabilityFilters})`);
      params.push(...options.capabilities);
    }

    if (options.category) {
      conditions.push('a.category = ?');
      params.push(options.category);
    }

    if (options.status) {
      conditions.push('a.status = ?');
      params.push(options.status);
    }

    if (options.minSuccessRate !== undefined) {
      conditions.push('a.successRate >= ?');
      params.push(options.minSuccessRate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    const orderBy = 'ORDER BY a.successRate DESC, a.lastUsed ASC';

    // Build LIMIT clause
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    const query = `
      SELECT
        a.id, a.name, a.plugin, a.path, a.description, a.category,
        a.examples, a.metadata, a.status, a.lastUsed, a.successRate
      FROM agents a
      ${whereClause}
      ${orderBy}
      ${limitClause}
    `;

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Get specific agent by name
   */
  async getAgent(name: string): Promise<Agent | undefined> {
    const db = this.database.getDatabase();

    const stmt = db.prepare(`
      SELECT
        id, name, plugin, path, description, category,
        examples, metadata, status, lastUsed, successRate
      FROM agents
      WHERE name = ?
    `);

    const row = stmt.get(name) as any | undefined;
    if (!row) {
      return undefined;
    }

    return this.rowToAgent(row);
  }

  /**
   * Search agents by keyword
   *
   * Searches in name, description, and capabilities
   */
  async search(keyword: string): Promise<Agent[]> {
    const db = this.database.getDatabase();
    const searchTerm = `%${keyword.toLowerCase()}%`;

    const stmt = db.prepare(`
      SELECT DISTINCT
        a.id, a.name, a.plugin, a.path, a.description, a.category,
        a.examples, a.metadata, a.status, a.lastUsed, a.successRate
      FROM agents a
      LEFT JOIN capabilities c ON a.id = c.agent_id
      WHERE LOWER(a.name) LIKE ?
        OR LOWER(a.description) LIKE ?
        OR LOWER(c.name) LIKE ?
      ORDER BY a.successRate DESC, a.lastUsed ASC
    `);

    const rows = stmt.all(searchTerm, searchTerm, searchTerm) as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Save or update agent
   *
   * Upserts agent and their capabilities
   */
  async save(agent: Agent): Promise<void> {
    return this.transaction(async () => {
      const db = this.database.getDatabase();

      // Check if agent exists
      const existingStmt = db.prepare('SELECT id FROM agents WHERE name = ?');
      const existing = existingStmt.get(agent.name) as { id: number } | undefined;

      if (existing) {
        // Update existing agent
        const updateStmt = db.prepare(`
          UPDATE agents
          SET plugin = ?, path = ?, description = ?, category = ?,
              examples = ?, metadata = ?, status = ?,
              lastUsed = ?, successRate = ?, updated_at = strftime('%s', 'now')
          WHERE name = ?
        `);

        updateStmt.run(
          agent.plugin,
          agent.path,
          agent.description,
          agent.category,
          JSON.stringify(agent.examples),
          JSON.stringify(agent.metadata),
          agent.status,
          agent.lastUsed,
          agent.successRate,
          agent.name
        );

        // Delete old capabilities
        const deleteCapsStmt = db.prepare('DELETE FROM capabilities WHERE agent_id = ?');
        deleteCapsStmt.run(existing.id);

        // Insert new capabilities
        await this.insertCapabilities(existing.id, agent.capabilities);
      } else {
        // Insert new agent
        const insertStmt = db.prepare(`
          INSERT INTO agents (name, plugin, path, description, category,
                             examples, metadata, status, lastUsed, successRate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
          agent.name,
          agent.plugin,
          agent.path,
          agent.description,
          agent.category,
          JSON.stringify(agent.examples),
          JSON.stringify(agent.metadata),
          agent.status,
          agent.lastUsed,
          agent.successRate
        );

        // Insert capabilities
        await this.insertCapabilities(result.lastInsertRowid as number, agent.capabilities);
      }
    });
  }

  /**
   * Bulk save agents (optimized for batch operations)
   */
  async saveBatch(agents: Agent[]): Promise<void> {
    return this.transaction(async () => {
      for (const agent of agents) {
        await this.save(agent);
      }
    });
  }

  /**
   * Insert capabilities for an agent
   */
  private async insertCapabilities(agentId: number, capabilities: Capability[]): Promise<void> {
    const db = this.database.getDatabase();

    const stmt = db.prepare(`
      INSERT INTO capabilities (agent_id, name, hierarchy, confidence)
      VALUES (?, ?, ?, ?)
    `);

    for (const capability of capabilities) {
      stmt.run(
        agentId,
        capability.name,
        JSON.stringify(capability.hierarchy),
        capability.confidence
      );
    }
  }

  /**
   * Invalidate agent (remove from cache)
   */
  async invalidate(agentName: string): Promise<void> {
    const db = this.database.getDatabase();

    const stmt = db.prepare('DELETE FROM agents WHERE name = ?');
    stmt.run(agentName);
  }

  /**
   * Refresh by rescanning plugins
   *
   * Clears and rebuilds the database from plugin scan
   */
  async refresh(): Promise<void> {
    const db = this.database.getDatabase();

    // Clear existing data
    db.exec('DELETE FROM capabilities');
    db.exec('DELETE FROM agents');
    db.exec('DELETE FROM circuit_breaker');

    // Import from scanner (temporary: use InMemory for scanning)
    // This is a bridge until we have direct SQLite scanning
    const tempRepo = new InMemoryAgentRepository();
    await tempRepo.initialize(this.pluginsDir);

    // Get all agents from InMemory repo
    const stats = await tempRepo.getStats();

    // Save all agents to SQLite
    const allAgents: Agent[] = [];
    const agents = await tempRepo.query({});
    for (const agent of agents) {
      allAgents.push(agent);
    }

    await this.saveBatch(allAgents);

    console.log(`[SQLiteRepository] Refreshed ${stats.agentCount} agents`);
  }

  /**
   * Execute transaction
   *
   * Provides ACID guarantees for multi-step operations
   */
  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    this.database.beginTransaction();

    try {
      const result = await fn(this);
      this.database.commit();
      return result;
    } catch (error) {
      this.database.rollback();
      throw error;
    }
  }

  /**
   * Get repository statistics
   */
  async getStats(): Promise<RegistryStats> {
    const db = this.database.getDatabase();

    const statsStmt = db.prepare(`
      SELECT
        COUNT(DISTINCT plugin) as pluginCount,
        COUNT(*) as agentCount
      FROM agents
    `);

    const capabilityCountStmt = db.prepare(`
      SELECT COUNT(DISTINCT name) as capabilityCount
      FROM capabilities
    `);

    const stats = statsStmt.get() as { pluginCount: number; agentCount: number };
    const capStats = capabilityCountStmt.get() as { capabilityCount: number };

    return {
      pluginCount: stats.pluginCount,
      agentCount: stats.agentCount,
      capabilityCount: capStats.capabilityCount,
      scanTime: Date.now(),
      version: DB_SCHEMA_VERSION.toString(),
    };
  }

  /**
   * Load from SQLite cache (always returns true if DB exists)
   */
  async load(): Promise<boolean> {
    try {
      const db = this.database.getDatabase();

      // Check if database has data
      const stmt = db.prepare('SELECT COUNT(*) as count FROM agents');
      const result = stmt.get() as { count: number };

      return result.count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save cache (no-op for SQLite, data is auto-saved)
   */
  async saveCache(): Promise<void> {
    // SQLite is auto-saved on each transaction
    // This is a no-op for interface compatibility
  }

  /**
   * Cleanup and close database
   */
  async destroy(): Promise<void> {
    this.database.close();
    this.initialized = false;
  }

  /**
   * Optimize database (VACUUM + ANALYZE)
   *
   * Should be run periodically for best performance
   */
  async optimize(): Promise<void> {
    this.database.vacuum();
    this.database.analyze();
  }

  /**
   * Convert database row to Agent object
   */
  private rowToAgent(row: any): Agent {
    // Load capabilities for this agent
    const db = this.database.getDatabase();
    const capStmt = db.prepare('SELECT name, hierarchy, confidence FROM capabilities WHERE agent_id = ?');
    const capRows = capStmt.all(row.id) as any[];

    const capabilities: Capability[] = capRows.map(capRow => ({
      name: capRow.name,
      hierarchy: JSON.parse(capRow.hierarchy || '[]'),
      confidence: capRow.confidence,
    }));

    return {
      name: row.name,
      plugin: row.plugin,
      path: row.path,
      description: row.description,
      capabilities,
      category: row.category,
      examples: JSON.parse(row.examples || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      status: row.status,
      lastUsed: row.lastUsed,
      successRate: row.successRate,
    };
  }

  /**
   * Get all agents
   */
  private async getAllAgents(): Promise<Agent[]> {
    const db = this.database.getDatabase();

    const stmt = db.prepare(`
      SELECT
        id, name, plugin, path, description, category,
        examples, metadata, status, lastUsed, successRate
      FROM agents
      ORDER BY successRate DESC, lastUsed ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Validate plugins directory path
   *
   * Security: Prevents path traversal attacks
   */
  private async validatePluginsDir(pluginsDir: string): Promise<string> {
    // Must be absolute path
    if (!path.isAbsolute(pluginsDir)) {
      throw new Error('Plugins directory must be an absolute path');
    }

    // Check if directory exists
    try {
      const stats = await fs.stat(pluginsDir);
      if (!stats.isDirectory()) {
        throw new Error('Plugins path is not a directory');
      }
    } catch (error) {
      throw new Error('Cannot access plugins directory');
    }

    // Resolve to real path
    return await fs.realpath(pluginsDir);
  }

  /**
   * Export database to JSON (for backup/migration)
   */
  async exportToJSON(): Promise<string> {
    const agents = await this.getAllAgents();
    const stats = await this.getStats();

    const exportData = {
      version: DB_SCHEMA_VERSION,
      metadata: {
        exportTime: Date.now(),
        pluginCount: stats.pluginCount,
        agentCount: stats.agentCount,
        capabilityCount: stats.capabilityCount,
      },
      agents,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import from JSON (for migration)
   */
  async importFromJSON(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);

    if (!data.agents || !Array.isArray(data.agents)) {
      throw new Error('Invalid import data: missing agents array');
    }

    await this.saveBatch(data.agents);
    console.log(`[SQLiteRepository] Imported ${data.agents.length} agents`);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    const db = this.database.getDatabase();

    const stmt = db.prepare('SELECT * FROM circuit_breaker');
    const rows = stmt.all() as any[];

    const state: CircuitBreakerState = {};
    for (const row of rows) {
      state[row.agent_name] = {
        state: row.state,
        failureCount: row.failureCount,
        lastFailureTime: row.lastFailureTime,
        nextAttemptTime: row.nextAttemptTime,
        successCount: row.successCount,
      };
    }

    return state;
  }

  /**
   * Save circuit breaker state
   */
  saveCircuitBreakerState(state: CircuitBreakerState): void {
    const db = this.database.getDatabase();

    const deleteStmt = db.prepare('DELETE FROM circuit_breaker');
    deleteStmt.run();

    const insertStmt = db.prepare(`
      INSERT INTO circuit_breaker (agent_name, state, failureCount, lastFailureTime, nextAttemptTime, successCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [agentName, data] of Object.entries(state)) {
      insertStmt.run(
        agentName,
        data.state,
        data.failureCount,
        data.lastFailureTime,
        data.nextAttemptTime,
        data.successCount
      );
    }
  }
}

/**
 * Migration utility: InMemory to SQLite
 *
 * Migrates data from InMemoryAgentRepository to SQLiteAgentRepository
 *
 * @param source - Source InMemory repository
 * @param targetDbPath - Target SQLite database path
 * @returns Promise<SQLiteAgentRepository> - Migrated repository
 */
export async function migrateInMemoryToSQLite(
  source: InMemoryAgentRepository,
  targetDbPath: string
): Promise<SQLiteAgentRepository> {
  console.log('[Migration] Starting InMemory to SQLite migration...');

  // Create target repository
  const target = new SQLiteAgentRepository(targetDbPath);
  await target.initialize(source['pluginsDir']); // Access private property

  // Get all agents from source
  const stats = await source.getStats();
  console.log(`[Migration] Migrating ${stats.agentCount} agents...`);

  const allAgents: Agent[] = [];
  const agents = await source.query({});

  for (const agent of agents) {
    allAgents.push(agent);
  }

  // Batch save to target
  await target.saveBatch(allAgents);

  // Migrate circuit breaker state
  const cbState = source['circuitBreaker'];
  if (cbState && cbState.size > 0) {
    const stateObj: CircuitBreakerState = {};
    cbState.forEach((value: any, key: string) => {
      stateObj[key] = value;
    });
    target.saveCircuitBreakerState(stateObj);
  }

  console.log('[Migration] Migration complete!');
  console.log(`[Migration] Migrated ${stats.agentCount} agents`);
  console.log(`[Migration] Database saved to: ${targetDbPath}`);

  return target;
}

/**
 * Performance benchmark utility
 *
 * Compares performance between InMemory and SQLite repositories
 */
export async function benchmarkRepositories(
  pluginsDir: string,
  iterations: number = 100
): Promise<{
  inMemory: number;
  sqlite: number;
  winner: string;
}> {
  console.log(`[Benchmark] Running ${iterations} iterations...`);

  // Benchmark InMemory
  const inMemoryRepo = new InMemoryAgentRepository();
  await inMemoryRepo.initialize(pluginsDir);

  const inMemoryStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await inMemoryRepo.findAgents('analysis');
  }
  const inMemoryTime = Date.now() - inMemoryStart;

  // Benchmark SQLite
  const sqlitePath = path.join(pluginsDir, '.wshobson-benchmark.db');
  const sqliteRepo = new SQLiteAgentRepository();
  await sqliteRepo.initialize(pluginsDir);

  const sqliteStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await sqliteRepo.findAgents('analysis');
  }
  const sqliteTime = Date.now() - sqliteStart;

  // Cleanup
  await sqliteRepo.destroy();
  await fs.unlink(sqlitePath).catch(() => {});

  const winner = inMemoryTime < sqliteTime ? 'InMemory' : 'SQLite';

  console.log(`[Benchmark] Results:`);
  console.log(`[Benchmark] InMemory: ${inMemoryTime}ms`);
  console.log(`[Benchmark] SQLite: ${sqliteTime}ms`);
  console.log(`[Benchmark] Winner: ${winner}`);

  return {
    inMemory: inMemoryTime,
    sqlite: sqliteTime,
    winner,
  };
}

/**
 * Create SQLite repository (factory function)
 *
 * @param pluginsDir - Directory containing plugins
 * @param dbPath - Optional custom database path
 * @returns Promise<SQLiteAgentRepository> - Initialized repository
 */
export async function createSQLiteRepository(
  pluginsDir: string,
  dbPath?: string
): Promise<SQLiteAgentRepository> {
  const repo = new SQLiteAgentRepository(dbPath);
  await repo.initialize(pluginsDir);
  return repo;
}

/**
 * Get repository by backend type
 *
 * Factory function that creates the appropriate repository based on backend type
 *
 * @param backend - 'memory' or 'sqlite'
 * @param pluginsDir - Directory containing plugins
 * @param dbPath - Optional database path for SQLite
 * @returns Promise<IAgentRepository> - Initialized repository
 */
export async function createRepository(
  backend: 'memory' | 'sqlite',
  pluginsDir: string,
  dbPath?: string
): Promise<IAgentRepository> {
  if (backend === 'sqlite') {
    return createSQLiteRepository(pluginsDir, dbPath);
  }

  // Default to InMemory
  const { createInMemoryRepository } = await import('./in-memory.js');
  return createInMemoryRepository(pluginsDir);
}
