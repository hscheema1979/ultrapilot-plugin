/**
 * Client State Manager
 *
 * Tracks WebSocket client state for reconnection protocol.
 * Manages client subscriptions, last sequence numbers, and connection state.
 *
 * Features:
 * - Track client subscriptions per topic
 * - Track last sequence number per client
 * - Duplicate message detection
 * - Expiration of stale client state
 * - Connection state management
 */

import Database from 'better-sqlite3';
import { ConnectionPool } from '../agent-comms/ConnectionPool.js';

/**
 * Client state
 */
export interface ClientState {
  clientId: string;
  connectedAt: Date;
  lastSeenAt: Date;
  lastSequenceNumber: number;
  subscriptions: string[];
  isConnected: boolean;
  metadata?: Record<string, any>;
}

/**
 * Client subscription info
 */
export interface ClientSubscription {
  clientId: string;
  topic: string;
  subscribedAt: Date;
  lastSequenceNumber: number;
}

/**
 * Client state update options
 */
export interface ClientStateUpdate {
  lastSequenceNumber?: number;
  subscriptions?: string[];
  isConnected?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Client filter for queries
 */
export interface ClientFilter {
  isConnected?: boolean;
  topic?: string;
  staleBefore?: Date;
  limit?: number;
}

/**
 * Client State Manager
 *
 * Manages WebSocket client state for reconnection protocol.
 */
export class ClientStateManager {
  private db: Database.Database;
  private staleTimeout: number; // milliseconds

