/**
 * wshobson Agent Repository Types
 *
 * Defines the abstract interface for agent registry with swappable backend.
 * Addresses architect feedback on concurrency, cache invalidation, and query complexity.
 */

/**
 * Agent capability with hierarchical structure
 * Addresses architect concern about flat capability model
 */
export interface Capability {
  name: string;
  hierarchy: string[];  // e.g., ['backend', 'api', 'rest-api']
  confidence: number;   // 0-1, agent's proficiency level
}

/**
 * Agent definition with enhanced metadata
 */
export interface Agent {
  name: string;                    // e.g., "business-analyst"
  plugin: string;                  // parent plugin name
  path: string;                    // absolute path to .md file
  description: string;
  capabilities: Capability[];      // Enhanced from string[] to Capability[]
  category: string;
  examples: string[];
  metadata: {
    frontmatter: Record<string, any>;
    content: string;
  };
  status: 'idle' | 'working' | 'failed';  // For load balancing
  lastUsed: number;                // For LRU eviction
  successRate: number;             // 0-1, for smart selection
}

/**
 * Plugin metadata
 */
export interface Plugin {
  name: string;                    // e.g., "business-analytics"
  path: string;                    // absolute path to plugin
  agents: Agent[];                 // agents in this plugin
  skills: Skill[];                 // skills in this plugin
  agentCount: number;
  skillCount: number;
}

/**
 * Skill definition
 */
export interface Skill {
  name: string;
  path: string;
  description: string;
}

/**
 * Capability index with scoring
 * Addresses architect concern about efficient multi-criteria queries
 */
export interface CapabilityIndex {
  [capability: string]: Array<{
    agent: Agent;
    score: number;      // Combined confidence + match quality + success rate
    lastUsed: number;   // Timestamp for LRU eviction
  }>;
}

/**
 * Circuit breaker state (persisted)
 * Addresses architect must-have fix #3
 */
export interface CircuitBreakerState {
  [agentName: string]: {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
    successCount: number;  // For half-open state testing
  };
}

/**
 * File ownership contract
 * Addresses architect must-have fix #2
 */
export interface FileOwnership {
  ownedPaths: string[];           // Paths orchestrator owns
  readOnlyPaths: string[];        // Paths worker can read
  transferOnCompletion: boolean;  // Should worker transfer ownership back?
}

/**
 * Trace context for distributed tracing
 * Addresses architect improvement #5
 */
export interface TraceContext {
  traceId: string;        // UUID for entire workflow
  spanId: string;         // Current span
  parentSpanId?: string;  // Parent span
  baggage: Map<string, string>;  // Metadata propagation
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  pluginCount: number;
  agentCount: number;
  capabilityCount: number;
  scanTime: number;
  version: string;
}

/**
 * Registry cache (persisted to disk)
 * Enhanced with circuit breaker state
 *
 * Note: Uses plain objects instead of Maps for JSON serialization
 */
export interface RegistryCache {
  plugins: Record<string, Plugin>;
  agents: Record<string, Agent>;
  capabilities: CapabilityIndex;
  circuitBreaker: CircuitBreakerState;  // NEW - persisted state
  metadata: {
    scanTime: number;
    pluginCount: number;
    agentCount: number;
    capabilityCount: number;
    version: string;
  };
}

/**
 * Query options for advanced filtering
 */
export interface QueryOptions {
  capabilities?: string[];      // Filter by capabilities
  category?: string;             // Filter by category
  status?: 'idle' | 'working' | 'failed';  // Filter by status
  limit?: number;                // Max results
  minScore?: number;             // Minimum capability score
  minSuccessRate?: number;       // Minimum success rate
}

/**
 * Agent repository interface (abstract)
 * Enables backend swapping (InMemory ↔ SQLite)
 * Addresses architect must-have fix #1 and recommendation for Option D
 */
export interface IAgentRepository {
  // Query operations
  findAgents(capability: string): Promise<Agent[]>;
  findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]>;
  findAgentsByPlugin(pluginName: string): Promise<Agent[]>;
  query(options: QueryOptions): Promise<Agent[]>;  // Advanced multi-criteria query
  getAgent(name: string): Promise<Agent | undefined>;
  search(keyword: string): Promise<Agent[]>;

  // State operations
  save(agent: Agent): Promise<void>;
  saveBatch(agents: Agent[]): Promise<void>;  // Bulk save
  invalidate(agentName: string): Promise<void>;
  refresh(): Promise<void>;

  // Transactional support (addresses concurrency concern)
  transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T>;

  // Statistics
  getStats(): Promise<RegistryStats>;

  // Lifecycle
  initialize(pluginsDir: string): Promise<void>;
  load(): Promise<boolean>;  // Load from cache, returns true if successful
  saveCache(): Promise<void>;  // Persist to cache
  destroy(): Promise<void>;  // Cleanup
}

/**
 * Re-export LoadBalancingContext from load-balancer.ts for convenience
 */
export type { LoadBalancingContext } from './load-balancer.js';
