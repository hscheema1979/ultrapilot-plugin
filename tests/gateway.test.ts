/**
 * TDD Tests for UltraX Gateway
 *
 * Test-Driven Development approach:
 * 1. Write failing tests
 * 2. Implement features to make tests pass
 * 3. Refactor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UltraXGateway, UltraXMessage, UltraXSession } from '../src/gateway.js';

describe('UltraX Gateway', () => {
  let gateway: UltraXGateway;

  beforeEach(() => {
    gateway = new UltraXGateway({
      sessionTimeout: 60000 // 1 minute for tests
    });
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const session = await gateway.createSession('test-session-1', 'user@example.com', 'web');

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('test-session-1');
      expect(session.userId).toBe('user@example.com');
      expect(session.interface).toBe('web');
      expect(session.messages).toEqual([]);
      expect(session.activeAgents).toBeUndefined();
    });

    it('should retrieve an existing session', () => {
      gateway.createSession('test-session-2', 'user@example.com', 'chat');

      const session = gateway.getSession('test-session-2');

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe('test-session-2');
    });

    it('should return undefined for non-existent session', () => {
      const session = gateway.getSession('non-existent');

      expect(session).toBeUndefined();
    });

    it('should handle messages and create session automatically', async () => {
      const message: UltraXMessage = {
        sessionId: 'auto-session',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultrapilot test task',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response).toBeDefined();
      expect(response.sessionId).toBe('auto-session');
      expect(response.interface).toBe('cli');

      const session = gateway.getSession('auto-session');
      expect(session).toBeDefined();
      expect(session?.messages).toHaveLength(1);
    });

    it('should switch session interface', async () => {
      await gateway.createSession('switch-session', 'user@example.com', 'cli');

      await gateway.switchSession('switch-session', 'web');

      const session = gateway.getSession('switch-session');
      expect(session?.interface).toBe('web');
    });

    it('should throw error when switching non-existent session', async () => {
      await expect(
        gateway.switchSession('non-existent', 'web')
      ).rejects.toThrow('Session non-existent not found');
    });

    it('should terminate session', async () => {
      await gateway.createSession('terminate-session', 'user@example.com', 'chat');

      await gateway.terminateSession('terminate-session');

      const session = gateway.getSession('terminate-session');
      expect(session).toBeUndefined();
    });

    it('should get session status', async () => {
      await gateway.createSession('status-session', 'user@example.com', 'web');

      const status = gateway.getSessionStatus('status-session');

      expect(status.exists).toBe(true);
      expect(status.interface).toBe('web');
      expect(status.messageCount).toBe(0);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return status for non-existent session', () => {
      const status = gateway.getSessionStatus('non-existent');

      expect(status.exists).toBe(false);
      expect(status.messageCount).toBe(0);
    });
  });

  describe('Command Parsing', () => {
    it('should parse /ultrapilot command', async () => {
      const message: UltraXMessage = {
        sessionId: 'parse-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultrapilot build me a REST API',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('Starting Ultrapilot');
      expect(response.agent).toBe('ultra:analyst');
      expect(response.phase).toBe('expansion');
    });

    it('should parse /ultra-team command', async () => {
      const message: UltraXMessage = {
        sessionId: 'team-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultra-team N=5 refactor database',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('team mode');
      expect(response.agent).toBe('ultra:team-lead');
    });

    it('should parse /ultra-ralph command', async () => {
      const message: UltraXMessage = {
        sessionId: 'ralph-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultra-ralph fix the failing tests',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('Ralph loop');
      expect(response.agent).toBe('ultra:ralph');
    });

    it('should parse /ultra-review command', async () => {
      const message: UltraXMessage = {
        sessionId: 'review-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultra-review src/',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('multi-dimensional review');
      expect(response.agent).toBe('ultra:code-reviewer');
    });

    it('should parse status command', async () => {
      const message: UltraXMessage = {
        sessionId: 'status-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: 'status',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('Session:');
      expect(response.message).toContain('Interface:');
    });

    it('should parse cancel command', async () => {
      const message: UltraXMessage = {
        sessionId: 'cancel-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultra-cancel',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.message).toContain('Cancelling');
    });

    it('should parse hud command', async () => {
      const message: UltraXMessage = {
        sessionId: 'hud-test',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultra-hud',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.hud).toBeDefined();
      expect(response.hud).toContain('[ULTRA]');
    });
  });

  describe('Response Formatting', () => {
    it('should format response for web interface', async () => {
      const message: UltraXMessage = {
        sessionId: 'web-response',
        userId: 'user@example.com',
        interface: 'web',
        command: '/ultrapilot test',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.interface).toBe('web');
      expect(response.timestamp).toBeDefined();
    });

    it('should format response for chat interface with HUD', async () => {
      const message: UltraXMessage = {
        sessionId: 'chat-response',
        userId: 'user@example.com',
        interface: 'chat',
        command: '/ultrapilot test',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.interface).toBe('chat');
      expect(response.hud).toBeDefined();
      expect(response.hud).toContain('interface:chat');
    });

    it('should include agent info in response', async () => {
      const message: UltraXMessage = {
        sessionId: 'agent-response',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultrapilot test',
        timestamp: new Date()
      };

      const response = await gateway.handleMessage(message);

      expect(response.agent).toBe('ultra:analyst');
      expect(response.phase).toBe('expansion');
    });
  });

  describe('Session Activity Tracking', () => {
    it('should update last activity on message', async () => {
      await gateway.createSession('activity-session', 'user@example.com', 'web');

      const sessionBefore = gateway.getSession('activity-session');
      const activityBefore = sessionBefore?.lastActivity;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const message: UltraXMessage = {
        sessionId: 'activity-session',
        userId: 'user@example.com',
        interface: 'web',
        command: 'status',
        timestamp: new Date()
      };

      await gateway.handleMessage(message);

      const sessionAfter = gateway.getSession('activity-session');
      const activityAfter = sessionAfter?.lastActivity;

      expect(activityAfter?.getTime()).toBeGreaterThan(activityBefore?.getTime() || 0);
    });

    it('should track active agents', async () => {
      const message: UltraXMessage = {
        sessionId: 'agents-session',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultrapilot test',
        timestamp: new Date()
      };

      await gateway.handleMessage(message);

      const session = gateway.getSession('agents-session');

      expect(session?.activeAgents).toBeDefined();
      expect(session?.activeAgents).toContain('ultra:analyst');
    });

    it('should track current phase', async () => {
      const message: UltraXMessage = {
        sessionId: 'phase-session',
        userId: 'user@example.com',
        interface: 'cli',
        command: '/ultrapilot test',
        timestamp: new Date()
      };

      await gateway.handleMessage(message);

      const session = gateway.getSession('phase-session');

      expect(session?.currentPhase).toBe('expansion');
    });
  });

  describe('Session Cleanup', () => {
    it('should not clean up active sessions', async () => {
      await gateway.createSession('active-session', 'user@example.com', 'web');

      // Simulate time passing (but less than timeout)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger cleanup (happens internally)
      const session = gateway.getSession('active-session');

      expect(session).toBeDefined();
    });

    it('should handle multiple sessions independently', async () => {
      await gateway.createSession('session-1', 'user1@example.com', 'web');
      await gateway.createSession('session-2', 'user2@example.com', 'chat');
      await gateway.createSession('session-3', 'user3@example.com', 'cli');

      expect(gateway.getSession('session-1')).toBeDefined();
      expect(gateway.getSession('session-2')).toBeDefined();
      expect(gateway.getSession('session-3')).toBeDefined();

      await gateway.terminateSession('session-2');

      expect(gateway.getSession('session-1')).toBeDefined();
      expect(gateway.getSession('session-2')).toBeUndefined();
      expect(gateway.getSession('session-3')).toBeDefined();
    });
  });
});
