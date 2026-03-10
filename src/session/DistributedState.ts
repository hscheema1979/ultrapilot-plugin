/**
 * Distributed State Management
 *
 * Provides shared state across processes with versioning,
 * conflict resolution, and state replication capabilities.
 */

import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import {
  type DistributedStateEntry,
  type StateUpdateResult,
  ConflictResolution
} from './SessionTypes.js';

/**
 * Distributed State Manager
 *
 * Manages shared state with optimistic concurrency control
 * and configurable conflict resolution strategies.
 */
export class DistributedState {
  private pool: ConnectionPool;

  constructor() {
    this.pool = ConnectionPool.getInstance();
    this.initializeSchema();
  }

  /**
   * Initialize database schema for distributed state
   */
  private initializeSchema(): void {
    const db = this.pool.getWriter();

    db.exec(`
      CREATE TABLE IF NOT EXISTS distributed_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        previous_value TEXT,
        conflict_resolved INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_state_updated ON distributed_state(updated_at);
      CREATE INDEX IF NOT EXISTS idx_state_updated_by ON distributed_state(updated_by);
      CREATE INDEX IF NOT EXISTS idx_state_version ON distributed_state(version);

      -- State replication log for recovery
      CREATE TABLE IF NOT EXISTS state_replication_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_by TEXT NOT NULL,
        replicated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_replication_key ON state_replication_log(key);
      CREATE INDEX IF NOT EXISTS idx_replication_time ON state_replication_log(replicated_at);
    `);
  }

  /**
   * Get state value for key
   *
   * @param key - State key
   * @returns State entry or null
   */
  get(key: string): DistributedStateEntry | null {
    const db = this.pool.getReader();

    const row = db.prepare(`
      SELECT key, value, version, updated_by, updated_at
      FROM distributed_state
      WHERE key = ?
    `).get(key);

    if (!row) return null;

    const r = row as any;
    return {
      key: r.key,
      value: r.value,
      version: r.version,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at
    };
  }

  /**
   * Get multiple state values
   *
   * @param keys - Array of state keys
   * @returns Map of key to state entry
   */
  getMany(keys: string[]): Map<string, DistributedStateEntry> {
    const result = new Map<string, DistributedStateEntry>();

    if (keys.length === 0) return result;

    const db = this.pool.getReader();
    const placeholders = keys.map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT key, value, version, updated_by, updated_at
      FROM distributed_state
      WHERE key IN (${placeholders})
    `).all(...keys);

    for (const row of rows) {
      result.set((row as any).key, {
        key: (row as any).key,
        value: (row as any).value,
        version: (row as any).version,
        updatedBy: (row as any).updated_by,
        updatedAt: (row as any).updated_at
      });
    }

    return result;
  }

  /**
   * Set state value (no version checking - creates or overwrites)
   *
   * @param key - State key
   * @param value - State value
   * @param updatedBy - Process making the update
   * @returns Updated state entry
   */
  set(key: string, value: string, updatedBy: string): DistributedStateEntry {
    const db = this.pool.getWriter();
    const now = Date.now();

    const existing = this.get(key);
    const newVersion = existing ? existing.version + 1 : 1;

    const setTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO distributed_state (key, value, version, updated_by, updated_at, previous_value)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          version = excluded.version,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at,
          previous_value = distributed_state.value,
          conflict_resolved = 0
      `).run(key, value, newVersion, updatedBy, now, existing?.value || null);

