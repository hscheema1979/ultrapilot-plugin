/**
 * wshobson Agent Integration - Load Balancing
 *
 * Distributes workload across agents to prevent single-agent overload
 * and optimize resource utilization.
 * Part of Phase 4: Smart Selection & Backend Decision
 */

import type { Agent, IAgentRepository } from './types.js';

/**
 * Agent load tracking
 */
interface AgentLoad {
  agentName: string;
  activeTasks: number;
  totalTasks: number;
  lastAssigned: number;
  avgTaskDuration: number; // milliseconds
}

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  /** Maximum concurrent tasks per agent */
  maxConcurrentTasks: number;
  /** Maximum percentage of total tasks a single agent can handle */
  maxLoadPercentage: number;
  /** LRU cache size for agent metadata */
  lruCacheSize: number;
  /** Enable load-based routing */
  enableLoadBasedRouting: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LoadBalancerConfig = {
  maxConcurrentTasks: 3,
  maxLoadPercentage: 0.4, // 40%
  lruCacheSize: 100,
  enableLoadBasedRouting: true,
};

/**
 * Load balancer for distributing agent workload
 */
export class LoadBalancer {
  private loadTracking = new Map<string, AgentLoad>();
  private lruCache: string[] = [];
  private config: LoadBalancerConfig;

