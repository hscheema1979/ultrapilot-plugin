#!/usr/bin/env node
/**
 * Import wshobson agents into UltraPilot AGENT_CATALOG
 *
 * Reads agent .md files from wshobson/agents repo
 * Converts to UltraPilot AGENT_CATALOG format
 * Appends to src/agents.ts
 */

import fs from 'fs';
import path from 'path';

/**
 * Simple YAML frontmatter parser (no external dependency)
 */
function parseYamlFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, any> = {};

  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    result[key] = value.replace(/^["']|["']$/g, '');
  }

  return result;
}

const WSHOBSON_REPO = '/home/ubuntu/hscheema1979/wshobson-agents';
const AGENTS_TS = '/home/ubuntu/hscheema1979/src/agents.ts';

interface AgentMetadata {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
}

interface AgentCatalog {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  capabilities: string[];
}

/**
 * Parse YAML frontmatter from agent .md file
 */
function parseAgentFrontmatter(filePath: string): AgentMetadata | null {
  const content = fs.readFileSync(filePath, 'utf8');

  try {
    const metadata = parseYamlFrontmatter(content) as any;
    if (!metadata || !metadata.name || !metadata.model) {
      console.warn(`Invalid metadata in ${filePath}`);
      return null;
    }

    return {
      name: metadata.name,
      description: metadata.description || '',
      model: metadata.model
    };
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract capabilities from agent content
 */
function extractCapabilities(content: string): string[] {
  const capabilities: string[] = [];

  // Look for capability sections
  const capabilitySections = content.matchAll(/### (.+?)\n\n((?:- .+\n)+)/g);
  for (const match of capabilitySections) {
    const sectionName = match[1];
    const items = match[2].matchAll(/- (.+)/g);
    for (const item of items) {
      // Extract capability name (before the first colon)
      const capName = item[1].split(':')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      capabilities.push(capName);
    }
  }

  return capabilities.slice(0, 5); // Limit to top 5 capabilities
}

/**
 * Convert wshobson agent to UltraPilot catalog format
 */
function convertToCatalogFormat(agentPath: string): AgentCatalog | null {
  const metadata = parseAgentFrontmatter(agentPath);
  if (!metadata) return null;

  const content = fs.readFileSync(agentPath, 'utf8');
  const capabilities = extractCapabilities(content);

  return {
    name: metadata.name.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' '),
    description: metadata.description,
    model: metadata.model,
    capabilities
  };
}

/**
 * Main import function
 */
function importWshobsonAgents() {
  console.log('🔍 Scanning wshobson agents...');

  const pluginsPath = path.join(WSHOBSON_REPO, 'plugins');
  const catalogEntries: Record<string, AgentCatalog> = {};

  // Scan all plugins for agents
  const plugins = fs.readdirSync(pluginsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const plugin of plugins) {
    const agentsPath = path.join(pluginsPath, plugin, 'agents');
    if (!fs.existsSync(agentsPath)) continue;

    const agentFiles = fs.readdirSync(agentsPath)
      .filter(file => file.endsWith('.md'));

    for (const agentFile of agentFiles) {
      const agentPath = path.join(agentsPath, agentFile);
      const catalog = convertToCatalogFormat(agentPath);

      if (catalog) {
        const agentKey = `wshobson:${catalog.name.toLowerCase().replace(/\s+/g, '-')}`;
        catalogEntries[agentKey] = catalog;
        console.log(`  ✓ ${agentKey}`);
      }
    }
  }

  console.log(`\n📊 Found ${Object.keys(catalogEntries).length} agents`);

  // Generate TypeScript code
  let tsCode = `\n// === wshobson Agents (${Object.keys(catalogEntries).length} total) ===\n`;
  tsCode += `// Imported from wshobson/agents repository\n`;
  tsCode += `// Generated: ${new Date().toISOString()}\n\n`;

  for (const [key, catalog] of Object.entries(catalogEntries)) {
    tsCode += `'${key}': {\n`;
    tsCode += `  name: '${catalog.name}',\n`;
    tsCode += `  description: '${catalog.description.replace(/'/g, "\\'")}',\n`;
    tsCode += `  model: '${catalog.model}',\n`;
    tsCode += `  capabilities: [${catalog.capabilities.map(c => `'${c}'`).join(', ')}]\n`;
    tsCode += `},\n`;
  }

  // Append to agents.ts (insert BEFORE the closing brace)
  const existingAgents = fs.readFileSync(AGENTS_TS, 'utf8');

  // Find the ultra:document-specialist entry and insert after it
  const insertMarker = "  'ultra:document-specialist': {";
  const insertIndex = existingAgents.indexOf(insertMarker);

  if (insertIndex === -1) {
    throw new Error('Could not find ultra:document-specialist marker');
  }

  // Find the closing brace after document-specialist
  const afterEntry = existingAgents.slice(insertIndex);
  const closingBraceMatch = afterEntry.match(/^(\s+}\};)/m);

  if (!closingBraceMatch) {
    throw new Error('Could not find closing brace after document-specialist');
  }

  const closingBraceIndex = insertIndex + closingBraceMatch.index + closingBraceMatch[1].length;

  // Insert wshobson agents before the closing brace
  const updatedAgents =
    existingAgents.slice(0, closingBraceIndex) +
    ',\n' +
    tsCode +
    existingAgents.slice(closingBraceIndex);

  fs.writeFileSync(AGENTS_TS, updatedAgents);
  console.log(`\n✅ Inserted into ${AGENTS_TS}`);
  console.log('\n🎉 Import complete!');
}

// Run import
importWshobsonAgents();
