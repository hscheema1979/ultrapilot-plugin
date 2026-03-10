/**
 * Tests for WebSocket Reconnection Protocol
 *
 * Tests the complete reconnection protocol:
 * 1. Sequence Number Manager
 * 2. Client State Manager
 * 3. Reconnection Protocol
 * 4. Integration tests
 *
 * @see src/server/SequenceNumberManager.ts
 * @see src/server/ClientStateManager.ts
 * @see src/server/ReconnectionProtocol.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { randomBytes } from 'crypto';
import {
  SequenceNumberManager,
  getGlobalSequenceManager,
  createSequenceManager
} from '../../src/server/SequenceNumberManager.js';
import {
  ClientStateManager,
  getClientStateManager,
  createClientStateManager
} from '../../src/server/ClientStateManager.js';
import {
  ReconnectionProtocol,
  getReconnectionProtocol,
  createReconnectionProtocol,
  type ReconnectionRequest,
  type SequencedMessage
} from '../../src/server/ReconnectionProtocol.js';
import { ConnectionPool } from '../../src/agent-comms/ConnectionPool.js';

describe('WebSocket Reconnection Protocol Tests', () => {
  let testStateDir: string;
  let testDbPath: string;

 beforeAll(() => {
    // Create temporary test state directory
    testStateDir = `/tmp/ultrapilot-reconnect-test-${randomBytes(8).toString('hex')}`;
    testDbPath = `${testStateDir}/messages.db`;

    if (!existsSync(testStateDir)) {
      mkdirSync(testStateDir, { recursive: true });
    }

    // Initialize ConnectionPool with test database
    const pool = ConnectionPool.getInstance();

    // Check if messages table exists and add sequence_number column if needed
    const db = pool.getWriter();
    const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];

    const hasSequenceColumn = tableInfo.some((col: any) => col.name === 'sequence_number');

    if (!hasSequenceColumn) {
      // Add sequence_number column to existing messages table
      db.prepare('ALTER TABLE messages ADD COLUMN sequence_number INTEGER').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(sequence_number)').run();
    }

    // Create sequence_tracker table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS sequence_tracker (
        key TEXT PRIMARY KEY,
        last_value INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO sequence_tracker (key, last_value)
      VALUES ('global_sequence', 0);
    `);
  });

  afterAll(() => {
    // Cleanup
    const pool = ConnectionPool.getInstance();
    if (pool.isOpen()) {
      pool.close();
    }

    if (existsSync(testStateDir)) {
      rmSync(testStateDir, { recursive: true, force: true });
    }
  });

  describe('1. Sequence Number Manager', () => {
    let manager: SequenceNumberManager;

    beforeEach(() => {
      manager = createSequenceManager('test-sequence', 10);
    });

    afterEach(() => {
      manager.reset(0);
      // Clean up test messages
      const db = ConnectionPool.getInstance().getWriter();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-gap%'").run();
    });

    it('should allocate sequence numbers sequentially', () => {
      const seq1 = manager.getNext();
      const seq2 = manager.getNext();
      const seq3 = manager.getNext();

      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
    });

    it('should allocate sequence numbers in batches', () => {
      // Allocate first batch
      const seq1 = manager.getNext();
      expect(seq1).toBe(1);

      // Verify batch allocation (10 numbers)
      const current = manager.getCurrent();
      expect(current).toBe(10); // Batch allocated up to 10
    });

    it('should get current sequence without incrementing', () => {
      manager.getNext();
      manager.getNext();
      manager.getNext();

      const current = manager.getCurrent();
      expect(current).toBeGreaterThanOrEqual(3);
    });

    it('should reset sequence to specific value', () => {
      manager.getNext();
      manager.getNext();

      manager.reset(100);

      const next = manager.getNext();
      expect(next).toBe(101);
    });

    it('should provide sequence statistics', () => {
      manager.getNext();
      manager.getNext();
      manager.getNext();

      const stats = manager.getStats();

      expect(stats.currentSequence).toBeGreaterThanOrEqual(3);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(0);
    });

    it('should detect sequence gaps', () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Insert messages with gap
      db.prepare(`
        INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('msg-1', 'agent1', 'test', 'test', 'normal', '{}', Date.now(), 1, 'delivered');

      db.prepare(`
        INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('msg-2', 'agent1', 'test', 'test', 'normal', '{}', Date.now(), 5, 'delivered');

      const gaps = manager.detectGaps();
      expect(gaps.length).toBe(1);
      expect(gaps[0].start).toBe(2);
      expect(gaps[0].end).toBe(4);
    });

    it('should validate sequence continuity', () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Insert continuous messages
      for (let i = 1; i <= 5; i++) {
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`msg-${i}`, 'agent1', 'test', 'test', 'normal', '{}', Date.now(), i, 'delivered');
      }

      expect(manager.isContinuous()).toBe(true);
    });

    it('should get next immediate sequence bypassing cache', () => {
      manager.getNext(); // Allocates batch

      const immediate = manager.getNextImmediate();
      expect(immediate).toBeGreaterThan(0);

      // Should have updated database
      const current = manager.getCurrent();
      expect(current).toBe(immediate);
    });

    it('should set batch size', () => {
      manager.setBatchSize(5);

      const next = manager.getNext();
      expect(next).toBe(1);

      const current = manager.getCurrent();
      expect(current).toBe(5); // Batch of 5
    });

    it('should clear batch cache', () => {
      manager.getNext(); // Allocate batch

      manager.clearCache();

      // Next call should allocate new batch
      const next = manager.getNext();
      expect(next).toBeGreaterThan(0);
    });
  });

  describe('2. Client State Manager', () => {
    let manager: ClientStateManager;

    beforeEach(() => {
      manager = createClientStateManager(60000); // 1 minute stale timeout
    });

    afterEach(() => {
      // Clean up test clients
      const db = ConnectionPool.getInstance().getWriter();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'client-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'stats-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'dup-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'integration-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'multi-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'reconnect-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'client-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'stats-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'dup-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'integration-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'multi-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'reconnect-%'").run();
    });

    it('should register new client', () => {
      manager.registerClient('client-1', { userAgent: 'test' });

      const client = manager.getClient('client-1');
      expect(client).toBeDefined();
      expect(client?.clientId).toBe('client-1');
      expect(client?.isConnected).toBe(true);
      expect(client?.subscriptions).toEqual([]);
    });

    it('should update client state', () => {
      manager.registerClient('client-2');

      manager.updateClient('client-2', {
        lastSequenceNumber: 100,
        subscriptions: ['topic1', 'topic2'],
        isConnected: false
      });

      const client = manager.getClient('client-2');
      expect(client?.lastSequenceNumber).toBe(100);
      expect(client?.subscriptions).toEqual(['topic1', 'topic2']);
      expect(client?.isConnected).toBe(false);
    });

    it('should get client by ID', () => {
      manager.registerClient('client-3');

      const client = manager.getClientOrNull('client-3');
      expect(client).toBeDefined();

      const missing = manager.getClientOrNull('missing');
      expect(missing).toBeNull();
    });

    it('should get multiple clients by filter', () => {
      manager.registerClient('client-4');
      manager.registerClient('client-5');

      manager.updateClient('client-5', { isConnected: false });

      const connected = manager.getClients({ isConnected: true });
      const disconnected = manager.getClients({ isConnected: false });

      expect(connected.length).toBeGreaterThanOrEqual(1);
      expect(disconnected.length).toBeGreaterThanOrEqual(1);
    });

    it('should unregister client', () => {
      manager.registerClient('client-6');

      manager.unregisterClient('client-6');

      const client = manager.getClient('client-6');
      expect(client?.isConnected).toBe(false);
    });

    it('should delete client', () => {
      manager.registerClient('client-7');

      manager.deleteClient('client-7');

      const client = manager.getClient('client-7');
      expect(client).toBeUndefined();
    });

    it('should add and remove subscriptions', () => {
      manager.registerClient('client-8');

      manager.addSubscription('client-8', 'topic1');
      manager.addSubscription('client-8', 'topic2');

      const client = manager.getClient('client-8');
      expect(client?.subscriptions).toContain('topic1');
      expect(client?.subscriptions).toContain('topic2');

      manager.removeSubscription('client-8', 'topic1');

      const updated = manager.getClient('client-8');
      expect(updated?.subscriptions).not.toContain('topic1');
      expect(updated?.subscriptions).toContain('topic2');
    });

    it('should get client subscriptions', () => {
      manager.registerClient('client-9');
      manager.addSubscription('client-9', 'topic1');
      manager.addSubscription('client-9', 'topic2');

      const subs = manager.getSubscriptions('client-9');
      expect(subs.length).toBe(2);
      expect(subs[0].topic).toBe('topic1');
      expect(subs[1].topic).toBe('topic2');
    });

    it('should update last sequence number', () => {
      manager.registerClient('client-10');

      manager.updateLastSequence('client-10', 42);

      const lastSeq = manager.getLastSequence('client-10');
      expect(lastSeq).toBe(42);
    });

    it('should detect duplicate messages', () => {
      manager.registerClient('client-11');
      manager.updateLastSequence('client-11', 100);

      expect(manager.isDuplicate('client-11', 100)).toBe(true); // Duplicate
      expect(manager.isDuplicate('client-11', 101)).toBe(false); // New
    });

    it('should clean up stale clients', () => {
      manager.registerClient('client-12');

      // Manually set last_seen_at to past
      const db = ConnectionPool.getInstance().getWriter();
      const oldTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      db.prepare(
        'UPDATE client_state SET last_seen_at = ? WHERE client_id = ?'
      ).run(oldTime, 'client-12');

      const cleaned = manager.cleanupStaleClients();
      expect(cleaned).toBeGreaterThan(0);

      const client = manager.getClient('client-12');
      expect(client?.isConnected).toBe(false);
    });

    it('should get statistics', () => {
      manager.registerClient('client-13');
      manager.registerClient('client-14');
      manager.addSubscription('client-13', 'topic1');

      const stats = manager.getStats();

      expect(stats.totalClients).toBeGreaterThanOrEqual(2);
      expect(stats.connectedClients).toBeGreaterThanOrEqual(2);
      expect(stats.totalSubscriptions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Reconnection Protocol', () => {
    let protocol: ReconnectionProtocol;
    let sequenceManager: SequenceNumberManager;
    let clientManager: ClientStateManager;

    beforeEach(() => {
      sequenceManager = createSequenceManager('reconnect-test', 10);
      clientManager = createClientStateManager(60000);
      protocol = createReconnectionProtocol(sequenceManager, clientManager);

      // Insert test messages
      const db = ConnectionPool.getInstance().getWriter();
      for (let i = 1; i <= 20; i++) {
        const seq = sequenceManager.getNext();
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `reconnect-msg-${i}`,
          'agent1',
          i % 2 === 0 ? 'topic1' : 'topic2',
          'test',
          'normal',
          JSON.stringify({ index: i }),
          Date.now(),
          seq,
          'delivered'
        );
      }
    });

    afterEach(() => {
      // Clean up test messages and clients
      const db = ConnectionPool.getInstance().getWriter();
      db.prepare("DELETE FROM messages WHERE id LIKE 'reconnect-%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-gap%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'no-seq-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'stats-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'dup-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'reconnect-%'").run();
    });

    it('should handle client reconnection', async () => {
      const request: ReconnectionRequest = {
        clientId: 'reconnect-client-1',
        lastSequenceNumber: 5,
        subscriptions: ['topic1', 'topic2']
      };

      const response = await protocol.reconnect(request);

      expect(response.success).toBe(true);
      expect(response.clientId).toBe('reconnect-client-1');
      expect(response.messagesCaughtUp).toBeGreaterThan(0);
      expect(response.messages).toBeDefined();
    });

    it('should get caught-up messages', async () => {
      const messages = await protocol.getCaughtUpMessages(
        5,
        ['topic1'],
        { batchSize: 10, maxMessages: 100 }
      );

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].message.sequenceNumber).toBeGreaterThan(5);
    });

    it('should filter by subscriptions', async () => {
      const topic1Messages = await protocol.getCaughtUpMessages(
        0,
        ['topic1'],
        { maxMessages: 100 }
      );

      const topic2Messages = await protocol.getCaughtUpMessages(
        0,
        ['topic2'],
        { maxMessages: 100 }
      );

      // All messages should match their topic
      topic1Messages.forEach(m => {
        expect(m.message.channel).toBe('topic1');
      });

      topic2Messages.forEach(m => {
        expect(m.message.channel).toBe('topic2');
      });
    });

    it('should get messages by range', async () => {
      // Get actual sequence numbers from our test data
      const db = ConnectionPool.getInstance().getWriter();
      const sequences = db.prepare(
        "SELECT sequence_number FROM messages WHERE id LIKE 'reconnect-%' ORDER BY sequence_number ASC LIMIT 20"
      ).all() as Array<{ sequence_number: number }>;

      if (sequences.length < 10) {
        throw new Error('Not enough test messages');
      }

      // Use actual sequence range (5th to 10th message)
      const fromSeq = sequences[4].sequence_number;
      const toSeq = sequences[9].sequence_number;

      const messages = await protocol.getMessagesByRange(fromSeq, toSeq);

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].message.sequenceNumber).toBeGreaterThanOrEqual(fromSeq);
      expect(messages[messages.length - 1].message.sequenceNumber).toBeLessThanOrEqual(toSeq);
    });

    it('should get messages by batch', async () => {
      const batch0 = await protocol.getMessagesByBatch(0, ['topic1', 'topic2'], 0, { batchSize: 5 });
      const batch1 = await protocol.getMessagesByBatch(0, ['topic1', 'topic2'], 1, { batchSize: 5 });

      expect(batch0.length).toBeGreaterThan(0);
      expect(batch1.length).toBeGreaterThan(0);

      // Batches should have different messages
      const lastSeq0 = batch0[batch0.length - 1].message.sequenceNumber;
      const firstSeq1 = batch1[0].message.sequenceNumber;
      expect(firstSeq1).toBeGreaterThan(lastSeq0);
    });

    it('should detect sequence gaps', () => {
      // Insert gap manually
      const db = ConnectionPool.getInstance().getWriter();
      const nextSeq = sequenceManager.getNext();
      db.prepare(`
        INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('msg-gap', 'agent1', 'topic1', 'test', 'normal', '{}', Date.now(), nextSeq + 10, 'delivered');

      const gaps = protocol.detectGaps(0);
      expect(gaps.length).toBeGreaterThan(0);
    });

    it('should validate sequence continuity', () => {
      const continuous = protocol.validateSequenceContinuity(1, 10);
      expect(continuous).toBe(true);
    });

    it('should get reconnection statistics', () => {
      clientManager.registerClient('stats-client');
      clientManager.updateLastSequence('stats-client', 5);

      const stats = protocol.getReconnectionStats('stats-client');

      expect(stats.clientId).toBe('stats-client');
      expect(stats.lastSequenceNumber).toBe(5);
      expect(stats.messagesBehind).toBeGreaterThan(0);
      expect(stats.estimatedRecoveryTime).toBeGreaterThan(0);
    });

    it('should batch assign sequence numbers', () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Insert messages without sequence numbers
      db.prepare(`
        INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('no-seq-1', 'agent1', 'topic1', 'test', 'normal', '{}', Date.now(), 'pending');

      db.prepare(`
        INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('no-seq-2', 'agent1', 'topic1', 'test', 'normal', '{}', Date.now(), 'pending');

      const updated = protocol.batchAssignSequenceNumbers(10);
      expect(updated).toBeGreaterThan(0);
    });

    it('should get protocol statistics', () => {
      const stats = protocol.getStats();

      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.messagesWithSequence).toBeGreaterThan(0);
      expect(stats.currentSequence).toBeGreaterThan(0);
    });
  });

  describe('4. Integration Tests', () => {
    let protocol: ReconnectionProtocol;
    let sequenceManager: SequenceNumberManager;
    let clientManager: ClientStateManager;

    beforeEach(() => {
      sequenceManager = createSequenceManager('integration-test', 10);
      clientManager = createClientStateManager(60000);
      protocol = createReconnectionProtocol(sequenceManager, clientManager);
    });

    afterEach(() => {
      // Clean up test messages and clients
      const db = ConnectionPool.getInstance().getWriter();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-bulk-%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-multi-%'").run();
      db.prepare("DELETE FROM messages WHERE id LIKE 'msg-dup-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'integration-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'multi-%'").run();
      db.prepare("DELETE FROM client_state WHERE client_id LIKE 'dup-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'integration-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'multi-%'").run();
      db.prepare("DELETE FROM client_subscriptions WHERE client_id LIKE 'dup-%'").run();
    });

    it('should handle complete reconnection workflow', async () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Simulate client receiving messages
      const sequences: number[] = [];
      for (let i = 1; i <= 10; i++) {
        const seq = sequenceManager.getNext();
        sequences.push(seq);
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `msg-${i}`,
          'agent1',
          'notifications',
          'test-event',
          'normal',
          JSON.stringify({ index: i }),
          Date.now(),
          seq,
          'delivered'
        );
      }

      // Client has received up to message 5
      const clientId = 'integration-client-1';
      clientManager.registerClient(clientId);
      clientManager.updateLastSequence(clientId, sequences[4]); // 5th message

      // Client disconnects and reconnects
      const request: ReconnectionRequest = {
        clientId,
        lastSequenceNumber: sequences[4],
        subscriptions: ['notifications']
      };

      const response = await protocol.reconnect(request);

      expect(response.success).toBe(true);
      expect(response.messagesCaughtUp).toBe(5); // Messages 6-10
      expect(response.messages.length).toBe(5);
      expect(response.messages[0].sequenceNumber).toBe(sequences[5]); // 6th message
      expect(response.messages[4].sequenceNumber).toBe(sequences[9]); // 10th message
    });

    it('should handle large gap efficiently', async () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Simulate 1000 messages during disconnect
      const startSeq = sequenceManager.getCurrent();
      for (let i = 0; i < 1000; i++) {
        const seq = sequenceManager.getNext();
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `msg-bulk-${i}`,
          'agent1',
          'events',
          'bulk-event',
          'normal',
          JSON.stringify({ index: i }),
          Date.now(),
          seq,
          'delivered'
        );
      }

      const clientId = 'integration-client-2';
      const request: ReconnectionRequest = {
        clientId,
        lastSequenceNumber: startSeq,
        subscriptions: ['events']
      };

      const startTime = Date.now();
      const response = await protocol.reconnect(request, { maxMessages: 10000 });
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(response.messagesCaughtUp).toBe(1000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle multiple clients with different state', async () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Create messages and track sequences
      const sequences: number[] = [];
      for (let i = 1; i <= 50; i++) {
        const seq = sequenceManager.getNext();
        sequences.push(seq);
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `msg-multi-${i}`,
          'agent1',
          'broadcast',
          'multi-event',
          'normal',
          JSON.stringify({ index: i }),
          Date.now(),
          seq,
          'delivered'
        );
      }

      // Client 1: Received up to message 10
      const client1Request: ReconnectionRequest = {
        clientId: 'multi-client-1',
        lastSequenceNumber: sequences[9], // 10th message
        subscriptions: ['broadcast']
      };

      // Client 2: Received up to message 30
      const client2Request: ReconnectionRequest = {
        clientId: 'multi-client-2',
        lastSequenceNumber: sequences[29], // 30th message
        subscriptions: ['broadcast']
      };

      const [response1, response2] = await Promise.all([
        protocol.reconnect(client1Request),
        protocol.reconnect(client2Request)
      ]);

      expect(response1.messagesCaughtUp).toBe(40); // Messages 11-50
      expect(response2.messagesCaughtUp).toBe(20); // Messages 31-50
    });

    it('should handle duplicate detection correctly', async () => {
      const db = ConnectionPool.getInstance().getWriter();

      // Create messages and track sequences
      const sequences: number[] = [];
      for (let i = 1; i <= 10; i++) {
        const seq = sequenceManager.getNext();
        sequences.push(seq);
        db.prepare(`
          INSERT INTO messages (id, from_agent, channel, type, priority, payload_json, timestamp, sequence_number, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `msg-dup-${i}`,
          'agent1',
          'topic1',
          'test',
          'normal',
          JSON.stringify({ index: i }),
          Date.now(),
          seq,
          'delivered'
        );
      }

      // Client claims to have received up to message 8
      const request: ReconnectionRequest = {
        clientId: 'dup-client',
        lastSequenceNumber: sequences[7], // 8th message
        subscriptions: ['topic1']
      };

      const response = await protocol.reconnect(request);

      // Should only catch up messages 9-10
      expect(response.messagesCaughtUp).toBe(2);
      expect(response.messages.length).toBe(2);
      expect(response.messages[0].sequenceNumber).toBe(sequences[8]); // 9th message
      expect(response.messages[1].sequenceNumber).toBe(sequences[9]); // 10th message
    });
  });
});
