/**
 * wshobson Agent Integration - Repository Interface
 *
 * Defines the abstract repository interface for agent registry operations.
 * Enables backend swappability (InMemory, SQLite, etc.)
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

import type {
  Agent,
  Capability,
  CapabilityIndex,
  Plugin,
  RegistryStats,
  TraceContext,
  FileOwnership,
} from './types.js';

/**
 * Abstract repository interface for agent registry operations
 *
 * This interface enables swappable backends (InMemory, SQLite, etc.)
 * without changing delegation layer code.
 */
export interface IAgentRepository {
  /**
   * Find agents by capability
   * Returns agents sorted by relevance score (descending)
   */
  findAgents(capability: string): Promise<Agent[]>;

  /**
   * Find agents matching multiple capabilities (AND logic)
   * Returns agents that have ALL specified capabilities
   */
  findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]>;

  /**
   * Get specific agent by name
   */
  getAgent(name: string): Promise<Agent | undefined>;

  /**
   * Find all agents in a specific plugin
   */
  findByPlugin(pluginName: string): Promise<Agent[]>;

  /**
   * Search agents by keyword (name, description, capabilities)
   */
  search(keyword: string): Promise<Agent[]>;

  /**
   * Save or update an agent in the registry
   */
  save(agent: Agent): Promise<void>;

  /**
   * Invalidate agent cache (mark for refresh)
   */
  invalidate(agentName: string): Promise<void>;

  /**
   * Refresh entire registry from source
   */
  refresh(): Promise<void>;

  /**
   * Execute transaction with ACID guarantees
   * Used for batch operations that must be atomic
   */
  transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T>;

  /**
   * Get registry statistics
   */
  getStats(): Promise<RegistryStats>;

  /**
   * Get capability index (for internal use)
   */
  getCapabilityIndex(): Promise<CapabilityIndex>;

  /**
   * Update capability index (for internal use)
   */
  updateCapabilityIndex(index: CapabilityIndex): Promise<void>;
}

/**
 * Repository factory interface
 */
export interface IRepositoryFactory {
  create(): Promise<IAgentRepository>;
  destroy(): Promise<void>;
}

/**
 * Base repository implementation with common utilities
 */
export abstract class BaseRepository implements IAgentRepository {
  protected capabilityIndex: CapabilityIndex = {};
  protected cacheHits = 0;
  protected cacheMisses = 0;

  abstract findAgents(capability: string): Promise<Agent[]>;
  abstract findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]>;
  abstract getAgent(name: string): Promise<Agent | undefined>;
  abstract findByPlugin(pluginName: string): Promise<Agent[]>;
  abstract search(keyword: string): Promise<Agent[]>;
  abstract save(agent: Agent): Promise<void>;
  abstract invalidate(agentName: string): Promise<void>;
  abstract refresh(): Promise<void>;
  abstract getStats(): Promise<RegistryStats>;

  /**
   * Default transaction implementation (override for proper ACID support)
   */
  async transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T> {
    return fn(this as IAgentRepository);
  }

  /**
   * Get capability index
   */
  async getCapabilityIndex(): Promise<CapabilityIndex> {
    return this.capabilityIndex;
  }

  /**
   * Update capability index
   */
  async updateCapabilityIndex(index: CapabilityIndex): Promise<void> {
    this.capabilityIndex = index;
  }

  /**
   * Calculate cache hit rate
   */
  protected getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? this.cacheHits / total : 0;
  }

  /**
   * Record cache hit
   */
  protected recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record cache miss
   */
  protected recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Build capability inverted index from agents
   */
  protected buildCapabilityIndex(agents: Agent[]): CapabilityIndex {
    const index: CapabilityIndex = {};

    for (const agent of agents) {
      for (const capability of agent.capabilities) {
        // Index by full hierarchy path
        const key = capability.hierarchy.join('::');

        if (!index[key]) {
          index[key] = [];
        }

        // Calculate score: confidence * success rate
        const score = capability.confidence * agent.successRate;

        index[key].push({
          agent,
          score,
          lastUsed: agent.lastUsed,
        });

        // Also index by individual hierarchy levels
        for (let i = 0; i < capability.hierarchy.length; i++) {
          const partialKey = capability.hierarchy.slice(0, i + 1).join('::');
          if (!index[partialKey]) {
            index[partialKey] = [];
          }
          // Add with slightly lower score for partial matches
          index[partialKey].push({
            agent,
            score: score * (0.9 - i * 0.1), // Decrease score for higher levels
            lastUsed: agent.lastUsed,
          });
        }

        // Index by capability name only
        if (!index[capability.name]) {
          index[capability.name] = [];
        }
        index[capability.name].push({
          agent,
          score: score * 0.8, // Lower score for name-only match
          lastUsed: agent.lastUsed,
        });
      }
    }

    // Sort each index entry by score (descending) and lastUsed (LRU)
    for (const key in index) {
      index[key].sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score; // Higher score first
        }
        return a.lastUsed - b.lastUsed; // Older (less recently used) first
      });
    }

    return index;
  }

  /**
   * Score agents by capability match
   */
  protected scoreAgentsByCapability(
    agents: Agent[],
    capability: string
  ): Array<{ agent: Agent; score: number }> {
    const scored = agents.map((agent) => {
      let maxScore = 0;

      for (const cap of agent.capabilities) {
        // Exact match
        if (cap.name === capability) {
          maxScore = Math.max(maxScore, cap.confidence * agent.successRate);
        }

        // Hierarchy match
        const hierarchyStr = cap.hierarchy.join('::');
        if (hierarchyStr.includes(capability)) {
          const score = cap.confidence * agent.successRate * 0.9;
          maxScore = Math.max(maxScore, score);
        }
      }

      return { agent, score: maxScore };
    });

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Filter agents by status (exclude failed agents)
   */
  protected filterAvailableAgents(agents: Agent[]): Agent[] {
    return agents.filter((agent) => agent.status !== 'failed');
  }
}

export default IAgentRepository;
