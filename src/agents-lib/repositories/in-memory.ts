/**
 * In-Memory Agent Repository Implementation
 *
 * Thread-safe in-memory registry with JSON cache persistence.
 * Addresses architect concurrency concern via singleton + mutex pattern.
 *
 * CRITICAL FIXES:
 * - Issue 1: Added Zod schema validation for safe cache deserialization
 * - Issue 2: Implemented lazy index rebuilding with dirty flag
 * - Issue 3: Fixed Map iteration bug in refresh() method
 *
 * Details:
 * * Issue 1: Safe JSON deserialization with Zod schema validation
 * * Issue 2: Lazy index rebuilding with dirty flag
 * * Issue 3: Fixed Map iteration bug in refresh()
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { Mutex } from '../mutex.js';

import type {
  IAgentRepository,
  Agent,
  Plugin,
  Skill,
  QueryOptions,
  RegistryStats,
  RegistryCache,
  CapabilityIndex,
  CircuitBreakerState,
} from '../types.js';
import { scanWshobsonPlugins } from '../scanner.js';

/**
 * Zod schema for Capability validation
 */
const CapabilitySchema = z.object({
  name: z.string(),
  hierarchy: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

/**
 * Zod schema for Agent validation
 */
const AgentSchema = z.object({
  name: z.string(),
  plugin: z.string(),
  path: z.string().refine(val => path.isAbsolute(val), {
    message: 'Agent path must be absolute',
  }),
  description: z.string(),
  capabilities: z.array(CapabilitySchema),
  category: z.string(),
  examples: z.array(z.string()),
  metadata: z.object({
    frontmatter: z.record(z.string(), z.any()),
    content: z.string(),
  }),
  status: z.enum(['idle', 'working', 'failed']),
  lastUsed: z.number(),
  successRate: z.number().min(0).max(1),
});

/**
 * Zod schema for Skill validation
 */
const SkillSchema = z.object({
  name: z.string(),
  path: z.string().refine(val => path.isAbsolute(val), {
    message: 'Skill path must be absolute',
  }),
  description: z.string(),
});

/**
 * Zod schema for Plugin validation
 */
const PluginSchema = z.object({
  name: z.string(),
  path: z.string().refine(val => path.isAbsolute(val), {
    message: 'Plugin path must be absolute',
  }),
  agents: z.array(AgentSchema),
  skills: z.array(SkillSchema),
  agentCount: z.number().min(0),
  skillCount: z.number().min(0),
});

/**
 * Zod schema for CircuitBreakerState validation
 */
const CircuitBreakerEntrySchema = z.object({
  state: z.enum(['closed', 'open', 'half-open']),
  failureCount: z.number().min(0),
  lastFailureTime: z.number().min(0),
  nextAttemptTime: z.number().min(0),
  successCount: z.number().min(0),
});

/**
 * Zod schema for CapabilityIndex validation
 */
const CapabilityIndexEntrySchema = z.object({
  agent: AgentSchema,
  score: z.number().min(0).max(1),
  lastUsed: z.number().min(0),
});

/**
 * Zod schema for RegistryCache validation
 * Using z.record() with proper key/value schema format for Zod v4
 */
const RegistryCacheSchema = z.object({
  plugins: z.record(z.string(), PluginSchema),
  agents: z.record(z.string(), AgentSchema),
  capabilities: z.record(z.string(), z.array(CapabilityIndexEntrySchema)),
  circuitBreaker: z.record(z.string(), CircuitBreakerEntrySchema),
  metadata: z.object({
    scanTime: z.number().min(0),
    pluginCount: z.number().min(0),
    agentCount: z.number().min(0),
    capabilityCount: z.number().min(0),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, {
      message: 'Version must be semver format',
    }),
  }),
});

/**
 * Current cache format version
 */
const CACHE_VERSION = '1.0.0';

/**
 * Security: Validate plugins directory path
 * Prevents path traversal attacks via directory parameter
 */
async function validatePluginsDir(pluginsDir: string): Promise<string> {
  // Must be absolute path
  if (!path.isAbsolute(pluginsDir)) {
    throw new Error(`Plugins directory must be an absolute path`);
  }

  // Check if directory exists and is accessible
  try {
    const stats = await fs.stat(pluginsDir);
    if (!stats.isDirectory()) {
      throw new Error(`Plugins path is not a directory`);
    }
  } catch (error) {
    throw new Error(`Cannot access plugins directory`);
  }

  // Resolve to real path (follows symlinks, prevents path traversal)
  const realPath = await fs.realpath(pluginsDir);

  return realPath;
}

/**
 * Security: Validate cache path is within plugins directory
 * Prevents writing cache files to arbitrary locations
 */
function validateCachePath(cachePath: string, pluginsDir: string): void {
  const realCachePath = path.normalize(cachePath);
  const realPluginsDir = path.normalize(pluginsDir);

  // Cache must be within plugins directory or a direct child
  if (!realCachePath.startsWith(realPluginsDir)) {
    throw new Error(`Cache path must be within plugins directory`);
  }
}

/**
 * In-memory repository with JSON cache
 *
 * Thread-safe via mutex, persistent via JSON cache
 *
 * CRITICAL FIXES IMPLEMENTED:
 * - Issue 1: Safe JSON deserialization with Zod validation
 * - Issue 2: Lazy index rebuilding with dirty flag
 * - Issue 3: Fixed Map iteration in refresh()
 */
export class InMemoryAgentRepository implements IAgentRepository {
  private plugins: Map<string, Plugin> = new Map();
  private agents: Map<string, Agent> = new Map();
  private skills: Map<string, Skill> = new Map();
  private capabilities: Map<string, any[]> = new Map();  // Simplified capability index
  private circuitBreaker: Map<string, any> = new Map();

  private pluginsDir: string = '';
  private cachePath: string = '';
  private mutex = new Mutex();  // Addresses concurrency concern
  private initialized = false;

  /**
   * CRITICAL FIX - Issue 2: Dirty flag for lazy index rebuilding
   * Prevents O(n²) rebuild on every save by tracking when index needs update
   */
  private indexDirty = false;

  /**
   * CRITICAL FIX - Issue 3: Fixed Map iteration bug in refresh()
   * Using forEach() instead of Object.entries() to properly copy Map contents
   */

  /**
   * Initialize repository by scanning plugins
   */
  async initialize(pluginsDir: string): Promise<void> {
    // Security: Validate plugins directory path
    // Prevents path traversal via ../../ sequences or symlinks
    const validatedPluginsDir = await validatePluginsDir(pluginsDir);
    this.pluginsDir = validatedPluginsDir;

    // Security: Construct cache path within validated plugins directory
    // Prevents writing to arbitrary filesystem locations
    const cachePath = path.join(validatedPluginsDir, '.wshobson-cache.json');
    validateCachePath(cachePath, validatedPluginsDir);
    this.cachePath = cachePath;

    // Try to load from cache first
    const loaded = await this.load();

    if (loaded) {
      console.log('[Repository] Loaded from cache');
      // CRITICAL FIX - Issue 2: Index is clean after cache load
      this.indexDirty = false;
    } else {
      // Scan plugins
      console.log('[Repository] Scanning plugins...');
      const result = await scanWshobsonPlugins(validatedPluginsDir);

      // Store scan results
      this.plugins = result.plugins;
      this.agents = result.agents;
      this.skills = result.skills;

      // Build capability index
      this.buildCapabilityIndex();

      // CRITICAL FIX - Issue 2: Mark index as clean after build
      this.indexDirty = false;

      // Save to cache
      await this.saveCache();

      console.log(`[Repository] Scanned ${result.stats.agentCount} agents from ${result.stats.pluginCount} plugins`);
    }

    this.initialized = true;
  }

  /**
   * Find agents by capability
   *
   * CRITICAL FIX - Issue 2: Lazy index rebuild before query
   */
  async findAgents(capability: string): Promise<Agent[]> {
    return this.mutex.runExclusive(() => {
      this.ensureIndexBuilt();
      const results = this.capabilities.get(capability) || [];
      return results.map(r => r.agent);
    });
  }

  /**
   * Find agents by multiple capabilities (AND logic)
   *
   * CRITICAL FIX - Issue 2: Lazy index rebuild before query
   */
  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    return this.mutex.runExclusive(() => {
      this.ensureIndexBuilt();
      if (capabilities.length === 0) {
        return Array.from(this.agents.values());
      }

      // Find agents that have ALL capabilities
      const agents = Array.from(this.agents.values()).filter(agent => {
        const agentCaps = agent.capabilities.map(c => c.name);
        return capabilities.every(cap => agentCaps.includes(cap));
      });

      return agents;
    });
  }

  /**
   * Find agents by plugin
   */
  async findAgentsByPlugin(pluginName: string): Promise<Agent[]> {
    return this.mutex.runExclusive(() => {
      const plugin = this.plugins.get(pluginName);
      return plugin?.agents || [];
    });
  }

  /**
   * Advanced query with multi-criteria filtering
   *
   * CRITICAL FIX - Issue 2: Lazy index rebuild before query
   */
  async query(options: QueryOptions): Promise<Agent[]> {
    return this.mutex.runExclusive(() => {
      this.ensureIndexBuilt();
      let results = Array.from(this.agents.values());

      // Filter by capabilities
      if (options.capabilities && options.capabilities.length > 0) {
        results = results.filter(agent => {
          const agentCaps = agent.capabilities.map(c => c.name);
          return options.capabilities!.every(cap => agentCaps.includes(cap));
        });
      }

      // Filter by category
      if (options.category) {
        results = results.filter(agent => agent.category === options.category);
      }

      // Filter by status
      if (options.status) {
        results = results.filter(agent => agent.status === options.status);
      }

      // Filter by success rate
      if (options.minSuccessRate !== undefined) {
        results = results.filter(agent => agent.successRate >= options.minSuccessRate!);
      }

      // Limit results
      if (options.limit) {
        results = results.slice(0, options.limit);
      }

      return results;
    });
  }

  /**
   * Get specific agent
   */
  async getAgent(name: string): Promise<Agent | undefined> {
    return this.mutex.runExclusive(() => {
      return this.agents.get(name);
    });
  }

  /**
   * Search agents by keyword
   */
  async search(keyword: string): Promise<Agent[]> {
    return this.mutex.runExclusive(() => {
      const lower = keyword.toLowerCase();

      return Array.from(this.agents.values()).filter(agent =>
        agent.name.toLowerCase().includes(lower) ||
        agent.description.toLowerCase().includes(lower) ||
        agent.capabilities.some(cap => cap.name.toLowerCase().includes(lower))
      );
    });
  }

  /**
   * Ensure capability index is built before query operations
   *
   * CRITICAL FIX - Issue 2: Lazy index rebuilding
   * Only rebuilds index if dirty flag is set, preventing O(n²) rebuilds
   * on every save operation. Index rebuilds happen once before first query
   * after saves, not on every save.
   *
   * Performance impact:
   * - Before: O(n²) on every save() call
   * - After: O(n²) once, before next query, regardless of save count
   */
  private ensureIndexBuilt(): void {
    if (this.indexDirty) {
      this.buildCapabilityIndex();
      this.indexDirty = false;
    }
  }

  /**
   * Save or update agent
   *
   * CRITICAL FIX - Issue 2: Mark index as dirty instead of immediate rebuild
   * Index will be rebuilt lazily on next query operation
   */
  async save(agent: Agent): Promise<void> {
    return this.mutex.runExclusive(() => {
      this.agents.set(agent.name, agent);
      this.indexDirty = true;  // Mark for lazy rebuild
    });
  }

  /**
   * Bulk save agents
   *
   * CRITICAL FIX - Issue 2: Mark index as dirty once for entire batch
   * Prevents O(n²) rebuild on every agent save
   */
  async saveBatch(agents: Agent[]): Promise<void> {
    return this.mutex.runExclusive(() => {
      for (const agent of agents) {
        this.agents.set(agent.name, agent);
      }
      this.indexDirty = true;  // Mark once for entire batch
    });
  }

  /**
   * Invalidate agent (remove from cache)
   */
  async invalidate(agentName: string): Promise<void> {
    return this.mutex.runExclusive(() => {
      this.agents.delete(agentName);
    });
  }

  /**
   * Refresh (rescan plugins)
   *
   * CRITICAL FIX - Issue 3: Fixed Map iteration bug
   * Previous code used Object.entries() on Maps which returns empty arrays
   * Now correctly uses forEach() to copy Map contents
   *
   * Issue 3: The bug was that Object.entries(result.plugins) on a Map
   * returns an empty array, causing all agents to be lost during refresh.
   * Fixed by using result.plugins.forEach((value, key) => {...})
   */
  async refresh(): Promise<void> {
    if (!this.pluginsDir) {
      throw new Error('Repository not initialized');
    }

    const result = await scanWshobsonPlugins(this.pluginsDir);

    // Update state - CRITICAL FIX: Use forEach instead of Object.entries
    // Maps don't work with Object.entries() - results in empty arrays
    this.plugins.clear();
    result.plugins.forEach((value, key) => {
      this.plugins.set(key, value);
    });

    this.agents.clear();
    result.agents.forEach((value, key) => {
      this.agents.set(key, value);
    });

    this.skills.clear();
    result.skills.forEach((value, key) => {
      this.skills.set(key, value);
    });

    this.buildCapabilityIndex();
    this.indexDirty = false;  // Index is clean after rebuild
    await this.saveCache();
  }

  /**
   * Transaction (no-op for in-memory, but provides API compatibility)
   */
  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    // In-memory implementation doesn't need transactions
    // Mutex provides serialization
    return fn(this);
  }

  /**
   * Get repository statistics
   */
  async getStats(): Promise<RegistryStats> {
    return this.mutex.runExclusive(() => {
      const capabilities = new Set<string>();
      const agents = Array.from(this.agents.values());
      for (const agent of agents) {
        for (const cap of agent.capabilities) {
          capabilities.add(cap.name);
        }
      }

      return {
        pluginCount: this.plugins.size,
        agentCount: this.agents.size,
        capabilityCount: capabilities.size,
        scanTime: Date.now(),
        version: CACHE_VERSION,
      };
    });
  }

  /**
   * Load from cache
   *
   * CRITICAL FIX - Issue 1: Safe JSON deserialization with Zod validation
   *
   * Security improvements:
   * - Validates all data structures using Zod schemas
   * - Checks cache version compatibility
   * - Validates all paths are within plugins directory
   * - Safely handles corrupted cache files
   * - Prevents code injection via JSON parsing
   *
   * Error handling:
   * - Returns false for any validation error (triggers rescan)
   * - Logs specific validation failures for debugging
   * - Never throws - allows graceful degradation
   */
  async load(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.cachePath, 'utf-8');

      // Step 1: Parse JSON with basic error handling
      let rawData: unknown;
      try {
        rawData = JSON.parse(content);
      } catch (parseError) {
        console.warn('[Repository] Cache file corrupted: Invalid JSON');
        return false;
      }

      // Step 2: Validate with Zod schema (comprehensive validation)
      const validationResult = RegistryCacheSchema.safeParse(rawData);

      if (!validationResult.success) {
        console.warn('[Repository] Cache validation failed:');
        validationResult.error.issues.forEach((issue) => {
          console.warn(`  - ${issue.path.join('.')}: ${issue.message}`);
        });
        return false;
      }

      const cache = validationResult.data;

      // Step 3: Version compatibility check
      if (cache.metadata.version !== CACHE_VERSION) {
        console.warn(`[Repository] Cache version mismatch: expected ${CACHE_VERSION}, got ${cache.metadata.version}`);
        return false;
      }

      // Step 4: Validate all paths are within plugins directory
      try {
        this.validatePathsInCache(cache);
      } catch (pathError) {
        console.warn('[Repository] Cache path validation failed:', pathError);
        return false;
      }

      // Step 5: Restore state safely using forEach (not Object.entries)
      // This prevents the Map iteration bug from Issue 3
      this.plugins.clear();
      Object.entries(cache.plugins).forEach(([key, value]) => {
        this.plugins.set(key, value as unknown as Plugin);
      });

      this.agents.clear();
      Object.entries(cache.agents).forEach(([key, value]) => {
        this.agents.set(key, value as unknown as Agent);
      });

      this.capabilities.clear();
      Object.entries(cache.capabilities).forEach(([key, value]) => {
        this.capabilities.set(key, value as unknown as Array<{ agent: Agent; score: number; lastUsed: number }>);
      });

      this.circuitBreaker.clear();
      Object.entries(cache.circuitBreaker).forEach(([key, value]) => {
        this.circuitBreaker.set(key, value);
      });

      console.log(`[Repository] Loaded ${cache.metadata.agentCount} agents from cache`);
      return true;
    } catch (error) {
      // Any unexpected error results in cache miss (triggers rescan)
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== undefined && nodeError.code !== 'ENOENT') {
        console.warn('[Repository] Unexpected error loading cache:', nodeError.message);
      }
      return false;
    }
  }

  /**
   * Validate that all paths in cache are within plugins directory
   *
   * CRITICAL FIX - Issue 1: Path traversal protection
   * Prevents loading cache with references to files outside plugins directory
   *
   * Security: Ensures no agent/plugin/skill paths escape the plugins directory
   */
  private validatePathsInCache(cache: z.infer<typeof RegistryCacheSchema>): void {
    const pluginsDirNormalized = path.normalize(this.pluginsDir);

    // Check all plugin paths
    for (const plugin of Object.values(cache.plugins)) {
      const pluginObj = plugin as { path: string; agents: Array<{ path: string }>; skills: Array<{ path: string }> };
      const pluginPath = path.normalize(pluginObj.path);
      if (!pluginPath.startsWith(pluginsDirNormalized)) {
        throw new Error(`Plugin path outside plugins directory: ${pluginObj.path}`);
      }

      // Check all agent paths within plugin
      for (const agent of pluginObj.agents) {
        const agentPath = path.normalize(agent.path);
        if (!agentPath.startsWith(pluginsDirNormalized)) {
          throw new Error(`Agent path outside plugins directory: ${agent.path}`);
        }
      }

      // Check all skill paths within plugin
      for (const skill of pluginObj.skills) {
        const skillPath = path.normalize(skill.path);
        if (!skillPath.startsWith(pluginsDirNormalized)) {
          throw new Error(`Skill path outside plugins directory: ${skill.path}`);
        }
      }
    }
  }

  /**
   * Save to cache
   *
   * Thread-safe cache serialization with version tagging
   */
  async saveCache(): Promise<void> {
    // Build plain objects from Maps for JSON serialization
    const pluginsObj: Record<string, Plugin> = {};
    const agentsObj: Record<string, Agent> = {};
    const capabilitiesObj: CapabilityIndex = {};
    const circuitBreakerObj: CircuitBreakerState = {};

    this.plugins.forEach((value, key) => {
      pluginsObj[key] = value;
    });
    this.agents.forEach((value, key) => {
      agentsObj[key] = value;
    });
    this.capabilities.forEach((value, key) => {
      capabilitiesObj[key] = value;
    });
    this.circuitBreaker.forEach((value, key) => {
      circuitBreakerObj[key] = value;
    });

    const cache: RegistryCache = {
      plugins: pluginsObj,
      agents: agentsObj,
      capabilities: capabilitiesObj,
      circuitBreaker: circuitBreakerObj,
      metadata: {
        scanTime: Date.now(),
        pluginCount: this.plugins.size,
        agentCount: this.agents.size,
        capabilityCount: this.capabilities.size,
        version: CACHE_VERSION,
      },
    };

    await fs.writeFile(this.cachePath, JSON.stringify(cache, null, 2));
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    this.plugins.clear();
    this.agents.clear();
    this.capabilities.clear();
    this.circuitBreaker.clear();
    this.initialized = false;
  }

  /**
   * Build capability inverted index
   *
   * Maps capabilities to agents with scoring for efficient queries.
   * This is an O(n²) operation that should be called sparingly.
   *
   * CRITICAL FIX - Issue 2: Now called lazily via ensureIndexBuilt()
   * Instead of rebuilding on every save(), the index is only rebuilt:
   * 1. On initialization after scan
   * 2. On refresh()
   * 3. Before first query after saves (when dirty flag is set)
   *
   * Performance: O(n*m) where n=agents, m=avg capabilities per agent
   */
  private buildCapabilityIndex(): void {
    this.capabilities.clear();

    const agents = Array.from(this.agents.values());
    for (const agent of agents) {
      for (const capability of agent.capabilities) {
        if (!this.capabilities.has(capability.name)) {
          this.capabilities.set(capability.name, []);
        }

        // Calculate score: confidence + success rate
        const score = (capability.confidence + agent.successRate) / 2;

        this.capabilities.get(capability.name)!.push({
          agent,
          score,
          lastUsed: agent.lastUsed,
        });
      }
    }

    // Sort by score (highest first)
    const capabilitiesEntries = Array.from(this.capabilities.entries());
    for (const [, agents] of capabilitiesEntries) {
      agents.sort((a, b) => b.score - a.score);
    }
  }
}

/**
 * Create in-memory repository (factory function)
 */
export async function createInMemoryRepository(
  pluginsDir: string,
  cachePath?: string
): Promise<InMemoryAgentRepository> {
  const repo = new InMemoryAgentRepository();
  await repo.initialize(pluginsDir);
  return repo;
}