      // Log for replication
      db.prepare(`
        INSERT INTO state_replication_log (key, value, version, updated_by, replicated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(key, value, newVersion, updatedBy, now);
    });

    setTx();

    return {
      key,
      value,
      version: newVersion,
      updatedBy,
      updatedAt: now
    };
  }

  /**
   * Compare and set - atomic update with version checking
   *
   * @param key - State key
   * @param expectedVersion - Expected current version
   * @param newValue - New value to set
   * @param updatedBy - Process making the update
   * @returns Update result
   */
  compareAndSet(
    key: string,
    expectedVersion: number,
    newValue: string,
    updatedBy: string
  ): StateUpdateResult {
    const db = this.pool.getWriter();
    const now = Date.now();

    const existing = this.get(key);

    // Key doesn't exist
    if (!existing) {
      return {
        success: false,
        version: 0,
        conflict: false,
        resolved: false
      };
    }

    // Version mismatch - conflict
    if (existing.version !== expectedVersion) {
      return {
        success: false,
        version: existing.version,
        conflict: true,
        resolved: false
      };
    }

    // Version matches - update
    const newVersion = existing.version + 1;

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE distributed_state
        SET value = ?, version = ?, updated_by = ?, updated_at = ?, previous_value = ?
        WHERE key = ? AND version = ?
      `).run(newValue, newVersion, updatedBy, now, existing.value, key, expectedVersion);

      // Log for replication
      db.prepare(`
        INSERT INTO state_replication_log (key, value, version, updated_by, replicated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(key, newValue, newVersion, updatedBy, now);
    });

    updateTx();

    return {
      success: true,
      version: newVersion,
      conflict: false,
      resolved: false
    };
  }

  /**
   * Update state with conflict resolution
   *
   * @param key - State key
   * @param value - New value
   * @param updatedBy - Process making the update
   * @param conflictResolution - Strategy for resolving conflicts
   * @returns Update result
   */
  update(
    key: string,
    value: string,
    updatedBy: string,
    conflictResolution: ConflictResolution = ConflictResolution.LAST_WRITE_WINS
  ): StateUpdateResult {
    const db = this.pool.getWriter();
    const now = Date.now();

    const existing = this.get(key);

    // No existing entry - create new
    if (!existing) {
      const created = this.set(key, value, updatedBy);
      return {
        success: true,
        version: created.version,
        conflict: false,
        resolved: false
      };
    }

    // Try optimistic compare-and-set
    const casResult = this.compareAndSet(key, existing.version, value, updatedBy);

    // If no conflict, return success
    if (!casResult.conflict) {
      return casResult;
    }

    // Conflict detected - apply resolution strategy
    const resolved = this.resolveConflict(key, value, updatedBy, conflictResolution, now);

    return {
      success: resolved.success,
      version: resolved.version,
      conflict: true,
      resolved: resolved.resolved
    };
  }

  /**
   * Resolve conflict using specified strategy
   */
  private resolveConflict(
    key: string,
    newValue: string,
    updatedBy: string,
    strategy: ConflictResolution,
    now: number
  ): { success: boolean; version: number; resolved: boolean } {
    const db = this.pool.getWriter();
    const current = this.get(key);

    if (!current) {
      return { success: false, version: 0, resolved: false };
    }

    switch (strategy) {
      case ConflictResolution.LAST_WRITE_WINS:
        // Always use new value
        return this.forceUpdate(key, newValue, updatedBy, now);

      case ConflictResolution.FIRST_WRITE_WINS:
        // Keep existing value - return success but indicate no change
        return {
          success: true,  // Operation succeeded but no change made
          version: current.version,
          resolved: true
        };

      case ConflictResolution.HIGHEST_VERSION:
        // Use value with highest version (simulate merge)
        const newVersion = current.version + 1;
        const updateTx = db.transaction(() => {
          db.prepare(`
            UPDATE distributed_state
            SET value = ?, version = ?, updated_by = ?, updated_at = ?, conflict_resolved = 1
            WHERE key = ?
          `).run(newValue, newVersion, updatedBy, now, key);
        });
        updateTx();
        return { success: true, version: newVersion, resolved: true };

      case ConflictResolution.MANUAL:
        // Return conflict for manual resolution
        return {
          success: false,
          version: current.version,
          resolved: false
        };

      default:
        return { success: false, version: current.version, resolved: false };
    }
  }

  /**
   * Force update without version checking
   */
  private forceUpdate(
    key: string,
    value: string,
    updatedBy: string,
    now: number
  ): { success: boolean; version: number; resolved: boolean } {
    const db = this.pool.getWriter();
    const current = this.get(key);
    const newVersion = current ? current.version + 1 : 1;

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE distributed_state
        SET value = ?, version = ?, updated_by = ?, updated_at = ?, conflict_resolved = 1
        WHERE key = ?
      `).run(value, newVersion, updatedBy, now, key);

