/**
 * TDD Integration Tests for UltraX Server
 *
 * Test-Driven Development approach:
 * 1. Write failing tests
 * 2. Implement features to make tests pass
 * 3. Refactor
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UltraXServer } from '../src/server.js';
import express from 'express';

describe('UltraX Server Integration Tests', () => {
  let server: UltraXServer;
  let app: express.Application;

  beforeAll(async () => {
    server = new UltraXServer({
      port: 3002, // Different port for testing
      relayUrl: 'http://localhost:3000'
    });

    app = server.getApp();

    // Don't start the actual server, just use the app for testing
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        sessions: expect.any(Number)
      });
    });
  });

  describe('Gateway API', () => {
    it('should handle gateway request', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'test-session-1',
          userId: 'user@example.com',
          interface: 'web',
          command: '/ultrapilot test task'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        sessionId: 'test-session-1',
        interface: 'web',
        message: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    it('should return error for missing fields', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'test-session-2'
          // Missing userId and command
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    it('should handle /ultra-team command', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'team-session',
          userId: 'user@example.com',
          interface: 'web',
          command: '/ultra-team N=3 refactor code'
        })
        .expect(200);

      expect(response.body.agent).toBe('ultra:team-lead');
      expect(response.body.phase).toBe('planning');
    });

    it('should handle /ultra-ralph command', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'ralph-session',
          userId: 'user@example.com',
          interface: 'cli',
          command: '/ultra-ralph fix tests'
        })
        .expect(200);

      expect(response.body.agent).toBe('ultra:ralph');
      expect(response.body.phase).toBe('execution');
    });

    it('should handle status command', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'status-session',
          userId: 'user@example.com',
          interface: 'web',
          command: 'status'
        })
        .expect(200);

      expect(response.body.message).toContain('Session:');
    });

    it('should handle cancel command', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'cancel-session',
          userId: 'user@example.com',
          interface: 'web',
          command: '/ultra-cancel'
        })
        .expect(200);

      expect(response.body.message).toContain('Cancelling');
    });
  });

  describe('Session Management API', () => {
    it('should get session status', async () => {
      // First create a session
      await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'status-api-session',
          userId: 'user@example.com',
          interface: 'web',
          command: '/ultrapilot test'
        });

      // Get status
      const response = await request(app)
        .get('/api/session/status-api-session')
        .expect(200);

      expect(response.body).toMatchObject({
        exists: true,
        interface: 'web',
        messageCount: expect.any(Number),
        uptime: expect.any(Number)
      });
    });

    it('should return not exists for non-existent session', async () => {
      const response = await request(app)
        .get('/api/session/non-existent-session')
        .expect(200);

      expect(response.body.exists).toBe(false);
    });

    it('should switch session interface', async () => {
      // Create session
      await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'switch-session',
          userId: 'user@example.com',
          interface: 'cli',
          command: '/ultrapilot test'
        });

      // Switch interface
      const response = await request(app)
        .post('/api/session/switch-session/switch')
        .send({ targetInterface: 'web' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'switch-session',
        targetInterface: 'web'
      });
    });

    it('should reject invalid interface', async () => {
      const response = await request(app)
        .post('/api/session/test-session/switch')
        .send({ targetInterface: 'invalid' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should terminate session', async () => {
      // Create session
      await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'terminate-session',
          userId: 'user@example.com',
          interface: 'web',
          command: '/ultrapilot test'
        });

      // Terminate
      const response = await request(app)
        .delete('/api/session/terminate-session')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify session is gone
      await request(app)
        .get('/api/session/terminate-session')
        .expect(200)
        .expect(res => {
          expect(res.body.exists).toBe(false);
        });
    });
  });

  describe('Relay Integration API', () => {
    it('should return available commands', async () => {
      const response = await request(app)
        .get('/api/relay/commands')
        .expect(200);

      expect(response.body.commands).toBeInstanceOf(Array);
      expect(response.body.commands.length).toBeGreaterThan(0);

      const commands = response.body.commands;
      expect(commands.some((c: any) => c.name === '/ultrapilot')).toBe(true);
      expect(commands.some((c: any) => c.name === '/ultra-team')).toBe(true);
      expect(commands.some((c: any) => c.name === '/ultra-ralph')).toBe(true);
    });

    it('should return user sessions', async () => {
      // Create some sessions
      await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'relay-session-1',
          userId: 'relay-user@example.com',
          interface: 'web',
          command: '/ultrapilot test'
        });

      await request(app)
        .post('/api/gateway')
        .send({
          sessionId: 'relay-session-2',
          userId: 'relay-user@example.com',
          interface: 'chat',
          command: 'status'
        });

      // Get user sessions
      const response = await request(app)
        .get('/api/relay/sessions/relay-user@example.com')
        .expect(200);

      expect(response.body.sessions).toBeInstanceOf(Array);
      expect(response.body.sessions.length).toBe(2);

      const sessionIds = response.body.sessions.map((s: any) => s.sessionId);
      expect(sessionIds).toContain('relay-session-1');
      expect(sessionIds).toContain('relay-session-2');
    });

    it('should return empty array for user with no sessions', async () => {
      const response = await request(app)
        .get('/api/relay/sessions/no-sessions-user@example.com')
        .expect(200);

      expect(response.body.sessions).toEqual([]);
    });
  });

  describe('Google Chat Webhook', () => {
    it('should accept Google Chat webhook', async () => {
      const webhookEvent = {
        type: 'MESSAGE',
        event: {
          token: 'test-token',
          timestamp: new Date().toISOString(),
          user: {
            name: 'users/test-user',
            displayName: 'Test User'
          },
          space: {
            name: 'spaces/test-space',
            displayName: 'Test Space'
          },
          message: {
            name: 'spaces/test-space/messages/test-message',
            sender: {
              name: 'users/test-user',
              displayName: 'Test User'
            },
            text: '@UltraX test command',
            space: {
              name: 'spaces/test-space',
              displayName: 'Test Space'
            },
            thread: {
              name: 'spaces/test-space/threads/test-thread'
            }
          }
        }
      };

      // Will return 503 when bot not configured (graceful degradation)
      const response = await request(app)
        .post('/webhook/google-chat')
        .send(webhookEvent);

      // Accept either 200 (bot configured) or 503 (bot not configured)
      expect([200, 503]).toContain(response.status);
    });

    it('should accept webhook without bot configured', async () => {
      const webhookEvent = {
        type: 'MESSAGE',
        event: {
          user: { name: 'users/user', displayName: 'User' },
          space: { name: 'spaces/space', displayName: 'Space' },
          message: {
            sender: { name: 'users/user', displayName: 'User' },
            text: 'test',
            space: { name: 'spaces/space', displayName: 'Space' },
            thread: { name: 'spaces/space/threads/thread' }
          }
        }
      };

      // Should return 503 when bot not configured (not an error, just unavailable)
      const response = await request(app)
        .post('/webhook/google-chat')
        .send(webhookEvent)
        .expect(503);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers for Relay', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body.error).toBe('Not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/gateway')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Session Continuity', () => {
    it('should maintain session across multiple requests', async () => {
      const sessionId = 'continuity-session';
      const userId = 'continuity-user@example.com';

      // First request
      const response1 = await request(app)
        .post('/api/gateway')
        .send({
          sessionId,
          userId,
          interface: 'web',
          command: '/ultrapilot task 1'
        });

      expect(response1.body.sessionId).toBe(sessionId);

      // Second request - same session
      const response2 = await request(app)
        .post('/api/gateway')
        .send({
          sessionId,
          userId,
          interface: 'web',
          command: 'status'
        });

      expect(response2.body.sessionId).toBe(sessionId);
      expect(response2.body.message).toContain('continuity-session');
    });

    it('should track message count', async () => {
      const sessionId = 'message-count-session';
      const userId = 'count-user@example.com';

      // Send 3 messages
      await request(app)
        .post('/api/gateway')
        .send({
          sessionId,
          userId,
          interface: 'cli',
          command: 'status'
        });

      await request(app)
        .post('/api/gateway')
        .send({
          sessionId,
          userId,
          interface: 'cli',
          command: 'status'
        });

      await request(app)
        .post('/api/gateway')
        .send({
          sessionId,
          userId,
          interface: 'cli',
          command: 'status'
        });

      // Check status
      const response = await request(app)
        .get(`/api/session/${sessionId}`)
        .expect(200);

      expect(response.body.messageCount).toBe(3);
    });
  });
});
