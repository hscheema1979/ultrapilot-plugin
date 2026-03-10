/**
 * wshobson Agent Integration - Agent Selection
 *
 * Intelligent agent selection based on capability matching, success rates,
 * and usage patterns. Supports fallback chains and load balancing.
 * Part of Phase 4: Smart Selection & Backend Decision
 */

import type {
  Agent,
  Capability,
  IAgentRepository,
} from './types.js';

/**
 * Selection criteria for agent matching
 */
export interface SelectionCriteria {
  /** Required capabilities */
  requiredCapabilities: string[];
  /** Preferred capabilities (optional but weighted higher) */
  preferredCapabilities?: string[];
  /** Minimum success rate (0-1) */
  minSuccessRate?: number;
  /** Maximum number of agents to return */
  maxResults?: number;
  /** Exclude agents with specific status */
  excludeStatus?: Array<'idle' | 'working' | 'failed'>;
}

/**
 * Selection result with scoring
 */
export interface SelectionResult {
  agent: Agent;
  score: number;
  matchReason: string[];
}

/**
 * Agent selector for intelligent task-agent matching
 */
export class AgentSelector {
  constructor(private repository: IAgentRepository) {}

  /**
   * Select best agent for a task based on required capabilities
   */
  async selectAgent(criteria: SelectionCriteria): Promise<SelectionResult | null> {
    const agents = await this.findCandidates(criteria);

    if (agents.length === 0) {
      return null;
    }

    // Score and rank agents
    const scored = await this.scoreAgents(agents, criteria);

    // Return best agent
    return scored[0] || null;
  }

  /**
   * Select multiple agents for parallel delegation
   */
  async selectAgents(criteria: SelectionCriteria, count: number): Promise<SelectionResult[]> {
    const agents = await this.findCandidates(criteria);

    if (agents.length === 0) {
      return [];
    }

    // Score and rank agents
    const scored = await this.scoreAgents(agents, criteria);

    // Return top N agents
    return scored.slice(0, count);
  }

  /**
   * Select agents with fallback chain
   */
  async selectWithFallback(criteria: SelectionCriteria): Promise<SelectionResult[]> {
    const agents = await this.findCandidates(criteria);

    if (agents.length === 0) {
      return [];
    }

    // Score and rank all agents
    const scored = await this.scoreAgents(agents, criteria);

    // Build fallback chain (primary, secondary, tertiary, generalist)
    return scored;
  }

  /**
   * Parse task description to extract required capabilities
   */
  parseTaskCapabilities(task: string): string[] {
    const capabilities: string[] = [];
    const lowerTask = task.toLowerCase();

    // Technology keywords
    const techKeywords = {
      'typescript': ['typescript', 'ts', 'typing'],
      'javascript': ['javascript', 'js', 'es6', 'nodejs'],
      'python': ['python', 'py', 'django', 'flask'],
      'java': ['java', 'spring', 'maven'],
      'rust': ['rust', 'cargo', 'rustlang'],
      'go': ['go', 'golang', 'goroutine'],
      'sql': ['sql', 'database', 'query', 'postgresql', 'mysql'],
      'api': ['api', 'rest', 'graphql', 'endpoint'],
      'frontend': ['frontend', 'ui', 'react', 'vue', 'angular', 'html', 'css'],
      'backend': ['backend', 'server', 'microservice'],
      'testing': ['test', 'testing', 'tdd', 'jest', 'pytest'],
      'security': ['security', 'auth', 'authentication', 'authorization', 'oauth'],
      'devops': ['devops', 'deploy', 'ci/cd', 'docker', 'kubernetes'],
      'documentation': ['documentation', 'docs', 'readme', 'api-doc'],
    };

    // Match keywords
    for (const [capability, keywords] of Object.entries(techKeywords)) {
      if (keywords.some(keyword => lowerTask.includes(keyword))) {
        capabilities.push(capability);
      }
    }

    // Action keywords
    if (lowerTask.includes('build') || lowerTask.includes('create') || lowerTask.includes('implement')) {
      capabilities.push('implementation');
    }
    if (lowerTask.includes('design') || lowerTask.includes('architect')) {
      capabilities.push('design');
    }
    if (lowerTask.includes('test') || lowerTask.includes('verify')) {
      capabilities.push('testing');
    }
    if (lowerTask.includes('review') || lowerTask.includes('audit')) {
      capabilities.push('review');
    }
    if (lowerTask.includes('fix') || lowerTask.includes('debug')) {
      capabilities.push('debugging');
    }

    return [...new Set(capabilities)]; // Deduplicate
  }

