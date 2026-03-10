/**
 * wshobson Agent Integration - In-Memory Repository
 *
 * In-memory implementation of IAgentRepository with JSON cache persistence.
 * Thread-safe with mutex for concurrent access.
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import type {
  Agent,
  Plugin,
  RegistryStats,
  RegistryCache,
  CircuitBreakerState,
  CacheOptions,
} from '../types.js';
import {
  BaseRepository,
  IAgentRepository,
} from '../repository.js';
import { PluginScanner } from '../scanner.js';

/**
 * Mutex for thread-safe operations
 */
class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.locked = true;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

/**
 * In-memory repository implementation
 */
export class InMemoryAgentRepository extends BaseRepository implements IAgentRepository {
  private plugins: Map<string, Plugin> = new Map();
  private agents: Map<string, Agent> = new Map();
  private circuitBreaker: CircuitBreakerState = {};
  private scanner: PluginScanner;
  private cacheOptions: CacheOptions;
  private pluginsPath: string;
  private lastScanTime = 0;
  private scanDuration = 0;
  private mutex = new Mutex();
  private cacheVersion = '';

  constructor(pluginsPath: string, cacheOptions: CacheOptions) {
    super();
    this.pluginsPath = pluginsPath;
    this.cacheOptions = cacheOptions;
    this.scanner = new PluginScanner({
      pluginsPath,
      onProgress: (stage, current, total) => {
        console.log(`[${stage}] ${current}/${total}`);
      },
    });
  }

