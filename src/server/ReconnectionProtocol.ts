/**
 * WebSocket Reconnection Protocol
 *
 * Enables WebSocket clients to reconnect and receive missed messages.
 * Uses sequence numbers to track message delivery and catch up on gaps.
 *
 * Features:
 * - Client reconnection with message catch-up
 * - Batch delivery for large gaps (efficient 10k+ message recovery)
 * - Duplicate message detection
 * - Sequence number validation
 * - Connection state management
 */

import Database from 'better-sqlite3';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';
import { SequenceNumberManager, getGlobalSequenceManager } from './SequenceNumberManager.js';
import { ClientStateManager, getClientStateManager } from './ClientStateManager.js';

/**
 * Message with sequence number
 */
export interface SequencedMessage {
  id: string;
  from: string;
  channel?: string;
  type: string;
  payload: any;
  timestamp: Date;
  sequenceNumber: number;
}

/**
 * Caught up message batch
 */
export interface CaughtUpMessage {
  message: SequencedMessage;
  isDuplicate: boolean;
  gapSize: number;
}

/**
 * Reconnection request from client
 */
export interface ReconnectionRequest {
  clientId: string;
  lastSequenceNumber: number;
  subscriptions: string[];
}

/**
 * Reconnection response to client
 */
export interface ReconnectionResponse {
  success: boolean;
  clientId: string;
  currentSequenceNumber: number;
  messagesCaughtUp: number;
  duplicatesSkipped: number;
  gaps: Array<{ start: number; end: number }>;
  messages: SequencedMessage[];
}

/**
 * Catch-up options
 */
export interface CatchUpOptions {
  batchSize?: number; // Messages per batch (default: 100)
  maxMessages?: number; // Maximum messages to return (default: 10000)
  includeDuplicates?: boolean; // Include duplicate detection info (default: true)
}

/**
 * Reconnection Protocol
 *
 * Handles WebSocket reconnection with message catch-up.
 */
export class ReconnectionProtocol {
  private db: Database.Database;
  private sequenceManager: SequenceNumberManager;
  private clientManager: ClientStateManager;

  constructor(
    sequenceManager?: SequenceNumberManager,
    clientManager?: ClientStateManager
  ) {
    const pool = ConnectionPool.getInstance();
    this.db = pool.getWriter();
    this.sequenceManager = sequenceManager || getGlobalSequenceManager();
    this.clientManager = clientManager || getClientStateManager();
  }

  /**
   * Handle client reconnection
   *
   * Client sends last sequence number, server returns all messages since then.
   *
   * @param request - Reconnection request
   * @param options - Catch-up options
   * @returns Reconnection response
   */
  async reconnect(request: ReconnectionRequest, options?: CatchUpOptions): Promise<ReconnectionResponse> {
    const { clientId, lastSequenceNumber, subscriptions } = request;

    // Validate client exists
    const client = this.clientManager.getClient(clientId);
    if (!client) {
      // Register new client
      this.clientManager.registerClient(clientId);
    }

    // Update client state
    this.clientManager.updateClient(clientId, {
      isConnected: true,
      subscriptions
    });

    // Get caught-up messages
    const messages = await this.getCaughtUpMessages(
      lastSequenceNumber,
      subscriptions,
      options
    );

    // Detect duplicates
    const duplicatesSkipped = messages.filter(m => m.isDuplicate).length;
    const messagesCaughtUp = messages.length - duplicatesSkipped;

    // Detect gaps
    const gaps = this.detectGaps(lastSequenceNumber);

    return {
      success: true,
      clientId,
      currentSequenceNumber: this.sequenceManager.getCurrent(),
      messagesCaughtUp,
      duplicatesSkipped,
      gaps,
      messages: messages.map(m => m.message)
    };
  }

  /**
   * Get caught-up messages for client
   *
   * Retrieves all messages since last sequence number.
   * Handles large gaps efficiently with batch delivery.
   *
   * @param fromSequence - Starting sequence number (exclusive)
   * @param subscriptions - Client's subscriptions (filter by topic)
   * @param options - Catch-up options
   * @returns Array of caught-up messages
   */
  async getCaughtUpMessages(
    fromSequence: number,
    subscriptions: string[],
    options?: CatchUpOptions
  ): Promise<CaughtUpMessage[]> {
    const batchSize = options?.batchSize || 100;
    const maxMessages = options?.maxMessages || 10000;
    const includeDuplicates = options?.includeDuplicates !== false;

    // Build query
    let query = `
      SELECT
        id, from_agent, channel, type, payload_json, timestamp, sequence_number
      FROM messages
      WHERE sequence_number > ?
    `;

    const params: any[] = [fromSequence];

    // Filter by subscriptions if provided
    if (subscriptions && subscriptions.length > 0) {
      const topicFilters = subscriptions.map(() => 'channel = ?').join(' OR ');
      query += ` AND (${topicFilters})`;
      params.push(...subscriptions);
    }

    query += ' ORDER BY sequence_number ASC LIMIT ?';
    params.push(maxMessages);

    // Execute query
    const rows = this.db.prepare(query).all(...params) as any[];

    // Process messages
    const messages: CaughtUpMessage[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const message: SequencedMessage = {
        id: row.id,
        from: row.from_agent,
        channel: row.channel,
        type: row.type,
        payload: JSON.parse(row.payload_json),
        timestamp: new Date(row.timestamp),
        sequenceNumber: row.sequence_number
      };

      // Check for duplicates
      const isDuplicate = includeDuplicates && this.isDuplicate(fromSequence, message.sequenceNumber);

      // Calculate gap size
      const gapSize = i === 0
        ? message.sequenceNumber - fromSequence - 1
        : message.sequenceNumber - rows[i - 1].sequence_number - 1;

      messages.push({
        message,
        isDuplicate,
        gapSize
      });
    }

    return messages;
  }

