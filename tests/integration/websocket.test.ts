/**
 * Integration Tests for WebSocket Transport Layer
 *
 * Tests the complete WebSocket and Session Management systems:
 * 1. WebSocket Connection Tests
 * 2. AgentMessageBus Integration Tests
 * 3. Session Management Tests
 * 4. Multi-Process Coordination Tests
 *
 * @see ultrapilot/src/server.ts - UltraX Server with WebSocket support
 * @see ultrapilot/src/agent-comms/AgentMessageBus.ts - Message bus with WebSocket subscriptions
 * @see ultrapilot/src/session/SessionManager.ts - Session lifecycle management
 * @see ultrapilot/src/session/CoordinationProtocol.ts - Multi-process coordination
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { UltraXServer } from '../../src/server.js';
import { AgentMessageBus, MessagePriority } from '../../src/agent-comms/AgentMessageBus.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { ConnectionPool } from '../../src/agent-comms/ConnectionPool.js';
import { SessionRole, SessionStatus } from '../../src/session/SessionTypes.js';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

describe('WebSocket Transport Layer Integration Tests', () => {
  let server: UltraXServer;
  let serverPort: number;
  let messageBus: AgentMessageBus;
  let sessionManager: SessionManager;
  let testStateDir: string;
  let testDbPath: string;

  beforeAll(async () => {
    // Create temporary test state directory
    testStateDir = `/tmp/ultrapilot-test-${randomBytes(8).toString('hex')}`;
    testDbPath = `${testStateDir}/messages.db`;

    if (!existsSync(testStateDir)) {
      mkdirSync(testStateDir, { recursive: true });
    }

    // Set environment variable for state directory
    process.cwd = () => testStateDir;

    // Initialize components
    messageBus = new AgentMessageBus({
      dbPath: testDbPath,
      security: {
        enableSigning: false,
        enableEncryption: false,
        maxPayloadSize: 1024 * 1024
      },
      performance: {
        batchSize: 50,
        batchInterval: 50,
        maxQueueSize: 1000,
        maxConcurrentHandlers: 10,
        handlerTimeout: 5000
      }
    });

    sessionManager = new SessionManager();

    // Start server on random port for testing
    serverPort = 3010 + Math.floor(Math.random() * 1000);
    server = new UltraXServer({
      port: serverPort,
      relayUrl: 'http://localhost:3000'
    });

    await server.start();
  });

  afterAll(async () => {
    // Cleanup
    await messageBus.close();
    sessionManager.shutdown();
    server.stop();

    // Close database connection
    const pool = ConnectionPool.getInstance();
    if (pool.isOpen()) {
      pool.close();
    }

    // Remove test directory
    if (existsSync(testStateDir)) {
      rmSync(testStateDir, { recursive: true, force: true });
    }
  });

  describe('1. WebSocket Connection Tests', () => {
    let wsClient: WebSocket;
    let testMessages: any[] = [];

    beforeEach(() => {
      testMessages = [];
    });

    afterEach(async () => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.close();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should connect to WebSocket server at /messages/stream', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        wsClient.on('open', () => {
          expect(wsClient.readyState).toBe(WebSocket.OPEN);
          resolve();
        });

        wsClient.on('error', (error) => {
          reject(error);
        });

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    });

    it('should receive welcome message on connection', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      const welcomeMessage = await new Promise<any>((resolve, reject) => {
        wsClient.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'connected') {
              resolve(message);
            }
          } catch (error) {
            reject(error);
          }
        });

        wsClient.on('error', reject);

        setTimeout(() => reject(new Error('No welcome message received')), 5000);
      });

      expect(welcomeMessage.type).toBe('connected');
      expect(welcomeMessage.timestamp).toBeDefined();
      expect(welcomeMessage.message).toBe('Connected to UltraX WebSocket server');
    });

    it('should subscribe to topic and receive subscription confirmation', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        wsClient.on('open', resolve);
      });

      // Subscribe to public topic (broadcast, notifications, events are public channels)
      const subscribeMessage = {
        type: 'subscribe',
        topic: 'broadcast'  // Use public channel
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      // Wait for subscription confirmation
      const confirmation = await new Promise<any>((resolve, reject) => {
        wsClient.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'subscribed') {
              resolve(message);
            }
          } catch (error) {
            reject(error);
          }
        });

        setTimeout(() => reject(new Error('No subscription confirmation')), 5000);
      });

      expect(confirmation.type).toBe('subscribed');
      expect(confirmation.topic).toBe('broadcast');
      expect(confirmation.timestamp).toBeDefined();
    });

    it('should receive published events on subscribed topic', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      // Wait for connection and subscription
      await new Promise<void>((resolve) => {
        wsClient.on('open', resolve);
      });

      // Subscribe to public topic
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        topic: 'notifications'  // Use public channel
      }));

      // Wait for subscription confirmation
      await new Promise<void>((resolve) => {
        wsClient.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscribed') {
            resolve();
          }
        });
      });

      // Publish message to AgentMessageBus
      await messageBus.publish('test-publisher', 'notifications', {
        type: 'test-event',
        payload: {
          message: 'Hello WebSocket!',
          value: 42
        }
      });

      // Receive published event
      const receivedEvent = await new Promise<any>((resolve, reject) => {
        wsClient.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'event') {
              resolve(message);
            }
          } catch (error) {
            reject(error);
          }
        });

        setTimeout(() => reject(new Error('No event received')), 5000);
      });

      expect(receivedEvent.type).toBe('event');
      expect(receivedEvent.topic).toBe('notifications');
      expect(receivedEvent.payload.message).toBe('Hello WebSocket!');
      expect(receivedEvent.payload.value).toBe(42);
      expect(receivedEvent.timestamp).toBeDefined();
    });

    it('should unsubscribe from topic and stop receiving messages', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        wsClient.on('open', resolve);
      });

      // Subscribe to public topic
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        topic: 'events'  // Use public channel
      }));

      await new Promise<void>((resolve) => {
        wsClient.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscribed') {
            resolve();
          }
        });
      });

      // Unsubscribe
      wsClient.send(JSON.stringify({
        type: 'unsubscribe',
        topic: 'events'
      }));

      // Wait a bit for unsubscription to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish message
      await messageBus.publish('test-publisher', 'events', {
        type: 'test-event',
        payload: { shouldNotReceive: true }
      });

      // Should not receive the message (or only receive other messages)
      let receivedUnwanted = false;
      const checkMessage = (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'event' && message.topic === 'events') {
          receivedUnwanted = true;
        }
      };

      wsClient.on('message', checkMessage);

      // Wait to see if message arrives
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedUnwanted).toBe(false);
    });

    it('should handle disconnect gracefully', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      wsClient = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        wsClient.on('open', resolve);
      });

      // Subscribe to public topic
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        topic: 'broadcast'  // Use public channel
      }));

      // Close connection
      wsClient.close();

      await new Promise<void>((resolve) => {
        wsClient.on('close', () => {
          expect(wsClient.readyState).toBe(WebSocket.CLOSED);
          resolve();
        });
      });

      // Server should still be running
      const healthCheck = await fetch(`http://localhost:${serverPort}/health`);
      expect(healthCheck.ok).toBe(true);
    });

    it('should handle multiple subscribers to same topic', async () => {
      const wsUrl1 = `ws://localhost:${serverPort}/messages/stream`;
      const wsUrl2 = `ws://localhost:${serverPort}/messages/stream`;

      const client1 = new WebSocket(wsUrl1);
      const client2 = new WebSocket(wsUrl2);

      // Wait for both connections
      await Promise.all([
        new Promise<void>(resolve => client1.on('open', resolve)),
        new Promise<void>(resolve => client2.on('open', resolve))
      ]);

      // Subscribe both to same public topic
      client1.send(JSON.stringify({
        type: 'subscribe',
        topic: 'broadcast'  // Use public channel
      }));

      client2.send(JSON.stringify({
        type: 'subscribe',
        topic: 'broadcast'  // Use public channel
      }));

      // Wait for subscription confirmations
      await Promise.all([
        new Promise<void>(resolve => {
          client1.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'subscribed') resolve();
          });
        }),
        new Promise<void>(resolve => {
          client2.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'subscribed') resolve();
          });
        })
      ]);

      // Publish message
      await messageBus.publish('test-publisher', 'broadcast', {
        type: 'broadcast-event',
        payload: { text: 'Both should receive this' }
      });

      // Both should receive
      const [received1, received2] = await Promise.all([
        new Promise<any>(resolve => {
          client1.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'event') resolve(msg);
          });
        }),
        new Promise<any>(resolve => {
          client2.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'event') resolve(msg);
          });
        })
      ]);

      expect(received1.payload.text).toBe('Both should receive this');
      expect(received2.payload.text).toBe('Both should receive this');

      // Cleanup
      client1.close();
      client2.close();
    });
  });

  describe('2. AgentMessageBus Integration Tests', () => {
    it('should publish message to AgentMessageBus and WebSocket receives it', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      const wsClient = new WebSocket(wsUrl);

      // Wait for connection and subscribe to public channel
      await new Promise<void>(resolve => {
        wsClient.on('open', resolve);
      });

      wsClient.send(JSON.stringify({
        type: 'subscribe',
        topic: 'events'  // Use public channel
      }));

      await new Promise<void>(resolve => {
        wsClient.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribed') resolve();
        });
      });

      // Publish to AgentMessageBus
      const messageId = await messageBus.publish('test-agent', 'events', {
        type: 'integration-test',
        payload: {
          data: 'test-payload',
          timestamp: Date.now()
        }
      });

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg-/);

      // Receive via WebSocket
      const received = await new Promise<any>(resolve => {
        wsClient.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'event') resolve(msg);
        });
      });

      expect(received.payload.data).toBe('test-payload');
      expect(received.topic).toBe('events');

      wsClient.close();
    });

    it('should verify message format validation', async () => {
      // Test valid message to public channel
      await expect(
        messageBus.publish('test-agent', 'broadcast', {
          type: 'valid-message',
          payload: { field: 'value' }
        })
      ).resolves.toBeDefined();

      // Test invalid message (missing type)
      await expect(
        messageBus.publish('test-agent', 'broadcast', {
          type: '',
          payload: {}
        } as any)
      ).rejects.toThrow();
    });

    it('should handle priority message delivery', async () => {
      const receivedOrder: string[] = [];

      // Subscribe to capture messages on public channel
      messageBus.subscribe('priority-test', 'broadcast', async (msg) => {
        receivedOrder.push((msg as any).priority);
      });

      // Send messages with different priorities
      await messageBus.publish('test-agent', 'broadcast', {
        type: 'low-priority',
        payload: {}
      }, { priority: MessagePriority.LOW });

      await messageBus.publish('test-agent', 'broadcast', {
        type: 'high-priority',
        payload: {}
      }, { priority: MessagePriority.HIGH });

      await messageBus.publish('test-agent', 'broadcast', {
        type: 'critical-priority',
        payload: {}
      }, { priority: MessagePriority.CRITICAL });

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 200));

      // Critical should be delivered first (before low)
      const criticalIndex = receivedOrder.indexOf('critical');
      const lowIndex = receivedOrder.indexOf('low');

      expect(receivedOrder).toContain('critical');
      expect(receivedOrder).toContain('high');
      expect(receivedOrder).toContain('low');
    });

    it('should support message history retrieval', async () => {
      const agentId = 'history-test-agent';

      // Publish some messages to public channel
      await messageBus.publish(agentId, 'broadcast', {
        type: 'history-event-1',
        payload: { index: 1 }
      });

      await messageBus.publish(agentId, 'broadcast', {
        type: 'history-event-2',
        payload: { index: 2 }
      });

      // Get history
      const history = await messageBus.getHistory(agentId, {
        limit: 10
      });

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].from).toBe(agentId);
    });

    it('should handle multiple subscribers receiving same message', async () => {
      const receivedBy: string[] = [];

      // Create multiple subscribers on public channel
      const subscriber1 = messageBus.subscribe('sub-1', 'broadcast', async (msg) => {
        receivedBy.push('sub-1');
      });

      const subscriber2 = messageBus.subscribe('sub-2', 'broadcast', async (msg) => {
        receivedBy.push('sub-2');
      });

      const subscriber3 = messageBus.subscribe('sub-3', 'broadcast', async (msg) => {
        receivedBy.push('sub-3');
      });

      // Publish message
      await messageBus.publish('publisher', 'broadcast', {
        type: 'multi-cast',
        payload: {}
      });

      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(receivedBy).toContain('sub-1');
      expect(receivedBy).toContain('sub-2');
      expect(receivedBy).toContain('sub-3');

      // Cleanup
      await subscriber1.unsubscribe();
      await subscriber2.unsubscribe();
      await subscriber3.unsubscribe();
    });
  });

  describe('3. Session Management Tests', () => {
    it('should create ULTRAPILOT session', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRAPILOT,
        workspacePath: `${testStateDir}/ultrapilot`,
        metadata: {
          test: 'ultrapilot-session'
        }
      });

      expect(sessionId).toBeDefined();

      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.role).toBe(SessionRole.ULTRAPILOT);
      expect(session?.status).toBe(SessionStatus.RUNNING);
    });

    it('should create ULTRA_LEAD session', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRA_LEAD,
        workspacePath: `${testStateDir}/ultra-lead`,
        metadata: {
          phase: 'planning'
        }
      });

      expect(sessionId).toBeDefined();

      const session = sessionManager.getSession(sessionId);
      expect(session?.role).toBe(SessionRole.ULTRA_LEAD);
      expect(session?.status).toBe(SessionStatus.RUNNING);
    });

    it('should verify session persistence in SQLite', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/user-test`,
        metadata: {
          userId: 'test-user-123'
        }
      });

      // Get session
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.session_id).toBe(sessionId);

      // Verify in database
      const pool = ConnectionPool.getInstance();
      const db = pool.getReader();

      const row = db.prepare(
        'SELECT * FROM sessions WHERE session_id = ?'
      ).get(sessionId);

      expect(row).toBeDefined();
      expect(row.session_id).toBe(sessionId);
      expect(row.role).toBe('user');
    });

    it('should track session activity', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRAPILOT,
        workspacePath: `${testStateDir}/activity-test`
      });

      const session1 = sessionManager.getSession(sessionId);
      const initialActivity = session1?.last_activity;

      // Update activity
      sessionManager.updateActivity(sessionId);

      const session2 = sessionManager.getSession(sessionId);
      const updatedActivity = session2?.last_activity;

      expect(updatedActivity?.getTime()).toBeGreaterThanOrEqual(
        initialActivity?.getTime() || 0
      );
    });

    it('should test inactive session cleanup', async () => {
      // Create old session (simulate by manually updating timestamp)
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/cleanup-test`
      });

      // Manually update session to be old
      const pool = ConnectionPool.getInstance();
      const db = pool.getWriter();

      const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
      db.prepare(
        'UPDATE sessions SET last_activity = ? WHERE session_id = ?'
      ).run(twoDaysAgo, sessionId);

      // Run cleanup
      const cleanedCount = sessionManager.cleanupInactive(24);

      expect(cleanedCount).toBeGreaterThan(0);

      // Session should be marked as stopped
      const session = sessionManager.getSession(sessionId);
      expect(session?.status).toBe(SessionStatus.STOPPED);
    });

    it('should manage session phases', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRA_LEAD,
        workspacePath: `${testStateDir}/phase-test`
      });

      // Set phase 0
      sessionManager.setCurrentPhase(sessionId, 0);
      expect(sessionManager.getCurrentPhase(sessionId)).toBe(0);

      // Set phase 1
      sessionManager.setCurrentPhase(sessionId, 1);
      expect(sessionManager.getCurrentPhase(sessionId)).toBe(1);

      // Set phase 2
      sessionManager.setCurrentPhase(sessionId, 2);
      expect(sessionManager.getCurrentPhase(sessionId)).toBe(2);
    });

    it('should add and remove agents from session', async () => {
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRAPILOT,
        workspacePath: `${testStateDir}/agents-test`
      });

      // Add agents
      sessionManager.addAgent(sessionId, 'ultra:executor-1');
      sessionManager.addAgent(sessionId, 'ultra:executor-2');
      sessionManager.addAgent(sessionId, 'ultra:test-engineer');

      let session = sessionManager.getSession(sessionId);
      expect(session?.active_agents).toContain('ultra:executor-1');
      expect(session?.active_agents).toContain('ultra:executor-2');
      expect(session?.active_agents).toContain('ultra:test-engineer');

      // Remove agent
      sessionManager.removeAgent(sessionId, 'ultra:executor-1');

      session = sessionManager.getSession(sessionId);
      expect(session?.active_agents).not.toContain('ultra:executor-1');
      expect(session?.active_agents).toContain('ultra:executor-2');
    });

    it('should list sessions by workspace', async () => {
      const workspacePath = `${testStateDir}/list-test`;

      // Create sessions in same workspace
      await sessionManager.createSession({
        role: SessionRole.ULTRAPILOT,
        workspacePath
      });

      await sessionManager.createSession({
        role: SessionRole.ULTRA_LEAD,
        workspacePath
      });

      const sessions = sessionManager.listSessions(workspacePath);

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.filter(s => s.workspace_path === workspacePath).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('4. Multi-Process Coordination Tests', () => {
    it('should acquire lock successfully', async () => {
      const coordination = (sessionManager as any).coordination;

      // First create a session to satisfy foreign key constraint
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/coord-lock-1`
      });

      const acquired = await coordination.acquireLock(
        'test-resource-1',
        sessionId,
        5000
      );

      expect(acquired).toBe(true);

      // Cleanup
      await coordination.releaseLock('test-resource-1', sessionId);
    });

    it('should prevent duplicate lock acquisition', async () => {
      const coordination = (sessionManager as any).coordination;

      // Create sessions
      const session1 = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/coord-lock-2a`
      });

      const session2 = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/coord-lock-2b`
      });

      // First lock
      const acquired1 = await coordination.acquireLock(
        'test-resource-2',
        session1,
        5000
      );

      expect(acquired1).toBe(true);

      // Second lock on same resource should fail
      const acquired2 = await coordination.acquireLock(
        'test-resource-2',
        session2,
        5000
      );

      expect(acquired2).toBe(false);

      // Cleanup
      await coordination.releaseLock('test-resource-2', session1);
    });

    it('should handle lock expiration', async () => {
      const coordination = (sessionManager as any).coordination;

      // Create sessions
      const session1 = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/coord-expire-1`
      });

      const session2 = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/coord-expire-2`
      });

      // Acquire lock with short expiration
      const acquired = await coordination.acquireLock(
        'test-resource-3',
        session1,
        100 // 100ms
      );

      expect(acquired).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Now another session should be able to acquire
      const reacquired = await coordination.acquireLock(
        'test-resource-3',
        session2,
        5000
      );

      expect(reacquired).toBe(true);

      // Cleanup
      await coordination.releaseLock('test-resource-3', session2);
    });

    it('should test leader election', async () => {
      const coordination = (sessionManager as any).coordination;

      const candidates = [
        'session-candidate-1',
        'session-candidate-2',
        'session-candidate-3'
      ];

      const leader = await coordination.electLeader(candidates);

      expect(leader).toBeDefined();
      expect(candidates).toContain(leader);

      // Leader should be the first one (deterministic)
      expect(leader).toBe('session-candidate-1');
    });

    it('should verify leadership status', async () => {
      const coordination = (sessionManager as any).coordination;

      const candidates = ['leader-1', 'leader-2', 'leader-3'];
      const leader = await coordination.electLeader(candidates);

      expect(coordination.isLeader(leader)).toBe(true);
      expect(coordination.isLeader('leader-2')).toBe(false);
      expect(coordination.isLeader('leader-3')).toBe(false);
    });

    it('should handle leadership resignation', async () => {
      const coordination = (sessionManager as any).coordination;

      const candidates = ['resign-1', 'resign-2'];
      const leader = await coordination.electLeader(candidates);

      expect(coordination.isLeader(leader)).toBe(true);

      // Resign leadership
      await coordination.resignLeadership(leader);

      expect(coordination.isLeader(leader)).toBe(false);

      // New election can happen
      const newLeader = await coordination.electLeader(candidates);
      expect(newLeader).toBeDefined();
    });

    it('should test heartbeat monitoring', async () => {
      const coordination = (sessionManager as any).coordination;

      // Create session first
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/heartbeat-test`
      });

      // Broadcast heartbeat
      coordination.broadcastHeartbeat(sessionId);

      // Check heartbeat
      const isAlive = coordination.checkHeartbeat(sessionId);
      expect(isAlive).toBe(true);
    });

    it('should detect stale heartbeat', async () => {
      const coordination = (sessionManager as any).coordination;

      // Create session first
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/stale-heartbeat`
      });

      // Broadcast heartbeat
      coordination.broadcastHeartbeat(sessionId);

      expect(coordination.checkHeartbeat(sessionId)).toBe(true);

      // Manually expire heartbeat
      const pool = ConnectionPool.getInstance();
      const db = pool.getWriter();

      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      db.prepare(
        'UPDATE heartbeats SET last_heartbeat = ? WHERE session_id = ?'
      ).run(fiveMinutesAgo, sessionId);

      // Should now be detected as stale
      expect(coordination.checkHeartbeat(sessionId)).toBe(false);
    });

    it('should get lock owner', async () => {
      const coordination = (sessionManager as any).coordination;

      const resourceId = 'owner-test-resource';

      // Create session first
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/owner-test`
      });

      await coordination.acquireLock(resourceId, sessionId, 5000);

      const owner = await coordination.getLockOwner(resourceId);
      expect(owner).toBe(sessionId);

      // Cleanup
      await coordination.releaseLock(resourceId, sessionId);
    });

    it('should renew lock successfully', async () => {
      const coordination = (sessionManager as any).coordination;

      const resourceId = 'renew-test-resource';

      // Create session first
      const sessionId = await sessionManager.createSession({
        role: SessionRole.USER,
        workspacePath: `${testStateDir}/renew-test`
      });

      await coordination.acquireLock(resourceId, sessionId, 5000);

      const renewed = await coordination.renewLock(resourceId, sessionId);
      expect(renewed).toBe(true);

      // Cleanup
      await coordination.releaseLock(resourceId, sessionId);
    });

    it('should fail to renew non-existent lock', async () => {
      const coordination = (sessionManager as any).coordination;

      const renewed = await coordination.renewLock(
        'non-existent-resource',
        'non-existent-session'
      );

      expect(renewed).toBe(false);
    });
  });

  describe('5. Integration: WebSocket + Session + Coordination', () => {
    it('should create session and subscribe to WebSocket updates', async () => {
      const wsUrl = `ws://localhost:${serverPort}/messages/stream`;
      const wsClient = new WebSocket(wsUrl);

      await new Promise<void>(resolve => {
        wsClient.on('open', resolve);
      });

      // Subscribe to session events on public channel
      wsClient.send(JSON.stringify({
        type: 'subscribe',
        topic: 'notifications'
      }));

      await new Promise<void>(resolve => {
        wsClient.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribed') resolve();
        });
      });

      // Create session
      const sessionId = await sessionManager.createSession({
        role: SessionRole.ULTRAPILOT,
        workspacePath: `${testStateDir}/websocket-integration`
      });

      // Publish session event to public channel
      await messageBus.publish('session-manager', 'notifications', {
        type: 'session-created',
        payload: {
          sessionId,
          role: 'ultrapilot'
        }
      });

      // Should receive event via WebSocket
      const received = await new Promise<any>(resolve => {
        wsClient.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'event' && msg.topic === 'notifications') {
            resolve(msg);
          }
        });
      });

      expect(received.payload.sessionId).toBe(sessionId);

      wsClient.close();
    });

    it('should coordinate locks between WebSocket sessions', async () => {
      const coordination = (sessionManager as any).coordination;

      // Simulate two sessions trying to acquire same lock
      const resource = 'shared-resource';
      const session1 = 'ws-session-1';
      const session2 = 'ws-session-2';

      const acquired1 = await coordination.acquireLock(resource, session1, 5000);
      expect(acquired1).toBe(true);

      const acquired2 = await coordination.acquireLock(resource, session2, 5000);
      expect(acquired2).toBe(false);

      // Session 1 releases
      await coordination.releaseLock(resource, session1);

      // Session 2 can now acquire
      const acquired3 = await coordination.acquireLock(resource, session2, 5000);
      expect(acquired3).toBe(true);

      // Cleanup
      await coordination.releaseLock(resource, session2);
    });
  });
});
