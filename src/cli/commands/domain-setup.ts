#!/usr/bin/env node
/**
 * UltraPilot Domain Setup CLI Command
 *
 * Initialize a new autonomous domain in the current workspace.
 * Creates .ultra/ directory structure, domain.json configuration,
 * and prepares for autoloop.
 *
 * Usage:
 *   /ultra-domain-setup
 *   /ultra-domain-setup --config domain.json
 *   /ultra-domain-setup --reconfigure
 *   /ultra-domain-setup --reset
 */

import { createDomainInitializer } from '../../dist/domain/DomainInitializer.js';
import { existsSync } from 'fs';
import * as path from 'path';
import { readFileSync } from 'fs';

interface CliOptions {
  config?: string;
  reconfigure?: boolean;
  reset?: boolean;
  help?: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config') {
      options.config = args[++i];
    } else if (arg === '--reconfigure') {
      options.reconfigure = true;
    } else if (arg === '--reset') {
      options.reset = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Show help
  if (options.help) {
    console.log(`
UltraPilot Domain Setup - Initialize autonomous domain in workspace

Usage:
  /ultra-domain-setup                    Interactive setup wizard
  /ultra-domain-setup --config <file>     Non-interactive setup from config file
  /ultra-domain-setup --reconfigure       Reconfigure existing domain
  /ultra-domain-setup --reset             Reset domain (deletes .ultra/)

Examples:
  /ultra-domain-setup
  /ultra-domain-setup --config domain.json
  /ultra-domain-setup --reconfigure

For more information, see: https://github.com/ultrapilot/ultrapilot-plugin
`);
    process.exit(0);
  }

  const initializer = createDomainInitializer(process.cwd());

  try {
    // Reset mode
    if (options.reset) {
      console.log('⚠️  WARNING: This will delete all domain state and configuration');
      console.log('   Press Ctrl+C to cancel, or Enter to continue...');
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });

      await initializer.reset();
      console.log('✅ Domain reset complete');
      process.exit(0);
    }

    // Reconfigure mode
    if (options.reconfigure) {
      const config = await initializer.loadDomainConfig();
      console.log(`Current domain: ${config.name}`);
      console.log(`Type: ${config.type}`);
      console.log(`Agents: ${config.agents.length}`);
      console.log('');
      console.log('Reconfiguration not yet implemented. Edit .ultra/domain.json manually.');
      process.exit(0);
    }

    // Config file mode
    if (options.config) {
      const configPath = path.resolve(process.cwd(), options.config);
      if (!existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
      }

      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      await initializer.initialize({
        name: config.name,
        description: config.description || '',
        type: config.type || 'software-dev',
        language: config.stack?.language || 'TypeScript',
        framework: config.stack?.framework || 'Express',
        packageManager: config.stack?.packageManager || 'npm',
        testing: config.stack?.testing || 'Jest',
        agents: config.agents || ['ultra:team-lead', 'ultra:team-implementer', 'ultra:test-engineer'],
        routines: config.routines || [],
        domainParameters: config.domainParameters || { goals: 'Domain operation and management' },
        autoloopCycleTime: config.autoloop?.cycleTime ? parseInt(config.autoloop.cycleTime) : 30
      });

      process.exit(0);
    }

    // Interactive mode (default)
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-SETUP                                          ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Let's set up your autonomous domain!                        ║
║                                                               ║
║  Each workspace = one autonomous domain                      ║
║  Each domain = one persistent autoloop                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

    // Check if already initialized
    if (initializer.isInitialized()) {
      console.log('⚠️  Domain already initialized in this workspace');
      console.log('   Use --reconfigure to change settings');
      console.log('   Use --reset to start over');
      process.exit(1);
    }

    // Interactive prompts
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise(resolve => {
        rl.question(prompt, resolve);
      });
    };

    // Collect domain information
    console.log('\n📋 Domain Identity');
    console.log('─────────────────────────────────');

    const name = await question('Domain name (e.g., quantitative-trading, ultra-dev): ');
    if (!name.trim()) {
      console.error('❌ Domain name is required');
      process.exit(1);
    }

    const description = await question('Description: ');

    console.log('\n🎯 Domain Goals & Vision');
    console.log('─────────────────────────────────');
    console.log('What is this domain\'s primary purpose?');
    console.log('  Example: "Algorithmic trading system for SPX options"');
    console.log('  Example: "UltraPilot framework development and testing"');
    console.log('  Example: "Personal assistant for research and writing"');
    const goals = await question('Domain goals: ');

    console.log('\n🏷️  Domain Type');
    console.log('─────────────────────────────────');
    console.log('Common types:');
    console.log('  - software-dev (Software development)');
    console.log('  - quantitative-trading (Trading systems)');
    console.log('  - research (Research & analysis)');
    console.log('  - personal-assistant (Personal tasks)');
    console.log('  - full-stack (Web applications)');
    const type = await question('Domain type [software-dev]: ') || 'software-dev';

    console.log('\n💻 Tech Stack');
    console.log('─────────────────────────────────');

    const language = await question('Primary language [TypeScript]: ') || 'TypeScript';
    const framework = await question('Framework [Express]: ') || 'Express';
    const packageManager = await question('Package manager [npm/yarn/pnpm]: ') || 'npm';
    const testing = await question('Testing framework [Jest]: ') || 'Jest';

    console.log('\n🤖 Agents');
    console.log('─────────────────────────────────');
    console.log('Available agents:');
    console.log('  TEAM COORDINATION:');
    console.log('  - ultra:team-lead (orchestration)');
    console.log('  - ultra:team-implementer (parallel implementation)');
    console.log('  - ultra:team-reviewer (multi-dimensional review)');
    console.log('  - ultra:team-debugger (hypothesis-driven debugging)');
    console.log('');
    console.log('  SPECIALIST:');
    console.log('  - ultra:executor (implementation)');
    console.log('  - ultra:test-engineer (testing)');
    console.log('  - ultra:debugger (root cause analysis)');
    console.log('  - ultra:code-reviewer (code quality)');
    console.log('  - ultra:security-reviewer (security + veto power)');
    console.log('  - ultra:quality-reviewer (performance)');
    console.log('');
    console.log('  TRADING DOMAIN:');
    console.log('  - ultra:quant-analyst (strategy development)');
    console.log('  - ultra:risk-manager (risk management + veto power)');
    console.log('  - ultra:trading-architect (system architecture)');
    console.log('  - ultra:execution-developer (broker integration)');

    const agentsInput = await question('Enable agents [ultra:team-lead,ultra:team-implementer,ultra:test-engineer]: ')
      || 'ultra:team-lead,ultra:team-implementer,ultra:test-engineer';
    const agents = agentsInput.split(',').map(a => a.trim());

    console.log('\n⏰ Routines');
    console.log('─────────────────────────────────');
    console.log('Leave empty to use default routines for your agents');
    const routinesInput = await question('Custom routines (name:schedule, comma-separated): ');
    const routines = routinesInput.trim()
      ? routinesInput.split(',').map(r => {
          const [name, schedule] = r.trim().split(':');
          return { name: name.trim(), schedule: (schedule || 'hourly').trim() };
        })
      : [];

    console.log('\n⚙️  Domain-Specific Properties');
    console.log('─────────────────────────────────');
    console.log('Enter any domain-specific parameters as JSON');
    console.log('Example for trading: {"tradingParameters": {"mode": "PAPER", "underlying": "SPX"}}');
    console.log('Example for dev: {"developmentParameters": {"mode": "ACTIVE", "testCoverageTarget": 80}}');
    console.log('Leave empty if none');
    const domainParamsInput = await question('Domain properties (JSON): ');

    let domainParameters: Record<string, any> = {};
    if (domainParamsInput.trim()) {
      try {
        domainParameters = JSON.parse(domainParamsInput);
        // Also add goals to domain parameters
        domainParameters.goals = goals;
      } catch (e) {
        console.warn('⚠️  Invalid JSON, skipping domain properties');
        domainParameters = { goals };
      }
    } else {
      domainParameters = { goals };
    }

    rl.close();

    // Initialize domain with user-provided goals and properties
    await initializer.initialize({
      name,
      description,
      type,
      language,
      framework,
      packageManager,
      testing,
      agents,
      routines,
      domainParameters,
      autoloopCycleTime: 30
    });

    console.log(`
═══════════════════════════════════════════════════════════════

✅ Domain initialized successfully!

Domain: ${name}
Type: ${type}
Goals: ${goals}

📋 Organizational Hierarchy:
   CEO: You (Vision & Goals)
   COO: Claude Code CLI (Architecture & Resources)
   UltraLead: Domain Manager (${name})
   Autoloop: VP of Operations (Heartbeat)
   UltraWorkers: ${agents.length} autonomous agents configured

Next steps:
  1. Review your domain configuration:
     cat .ultra/domain.json

  2. Start the persistent autoloop:
     /ultra-autoloop start

  3. Add tasks to the intake queue:
     echo '{"title": "My first task", "description": "..."}' > .ultra/queues/intake.json

  4. Monitor domain health:
     cat .ultra/state/autoloop.json

🪨  "The boulder never stops."

═══════════════════════════════════════════════════════════════
`);

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