  constructor(
    private repository: IAgentRepository,
    config: Partial<LoadBalancerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Select best agent from candidates based on load balancing
   */
  async selectAgent(candidates: Agent[]): Promise<Agent | null> {
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Filter out overloaded agents
    const available = candidates.filter(agent => this.isAgentAvailable(agent));

    if (available.length === 0) {
      // All agents overloaded, return least loaded
      return this.selectLeastLoaded(candidates);
    }

    if (available.length === 1) {
      return available[0];
    }

    // Select based on load balancing strategy
    if (this.config.enableLoadBasedRouting) {
      return this.selectByLoad(available);
    }

    // Default: Round-robin with LRU
    return this.selectByLRU(available);
  }

  /**
   * Check if agent is available for new task
   */
  isAgentAvailable(agent: Agent): boolean {
    const load = this.loadTracking.get(agent.name);

    if (!load) {
      return true; // No tracking yet, assume available
    }

    // Check concurrent task limit
    if (load.activeTasks >= this.config.maxConcurrentTasks) {
      return false;
    }

    // Check load percentage
    const totalTasks = this.getTotalTasks();
    if (totalTasks > 0) {
      const loadPercentage = load.totalTasks / totalTasks;
      if (loadPercentage > this.config.maxLoadPercentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record task assignment to agent
   */
  recordAssignment(agent: Agent): void {
    let load = this.loadTracking.get(agent.name);

    if (!load) {
      load = {
        agentName: agent.name,
        activeTasks: 0,
        totalTasks: 0,
        lastAssigned: 0,
        avgTaskDuration: 0,
      };
      this.loadTracking.set(agent.name, load);
    }

    load.activeTasks++;
    load.totalTasks++;
    load.lastAssigned = Date.now();

    // Update LRU cache
    this.updateLRU(agent.name);
  }

  /**
   * Record task completion
   */
  recordCompletion(agent: Agent, duration: number): void {
    const load = this.loadTracking.get(agent.name);

    if (!load) {
      return;
    }

    load.activeTasks--;
    load.avgTaskDuration = this.updateAverage(load.avgTaskDuration, load.totalTasks, duration);
  }

  /**
   * Record task failure
   */
  recordFailure(agent: Agent): void {
    const load = this.loadTracking.get(agent.name);

    if (!load) {
      return;
    }

    load.activeTasks--;
    // Don't decrement totalTasks - failures still count as load
  }

  /**
   * Get load statistics for all agents
   */
  getLoadStats(): Map<string, AgentLoad> {
    return new Map(this.loadTracking);
  }

  /**
   * Get agent load distribution
   */
  getLoadDistribution(): Map<string, number> {
    const distribution = new Map<string, number>();
    const totalTasks = this.getTotalTasks();

    if (totalTasks === 0) {
      return distribution;
    }

    for (const [agentName, load] of this.loadTracking) {
      const percentage = load.totalTasks / totalTasks;
      distribution.set(agentName, percentage);
    }

    return distribution;
  }

  /**
   * Check if load is balanced across agents
   */
  isLoadBalanced(): boolean {
    const distribution = this.getLoadDistribution();
    const maxLoad = Math.max(...distribution.values());

    return maxLoad <= this.config.maxLoadPercentage;
  }

  /**
   * Get agents exceeding load threshold
   */
  getOverloadedAgents(): string[] {
    const overloaded: string[] = [];
    const distribution = this.getLoadDistribution();

    for (const [agentName, percentage] of distribution) {
      if (percentage > this.config.maxLoadPercentage) {
        overloaded.push(agentName);
      }
    }

    return overloaded;
  }

  /**
   * Reset load tracking
   */
  resetTracking(): void {
    this.loadTracking.clear();
    this.lruCache = [];
  }

  /**
   * Select agent by current load (least loaded first)
   */
  private selectByLoad(agents: Agent[]): Agent {
    // Sort by active tasks, then total tasks
    const sorted = [...agents].sort((a, b) => {
      const loadA = this.loadTracking.get(a.name);
      const loadB = this.loadTracking.get(b.name);

      const activeA = loadA?.activeTasks || 0;
      const activeB = loadB?.activeTasks || 0;

      if (activeA !== activeB) {
        return activeA - activeB; // Fewer active tasks first
      }

      const totalA = loadA?.totalTasks || 0;
      const totalB = loadB?.totalTasks || 0;

      return totalA - totalB; // Fewer total tasks first
    });

    return sorted[0];
  }

  /**
   * Select agent by LRU (Least Recently Used)
   */
  private selectByLRU(agents: Agent[]): Agent {
    // Find agent that hasn't been used recently
    let leastRecent: Agent | null = null;
    let oldestTime = Infinity;

    for (const agent of agents) {
      const load = this.loadTracking.get(agent.name);
      const lastUsed = load?.lastAssigned || 0;

      if (lastUsed < oldestTime) {
        oldestTime = lastUsed;
        leastRecent = agent;
      }
    }

    return leastRecent || agents[0];
  }

  /**
   * Select least loaded agent (fallback when all are overloaded)
   */
  private selectLeastLoaded(agents: Agent[]): Agent {
    let leastLoaded: Agent | null = null;
    let lowestLoad = Infinity;

    for (const agent of agents) {
      const load = this.loadTracking.get(agent.name);
      const currentLoad = load?.activeTasks || 0;

      if (currentLoad < lowestLoad) {
        lowestLoad = currentLoad;
        leastLoaded = agent;
      }
    }

    return leastLoaded || agents[0];
  }

  /**
   * Update LRU cache
   */
  private updateLRU(agentName: string): void {
    // Remove from current position
    const index = this.lruCache.indexOf(agentName);
    if (index > -1) {
      this.lruCache.splice(index, 1);
    }

    // Add to front (most recently used)
    this.lruCache.unshift(agentName);

    // Trim cache if needed
    if (this.lruCache.length > this.config.lruCacheSize) {
      this.lruCache = this.lruCache.slice(0, this.config.lruCacheSize);
    }
  }

  /**
   * Get total tasks across all agents
   */
  private getTotalTasks(): number {
    let total = 0;

    for (const load of this.loadTracking.values()) {
      total += load.totalTasks;
    }

    return total;
  }

  /**
   * Update running average
   */
  private updateAverage(currentAvg: number, count: number, newValue: number): number {
    if (count === 1) {
      return newValue;
    }

    return (currentAvg * (count - 1) + newValue) / count;
  }

  /**
   * Get recommendations for load balancing
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this.isLoadBalanced()) {
      const overloaded = this.getOverloadedAgents();
      recommendations.push(
        `Load imbalance detected. Agents exceeding threshold: ${overloaded.join(', ')}`
      );
      recommendations.push('Consider distributing more tasks to underutilized agents');
    }

    // Check for idle agents
    const idleAgents: string[] = [];
    for (const [agentName, load] of this.loadTracking) {
      if (load.activeTasks === 0 && load.totalTasks > 0) {
        idleAgents.push(agentName);
      }
    }

    if (idleAgents.length > 0) {
      recommendations.push(
        `Idle agents available: ${idleAgents.join(', ')}`
      );
    }

    return recommendations;
  }
}
