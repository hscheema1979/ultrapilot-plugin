/**
 * wshobson Load Balancer & Fallback System
 *
 * Provides intelligent load balancing and fallback chain management for agent delegation.
 * Ensures fair distribution of tasks across similar agents while maintaining quality
 * through graceful degradation when specialized agents are unavailable.
 *
 * Key Features:
 * - Round-robin with least-connection hybrid algorithm
 * - LRU agent selection for memory efficiency
 * - Configurable fallback chains (primary → secondary → generalist)
 * - Real-time utilization tracking
 * - Graceful degradation under load
 *
 * @module wshobson/load-balancer
 */

import type { Agent } from './types.js';

/**
 * Load balancing context for agent selection
 *
 * Provides runtime information about agent state and task characteristics
 * to inform load balancing decisions.
 *
 * @example
 * ```typescript
 * const context: LoadBalancingContext = {
 *   currentAssignments: new Map([
 *     ['agent-1', 3],
 *     ['agent-2', 1]
 *   ]),
 *   lastUsed: new Map([
 *     ['agent-1', 1640000000000],
 *     ['agent-2', 1640000100000]
 *   ]),
 *   taskComplexity: 'complex',
 *   preferSpecialists: true
 * };
 * ```
 */
export interface LoadBalancingContext {
  /**
   * Current active task count per agent
   * Used for least-connection load balancing
   */
  currentAssignments: Map<string, number>;

  /**
   * Last used timestamp per agent
   * Used for LRU (Least Recently Used) eviction
   */
  lastUsed: Map<string, number>;

  /**
   * Task complexity level
   * Influences whether to prefer specialists or generalists
   */
  taskComplexity: 'simple' | 'medium' | 'complex';

  /**
   * Whether to prefer specialized agents over generalists
   * Complex tasks should set this to true
   */
  preferSpecialists: boolean;

  /**
   * Maximum utilization threshold (0-1)
   * Agents above this threshold are less likely to be selected
   * Default: 0.8
   */
  maxUtilizationThreshold?: number;

  /**
   * Required capabilities for this task
   * Used to filter eligible agents
   */
  requiredCapabilities?: string[];
}

/**
 * Fallback chain for graceful degradation
 *
 * Defines a hierarchy of agents to try in order when delegation fails.
 * Provides automatic fallback from specialized to generalist agents.
 *
 * @example
 * ```typescript
 * const chain: FallbackChain = {
 *   primary: specialistAgent,
 *   secondary: backupSpecialist,
 *   tertiary: generalistAgent,
 *   generalist: fallbackAgent
 * };
 * ```
 */
export interface FallbackChain {
  /**
   * Primary agent - first choice for delegation
   * Should be the best match for the task
   */
  primary: Agent;

  /**
   * Secondary agent - fallback if primary fails
   * Should have similar capabilities to primary
   */
  secondary?: Agent;

  /**
   * Tertiary agent - third choice
   * Optional additional fallback level
   */
  tertiary?: Agent;

  /**
   * Generalist agent - final fallback
   * Should be a capable general-purpose agent
   * Acts as safety net when all specialists fail
   */
  generalist?: Agent;

  /**
   * Maximum depth of fallback to attempt
   * 1 = primary only, 2 = primary + secondary, etc.
   * Default: 3 (primary, secondary, generalist)
   */
  maxDepth?: number;
}

/**
 * Load balancing statistics
 *
 * Provides insights into agent utilization and load distribution.
 *
 * @example
 * ```typescript
 * const stats: LoadBalancingStats = {
 *   totalAssignments: 150,
 *   agentUtilization: new Map([
 *     ['agent-1', 0.75],
 *     ['agent-2', 0.50]
 *   ]),
 *   averageLoad: 0.62,
 *   mostUsedAgent: 'agent-1',
 *   leastUsedAgent: 'agent-3'
 * };
 * ```
 */
export interface LoadBalancingStats {
  /**
   * Total number of agent assignments made
   */
  totalAssignments: number;

  /**
   * Per-agent utilization score (0-1)
   * 1.0 = fully loaded, 0.0 = idle
   */
  agentUtilization: Map<string, number>;

  /**
   * Average load across all agents
   */
  averageLoad: number;

  /**
   * Most frequently used agent name
   */
  mostUsedAgent: string;

  /**
   * Least frequently used agent name
   */
  leastUsedAgent: string;