  /**
   * Find candidate agents matching criteria
   */
  private async findCandidates(criteria: SelectionCriteria): Promise<Agent[]> {
    const {
      requiredCapabilities,
      minSuccessRate = 0.5,
      excludeStatus = ['failed'],
    } = criteria;

    // Find agents by capabilities
    let agents: Agent[];
    if (requiredCapabilities.length === 1) {
      agents = await this.repository.findAgents(requiredCapabilities[0]);
    } else {
      agents = await this.repository.findAgentsByCapabilities(requiredCapabilities);
    }

    // Filter by success rate and status
    return agents.filter(agent => {
      if (agent.successRate < minSuccessRate) {
        return false;
      }
      if (excludeStatus.includes(agent.status)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Score agents by capability match, success rate, and usage
   */
  private async scoreAgents(agents: Agent[], criteria: SelectionCriteria): Promise<SelectionResult[]> {
    const {
      requiredCapabilities,
      preferredCapabilities = [],
    } = criteria;

    const results = agents.map(agent => {
      let score = 0;
      const reasons: string[] = [];

      // Base score from success rate (0-1)
      score += agent.successRate * 0.3;
      if (agent.successRate > 0.9) {
        reasons.push(`high success rate (${(agent.successRate * 100).toFixed(0)}%)`);
      }

      // Capability match score (0-1)
      const { matchScore, matchReasons } = this.calculateCapabilityMatch(
        agent,
        requiredCapabilities,
        preferredCapabilities
      );
      score += matchScore * 0.5;
      reasons.push(...matchReasons);

      // Recency bonus (prefer agents not used recently)
      const daysSinceLastUse = (Date.now() - agent.lastUsed) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse > 7) {
        score += 0.1;
        reasons.push('available (not used recently)');
      } else if (agent.status === 'idle') {
        score += 0.05;
        reasons.push('currently idle');
      }

      // Status penalty
      if (agent.status === 'working') {
        score -= 0.1;
      }

      return {
        agent,
        score: Math.max(0, Math.min(1, score)),
        matchReason: reasons,
      };
    });

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Calculate capability match score
   */
  private calculateCapabilityMatch(
    agent: Agent,
    required: string[],
    preferred: string[]
  ): { matchScore: number; matchReasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    const agentCaps = agent.capabilities.map(c => c.name);
    const agentHierarchy = agent.capabilities.flatMap(c => c.hierarchy);

    // Check required capabilities
    const requiredMatches = required.filter(cap =>
      agentCaps.includes(cap) || agentHierarchy.some(h => h.includes(cap))
    );
    const requiredScore = required.length > 0 ? requiredMatches.length / required.length : 1;
    score += requiredScore * 0.7;

    if (requiredMatches.length > 0) {
      reasons.push(`matches required capabilities: ${requiredMatches.join(', ')}`);
    }

    // Check preferred capabilities
    const preferredMatches = preferred.filter(cap =>
      agentCaps.includes(cap) || agentHierarchy.some(h => h.includes(cap))
    );
    const preferredScore = preferred.length > 0 ? preferredMatches.length / preferred.length : 0;
    score += preferredScore * 0.3;

    if (preferredMatches.length > 0) {
      reasons.push(`also has preferred: ${preferredMatches.join(', ')}`);
    }

    // Confidence bonus
    const avgConfidence = agent.capabilities.reduce((sum, cap) => sum + cap.confidence, 0) / agent.capabilities.length;
    if (avgConfidence > 0.8) {
      score += 0.1;
      reasons.push(`high capability confidence (${(avgConfidence * 100).toFixed(0)}%)`);
    }

    return { matchScore: Math.min(1, score), matchReasons: reasons };
  }

  /**
   * Auto-select agent for simple task
   */
  async autoSelect(task: string): Promise<SelectionResult | null> {
    const capabilities = this.parseTaskCapabilities(task);

    if (capabilities.length === 0) {
      // No specific capabilities needed, return generalist
      const agents = await this.repository.findAgents('general');
      if (agents.length > 0) {
        return {
          agent: agents[0],
          score: 0.5,
          matchReason: ['generalist agent'],
        };
      }
      return null;
    }

    return this.selectAgent({
      requiredCapabilities: capabilities,
      minSuccessRate: 0.7,
      excludeStatus: ['failed'],
    });
  }

  /**
   * Select agents for parallel delegation
   */
  async selectForParallel(task: string, count: number): Promise<SelectionResult[]> {
    const capabilities = this.parseTaskCapabilities(task);

    return this.selectAgents(
      {
        requiredCapabilities: capabilities,
        minSuccessRate: 0.6,
        excludeStatus: ['failed', 'working'],
      },
      count
    );
  }
}
