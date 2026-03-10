/**
 * Plugin Scanner for wshobson Agents
 *
 * Scans all 72 plugin directories in agents-lib/plugins/
 * Parses YAML frontmatter from markdown files
 * Produces cache matching actual .wshobson-cache.json structure
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WshobsonCache, CachedAgentDefinition } from '../types/wshobson-types.js';
import { getPluginDomain } from '../config/plugin-domains.js';

export class PluginScanner {
  private pluginsPath: string;

  constructor(pluginsPath: string) {
    this.pluginsPath = pluginsPath;
  }

  /**
   * Scan all plugin directories
   * Produces cache matching ACTUAL .wshobson-cache.json structure
   *
   * @returns Cache with nested structure: plugins → {agents, agentCount}
   */
  async scanAllPlugins(): Promise<WshobsonCache> {
    const cache: WshobsonCache = {
      plugins: {},
      version: '1.0.0',
      lastUpdated: new Date().toISOString()
    };

    const plugins = await this.listPluginDirectories();

    console.log(`[PluginScanner] Found ${plugins.length} plugin directories`);

    for (const pluginName of plugins) {
      try {
        const pluginData = await this.scanPlugin(pluginName);
        if (pluginData.agents.length > 0) {
          cache.plugins[pluginName] = pluginData;
          console.log(`[PluginScanner] Scanned ${pluginName}: ${pluginData.agentCount} agents`);
        }
      } catch (error) {
        console.warn(`[PluginScanner] Failed to scan ${pluginName}:`, error);
      }
    }

    const totalAgents = Object.values(cache.plugins).reduce((sum, p) => sum + p.agentCount, 0);
    console.log(`[PluginScanner] Total agents scanned: ${totalAgents}`);

    return cache;
  }

  /**
   * List plugin directories
   */
  private async listPluginDirectories(): Promise<string[]> {
    const entries = await fs.readdir(this.pluginsPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith('.')); // Skip hidden directories
  }

  /**
   * Scan single plugin directory
   */
  private async scanPlugin(pluginName: string): Promise<{ agents: CachedAgentDefinition[]; agentCount: number }> {
    const pluginPath = path.join(this.pluginsPath, pluginName);
    const agents: CachedAgentDefinition[] = [];

    const entries = await fs.readdir(pluginPath);

    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const filePath = path.join(pluginPath, entry);
        const agent = await this.parseAgentFile(filePath, pluginName);
        if (agent) {
          agents.push(agent);
        }
      }
    }

    return { agents, agentCount: agents.length };
  }

  /**
   * Parse agent markdown file with SAFE YAML parsing
   */
  private async parseAgentFile(
    filePath: string,
    pluginName: string
  ): Promise<CachedAgentDefinition | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(/^---\r?\n(.*?)\r?\n---\r?\n(.*)$/s);

    if (!match) {
      console.warn(`[PluginScanner] No frontmatter in ${filePath}`);
      return null;
    }

    const [, frontmatter, body] = match;

    let metadata: any;
    try {
      // SAFE YAML PARSING - Use FAILSAFE_SCHEMA to prevent code execution
      metadata = yaml.load(frontmatter, { schema: yaml.FAILSAFE_SCHEMA });
    } catch (error) {
      console.warn(`[PluginScanner] Invalid YAML in ${filePath}:`, error);
      return null;
    }

    return {
      name: metadata.name || path.basename(filePath, '.md'),
      description: metadata.description || body.slice(0, 200),
      systemPrompt: body,
      model: metadata.model || 'inherit',
      tier: metadata.tier,
      capabilities: metadata.capabilities || [],
      plugin: pluginName,
      domain: getPluginDomain(pluginName),
      cachedAt: new Date().toISOString()
    };
  }
}
