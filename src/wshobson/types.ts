/**
 * wshobson Agent Integration - Type Definitions
 *
 * Defines all TypeScript interfaces for the agent registry system.
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

/**
 * Agent capability with hierarchical structure and confidence scoring
 */
export interface Capability {
  /** Capability name (e.g., "typescript", "api-design") */
  name: string;
  /** Hierarchy path from general to specific (e.g., ['backend', 'api', 'rest']) */
  hierarchy: string[];
  /** Agent's proficiency level (0.0 to 1.0) */
  confidence: number;
}

/**
 * Individual agent metadata
 */
export interface Agent {
  /** Agent name (e.g., "business-analyst", "typescript-expert") */
  name: string;
  /** Parent plugin name (e.g., "backend-development", "business-analytics") */
  plugin: string;
  /** Absolute path to agent's .md file */
  path: string;
  /** Human-readable description */
  description: string;
  /** Array of agent capabilities with metadata */
  capabilities: Capability[];
  /** Category classification */
  category: string;
  /** Example tasks this agent can handle */
  examples: string[];
  /** Additional metadata from frontmatter and content */
  metadata: {
    frontmatter: Record<string, any>;
    content: string;
  };
  /** Current operational status */
  status: 'idle' | 'working' | 'failed';
  /** Timestamp of last use (for LRU eviction) */
  lastUsed: number;
  /** Historical success rate (0.0 to 1.0) */
  successRate: number;
}

/**
 * Plugin metadata containing multiple agents
 */
export interface Plugin {
  /** Plugin name (e.g., "backend-development") */
  name: string;
  /** Absolute path to plugin directory */
  path: string;
  /** All agents in this plugin */
  agents: Agent[];
  /** Skills in this plugin (if any) */
  skills: Skill[];
  /** Number of agents */
  agentCount: number;
  /** Number of skills */
  skillCount: number;
}

/**
 * Skill metadata (from skills/ directories)
 */
export interface Skill {
  /** Skill name */
  name: string;
  /** Parent plugin */
  plugin: string;
  /** Absolute path to skill file */
  path: string;
  /** Skill description */
  description: string;
}

/**
 * Capability index with scoring for efficient agent lookup
 */
export interface CapabilityIndex {
  [capability: string]: Array<{
    agent: Agent;
    score: number; /** Combined confidence + match quality + success rate */
    lastUsed: number; /** Timestamp for LRU eviction */
  }>;
}

/**
 * Circuit breaker state for resilient agent delegation
 */
export interface CircuitBreakerState {
  [agentName: string]: {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
    successCount: number; /** For half-open state */
  };
}

/**
 * File ownership rules for delegation
 */
export interface FileOwnership {
  /** Paths orchestrator owns exclusively */
  ownedPaths: string[];
  /** Paths worker can read */
  readOnlyPaths: string[];
  /** Should worker transfer ownership back on completion? */
  transferOnCompletion: boolean;
}

/**
 * Distributed tracing context
 */
export interface TraceContext {
  /** UUID for entire workflow */
  traceId: string;
  /** Current span ID */
  spanId: string;
  /** Parent span ID (optional) */
  parentSpanId?: string;
  /** Metadata propagation */
  baggage: Map<string, string>;
}

/**
 * Registry cache structure for persistence
 */
export interface RegistryCache {
  /** All discovered plugins */
  plugins: Map<string, Plugin>;
  /** All discovered agents indexed by name */
  agents: Map<string, Agent>;
  /** Capability inverted index */
  capabilities: CapabilityIndex;
  /** Circuit breaker state (persisted) */
  circuitBreaker: CircuitBreakerState;
  /** Cache metadata */
  metadata: {
    scanTime: number;
    pluginCount: number;
    agentCount: number;
    capabilityCount: number;
    version: string; /** Hash for invalidation */
  };
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  pluginCount: number;
  agentCount: number;
  capabilityCount: number;
  cacheHitRate: number;
  lastScanTime: number;
  scanDuration: number;
}

/**
 * Delegation result from agent execution
 */
export interface DelegationResult {
  agent: string;
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
  traceId: string;
}

/**
 * Repository interface for agent registry operations
 */
export interface IAgentRepository {
  // Query operations
  findAgents(capability: string): Promise<Agent[]>;
  findAgentsByCapabilities(capabilities: string[]): Promise<Agent[]>;
  getAgent(name: string): Promise<Agent | undefined>;
  findByPlugin(pluginName: string): Promise<Agent[]>;
  search(keyword: string): Promise<Agent[]>;

  // State operations
  save(agent: Agent): Promise<void>;
  invalidate(agentName: string): Promise<void>;
  refresh(): Promise<void>;

  // Transactional support (ACID)
  transaction<T>(fn: (repo: IAgentRepository) => Promise<T>): Promise<T>;

  // Statistics
  getStats(): Promise<RegistryStats>;
}

/**
 * Scanner options
 */
export interface ScannerOptions {
  /** Root path to scan for plugins */
  pluginsPath: string;
  /** Maximum recursion depth for dependencies */
  maxDepth?: number;
  /** Callback for progress updates */
  onProgress?: (stage: string, current: number, total: number) => void;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Path to cache file */
  cachePath: string;
  /** TTL for cache in milliseconds */
  ttl?: number;
  /** Background refresh interval */
  refreshInterval?: number;
}
