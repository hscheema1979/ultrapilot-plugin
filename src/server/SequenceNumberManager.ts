/**
 * Sequence Number Manager
 *
 * Manages atomic sequence number generation for WebSocket messages.
 * Uses SQLite's sequence_tracker table for thread-safe increments.
 *
 * Features:
 * - Atomic sequence increments (thread-safe)
 * - Sequence number persistence across restarts
 * - Batch sequence allocation for performance
 * - Sequence gap detection
 */

import Database from 'better-sqlite3';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';

/**
 * Sequence range for batch allocation
 */
export interface SequenceRange {
  start: number;
  end: number;
  current: number;
}

/**
 * Sequence statistics
 */
export interface SequenceStats {
  currentSequence: number;
  totalMessages: number;
  gapsDetected: number;
  lastResetAt?: Date;
}

/**
 * Sequence Number Manager
 *
 * Manages global sequence numbers for message ordering.
 * Ensures every message gets a unique, incrementing sequence number.
 */
export class SequenceNumberManager {
  private db: Database.Database;
  private sequenceKey: string;
  private batchCache?: SequenceRange;
  private batchSize: number;

  /**
   * Constructor
   *
   * @param sequenceKey - Key for sequence tracker (default: 'global_sequence')
   * @param batchSize - Number of sequences to allocate in batch (default: 100)
   */
  constructor(sequenceKey: string = 'global_sequence', batchSize: number = 100) {
    const pool = ConnectionPool.getInstance();
    this.db = pool.getWriter();
    this.sequenceKey = sequenceKey;
    this.batchSize = batchSize;

    // Initialize sequence if not exists
    this.initializeSequence();
  }

  /**
   * Initialize sequence in database
   */
  private initializeSequence(): void {
    const row = this.db.prepare(
      'SELECT last_value FROM sequence_tracker WHERE key = ?'
    ).get(this.sequenceKey);

    if (!row) {
      this.db.prepare(
        'INSERT INTO sequence_tracker (key, last_value) VALUES (?, 0)'
      ).run(this.sequenceKey);
    }
  }

  /**
   * Get next sequence number
   *
   * Thread-safe increment using SQLite's atomic UPDATE.
   *
   * @returns Next sequence number
   */
  getNext(): number {
    // Check if we have batch cache
    if (this.batchCache && this.batchCache.current <= this.batchCache.end) {
      const seq = this.batchCache.current++;
      return seq;
    }

    // Allocate new batch
    this.batchCache = this.allocateBatch();
    return this.batchCache.current++;
  }

  /**
   * Allocate batch of sequence numbers
   *
   * Atomically allocates a range of sequence numbers for performance.
   *
   * @returns Sequence range
   */
  private allocateBatch(): SequenceRange {
    // Use transaction for atomic read-modify-write
    const allocate = this.db.transaction(() => {
      const row = this.db.prepare(
        'SELECT last_value FROM sequence_tracker WHERE key = ?'
      ).get(this.sequenceKey) as { last_value: number } | undefined;

      const current = row?.last_value || 0;
      const next = current + this.batchSize;

      this.db.prepare(
        'UPDATE sequence_tracker SET last_value = ? WHERE key = ?'
      ).run(next, this.sequenceKey);

      return {
        start: current + 1,
        end: next,
        current: current + 1
      };
    });

    return allocate();
  }

  /**
   * Get current sequence number (without incrementing)
   *
   * @returns Current sequence number
   */
  getCurrent(): number {
    const row = this.db.prepare(
      'SELECT last_value FROM sequence_tracker WHERE key = ?'
    ).get(this.sequenceKey) as { last_value: number } | undefined;

    return row?.last_value || 0;
  }

  /**
   * Reset sequence to specific value
   *
   * WARNING: This can cause sequence number conflicts.
   * Only use for testing or database migration.
   *
   * @param value - New sequence value
   */
  reset(value: number): void {
    this.db.prepare(
      'UPDATE sequence_tracker SET last_value = ? WHERE key = ?'
    ).run(value, this.sequenceKey);

    // Clear batch cache
    this.batchCache = undefined;
  }

  /**
   * Get sequence statistics
   *
   * @returns Sequence statistics
   */
  getStats(): SequenceStats {
    const current = this.getCurrent();

    // Count messages with sequence numbers
    const messageCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE sequence_number IS NOT NULL'
    ).get() as { count: number };

    // Detect gaps (messages with missing sequence numbers)
    const gaps = this.detectGaps();

    return {
      currentSequence: current,
      totalMessages: messageCount.count,
      gapsDetected: gaps.length
    };
  }

  /**
   * Detect sequence number gaps
   *
   * Finds missing sequence numbers in the messages table.
   *
   * @returns Array of gap ranges
   */
  detectGaps(): Array<{ start: number; end: number }> {
    const gaps: Array<{ start: number; end: number }> = [];

    // Get all sequence numbers from messages
    const sequences = this.db.prepare(
      'SELECT sequence_number FROM messages WHERE sequence_number IS NOT NULL ORDER BY sequence_number'
    ).all() as Array<{ sequence_number: number }>;

    if (sequences.length === 0) {
      return gaps;
    }

    // Find gaps
    let expected = sequences[0].sequence_number;
    for (const row of sequences) {
      const actual = row.sequence_number;

      if (actual > expected) {
        gaps.push({
          start: expected,
          end: actual - 1
        });
      }

      expected = actual + 1;
    }

    return gaps;
  }

  /**
   * Validate sequence continuity
   *
   * Checks if sequence numbers are continuous (no gaps).
   *
   * @returns true if continuous, false if gaps detected
   */
  isContinuous(): boolean {
    const gaps = this.detectGaps();
    return gaps.length === 0;
  }

  /**
   * Get next sequence number without batch allocation
   *
   * Always queries database, bypassing batch cache.
   * Use when you need the absolute latest sequence number.
   *
   * @returns Next sequence number
   */
  getNextImmediate(): number {
    const next = this.db.transaction(() => {
      const row = this.db.prepare(
        'SELECT last_value FROM sequence_tracker WHERE key = ?'
      ).get(this.sequenceKey) as { last_value: number } | undefined;

      const current = row?.last_value || 0;
      const next = current + 1;

      this.db.prepare(
        'UPDATE sequence_tracker SET last_value = ? WHERE key = ?'
      ).run(next, this.sequenceKey);

      return next;
    });

    return next();
  }

  /**
   * Set batch size
   *
   * @param size - New batch size
   */
  setBatchSize(size: number): void {
    this.batchSize = size;
    this.batchCache = undefined; // Clear cache to apply new size
  }

  /**
   * Clear batch cache
   *
   * Forces next getNext() to allocate from database.
   */
  clearCache(): void {
    this.batchCache = undefined;
  }
}

/**
 * Singleton instance for global sequence
 */
let globalSequenceManager: SequenceNumberManager | undefined;

/**
 * Get global sequence manager instance
 *
 * @returns SequenceNumberManager for global_sequence
 */
export function getGlobalSequenceManager(): SequenceNumberManager {
  if (!globalSequenceManager) {
    globalSequenceManager = new SequenceNumberManager('global_sequence');
  }
  return globalSequenceManager;
}

/**
 * Create sequence manager for custom key
 *
 * @param key - Sequence tracker key
 * @param batchSize - Batch size for allocation
 * @returns New SequenceNumberManager instance
 */
export function createSequenceManager(
  key: string,
  batchSize?: number
): SequenceNumberManager {
  return new SequenceNumberManager(key, batchSize);
}
