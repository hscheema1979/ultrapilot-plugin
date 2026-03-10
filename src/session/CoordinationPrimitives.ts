/**
 * Coordination Primitives
 *
 * Provides distributed synchronization primitives including
 * barriers, latches, semaphores, and events for multi-process coordination.
 */

import { randomUUID } from 'crypto';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import type {
  BarrierState,
  LatchState,
  SemaphoreState,
  EventState
} from './SessionTypes.js';

/**
 * Coordination Primitives Manager
 *
 * Implements distributed synchronization primitives for
 * coordinating work across multiple processes.
 */
export class CoordinationPrimitives {
  private pool: ConnectionPool;

  constructor() {
    this.pool = ConnectionPool.getInstance();
    this.initializeSchema();
  }

  /**
   * Type-safe row getter helper
   */
  private getRow(row: unknown): any {
    return row as any;
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    const db = this.pool.getWriter();

    db.exec(`
      -- Barriers: wait for N processes to arrive
      CREATE TABLE IF NOT EXISTS barriers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        expected INTEGER NOT NULL,
        arrived TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        released INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_barriers_expires ON barriers(expires_at);

      -- Latches: one-time synchronization points
      CREATE TABLE IF NOT EXISTS latches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        count INTEGER NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      -- Semaphores: resource counting with permits
      CREATE TABLE IF NOT EXISTS semaphores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permits INTEGER NOT NULL,
        available INTEGER NOT NULL,
        holders TEXT NOT NULL DEFAULT '[]',
        wait_queue TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_semaphores_name ON semaphores(name);

      -- Events: signal/wait coordination
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        signaled INTEGER DEFAULT 0,
        auto_reset INTEGER DEFAULT 0,
        waiting_processes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
    `);
  }

  // ==================== BARRERS ====================

  /**
   * Create a new barrier
   *
   * @param name - Barrier name
   * @param expected - Number of processes expected
   * @param expiresIn - Optional expiration time in ms
   * @returns Barrier ID
   */
  createBarrier(name: string, expected: number, expiresIn?: number): string {
    const db = this.pool.getWriter();
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO barriers (id, name, expected, arrived, created_at, expires_at, released)
      VALUES (?, ?, ?, '[]', ?, ?, 0)
    `).run(id, name, expected, now, expiresIn ? now + expiresIn : null) as any;

    return id;
  }

  /**
   * Arrive at barrier and wait for others
   *
   * @param barrierId - Barrier ID
   * @param processId - Process ID arriving
   * @returns True if barrier is released (all processes arrived)
   */
  arriveAtBarrier(barrierId: string, processId: string): boolean {
    const db = this.pool.getWriter();

    const arriveTx = db.transaction(() => {
      const row = db.prepare('SELECT arrived, expected, released FROM barriers WHERE id = ?').get(barrierId) as any;

      if (!row) {
        throw new Error(`Barrier not found: ${barrierId}`);
      }

      if (row.released) {
        return true; // Already released
      }

      const arrived = JSON.parse(row.arrived);

      // Check if already arrived
      if (arrived.includes(processId)) {
        return row.released === 1;
      }

      // Add to arrived list
      arrived.push(processId);

      // Check if all arrived
      const released = arrived.length >= row.expected;

      db.prepare(`
        UPDATE barriers
        SET arrived = ?, released = ?
        WHERE id = ?
      `).run(JSON.stringify(arrived), released ? 1 : 0, barrierId) as any;

      return released;
    });

    return arriveTx();
  }

  /**
   * Get barrier state
   */
  getBarrier(barrierId: string): BarrierState | null {
    const db = this.pool.getReader();

    const row = db.prepare('SELECT * FROM barriers WHERE id = ?').get(barrierId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      expected: row.expected,
      arrived: JSON.parse(row.arrived),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      released: row.released === 1
    };
  }

  /**
   * Wait for barrier to be released (polling)
   *
   * @param barrierId - Barrier ID
   * @param timeoutMs - Maximum time to wait
   * @returns True if barrier released within timeout
   */
  waitForBarrier(barrierId: string, timeoutMs: number = 30000): boolean {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const barrier = this.getBarrier(barrierId);

      if (!barrier) {
        throw new Error(`Barrier not found: ${barrierId}`);
      }

      if (barrier.released) {
        return true;
      }

      // Check expiration
      if (barrier.expiresAt && Date.now() > barrier.expiresAt) {
        throw new Error(`Barrier expired: ${barrierId}`);
      }

      // Sleep briefly
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }

    return false;
  }

  /**
   * Delete barrier
   */
  deleteBarrier(barrierId: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare('DELETE FROM barriers WHERE id = ?').run(barrierId) as any;
    return result.changes > 0;
  }

  // ==================== LATCHES ====================

  /**
   * Create a new countdown latch
   *
   * @param name - Latch name
   * @param count - Initial count
   * @returns Latch ID
   */
  createLatch(name: string, count: number): string {
    const db = this.pool.getWriter();
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO latches (id, name, count, completed, created_at)
      VALUES (?, ?, ?, 0, ?)
    `).run(id, name, count, now) as any;

