#!/usr/bin/env node
/**
 * UltraPilot Domain Status CLI Command
 *
 * Show status of domain processes.
 *
 * Usage:
 *   /ultra-domain-status                   Show current domain status
 *   /ultra-domain-status --path <path>     Show domain status at path
 *   /ultra-domain-status --all              Show all running domains
 */

import { createDomainProcessManager } from '../../dist/domain/DomainProcessManager.js';
import { existsSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { readFileSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);
  let domainPath: string | null = null;
  let showAll = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' || args[i] === '-p') {
      domainPath = args[++i];
    } else if (args[i] === '--all' || args[i] === '-a') {
      showAll = true;
    }
  }

  if (showAll) {
    await showAllDomains();
    return;
  }

  // Show single domain status
  const targetPath = domainPath || process.cwd();
  const domainJsonPath = path.join(targetPath, '.ultra', 'domain.json');

  // Check if domain exists
  if (!existsSync(domainJsonPath)) {
    console.error(`❌ No domain found at: ${targetPath}`);
    process.exit(1);
  }

  // Load domain config
  const domainConfig = JSON.parse(readFileSync(domainJsonPath, 'utf-8'));
  const domainName = domainConfig.name;
  const domainId = domainConfig.domainId;

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-STATUS                                        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Domain: ${domainName.padEnd(40)}║
║  ID: ${domainId.padEnd(47)}║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Detect process manager
  const processInfoPath = path.join(targetPath, '.ultra', 'state', 'process-info.json');
  let manager: 'tmux' | 'pm2' | 'none' = 'none';

  if (existsSync(processInfoPath)) {
    const processInfo = JSON.parse(readFileSync(processInfoPath, 'utf-8'));
    manager = processInfo.manager || 'none';
  }

  try {
    const processManager = createDomainProcessManager({
      domainPath: targetPath,
      domainName,
      domainId,
      processManager: manager
    });

    const status = processManager.getStatus();

    console.log('📋 Process Status:');
    console.log('─────────────────────────────────');

    for (const proc of status) {
      const statusIcon = proc.status === 'running' ? '✅' : '❌';
      const statusText = proc.status.toUpperCase().padEnd(8);
      const pidText = proc.pid ? `PID: ${proc.pid}`.padEnd(15) : ''.padEnd(15);

      console.log(`  ${statusIcon} ${proc.name}`);
      console.log(`     Status: ${statusText} ${pidText}`);
      console.log(`     Last Check: ${proc.lastCheck}`);
      console.log('');
    }

    // Show queue status
    const intakePath = path.join(targetPath, '.ultra', 'queues', 'intake.json');
    const inProgressPath = path.join(targetPath, '.ultra', 'queues', 'in-progress.json');
    const completedPath = path.join(targetPath, '.ultra', 'queues', 'completed.json');

    if (existsSync(intakePath)) {
      const intake = JSON.parse(readFileSync(intakePath, 'utf-8'));
      const inProgress = existsSync(inProgressPath) ? JSON.parse(readFileSync(inProgressPath, 'utf-8')) : [];
      const completed = existsSync(completedPath) ? JSON.parse(readFileSync(completedPath, 'utf-8')) : [];

      console.log('📦 Queue Status:');
      console.log('─────────────────────────────────');
      console.log(`  Intake: ${intake.length} tasks`);
      console.log(`  In Progress: ${inProgress.length} tasks`);
      console.log(`  Completed: ${completed.length} tasks`);
      console.log('');
    }

    // Show autoloop health
    const autoloopPath = path.join(targetPath, '.ultra', 'state', 'autoloop.json');
    if (existsSync(autoloopPath)) {
      const autoloop = JSON.parse(readFileSync(autoloopPath, 'utf-8'));

      console.log('💓 Autoloop Health:');
      console.log('─────────────────────────────────');
      console.log(`  Status: ${autoloop.enabled ? '🟢 Running' : '⚫ Stopped'}`);
      if (autoloop.enabled) {
        console.log(`  Cycles: ${autoloop.cycleCount}`);
        console.log(`  Last Cycle: ${autoloop.lastCycle || 'Never'}`);
        if (autoloop.lastCycleDuration) {
          console.log(`  Duration: ${autoloop.lastCycleDuration}ms`);
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error getting status:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Show all running domains
 */
async function showAllDomains() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-STATUS (ALL DOMAINS)                         ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Common domain locations
  const searchPaths = [
    process.cwd(),
    path.join(process.cwd(), 'projects'),
    path.join(process.cwd(), 'domains'),
    '/home/ubuntu/remote'
  ];

  let foundDomains = 0;

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    const entries = readdirSync(searchPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const domainPath = path.join(searchPath, entry.name);
      const domainJsonPath = path.join(domainPath, '.ultra', 'domain.json');

      if (!existsSync(domainJsonPath)) continue;

      try {
        const domainConfig = JSON.parse(readFileSync(domainJsonPath, 'utf-8'));
        const autoloopPath = path.join(domainPath, '.ultra', 'state', 'autoloop.json');
        const autoloop = existsSync(autoloopPath) ? JSON.parse(readFileSync(autoloopPath, 'utf-8')) : null;

        const status = autoloop?.enabled ? '🟢 Running' : '⚫ Stopped';
        const cycles = autoloop?.cycleCount || 0;

        console.log(`  ${status} ${domainConfig.name}`);
        console.log(`     Path: ${domainPath}`);
        console.log(`     Type: ${domainConfig.type}`);
        console.log(`     Cycles: ${cycles}`);
        console.log('');

        foundDomains++;
      } catch (e) {
        // Skip invalid domains
      }
    }
  }

  if (foundDomains === 0) {
    console.log('  No domains found');
    console.log('');
    console.log('  To create a domain, run: /ultra-domain-setup');
  } else {
    console.log(`  Found ${foundDomains} domain(s)`);
  }
}

main();