      // Log for replication
      db.prepare(`
        INSERT INTO state_replication_log (key, value, version, updated_by, replicated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(key, value, newVersion, updatedBy, now);
    });

    updateTx();

    return { success: true, version: newVersion, resolved: true };
  }

  /**
   * Delete state entry
   *
   * @param key - State key to delete
   * @returns True if deleted
   */
  delete(key: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare('DELETE FROM distributed_state WHERE key = ?').run(key);
    return result.changes > 0;
  }

  /**
   * List all state entries with optional prefix filter
   *
   * @param prefix - Optional key prefix to filter
   * @returns Array of state entries
   */
  list(prefix?: string): DistributedStateEntry[] {
    const db = this.pool.getReader();

    let query = 'SELECT key, value, version, updated_by, updated_at FROM distributed_state';
    const params: string[] = [];

    if (prefix) {
      query += ' WHERE key LIKE ?';
      params.push(`${prefix}%`);
    }

    query += ' ORDER BY updated_at DESC';

    const rows = db.prepare(query).all(...params);

    return rows.map((row: any) => ({
      key: row.key,
      value: row.value,
      version: row.version,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    } as DistributedStateEntry));
  }

  /**
   * Get state history from replication log
   *
   * @param key - State key
   * @param limit - Maximum number of history entries
   * @returns Array of historical state entries
   */
  getHistory(key: string, limit: number = 10): DistributedStateEntry[] {
    const db = this.pool.getReader();

    const rows = db.prepare(`
      SELECT key, value, version, updated_by, replicated_at as updated_at
      FROM state_replication_log
      WHERE key = ?
      ORDER BY replicated_at DESC
      LIMIT ?
    `).all(key, limit);

    return rows.map((row: any) => ({
      key: row.key,
      value: row.value,
      version: row.version,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    } as DistributedStateEntry));
  }

  /**
   * Replicate state from another process
   *
   * @param entries - State entries to replicate
   * @returns Number of entries replicated
   */
  replicate(entries: DistributedStateEntry[]): number {
    const db = this.pool.getWriter();
    let replicated = 0;

    const replicateTx = db.transaction(() => {
      for (const entry of entries) {
        const existing = this.get(entry.key);

        // Only replicate if version is newer
        if (!existing || entry.version > existing.version) {
          db.prepare(`
            INSERT INTO distributed_state (key, value, version, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              version = excluded.version,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at
          `).run(entry.key, entry.value, entry.version, entry.updatedBy, entry.updatedAt);

          replicated++;
        }
      }
    });

    replicateTx();
    return replicated;
  }

  /**
   * Clear all replication logs older than specified time
   *
   * @param olderThanMs - Remove logs older than this
   * @returns Number of logs cleared
   */
  clearReplicationLog(olderThanMs: number): number {
    const db = this.pool.getWriter();
    const cutoff = Date.now() - olderThanMs;

    const result = db.prepare('DELETE FROM state_replication_log WHERE replicated_at < ?').run(cutoff);
    return result.changes;
  }

  /**
   * Get statistics about distributed state
   */
  getStats(): {
    totalEntries: number;
    totalConflicts: number;
    totalReplications: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const db = this.pool.getReader();

    const totalEntries = db.prepare('SELECT COUNT(*) as count FROM distributed_state').get() as { count: number };
    const totalConflicts = db.prepare("SELECT COUNT(*) as count FROM distributed_state WHERE conflict_resolved = 1").get() as { count: number };
    const totalReplications = db.prepare('SELECT COUNT(*) as count FROM state_replication_log').get() as { count: number };
    const timestamps = db.prepare('SELECT MIN(updated_at) as oldest, MAX(updated_at) as newest FROM distributed_state').get() as { oldest: number | null; newest: number | null };

    return {
      totalEntries: totalEntries.count,
      totalConflicts: totalConflicts.count,
      totalReplications: totalReplications.count,
      oldestEntry: timestamps.oldest,
      newestEntry: timestamps.newest
    };
  }
}
