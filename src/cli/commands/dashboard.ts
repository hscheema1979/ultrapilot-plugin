/**
 * CLI Command: Start Mission Control Dashboard
 */

import { startDashboard } from '../../dashboard/index.js';

export async function dashboardCommand(): Promise<void> {
  try {
    await startDashboard();
  } catch (error) {
    console.error('Failed to start dashboard:', error);
    process.exit(1);
  }
}
