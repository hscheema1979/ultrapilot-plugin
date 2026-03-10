/**
 * wshobson Agent Integration Type Definitions
 *
 * This file contains all type definitions for integrating wshobson/agents
 * into the UltraPilot system.
 */

/**
 * Unified metadata interface for both ultra and wshobson agents
 * Used for agent discovery, listing, and conflict resolution
 */
export interface UnifiedAgent {
  id: string;
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  source: 'ultrapilot' | 'wshobson';
  plugin?: string;
  domain?: string;
  capabilities: string[];
}

/**
 * Wshobson-specific agent definition
 * NAMED DIFFERENTLY to avoid conflict with existing AgentDefinition in src/agent-bridge/types.ts
 */
export interface WshobsonAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tier: 'opus' | 'sonnet' | 'haiku';
  capabilities: string[];
  plugin: string;
  domain: string;
}

/**
 * Cache structure matching ACTUAL .wshobson-cache.json layout
 */
export interface WshobsonCache {
  plugins: Record<string, {
    agents: CachedAgentDefinition[];
    agentCount: number;
  }>;
  version: string;
  lastUpdated: string;
}

/**
 * Agent definition as stored in cache
 */
export interface CachedAgentDefinition extends WshobsonAgentDefinition {
  cachedAt: string;
}

/**
 * Extended validation result
 * NOTE: This does NOT conflict with existing ValidationResult<T> in src/security/types.ts
 * because that type is generic ValidationResult<T> with different structure ({valid, sanitized, errors})
 */
export interface ValidationResultExtended {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Security validation result
 */
export interface SecurityResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Conflict resolution result
 */
export interface ConflictResolution {
  action: 'keep' | 'rename' | 'replace';
  reasoning: string;
}
