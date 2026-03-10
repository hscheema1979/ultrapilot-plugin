#!/usr/bin/env node
/**
 * UltraPilot Domain Start CLI Command
 *
 * Start a domain's autoloop and ultra-lead processes.
 * Uses tmux or pm2 for process management.
 *
 * Usage:
 *   /ultra-domain-start                    Start current domain
 *   /ultra-domain-start --path <path>      Start domain at path
 *   /ultra-domain-start --manager <type>   Use tmux, pm2, or none
 */

import { createDomainProcessManager } from '../../dist/domain/DomainProcessManager.js';
import { existsSync } from 'fs';
import * as path from 'path';
import { readFileSync } from 'fs';

interface CliOptions {
  path?: string;
  manager?: 'tmux' | 'pm2' | 'none';
  help?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--path' || arg === '-p') {
      options.path = args[++i];
    } else if (arg === '--manager' || arg === '-m') {
      options.manager = args[++i] as 'tmux' | 'pm2' | 'none';
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Show help
  if (options.help) {
    console.log(`
UltraPilot Domain Start - Start domain processes

Usage:
  /ultra-domain-start                    Start domain in current directory
  /ultra-domain-start --path <path>      Start domain at specific path
  /ultra-domain-start --manager <type>   Process manager: tmux, pm2, none

Process Managers:
  tmux   - Run in tmux sessions (recommended for development)
  pm2    - Run with pm2 process manager (recommended for production)
  none   - Run as standalone background processes

Examples:
  /ultra-domain-start
  /ultra-domain-start --path ~/projects/trading-at --manager tmux
  /ultra-domain-start -m pm2

For more information, see: https://github.com/ultrapilot/ultrapilot-plugin
`);
    process.exit(0);
  }

  // Determine domain path
  const domainPath = options.path || process.cwd();
  const domainJsonPath = path.join(domainPath, '.ultra', 'domain.json');

  // Check if domain exists
  if (!existsSync(domainJsonPath)) {
    console.error(`❌ No domain found at: ${domainPath}`);
    console.error(`   Run /ultra-domain-setup first to initialize the domain`);
    process.exit(1);
  }

  // Load domain config
  const domainConfig = JSON.parse(readFileSync(domainJsonPath, 'utf-8'));
  const domainName = domainConfig.name;
  const domainId = domainConfig.domainId;

  // Determine process manager
  const manager = options.manager || detectBestManager();

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-START                                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Starting domain processes...                               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    const processManager = createDomainProcessManager({
      domainPath,
      domainName,
      domainId,
      processManager: manager
    });

    await processManager.startDomain();

    console.log('');
    console.log('📋 Domain Status:');
    console.log('─────────────────────────────────');

    const status = processManager.getStatus();
    for (const proc of status) {
      const statusIcon = proc.status === 'running' ? '✅' : '❌';
      console.log(`  ${statusIcon} ${proc.name}: ${proc.status}`);
    }

    console.log('');
    console.log('Next steps:');
    if (manager === 'tmux') {
      console.log(`  1. Attach to autoloop: tmux attach -t ${domainName}-autoloop`);
      console.log(`  2. Attach to ultra-lead: tmux attach -t ${domainName}-lead`);
      console.log(`  3. List sessions: tmux ls`);
    } else if (manager === 'pm2') {
      console.log(`  1. Check status: pm2 status`);
      console.log(`  2. View logs: pm2 logs ${domainName}-autoloop`);
      console.log(`  3. Monitor: pm2 mon`);
    } else {
      console.log(`  1. Check status: /ultra-domain-status`);
      console.log(`  2. View logs: cat .ultra/state/autoloop.json`);
    }
    console.log('');
    console.log(`🪨  "The boulder never stops."`);

  } catch (error) {
    console.error('❌ Error starting domain:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Detect best available process manager
 */
function detectBestManager(): 'tmux' | 'pm2' | 'none' {
  // Check for tmux
  try {
    const { execSync } = require('child_process');
    execSync('which tmux', { stdio: 'ignore' });
    return 'tmux';
  } catch {
    // tmux not available, check pm2
  }

  try {
    const { execSync } = require('child_process');
    execSync('which pm2', { stdio: 'ignore' });
    return 'pm2';
  } catch {
    // pm2 not available, use standalone
  }

  return 'none';
}

main();