  /**
   * Get caught-up messages by sequence range
   *
   * Retrieves messages in a specific sequence range (inclusive).
   *
   * @param fromSequence - Starting sequence number (inclusive)
   * @param toSequence - Ending sequence number (inclusive)
   * @param options - Catch-up options
   * @returns Array of caught-up messages
   */
  async getMessagesByRange(
    fromSequence: number,
    toSequence: number,
    options?: CatchUpOptions
  ): Promise<CaughtUpMessage[]> {
    const batchSize = options?.batchSize || 100;

    // Prevent excessive range
    if (toSequence - fromSequence > 10000) {
      throw new Error('Range too large (max 10000 messages)');
    }

    const query = `
      SELECT
        id, from_agent, channel, type, payload_json, timestamp, sequence_number
      FROM messages
      WHERE sequence_number >= ? AND sequence_number <= ?
      ORDER BY sequence_number ASC
    `;

    const rows = this.db.prepare(query).all(fromSequence, toSequence) as any[];

    return rows.map((row, i) => {
      const message: SequencedMessage = {
        id: row.id,
        from: row.from_agent,
        channel: row.channel,
        type: row.type,
        payload: JSON.parse(row.payload_json),
        timestamp: new Date(row.timestamp),
        sequenceNumber: row.sequence_number
      };

      const gapSize = i === 0 ? 0 : message.sequenceNumber - rows[i - 1].sequence_number - 1;

      return {
        message,
        isDuplicate: false,
        gapSize
      };
    });
  }

  /**
   * Get caught-up messages by batch
   *
   * Retrieves messages in batches for large gaps.
   *
   * @param fromSequence - Starting sequence number
   * @param subscriptions - Client's subscriptions
   * @param batchNumber - Batch number (0-indexed)
   * @param options - Catch-up options
   * @returns Array of caught-up messages for this batch
   */
  async getMessagesByBatch(
    fromSequence: number,
    subscriptions: string[],
    batchNumber: number,
    options?: CatchUpOptions
  ): Promise<CaughtUpMessage[]> {
    const batchSize = options?.batchSize || 100;
    const offset = batchNumber * batchSize;

    // Build query
    let query = `
      SELECT
        id, from_agent, channel, type, payload_json, timestamp, sequence_number
      FROM messages
      WHERE sequence_number > ?
    `;

    const params: any[] = [fromSequence];

    if (subscriptions && subscriptions.length > 0) {
      const topicFilters = subscriptions.map(() => 'channel = ?').join(' OR ');
      query += ` AND (${topicFilters})`;
      params.push(...subscriptions);
    }

    query += ' ORDER BY sequence_number ASC LIMIT ? OFFSET ?';
    params.push(batchSize, offset);

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((row, i) => {
      const message: SequencedMessage = {
        id: row.id,
        from: row.from_agent,
        channel: row.channel,
        type: row.type,
        payload: JSON.parse(row.payload_json),
        timestamp: new Date(row.timestamp),
        sequenceNumber: row.sequence_number
      };

      const actualSeq = row.sequence_number;
      const gapSize = i === 0
        ? actualSeq - fromSequence - 1
        : actualSeq - rows[i - 1].sequence_number - 1;

      return {
        message,
        isDuplicate: false,
        gapSize
      };
    });
  }

  /**
   * Check if message is duplicate
   *
   * @param lastSequence - Client's last sequence number
   * @param messageSequence - Message sequence number
   * @returns true if duplicate, false if new
   */
  isDuplicate(lastSequence: number, messageSequence: number): boolean {
    return messageSequence <= lastSequence;
  }

