/**
 * UltraX Google Chat Bot
 *
 * Bidirectional integration between Google Chat and Ultrapilot agents.
 * Allows users to interact with agents through Google Chat interface.
 */

import { UltraXGateway, UltraXMessage, UltraXResponse } from './gateway.js';

// Try to import googleapis, but don't fail if not available
let google: any;
try {
  const googleapisModule = await import('googleapis');
  google = googleapisModule.google;
} catch (error) {
  console.warn('googleapis not installed. Google Chat features will be disabled.');
}

export interface GoogleChatConfig {
  projectId: string;
  botId: string;
  credentialsPath: string;
  webhookUrl: string;
}

export interface GoogleChatMessage {
  name: string;
  sender: {
    name: string;
    displayName: string;
  };
  text: string;
  space: {
    name: string;
    displayName: string;
  };
  thread: {
    name: string;
  };
}

export interface GoogleChatWebhookEvent {
  type: string;
  event: {
    token: string;
    timestamp: string;
    user: {
      name: string;
      displayName: string;
    };
    space: {
      name: string;
      displayName: string;
    };
    message: GoogleChatMessage;
  };
}

export class UltraXGoogleChatBot {
  private gateway: UltraXGateway;
  private chat: any;
  private config: GoogleChatConfig;

  constructor(
    gateway: UltraXGateway,
    config: GoogleChatConfig
  ) {
    this.gateway = gateway;
    this.config = config;

    // Initialize Google Chat API
    this.initializeChatAPI();
  }

  /**
   * Initialize Google Chat API client
   */
  private async initializeChatAPI(): Promise<void> {
    if (!google) {
      console.warn('Google Chat API not available');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: this.config.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/chat.bot']
    });

