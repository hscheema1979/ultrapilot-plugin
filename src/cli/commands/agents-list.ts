/**
 * UltraPilot Agent List Command
 *
 * Lists all available agents in the AGENT_CATALOG,
 * organized by domain for easy discovery and selection.
 *
 * Usage:
 *   ultra-agents-list                    # List all agents grouped by domain
 *   ultra-agents-list --domain software-dev   # Show only software-dev agents
 *   ultra-agents-list --search backend       # Search for agents by name/description
 */

import { AGENT_CATALOG, AGENTS_BY_DOMAIN, TOTAL_AGENTS, TOTAL_DOMAINS } from '../../src/agents.js';

interface ListOptions {
  domain?: string;
  search?: string;
  verbose?: boolean;
}

/**
 * List all agents with optional filtering
 */
export async function listAgents(options: ListOptions = {}): Promise<void> {
  const { domain, search, verbose = false } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🤖 UltraPilot Agent Catalog');
  console.log('='.repeat(80));
  console.log(`Total Agents: ${TOTAL_AGENTS}`);
  console.log(`Total Domains: ${TOTAL_DOMAINS}`);
  console.log('='.repeat(80) + '\n');

  if (domain) {
    // List agents for specific domain
    await listDomainAgents(domain, verbose);
  } else if (search) {
    // Search agents by name/description
    await searchAgents(search, verbose);
  } else {
    // List all agents grouped by domain
    await listAllAgents(verbose);
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 Use agent names (ultra:agent-name) in domain setup');
  console.log('   Example: ultra-domain-setup --agents ultra:team-lead,ultra:team-implementer');
  console.log('='.repeat(80) + '\n');
}

/**
 * List all agents grouped by domain
 */
async function listAllAgents(verbose: boolean): Promise<void> {
  const domains = Object.keys(AGENTS_BY_DOMAIN).sort();

  for (const domain of domains) {
    await listDomainAgents(domain, verbose);
  }
}

/**
 * List agents for a specific domain
 */
async function listDomainAgents(domain: string, verbose: boolean): Promise<void> {
  const agents = AGENTS_BY_DOMAIN[domain];

  if (!agents || agents.length === 0) {
    console.log(`\n❌ Domain '${domain}' not found or has no agents`);
    console.log(`\nAvailable domains:\n  ${Object.keys(AGENTS_BY_DOMAIN).sort().join('\n  ')}`);
    return;
  }

  console.log(`\n📁 ${domain.toUpperCase()}`);
  console.log('─'.repeat(80));

  for (const agentId of agents) {
    const agent = AGENT_CATALOG[agentId];
    if (!agent) continue;

    const status = getStatusIndicator(agent.model);
    console.log(`${status} ${agent.name.padEnd(30)} ${agent.model.padEnd(8)}`);

    if (verbose) {
      console.log(`   Description: ${agent.description.substring(0, 77)}...`);
      console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
      console.log(`   Plugin: ${agent.plugin}`);
      console.log('');
    }
  }

  console.log(`\n   Total: ${agents.length} agents`);
}

/**
 * Search agents by name or description
 */
async function searchAgents(query: string, verbose: boolean): Promise<void> {
  const lowerQuery = query.toLowerCase();
  const matches: Array<{ id: string; agent: any; domain: string }> = [];

  // Search across all agents
  for (const [domain, agents] of Object.entries(AGENTS_BY_DOMAIN)) {
    for (const agentId of agents) {
      const agent = AGENT_CATALOG[agentId];
      if (!agent) continue;

      const matchScore =
        (agent.name.toLowerCase().includes(lowerQuery) ? 3 : 0) +
        (agent.description.toLowerCase().includes(lowerQuery) ? 2 : 0) +
        (agent.capabilities.some((c: string) => c.toLowerCase().includes(lowerQuery)) ? 1 : 0);

      if (matchScore > 0) {
        matches.push({ id: agentId, agent, domain, matchScore });
      }
    }
  }

  // Sort by match score (descending)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  if (matches.length === 0) {
    console.log(`\n❌ No agents found matching '${query}'`);
    return;
  }

  console.log(`\n🔍 Search results for '${query}' (${matches.length} matches)`);
  console.log('─'.repeat(80));

  for (const { id, agent, domain } of matches) {
    const status = getStatusIndicator(agent.model);
    console.log(`\n${status} ${agent.name.padEnd(30)} [${domain}]`);
    console.log(`   ${agent.description.substring(0, 77)}...`);

    if (verbose) {
      console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
      console.log(`   Plugin: ${agent.plugin}`);
    }
  }
}

/**
 * Get status indicator based on model tier
 */
function getStatusIndicator(model: string): string {
  const indicators: Record<string, string> = {
    'opus': '🔴',
    'sonnet': '🟡',
    'haiku': '🟢'
  };
  return indicators[model] || '⚪';
}

/**
 * CLI entry point
 */
export async function main(argv: string[]): Promise<void> {
  const options: ListOptions = {
    verbose: argv.includes('--verbose') || argv.includes('-v')
  };

  // Parse --domain flag
  const domainIndex = argv.indexOf('--domain');
  if (domainIndex !== -1 && argv[domainIndex + 1]) {
    options.domain = argv[domainIndex + 1];
  }

  // Parse --search flag
  const searchIndex = argv.indexOf('--search');
  if (searchIndex !== -1 && argv[searchIndex + 1]) {
    options.search = argv[searchIndex + 1];
  }

  await listAgents(options);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(console.error);
}
