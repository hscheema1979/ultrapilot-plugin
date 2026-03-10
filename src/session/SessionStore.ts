/**
 * Session Store - SQLite-based session persistence
 *
 * Manages session state with ACID transactions for multi-process safety.
 * Uses ConnectionPool for shared database access.
 */

import { randomUUID } from 'crypto';
import { Session, SessionRole, SessionStatus, SessionFilter } from './SessionTypes.js';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';

/**
 * Session Store with SQLite persistence
 */
export class SessionStore {
  private pool: ConnectionPool;

  constructor() {
    this.pool = ConnectionPool.getInstance();
    this.initializeSchema();
  }

  /**
   * Initialize database schema for sessions
   */
  private initializeSchema(): void {
    const db = this.pool.getWriter();

    db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'starting',
        current_phase INTEGER,
        active_agents TEXT,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        metadata TEXT,
        UNIQUE(role, workspace_path)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity);

      -- Locks table for multi-process coordination
      CREATE TABLE IF NOT EXISTS locks (
        resource TEXT PRIMARY KEY,
        owner_session_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        lock_type TEXT DEFAULT 'exclusive',
        FOREIGN KEY (owner_session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_locks_expires ON locks(expires_at);

      -- Heartbeats table for monitoring
      CREATE TABLE IF NOT EXISTS heartbeats (
        session_id TEXT PRIMARY KEY,
        last_heartbeat INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'alive',
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status);
    `);
  }

  /**
   * Create a new session
   *
   * @param options - Session creation options
   * @returns Session ID
   */
  createSession(options: {
    role: SessionRole;
    workspacePath: string;
    metadata?: Record<string, unknown>;
  }): string {
    const sessionId = randomUUID();
    const now = Date.now();

    const db = this.pool.getWriter();

    // Use transaction for atomicity
    const createTx = db.transaction(() => {
      // Check if session already exists for this role/workspace
      const existing = db.prepare(
        'SELECT session_id FROM sessions WHERE role = ? AND workspace_path = ?'
      ).get(options.role, options.workspacePath);

      if (existing) {
        throw new Error(`Session already exists for ${options.role} in ${options.workspacePath}`);
      }

      // Create session
      db.prepare(`
        INSERT INTO sessions (
          session_id, role, workspace_path, status, current_phase,
          active_agents, created_at, last_activity, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        options.role,
        options.workspacePath,
        'starting',
        null,
        JSON.stringify([]),
        now,
        now,
        options.metadata ? JSON.stringify(options.metadata) : null
      );

      // Create heartbeat record
      db.prepare(`
        INSERT INTO heartbeats (session_id, last_heartbeat, status)
        VALUES (?, ?, 'alive')
      `).run(sessionId, now);
    });

    createTx();

    return sessionId;
  }

  /**
   * Get session by ID
   *
   * @param sessionId - Session ID
   * @returns Session or null
   */
  getSession(sessionId: string): Session | null {
    const db = this.pool.getReader();

    const row = db.prepare(`
      SELECT
        session_id, role, workspace_path, status,
        current_phase, active_agents, created_at, last_activity, metadata
      FROM sessions
      WHERE session_id = ?
    `).get(sessionId);

    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * Update session
   *
   * @param sessionId - Session ID
   * @param updates - Partial session updates
   */
  updateSession(sessionId: string, updates: Partial<Session>): void {
    const db = this.pool.getWriter();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.current_phase !== undefined) {
      fields.push('current_phase = ?');
      values.push(updates.current_phase);
    }

    if (updates.active_agents !== undefined) {
      fields.push('active_agents = ?');
      values.push(JSON.stringify(updates.active_agents));
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    // Always update last_activity on modification
    fields.push('last_activity = ?');
    values.push(Date.now());

    values.push(sessionId);

    const updateTx = db.transaction(() => {
      const result = db.prepare(`
        UPDATE sessions
        SET ${fields.join(', ')}
        WHERE session_id = ?
      `).run(...values);

      if (result.changes === 0) {
        throw new Error(`Session not found: ${sessionId}`);
      }
    });

    updateTx();
  }

  /**
   * Update activity timestamp (heartbeat)
   *
   * @param sessionId - Session ID
   */
  updateActivity(sessionId: string): void {
    const db = this.pool.getWriter();

    db.prepare(`
      UPDATE sessions
      SET last_activity = ?
      WHERE session_id = ?
    `).run(Date.now(), sessionId);
  }

  /**
   * Delete session
   *
   * @param sessionId - Session ID
   */
  deleteSession(sessionId: string): void {
    const db = this.pool.getWriter();

    const deleteTx = db.transaction(() => {
      // Delete heartbeat
      db.prepare('DELETE FROM heartbeats WHERE session_id = ?').run(sessionId);

      // Release any locks held by this session
      db.prepare('DELETE FROM locks WHERE owner_session_id = ?').run(sessionId);

      // Delete session (CASCADE will handle foreign keys)
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    });

    deleteTx();
  }

  /**
   * List sessions with optional filter
   *
   * @param filter - Optional filter
   * @returns Array of sessions
   */
  listSessions(filter?: SessionFilter): Session[] {
    const db = this.pool.getReader();

    let query = 'SELECT * FROM sessions WHERE 1=1';
    const params: any[] = [];

    if (filter?.role) {
      query += ' AND role = ?';
      params.push(filter.role);
    }

    if (filter?.workspacePath) {
      query += ' AND workspace_path = ?';
      params.push(filter.workspacePath);
    }

    if (filter?.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }

    if (filter?.olderThan) {
      query += ' AND created_at < ?';
      params.push(filter.olderThan.getTime());
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params);
    return rows.map((row: any) => this.rowToSession(row));
  }

  /**
   * Clean up inactive sessions
   *
   * @param olderThanHours - Remove sessions inactive longer than this
   * @returns Number of sessions cleaned up
   */
  cleanupInactive(olderThanHours: number): number {
    const db = this.pool.getWriter();
    const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);

    const cleanupTx = db.transaction(() => {
      // Get sessions to clean up (for logging)
      const sessions = db.prepare(`
        SELECT session_id, role, workspace_path
        FROM sessions
        WHERE last_activity < ?
      `).all(cutoff);

      console.log(`Cleaning up ${sessions.length} inactive sessions`);

      // Delete heartbeats
      db.prepare(`
        DELETE FROM heartbeats
        WHERE session_id IN (
          SELECT session_id FROM sessions WHERE last_activity < ?
        )
      `).run(cutoff);

      // Release locks
      db.prepare(`
        DELETE FROM locks
        WHERE owner_session_id IN (
          SELECT session_id FROM sessions WHERE last_activity < ?
        )
      `).run(cutoff);

      // Delete sessions
      db.prepare('DELETE FROM sessions WHERE last_activity < ?').run(cutoff);

      return sessions.length;
    });

    return cleanupTx();
  }

  /**
   * Get session for role and workspace
   *
   * @param role - Session role
   * @param workspacePath - Workspace path
   * @returns Session or null
   */
  getSessionByRole(role: SessionRole, workspacePath: string): Session | null {
    const db = this.pool.getReader();

    const row = db.prepare(`
      SELECT * FROM sessions
      WHERE role = ? AND workspace_path = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(role, workspacePath);

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(row: any): Session {
    return {
      session_id: row.session_id,
      role: row.role,
      workspace_path: row.workspace_path,
      status: row.status,
      current_phase: row.current_phase,
      active_agents: JSON.parse(row.active_agents || '[]'),
      created_at: new Date(row.created_at),
      last_activity: new Date(row.last_activity),
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }
}
