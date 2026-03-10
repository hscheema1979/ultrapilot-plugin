#!/usr/bin/env node
/**
 * UltraPilot Autoloop CLI Command
 *
 * Start the persistent 60-second heartbeat daemon for autonomous domain management.
 * Each workspace has its own autoloop that never stops.
 *
 * Usage:
 *   /ultra-autoloop                Start autoloop daemon
 *   /ultra-autoloop --stop          Stop running autoloop
 *   /ultra-autoloop --status        Check autoloop status
 *   /ultra-autoloop --force-cycle   Force immediate cycle
 */

import { runAutoloopDaemon } from '../../dist/domain/AutoloopDaemon.js';
import { existsSync } from 'fs';
import * as path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CliOptions {
  stop?: boolean;
  status?: boolean;
  forceCycle?: boolean;
  help?: boolean;
  background?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stop') {
      options.stop = true;
    } else if (arg === '--status') {
      options.status = true;
    } else if (arg === '--force-cycle') {
      options.forceCycle = true;
    } else if (arg === '--background' || arg === '-d') {
      options.background = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Show help
  if (options.help) {
    console.log(`
UltraPilot Autoloop - Persistent heartbeat daemon for autonomous domain management

Usage:
  /ultra-autoloop              Start autoloop daemon (foreground)
  /ultra-autoloop --background  Start autoloop daemon (background, detached)
  /ultra-autoloop --stop        Stop running autoloop daemon
  /ultra-autoloop --status      Check autoloop status
  /ultra-autoloop --force-cycle Force immediate heartbeat cycle

Examples:
  /ultra-autoloop
  /ultra-autoloop --background
  /ultra-autoloop --status

The autoloop runs a persistent 60-second heartbeat cycle that:
  • Processes tasks from queues
  • Executes routine maintenance tasks
  • Coordinates agent activities
  • Updates domain heartbeat state
  • Never stops until explicitly stopped

"The boulder never stops." 🪨

For more information, see: https://github.com/ultrapilot/ultrapilot-plugin
`);
    process.exit(0);
  }

  const ultraPath = path.join(process.cwd(), '.ultra');
  const autoloopStatePath = path.join(ultraPath, 'state', 'autoloop.json');

  // Check if domain is initialized
  if (!existsSync(ultraPath)) {
    console.error('❌ Domain not initialized. Run /ultra-domain-setup first.');
    process.exit(1);
  }

  // Stop mode
  if (options.stop) {
    if (!existsSync(autoloopStatePath)) {
      console.log('ℹ️  Autoloop not running');
      process.exit(0);
    }

    const state = JSON.parse(readFileSync(autoloopStatePath, 'utf-8'));
    if (!state.enabled || !state.pid) {
      console.log('ℹ️  Autoloop not running');
      process.exit(0);
    }

    console.log(`🛑 Stopping autoloop daemon (PID: ${state.pid})...`);

    try {
      // Kill the process
      process.kill(state.pid, 'SIGTERM');

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force kill if still running
      try {
        process.kill(state.pid, 0); // Check if process exists
        console.log('⚠️  Process still running, forcing SIGKILL...');
        process.kill(state.pid, 'SIGKILL');
      } catch {
        // Process doesn't exist, that's fine
      }

      // Update state
      state.enabled = false;
      state.pid = null;
      state.startedAt = null;
      writeFileSync(autoloopStatePath, JSON.stringify(state, null, 2));

      console.log('✅ Autoloop daemon stopped');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error stopping autoloop:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Status mode
  if (options.status) {
    console.log('🔍 Autoloop Status\n');

    if (!existsSync(autoloopStatePath)) {
      console.log('Status: Not initialized');
      process.exit(0);
    }

    const autoloopState = JSON.parse(readFileSync(autoloopStatePath, 'utf-8'));
    const heartbeatPath = path.join(ultraPath, 'state', 'heartbeat.json');
    const heartbeatState = existsSync(heartbeatPath)
      ? JSON.parse(readFileSync(heartbeatPath, 'utf-8'))
      : null;

    console.log(`Enabled: ${autoloopState.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`PID: ${autoloopState.pid || 'N/A'}`);

    if (autoloopState.startedAt) {
      const uptime = Date.now() - new Date(autoloopState.startedAt).getTime();
      const uptimeMinutes = Math.floor(uptime / 60000);
      console.log(`Started: ${new Date(autoloopState.startedAt).toLocaleString()}`);
      console.log(`Uptime: ${uptimeMinutes} minutes`);
    }

    console.log(`Cycles: ${autoloopState.cycleCount}`);

    if (autoloopState.lastCycle) {
      const lastCycle = new Date(autoloopState.lastCycle);
      const secondsAgo = Math.floor((Date.now() - lastCycle.getTime()) / 1000);
      console.log(`Last cycle: ${lastCycle.toLocaleString()} (${secondsAgo}s ago)`);
    }

    if (heartbeatState) {
      console.log(`\nHeartbeat: ${heartbeatState.status}`);
      console.log(`Tasks processed: ${heartbeatState.tasksProcessed}`);
      if (heartbeatState.lastError) {
        console.log(`Last error: ${heartbeatState.lastError}`);
      }
    }

    // Check if process is actually running
    if (autoloopState.pid) {
      try {
        process.kill(autoloopState.pid, 0); // Check if process exists
        console.log(`\n✅ Process running (PID: ${autoloopState.pid})`);
      } catch {
        console.log(`\n⚠️  Process dead (stale state)`);
      }
    }

    process.exit(0);
  }

  // Force cycle mode
  if (options.forceCycle) {
    if (!existsSync(autoloopStatePath)) {
      console.error('❌ Autoloop not running. Start it first with /ultra-autoloop');
      process.exit(1);
    }

    const state = JSON.parse(readFileSync(autoloopStatePath, 'utf-8'));
    if (!state.enabled || !state.pid) {
      console.error('❌ Autoloop not running. Start it first with /ultra-autoloop');
      process.exit(1);
    }

    console.log('⚡ Forcing immediate heartbeat cycle...');
    // TODO: Implement IPC to signal running daemon to force cycle
    console.log('ℹ️  Feature not yet implemented. Use SIGUSR1 to force cycle.');
    process.exit(0);
  }

  // Start mode (default)
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-AUTOLOOP                                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Starting persistent heartbeat daemon...                     ║
║                                                               ║
║  Workspace: ${process.cwd().substring(0, 40).padEnd(40)}║
║                                                               ║
║  The autoloop will:                                          ║
║  • Run a 60-second heartbeat cycle                           ║
║  • Process tasks from queues                                 ║
║  • Execute routine maintenance tasks                         ║
║  • Coordinate agent activities                               ║
║  • Never stop until explicitly stopped                       ║
║                                                               ║
║  "The boulder never stops." 🪨                               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Background mode
  if (options.background) {
    console.log('Starting in background mode...\n');

    try {
      // Start as detached background process
      const { spawn } = await import('child_process');
      const logFile = path.join(ultraPath, 'state', 'autoloop.log');

      const child = spawn(process.argv[0], [process.argv[1]], {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          ...process.env,
          ULTRAPILOT_AUTOLOOP: 'true',
          ULTRAPILOT_LOG_FILE: logFile
        }
      });

      child.unref();

      // Write PID file
      const pidFile = path.join(ultraPath, 'state', 'autoloop.pid');
      writeFileSync(pidFile, String(child.pid));

      console.log(`✅ Autoloop daemon started in background`);
      console.log(`   PID: ${child.pid}`);
      console.log(`   Logs: ${logFile}`);
      console.log('');
      console.log('To stop the daemon:');
      console.log(`  /ultra-autoloop --stop`);
      console.log('');
      console.log('To check status:');
      console.log(`  /ultra-autoloop --status`);

      process.exit(0);

    } catch (error) {
      console.error('❌ Error starting autoloop:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Foreground mode (default)
  try {
    await runAutoloopDaemon(process.cwd());
  } catch (error) {
    console.error('❌ Error running autoloop:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