    this.chat = google.chat({ version: 'v1', auth });
  }

  /**
   * Handle incoming Google Chat webhook event
   */
  async handleWebhook(event: GoogleChatWebhookEvent): Promise<void> {
    try {
      // Extract message data
      const message = event.event.message;
      const userId = event.event.user.name;
      const text = message.text;

      // Check if message is directed at UltraX
      if (!this.isUltraXCommand(text)) {
        return; // Ignore non-UltraX messages
      }

      // Parse command (remove @UltraX mention)
      const command = this.parseCommand(text);

      // Create session ID
      const sessionId = this.createSessionId(message.space.name, message.thread.name);

      // Create UltraX message
      const ultraXMessage: UltraXMessage = {
        sessionId,
        userId,
        interface: 'chat',
        command,
        timestamp: new Date(),
        metadata: {
          spaceName: message.space.name,
          spaceDisplayName: message.space.displayName,
          threadName: message.thread.name,
          messageName: message.name
        }
      };

      // Handle message through gateway
      const response = await this.gateway.handleMessage(ultraXMessage);

      // Send response back to Google Chat
      await this.sendResponse(message, response);

    } catch (error) {
      console.error('Error handling Google Chat webhook:', error);

      // Send error message to Chat
      await this.sendErrorMessage(event.event.message, error);
    }
  }

  /**
   * Check if message is a command for UltraX
   */
  private isUltraXCommand(text: string): boolean {
    // Check for @UltraX mention or DM
    const patterns = [
      /^@ultrax/i,
      /^@ultrapilot/i,
      /^\/ultrax/i,
      /^\/ultrapilot/i
    ];

    return patterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Parse command from message text
   */
  private parseCommand(text: string): string {
    // Remove @UltraX mention and any extra whitespace
    const cleaned = text
      .replace(/^@ultrax\s*/i, '')
      .replace(/^@ultrapilot\s*/i, '')
      .replace(/^\/ultrax\s*/i, '')
      .replace(/^\/ultrapilot\s*/i, '')
      .trim();

    return cleaned || 'status';
  }

  /**
   * Create session ID from space and thread
   */
  private createSessionId(spaceName: string, threadName: string): string {
    // Extract unique IDs from Google Chat resource names
    const spaceId = spaceName.split('/').pop();
    const threadId = threadName.split('/').pop();
    return `chat_${spaceId}_${threadId}`;
  }

  /**
   * Send response to Google Chat
   */
  private async sendResponse(
    originalMessage: GoogleChatMessage,
    response: UltraXResponse
  ): Promise<void> {
    // Format message for Google Chat
    const formattedMessage = this.formatMessageForChat(response);

    // Send as reply in thread
    await this.chat.spaces.messages.create({
      parent: originalMessage.space.name,
      threadKey: originalMessage.thread.name,
      requestBody: {
        text: formattedMessage.text,
        cards: formattedMessage.cards
      }
    });
  }

  /**
   * Format UltraX response for Google Chat
   */
  private formatMessageForChat(response: UltraXResponse): {
    text: string;
    cards?: any[];
  } {
    // Base message
    let text = response.message;

    // Add agent info if present
    if (response.agent) {
      text = `\u200B*Agent: ${response.agent}*\n${text}`;
    }

    // Add phase info if present
    if (response.phase) {
      text = `${text}\n\u200B*Phase: ${response.phase}*`;
    }

    // Add HUD at bottom
    if (response.hud) {
      text = `${text}\n\`\`\`\n${response.hud}\n\`\`\``;
    }

    // Create rich cards for structured info
    const cards = this.createResponseCards(response);

    return { text, cards };
  }

  /**
   * Create response cards for Google Chat
   */
  private createResponseCards(response: UltraXResponse): any[] | undefined {
    if (!response.agent && !response.phase) {
      return undefined;
    }

    return [{
      header: {
        title: 'UltraX Status',
        imageUrl: 'https://example.com/ultrax-icon.png',
        imageType: 'CIRCLE'
      },
      sections: [{
        widgets: [
          {
            keyValue: {
              topLabel: 'Agent',
              content: response.agent || 'N/A'
            }
          },
          {
            keyValue: {
              topLabel: 'Phase',
              content: response.phase || 'N/A'
            }
          },
          {
            keyValue: {
              topLabel: 'Status',
              content: response.status || 'unknown'
            }
          },
          {
            buttons: [
              {
                textButton: {
                  text: 'View Details',
                  onClick: {
                    openLink: {
                      url: `http://localhost:3000/session/${response.sessionId}`
                    }
                  }
                }
              },
              {
                textButton: {
                  text: 'Cancel',
                  onClick: {
                    action: {
                      actionMethodName: 'cancel',
                      parameters: [{ key: 'sessionId', value: response.sessionId }]
                    }
                  }
                }
              }
            ]
          }
        ]
      }]
    }];
  }

  /**
   * Send error message to Google Chat
   */
  private async sendErrorMessage(
    originalMessage: GoogleChatMessage,
    error: any
  ): Promise<void> {
    const errorMessage = `❌ Error: ${error.message || 'Unknown error'}`;

    await this.chat.spaces.messages.create({
      parent: originalMessage.space.name,
      threadKey: originalMessage.thread.name,
      requestBody: {
        text: errorMessage
      }
    });
  }

  /**
   * Proactively send message to Google Chat (e.g., agent updates)
   */
  async sendMessage(
    spaceName: string,
    threadName: string,
    message: string,
    cards?: any[]
  ): Promise<void> {
    await this.chat.spaces.messages.create({
      parent: spaceName,
      threadKey: threadName,
      requestBody: {
        text: message,
        cards
      }
    });
  }

  /**
   * Get bot information
   */
  async getBotInfo(): Promise<{
    name: string;
    displayName: string;
    avatarUrl?: string;
  }> {
    const response = await this.chat.dms.get({
      name: this.config.botId
    });

    return {
      name: response.data.name,
      displayName: response.data.displayName,
      avatarUrl: response.data.avatarUrl
    };
  }
}

/**
 * Start Google Chat webhook server
 */
export async function startGoogleChatWebhook(options: {
  port?: number;
  gateway: UltraXGateway;
  chatConfig: GoogleChatConfig;
}): Promise<UltraXGoogleChatBot> {
  const { port = 3002, gateway, chatConfig } = options;

  const bot = new UltraXGoogleChatBot(gateway, chatConfig);

  console.log(`Google Chat webhook server listening on port ${port}`);
  console.log(`Bot ID: ${chatConfig.botId}`);

  // Express server setup would go here
  // For now, export bot instance for external server use
  return bot;
}
