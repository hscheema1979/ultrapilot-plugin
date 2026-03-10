/**
 * Agent Definition Loader
 *
 * Loads and parses agent definitions from agents-lib .md files.
 * Each agent file contains YAML frontmatter (metadata) and markdown content (behavioral instructions).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as yaml from 'js-yaml';

import {
  AgentDefinition,
  AgentCacheEntry,
  LoaderOptions
} from './types.js';

/**
 * Default loader options
 */
const DEFAULT_OPTIONS: LoaderOptions = {
  agentsLibPath: './agents-lib/plugins',
  enableCache: true,
  cacheMaxSize: 200,
  cacheMaxAge: 3600000, // 1 hour
  hotReload: false
};

export class AgentDefinitionLoader {
  private cache: Map<string, AgentCacheEntry> = new Map();
  private options: LoaderOptions;

  constructor(options: LoaderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.resolveAgentsLibPath();
  }

  /**
   * Resolve agents-lib path relative to this file
   */
  private resolveAgentsLibPath(): void {
    if (!path.isAbsolute(this.options.agentsLibPath!)) {
      const __filename = new URL(import.meta.url).pathname;
      const __dirname = path.dirname(__filename);
      this.options.agentsLibPath = path.resolve(__dirname, '../../', this.options.agentsLibPath!);
    }
  }

  /**
   * Load full agent definition from .md file
   *
   * @param agentId - Agent ID (e.g., 'ultra:backend-architect' or 'backend-architect')
   * @returns Complete agent definition with behavioral instructions
   */
  async loadAgentDefinition(agentId: string): Promise<AgentDefinition> {
    // Strip ultra: prefix if present
    const baseName = agentId.replace('ultra:', '');

    // Check cache first
    if (this.options.enableCache && this.cache.has(baseName)) {
      const cached = this.cache.get(baseName)!;
      cached.lastAccessed = new Date();
      cached.accessCount++;

      if (Date.now() - cached.lastAccessed.getTime() < this.options.cacheMaxAge!) {
        return cached.definition;
      } else {
        // Cache expired, remove it
        this.cache.delete(baseName);
      }
    }

    // Find the agent file in agents-lib
    const agentPath = await this.findAgentFile(baseName);

    // Parse the file (YAML frontmatter + markdown)
    const definition = await this.parseAgentFile(agentPath);

    // Cache it
    if (this.options.enableCache) {
      this.cacheAgent(baseName, definition);
    }

    return definition;
  }

