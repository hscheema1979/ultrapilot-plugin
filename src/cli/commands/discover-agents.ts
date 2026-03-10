#!/usr/bin/env node

/**
 * ultra-discover-agents CLI Command
 *
 * Discovers and catalogs all wshobson specialist agents from the agents library.
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { InMemoryAgentRepository } from '../../src/wshobson/repositories/in-memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths
const ULTRAPILOT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_PLUGINS_PATH = path.join(ULTRAPILOT_ROOT, 'agents-lib', 'plugins');
const DEFAULT_CACHE_PATH = path.join(ULTRAPILOT_ROOT, '.wshobson-cache.json');
const ULTRA_CACHE_PATH = path.join(process.env.HOME || '', '.claude', '.ultra', 'wshobson-cache.json');

interface DiscoverOptions {
  pluginsPath?: string;
  cachePath?: string;
  forceRefresh?: boolean;
  verbose?: boolean;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     wshobson Agent Library Discovery                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log();

  // Parse command line arguments
  const options: DiscoverOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--path' && i + 1 < args.length) {
      options.pluginsPath = args[++i];
    } else if (arg === '--cache' && i + 1 < args.length) {
      options.cachePath = args[++i];
    } else if (arg === '--refresh' || arg === '-r') {
      options.forceRefresh = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // Set default paths
  const pluginsPath = options.pluginsPath || DEFAULT_PLUGINS_PATH;
  const cachePath = options.cachePath || ULTRA_CACHE_PATH;

  console.log(`Plugins Path: ${pluginsPath}`);
  console.log(`Cache Path:   ${cachePath}`);
  console.log();

  // Verify plugins path exists
  if (!fs.existsSync(pluginsPath)) {
    console.error(`✗ Plugins path does not exist: ${pluginsPath}`);
    console.error(`  Please ensure the wshobson agents-lib is installed.`);
    process.exit(1);
  }

  try {
    const startTime = Date.now();

    // Create repository
    const repo = new InMemoryAgentRepository(pluginsPath, {
      cachePath,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      refreshInterval: 60 * 60 * 1000, // 1 hour
    });

    // Force refresh if requested
    if (options.forceRefresh) {
      console.log('Forcing cache refresh...');
      await fs.unlink(cachePath).catch(() => {});
    }

    // Initialize (will load from cache or scan)
    await repo.initialize();

    const initTime = Date.now() - startTime;

    // Get statistics
    const stats = await repo.getStats();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║     Discovery Results                                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`Initialization Time: ${initTime}ms`);
    console.log();
    console.log(`Statistics:`);
    console.log(`  Plugins:       ${stats.pluginCount}`);
    console.log(`  Agents:        ${stats.agentCount}`);
    console.log(`  Capabilities:  ${stats.capabilityCount}`);
    console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  Last Scan:     ${stats.lastScanTime ? new Date(stats.lastScanTime).toISOString() : 'N/A'}`);
    console.log(`  Scan Duration: ${stats.scanDuration}ms`);
    console.log();

    // Show top 10 plugins by agent count
    console.log(`Top 10 Plugins by Agent Count:`);

    const allPlugins = await getAllPlugins(repo);
    const sortedPlugins = allPlugins
      .sort((a, b) => b.agentCount - a.agentCount)
      .slice(0, 10);

    for (let i = 0; i < sortedPlugins.length; i++) {
      const plugin = sortedPlugins[i];
      console.log(`  ${i + 1}. ${plugin.name}: ${plugin.agentCount} agents`);
    }

    console.log();

    // Show sample agents by capability
    if (options.verbose) {
      console.log(`Sample Capability Searches:`);
      console.log();

      const testCapabilities = [
        'typescript',
        'api-design',
        'backend',
        'testing',
      ];

      for (const cap of testCapabilities) {
        const agents = await repo.findAgents(cap);
        const topAgents = agents.slice(0, 3);

        console.log(`  Capability: "${cap}"`);
        if (topAgents.length > 0) {
          for (const agent of topAgents) {
            console.log(`    - ${agent.name} (${agent.plugin})`);
          }
        } else {
          console.log(`    (no agents found)`);
        }
        console.log();
      }
    }

    // Verify expectations
    const expectedPlugins = 72;
    const expectedAgents = 177;

    console.log(`Verification:`);
    console.log(`  Expected Plugins: ${expectedPlugins}`);
    console.log(`  Found Plugins:    ${stats.pluginCount}`);
    console.log(`  ${stats.pluginCount === expectedPlugins ? '✓' : '✗'} Match: ${stats.pluginCount === expectedPlugins ? 'YES' : 'NO'}`);
    console.log();
    console.log(`  Expected Agents:  ${expectedAgents}`);
    console.log(`  Found Agents:     ${stats.agentCount}`);
    console.log(`  ${stats.agentCount === expectedAgents ? '✓' : '✗'} Match: ${stats.agentCount === expectedAgents ? 'YES' : 'NO'}`);
    console.log();

    // Performance targets
    console.log(`Performance Targets:`);
    console.log(`  Cold Start:  <5s     ${initTime < 5000 ? '✓' : '✗'} (${initTime}ms)`);
    console.log(`  Warm Start:  <100ms  ${initTime < 100 ? '✓' : '✗'} (${initTime}ms)`);
    console.log();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log(`║     ${stats.pluginCount === expectedPlugins && stats.agentCount === expectedAgents ? '✓ Discovery Successful' : '⚠ Discovery Completed with Warnings'}                 ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error();
    console.error(`✗ Discovery failed: ${error}`);
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Get all plugins from repository
 */
async function getAllPlugins(repo: InMemoryAgentRepository): Promise<any[]> {
  // This is a workaround - we'll need to add a getAllPlugins method to the repository
  // For now, we'll use findByPlugin for each known plugin
  const plugins: any[] = [];

  // Try to get stats which includes plugin count
  const stats = await repo.getStats();

  // We'll need to enhance the repository to expose plugins directly
  // For now, return empty array
  return plugins;
}

function printHelp() {
  console.log(`
Usage: ultra-discover-agents [options]

Options:
  --path <path>      Path to wshobson plugins directory
                     (default: ./agents-lib/plugins)
  --cache <path>     Path to cache file
                     (default: ~/.claude/.ultra/wshobson-cache.json)
  --refresh, -r      Force cache refresh
  --verbose, -v      Show detailed output
  --help, -h         Show this help message

Examples:
  ultra-discover-agents
  ultra-discover-agents --path /path/to/plugins
  ultra-discover-agents --refresh --verbose
  `);
}

main();
