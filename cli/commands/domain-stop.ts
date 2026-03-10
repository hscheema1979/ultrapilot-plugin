#!/usr/bin/env node
/**
 * UltraPilot Domain Stop CLI Command
 *
 * Stop a domain's autoloop and ultra-lead processes.
 *
 * Usage:
 *   /ultra-domain-stop                    Stop current domain
 *   /ultra-domain-stop --path <path>       Stop domain at path
 */

import { createDomainProcessManager } from '../../dist/domain/DomainProcessManager.js';
import { existsSync } from 'fs';
import * as path from 'path';
import { readFileSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);
  let domainPath = process.cwd();

  // Parse --path argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' || args[i] === '-p') {
      domainPath = args[++i];
    }
  }

  const domainJsonPath = path.join(domainPath, '.ultra', 'domain.json');

  // Check if domain exists
  if (!existsSync(domainJsonPath)) {
    console.error(`❌ No domain found at: ${domainPath}`);
    process.exit(1);
  }

  // Load domain config
  const domainConfig = JSON.parse(readFileSync(domainJsonPath, 'utf-8'));
  const domainName = domainConfig.name;
  const domainId = domainConfig.domainId;

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-STOP                                          ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Stopping domain processes...                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    // Detect process manager from state
    const processInfoPath = path.join(domainPath, '.ultra', 'state', 'process-info.json');
    let manager: 'tmux' | 'pm2' | 'none' = 'none';

    if (existsSync(processInfoPath)) {
      const processInfo = JSON.parse(readFileSync(processInfoPath, 'utf-8'));
      manager = processInfo.manager || 'none';
    } else {
      console.warn('⚠️  No process info found, assuming standalone');
    }

    const processManager = createDomainProcessManager({
      domainPath,
      domainName,
      domainId,
      processManager: manager
    });

    // Show status before stopping
    const status = processManager.getStatus();
    console.log('Current status:');
    for (const proc of status) {
      const statusIcon = proc.status === 'running' ? '✅' : '❌';
      console.log(`  ${statusIcon} ${proc.name}: ${proc.status}`);
    }
    console.log('');

    await processManager.stopDomain();

    console.log(`✅ Domain ${domainName} stopped`);

  } catch (error) {
    console.error('❌ Error stopping domain:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
