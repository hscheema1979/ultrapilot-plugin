#!/usr/bin/env node
/**
 * UltraPilot Domain Prompts CLI Command
 *
 * Generate system prompts for all agents in a domain.
 * Ensures agents have clear goals, agency, overhead, and domain context.
 *
 * Usage:
 *   /ultra-domain-prompts                  Generate prompts for current domain
 *   /ultra-domain-prompts --path <path>     Generate prompts for domain at path
 *   /ultra-domain-prompts --agent <name>    Generate prompt for specific agent
 *   /ultra-domain-prompts --save            Save prompts to .ultra/prompts/
 */

import { createDomainAgentPromptEngineer } from '../../dist/domain/DomainAgentPromptEngineer.js';
import { existsSync } from 'fs';
import * as path from 'path';

interface CliOptions {
  path?: string;
  agent?: string;
  save?: boolean;
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
    } else if (arg === '--agent' || arg === '-a') {
      options.agent = args[++i];
    } else if (arg === '--save' || arg === '-s') {
      options.save = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Show help
  if (options.help) {
    console.log(`
UltraPilot Domain Prompts - Generate agent system prompts

Usage:
  /ultra-domain-prompts                    Generate prompts for current domain
  /ultra-domain-prompts --path <path>      Generate prompts for domain at path
  /ultra-domain-prompts --agent <name>     Generate prompt for specific agent
  /ultra-domain-prompts --save             Save prompts to .ultra/prompts/

Options:
  --path, -p     Domain path (default: current directory)
  --agent, -a    Generate prompt for specific agent only
  --save, -s     Save prompts to .ultra/prompts/ directory
  --help, -h     Show this help message

Examples:
  /ultra-domain-prompts
  /ultra-domain-prompts --path ~/projects/trading-at --save
  /ultra-domain-prompts --agent ultra:team-lead

For more information, see: https://github.com/ultrapilot/ultrapilot-plugin
`);
    process.exit(0);
  }

  const domainPath = options.path || process.cwd();
  const domainJsonPath = path.join(domainPath, '.ultra', 'domain.json');

  // Check if domain exists
  if (!existsSync(domainJsonPath)) {
    console.error(`❌ No domain found at: ${domainPath}`);
    console.error(`   Run /ultra-domain-setup first to initialize the domain`);
    process.exit(1);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ULTRA-DOMAIN-PROMPTS                                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Generating agent system prompts...                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    const promptEngineer = createDomainAgentPromptEngineer(domainPath);

    if (options.agent) {
      // Generate prompt for specific agent
      console.log(`\n📝 Generating prompt for: ${options.agent}\n`);

      const domainConfig = JSON.parse(require('fs').readFileSync(domainJsonPath, 'utf-8'));
      const agent = domainConfig.agents.find((a: any) => a.name === options.agent);

      if (!agent) {
        console.error(`❌ Agent not found: ${options.agent}`);
        console.error(`   Available agents:`);
        domainConfig.agents.forEach((a: any) => console.error(`   - ${a.name}`));
        process.exit(1);
      }

      const prompt = promptEngineer.generateAgentPrompt(agent);
      console.log(prompt.systemPrompt);

      if (options.save) {
        console.log(`\n✅ Prompt saved to .ultra/prompts/${options.agent.replace(/:/g, '-')}.md`);
      }

    } else {
      // Generate prompts for all agents
      const prompts = promptEngineer.generateAllAgentPrompts();

      console.log(`\n📝 Generated ${prompts.length} agent prompts:\n`);

      for (const prompt of prompts) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`AGENT: ${prompt.agentName}`);
        console.log(`${'='.repeat(60)}\n`);
        console.log(prompt.systemPrompt);
        console.log('');
      }

      if (options.save) {
        promptEngineer.savePrompts(prompts);
        console.log(`\n✅ All prompts saved to .ultra/prompts/`);
      }
    }

    console.log(`
═══════════════════════════════════════════════════════════════

✅ Agent prompts generated successfully!

These prompts define:
- Agent identity and role
- Domain context and goals
- Agency level and authority
- File ownership boundaries
- Routine tasks and maintenance
- Communication protocols
- Decision framework

🪨  "The boulder never stops."

═══════════════════════════════════════════════════════════════
`);

  } catch (error) {
    console.error('❌ Error generating prompts:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
