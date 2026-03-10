/**
 * Mission Control Dashboard - Main Export
 */

import { DashboardServer } from './server';

export { DashboardServer } from './server';
export * from './types';

/**
 * Start the dashboard server
 */
export async function startDashboard(): Promise<void> {
  const server = new DashboardServer();
  server.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Mission Control Dashboard...');
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down Mission Control Dashboard...');
    server.stop();
    process.exit(0);
  });
}
