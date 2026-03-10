/**
 * Conflict Resolver for Agent Name Deduplication
 *
 * Resolves duplicate agent names across 177 wshobson + 40 ultra agents
 * using domain priority and namespacing strategies
 */

import { UnifiedAgent } from '../types/wshobson-types.js';
import { ConflictResolution } from '../types/wshobson-types.js';

export class ConflictResolver {
  private static DOMAIN_PRIORITY: Record<string, number> = {
    'software-dev': 100,
    'architecture': 90,
    'quality': 80,
    'security': 70,
    'operations': 60,
    'data': 50,
    'frontend': 40,
    'backend': 30,
    'general': 20
  };

  /**
   * Resolve duplicate agent names
   * FIXED: Both agents in duplicate pair get namespace suffixes
   *
   * @param agents - Array of agents with potential duplicate names
   * @returns Array with resolved names (no duplicates)
   */
  static resolveDuplicates(agents: UnifiedAgent[]): UnifiedAgent[] {
    const duplicates = this.findDuplicates(agents);
    const resolved: UnifiedAgent[] = [];
    const seen = new Set<string>();

    for (const agent of agents) {
      const duplicateGroup = duplicates.get(agent.name);

      if (!duplicateGroup || duplicateGroup.length === 1) {
        // No conflict - keep as-is
        resolved.push(agent);
        continue;
      }

      // Conflict exists - ALWAYS namespace
      const resolution = this.resolveConflict(agent, duplicateGroup);

      if (resolution.action === 'keep') {
        resolved.push(agent);
      } else if (resolution.action === 'rename') {
        // Namespace this agent
        const namespaced = {
          ...agent,
          id: `${agent.source}:${agent.plugin || 'default'}:${agent.name}`,
          name: `${agent.name}-${agent.source}`
        };

        // Avoid double-namespacing
        const uniqueKey = `${namespaced.id}:${namespaced.name}`;
        if (!seen.has(uniqueKey)) {
          resolved.push(namespaced);
          seen.add(uniqueKey);
        }
      }
      // 'replace' = skip this agent (the other one in the pair will be kept)
    }

    return resolved;
  }

  /**
   * Find agents with duplicate names
   */
  private static findDuplicates(agents: UnifiedAgent[]): Map<string, UnifiedAgent[]> {
    const map = new Map<string, UnifiedAgent[]>();

    for (const agent of agents) {
      const existing = map.get(agent.name) || [];
      existing.push(agent);
      map.set(agent.name, existing);
    }

    // Filter to only duplicates
    for (const [name, group] of map.entries()) {
      if (group.length === 1) {
        map.delete(name);
      }
    }

    return map;
  }

  /**
   * Resolve conflict for a specific agent
   */
  private static resolveConflict(
    agent: UnifiedAgent,
    group: UnifiedAgent[]
  ): ConflictResolution {
    const wshobsonAgent = group.find(a => a.source === 'wshobson');
    const ultraAgent = group.find(a => a.source === 'ultrapilot');

    if (!wshobsonAgent || !ultraAgent) {
      return { action: 'keep', reasoning: 'No conflict' };
    }

    const wshobsonPriority = this.DOMAIN_PRIORITY[wshobsonAgent.domain || 'general'] || 0;
    const ultraPriority = this.DOMAIN_PRIORITY[ultraAgent.domain || 'general'] || 0;

    if (wshobsonPriority > ultraPriority) {
      return {
        action: 'rename',
        reasoning: `wshobson agent has higher domain priority (${wshobsonAgent.domain})`
      };
    } else if (ultraPriority > wshobsonPriority) {
      return {
        action: 'replace',
        reasoning: `ultra agent has higher domain priority (${ultraAgent.domain}), skip wshobson agent`
      };
    }

    // Equal priority - namespace BOTH
    return {
      action: 'rename',
      reasoning: 'Equal priority - namespace both agents'
    };
  }
}
