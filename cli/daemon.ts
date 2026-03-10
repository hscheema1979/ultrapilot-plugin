#!/usr/bin/env node

/**
 * Agent Monitor Daemon CLI
 *
 * Usage:
 *   npm run daemon:start
 *   npm run daemon:status
 *   npm run daemon:stop
 */

import { createAndStartDaemon } from '../src/executive/agent-monitor-daemon.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN environment variable is required');
  console.error('Please set GITHUB_TOKEN or GH_TOKEN before running the daemon');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting Agent Monitor Daemon...');
  console.log('📡 Monitoring repositories:');
  console.log('   • hscheema1979/control-room');
  console.log('   • hscheema1979/ultrapilot-dashboard');
  console.log('   • hscheema1979/hscheema1979');
  console.log('');

  try {
    const daemon = await createAndStartDaemon(GITHUB_TOKEN);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await daemon.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully...');
      await daemon.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
