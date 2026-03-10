/**
 * Webhook Server
 *
 * Express.js server for receiving GitHub webhooks
 * Features:
 * - HMAC signature verification
 * - Event routing
 * - Agent handler orchestration
 * - Error handling
 */

import express from 'express';
import { verifyWebhookSignature } from './middleware/auth.js';
import { WebhookHandler } from '../github/webhook-handler.js';

export interface WebhookServerConfig {
  port: number;
  webhookSecret: string;
  githubToken?: string;
  githubAppId?: string;
  githubPrivateKey?: string;
  owner?: string;
  repo?: string;
  path?: string;
}

/**
 * Webhook Server
 */
export class WebhookServer {
  private app: express.Application;
  private server: any;
  private config: WebhookServerConfig;
  private webhookHandler: WebhookHandler;

  constructor(config: WebhookServerConfig) {
    this.config = config;

    // Validate configuration
    if (!config.webhookSecret) {
      throw new Error('GITHUB_WEBHOOK_SECRET is required');
    }

    // Initialize Express app
    this.app = express();

    // Initialize webhook handler with GitHub context
    this.webhookHandler = new WebhookHandler(
      config.githubToken,
      config.owner,
      config.repo
    );

    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Raw body parser for signature verification
    this.app.use(
      this.config.path || '/webhook',
      express.raw({ type: 'application/json' })
    );

    // JSON parser for other routes
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[WebhookServer] ${req.method} ${req.path}`);
      next();
    });

    // Error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error(`[WebhookServer] Error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    const webhookPath = this.config.path || '/webhook';

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Webhook endpoint
    this.app.post(webhookPath, async (req, res) => {
      try {
        // Verify signature
        const signature = req.headers['x-hub-signature-256'] as string;

        if (!signature) {
          console.warn(`[WebhookServer] Missing signature header`);
          return res.status(401).json({ error: 'Missing signature' });
        }

        const isValid = verifyWebhookSignature(
          req.body,
          signature,
          this.config.webhookSecret
        );

        if (!isValid) {
          console.warn(`[WebhookServer] Invalid signature`);
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Parse webhook event
        const event = req.headers['x-github-event'] as string;
        const deliveryId = req.headers['x-github-delivery'] as string;

        console.log(`[WebhookServer] Received ${event} event (${deliveryId})`);

        // Parse payload
        const payload = JSON.parse(req.body.toString());

        // Handle webhook
        await this.webhookHandler.handleWebhook(event, payload);

        // Respond with 200 OK
        res.status(200).json({ received: true });

      } catch (error) {
        console.error(`[WebhookServer] Error handling webhook:`, error);

        // Still return 200 to avoid GitHub retry loops
        res.status(200).json({
          received: true,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`[WebhookServer] Listening on port ${this.config.port}`);
        console.log(`[WebhookServer] Webhook endpoint: http://localhost:${this.config.port}${this.config.path || '/webhook'}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: any) => {
          if (err) {
            reject(err);
          } else {
            console.log(`[WebhookServer] Server stopped`);
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}