  /**
   * Initialize repository from cache or scan
   */
  async initialize(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      // Try to load from cache
      const cached = await this.loadFromCache();

      if (cached && this.isCacheValid(cached)) {
        // Load from cache
        this.plugins = cached.plugins;
        this.agents = cached.agents;
        this.capabilityIndex = cached.capabilities;
        this.circuitBreaker = cached.circuitBreaker;
        this.lastScanTime = cached.metadata.scanTime;
        this.recordCacheHit();
        console.log(`Loaded ${this.agents.size} agents from cache`);
      } else {
        // Scan from source
        await this.scanAndCache();
      }
    } finally {
      release();
    }
  }

  /**
   * Find agents by capability
   */
  async findAgents(capability: string): Promise<Agent[]> {
    const release = await this.mutex.acquire();
    try {
      this.recordCacheHit();

      // Check capability index
      const indexKey = capability.toLowerCase();
      const indexed = this.capabilityIndex[indexKey];

      if (indexed && indexed.length > 0) {
        // Return agents sorted by score
        const agents = indexed
          .filter((item) => item.agent.status !== 'failed')
          .map((item) => item.agent);

        return agents;
      }

      // Fallback to linear search
      const results = this.scoreAgentsByCapability(
        Array.from(this.agents.values()),
        capability
      );

      return results
        .filter((item) => item.score > 0.3) // Minimum relevance threshold
        .filter((item) => item.agent.status !== 'failed')
        .map((item) => item.agent);
    } finally {
      release();
    }
  }

  /**
   * Find agents matching multiple capabilities (AND logic)
   */
  async findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]> {
    const release = await this.mutex.acquire();
    try {
      this.recordCacheHit();

      if (capabilities.length === 0) {
        return Array.from(this.agents.values()).filter((a) => a.status !== 'failed');
      }

      // Get agents for each capability
      const agentSets = await Promise.all(
        capabilities.map((cap) => this.findAgents(cap))
      );

      // Find intersection (agents that have ALL capabilities)
      const agentMap = new Map<string, Agent>();

      for (const agents of agentSets) {
        for (const agent of agents) {
          const existing = agentMap.get(agent.name);
          const count = existing ? 1 : 0; // Just track if agent exists
          agentMap.set(agent.name, agent);
        }
      }

      // Return agents that appear in ALL sets
      return Array.from(agentMap.values()).filter((agent) => {
        const appearances = agentSets.filter((set) => set.includes(agent)).length;
        return appearances === capabilities.length;
      });
    } finally {
      release();
    }
  }

  /**
   * Get specific agent by name
   */
  async getAgent(name: string): Promise<Agent | undefined> {
    const release = await this.mutex.acquire();
    try {
      this.recordCacheHit();
      return this.agents.get(name);
    } finally {
      release();
    }
  }

  /**
   * Find all agents in a specific plugin
   */
  async findByPlugin(pluginName: string): Promise<Agent[]> {
    const release = await this.mutex.acquire();
    try {
      this.recordCacheHit();
      const plugin = this.plugins.get(pluginName);
      return plugin ? plugin.agents.filter((a) => a.status !== 'failed') : [];
    } finally {
      release();
    }
  }

  /**
   * Search agents by keyword
   */
  async search(keyword: string): Promise<Agent[]> {
    const release = await this.mutex.acquire();
    try {
      this.recordCacheHit();
      const lowerKeyword = keyword.toLowerCase();

      return Array.from(this.agents.values()).filter((agent) => {
        if (agent.status === 'failed') return false;

        return (
          agent.name.toLowerCase().includes(lowerKeyword) ||
          agent.description.toLowerCase().includes(lowerKeyword) ||
          agent.capabilities.some((cap) =>
            cap.name.toLowerCase().includes(lowerKeyword)
          ) ||
          agent.plugin.toLowerCase().includes(lowerKeyword)
        );
      });
    } finally {
      release();
    }
  }

  /**
   * Save or update an agent
   */
  async save(agent: Agent): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.agents.set(agent.name, agent);

      // Update plugin
      const plugin = this.plugins.get(agent.plugin);
      if (plugin) {
        const existingIndex = plugin.agents.findIndex((a) => a.name === agent.name);
        if (existingIndex >= 0) {
          plugin.agents[existingIndex] = agent;
        } else {
          plugin.agents.push(agent);
          plugin.agentCount++;
        }
      }

      // Rebuild capability index
      this.capabilityIndex = this.buildCapabilityIndex(Array.from(this.agents.values()));

      // Persist to cache
      await this.saveToCache();
    } finally {
      release();
    }
  }

  /**
   * Invalidate agent cache
   */
  async invalidate(agentName: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const agent = this.agents.get(agentName);
      if (agent) {
        agent.lastUsed = 0; // Reset to force refresh
      }
    } finally {
      release();
    }
  }

  /**
   * Refresh entire registry from source
   */
  async refresh(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.scanAndCache();
    } finally {
      release();
    }
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<RegistryStats> {
    const release = await this.mutex.acquire();
    try {
      const capabilities = new Set<string>();
      for (const agent of this.agents.values()) {
        for (const cap of agent.capabilities) {
          capabilities.add(cap.name);
        }
      }

      return {
        pluginCount: this.plugins.size,
        agentCount: this.agents.size,
        capabilityCount: capabilities.size,
        cacheHitRate: this.getCacheHitRate(),
        lastScanTime: this.lastScanTime,
        scanDuration: this.scanDuration,
      };
    } finally {
      release();
    }
  }

  /**
   * Scan plugins and update cache
   */
  private async scanAndCache(): Promise<void> {
    console.log('Scanning plugins...');
    const result = await this.scanner.scan();

    this.plugins = result.plugins;
    this.agents = result.agents;
    this.capabilityIndex = this.buildCapabilityIndex(Array.from(this.agents.values()));
    this.lastScanTime = Date.now();
    this.scanDuration = result.stats.scanDuration;

    // Log errors
    for (const error of result.stats.errors) {
      console.warn(error);
    }

    // Calculate cache version
    this.cacheVersion = await this.calculateCacheVersionAsync();

    // Save to cache
    await this.saveToCache();

    this.recordCacheMiss();

    console.log(
      `Scanned ${result.stats.pluginCount} plugins, ${result.stats.agentCount} agents in ${result.stats.scanDuration}ms`
    );
  }

  /**
   * Load registry from cache
   */
  private async loadFromCache(): Promise<RegistryCache | null> {
    try {
      const cacheData = await fs.readFile(this.cacheOptions.cachePath, 'utf-8');
      const parsed = JSON.parse(cacheData);

      // Convert plain objects back to Maps
      const cache: RegistryCache = {
        plugins: new Map(Object.entries(parsed.plugins)),
        agents: new Map(Object.entries(parsed.agents)),
        capabilities: parsed.capabilities,
        circuitBreaker: parsed.circuitBreaker,
        metadata: parsed.metadata,
      };

      return cache;
    } catch (error) {
      console.warn('Failed to load cache:', error);
      return null;
    }
  }

  /**
   * Save registry to cache
   */
  private async saveToCache(): Promise<void> {
    try {
      const cache: RegistryCache = {
        plugins: this.plugins,
        agents: this.agents,
        capabilities: this.capabilityIndex,
        circuitBreaker: this.circuitBreaker,
        metadata: {
          scanTime: this.lastScanTime,
          pluginCount: this.plugins.size,
          agentCount: this.agents.size,
          capabilityCount: Object.keys(this.capabilityIndex).length,
          version: this.cacheVersion,
        },
      };

      // Convert Maps to plain objects for JSON serialization
      const serialized = {
        plugins: Object.fromEntries(cache.plugins),
        agents: Object.fromEntries(cache.agents),
        capabilities: cache.capabilities,
        circuitBreaker: cache.circuitBreaker,
        metadata: cache.metadata,
      };

      // Atomic write (write to temp file, then rename)
      const tempPath = `${this.cacheOptions.cachePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(serialized, null, 2), 'utf-8');
      await fs.rename(tempPath, this.cacheOptions.cachePath);

      console.log('Saved cache to', this.cacheOptions.cachePath);
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(cache: RegistryCache | null): boolean {
    if (!cache) return false;

    // Check TTL if specified
    if (this.cacheOptions.ttl) {
      const age = Date.now() - cache.metadata.scanTime;
      if (age > this.cacheOptions.ttl) {
        console.log('Cache expired (TTL)');
        return false;
      }
    }

    // Check version (skip for now - use simple timestamp)
    // const currentVersion = await this.calculateCacheVersionAsync();
    // if (cache.metadata.version !== currentVersion) {
    //   console.log('Cache version mismatch');
    //   return false;
    // }

    return true;
  }

  /**
   * Calculate cache version hash (async version)
   */
  private async calculateCacheVersionAsync(): Promise<string> {
    try {
      // Hash plugin directory structure
      const pluginDirs = await fs.readdir(this.pluginsPath);
      const hash = crypto.createHash('sha256');

      for (const dir of pluginDirs.sort()) {
        const pluginPath = `${this.pluginsPath}/${dir}`;
        try {
          const stats = await fs.stat(pluginPath);
          if (stats.isDirectory()) {
            hash.update(dir);
            hash.update(stats.mtime.getTime().toString());
          }
        } catch {
          // Skip files that can't be accessed
        }
      }

      return hash.digest('hex').substring(0, 16);
    } catch {
      return '';
    }
  }

}

export default InMemoryAgentRepository;
