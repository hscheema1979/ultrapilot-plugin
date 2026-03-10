/**
 * UltraX Express Server
 *
 * HTTP/WebSocket server for:
 * - Web UI integration (Relay on port 3000)
 * - Google Chat webhooks
 * - Gateway REST API
 * - WebSocket event streaming (AgentMessageBus integration)
 */

import express, { Request, Response } from 'express';
import { WebSocket } from 'ws';  // CORRECT: Import WebSocket class, not ws namespace
import { UltraXGateway, UltraXMessage, UltraXResponse } from './gateway.js';
import { UltraXGoogleChatBot, GoogleChatConfig, GoogleChatWebhookEvent } from './chat-bot.js';
import gatewayACL from './access-control.js';
import { AgentMessageBus } from './agent-comms/AgentMessageBus.js';

export interface ServerConfig {
  port?: number;
  ulrapilotPath?: string;
  statePath?: string;
  googleChat?: GoogleChatConfig;
  relayUrl?: string;
}

export interface GatewayRequest {
  sessionId: string;
  userId: string;
  interface: 'web' | 'chat' | 'cli';
  command: string;
  metadata?: Record<string, any>;
}

export interface GatewayErrorResponse {
  error: string;
  message: string;
  timestamp: Date;
}

export class UltraXServer {
  private app: express.Application;
  private httpServer: any; // HTTP server returned by app.listen
  private wsServer?: any; // WebSocket server (attached to HTTP server)
  private gateway: UltraXGateway;
  private agentMessageBus: AgentMessageBus;
  private chatBot?: UltraXGoogleChatBot;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: config.port || 3001,
      ulrapilotPath: config.ulrapilotPath,
      statePath: config.statePath,
      googleChat: config.googleChat,
      relayUrl: config.relayUrl || 'http://localhost:3000'
    };

    // Initialize gateway
    this.gateway = new UltraXGateway({
      ulrapilotPath: this.config.ulrapilotPath,
      statePath: this.config.statePath,
      sessionTimeout: 60 * 60 * 1000 // 1 hour
    });

    // Initialize AgentMessageBus for WebSocket event streaming
    this.agentMessageBus = new AgentMessageBus();

    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // Initialize Google Chat bot if configured
    if (this.config.googleChat) {
      this.chatBot = new UltraXGoogleChatBot(this.gateway, this.config.googleChat);
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS for Relay integration
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', this.config.relayUrl || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });

    // JSON parsing with error handling
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // JSON parsing error handler
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
          error: 'Invalid JSON',
          message: err.message,
          timestamp: new Date()
        } as GatewayErrorResponse);
      }
      next();
    });
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Access control middleware for Gateway endpoints
    const checkAccess = (req: Request, res: Response, next: any) => {
      const relayId = (Array.isArray(req.headers['x-relay-id']) ? req.headers['x-relay-id'][0] : req.headers['x-relay-id']) || 'unknown';
      const hostname = (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || req.socket.remoteAddress || 'unknown';

      // Check if this Relay is allowed
      if (!gatewayACL.isAllowed(relayId as string, hostname as string)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Relay instance not authorized',
          relayId,
          hostname,
          timestamp: new Date()
        });
      }

      next();
    };

    // Root endpoint - API information (no access control)
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'UltraX Server',
        version: '1.0.0',
        description: 'Ultrapilot Gateway for Web UI and Google Chat',
        endpoints: {
          health: 'GET /health',
          gateway: 'POST /api/gateway',
          sessions: 'GET /api/session/:sessionId',
          relayCommands: 'GET /api/relay/commands',
          relaySessions: 'GET /api/relay/sessions/:userId',
          googleChatWebhook: 'POST /webhook/google-chat'
        },
        documentation: 'https://github.com/hscheema1979/ultrapilot',
        status: '/health',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sessions: this.gateway['sessions'].size
      });
    });

    // Workspace federation endpoint
    this.app.get('/api/workspaces', async (req: Request, res: Response) => {
      try {
        const { getPeerWorkspaces } = await import('./workspace-federation.js');
        const workspaces = await getPeerWorkspaces();
        res.json({
          workspaces,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to get workspaces',
          message: error.message,
          timestamp: new Date()
        });
      }
    });

    // Gateway endpoint for Web UI
    this.app.post('/api/gateway', async (req: Request, res: Response) => {
      try {
        const gatewayReq: GatewayRequest = req.body;

        // Validate request
        if (!gatewayReq.sessionId || !gatewayReq.userId || !gatewayReq.command) {
          return res.status(400).json({
            error: 'Missing required fields',
            timestamp: new Date()
          } as GatewayErrorResponse);
        }

        // Create UltraX message
        const message: UltraXMessage = {
          sessionId: gatewayReq.sessionId,
          userId: gatewayReq.userId,
          interface: gatewayReq.interface || 'web',
          command: gatewayReq.command,
          timestamp: new Date(),
          metadata: gatewayReq.metadata
        };

        // Handle message through gateway
        const response: UltraXResponse = await this.gateway.handleMessage(message);

        res.json(response);

      } catch (error: any) {
        console.error('Gateway error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
          timestamp: new Date()
        } as GatewayErrorResponse);
      }
    });

    // Session status endpoint
    this.app.get('/api/session/:sessionId', (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const status = this.gateway.getSessionStatus(sessionId as string);
      res.json(status);
    });

    // Terminate session endpoint
    this.app.delete('/api/session/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        await this.gateway.terminateSession(sessionId as string);
        res.json({ success: true, sessionId });
      } catch (error: any) {
        res.status(404).json({
          error: 'Session not found',
          message: error.message,
          timestamp: new Date()
        } as GatewayErrorResponse);
      }
    });

    // Switch session interface endpoint
    this.app.post('/api/session/:sessionId/switch', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { targetInterface } = req.body;

        if (!['web', 'chat', 'cli'].includes(targetInterface)) {
          return res.status(400).json({
            error: 'Invalid interface',
            message: 'Interface must be web, chat, or cli',
            timestamp: new Date()
          } as GatewayErrorResponse);
        }

        await this.gateway.switchSession(sessionId as string, targetInterface);
        res.json({ success: true, sessionId, targetInterface });

      } catch (error: any) {
        res.status(404).json({
          error: 'Session switch failed',
          message: error.message,
          timestamp: new Date()
        } as GatewayErrorResponse);
      }
    });

    // Google Chat webhook endpoint
    this.app.post('/webhook/google-chat', async (req: Request, res: Response) => {
      try {
        if (!this.chatBot) {
          return res.status(503).json({
            error: 'Google Chat bot not configured',
            timestamp: new Date()
          } as GatewayErrorResponse);
        }

        const event: GoogleChatWebhookEvent = req.body;

        // Handle webhook asynchronously
        this.chatBot.handleWebhook(event).catch(error => {
          console.error('Google Chat webhook error:', error);
        });

        // Return immediately (webhooks should be fast)
        res.status(200).send('OK');

      } catch (error: any) {
        console.error('Google Chat webhook error:', error);
        res.status(500).json({
          error: 'Webhook processing failed',
          message: error.message,
          timestamp: new Date()
        } as GatewayErrorResponse);
      }
    });

    // Relay integration endpoint (for Relay UI to fetch Ultrapilot commands)
    this.app.get('/api/relay/commands', (req: Request, res: Response) => {
      res.json({
        commands: [
          { name: '/ultrapilot', description: 'Full autonomous execution' },
          { name: '/ultra-team', description: 'Coordinate parallel agents' },
          { name: '/ultra-ralph', description: 'Persistent execution loop' },
          { name: '/ultra-review', description: 'Multi-dimensional review' },
          { name: '/ultra-hud', description: 'Configure HUD display' },
          { name: '/ultra-cancel', description: 'Cancel active mode' }
        ]
      });
    });

    // Relay session list endpoint
    this.app.get('/api/relay/sessions/:userId', (req: Request, res: Response) => {
      const { userId } = req.params;
      const sessions = Array.from(this.gateway['sessions'].values())
        .filter(s => s.userId === userId)
        .map(s => ({
          sessionId: s.sessionId,
          interface: s.interface,
          startTime: s.startTime,
          lastActivity: s.lastActivity,
          currentPhase: s.currentPhase,
          activeAgents: s.activeAgents
        }));

      res.json({ sessions });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`,
        timestamp: new Date()
      } as GatewayErrorResponse);
    });

    // Error handler
    this.app.use((err: any, req: Request, res: Response, next: any) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date()
      } as GatewayErrorResponse);
    });
  }

  /**
   * Attach WebSocket server for real-time event streaming
   *
   * Implements WebSocket upgrade path on existing HTTP server.
   * WebSocket clients can subscribe to AgentMessageBus topics.
   */
  private attachWebSocket(): void {
    // Create WebSocket server
    this.wsServer = new (require('ws')).Server({
      noServer: true,
      path: '/messages/stream'
    });

    // Intercept HTTP upgrade requests
    this.httpServer.on('upgrade', (request: any, socket: any, head: any) => {
      const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

      if (pathname === '/messages/stream') {
        // Handle WebSocket upgrade
        this.wsServer.handleUpgrade(request, socket, head, (ws: any) => {
          this.wsServer.emit('connection', ws, request);
        });
      } else {
        // Not a WebSocket request - close socket
        socket.destroy();
      }
    });

    // Handle WebSocket connections
    this.wsServer.on('connection', (wsClient: WebSocket) => {
      console.log(`🔌 WebSocket client connected`);

      // Handle incoming messages from client
      wsClient.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'subscribe' && msg.topic) {
            // Subscribe to AgentMessageBus topic
            this.agentMessageBus.subscribeWebSocket(wsClient, msg.topic);
            console.log(`✓ Client subscribed to: ${msg.topic}`);
          } else if (msg.type === 'unsubscribe' && msg.topic) {
            // Unsubscribe from topic
            this.agentMessageBus.unsubscribeWebSocket(wsClient, msg.topic);
            console.log(`✓ Client unsubscribed from: ${msg.topic}`);
          } else {
            // Invalid message type
            wsClient.close(1008, 'Invalid message format');
          }
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
          wsClient.close(1008, 'Invalid message format');
        }
      });

      // Handle client disconnect
      wsClient.on('close', () => {
        console.log(`🔌 WebSocket client disconnected`);
      });

      // Handle errors
      wsClient.on('error', (error: any) => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      try {
        wsClient.send(JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString(),
          message: 'Connected to UltraX WebSocket server'
        }));
      } catch (error) {
        // Client already disconnected
      }
    });

    // Listen for AgentMessageBus broadcasts and forward to WebSocket clients
    this.agentMessageBus.on('websocket:broadcast', ({ wsClientId, topic, message }: any) => {
      // Find the WebSocket client and send message
      // In production, we'd maintain a mapping from wsClientId to ws instance
      this.wsServer.clients.forEach((client: any) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          try {
            client.send(JSON.stringify(message));
          } catch (error) {
            // Send failed, client might be disconnected
          }
        }
      });
    });

    console.log(`📡 WebSocket server attached: /messages/stream`);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const port = this.config.port || 3001;
    // Default to 0.0.0.0 for Tailscale alias and external access
    const host = process.env.HOST || '0.0.0.0';

    return new Promise((resolve) => {
      // Store HTTP server reference for WebSocket upgrade
      this.httpServer = this.app.listen(port, host, () => {
        console.log(`\n🚀 UltraX Server started`);
        console.log(`📡 HTTP API: http://${host}:${port}`);
        console.log(`🔌 Gateway: /api/gateway`);
        console.log(`💬 Google Chat Webhook: /webhook/google-chat`);
        console.log(`🌐 Relay Integration: ${this.config.relayUrl}`);

        // Attach WebSocket server to HTTP server
        this.attachWebSocket();

        console.log(`\n✨ Ready to accept connections\n`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    console.log('UltraX Server stopping...');

    // Close WebSocket connections first
    if (this.wsServer) {
      console.log('📡 Closing WebSocket connections...');
      this.wsServer.clients.forEach((client: any) => {
        client.close(1001, 'Server shutting down');
      });
      this.wsServer.close();
    }

    // HTTP server will be stopped when process exits
    console.log('✓ UltraX Server stopped');
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Get gateway (for testing)
   */
  getGateway(): UltraXGateway {
    return this.gateway;
  }
}

/**
 * Start UltraX server with configuration
 */
export async function startServer(config: ServerConfig = {}): Promise<UltraXServer> {
  const server = new UltraXServer(config);
  await server.start();
  return server;
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3001'),
    relayUrl: process.env.RELAY_URL || 'http://localhost:3000',
    googleChat: process.env.GOOGLE_CHAT_ENABLED === 'true' ? {
      projectId: process.env.GOOGLE_PROJECT_ID || '',
      botId: process.env.GOOGLE_BOT_ID || '',
      credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || '',
      webhookUrl: process.env.GOOGLE_WEBHOOK_URL || ''
    } : undefined
  };

  startServer(config).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
