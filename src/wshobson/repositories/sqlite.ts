/**
 * wshobson Agent Integration - SQLite Repository Implementation
 *
 * SQLite-based agent registry with ACID transactions, concurrent access via WAL mode,
 * and indexed queries for optimal performance.
 * Part of Phase 4: Smart Selection & Backend Decision
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  Agent,
  Capability,
  CapabilityIndex,
  Plugin,
  RegistryStats,
  CircuitBreakerState,
} from '../types.js';
import { BaseRepository } from '../repository.js';

/**
 * SQLite repository implementation with ACID guarantees and concurrent access
 */
export class SQLiteAgentRepository extends BaseRepository {
  private db: Database.Database;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string = '/tmp/ultrapilot/.ultra/wshobson-registry.db') {
    super();
    this.dbPath = dbPath;
    this.db = new Database(dbPath, {
      verbose: process.env.ULTRA_DEBUG_SQL ? console.log : undefined,
    });

    // Enable WAL mode for concurrent access
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.db.transaction(() => {
      // Agents table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS agents (
          name TEXT PRIMARY KEY,
          plugin TEXT NOT NULL,
          path TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          examples TEXT NOT NULL,
          metadata TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('idle', 'working', 'failed')),
          lastUsed INTEGER NOT NULL DEFAULT 0,
          successRate REAL NOT NULL DEFAULT 1.0,
          createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `);

      // Capabilities table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS capabilities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agentName TEXT NOT NULL,
          name TEXT NOT NULL,
          hierarchy TEXT NOT NULL,
          confidence REAL NOT NULL,
          FOREIGN KEY (agentName) REFERENCES agents(name) ON DELETE CASCADE
        );
      `);

      // Circuit breaker table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS circuit_breaker (
          agentName TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK(state IN ('closed', 'open', 'half-open')),
          failureCount INTEGER NOT NULL DEFAULT 0,
          lastFailureTime INTEGER NOT NULL DEFAULT 0,
          nextAttemptTime INTEGER NOT NULL DEFAULT 0,
          successCount INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Plugins table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS plugins (
          name TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          agentCount INTEGER NOT NULL DEFAULT 0,
          skillCount INTEGER NOT NULL DEFAULT 0,
          scannedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `);

      // Create indexes for performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agents_plugin ON agents(plugin);
        CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
        CREATE INDEX IF NOT EXISTS idx_agents_successRate ON agents(successRate DESC);
        CREATE INDEX IF NOT EXISTS idx_capabilities_agentName ON capabilities(agentName);
        CREATE INDEX IF NOT EXISTS idx_capabilities_name ON capabilities(name);
        CREATE INDEX IF NOT EXISTS idx_capabilities_hierarchy ON capabilities(hierarchy);
        CREATE INDEX IF NOT EXISTS idx_capabilities_confidence ON capabilities(confidence DESC);
      `);
    })();

    this.initialized = true;
  }

  /**
   * Find agents by capability with indexed query
   */
  async findAgents(capability: string): Promise<Agent[]> {
    await this.initialize();

    // Check capability index cache first
    const index = await this.getCapabilityIndex();
    if (index[capability]) {
      this.recordCacheHit();
      return index[capability].map((item) => item.agent);
    }

    this.recordCacheMiss();

    // Query database
    const stmt = this.db.prepare(`
      SELECT DISTINCT a.* FROM agents a
      INNER JOIN capabilities c ON c.agentName = a.name
      WHERE c.name = ? OR c.hierarchy LIKE ?
      ORDER BY c.confidence DESC, a.successRate DESC, a.lastUsed ASC
    `);

    const rows = stmt.all(capability, `%${capability}%`);
    return rows.map((row: any) => this.rowToAgent(row));
  }

  /**
   * Find agents matching multiple capabilities (AND logic)
   */
  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    await this.initialize();

    if (capabilities.length === 0) {
      return [];
    }

    if (capabilities.length === 1) {
      return this.findAgents(capabilities[0]);
    }

    // Build IN clause for all capabilities
    const placeholders = capabilities.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT a.*, COUNT(DISTINCT c.name) as matchCount
      FROM agents a
      INNER JOIN capabilities c ON c.agentName = a.name
      WHERE c.name IN (${placeholders})
      GROUP BY a.name
      HAVING matchCount = ?
      ORDER BY a.successRate DESC, a.lastUsed ASC
    `);

    const rows = stmt.all(...capabilities, capabilities.length);
    return rows.map((row: any) => this.rowToAgent(row));
  }

  /**
   * Get specific agent by name
   */
  async getAgent(name: string): Promise<Agent | undefined> {
    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE name = ?
    `);

    const row = stmt.get(name);
    if (!row) return undefined;

    return this.rowToAgent(row);
  }

  /**
   * Find all agents in a specific plugin
   */
  async findByPlugin(pluginName: string): Promise<Agent[]> {
    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE plugin = ?
      ORDER BY successRate DESC, lastUsed ASC
    `);

    const rows = stmt.all(pluginName);
    return rows.map((row: any) => this.rowToAgent(row));
  }

  /**
   * Search agents by keyword
   */
  async search(keyword: string): Promise<Agent[]> {
    await this.initialize();

    const stmt = this.db.prepare(`
      SELECT DISTINCT a.* FROM agents a
      LEFT JOIN capabilities c ON c.agentName = a.name
      WHERE a.name LIKE ? OR a.description LIKE ? OR a.category LIKE ? OR c.name LIKE ?
      ORDER BY a.successRate DESC
    `);

    const pattern = `%${keyword}%`;
    const rows = stmt.all(pattern, pattern, pattern, pattern);
    return rows.map((row: any) => this.rowToAgent(row));
  }

  /**
   * Save or update an agent
   */
  async save(agent: Agent): Promise<void> {
    await this.initialize();

    this.db.transaction(() => {
      // Upsert agent
      const upsertAgent = this.db.prepare(`
        INSERT INTO agents (name, plugin, path, description, category, examples, metadata, status, lastUsed, successRate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          plugin = excluded.plugin,
          path = excluded.path,
          description = excluded.description,
          category = excluded.category,
          examples = excluded.examples,
          metadata = excluded.metadata,
          status = excluded.status,
          lastUsed = excluded.lastUsed,
          successRate = excluded.successRate,
          updatedAt = strftime('%s', 'now')
      `);

      upsertAgent.run(
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

      // Delete existing capabilities
      this.db.prepare('DELETE FROM capabilities WHERE agentName = ?').run(agent.name);

      // Insert capabilities
      const insertCapability = this.db.prepare(`
        INSERT INTO capabilities (agentName, name, hierarchy, confidence)
        VALUES (?, ?, ?, ?)
      `);

      for (const cap of agent.capabilities) {
        insertCapability.run(
          agent.name,
          cap.name,
          cap.hierarchy.join('::'),
          cap.confidence
        );
      }

      // Update plugin agent count
      this.db.prepare(`
        INSERT INTO plugins (name, path, agentCount, skillCount)
        VALUES (?, ?, 1, 0)
        ON CONFLICT(name) DO UPDATE SET
          agentCount = agentCount + 1,
          scannedAt = strftime('%s', 'now')
      `).run(agent.plugin, agent.path.split('/plugins/')[1]?.split('/')[0] || agent.plugin);
    })();

    // Invalidate capability index
    this.capabilityIndex = {};
  }

  /**
   * Invalidate agent cache
   */
  async invalidate(agentName: string): Promise<void> {
    await this.initialize();

    this.db.prepare('UPDATE agents SET updatedAt = strftime("%s", "now") WHERE name = ?').run(agentName);
    this.capabilityIndex = {};
  }

  /**
   * Refresh entire registry
   */
  async refresh(): Promise<void> {
    await this.initialize();

    // Rebuild capability index
    const agents = this.db.prepare('SELECT * FROM agents').all();
    const agentObjects = agents.map((row: any) => this.rowToAgent(row));
    this.capabilityIndex = this.buildCapabilityIndex(agentObjects);
  }

  /**
   * Execute transaction with ACID guarantees
   */
  async transaction<T>(fn: (repo: SQLiteAgentRepository) => Promise<T>): Promise<T> {
    await this.initialize();

    return this.db.transaction(() => {
      return fn(this);
    })();
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<RegistryStats> {
    await this.initialize();

    const pluginCount = this.db.prepare('SELECT COUNT(*) as count FROM plugins').get() as any;
    const agentCount = this.db.prepare('SELECT COUNT(*) as count FROM agents').get() as any;
    const capabilityCount = this.db.prepare('SELECT COUNT(*) as count FROM capabilities').get() as any;
    const lastScan = this.db.prepare('SELECT MAX(scannedAt) as lastScan FROM plugins').get() as any;

    return {
      pluginCount: pluginCount.count,
      agentCount: agentCount.count,
      capabilityCount: capabilityCount.count,
      cacheHitRate: this.getCacheHitRate(),
      lastScanTime: lastScan.lastScan || 0,
      scanDuration: 0, // Not tracked in SQLite
    };
  }

  /**
   * Get capability index
   */
  async getCapabilityIndex(): Promise<CapabilityIndex> {
    await this.initialize();

    if (Object.keys(this.capabilityIndex).length > 0) {
      return this.capabilityIndex;
    }

    await this.refresh();
    return this.capabilityIndex;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    const rows = this.db.prepare('SELECT * FROM circuit_breaker').all() as any[];

    const state: CircuitBreakerState = {};
    for (const row of rows) {
      state[row.agentName] = {
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
   * Update circuit breaker state
   */
  updateCircuitBreakerState(agentName: string, state: CircuitBreakerState[string]): void {
    this.db.prepare(`
      INSERT INTO circuit_breaker (agentName, state, failureCount, lastFailureTime, nextAttemptTime, successCount)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agentName) DO UPDATE SET
        state = excluded.state,
        failureCount = excluded.failureCount,
        lastFailureTime = excluded.lastFailureTime,
        nextAttemptTime = excluded.nextAttemptTime,
        successCount = excluded.successCount
    `).run(
      agentName,
      state.state,
      state.failureCount,
      state.lastFailureTime,
      state.nextAttemptTime,
      state.successCount
    );
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to Agent object
   */
  private rowToAgent(row: any): Agent {
    // Load capabilities
    const capRows = this.db.prepare('SELECT * FROM capabilities WHERE agentName = ?').all(row.name);
    const capabilities: Capability[] = capRows.map((cap: any) => ({
      name: cap.name,
      hierarchy: cap.hierarchy.split('::'),
      confidence: cap.confidence,
    }));

    return {
      name: row.name,
      plugin: row.plugin,
      path: row.path,
      description: row.description,
      category: row.category,
      examples: JSON.parse(row.examples),
      metadata: JSON.parse(row.metadata),
      capabilities,
      status: row.status,
      lastUsed: row.lastUsed,
      successRate: row.successRate,
    };
  }

  /**
   * Migrate data from InMemory registry
   */
  async migrateFrom(agents: Agent[], plugins: Plugin[]): Promise<void> {
    await this.initialize();

    this.db.transaction(() => {
      // Clear existing data
      this.db.prepare('DELETE FROM agents').run();
      this.db.prepare('DELETE FROM capabilities').run();
      this.db.prepare('DELETE FROM plugins').run();

      // Insert plugins
      for (const plugin of plugins) {
        this.db.prepare(`
          INSERT INTO plugins (name, path, agentCount, skillCount)
          VALUES (?, ?, ?, ?)
        `).run(plugin.name, plugin.path, plugin.agentCount, plugin.skillCount);
      }

      // Insert agents
      for (const agent of agents) {
        this.db.prepare(`
          INSERT INTO agents (name, plugin, path, description, category, examples, metadata, status, lastUsed, successRate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
        for (const cap of agent.capabilities) {
          this.db.prepare(`
            INSERT INTO capabilities (agentName, name, hierarchy, confidence)
            VALUES (?, ?, ?, ?)
          `).run(agent.name, cap.name, cap.hierarchy.join('::'), cap.confidence);
        }
      }
    })();

    // Rebuild capability index
    await this.refresh();
  }
}