  /**
   * Standard deviation of agent utilization
   * Lower values indicate more balanced distribution
   */
  utilizationStdDev?: number;

  /**
   * Timestamp when stats were calculated
   */
  timestamp: number;
}

/**
 * Agent selection result with metadata
 *
 * @example
 * ```typescript
 * const result: AgentSelectionResult = {
 *   agent: selectedAgent,
 *   score: 0.85,
 *   reasoning: 'Best capability match with low utilization',
 *   fallbackChain: {
 *     primary: selectedAgent,
 *     secondary: backupAgent
 *   }
 * };
 * ```
 */
export interface AgentSelectionResult {
  /**
   * Selected agent
   */
  agent: Agent;

  /**
   * Selection score (0-1)
   * Higher scores indicate better matches
   */
  score: number;

  /**
   * Human-readable reasoning for selection
   */
  reasoning: string;

  /**
   * Fallback chain for this selection
   */
  fallbackChain: FallbackChain;

  /**
   * Whether this is a fallback selection
   * true if primary was unavailable and fallback was used
   */
  isFallback: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  MAX_UTILIZATION_THRESHOLD: 0.8,
  MAX_FALLBACK_DEPTH: 3,
  SCORE_WEIGHTS: {
    AVAILABILITY: 0.40,
    SUCCESS_RATE: 0.30,
    RECENT_USAGE: 0.20,
    LRU: 0.10,
  },
  UTILIZATION_SMOOTHING: 0.1, // Exponential moving average alpha
};

/**
 * Load Balancer for Agent Delegation
 *
 * Implements intelligent agent selection with:
 * - Round-robin with least-connection hybrid
 * - LRU eviction for memory efficiency
 * - Configurable fallback chains
 * - Real-time utilization tracking
 *
 * @example
 * ```typescript
 * const balancer = new LoadBalancer();
 *
 * const context: LoadBalancingContext = {
 *   currentAssignments: new Map(),
 *   lastUsed: new Map(),
 *   taskComplexity: 'complex',
 *   preferSpecialists: true
 * };
 *
 * const result = await balancer.selectAgent(
 *   [agent1, agent2, agent3],
 *   context
 * );
 *
 * console.log(`Selected: ${result.agent.name}`);
 * console.log(`Fallback chain: ${result.fallbackChain.secondary?.name || 'none'}`);
 * ```
 */
export class LoadBalancer {
  private assignmentHistory: Map<string, number[]>;
  private utilizationHistory: Map<string, number[]>;
  private totalAssignments: number;
  private maxHistorySize: number;