    return id;
  }

  /**
   * Count down latch
   *
   * @param latchId - Latch ID
   * @returns True if latch reached zero
   */
  countDown(latchId: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare(`
      UPDATE latches
      SET count = count - 1,
          completed = CASE WHEN count - 1 <= 0 THEN 1 ELSE completed END
      WHERE id = ? AND count > 0
    `).run(latchId) as any;

    if (result.changes === 0) {
      // Check if already completed
      const latch = this.getLatch(latchId);
      return latch?.completed ?? false;
    }

    // Check if completed
    const latch = this.getLatch(latchId);
    return latch?.completed ?? false;
  }

  /**
   * Wait for latch to complete
   *
   * @param latchId - Latch ID
   * @param timeoutMs - Maximum time to wait
   * @returns True if latch completed within timeout
   */
  awaitLatch(latchId: string, timeoutMs: number = 30000): boolean {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const latch = this.getLatch(latchId);

      if (!latch) {
        throw new Error(`Latch not found: ${latchId}`);
      }

      if (latch.completed) {
        return true;
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }

    return false;
  }

  /**
   * Get latch state
   */
  getLatch(latchId: string): LatchState | null {
    const db = this.pool.getReader();

    const row = db.prepare('SELECT * FROM latches WHERE id = ?').get(latchId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      count: row.count,
      completed: row.completed === 1,
      createdAt: row.created_at
    };
  }

  /**
   * Delete latch
   */
  deleteLatch(latchId: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare('DELETE FROM latches WHERE id = ?').run(latchId) as any;
    return result.changes > 0;
  }

  // ==================== SEMAPHORES ====================

  /**
   * Create a new semaphore
   *
   * @param name - Semaphore name
   * @param permits - Number of permits
   * @returns Semaphore ID
   */
  createSemaphore(name: string, permits: number): string {
    const db = this.pool.getWriter();
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO semaphores (id, name, permits, available, holders, wait_queue, created_at)
      VALUES (?, ?, ?, ?, '[]', '[]', ?)
    `).run(id, name, permits, permits, now) as any;

    return id;
  }

  /**
   * Acquire permit from semaphore
   *
   * @param semaphoreId - Semaphore ID
   * @param processId - Process ID
   * @param permits - Number of permits to acquire (default: 1)
   * @param timeoutMs - Maximum time to wait
   * @returns True if acquired
   */
  acquirePermit(
    semaphoreId: string,
    processId: string,
    permits: number = 1,
    timeoutMs: number = 30000
  ): boolean {
    const startTime = Date.now();
    const db = this.pool.getWriter();

    while (Date.now() - startTime < timeoutMs) {
      const acquired = this.tryAcquire(semaphoreId, processId, permits);

      if (acquired) {
        return true;
      }

      // Add to wait queue if not already there
      this.addToWaitQueue(semaphoreId, processId, permits);

      // Wait briefly
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }

    // Remove from wait queue on timeout
    this.removeFromWaitQueue(semaphoreId, processId);

    return false;
  }

  /**
   * Try to acquire permit without waiting
   */
  private tryAcquire(semaphoreId: string, processId: string, permits: number): boolean {
    const db = this.pool.getWriter();

    const tryAcquireTx = db.transaction(() => {
      const row = db.prepare('SELECT available, holders FROM semaphores WHERE id = ?').get(semaphoreId) as any;

      if (!row) {
        throw new Error(`Semaphore not found: ${semaphoreId}`);
      }

      if (row.available < permits) {
        return false;
      }

      const holders = JSON.parse(row.holders);

      // Check if already holds permits
      const existingHolder = holders.find((h: any) => h.processId === processId);

      if (existingHolder) {
        existingHolder.permits += permits;
      } else {
        holders.push({ processId, permits });
      }

      // Update available and holders
      db.prepare(`
        UPDATE semaphores
        SET available = available - ?, holders = ?
        WHERE id = ?
      `).run(permits, JSON.stringify(holders), semaphoreId) as any;

      return true;
    });

    return tryAcquireTx();
  }

  /**
   * Release permit back to semaphore
   *
   * @param semaphoreId - Semaphore ID
   * @param processId - Process ID
   * @param permits - Number of permits to release (default: 1)
   */
  releasePermit(semaphoreId: string, processId: string, permits: number = 1): void {
    const db = this.pool.getWriter();

    const releaseTx = db.transaction(() => {
      const row = db.prepare('SELECT available, holders FROM semaphores WHERE id = ?').get(semaphoreId) as any;

      if (!row) {
        throw new Error(`Semaphore not found: ${semaphoreId}`);
      }

      const holders = JSON.parse(row.holders);
      const holderIndex = holders.findIndex((h: any) => h.processId === processId);

      if (holderIndex === -1) {
        throw new Error(`Process ${processId} does not hold any permits`);
      }

      const holder = holders[holderIndex];

      if (holder.permits < permits) {
        throw new Error(`Process ${processId} only holds ${holder.permits} permits, trying to release ${permits}`);
      }

      // Reduce or remove holder
      if (holder.permits === permits) {
        holders.splice(holderIndex, 1);
      } else {
        holder.permits -= permits;
      }

      // Update available and holders
      db.prepare(`
        UPDATE semaphores
        SET available = available + ?, holders = ?
        WHERE id = ?
      `).run(permits, JSON.stringify(holders), semaphoreId) as any;
    });

    releaseTx();
  }

  /**
   * Add process to wait queue
   */
  private addToWaitQueue(semaphoreId: string, processId: string, permits: number): void {
    const db = this.pool.getWriter();

    const row = db.prepare('SELECT wait_queue FROM semaphores WHERE id = ?').get(semaphoreId) as any;

    if (!row) return;

    const waitQueue = JSON.parse(row.wait_queue);

    // Check if already in queue
    if (!waitQueue.find((w: any) => w.processId === processId)) {
      waitQueue.push({ processId, permits, timestamp: Date.now() });

      db.prepare('UPDATE semaphores SET wait_queue = ? WHERE id = ?').run(JSON.stringify(waitQueue), semaphoreId) as any;
    }
  }

  /**
   * Remove process from wait queue
   */
  private removeFromWaitQueue(semaphoreId: string, processId: string): void {
    const db = this.pool.getWriter();

    const row = db.prepare('SELECT wait_queue FROM semaphores WHERE id = ?').get(semaphoreId) as any;

    if (!row) return;

    const waitQueue = JSON.parse(row.wait_queue);
    const filtered = waitQueue.filter((w: any) => w.processId !== processId);

    db.prepare('UPDATE semaphores SET wait_queue = ? WHERE id = ?').run(JSON.stringify(filtered), semaphoreId) as any;
  }

  /**
   * Get semaphore state
   */
  getSemaphore(semaphoreId: string): SemaphoreState | null {
    const db = this.pool.getReader();

    const row = db.prepare('SELECT * FROM semaphores WHERE id = ?').get(semaphoreId) as any;

    if (!row) return null;

    const holders = JSON.parse(row.holders);
    const waitQueue = JSON.parse(row.wait_queue);

    return {
      id: row.id,
      name: row.name,
      permits: row.permits,
      available: row.available,
      holders: holders.map((h: any) => h.processId),
      waitQueue: waitQueue.map((w: any) => ({ processId: w.processId, permits: w.permits })),
      createdAt: row.created_at
    };
  }

  /**
   * Delete semaphore
   */
  deleteSemaphore(semaphoreId: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare('DELETE FROM semaphores WHERE id = ?').run(semaphoreId) as any;
    return result.changes > 0;
  }

  // ==================== EVENTS ====================

  /**
   * Create a new event
   *
   * @param name - Event name
   * @param autoReset - Auto-reset after waiters complete
   * @returns Event ID
   */
  createEvent(name: string, autoReset: boolean = false): string {
    const db = this.pool.getWriter();
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO events (id, name, signaled, auto_reset, waiting_processes, created_at)
      VALUES (?, ?, 0, ?, '[]', ?)
    `).run(id, name, autoReset ? 1 : 0, now) as any;

    return id;
  }

  /**
   * Set event (signal all waiters)
   *
   * @param eventId - Event ID
   */
  setEvent(eventId: string): void {
    const db = this.pool.getWriter();

    db.prepare('UPDATE events SET signaled = 1 WHERE id = ?').run(eventId) as any;
  }

  /**
   * Reset event
   *
   * @param eventId - Event ID
   */
  resetEvent(eventId: string): void {
    const db = this.pool.getWriter();

    db.prepare('UPDATE events SET signaled = 0, waiting_processes = "[]" WHERE id = ?').run(eventId) as any;
  }

  /**
   * Wait for event to be signaled
   *
   * @param eventId - Event ID
   * @param processId - Process ID waiting
   * @param timeoutMs - Maximum time to wait
   * @returns True if event was signaled
   */
  waitForEvent(eventId: string, processId: string, timeoutMs: number = 30000): boolean {
    const db = this.pool.getWriter();
    const startTime = Date.now();

    // Add to waiting list
    db.prepare(`
      UPDATE events
      SET waiting_processes = json_insert(waiting_processes, '$[#]', ?)
      WHERE id = ?
    `).run(JSON.stringify(processId), eventId) as any;

    while (Date.now() - startTime < timeoutMs) {
      const event = this.getEvent(eventId);

      if (!event) {
        throw new Error(`Event not found: ${eventId}`);
      }

      if (event.signaled) {
        // Remove from waiting list
        this.removeFromWaitingList(eventId, processId);

        // Auto-reset if enabled and no more waiters
        if (event.autoReset && event.waitingProcesses.length <= 1) {
          this.resetEvent(eventId);
        }

        return true;
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }

    // Remove from waiting list on timeout
    this.removeFromWaitingList(eventId, processId);

    return false;
  }

  /**
   * Remove process from waiting list
   */
  private removeFromWaitingList(eventId: string, processId: string): void {
    const db = this.pool.getWriter();

    const row = db.prepare('SELECT waiting_processes FROM events WHERE id = ?').get(eventId) as any;

    if (!row) return;

    const waiting = JSON.parse(row.waiting_processes);
    const filtered = waiting.filter((p: string) => p !== processId);

    db.prepare('UPDATE events SET waiting_processes = ? WHERE id = ?').run(JSON.stringify(filtered), eventId) as any;
  }

  /**
   * Get event state
   */
  getEvent(eventId: string): EventState | null {
    const db = this.pool.getReader();

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      signaled: row.signaled === 1,
      autoReset: row.auto_reset === 1,
      waitingProcesses: JSON.parse(row.waiting_processes),
      createdAt: row.created_at
    };
  }

  /**
   * Delete event
   */
  deleteEvent(eventId: string): boolean {
    const db = this.pool.getWriter();

    const result = db.prepare('DELETE FROM events WHERE id = ?').run(eventId) as any;
    return result.changes > 0;
  }

  // ==================== CLEANUP ====================

  /**
   * Cleanup expired barriers
   *
   * @returns Number of barriers cleaned up
   */
  cleanupExpiredBarriers(): number {
    const db = this.pool.getWriter();
    const now = Date.now();

    const result = db.prepare('DELETE FROM barriers WHERE expires_at < ?').run(now) as any;
    return result.changes;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalBarriers: number;
    totalLatches: number;
    totalSemaphores: number;
    totalEvents: number;
  } {
    const db = this.pool.getReader();

    const barriers = db.prepare('SELECT COUNT(*) as count FROM barriers').get() as any as { count: number };
    const latches = db.prepare('SELECT COUNT(*) as count FROM latches').get() as any as { count: number };
    const semaphores = db.prepare('SELECT COUNT(*) as count FROM semaphores').get() as any as { count: number };
    const events = db.prepare('SELECT COUNT(*) as count FROM events').get() as any as { count: number };

    return {
      totalBarriers: barriers.count,
      totalLatches: latches.count,
      totalSemaphores: semaphores.count,
      totalEvents: events.count
    };
  }
}
