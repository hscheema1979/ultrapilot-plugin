/**
 * Coordination Protocol - Multi-process coordination
 *
 * Implements distributed locking, leader election, and heartbeat monitoring
 * for safe multi-process session management.
 *
 * Enhanced with:
 * - Bully algorithm for leader election with priority
 * - Advanced locking patterns (read-write, reentrant)
 * - Leadership term management and transfer
 * - Lock wait queues and timeouts
 */

import { randomUUID } from 'crypto';
import { Lock, Session, LockType, LockState } from './SessionTypes.js';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';

/**
 * Leader election result
 */
export interface LeaderElectionResult {
  leaderId: string;
  term: number;
  electedAt: number;
  expiresAt: number;
  priority: number;
}

/**
 * Lock acquisition options
 */
export interface LockOptions {
  type?: LockType;
  timeout?: number;
  retryInterval?: number;
  priority?: number;
}

/**
 * Coordination Protocol Implementation
 */
export class CoordinationProtocol {
  private pool: ConnectionPool;
  private currentLeader: string | null = null;
  private leaderExpiresAt: number = 0;
  private currentTerm: number = 0;
  private reentrantLockCounts: Map<string, Map<string, number>> = new Map(); // resource -> owner -> count
  private lockWaitQueues: Map<string, Array<{ sessionId: string; priority: number; timestamp: number }>> = new Map();

  constructor() {
    this.pool = ConnectionPool.getInstance();
    this.initializeSchema();
  }

  /**
   * Initialize schema for coordination
   */
  private initializeSchema(): void {
    const db = this.pool.getWriter();

    // Try to add lock_type column if it doesn't exist
    try {
      db.exec(`ALTER TABLE locks ADD COLUMN lock_type TEXT DEFAULT 'exclusive';`);
    } catch (error: any) {
      // Column likely already exists, ignore error
    }

    // Leader election state with Bully algorithm support
    db.exec(`
      CREATE TABLE IF NOT EXISTS leader_election (
        key TEXT PRIMARY KEY,
        leader_id TEXT NOT NULL,
        term INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        elected_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        voters TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_leader_expires ON leader_election(expires_at);
      CREATE INDEX IF NOT EXISTS idx_leader_term ON leader_election(term);
    `);
  }

  /**
   * Acquire lock with advanced options
   *
   * @param resource - Resource to lock
   * @param sessionId - Session acquiring lock
   * @param options - Lock options
   * @returns True if lock acquired
   */
  async acquireLock(
    resource: string,
    sessionId: string,
    options: LockOptions | number = {}
  ): Promise<boolean> {
    // Support backward compatibility with timeoutMs as number
    const opts: LockOptions = typeof options === 'number'
      ? { timeout: options }
      : options;

    const {
      type = LockType.EXCLUSIVE,
      timeout = 30000,
      retryInterval = 100,
      priority = 0
    } = opts;

    const db = this.pool.getWriter();
    const startTime = Date.now();

    // Handle reentrant locks
    if (type === LockType.REENTRANT) {
      return this.acquireReentrantLock(resource, sessionId, timeout);
    }

    // Handle shared locks (read locks)
    if (type === LockType.SHARED) {
      return this.acquireSharedLock(resource, sessionId, timeout, retryInterval);
    }

    // Exclusive lock with wait queue
    while (Date.now() - startTime < timeout) {
      const acquired = this.tryAcquireExclusiveLock(resource, sessionId, priority);

      if (acquired) {
        return true;
      }

      // Add to wait queue
      this.addToWaitQueue(resource, sessionId, priority);

      // Wait before retry
      await this.sleep(retryInterval);
    }

    // Remove from wait queue on timeout
    this.removeFromWaitQueue(resource, sessionId);

    return false;
  }