  /**
   * Constructor
   *
   * @param staleTimeout - Time before client state is considered stale (default: 1 hour)
   */
  constructor(staleTimeout: number = 60 * 60 * 1000) {
    const pool = ConnectionPool.getInstance();
    this.db = pool.getWriter();
    this.staleTimeout = staleTimeout;

    // Initialize schema
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS client_state (
        client_id TEXT PRIMARY KEY,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        last_sequence_number INTEGER NOT NULL DEFAULT 0,
        subscriptions TEXT NOT NULL DEFAULT '[]',
        is_connected INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        UNIQUE(client_id)
      );

      CREATE INDEX IF NOT EXISTS idx_client_state_connected ON client_state(is_connected);
      CREATE INDEX IF NOT EXISTS idx_client_state_last_seen ON client_state(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_client_state_topic ON client_state(subscriptions);

      CREATE TABLE IF NOT EXISTS client_subscriptions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        subscribed_at INTEGER NOT NULL,
        last_sequence_number INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (client_id) REFERENCES client_state(client_id) ON DELETE CASCADE,
        UNIQUE(client_id, topic)
      );

      CREATE INDEX IF NOT EXISTS idx_client_subscriptions_topic ON client_subscriptions(topic);
      CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client ON client_subscriptions(client_id);
    `);
  }

  /**
   * Register new client connection
   *
   * @param clientId - Unique client identifier
   * @param metadata - Optional metadata
   */
  registerClient(clientId: string, metadata?: Record<string, any>): void {
    const now = Date.now();

    this.db.prepare(`
      INSERT OR REPLACE INTO client_state
      (client_id, connected_at, last_seen_at, last_sequence_number, subscriptions, is_connected, metadata)
      VALUES (?, ?, ?, 0, '[]', 1, ?)
    `).run(
      clientId,
      now,
      now,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  /**
   * Update client state
   *
   * @param clientId - Client identifier
   * @param updates - State updates
   */
  updateClient(clientId: string, updates: ClientStateUpdate): void {
    const current = this.getClient(clientId);
    if (!current) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const now = Date.now();
    const updatesParts: string[] = [];
    const values: any[] = [];

    // Build update query dynamically
    if (updates.lastSequenceNumber !== undefined) {
      updatesParts.push('last_sequence_number = ?');
      values.push(updates.lastSequenceNumber);
    }

    if (updates.subscriptions !== undefined) {
      updatesParts.push('subscriptions = ?');
      values.push(JSON.stringify(updates.subscriptions));
    }

    if (updates.isConnected !== undefined) {
      updatesParts.push('is_connected = ?');
      values.push(updates.isConnected ? 1 : 0);
    }

    if (updates.metadata !== undefined) {
      updatesParts.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    // Always update last_seen_at
    updatesParts.push('last_seen_at = ?');
    values.push(now);

    // Add clientId to values
    values.push(clientId);

    // Execute update
    if (updatesParts.length > 0) {
      this.db.prepare(`
        UPDATE client_state
        SET ${updatesParts.join(', ')}
        WHERE client_id = ?
      `).run(...values);
    }
  }

  /**
   * Get client state
   *
   * @param clientId - Client identifier
   * @returns Client state or undefined
   */
  getClient(clientId: string): ClientState | undefined {
    const row = this.db.prepare(
      'SELECT * FROM client_state WHERE client_id = ?'
    ).get(clientId) as any;

    if (!row) {
      return undefined;
    }

    return this.rowToClientState(row);
  }

  /**
   * Get client by ID
   *
   * @param clientId - Client identifier
   * @returns Client state or null
   */
  getClientOrNull(clientId: string): ClientState | null {
    const client = this.getClient(clientId);
    return client || null;
  }

  /**
   * Get multiple clients by filter
   *
   * @param filter - Filter criteria
   * @returns Array of client states
   */
  getClients(filter?: ClientFilter): ClientState[] {
    let query = 'SELECT * FROM client_state WHERE 1=1';
    const params: any[] = [];

    if (filter?.isConnected !== undefined) {
      query += ' AND is_connected = ?';
      params.push(filter.isConnected ? 1 : 0);
    }

    if (filter?.topic) {
      query += " AND subscriptions LIKE ?";
      params.push(`%${filter.topic}%`);
    }

    if (filter?.staleBefore) {
      query += ' AND last_seen_at < ?';
      params.push(filter.staleBefore.getTime());
    }

    if (filter?.limit) {
      query += ` LIMIT ${filter.limit}`;
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToClientState(row));
  }

  /**
   * Unregister client (disconnect)
   *
   * @param clientId - Client identifier
   */
  unregisterClient(clientId: string): void {
    this.db.prepare(
      'UPDATE client_state SET is_connected = 0 WHERE client_id = ?'
    ).run(clientId);

    // Clean up subscriptions
    this.db.prepare(
      'DELETE FROM client_subscriptions WHERE client_id = ?'
    ).run(clientId);
  }

  /**
   * Delete client state
   *
   * @param clientId - Client identifier
   */
  deleteClient(clientId: string): void {
    this.db.prepare(
      'DELETE FROM client_state WHERE client_id = ?'
    ).run(clientId);

    this.db.prepare(
      'DELETE FROM client_subscriptions WHERE client_id = ?'
    ).run(clientId);
  }

  /**
   * Add topic subscription for client
   *
   * @param clientId - Client identifier
   * @param topic - Topic to subscribe to
   */
  addSubscription(clientId: string, topic: string): void {
    const now = Date.now();
    const subId = `${clientId}-${topic}-${now}`;

    // Add to subscriptions table
    this.db.prepare(`
      INSERT OR REPLACE INTO client_subscriptions
      (id, client_id, topic, subscribed_at, last_sequence_number)
      VALUES (?, ?, ?, ?, 0)
    `).run(subId, clientId, topic, now);

    // Update client state subscriptions array
    const client = this.getClient(clientId);
    if (client) {
      const subscriptions = client.subscriptions.includes(topic)
        ? client.subscriptions
        : [...client.subscriptions, topic];

      this.updateClient(clientId, { subscriptions });
    }
  }

  /**
   * Remove topic subscription for client
   *
   * @param clientId - Client identifier
   * @param topic - Topic to unsubscribe from
   */
  removeSubscription(clientId: string, topic: string): void {
    // Remove from subscriptions table
    this.db.prepare(
      'DELETE FROM client_subscriptions WHERE client_id = ? AND topic = ?'
    ).run(clientId, topic);

    // Update client state subscriptions array
    const client = this.getClient(clientId);
    if (client) {
      const subscriptions = client.subscriptions.filter(t => t !== topic);
      this.updateClient(clientId, { subscriptions });
    }
  }

  /**
   * Get client subscriptions
   *
   * @param clientId - Client identifier
   * @returns Array of subscription info
   */
  getSubscriptions(clientId: string): ClientSubscription[] {
    const rows = this.db.prepare(
      'SELECT * FROM client_subscriptions WHERE client_id = ?'
    ).all(clientId) as any[];

    return rows.map(row => ({
      clientId: row.client_id,
      topic: row.topic,
      subscribedAt: new Date(row.subscribed_at),
      lastSequenceNumber: row.last_sequence_number
    }));
  }

  /**
   * Update last sequence number for client
   *
   * @param clientId - Client identifier
   * @param sequenceNumber - Last received sequence number
   */
  updateLastSequence(clientId: string, sequenceNumber: number): void {
    this.db.prepare(`
      UPDATE client_state
      SET last_sequence_number = ?, last_seen_at = ?
      WHERE client_id = ?
    `).run(sequenceNumber, Date.now(), clientId);
  }

  /**
   * Get last sequence number for client
   *
   * @param clientId - Client identifier
   * @returns Last sequence number or 0
   */
  getLastSequence(clientId: string): number {
    const row = this.db.prepare(
      'SELECT last_sequence_number FROM client_state WHERE client_id = ?'
    ).get(clientId) as { last_sequence_number: number } | undefined;

    return row?.last_sequence_number || 0;
  }

  /**
   * Check if message is duplicate
   *
   * @param clientId - Client identifier
   * @param sequenceNumber - Message sequence number
   * @returns true if duplicate, false if new
   */
  isDuplicate(clientId: string, sequenceNumber: number): boolean {
    const lastSeq = this.getLastSequence(clientId);
    return sequenceNumber <= lastSeq;
  }

  /**
   * Clean up stale client state
   *
   * Removes or marks as disconnected clients that haven't been seen recently.
   *
   * @returns Number of clients cleaned up
   */
  cleanupStaleClients(): number {
    const staleTime = Date.now() - this.staleTimeout;

    // Mark stale clients as disconnected
    const result = this.db.prepare(`
      UPDATE client_state
      SET is_connected = 0
      WHERE is_connected = 1 AND last_seen_at < ?
    `).run(staleTime);

    return result.changes;
  }

  /**
   * Get stale clients
   *
   * @returns Array of stale client states
   */
  getStaleClients(): ClientState[] {
    const staleTime = Date.now() - this.staleTimeout;

    const rows = this.db.prepare(`
      SELECT * FROM client_state
      WHERE last_seen_at < ?
    `).all(staleTime) as any[];

    return rows.map(row => this.rowToClientState(row));
  }

  /**
   * Get statistics
   *
   * @returns Client state statistics
   */
  getStats(): {
    totalClients: number;
    connectedClients: number;
    disconnectedClients: number;
    staleClients: number;
    totalSubscriptions: number;
  } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM client_state'
    ).get() as { count: number };

    const connected = this.db.prepare(
      "SELECT COUNT(*) as count FROM client_state WHERE is_connected = 1"
    ).get() as { count: number };

    const stale = this.db.prepare(
      'SELECT COUNT(*) as count FROM client_state WHERE last_seen_at < ?'
    ).get(Date.now() - this.staleTimeout) as { count: number };

    const subscriptions = this.db.prepare(
      'SELECT COUNT(*) as count FROM client_subscriptions'
    ).get() as { count: number };

    return {
      totalClients: total.count,
      connectedClients: connected.count,
      disconnectedClients: total.count - connected.count,
      staleClients: stale.count,
      totalSubscriptions: subscriptions.count
    };
  }

  /**
   * Convert database row to ClientState
   */
  private rowToClientState(row: any): ClientState {
    return {
      clientId: row.client_id,
      connectedAt: new Date(row.connected_at),
      lastSeenAt: new Date(row.last_seen_at),
      lastSequenceNumber: row.last_sequence_number,
      subscriptions: JSON.parse(row.subscriptions || '[]'),
      isConnected: row.is_connected === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * Set stale timeout
   *
   * @param timeout - New timeout in milliseconds
   */
  setStaleTimeout(timeout: number): void {
    this.staleTimeout = timeout;
  }
}

/**
 * Singleton instance
 */
let clientStateManager: ClientStateManager | undefined;

/**
 * Get global client state manager instance
 *
 * @returns ClientStateManager instance
 */
export function getClientStateManager(): ClientStateManager {
  if (!clientStateManager) {
    clientStateManager = new ClientStateManager();
  }
  return clientStateManager;
}

/**
 * Create client state manager with custom timeout
 *
 * @param staleTimeout - Stale timeout in milliseconds
 * @returns New ClientStateManager instance
 */
export function createClientStateManager(staleTimeout?: number): ClientStateManager {
  return new ClientStateManager(staleTimeout);
}
