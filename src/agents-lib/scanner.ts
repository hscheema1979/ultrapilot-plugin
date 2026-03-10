/**
 * wshobson Plugin Scanner
 *
 * Scans wshobson-agents plugin directories to discover agents and skills.
 * Addresses Phase 1 requirements: plugin discovery and scanning.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

import type {
  Plugin,
  Agent,
  Skill,
} from './types.js';
import {
  parseAgentFrontmatter,
  validateAgent,
} from './schema.js';

/**
 * Security: Validate and sanitize file paths to prevent directory traversal attacks
 */
async function validatePath(filePath: string, allowedBase: string): Promise<boolean> {
  try {
    // Resolve both paths to absolute form, following symlinks
    const realPath = await fs.realpath(filePath);
    const realBase = await fs.realpath(allowedBase);

    // Check if the real path is within the allowed base directory
    return realPath.startsWith(realBase + path.sep) || realPath === realBase;
  } catch {
    // If path resolution fails, reject it
    return false;
  }
}

/**
 * Security: Validate plugins directory path before use
 */
async function validatePluginsDir(pluginsDir: string): Promise<string> {
  // Must be absolute path
  if (!path.isAbsolute(pluginsDir)) {
    throw new Error(`Plugins directory must be an absolute path: ${pluginsDir}`);
  }

  // Check if directory exists
  try {
    const stats = await fs.stat(pluginsDir);
    if (!stats.isDirectory()) {
      throw new Error(`Plugins path is not a directory: ${pluginsDir}`);
    }
  } catch (error) {
    throw new Error(`Cannot access plugins directory: ${pluginsDir}`);
  }

  // Resolve to real path (follows symlinks)
  const realPath = await fs.realpath(pluginsDir);

  return realPath;
}

/**
 * Plugin scanner options
 */
export interface ScannerOptions {
  pluginsDir: string;
  cachePath?: string;
  verbose?: boolean;
  /**
   * Maximum number of plugins to cache in memory
   * Default: 100
   */
  maxPlugins?: number;
  /**
   * Maximum number of agents to cache in memory
   * Default: 500
   */
  maxAgents?: number;
  /**
   * Maximum number of skills to cache in memory
   * Default: 500
   */
  maxSkills?: number;
}