  /**
   * Try to acquire exclusive lock (one attempt)
   */
  private tryAcquireExclusiveLock(resource: string, sessionId: string, priority: number): boolean {
    const db = this.pool.getWriter();
    const now = Date.now();

    // Clean up expired locks first
    db.prepare('DELETE FROM locks WHERE expires_at < ?').run(now) as any;

    try {
      db.prepare(`
        INSERT INTO locks (resource, owner_session_id, acquired_at, expires_at, lock_type)
        VALUES (?, ?, ?, ?, 'exclusive')
      `).run(resource, sessionId, now, now + 30000) as any;

      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Acquire shared lock (multiple readers)
   */
  private async acquireSharedLock(
    resource: string,
    sessionId: string,
    timeout: number,
    retryInterval: number
  ): Promise<boolean> {
    const db = this.pool.getWriter();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const now = Date.now();

      // Clean up expired locks
      db.prepare('DELETE FROM locks WHERE expires_at < ?').run(now) as any;

      // Check for exclusive lock on resource
      const exclusiveLock = db.prepare(`
        SELECT owner_session_id FROM locks
        WHERE resource = ? AND lock_type = 'exclusive'
      `).get(resource) as any;

      if (!exclusiveLock) {
        // No exclusive lock, try to acquire shared lock
        const existingShared = db.prepare(`
          SELECT owner_session_id FROM locks
          WHERE resource = ? AND owner_session_id = ? AND lock_type = 'shared'
        `).get(resource, sessionId) as any;

        if (existingShared) {
          // Already hold shared lock, update expiry
          db.prepare(`
            UPDATE locks SET expires_at = ?
            WHERE resource = ? AND owner_session_id = ?
          `).run(now + 30000, resource, sessionId) as any;
          return true;
        }

        // Try to insert shared lock
        try {
          db.prepare(`
            INSERT INTO locks (resource, owner_session_id, acquired_at, expires_at, lock_type)
            VALUES (?, ?, ?, ?, 'shared')
          `).run(resource, sessionId, now, now + 30000) as any;
          return true;
        } catch (error: any) {
          // Concurrent insertion, retry
        }
      }

      await this.sleep(retryInterval);
    }

    return false;
  }

  /**
   * Acquire reentrant lock (same holder can acquire multiple times)
   */
  private acquireReentrantLock(resource: string, sessionId: string, timeout: number): boolean {
    const db = this.pool.getWriter();
    const now = Date.now();

    // Initialize resource tracking
    if (!this.reentrantLockCounts.has(resource)) {
      this.reentrantLockCounts.set(resource, new Map());
    }

    const counts = this.reentrantLockCounts.get(resource);
    const currentCount = counts?.get(sessionId) || 0;

    // If already holding, increment count
    if (currentCount > 0 && counts) {
      counts.set(sessionId, currentCount + 1);
      return true;
    }

    // Try to acquire lock
    try {
      db.prepare('DELETE FROM locks WHERE expires_at < ?').run(now) as any;

      db.prepare(`
        INSERT INTO locks (resource, owner_session_id, acquired_at, expires_at, lock_type)
        VALUES (?, ?, ?, ?, 'reentrant')
      `).run(resource, sessionId, now, now + timeout) as any;

      if (counts) {
        counts.set(sessionId, 1);
      }
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Release lock with support for different lock types
   *
   * @param resource - Resource to unlock
   * @param sessionId - Session releasing lock
   */
  async releaseLock(resource: string, sessionId: string): Promise<void> {
    const db = this.pool.getWriter();

    // Check lock type
    const lock = db.prepare('SELECT lock_type FROM locks WHERE resource = ? AND owner_session_id = ?')
      .get(resource, sessionId) as any as { lock_type: string } | undefined;

    if (!lock) return;

    // Handle reentrant locks
    if (lock.lock_type === 'reentrant') {
      const counts = this.reentrantLockCounts.get(resource) as any;
      if (counts) {
        const currentCount = counts.get(sessionId) as any || 0;

        if (currentCount > 1) {
          // Decrement count but keep lock
          counts.set(sessionId, currentCount - 1);
          return;
        }

        // Remove lock completely
        counts.delete(sessionId);
        if (counts.size === 0) {
          this.reentrantLockCounts.delete(resource);
        }
      }
    }

    // Remove from database
    db.prepare(`
      DELETE FROM locks
      WHERE resource = ? AND owner_session_id = ?
    `).run(resource, sessionId) as any;

    // Remove from wait queue
    this.removeFromWaitQueue(resource, sessionId);
  }

  /**
   * Renew lock
   *
   * @param resource - Resource to renew
   * @param sessionId - Session renewing lock
   * @returns True if lock renewed
   */
  async renewLock(resource: string, sessionId: string): Promise<boolean> {
    const db = this.pool.getWriter();
    const now = Date.now();
    const expiresAt = now + 30000; // 30 second renewal

    const result = db.prepare(`
      UPDATE locks
      SET expires_at = ?
      WHERE resource = ? AND owner_session_id = ?
    `).run(expiresAt, resource, sessionId) as any;

    return result.changes > 0;
  }

  /**
   * Get lock owner
   *
   * @param resource - Resource to check
   * @returns Session ID owning lock or null
   */
  async getLockOwner(resource: string): Promise<string | null> {
    const db = this.pool.getReader();
    const now = Date.now();

    // Clean up expired locks
    db.prepare('DELETE FROM locks WHERE expires_at < ?').run(now) as any;

    const row = db.prepare('SELECT owner_session_id FROM locks WHERE resource = ?').get(resource) as any;
    return row ? row.owner_session_id : null;
  }

  /**
   * Get detailed lock state
   *
   * @param resource - Resource to check
   * @returns Lock state or null
   */
  getLockState(resource: string): LockState | null {
    const db = this.pool.getReader();
    const now = Date.now();

    const rows = db.prepare('SELECT * FROM locks WHERE resource = ?').all(resource) as any[];

    if (rows.length === 0) return null;

    const first = rows[0];
    const waitQueue = this.lockWaitQueues.get(resource) as any || [];

    return {
      resource,
      type: first.lock_type as LockType,
      owner: first.owner_session_id,
      acquireCount: this.reentrantLockCounts.get(resource)?.get(first.owner_session_id) || 1,
      holders: rows.map((r: any) => r.owner_session_id),
      waitQueue: waitQueue.map((w: any) => w.sessionId),
      acquiredAt: first.acquired_at,
      expiresAt: first.expires_at
    };
  }

  /**
   * Add to wait queue
   */
  private addToWaitQueue(resource: string, sessionId: string, priority: number): void {
    if (!this.lockWaitQueues.has(resource)) {
      this.lockWaitQueues.set(resource, []);
    }

    const queue = this.lockWaitQueues.get(resource);

    if (!queue) return;

    // Check if already in queue
    if (!queue.find((w: any) => w.sessionId === sessionId)) {
      queue.push({ sessionId, priority, timestamp: Date.now() });

      // Sort by priority (higher first), then timestamp
      queue.sort((a: any, b: any) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });
    }
  }

  /**
   * Remove from wait queue
   */
  private removeFromWaitQueue(resource: string, sessionId: string): void {
    const queue = this.lockWaitQueues.get(resource);

    if (queue) {
      const filtered = queue.filter((w: any) => w.sessionId !== sessionId);

      if (filtered.length === 0) {
        this.lockWaitQueues.delete(resource);
      } else {
        this.lockWaitQueues.set(resource, filtered);
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Elect leader using Bully algorithm with priority
   *
   * @param candidates - Array of candidate session IDs
   * @param priorities - Map of session ID to priority (higher is better)
   * @param termDuration - Leadership term duration in ms
   * @param retrying - Internal flag to prevent infinite recursion
   * @returns Election result
   */
  async electLeader(
    candidates: string[],
    priorities: Map<string, number> = new Map(),
    termDuration: number = 60000,
    retrying: boolean = false
  ): Promise<LeaderElectionResult> {
    const db = this.pool.getWriter();
    const now = Date.now();
    const expiresAt = now + termDuration;

    // Only increment term on initial call, not retries
    if (!retrying) {
      this.currentTerm++;
    }

    // Sort by priority (highest first), then by session ID for determinism
    const sortedCandidates = [...candidates].sort((a, b) => {
      const priorityA = priorities.get(a) as any || 0;
      const priorityB = priorities.get(b) as any || 0;

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      return a.localeCompare(b); // Deterministic fallback
    });

    const leaderId = sortedCandidates[0];
    const priority = priorities.get(leaderId) as any || 0;

    try {
      // Try to insert new leader
      db.prepare(`
        INSERT INTO leader_election (key, leader_id, term, priority, elected_at, expires_at, voters)
        VALUES ('leader', ?, ?, ?, ?, ?, ?)
      `).run('leader', leaderId, this.currentTerm, priority, now, expiresAt, JSON.stringify(candidates)) as any;

      this.currentLeader = leaderId;
      this.leaderExpiresAt = expiresAt;

      return {
        leaderId,
        term: this.currentTerm,
        electedAt: now,
        expiresAt,
        priority
      };
    } catch (error: any) {
      // Leadership already held, check if expired
      const current = db.prepare(`
        SELECT leader_id, term, expires_at FROM leader_election
        WHERE key = 'leader'
      `).get() as any as { leader_id: string; term: number; expires_at: number } | undefined;

      if (current && current.expires_at > now) {
        // Current leadership still valid
        this.currentLeader = current.leader_id;
        this.currentTerm = current.term;
        this.leaderExpiresAt = current.expires_at;

        return {
          leaderId: current.leader_id,
          term: current.term,
          electedAt: now,
          expiresAt: current.expires_at,
          priority: priorities.get(current.leader_id) as any || 0
        };
      }

      // Expired leadership, force reelection (only once to prevent infinite loop)
      if (!retrying) {
        db.prepare("DELETE FROM leader_election WHERE key = 'leader'").run() as any;
        return this.electLeader(candidates, priorities, termDuration, true);
      }

      // If we're already retrying and still failing, return current state
      return {
        leaderId: this.currentLeader || leaderId,
        term: this.currentTerm,
        electedAt: now,
        expiresAt: now + termDuration,
        priority
      };
    }
  }

  /**
   * Challenge current leadership (Bully algorithm)
   *
   * If challenger has higher priority than current leader,
   * leadership is transferred.
   *
   * @param challengerId - Challenging session ID
   * @param challengerPriority - Challenger's priority
   * @returns True if challenger became leader
   */
  async challengeLeadership(challengerId: string, challengerPriority: number): Promise<boolean> {
    const db = this.pool.getWriter();
    const now = Date.now();

    const current = db.prepare(`
      SELECT leader_id, priority, expires_at FROM leader_election
      WHERE key = 'leader'
    `).get() as any as { leader_id: string; priority: number; expires_at: number } | undefined;

    if (!current || current.expires_at < now) {
      // No leader or expired, challenger can become leader
      return this.becomeLeader(challengerId, challengerPriority);
    }

    // Check if challenger has higher priority
    if (challengerPriority > current.priority) {
      // Transfer leadership to higher priority process
      return this.transferLeadership(current.leader_id, challengerId);
    }

    return false;
  }

  /**
   * Become leader (internal)
   */
  private becomeLeader(sessionId: string, priority: number): boolean {
    const db = this.pool.getWriter();
    const now = Date.now();
    const expiresAt = now + 60000;

    this.currentTerm++;

    try {
      db.prepare(`
        INSERT INTO leader_election (key, leader_id, term, priority, elected_at, expires_at, voters)
        VALUES ('leader', ?, ?, ?, ?, ?, ?)
      `).run('leader', sessionId, this.currentTerm, priority, now, expiresAt, JSON.stringify([sessionId])) as any;

      this.currentLeader = sessionId;
      this.leaderExpiresAt = expiresAt;

      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Check if session is leader
   *
   * @param sessionId - Session ID to check
   * @returns True if session is leader
   */
  isLeader(sessionId: string): boolean {
    return this.currentLeader === sessionId && Date.now() < this.leaderExpiresAt;
  }

  /**
   * Get current leader
   *
   * @returns Current leader ID or null
   */
  getCurrentLeader(): string | null {
    // Check if leadership expired
    if (this.currentLeader && Date.now() >= this.leaderExpiresAt) {
      this.currentLeader = null;
      return null;
    }

    return this.currentLeader;
  }

  /**
   * Transfer leadership to another session
   *
   * @param fromSession - Current leader session ID
   * @param toSession - New leader session ID
   * @returns True if transfer successful
   */
  async transferLeadership(fromSession: string, toSession: string): Promise<boolean> {
    const db = this.pool.getWriter();
    const now = Date.now();
    const expiresAt = now + 60000;

    // Verify current leader
    if (this.currentLeader !== fromSession) {
      return false;
    }

    this.currentTerm++;

    const result = db.prepare(`
      UPDATE leader_election
      SET leader_id = ?,
          term = ?,
          elected_at = ?,
          expires_at = ?,
          voters = json_insert(voters, '$[#]', ?)
      WHERE key = 'leader' AND leader_id = ?
    `).run(toSession, this.currentTerm, now, expiresAt, JSON.stringify(toSession), fromSession) as any;

    if (result.changes > 0) {
      this.currentLeader = toSession;
      this.leaderExpiresAt = expiresAt;
      return true;
    }

    return false;
  }

  /**
   * Resign leadership
   *
   * @param sessionId - Session resigning
   */
  async resignLeadership(sessionId: string): Promise<void> {
    const db = this.pool.getWriter();

    db.prepare(`
      DELETE FROM leader_election
      WHERE key = 'leader' AND leader_id = ?
    `).run(sessionId) as any;

    if (this.currentLeader === sessionId) {
      this.currentLeader = null;
      this.leaderExpiresAt = 0;
    }
  }

  /**
   * Renew leadership term
   *
   * @param sessionId - Leader session ID
   * @param termDuration - New term duration in ms
   * @returns True if renewal successful
   */
  async renewLeadership(sessionId: string, termDuration: number = 60000): Promise<boolean> {
    const db = this.pool.getWriter();
    const now = Date.now();
    const expiresAt = now + termDuration;

    const result = db.prepare(`
      UPDATE leader_election
      SET expires_at = ?
      WHERE key = 'leader' AND leader_id = ?
    `).run(expiresAt, sessionId) as any;

    if (result.changes > 0) {
      this.leaderExpiresAt = expiresAt;
      return true;
    }

    return false;
  }

  /**
   * Broadcast heartbeat
   *
   * @param sessionId - Session sending heartbeat
   */
  broadcastHeartbeat(sessionId: string): void {
    const db = this.pool.getWriter();
    const now = Date.now();

    db.prepare(`
      INSERT INTO heartbeats (session_id, last_heartbeat, status)
      VALUES (?, ?, 'alive')
      ON CONFLICT(session_id) DO UPDATE SET
        last_heartbeat = ?,
        status = 'alive'
    `).run(sessionId, now) as any;
  }

  /**
   * Check heartbeat status
   *
   * @param sessionId - Session to check
   * @returns True if heartbeat recent (within 2 minutes)
   */
  checkHeartbeat(sessionId: string): boolean {
    const db = this.pool.getReader();
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);

    const row = db.prepare(`
      SELECT last_heartbeat FROM heartbeats
      WHERE session_id = ? AND last_heartbeat > ?
    `).get(sessionId, twoMinutesAgo) as any;

    return !!row;
  }
}
