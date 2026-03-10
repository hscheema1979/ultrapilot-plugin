/**
 * AutoloopEventPublisher Integration Test
 *
 * Tests the integration between AutoloopDaemon and AgentMessageBus
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AutoloopEventPublisher, createAutoloopEventPublisher } from '../../src/domain/AutoloopEventPublisher.js';
import { AgentMessageBus } from '../../src/agent-comms/AgentMessageBus.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { MessagePriority } from '../../src/agent-comms/AgentMessageBus.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('AutoloopEventPublisher', () => {
  let tempDir: string;
  let workspacePath: string;
  let messageBus: AgentMessageBus;
  let sessionManager: SessionManager;
  let publisher: AutoloopEventPublisher;

  beforeEach(async () => {
    // Create temporary workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoloop-test-'));
    workspacePath = tempDir;

    // Create .ultra directory structure
    await fs.mkdir(path.join(workspacePath, '.ultra', 'state'), { recursive: true });

    // Initialize message bus
    const dbPath = path.join(workspacePath, '.ultra', 'state', 'messages.db');
    messageBus = new AgentMessageBus({ dbPath });

    // Initialize session manager
    sessionManager = new SessionManager();

    // Create event publisher
    publisher = createAutoloopEventPublisher({
      workspacePath,
      messageBus,
      sessionManager,
      enabled: true
    });
  });

  afterEach(async () => {
    // Cleanup
    await publisher.shutdown();
    await messageBus.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    it('should create AUTOLOOP session on initialize', async () => {
      await publisher.initialize();

      const sessionId = publisher.getSessionId();
      expect(sessionId).not.toBeNull();
      expect(sessionId?.length).toBeGreaterThan(0);

      // Verify session exists in session manager
      const session = sessionManager.getSession(sessionId!);
      expect(session).not.toBeNull();
      expect(session?.role).toBe('autoloop');
    });

    it('should be enabled by default', () => {
      expect(publisher.isEnabled()).toBe(true);
    });

    it('should be disabled if configured', async () => {
      const disabledPublisher = createAutoloopEventPublisher({
        workspacePath,
        messageBus,
        sessionManager,
        enabled: false
      });

      await disabledPublisher.initialize();
      expect(disabledPublisher.isEnabled()).toBe(false);
      expect(disabledPublisher.getSessionId()).toBeNull();
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      await publisher.initialize();
    });

    it('should publish heartbeat events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop', messageSpy);

      await publisher.publishHeartbeat(1, {
        uptime: 60000,
        cyclesCompleted: 1,
        tasksProcessed: 5,
        routinesExecuted: 3,
        errors: 0
      });

      // Give some time for message to be delivered
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      expect(publisher.getEventCount()).toBe(1);

      subscription.unsubscribe();
    });

    it('should publish task queued events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop.tasks', messageSpy);

      await publisher.publishTaskQueued('task-123', 'Fix bug', 'bug');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.task.queued');
      expect(call.payload.payload.taskId).toBe('task-123');

      subscription.unsubscribe();
    });

    it('should publish task completed events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop.tasks', messageSpy);

      await publisher.publishTaskCompleted(
        'task-123',
        'Fix bug',
        { success: true, output: 'Bug fixed' },
        5000
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.task.completed');
      expect(call.payload.payload.taskId).toBe('task-123');
      expect(call.payload.payload.duration).toBe(5000);

      subscription.unsubscribe();
    });

    it('should publish task failed events with high priority', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop.tasks', messageSpy);

      await publisher.publishTaskFailed(
        'task-123',
        'Fix bug',
        'Syntax error',
        3000
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.task.failed');
      expect(call.payload.payload.error).toBe('Syntax error');

      subscription.unsubscribe();
    });

    it('should publish cycle complete events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop.cycles', messageSpy);

      await publisher.publishCycleComplete({
        cycleNumber: 5,
        startTime: new Date(Date.now() - 60000),
        endTime: new Date(),
        duration: 60000,
        tasksProcessed: 3,
        routinesExecuted: [
          { name: 'test-suite', success: true, duration: 1000 },
          { name: 'lint-check', success: true, duration: 500 }
        ],
        errors: []
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.cycle.complete');
      expect(call.payload.cycleNumber).toBe(5);

      subscription.unsubscribe();
    });

    it('should publish routine executed events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop.routines', messageSpy);

      await publisher.publishRoutineExecuted({
        name: 'test-suite',
        success: true,
        duration: 1500,
        output: 'All tests passed'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.routine.executed');
      expect(call.payload.payload.name).toBe('test-suite');

      subscription.unsubscribe();
    });

    it('should publish daemon started/stopped events', async () => {
      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop', messageSpy);

      await publisher.publishDaemonStarted();
      await new Promise(resolve => setTimeout(resolve, 50));

      await publisher.publishDaemonStopped();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(messageSpy).toHaveBeenCalledTimes(2);

      const startCall = messageSpy.mock.calls[0][0];
      expect(startCall.payload.type).toBe('autoloop.daemon.started');

      const stopCall = messageSpy.mock.calls[1][0];
      expect(stopCall.payload.type).toBe('autoloop.daemon.stopped');

      subscription.unsubscribe();
    });

    it('should track event count', async () => {
      const initialCount = publisher.getEventCount();

      await publisher.publishHeartbeat(1, {
        uptime: 60000,
        cyclesCompleted: 1,
        tasksProcessed: 0,
        routinesExecuted: 0,
        errors: 0
      });

      await publisher.publishTaskQueued('task-1', 'Task 1', 'feature');

      expect(publisher.getEventCount()).toBe(initialCount + 2);
    });
  });

  describe('Shutdown', () => {
    it('should publish stopped event and close session on shutdown', async () => {
      await publisher.initialize();
      const sessionId = publisher.getSessionId();

      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop', messageSpy);

      await publisher.shutdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify stopped event was published
      expect(messageSpy).toHaveBeenCalled();
      const call = messageSpy.mock.calls[0][0];
      expect(call.payload.type).toBe('autoloop.daemon.stopped');

      // Verify session was stopped
      const session = sessionManager.getSession(sessionId!);
      expect(session?.status).toBe('stopped');

      subscription.unsubscribe();
    });
  });

  describe('Disabled Publisher', () => {
    it('should not publish events when disabled', async () => {
      const disabledPublisher = createAutoloopEventPublisher({
        workspacePath,
        messageBus,
        sessionManager,
        enabled: false
      });

      await disabledPublisher.initialize();

      const messageSpy = jest.fn();
      const subscription = messageBus.subscribe('test-subscriber', 'autoloop', messageSpy);

      await disabledPublisher.publishHeartbeat(1, {
        uptime: 60000,
        cyclesCompleted: 1,
        tasksProcessed: 0,
        routinesExecuted: 0,
        errors: 0
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messageSpy).not.toHaveBeenCalled();
      expect(disabledPublisher.getEventCount()).toBe(0);

      subscription.unsubscribe();
    });
  });
});