  /**
   * Create a new LoadBalancer
   *
   * @param maxHistorySize - Maximum number of historical assignments to track per agent
   *                        Default: 1000
   */
  constructor(maxHistorySize: number = 1000) {
    this.assignmentHistory = new Map();
    this.utilizationHistory = new Map();
    this.totalAssignments = 0;
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Select the best agent from candidates based on load balancing context
   *
   * Selection algorithm:
   * 1. Filter agents by capability match and availability
   * 2. Score each agent by:
   *    - Availability (40%): inverse of current assignments
   *    - Success rate (30%): agent's historical success rate
   *    - Recent usage (20%): prefer agents not used recently
   *    - LRU (10%): prefer least recently used agents
   * 3. Select highest-scoring agent below utilization threshold
   * 4. Build fallback chain from remaining candidates
   *
   * @param candidates - List of candidate agents
   * @param context - Load balancing context
   * @returns Selection result with agent and fallback chain
   *
   * @example
   * ```typescript
   * const result = balancer.selectAgent(
   *   [specialist1, specialist2, generalist],
   *   {
   *     currentAssignments: new Map([['specialist1', 5]]),
   *     lastUsed: new Map([['specialist1', Date.now()]]),
   *     taskComplexity: 'complex',
   *     preferSpecialists: true
   *   }
   * );
   * ```
   */
  selectAgent(
    candidates: Agent[],
    context: LoadBalancingContext
  ): AgentSelectionResult {
    if (candidates.length === 0) {
      throw new Error('No candidate agents provided');
    }

    // Filter agents by capability match if specified
    let eligibleAgents = candidates;
    if (context.requiredCapabilities && context.requiredCapabilities.length > 0) {
      eligibleAgents = candidates.filter(agent =>
        this.hasRequiredCapabilities(agent, context.requiredCapabilities!)
      );
    }

    if (eligibleAgents.length === 0) {
      throw new Error('No agents match required capabilities');
    }

    // Score and rank agents
    const scoredAgents = this.scoreAgents(eligibleAgents, context);

    // Sort by score descending
    scoredAgents.sort((a, b) => b.score - a.score);

    // Select best agent below utilization threshold
    const threshold = context.maxUtilizationThreshold ?? DEFAULT_CONFIG.MAX_UTILIZATION_THRESHOLD;
    let selectedAgent = scoredAgents[0].agent;
    let selectedIndex = 0;

    // Check if best agent is over threshold
    const topAgentUtilization = this.calculateUtilization(scoredAgents[0].agent.name, context);
    if (topAgentUtilization > threshold && scoredAgents.length > 1) {
      // Find first agent below threshold
      const belowThreshold = scoredAgents.find(s =>
        this.calculateUtilization(s.agent.name, context) <= threshold
      );
      if (belowThreshold) {
        selectedAgent = belowThreshold.agent;
        selectedIndex = scoredAgents.indexOf(belowThreshold);
      }
    }

    // Build fallback chain
    const fallbackChain = this.buildFallbackChain(
      scoredAgents.map(s => s.agent),
      selectedAgent,
      context
    );

    // Record assignment
    this.recordAssignment(selectedAgent.name);

    return {
      agent: selectedAgent,
      score: scoredAgents[selectedIndex].score,
      reasoning: this.generateReasoning(scoredAgents[selectedIndex], context),
      fallbackChain,
      isFallback: false,
    };
  }

  /**
   * Build a fallback chain from available agents
   *
   * Creates a hierarchy of agents to try in order:
   * 1. Primary (already selected)
   * 2. Secondary (next best specialist)
   * 3. Tertiary (third best)
   * 4. Generalist (fallback to generalist if available)
   *
   * @param agents - All available agents (sorted by preference)
   * @param primary - Primary agent (already selected)
   * @param context - Load balancing context
   * @returns Configured fallback chain
   */
  buildFallbackChain(
    agents: Agent[],
    primary: Agent,
    context: LoadBalancingContext
  ): FallbackChain {
    const maxDepth = context.maxUtilizationThreshold ?? DEFAULT_CONFIG.MAX_FALLBACK_DEPTH;

    // Filter out primary agent
    const fallbackCandidates = agents.filter(a => a.name !== primary.name);

    // Select secondary and tertiary by score
    const secondary = fallbackCandidates[0];
    const tertiary = fallbackCandidates[1];

    // Find a generalist fallback
    const generalist = fallbackCandidates.find(agent =>
      agent.capabilities.some(cap => cap.name === 'general-purpose' || cap.name === 'implementation')
    );

    return {
      primary,
      secondary,
      tertiary,
      generalist,
      maxDepth,
    };
  }

  /**
   * Select next agent from fallback chain
   *
   * Used when primary agent fails or is unavailable.
   * Progresses through fallback chain: primary → secondary → tertiary → generalist
   *
   * @param chain - Fallback chain
   * @param lastAttempted - Last agent that was attempted (failed)
   * @param context - Load balancing context
   * @returns Next agent to try, or null if chain exhausted
   *
   * @example
   * ```typescript
   * let currentAgent = chain.primary;
   * let result = await tryDelegate(currentAgent);
   *
   * while (!result.success) {
   *   const next = balancer.selectFromFallback(chain, currentAgent, context);
   *   if (!next) break; // Chain exhausted
   *
   *   currentAgent = next;
   *   result = await tryDelegate(currentAgent);
   * }
   * ```
   */
  selectFromFallback(
    chain: FallbackChain,
    lastAttempted: Agent,
    context: LoadBalancingContext
  ): Agent | null {
    // Determine next fallback level
    if (lastAttempted.name === chain.primary.name) {
      return chain.secondary ?? chain.generalist ?? null;
    }

    if (chain.secondary && lastAttempted.name === chain.secondary.name) {
      return chain.tertiary ?? chain.generalist ?? null;
    }

    if (chain.tertiary && lastAttempted.name === chain.tertiary.name) {
      return chain.generalist ?? null;
    }

    // Chain exhausted
    return null;
  }

  /**
   * Check if an agent is available for assignment
   *
   * An agent is considered available if:
   * - Status is 'idle'
   * - Current assignments are below threshold
   * - Not in circuit-breaker open state
   *
   * @param agent - Agent to check
   * @param context - Load balancing context
   * @returns true if agent is available
   */
  isAgentAvailable(agent: Agent, context: LoadBalancingContext): boolean {
    // Check status
    if (agent.status !== 'idle') {
      return false;
    }

    // Check utilization threshold
    const threshold = context.maxUtilizationThreshold ?? DEFAULT_CONFIG.MAX_UTILIZATION_THRESHOLD;
    const utilization = this.calculateUtilization(agent.name, context);
    if (utilization > threshold) {
      return false;
    }

    return true;
  }

  /**
   * Get load balancing statistics
   *
   * Returns comprehensive statistics about agent utilization and distribution.
   *
   * @returns Current load balancing statistics
   */
  getStats(): LoadBalancingStats {
    const agentUtilization = new Map<string, number>();
    let totalUtilization = 0;
    let mostUsedCount = -1;
    let leastUsedCount = Infinity;
    let mostUsedAgent = '';
    let leastUsedAgent = '';

    // Calculate utilization for each agent
    const agentEntries = Array.from(this.assignmentHistory.entries());
    for (const [agentName, assignments] of agentEntries) {
      const utilization = this.calculateUtilizationFromHistory(assignments);
      agentUtilization.set(agentName, utilization);
      totalUtilization += utilization;

      // Track most/least used
      if (assignments.length > mostUsedCount) {
        mostUsedCount = assignments.length;
        mostUsedAgent = agentName;
      }
      if (assignments.length < leastUsedCount) {
        leastUsedCount = assignments.length;
        leastUsedAgent = agentName;
      }
    }

    // Calculate average load
    const averageLoad = agentUtilization.size > 0
      ? totalUtilization / agentUtilization.size
      : 0;

    // Calculate standard deviation
    const stdDev = this.calculateStdDev(Array.from(agentUtilization.values()), averageLoad);

    return {
      totalAssignments: this.totalAssignments,
      agentUtilization,
      averageLoad,
      mostUsedAgent,
      leastUsedAgent,
      utilizationStdDev: stdDev,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset load balancer state
   *
   * Clears all assignment history and statistics.
   * Useful for testing or state cleanup.
   */
  reset(): void {
    this.assignmentHistory.clear();
    this.utilizationHistory.clear();
    this.totalAssignments = 0;
  }

  /**
   * Score agents based on multiple criteria
   *
   * @private
   */
  private scoreAgents(
    agents: Agent[],
    context: LoadBalancingContext
  ): Array<{ agent: Agent; score: number; details: Record<string, number> }> {
    const now = Date.now();
    const totalAssignments = Array.from(context.currentAssignments.values())
      .reduce((sum, count) => sum + count, 0);

    return agents.map(agent => {
      const assignments = context.currentAssignments.get(agent.name) || 0;
      const lastUsed = context.lastUsed.get(agent.name) || 0;
      const timeSinceLastUse = now - lastUsed;

      // Calculate individual scores
      const availabilityScore = this.calculateAvailabilityScore(assignments, totalAssignments);
      const successRateScore = agent.successRate;
      const recentUsageScore = this.calculateRecentUsageScore(timeSinceLastUse);
      const lruScore = this.calculateLRUScore(lastUsed, context.lastUsed);

      // Weighted combination
      const score =
        availabilityScore * DEFAULT_CONFIG.SCORE_WEIGHTS.AVAILABILITY +
        successRateScore * DEFAULT_CONFIG.SCORE_WEIGHTS.SUCCESS_RATE +
        recentUsageScore * DEFAULT_CONFIG.SCORE_WEIGHTS.RECENT_USAGE +
        lruScore * DEFAULT_CONFIG.SCORE_WEIGHTS.LRU;

      return {
        agent,
        score,
        details: {
          availability: availabilityScore,
          successRate: successRateScore,
          recentUsage: recentUsageScore,
          lru: lruScore,
        },
      };
    });
  }

  /**
   * Calculate availability score (inverse of current load)
   *
   * @private
   */
  private calculateAvailabilityScore(assignments: number, totalAssignments: number): number {
    if (totalAssignments === 0) {
      return 1.0;
    }

    // Normalize: 1.0 = no assignments, 0.0 = disproportionately high load
    const avgAssignments = totalAssignments / Math.max(1, this.assignmentHistory.size);
    const ratio = assignments / Math.max(1, avgAssignments);

    // Invert with clamping
    return Math.max(0, Math.min(1, 1 - (ratio - 1) * 0.5));
  }

  /**
   * Calculate recent usage score
   *
   * Prefer agents not used recently to distribute load.
   *
   * @private
   */
  private calculateRecentUsageScore(timeSinceLastUse: number): number {
    // 0ms = 0.0 score, 1 hour+ = 1.0 score
    const hour = 60 * 60 * 1000;
    return Math.min(1, timeSinceLastUse / hour);
  }

  /**
   * Calculate LRU (Least Recently Used) score
   *
   * Prefer agents with oldest lastUsed timestamp.
   *
   * @private
   */
  private calculateLRUScore(lastUsed: number, allLastUsed: Map<string, number>): number {
    if (allLastUsed.size === 0) {
      return 1.0;
    }

    // Find oldest and newest timestamps
    const timestamps = Array.from(allLastUsed.values());
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);

    if (oldest === newest) {
      return 1.0;
    }

    // Normalize: 1.0 = oldest, 0.0 = newest
    return 1 - ((lastUsed - oldest) / (newest - oldest));
  }

  /**
   * Calculate current utilization for an agent
   *
   * @private
   */
  private calculateUtilization(agentName: string, context: LoadBalancingContext): number {
    const assignments = context.currentAssignments.get(agentName) || 0;
    const maxConcurrent = 5; // Assumption: max 5 concurrent tasks per agent

    return Math.min(1, assignments / maxConcurrent);
  }

  /**
   * Calculate utilization from assignment history
   *
   * @private
   */
  private calculateUtilizationFromHistory(assignments: number[]): number {
    if (assignments.length === 0) {
      return 0;
    }

    // Count recent assignments (last 10 minutes)
    const tenMinutes = 10 * 60 * 1000;
    const now = Date.now();
    const recentAssignments = assignments.filter(timestamp => now - timestamp < tenMinutes);

    // Assume max 10 assignments per 10 minutes = 1.0 utilization
    return Math.min(1, recentAssignments.length / 10);
  }

  /**
   * Calculate standard deviation
   *
   * @private
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) {
      return 0;
    }

    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;

    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Record an agent assignment
   *
   * @private
   */
  private recordAssignment(agentName: string): void {
    if (!this.assignmentHistory.has(agentName)) {
      this.assignmentHistory.set(agentName, []);
    }

    const history = this.assignmentHistory.get(agentName)!;
    history.push(Date.now());

    // Trim history if needed
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.totalAssignments++;
  }

  /**
   * Check if agent has required capabilities
   *
   * @private
   */
  private hasRequiredCapabilities(agent: Agent, required: string[]): boolean {
    const agentCapabilities = new Set(agent.capabilities.map(c => c.name));

    return required.every(capability => agentCapabilities.has(capability));
  }

  /**
   * Generate human-readable reasoning for selection
   *
   * @private
   */
  private generateReasoning(
    scored: { agent: Agent; score: number; details: Record<string, number> },
    context: LoadBalancingContext
  ): string {
    const reasons: string[] = [];

    if (scored.details.availability > 0.7) {
      reasons.push('excellent availability');
    }
    if (scored.details.successRate > 0.8) {
      reasons.push('high success rate');
    }
    if (scored.details.recentUsage > 0.5) {
      reasons.push('not recently used');
    }
    if (scored.details.lru > 0.7) {
      reasons.push('least recently used');
    }

    if (reasons.length === 0) {
      return `Selected ${scored.agent.name} (score: ${scored.score.toFixed(2)})`;
    }

    return `Selected ${scored.agent.name} for ${reasons.join(', ')} (score: ${scored.score.toFixed(2)})`;
  }
}

/**
 * Create a load balancer instance
 *
 * Factory function for creating a load balancer with custom configuration.
 *
 * @param maxHistorySize - Maximum number of historical assignments to track per agent
 * @returns Configured load balancer instance
 *
 * @example
 * ```typescript
 * const balancer = createLoadBalancer(500);
 * ```
 */
export function createLoadBalancer(maxHistorySize?: number): LoadBalancer {
  return new LoadBalancer(maxHistorySize);
}
