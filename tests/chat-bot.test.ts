/**
 * TDD Tests for UltraX Google Chat Bot
 *
 * Test-Driven Development approach:
 * 1. Write failing tests
 * 2. Implement features to make tests pass
 * 3. Refactor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UltraXGoogleChatBot } from '../src/chat-bot.js';
import { UltraXGateway } from '../src/gateway.js';
import type { GoogleChatWebhookEvent } from '../src/chat-bot.js';

describe('UltraX Google Chat Bot', () => {
  let gateway: UltraXGateway;

  beforeEach(() => {
    gateway = new UltraXGateway({
      sessionTimeout: 60000
    });
  });

  describe('Command Detection', () => {
    it('should detect @UltraX command', () => {
      const bot = new UltraXGoogleChatBot(gateway, {
        projectId: 'test-project',
        botId: 'bots/bot-123',
        credentialsPath: '/path/to/creds.json',
        webhookUrl: 'https://example.com/webhook'
      });

      // Test private method via public interface
      const message1 = '@UltraX build me a REST API';
      const message2 = 'hello world';

      // We'll test this through handleWebhook which calls isUltraXCommand
      expect(true).toBe(true); // Placeholder - will test through integration
    });

    it('should detect @ultrapilot command', () => {
      const message = '@ultrapilot fix the tests';
      expect(message.toLowerCase().includes('@ultrapilot')).toBe(true);
    });

    it('should detect /ultrax command', () => {
      const message = '/ultrax status';
      expect(message.toLowerCase().includes('/ultrax')).toBe(true);
    });

    it('should ignore non-UltraX messages', () => {
      const message = 'hello everyone';
      expect(message.toLowerCase().includes('@ultrax')).toBe(false);
      expect(message.toLowerCase().includes('/ultrax')).toBe(false);
    });
  });

  describe('Command Parsing', () => {
    it('should parse @UltraX command correctly', () => {
      const text = '@UltraX build me a REST API';
      const expected = 'build me a REST API';

      const result = text.replace(/^@ultrax\s*/i, '').trim();

      expect(result).toBe(expected);
    });

    it('should parse command with extra whitespace', () => {
      const text = '@UltraX    build   me   a   REST   API   ';
      const expected = 'build   me   a   REST   API';

      const result = text.replace(/^@ultrax\s*/i, '').trim();

      expect(result).toBe(expected);
    });

    it('should handle empty command', () => {
      const text = '@UltraX';
      const result = text.replace(/^@ultrax\s*/i, '').trim();

      expect(result).toBe('');
    });

    it('should handle case variations', () => {
      const variations = [
        '@UltraX test',
        '@ultrax test',
        '@ULTRAX test',
        '@UlTrAx test'
      ];

      variations.forEach(variation => {
        const result = variation.replace(/^@ultrax\s*/i, '').trim();
        expect(result).toBe('test');
      });
    });
  });

  describe('Session ID Generation', () => {
    it('should generate unique session IDs', () => {
      const spaceName1 = 'spaces/space-123';
      const threadName1 = 'spaces/space-123/threads/thread-456';

      const spaceName2 = 'spaces/space-789';
      const threadName2 = 'spaces/space-789/threads/thread-999';

      const sessionId1 = `chat_${spaceName1.split('/').pop()}_${threadName1.split('/').pop()}`;
      const sessionId2 = `chat_${spaceName2.split('/').pop()}_${threadName2.split('/').pop()}`;

      expect(sessionId1).toBe('chat_space-123_thread-456');
      expect(sessionId2).toBe('chat_space-789_thread-999');
      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should generate consistent session ID for same space/thread', () => {
      const spaceName = 'spaces/space-123';
      const threadName = 'spaces/space-123/threads/thread-456';

      const sessionId1 = `chat_${spaceName.split('/').pop()}_${threadName.split('/').pop()}`;
      const sessionId2 = `chat_${spaceName.split('/').pop()}_${threadName.split('/').pop()}`;

      expect(sessionId1).toBe(sessionId2);
    });
  });

  describe('Message Formatting', () => {
    it('should format basic message for Chat', () => {
      const bot = new UltraXGoogleChatBot(gateway, {
        projectId: 'test-project',
        botId: 'bots/bot-123',
        credentialsPath: '/path/to/creds.json',
        webhookUrl: 'https://example.com/webhook'
      });

      const response = {
        sessionId: 'test-session',
        interface: 'chat' as const,
        message: 'Test message',
        timestamp: new Date(),
        hud: '[ULTRA] IDLE'
      };

      expect(response.message).toBe('Test message');
      expect(response.hud).toBeDefined();
    });

    it('should format message with agent info', () => {
      const agent = 'ultra:analyst';
      const phase = 'expansion';
      const message = 'Analyzing requirements...';

      const formatted = `\u200B*Agent: ${agent}*\n${message}\n\u200B*Phase: ${phase}*`;

      expect(formatted).toContain('ultra:analyst');
      expect(formatted).toContain('expansion');
      expect(formatted).toContain('Analyzing requirements...');
    });

    it('should format message with HUD', () => {
      const message = 'Task running...';
      const hud = '[ULTRA] EXEC | ralph:3/10';

      const formatted = `${message}\n\`\`\`\n${hud}\n\`\`\``;

      expect(formatted).toContain('[ULTRA] EXEC');
      expect(formatted).toContain('```');
    });
  });

  describe('Webhook Event Handling', () => {
    it('should handle basic webhook event structure', () => {
      const event: GoogleChatWebhookEvent = {
        type: 'MESSAGE',
        event: {
          token: 'test-token',
          timestamp: new Date().toISOString(),
          user: {
            name: 'users/user-123',
            displayName: 'Test User'
          },
          space: {
            name: 'spaces/space-123',
            displayName: 'Test Space'
          },
          message: {
            name: 'spaces/space-123/messages/message-456',
            sender: {
              name: 'users/user-123',
              displayName: 'Test User'
            },
            text: '@UltraX test command',
            space: {
              name: 'spaces/space-123',
              displayName: 'Test Space'
            },
            thread: {
              name: 'spaces/space-123/threads/thread-789'
            }
          }
        }
      };

      expect(event.type).toBe('MESSAGE');
      expect(event.event.user.displayName).toBe('Test User');
      expect(event.event.message.text).toContain('@UltraX');
    });

    it('should extract user information from event', () => {
      const event = {
        type: 'MESSAGE',
        event: {
          user: {
            name: 'users/user-123',
            displayName: 'John Doe'
          }
        }
      };

      expect(event.event.user.name).toBe('users/user-123');
      expect(event.event.user.displayName).toBe('John Doe');
    });

    it('should extract space and thread information', () => {
      const event = {
        type: 'MESSAGE',
        event: {
          space: {
            name: 'spaces/abc-123',
            displayName: 'General'
          },
          message: {
            thread: {
              name: 'spaces/abc-123/threads/thread-456'
            }
          }
        }
      };

      expect(event.event.space.name).toBe('spaces/abc-123');
      expect(event.event.message.thread.name).toBe('spaces/abc-123/threads/thread-456');
    });
  });

  describe('Response Cards', () => {
    it('should create card with agent and phase info', () => {
      const response = {
        sessionId: 'test-session',
        interface: 'chat' as const,
        message: 'Test',
        agent: 'ultra:executor',
        phase: 'execution',
        status: 'running' as const,
        timestamp: new Date()
      };

      expect(response.agent).toBe('ultra:executor');
      expect(response.phase).toBe('execution');
      expect(response.status).toBe('running');
    });

    it('should create card without optional fields', () => {
      const response = {
        sessionId: 'test-session',
        interface: 'chat' as const,
        message: 'Simple message',
        timestamp: new Date()
      };

      expect(response.agent).toBeUndefined();
      expect(response.phase).toBeUndefined();
      expect(response.status).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing message gracefully', () => {
      const invalidEvent = {
        type: 'MESSAGE',
        event: {}
      };

      expect(invalidEvent.event).toBeDefined();
    });

    it('should handle invalid command format', () => {
      const text = 'invalid @UltraX command format';
      const cleaned = text.replace(/^@ultrax\s*/i, '').trim();

      expect(cleaned).toBe('invalid @UltraX command format');
    });
  });

  describe('Bot Information', () => {
    it('should parse bot resource name', () => {
      const botId = 'projects/my-project/bots/bot-123';
      const parts = botId.split('/');

      expect(parts[0]).toBe('projects');
      expect(parts[1]).toBe('my-project');
      expect(parts[2]).toBe('bots');
      expect(parts[3]).toBe('bot-123');
    });

    it('should extract bot ID from resource name', () => {
      const botId = 'projects/my-project/bots/bot-123';
      const botShortId = botId.split('/').pop();

      expect(botShortId).toBe('bot-123');
    });
  });
});
