/**
 * Coordination Protocol Tests
 *
 * Comprehensive tests for multi-process coordination including:
 * - Distributed state management
 * - Process registry and discovery
 * - Coordination primitives (barriers, latches, semaphores, events)
 * - Leader election with Bully algorithm
 * - Advanced locking patterns
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs';
import {
  CoordinationProtocol,
  DistributedState,
  ProcessRegistry,
  CoordinationPrimitives,
  LockType,
  ConflictResolution
} from '../index.js';
import { ConnectionPool } from '../../agent-comms/ConnectionPool.js';

describe('Multi-Process Coordination', () => {
  // Cleanup before all tests
  beforeAll(() => {
    // Reset ConnectionPool singleton
    (ConnectionPool as any).instance = null;
  });

  // Cleanup after each test to ensure isolation
  afterEach(() => {
    try {
      const pool = ConnectionPool.getInstance();
      if (pool.isOpen()) {
        pool.close();
      }
      // Reset singleton for next test
      (ConnectionPool as any).instance = null;
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('DistributedState', () => {
    let state: DistributedState;

    beforeEach(() => {
      state = new DistributedState();
    });

    describe('Basic Operations', () => {
      it('should set and get state values', () => {
        state.set('test-key', 'test-value', 'process-1');

        const entry = state.get('test-key');

        expect(entry).toBeDefined();
        expect(entry?.key).toBe('test-key');
        expect(entry?.value).toBe('test-value');
        expect(entry?.version).toBe(1);
        expect(entry?.updatedBy).toBe('process-1');
      });

      it('should return null for non-existent keys', () => {
        const entry = state.get('non-existent');

        expect(entry).toBeNull();
      });

      it('should update existing state', () => {
        state.set('key', 'value1', 'process-1');
        const updated = state.set('key', 'value2', 'process-2');

        expect(updated.version).toBe(2);
        expect(updated.value).toBe('value2');
        expect(updated.updatedBy).toBe('process-2');
      });

      it('should delete state entries', () => {
        state.set('key', 'value', 'process-1');

        expect(state.get('key')).toBeDefined();

        const deleted = state.delete('key');

        expect(deleted).toBe(true);
        expect(state.get('key')).toBeNull();
      });

      it('should list all state entries', () => {
        state.set('key1', 'value1', 'process-1');
        state.set('key2', 'value2', 'process-1');
        state.set('key3', 'value3', 'process-1');

        const entries = state.list();

        expect(entries.length).toBe(3);
        expect(entries.map(e => e.key)).toContain('key1');
        expect(entries.map(e => e.key)).toContain('key2');
        expect(entries.map(e => e.key)).toContain('key3');
      });

      it('should filter by prefix', () => {
        state.set('user:1', 'Alice', 'process-1');
        state.set('user:2', 'Bob', 'process-1');
        state.set('session:1', 'data', 'process-1');

        const userEntries = state.list('user:');

        expect(userEntries.length).toBe(2);
        expect(userEntries.every(e => e.key.startsWith('user:'))).toBe(true);
      });
    });

    describe('Versioning and Conflicts', () => {
      it('should track versions correctly', () => {
        const entry1 = state.set('key', 'v1', 'process-1');
        expect(entry1.version).toBe(1);

        const entry2 = state.set('key', 'v2', 'process-2');
        expect(entry2.version).toBe(2);

        const entry3 = state.set('key', 'v3', 'process-1');
        expect(entry3.version).toBe(3);
      });

      it('should detect version conflicts in compareAndSet', () => {
        state.set('key', 'value1', 'process-1');

        // Concurrent update with wrong version
        const result = state.compareAndSet('key', 999, 'new-value', 'process-2');

        expect(result.success).toBe(false);
        expect(result.conflict).toBe(true);
      });

      it('should succeed with correct version in compareAndSet', () => {
        const entry1 = state.set('key', 'value1', 'process-1');

        const result = state.compareAndSet('key', entry1.version, 'value2', 'process-2');

        expect(result.success).toBe(true);
        expect(result.conflict).toBe(false);
        expect(result.version).toBe(2);
      });

      it('should resolve conflicts with LAST_WRITE_WINS strategy', () => {
        state.set('key', 'value1', 'process-1');

        // Simulate concurrent update
        const result = state.update('key', 'value2', 'process-2', ConflictResolution.LAST_WRITE_WINS);

        expect(result.success).toBe(true);
        expect(state.get('key')?.value).toBe('value2');
      });

      it('should resolve conflicts with FIRST_WRITE_WINS strategy', () => {
        state.set('key', 'original', 'process-1');

        // Try concurrent update
        const result = state.update('key', 'new-value', 'process-2', ConflictResolution.FIRST_WRITE_WINS);

        expect(result.resolved).toBe(true);
        expect(state.get('key')?.value).toBe('original');
      });

      it('should get history of state changes', () => {
        state.set('key', 'v1', 'process-1');
        state.set('key', 'v2', 'process-2');
        state.set('key', 'v3', 'process-1');

        const history = state.getHistory('key', 10);

        expect(history.length).toBe(3);
        expect(history[0].value).toBe('v3');
        expect(history[1].value).toBe('v2');
        expect(history[2].value).toBe('v1');
      });
    });

    describe('Batch Operations', () => {
      it('should get multiple values at once', () => {
        state.set('key1', 'value1', 'process-1');
        state.set('key2', 'value2', 'process-1');
        state.set('key3', 'value3', 'process-1');

        const values = state.getMany(['key1', 'key2', 'key3']);

        expect(values.size).toBe(3);
        expect(values.get('key1')?.value).toBe('value1');
        expect(values.get('key2')?.value).toBe('value2');
        expect(values.get('key3')?.value).toBe('value3');
      });

      it('should handle partial results in getMany', () => {
        state.set('key1', 'value1', 'process-1');

        const values = state.getMany(['key1', 'key2', 'key3']);

        expect(values.size).toBe(1);
        expect(values.get('key1')?.value).toBe('value1');
      });
    });

    describe('Replication', () => {
      it('should replicate state from another process', () => {
        // Set up initial state
        state.set('key1', 'value1', 'process-1');

        // Simulate replication from another process
        const entries = [
          { key: 'key2', value: 'value2', version: 1, updatedBy: 'process-2', updatedAt: Date.now() },
          { key: 'key3', value: 'value3', version: 1, updatedBy: 'process-2', updatedAt: Date.now() }
        ];

        const replicated = state.replicate(entries);

        expect(replicated).toBe(2);
        expect(state.get('key2')?.value).toBe('value2');
        expect(state.get('key3')?.value).toBe('value3');
      });

      it('should only replicate newer versions', () => {
        state.set('key', 'v1', 'process-1'); // version 1

        // Try to replicate older version
        const entries = [
          { key: 'key', value: 'old', version: 1, updatedBy: 'process-2', updatedAt: Date.now() - 1000 }
        ];

        const replicated = state.replicate(entries);

        expect(replicated).toBe(0);
        expect(state.get('key')?.value).toBe('v1');
      });
    });

    describe('Statistics', () => {
      it('should provide statistics', () => {
        state.set('key1', 'value1', 'process-1');
        state.set('key2', 'value2', 'process-2');

        const stats = state.getStats();

        expect(stats.totalEntries).toBe(2);
        expect(stats.totalConflicts).toBe(0);
      });
    });
  });

  describe('ProcessRegistry', () => {
    let registry: ProcessRegistry;

    beforeEach(() => {
      registry = new ProcessRegistry({
        heartbeatInterval: 1000,
        heartbeatTimeout: 2000,
        deadTimeout: 5000,
        cleanupInterval: 10000
      });
    });

    afterEach(() => {
      registry.shutdown();
    });

    describe('Registration', () => {
      it('should register a new process', () => {
        const processId = registry.register(12345, 'worker', { zone: 'us-east' });

        expect(processId).toBeDefined();

        const process = registry.getProcess(processId);

        expect(process).toBeDefined();
        expect(process?.pid).toBe(12345);
        expect(process?.role).toBe('worker');
        expect(process?.status).toBe('alive');
        expect(process?.metadata.zone).toBe('us-east');
      });

      it('should prevent duplicate registration', () => {
        registry.register(11111, 'worker');

        expect(() => {
          registry.register(11111, 'worker');
        }).toThrow();
      });

      it('should unregister a process', () => {
        const processId = registry.register(22222, 'worker');

        expect(registry.getProcess(processId)).toBeDefined();

        registry.unregister(processId);

        expect(registry.getProcess(processId)).toBeNull();
      });

      it('should get process by PID and role', () => {
        registry.register(33333, 'worker');

        const process = registry.getProcessByPid(33333, 'worker');

        expect(process).toBeDefined();
        expect(process?.role).toBe('worker');
      });
    });

    describe('Heartbeat Monitoring', () => {
      it('should update heartbeat', () => {
        const processId = registry.register(44444, 'worker');

        const result = registry.heartbeat(processId);

        expect(result).toBe(true);
      });

      it('should return false for non-existent process heartbeat', () => {
        const result = registry.heartbeat('non-existent');

        expect(result).toBe(false);
      });

      it('should check if process is alive', () => {
        const processId = registry.register(55555, 'worker');

        expect(registry.isAlive(processId)).toBe(true);

        registry.unregister(processId);

        expect(registry.isAlive(processId)).toBe(false);
      });

      it('should mark suspected processes', () => {
        const processId = registry.register(66666, 'worker');

        // Don't send heartbeats, should become suspected

        registry.markSuspected(processId);

        const process = registry.getProcess(processId);

        expect(process?.status).toBe('suspected');
      });

      it('should mark dead processes', () => {
        const processId = registry.register(77777, 'worker');

        registry.markDead(processId);

        const process = registry.getProcess(processId);

        expect(process?.status).toBe('dead');
      });

      it('should detect health changes', () => {
        registry.register(88888, 'worker');

        // Force heartbeat to be old
        registry.markDead('88888');

        const changes = registry.checkHealth();

        expect(changes).toBeGreaterThan(0);
      });
    });

    describe('Listing Processes', () => {
      beforeEach(() => {
        registry.register(10001, 'worker');
        registry.register(10002, 'coordinator');
        registry.register(10003, 'worker');
      });

      it('should list all processes', () => {
        const processes = registry.listProcesses();

        expect(processes.length).toBe(3);
      });

      it('should filter by status', () => {
        const alive = registry.listProcesses('alive');

        expect(alive.length).toBe(3);

        registry.markDead('12345');

        const stillAlive = registry.listProcesses('alive');

        expect(stillAlive.length).toBe(2);
      });

      it('should filter by role', () => {
        const workers = registry.listProcesses(undefined, 'worker');

        expect(workers.length).toBe(2);
        expect(workers.every(p => p.role === 'worker')).toBe(true);
      });

      it('should get alive processes', () => {
        const alive = registry.getAliveProcesses();

        expect(alive.length).toBe(3);
      });
    });

    describe('Metadata', () => {
      it('should update metadata', () => {
        const processId = registry.register(99999, 'worker', { zone: 'us-east' });

        registry.updateMetadata(processId, { zone: 'us-west', host: 'server1' });

        const process = registry.getProcess(processId);

        expect(process?.metadata.zone).toBe('us-west');
        expect(process?.metadata.host).toBe('server1');
      });
    });

    describe('Statistics', () => {
      beforeEach(() => {
        registry.register(20001, 'worker');
        registry.register(20002, 'worker');
        registry.register(20003, 'coordinator');
      });

      it('should provide statistics', () => {
        const stats = registry.getStats();

        expect(stats.totalProcesses).toBe(3);
        expect(stats.aliveProcesses).toBe(3);
        expect(stats.processesByRole.worker).toBe(2);
        expect(stats.processesByRole.coordinator).toBe(1);
      });
    });
  });

  describe('CoordinationPrimitives', () => {
    let primitives: CoordinationPrimitives;

    beforeEach(() => {
      primitives = new CoordinationPrimitives();
    });

    describe('Barriers', () => {
      it('should create barrier', () => {
        const id = primitives.createBarrier('test-barrier', 3);

        expect(id).toBeDefined();

        const barrier = primitives.getBarrier(id);

        expect(barrier).toBeDefined();
        expect(barrier?.expected).toBe(3);
        expect(barrier?.arrived.length).toBe(0);
        expect(barrier?.released).toBe(false);
      });

      it('should track arrivals', () => {
        const id = primitives.createBarrier('test-barrier', 3);

        primitives.arriveAtBarrier(id, 'process-1');

        const barrier = primitives.getBarrier(id);

        expect(barrier?.arrived).toContain('process-1');
        expect(barrier?.released).toBe(false);
      });

      it('should release when all processes arrive', () => {
        const id = primitives.createBarrier('test-barrier', 3);

        expect(primitives.arriveAtBarrier(id, 'process-1')).toBe(false);
        expect(primitives.arriveAtBarrier(id, 'process-2')).toBe(false);
        expect(primitives.arriveAtBarrier(id, 'process-3')).toBe(true);

        const barrier = primitives.getBarrier(id);

        expect(barrier?.released).toBe(true);
      });

      it('should wait for barrier release', async () => {
        const id = primitives.createBarrier('test-barrier', 2);

        // Start waiting in background (short timeout)
        let released = false;
        const waitPromise = (async () => {
          released = await primitives.waitForBarrier(id, 5000);
          return released;
        })();

        // Give waitForBarrier time to start
        await new Promise(resolve => setTimeout(resolve, 50));

        // Arrive both processes
        primitives.arriveAtBarrier(id, 'process-1');
        primitives.arriveAtBarrier(id, 'process-2');

        await waitPromise;

        expect(released).toBe(true);
      });

      it('should delete barrier', () => {
        const id = primitives.createBarrier('test-barrier', 3);

        expect(primitives.getBarrier(id)).toBeDefined();

        const deleted = primitives.deleteBarrier(id);

        expect(deleted).toBe(true);
        expect(primitives.getBarrier(id)).toBeNull();
      });
    });

    describe('Latches', () => {
      it('should create latch', () => {
        const id = primitives.createLatch('test-latch', 3);

        expect(id).toBeDefined();

        const latch = primitives.getLatch(id);

        expect(latch).toBeDefined();
        expect(latch?.count).toBe(3);
        expect(latch?.completed).toBe(false);
      });

      it('should count down', () => {
        const id = primitives.createLatch('test-latch', 3);

        expect(primitives.countDown(id)).toBe(false);
        expect(primitives.countDown(id)).toBe(false);
        expect(primitives.countDown(id)).toBe(true);

        const latch = primitives.getLatch(id);

        expect(latch?.completed).toBe(true);
      });

      it('should wait for latch completion', async () => {
        const id = primitives.createLatch('test-latch', 2);

        // Start waiting
        const waitPromise = primitives.awaitLatch(id, 1000);

        // Count down
        primitives.countDown(id);
        primitives.countDown(id);

        const completed = await waitPromise;

        expect(completed).toBe(true);
      });

      it('should delete latch', () => {
        const id = primitives.createLatch('test-latch', 3);

        expect(primitives.getLatch(id)).toBeDefined();

        const deleted = primitives.deleteLatch(id);

        expect(deleted).toBe(true);
        expect(primitives.getLatch(id)).toBeNull();
      });
    });

    describe('Semaphores', () => {
      it('should create semaphore', () => {
        const id = primitives.createSemaphore('test-semaphore', 5);

        expect(id).toBeDefined();

        const semaphore = primitives.getSemaphore(id);

        expect(semaphore).toBeDefined();
        expect(semaphore?.permits).toBe(5);
        expect(semaphore?.available).toBe(5);
        expect(semaphore?.holders.length).toBe(0);
      });

      it('should acquire permits', () => {
        const id = primitives.createSemaphore('test-semaphore', 5);

        const acquired1 = primitives.acquirePermit(id, 'process-1', 2);
        const acquired2 = primitives.acquirePermit(id, 'process-2', 1);

        expect(acquired1).toBe(true);
        expect(acquired2).toBe(true);

        const semaphore = primitives.getSemaphore(id);

        expect(semaphore?.available).toBe(2);
        expect(semaphore?.holders).toContain('process-1');
        expect(semaphore?.holders).toContain('process-2');
      });

      it('should release permits', () => {
        const id = primitives.createSemaphore('test-semaphore', 5);

        primitives.acquirePermit(id, 'process-1', 3);
        primitives.releasePermit(id, 'process-1', 2);

        const semaphore = primitives.getSemaphore(id);

        expect(semaphore?.available).toBe(4);
      });

      it('should block when no permits available', () => {
        const id = primitives.createSemaphore('test-semaphore', 2);

        primitives.acquirePermit(id, 'process-1', 2);

        const acquired = primitives.acquirePermit(id, 'process-2', 1, 100);

        expect(acquired).toBe(false);
      });

      it('should delete semaphore', () => {
        const id = primitives.createSemaphore('test-semaphore', 5);

        expect(primitives.getSemaphore(id)).toBeDefined();

        const deleted = primitives.deleteSemaphore(id);

        expect(deleted).toBe(true);
        expect(primitives.getSemaphore(id)).toBeNull();
      });
    });

    describe('Events', () => {
      it('should create event', () => {
        const id = primitives.createEvent('test-event', false);

        expect(id).toBeDefined();

        const event = primitives.getEvent(id);

        expect(event).toBeDefined();
        expect(event?.signaled).toBe(false);
        expect(event?.autoReset).toBe(false);
      });

      it('should signal event', () => {
        const id = primitives.createEvent('test-event');

        primitives.setEvent(id);

        const event = primitives.getEvent(id);

        expect(event?.signaled).toBe(true);
      });

      it('should reset event', () => {
        const id = primitives.createEvent('test-event');

        primitives.setEvent(id);
        primitives.resetEvent(id);

        const event = primitives.getEvent(id);

        expect(event?.signaled).toBe(false);
      });

      it('should wait for event signal', async () => {
        const id = primitives.createEvent('test-event');

        // Start waiting
        const waitPromise = primitives.waitForEvent(id, 'process-1', 1000);

        // Signal after delay
        setTimeout(() => primitives.setEvent(id), 100);

        const signaled = await waitPromise;

        expect(signaled).toBe(true);
      });

      it('should auto-reset event', () => {
        const id = primitives.createEvent('test-event', true);

        primitives.setEvent(id);

        const event1 = primitives.getEvent(id);
        expect(event1?.signaled).toBe(true);

        // Waiter completes, should auto-reset
        primitives.waitForEvent(id, 'process-1', 100);

        const event2 = primitives.getEvent(id);
        expect(event2?.signaled).toBe(false);
      });

      it('should delete event', () => {
        const id = primitives.createEvent('test-event');

        expect(primitives.getEvent(id)).toBeDefined();

        const deleted = primitives.deleteEvent(id);

        expect(deleted).toBe(true);
        expect(primitives.getEvent(id)).toBeNull();
      });
    });

    describe('Statistics', () => {
      it('should provide statistics', () => {
        primitives.createBarrier('b1', 3);
        primitives.createLatch('l1', 5);
        primitives.createSemaphore('s1', 10);
        primitives.createEvent('e1');

        const stats = primitives.getStats();

        expect(stats.totalBarriers).toBe(1);
        expect(stats.totalLatches).toBe(1);
        expect(stats.totalSemaphores).toBe(1);
        expect(stats.totalEvents).toBe(1);
      });
    });
  });

  describe('CoordinationProtocol', () => {
    let protocol: CoordinationProtocol;

    beforeEach(() => {
      protocol = new CoordinationProtocol();
    });

    describe('Basic Locking', () => {
      it('should acquire exclusive lock', async () => {
        const acquired = await protocol.acquireLock('resource-1', 'session-1', 5000);

        expect(acquired).toBe(true);

        const owner = await protocol.getLockOwner('resource-1');

        expect(owner).toBe('session-1');
      });

      it('should fail to acquire held lock', async () => {
        await protocol.acquireLock('resource-1', 'session-1', 5000);

        const acquired = await protocol.acquireLock('resource-1', 'session-2', 100);

        expect(acquired).toBe(false);
      });

      it('should release lock', async () => {
        await protocol.acquireLock('resource-1', 'session-1', 5000);

        await protocol.releaseLock('resource-1', 'session-1');

        const owner = await protocol.getLockOwner('resource-1');

        expect(owner).toBeNull();
      });

      it('should renew lock', async () => {
        await protocol.acquireLock('resource-1', 'session-1', 100);

        const renewed = await protocol.renewLock('resource-1', 'session-1');

        expect(renewed).toBe(true);
      });
    });

    describe('Shared Locks', () => {
      it('should allow multiple readers', async () => {
        const acquired1 = await protocol.acquireLock('resource-1', 'session-1', { type: LockType.SHARED });
        const acquired2 = await protocol.acquireLock('resource-1', 'session-2', { type: LockType.SHARED });

        expect(acquired1).toBe(true);
        expect(acquired2).toBe(true);
      });

      it('should block writers with active readers', async () => {
        await protocol.acquireLock('resource-1', 'session-1', { type: LockType.SHARED });

        const acquired = await protocol.acquireLock('resource-1', 'session-2', {
          type: LockType.EXCLUSIVE,
          timeout: 100
        });

        expect(acquired).toBe(false);
      });
    });

    describe('Reentrant Locks', () => {
      it('should allow same holder to acquire multiple times', async () => {
        const acquired1 = await protocol.acquireLock('resource-1', 'session-1', {
          type: LockType.REENTRANT
        });
        const acquired2 = await protocol.acquireLock('resource-1', 'session-1', {
          type: LockType.REENTRANT
        });

        expect(acquired1).toBe(true);
        expect(acquired2).toBe(true);
      });

      it('should require multiple releases for reentrant lock', async () => {
        await protocol.acquireLock('resource-1', 'session-1', { type: LockType.REENTRANT });
        await protocol.acquireLock('resource-1', 'session-1', { type: LockType.REENTRANT });

        // First release should not fully release
        await protocol.releaseLock('resource-1', 'session-1');
        const owner = await protocol.getLockOwner('resource-1');

        expect(owner).toBe('session-1');

        // Second release should fully release
        await protocol.releaseLock('resource-1', 'session-1');
        const ownerAfter = await protocol.getLockOwner('resource-1');

        expect(ownerAfter).toBeNull();
      });
    });

    describe('Lock State', () => {
      it('should get lock state', async () => {
        await protocol.acquireLock('resource-1', 'session-1', {
          type: LockType.EXCLUSIVE,
          priority: 10
        });

        const state = protocol.getLockState('resource-1');

        expect(state).toBeDefined();
        expect(state?.resource).toBe('resource-1');
        expect(state?.type).toBe(LockType.EXCLUSIVE);
        expect(state?.owner).toBe('session-1');
      });
    });

    describe('Leader Election', () => {
      it('should elect leader from candidates', async () => {
        const candidates = ['session-1', 'session-2', 'session-3'];

        const result = await protocol.electLeader(candidates);

        expect(result).toBeDefined();
        expect(candidates).toContain(result.leaderId);
        expect(result.term).toBeGreaterThan(0);
      });

      it('should respect priority in leader election', async () => {
        const candidates = ['session-1', 'session-2', 'session-3'];
        const priorities = new Map([
          ['session-1', 10],
          ['session-2', 100],
          ['session-3', 50]
        ]);

        const result = await protocol.electLeader(candidates, priorities);

        expect(result.leaderId).toBe('session-2'); // Highest priority
        expect(result.priority).toBe(100);
      });

      it('should check if session is leader', async () => {
        const result = await protocol.electLeader(['session-1', 'session-2']);

        expect(protocol.isLeader(result.leaderId)).toBe(true);
        expect(protocol.isLeader('other-session')).toBe(false);
      });

      it('should get current leader', async () => {
        const result = await protocol.electLeader(['session-1', 'session-2']);

        const leader = protocol.getCurrentLeader();

        expect(leader).toBe(result.leaderId);
      });

      it('should transfer leadership', async () => {
        const result = await protocol.electLeader(['session-1', 'session-2']);

        const transferred = await protocol.transferLeadership(result.leaderId, 'session-2');

        expect(transferred).toBe(true);
        expect(protocol.getCurrentLeader()).toBe('session-2');
      });

      it('should resign leadership', async () => {
        const result = await protocol.electLeader(['session-1', 'session-2']);

        await protocol.resignLeadership(result.leaderId);

        expect(protocol.getCurrentLeader()).toBeNull();
      });

      it('should renew leadership term', async () => {
        const result = await protocol.electLeader(['session-1']);

        const renewed = await protocol.renewLeadership(result.leaderId, 60000);

        expect(renewed).toBe(true);
      });

      it('should challenge leadership with higher priority', async () => {
        const result = await protocol.electLeader(['session-1', 'session-2']);

        const challenged = await protocol.challengeLeadership('session-3', 999);

        expect(challenged).toBe(true);
        expect(protocol.getCurrentLeader()).toBe('session-3');
      });
    });

    describe('Heartbeat', () => {
      it('should broadcast heartbeat', () => {
        protocol.broadcastHeartbeat('session-1');

        const alive = protocol.checkHeartbeat('session-1');

        expect(alive).toBe(true);
      });

      it('should check heartbeat status', () => {
        protocol.broadcastHeartbeat('session-1');

        expect(protocol.checkHeartbeat('session-1')).toBe(true);
        expect(protocol.checkHeartbeat('session-2')).toBe(false);
      });
    });
  });
});
