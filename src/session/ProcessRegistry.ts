/**
 * Process Registry
 *
 * Manages process discovery, health monitoring, and cleanup
 * for multi-process coordination scenarios.
 */

import { randomUUID } from 'crypto';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import type { ProcessInfo } from './SessionTypes.js';

/**
 * Process Registry Options
 */
export interface ProcessRegistryOptions {
  heartbeatInterval?: number;    // Heartbeat interval in ms (default: 30s)
  heartbeatTimeout?: number;     // Timeout before marking suspected (default: 90s)
  deadTimeout?: number;          // Timeout before marking dead (default: 300s)
  cleanupInterval?: number;      // Cleanup interval in ms (default: 60s)
}

/**
 * Process Registry
 *
 * Tracks all active processes, monitors health via heartbeats,
 * and automatically cleans up dead processes.
 */
export class ProcessRegistry {
  private pool: ConnectionPool;
  private options: Required<ProcessRegistryOptions>;
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: ProcessRegistryOptions = {}) {
    this.pool = ConnectionPool.getInstance();
    this.options = {
      heartbeatInterval: options.heartbeatInterval || 30000,
      heartbeatTimeout: options.heartbeatTimeout || 90000,
      deadTimeout: options.deadTimeout || 300000,
      cleanupInterval: options.cleanupInterval || 60000
    };
    this.initializeSchema();
    this.startCleanup();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    const db = this.pool.getWriter();

    db.exec(`
      CREATE TABLE IF NOT EXISTS process_registry (
        process_id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'alive',
        last_heartbeat INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        metadata TEXT,
        UNIQUE(pid, role)
      );

      CREATE INDEX IF NOT EXISTS idx_process_status ON process_registry(status);
      CREATE INDEX IF NOT EXISTS idx_process_role ON process_registry(role);
      CREATE INDEX IF NOT EXISTS idx_process_heartbeat ON process_registry(last_heartbeat);
    `);
  }

  /**
   * Register a new process
   *
   * @param pid - Process ID
   * @param role - Process role
   * @param metadata - Optional metadata
   * @returns Process ID
   */
  register(pid: number, role: string, metadata: Record<string, unknown> = {}): string {
    const db = this.pool.getWriter();
    const now = Date.now();
    const processId = randomUUID();

    const registerTx = db.transaction(() => {
      // Check if process already registered
      const existing = db.prepare(
        'SELECT process_id FROM process_registry WHERE pid = ? AND role = ?'
      ).get(pid, role);

      if (existing) {
        throw new Error(`Process ${pid} with role ${role} already registered`);
      }

      // Register process
      db.prepare(`
        INSERT INTO process_registry (process_id, pid, role, status, last_heartbeat, started_at, metadata)
        VALUES (?, ?, ?, 'alive', ?, ?, ?)
      `).run(processId, pid, role, now, now, JSON.stringify(metadata));
    });

    registerTx();

    // Start automatic heartbeat
    this.startHeartbeat(processId);

    return processId;
  }

  /**
   * Unregister a process
   *
   * @param processId - Process ID
   */
  unregister(processId: string): void {
    const db = this.pool.getWriter();

    // Stop heartbeat timer
    this.stopHeartbeat(processId);

    // Remove from registry
    db.prepare('DELETE FROM process_registry WHERE process_id = ?').run(processId);
  }

  /**
   * Update heartbeat for process
   *
   * @param processId - Process ID
   * @returns True if process found and updated
   */
  heartbeat(processId: string): boolean {
    const db = this.pool.getWriter();
    const now = Date.now();

    const result = db.prepare(`
      UPDATE process_registry
      SET last_heartbeat = ?, status = 'alive'
      WHERE process_id = ?
    `).run(now, processId);

    return result.changes > 0;
  }

  /**
   * Get process information
   *
   * @param processId - Process ID
   * @returns Process info or null
   */
  getProcess(processId: string): ProcessInfo | null {
    const db = this.pool.getReader();

    const row = db.prepare(`
      SELECT process_id, pid, role, status, last_heartbeat, started_at, metadata
      FROM process_registry
      WHERE process_id = ?
    `).get(processId);

    if (!row) return null;

    return this.rowToProcessInfo(row);
  }

  /**
   * Get process by PID and role
   *
   * @param pid - Process ID
   * @param role - Process role
   * @returns Process info or null
   */
  getProcessByPid(pid: number, role: string): ProcessInfo | null {
    const db = this.pool.getReader();

    const row = db.prepare(`
      SELECT process_id, pid, role, status, last_heartbeat, started_at, metadata
      FROM process_registry
      WHERE pid = ? AND role = ?
    `).get(pid, role);

    if (!row) return null;

    return this.rowToProcessInfo(row);
  }

  /**
   * List all processes
   *
   * @param status - Optional status filter
   * @param role - Optional role filter
   * @returns Array of process info
   */
  listProcesses(status?: 'alive' | 'suspected' | 'dead', role?: string): ProcessInfo[] {
    const db = this.pool.getReader();

    let query = 'SELECT * FROM process_registry WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    query += ' ORDER BY started_at DESC';

    const rows = db.prepare(query).all(...params);
    return rows.map((row: any) => this.rowToProcessInfo(row));
  }

  /**
   * Get processes by role
   *
   * @param role - Process role
   * @returns Array of process info
   */
  getProcessesByRole(role: string): ProcessInfo[] {
    return this.listProcesses(undefined, role);
  }

  /**
   * Get alive processes
   *
   * @param role - Optional role filter
   * @returns Array of alive process info
   */
  getAliveProcesses(role?: string): ProcessInfo[] {
    return this.listProcesses('alive', role);
  }

  /**
   * Check if process is alive
   *
   * @param processId - Process ID
   * @returns True if process is alive
   */
  isAlive(processId: string): boolean {
    const process = this.getProcess(processId);
    return process?.status === 'alive';
  }

  /**
   * Mark process as suspected (missed heartbeats)
   *
   * @param processId - Process ID
   */
  markSuspected(processId: string): void {
    const db = this.pool.getWriter();

    db.prepare(`
      UPDATE process_registry
      SET status = 'suspected'
      WHERE process_id = ?
    `).run(processId);
  }

  /**
   * Mark process as dead
   *
   * @param processId - Process ID
   */
  markDead(processId: string): void {
    const db = this.pool.getWriter();

    db.prepare(`
      UPDATE process_registry
      SET status = 'dead'
      WHERE process_id = ?
    `).run(processId);

    // Stop heartbeat timer
    this.stopHeartbeat(processId);
  }

  /**
   * Update process metadata
   *
   * @param processId - Process ID
   * @param metadata - New metadata
   */
  updateMetadata(processId: string, metadata: Record<string, unknown>): void {
    const db = this.pool.getWriter();

    db.prepare(`
      UPDATE process_registry
      SET metadata = ?
      WHERE process_id = ?
    `).run(JSON.stringify(metadata), processId);
  }

  /**
   * Check health of all processes and update status
   *
   * @returns Number of processes with status changes
   */
  checkHealth(): number {
    const db = this.pool.getWriter();
    const now = Date.now();
    let changes = 0;

    const suspectedTimeout = now - this.options.heartbeatTimeout;
    const deadTimeout = now - this.options.deadTimeout;

    // Mark suspected processes
    const suspectedResult = db.prepare(`
      UPDATE process_registry
      SET status = 'suspected'
      WHERE status = 'alive' AND last_heartbeat < ?
    `).run(suspectedTimeout);

    changes += suspectedResult.changes;

    // Mark dead processes
    const deadResult = db.prepare(`
      UPDATE process_registry
      SET status = 'dead'
      WHERE status != 'dead' AND last_heartbeat < ?
    `).run(deadTimeout);

    changes += deadResult.changes;

    // Stop heartbeats for dead processes
    if (deadResult.changes > 0) {
      const deadProcesses = db.prepare(`
        SELECT process_id FROM process_registry WHERE status = 'dead'
      `).all() as any[];

      for (const row of deadProcesses) {
        this.stopHeartbeat(row.process_id);
      }
    }

    return changes;
  }

  /**
   * Cleanup dead processes
   *
   * @param olderThanMs - Remove processes dead longer than this (default: 1 hour)
   * @returns Number of processes cleaned up
   */
  cleanup(olderThanMs: number = 3600000): number {
    const db = this.pool.getWriter();
    const now = Date.now();
    const cutoff = now - olderThanMs;

    const cleanupTx = db.transaction(() => {
      // Get dead processes to clean up
      const deadProcesses = db.prepare(`
        SELECT process_id FROM process_registry
        WHERE status = 'dead' AND last_heartbeat < ?
      `).all(cutoff) as any[];

      // Delete them
      for (const row of deadProcesses) {
        this.stopHeartbeat(row.process_id);
      }

      // Remove from database
      const result = db.prepare(`
        DELETE FROM process_registry
        WHERE status = 'dead' AND last_heartbeat < ?
      `).run(cutoff);

      return result.changes;
    });

    return cleanupTx();
  }

  /**
   * Start automatic heartbeat for process
   */
  private startHeartbeat(processId: string): void {
    // Stop existing timer if any
    this.stopHeartbeat(processId);

    // Create new timer
    const timer = setInterval(() => {
      const success = this.heartbeat(processId);

      // If process not found, stop timer
      if (!success) {
        this.stopHeartbeat(processId);
      }
    }, this.options.heartbeatInterval);

    this.heartbeatTimers.set(processId, timer);
  }

  /**
   * Stop automatic heartbeat for process
   */
  private stopHeartbeat(processId: string): void {
    const timer = this.heartbeatTimers.get(processId);

    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(processId);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.checkHealth();
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Stop periodic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Convert database row to ProcessInfo
   */
  private rowToProcessInfo(row: any): ProcessInfo {
    return {
      processId: row.process_id,
      pid: row.pid,
      role: row.role,
      status: row.status,
      lastHeartbeat: row.last_heartbeat,
      startedAt: row.started_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalProcesses: number;
    aliveProcesses: number;
    suspectedProcesses: number;
    deadProcesses: number;
    processesByRole: Record<string, number>;
  } {
    const db = this.pool.getReader();

    const total = db.prepare('SELECT COUNT(*) as count FROM process_registry').get() as any;
    const alive = db.prepare("SELECT COUNT(*) as count FROM process_registry WHERE status = 'alive'").get() as any;
    const suspected = db.prepare("SELECT COUNT(*) as count FROM process_registry WHERE status = 'suspected'").get() as any;
    const dead = db.prepare("SELECT COUNT(*) as count FROM process_registry WHERE status = 'dead'").get() as any;

    const byRoleRows = db.prepare(`
      SELECT role, COUNT(*) as count FROM process_registry GROUP BY role
    `).all() as any[];

    const processesByRole: Record<string, number> = {};
    for (const row of byRoleRows) {
      processesByRole[row.role] = row.count;
    }

    return {
      totalProcesses: total.count,
      aliveProcesses: alive.count,
      suspectedProcesses: suspected.count,
      deadProcesses: dead.count,
      processesByRole
    };
  }

  /**
   * Shutdown registry
   */
  shutdown(): void {
    // Stop all heartbeat timers
    for (const [processId, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    // Stop cleanup timer
    this.stopCleanup();
  }
}