  /**
   * Find agent file in agents-lib plugins
   *
   * @param agentName - Base agent name (e.g., 'backend-architect')
   * @returns Absolute path to agent .md file
   */
  private async findAgentFile(agentName: string): Promise<string> {
    const globPattern = `**/agents/${agentName}.md`;

    try {
      const files = await glob(globPattern, {
        cwd: this.options.agentsLibPath!,
        absolute: true,
        ignore: ['**/node_modules/**']
      });

      if (files.length === 0) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      // If multiple files found (duplicates), prefer software-dev > architecture > quality > security
      if (files.length > 1) {
        return this.selectBestAgentFile(files, agentName);
      }

      return files[0];
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`agents-lib path not found: ${this.options.agentsLibPath}`);
      }
      throw error;
    }
  }

  /**
   * Select best agent file when duplicates exist
   *
   * Priority: software-dev > architecture > quality > security > operations
   */
  private selectBestAgentFile(files: string[], agentName: string): string {
    const priority = [
      'backend-development', 'api-scaffolding', 'javascript-typescript',
      'c4-architecture', 'database-design',
      'comprehensive-review', 'code-documentation',
      'backend-api-security', 'frontend-mobile-security',
      'incident-response', 'error-diagnostics'
    ];

    for (const plugin of priority) {
      const match = files.find(f => f.includes(`/plugins/${plugin}/`));
      if (match) {
        return match;
      }
    }

    // Default to first match
    return files[0];
  }

  /**
   * Parse agent .md file
   *
   * @param filePath - Absolute path to agent .md file
   * @returns Complete agent definition
   */
  private async parseAgentFile(filePath: string): Promise<AgentDefinition> {
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract YAML frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      throw new Error(`Invalid agent file (no frontmatter): ${filePath}`);
    }

    let frontmatter: any;
    try {
      frontmatter = yaml.load(frontmatterMatch[1]);
    } catch (error) {
      throw new Error(`Invalid YAML in ${filePath}: ${(error as any).message}`);
    }

    // Validate required fields
    if (!frontmatter.name) {
      throw new Error(`Agent missing 'name' field: ${filePath}`);
    }
    if (!frontmatter.description) {
      throw new Error(`Agent missing 'description' field: ${filePath}`);
    }

    // Extract markdown content (everything after frontmatter)
    const systemPrompt = content.slice(frontmatterMatch[0].length).trim();

    // Extract plugin name from path
    const pluginMatch = filePath.match(/plugins\/([^/]+)\/agents\//);
    const plugin = pluginMatch ? pluginMatch[1] : 'unknown';

    // Map plugin to domain
    const domain = this.mapPluginToDomain(plugin);

    // Get file size
    const stats = await fs.stat(filePath);

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      model: this.normalizeModel(frontmatter.model),
      tools: frontmatter.tools || [],
      color: frontmatter.color,

      systemPrompt, // THE ACTUAL AGENT BEHAVIOR!

      plugin,
      domain,
      filePath,

      loadedAt: new Date(),
      size: stats.size
    };
  }

  /**
   * Normalize model value
   */
  private normalizeModel(model: string): 'opus' | 'sonnet' | 'haiku' | 'inherit' {
    const valid = ['opus', 'sonnet', 'haiku', 'inherit'];
    const normalized = model?.toLowerCase();

    if (valid.includes(normalized)) {
      return normalized as 'opus' | 'sonnet' | 'haiku' | 'inherit';
    }

    // Default to sonnet for invalid models
    return 'sonnet';
  }

  /**
   * Map plugin to domain category
   */
  private mapPluginToDomain(plugin: string): string {
    const domainMap: Record<string, string> = {
      'backend-development': 'software-dev',
      'api-scaffolding': 'software-dev',
      'code-refactoring': 'software-dev',
      'javascript-typescript': 'software-dev',
      'python-development': 'software-dev',
      'jvm-languages': 'software-dev',
      'cicd-automation': 'software-dev',

      'c4-architecture': 'architecture',
      'database-design': 'architecture',
      'cloud-infrastructure': 'architecture',
      'full-stack-orchestration': 'architecture',

      'comprehensive-review': 'quality',
      'code-documentation': 'quality',
      'tdd-workflows': 'quality',
      'unit-testing': 'quality',

      'backend-api-security': 'security',
      'frontend-mobile-security': 'security',

      'incident-response': 'operations',
      'error-diagnostics': 'operations',
      'observability-monitoring': 'operations',

      'llm-application-dev': 'ai-ml',
      'machine-learning-ops': 'ai-ml',

      'agent-teams': 'agent-teams',
      'ui-design': 'design'
    };

    return domainMap[plugin] || plugin;
  }

  /**
   * Cache agent definition
   */
  private cacheAgent(agentName: string, definition: AgentDefinition): void {
    // Enforce cache size limit
    if (this.cache.size >= this.options.cacheMaxSize!) {
      // Remove least recently used entry
      let lruKey: string | null = null;
      let lruTime = Date.now();

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed.getTime() < lruTime) {
          lruTime = entry.lastAccessed.getTime();
          lruKey = key;
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(agentName, {
      definition,
      lastAccessed: new Date(),
      accessCount: 1,
      size: definition.size
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: number;
    totalSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);

    const timestamps = entries.map(e => e.lastAccessed);

    return {
      size: this.cache.size,
      entries: entries.length,
      totalSize,
      oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(d => d.getTime()))) : null,
      newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(d => d.getTime()))) : null
    };
  }

  /**
   * Preload multiple agents
   */
  async preloadAgents(agentIds: string[]): Promise<void> {
    await Promise.all(
      agentIds.map(id => this.loadAgentDefinition(id).catch(err => {
        console.warn(`Failed to preload agent ${id}:`, err.message);
      }))
    );
  }

  /**
   * Check if agent exists
   */
  async agentExists(agentId: string): Promise<boolean> {
    try {
      await this.loadAgentDefinition(agentId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available agents
   */
  async listAvailableAgents(): Promise<string[]> {
    const pattern = '**/agents/*.md';
    const files = await glob(pattern, {
      cwd: this.options.agentsLibPath!,
      absolute: false
    });

    // Extract agent names from file paths
    return files
      .map(f => {
        const match = f.match(/agents\/(.+)\.md$/);
        return match ? match[1] : null;
      })
      .filter((name): name is string => name !== null);
  }
}