/**
 * Simple LRU (Least Recently Used) Cache implementation
 *
 * Prevents unbounded memory growth by evicting least recently used items
 * when the cache reaches its maximum size.
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string, Agent>(100);
 * cache.set('agent-1', agentData);
 * const agent = cache.get('agent-1');
 * ```
 *
 * @template K - The type of cache keys
 * @template V - The type of cached values
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  /**
   * Create a new LRU cache
   *
   * @param maxSize - Maximum number of items to store (default: 100)
   */
  constructor(maxSize: number = 100) {
    if (maxSize <= 0) {
      throw new Error(`LRU cache maxSize must be positive, got: ${maxSize}`);
    }
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache
   *
   * Returns undefined if the key doesn't exist.
   * Accessing an item marks it as recently used.
   *
   * @param key - The cache key
   * @returns The cached value or undefined
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Mark as recently used by deleting and re-inserting
    // (Map maintains insertion order in JavaScript)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache
   *
   * If the cache is full, the least recently used item is evicted.
   *
   * @param key - The cache key
   * @param value - The value to cache
   */
  set(key: K, value: V): void {
    // Delete existing key to update its position if it exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict least recently used item if at capacity
    else if (this.cache.size >= this.maxSize) {
      // Get the first (oldest) key
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache
   *
   * @param key - The cache key
   * @returns True if the key exists
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove a specific key from the cache
   *
   * @param key - The cache key to remove
   * @returns True if the key was removed
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of items in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (ordered by recency)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values in the cache (ordered by recency)
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Get all entries in the cache (ordered by recency)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * Convert cache to a Map (for compatibility with existing code)
   */
  toMap(): Map<K, V> {
    return new Map(this.cache);
  }
}

/**
 * Scan result
 */
export interface ScanResult {
  plugins: Map<string, Plugin>;
  agents: Map<string, Agent>;
  skills: Map<string, Skill>;
  stats: {
    pluginCount: number;
    agentCount: number;
    skillCount: number;
    scanTime: number;
    version: string;
  };
  errors: string[];
}

/**
 * wshobson Plugin Scanner
 *
 * Scans plugin directories and extracts agent/skill metadata.
 * Uses LRU caches to prevent unbounded memory growth.
 */
export class WshobsonPluginScanner {
  private options: ScannerOptions;
  private plugins: LRUCache<string, Plugin>;
  private agents: LRUCache<string, Agent>;
  private skills: LRUCache<string, Skill>;
  private errors: string[] = [];

  constructor(options: ScannerOptions) {
    this.options = {
      verbose: false,
      maxPlugins: 100,
      maxAgents: 500,
      maxSkills: 500,
      ...options,
    };

    // Initialize LRU caches with configured limits
    this.plugins = new LRUCache(this.options.maxPlugins!);
    this.agents = new LRUCache(this.options.maxAgents!);
    this.skills = new LRUCache(this.options.maxSkills!);
  }

  /**
   * Clear all cached data
   *
   * Useful for forcing a fresh scan or reclaiming memory.
   */
  clearCache(): void {
    this.plugins.clear();
    this.agents.clear();
    this.skills.clear();
    this.errors = [];
  }

  /**
   * Get current cache statistics
   */
  getCacheStats(): {
    plugins: { size: number; maxSize: number };
    agents: { size: number; maxSize: number };
    skills: { size: number; maxSize: number };
  } {
    return {
      plugins: { size: this.plugins.size, maxSize: this.options.maxPlugins! },
      agents: { size: this.agents.size, maxSize: this.options.maxAgents! },
      skills: { size: this.skills.size, maxSize: this.options.maxSkills! },
    };
  }

  /**
   * Scan all plugins in the wshobson-agents directory
   */
  async scan(): Promise<ScanResult> {
    const startTime = Date.now();

    if (this.options.verbose) {
      console.log(`[Scanner] Scanning plugins in: ${this.options.pluginsDir}`);
    }

    try {
      // Security: Validate plugins directory before use
      const validatedPluginsDir = await validatePluginsDir(this.options.pluginsDir);

      if (this.options.verbose) {
        console.log(`[Scanner] Validated plugins directory: ${validatedPluginsDir}`);
      }

      // Find all plugin directories
      const pluginDirs = await glob(`${validatedPluginsDir}/*/`);

      if (this.options.verbose) {
        console.log(`[Scanner] Found ${pluginDirs.length} plugin directories`);
      }

      // Scan each plugin
      for (const pluginDir of pluginDirs) {
        // Security: Validate each plugin directory is within plugins dir
        if (await validatePath(pluginDir, validatedPluginsDir)) {
          await this.scanPlugin(pluginDir, validatedPluginsDir);
        } else {
          this.errors.push(`Security: Plugin directory outside allowed path: ${pluginDir}`);
        }
      }

      // Generate version hash (simple implementation)
      const version = this.generateVersionHash();

      const scanTime = Date.now() - startTime;

      if (this.options.verbose) {
        console.log(`[Scanner] Scan complete in ${scanTime}ms`);
        console.log(`[Scanner] Plugins: ${this.plugins.size}, Agents: ${this.agents.size}, Skills: ${this.skills.size}`);

        // Log cache efficiency
        const stats = this.getCacheStats();
        console.log(`[Scanner] Cache utilization: Plugins ${stats.plugins.size}/${stats.plugins.maxSize}, Agents ${stats.agents.size}/${stats.agents.maxSize}, Skills ${stats.skills.size}/${stats.skills.maxSize}`);
      }

      // Convert LRU caches to regular Maps for the return value
      // This ensures the internal caches can continue to be used for future scans
      return {
        plugins: this.plugins.toMap(),
        agents: this.agents.toMap(),
        skills: this.skills.toMap(),
        stats: {
          pluginCount: this.plugins.size,
          agentCount: this.agents.size,
          skillCount: this.skills.size,
          scanTime,
          version,
        },
        errors: this.errors,
      };
    } catch (error) {
      this.errors.push(`Scan failed: ${error}`);
      throw error;
    }
  }

  /**
   * Scan a single plugin directory
   */
  private async scanPlugin(pluginDir: string, validatedBase: string): Promise<void> {
    const pluginName = path.basename(pluginDir);

    try {
      if (this.options.verbose) {
        console.log(`[Scanner] Scanning plugin: ${pluginName}`);
      }

      // Security: Validate plugin directory is within allowed base
      if (!await validatePath(pluginDir, validatedBase)) {
        this.errors.push(`Security: Plugin directory validation failed: ${pluginDir}`);
        return;
      }

      // Scan agents
      const agentFiles = await glob(`${pluginDir}/agents/*.md`);
      const agents: Agent[] = [];

      for (const agentFile of agentFiles) {
        try {
          // Security: Validate agent file is within plugin directory
          if (await validatePath(agentFile, pluginDir)) {
            const agent = await this.scanAgent(agentFile, pluginName);
            if (agent) {
              agents.push(agent);
              this.agents.set(agent.name, agent);
            }
          } else {
            this.errors.push(`Security: Agent file outside plugin directory: ${agentFile}`);
          }
        } catch (error) {
          this.errors.push(`Failed to scan agent ${agentFile}: ${error}`);
        }
      }

      // Scan skills
      const skillDirs = await glob(`${pluginDir}/skills/*/*/`);
      const skills: Skill[] = [];

      for (const skillDir of skillDirs) {
        try {
          // Security: Validate skill directory is within plugin directory
          if (await validatePath(skillDir, pluginDir)) {
            const skill = await this.scanSkill(skillDir, pluginName);
            if (skill) {
              skills.push(skill);
              this.skills.set(skill.name, skill);
            }
          } else {
            this.errors.push(`Security: Skill directory outside plugin directory: ${skillDir}`);
          }
        } catch (error) {
          this.errors.push(`Failed to scan skill ${skillDir}: ${error}`);
        }
      }

      // Create plugin object
      const plugin: Plugin = {
        name: pluginName,
        path: pluginDir,
        agents,
        skills,
        agentCount: agents.length,
        skillCount: skills.length,
      };

      this.plugins.set(pluginName, plugin);

      if (this.options.verbose) {
        console.log(`[Scanner] Plugin ${pluginName}: ${agents.length} agents, ${skills.length} skills`);
      }
    } catch (error) {
      this.errors.push(`Failed to scan plugin ${pluginName}: ${error}`);
    }
  }

  /**
   * Scan a single agent file
   */
  private async scanAgent(agentFile: string, pluginName: string): Promise<Agent | null> {
    const content = await fs.readFile(agentFile, 'utf-8');

    // Parse frontmatter
    const { frontmatter, content: bodyContent, valid, errors } = parseAgentFrontmatter(content);

    if (!valid) {
      this.errors.push(`Agent ${agentFile}: ${errors.join(', ')}`);
    }

    // Parse capabilities
    const capabilities = this.parseCapabilities(frontmatter.capabilities || []);

    // Build agent object
    const agent: Agent = {
      name: frontmatter.name || path.basename(agentFile, '.md'),
      plugin: pluginName,
      path: agentFile,
      description: frontmatter.description || 'No description',
      capabilities,
      category: frontmatter.category || 'general',
      examples: [],  // Could parse from content
      metadata: {
        frontmatter,
        content: bodyContent,
      },
      status: 'idle',
      lastUsed: 0,
      successRate: 0.5,  // Default 50%
    };

    // Validate agent
    const validation = validateAgent(agent);
    if (!validation.valid) {
      this.errors.push(`Agent ${agent.name}: ${validation.errors.join(', ')}`);
    }

    return agent;
  }

  /**
   * Scan a single skill directory
   */
  private async scanSkill(skillDir: string, pluginName: string): Promise<Skill | null> {
    const skillFile = path.join(skillDir, 'SKILL.md');

    try {
      await fs.access(skillFile);
    } catch {
      // SKILL.md doesn't exist, skip
      return null;
    }

    const skillName = path.basename(path.dirname(skillDir));

    return {
      name: skillName,
      path: skillDir,
      description: `Skill from ${pluginName}`,
    };
  }

  /**
   * Parse capabilities from frontmatter
   *
   * Converts string[] to Capability[] with hierarchy
   */
  private parseCapabilities(capabilities: string[]): any[] {
    return capabilities.map(cap => {
      // Parse hierarchy: "backend.api.rest" -> ['backend', 'api', 'rest']
      const hierarchy = cap.split('.').filter(s => s.length > 0);

      return {
        name: hierarchy[hierarchy.length - 1] || cap,
        hierarchy,
        confidence: 0.8,  // Default confidence
      };
    });
  }

  /**
   * Generate version hash for cache invalidation
   *
   * Simple implementation: hash of plugin structure
   * In production: use proper hash (SHA-256)
   */
  private generateVersionHash(): string {
    const pluginNames = Array.from(this.plugins.keys()).sort();
    const agentCounts = Array.from(this.plugins.values()).map(p => p.agentCount);

    return `${pluginNames.length}-${agentCounts.join('-')}-${Date.now()}`;
  }
}

/**
 * Scan wshobson plugins (convenience function)
 */
export async function scanWshobsonPlugins(
  pluginsDir: string,
  options?: Partial<ScannerOptions>
): Promise<ScanResult> {
  const scanner = new WshobsonPluginScanner({
    pluginsDir,
    ...options,
  });

  return scanner.scan();
}