  /**
   * Detect sequence gaps
   *
   * Finds gaps in sequence numbers that client missed.
   *
   * @param fromSequence - Starting sequence number
   * @returns Array of gap ranges
   */
  detectGaps(fromSequence: number): Array<{ start: number; end: number }> {
    const currentSequence = this.sequenceManager.getCurrent();

    // Get all sequence numbers since fromSequence
    const rows = this.db.prepare(`
      SELECT sequence_number FROM messages
      WHERE sequence_number > ?
      ORDER BY sequence_number ASC
    `).all(fromSequence) as Array<{ sequence_number: number }>;

    const gaps: Array<{ start: number; end: number }> = [];

    if (rows.length === 0) {
      // No messages, gap from fromSequence to current
      if (currentSequence > fromSequence) {
        gaps.push({ start: fromSequence + 1, end: currentSequence });
      }
      return gaps;
    }

    // Check for gap before first message
    if (rows[0].sequence_number > fromSequence + 1) {
      gaps.push({
        start: fromSequence + 1,
        end: rows[0].sequence_number - 1
      });
    }

    // Check for gaps between messages
    for (let i = 1; i < rows.length; i++) {
      const prevSeq = rows[i - 1].sequence_number;
      const currSeq = rows[i].sequence_number;

      if (currSeq > prevSeq + 1) {
        gaps.push({
          start: prevSeq + 1,
          end: currSeq - 1
        });
      }
    }

    return gaps;
  }

  /**
   * Validate sequence numbers are continuous
   *
   * @param fromSequence - Starting sequence number
   * @param toSequence - Ending sequence number
   * @returns true if continuous, false if gaps found
   */
  validateSequenceContinuity(fromSequence: number, toSequence: number): boolean {
    const gaps = this.detectGaps(fromSequence);

    // Filter gaps within range
    const rangeGaps = gaps.filter(
      gap => gap.start >= fromSequence && gap.end <= toSequence
    );

    return rangeGaps.length === 0;
  }

  /**
   * Get reconnection statistics
   *
   * @param clientId - Client identifier
   * @returns Reconnection statistics
   */
  getReconnectionStats(clientId: string): {
    clientId: string;
    lastSequenceNumber: number;
    currentSequenceNumber: number;
    messagesBehind: number;
    estimatedRecoveryTime: number; // milliseconds
  } {
    const client = this.clientManager.getClient(clientId);
    const lastSeq = client?.lastSequenceNumber || 0;
    const currentSeq = this.sequenceManager.getCurrent();
    const messagesBehind = currentSeq - lastSeq;

    // Estimate recovery time (assume 1ms per message)
    const estimatedRecoveryTime = messagesBehind;

    return {
      clientId,
      lastSequenceNumber: lastSeq,
      currentSequenceNumber: currentSeq,
      messagesBehind,
      estimatedRecoveryTime
    };
  }

  /**
   * Batch assign sequence numbers to messages
   *
   * Assigns sequence numbers to messages that don't have them yet.
   * Useful for backfilling or migration.
   *
   * @param limit - Maximum messages to process (default: 1000)
   * @returns Number of messages updated
   */
  batchAssignSequenceNumbers(limit: number = 1000): number {
    const updated = this.db.transaction(() => {
      // Get messages without sequence numbers
      const rows = this.db.prepare(`
        SELECT id FROM messages
        WHERE sequence_number IS NULL
        ORDER BY timestamp ASC
        LIMIT ?
      `).all(limit) as Array<{ id: string }>;

      let count = 0;
      for (const row of rows) {
        const nextSeq = this.sequenceManager.getNext();
        this.db.prepare(`
          UPDATE messages SET sequence_number = ? WHERE id = ?
        `).run(nextSeq, row.id);
        count++;
      }

      return count;
    });

    return updated();
  }

  /**
   * Get protocol statistics
   *
   * @returns Protocol statistics
   */
  getStats(): {
    totalMessages: number;
    messagesWithSequence: number;
    messagesWithoutSequence: number;
    currentSequence: number;
    connectedClients: number;
    totalClients: number;
  } {
    const totalMessages = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages'
    ).get() as { count: number };

    const withSequence = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE sequence_number IS NOT NULL'
    ).get() as { count: number };

    const clientStats = this.clientManager.getStats();

    return {
      totalMessages: totalMessages.count,
      messagesWithSequence: withSequence.count,
      messagesWithoutSequence: totalMessages.count - withSequence.count,
      currentSequence: this.sequenceManager.getCurrent(),
      connectedClients: clientStats.connectedClients,
      totalClients: clientStats.totalClients
    };
  }
}

/**
 * Singleton instance
 */
let reconnectionProtocol: ReconnectionProtocol | undefined;

/**
 * Get global reconnection protocol instance
 *
 * @returns ReconnectionProtocol instance
 */
export function getReconnectionProtocol(): ReconnectionProtocol {
  if (!reconnectionProtocol) {
    reconnectionProtocol = new ReconnectionProtocol();
  }
  return reconnectionProtocol;
}

/**
 * Create reconnection protocol with custom managers
 *
 * @param sequenceManager - Custom sequence manager
 * @param clientManager - Custom client manager
 * @returns New ReconnectionProtocol instance
 */
export function createReconnectionProtocol(
  sequenceManager?: SequenceNumberManager,
  clientManager?: ClientStateManager
): ReconnectionProtocol {
  return new ReconnectionProtocol(sequenceManager, clientManager);
}
