/**
 * Webhook Server Deployment Script
 *
 * Starts the webhook server for production use
 */

import { WebhookServer } from './webhook-server.js';
import { loadConfig } from '../execution/config.js';

async function main() {
  try {
    console.log(`[Deploy] Starting Ultrapilot Webhook Server...`);

    // Load configuration
    const config = loadConfig();

    // Validate required GitHub configuration
    if (!config.github?.webhookSecret) {
      throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required');
    }

    // Create and start server
    const server = new WebhookServer({
      port: config.server?.port || 3000,
      webhookSecret: config.github.webhookSecret,
      githubToken: config.github.token,
      path: '/webhook'
    });

    await server.start();

    console.log(`[Deploy] ✓ Webhook server is running`);
    console.log(`[Deploy] Press Ctrl+C to stop`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(`\n[Deploy] Shutting down gracefully...`);
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log(`\n[Deploy] Shutting down gracefully...`);
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error(`[Deploy] Failed to start server:`, error);
    process.exit(1);
  }
}

// Start the server
main();
