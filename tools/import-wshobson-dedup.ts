#!/usr/bin/env node
/**
 * wshobson agent importer with deduplication
 */

import fs from 'fs';
import path from 'path';

const WSHOBSON_REPO = '/home/ubuntu/hscheema1979/wshobson-agents';
const OUTPUT_FILE = '/home/ubuntu/.claude/plugins/ultrapilot/src/wshobson-catalog.ts';

interface AgentMetadata {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
}

/**
 * Simple YAML frontmatter parser
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
    result[key] = value.replace(/^["']|["']$/g, '');
  }

  return result;
}

/**
 * Parse agent frontmatter
 */
function parseAgentFrontmatter(filePath: string): AgentMetadata | null {
  const content = fs.readFileSync(filePath, 'utf8');

  try {
    const metadata = parseYamlFrontmatter(content) as any;
    if (!metadata || !metadata.name || !metadata.model) {
      return null;
    }

    return {
      name: metadata.name,
      description: metadata.description || '',
      model: metadata.model
    };
  } catch {
    return null;
  }
}

/**
 * Convert name to title case
 */
function toTitleCase(name: string): string {
  return name.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Generate catalog key
 */
function toCatalogKey(name: string): string {
  return `wshobson:${name.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Main import function
 */
function importWshobsonAgents() {
  console.log('🔍 Scanning wshobson agents...\n');

  const pluginsPath = path.join(WSHOBSON_REPO, 'plugins');
  const agentsMap = new Map<string, any>();

  // Scan all plugins
  const plugins = fs.readdirSync(pluginsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const plugin of plugins) {
    const agentsPath = path.join(pluginsPath, plugin, 'agents');
    if (!fs.existsSync(agentsPath)) continue;

    const agentFiles = fs.readdirSync(agentsPath).filter(file => file.endsWith('.md'));

    for (const agentFile of agentFiles) {
      const agentPath = path.join(agentsPath, agentFile);
      const metadata = parseAgentFrontmatter(agentPath);

      if (metadata) {
        const key = toCatalogKey(metadata.name);

        // Deduplicate: keep first occurrence
        if (!agentsMap.has(key)) {
          agentsMap.set(key, {
            key,
            name: toTitleCase(metadata.name),
            description: metadata.description,
            model: metadata.model
          });
          console.log(`  ✓ ${key}`);
        } else {
          console.log(`  ⊗ ${key} (duplicate, skipped)`);
        }
      }
    }
  }

  console.log(`\n📊 Found ${agentsMap.size} unique agents (after deduplication)`);

  // Generate TypeScript file
  let tsCode = `/**\n`;
  tsCode += ` * wshobson Agent Catalog\n`;
  tsCode += ` * Auto-imported from https://github.com/wshobson/agents\n`;
  tsCode += ` * Generated: ${new Date().toISOString()}\n`;
  tsCode += ` * Total agents: ${agentsMap.size}\n`;
  tsCode += ` */\n\n`;
  tsCode += `import type { AgentType } from './agents.js';\n\n`;
  tsCode += `export const WSHOBSON_CATALOG: Record<string, AgentType> = {\n`;

  for (const agent of agentsMap.values()) {
    // Escape single quotes in description
    const escapedDesc = agent.description.replace(/'/g, "\\'");

    tsCode += `  '${agent.key}': {\n`;
    tsCode += `    name: '${agent.name}',\n`;
    tsCode += `    description: '${escapedDesc}',\n`;
    tsCode += `    model: '${agent.model}',\n`;
    tsCode += `    capabilities: []\n`;  // Start with empty, can be enhanced later
    tsCode += `  },\n`;
  }

  tsCode += `};\n`;

  // Write to file
  fs.writeFileSync(OUTPUT_FILE, tsCode);
  console.log(`\n✅ Generated ${OUTPUT_FILE}`);
  console.log('\n🎉 Import complete!');
  console.log(`\nNext steps:`);
  console.log(`1. Run: npx tsc --noEmit (should pass now)`);
  console.log(`2. Run: bash verify-integration.sh`);
}

// Run import
importWshobsonAgents();
