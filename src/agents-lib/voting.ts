/**
 * wshobson Voting Mechanism
 *
 * Provides configurable voting for conflict resolution with:
 * - Weighted votes per agent
 * - Security reviewer veto power
 * - Architect tie-breaker
 * - Human escalation for unresolvable conflicts
 * - Conflict logging to .ultra/conflicts.json
 *
 * @example
 * ```typescript
 * const voting = new VotingMechanism(workspacePath);
 * const result = await voting.resolveConflict(conflict, {
 *   securityVeto: true,
 *   architectTieBreaker: true
 * });
 * ```
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Vote weight configuration
 */
export interface AgentWeights {
  [agentName: string]: number;
}

/**
 * Vote cast by an agent
 */
export interface Vote {
  agent: string;
  content: string;
  weight: number;
}

/**
 * Voting result
 */
export interface VotingResult {
  /**
   * Winning content
   */
  winner: string;

  /**
   * Agents who voted for the winner
   */
  winnerAgents: string[];

  /**
   * Total weight for winner
   */
  winnerWeight: number;

  /**
   * Total weight of all votes
   */
  totalWeight: number;

  /**
   * Percentage of weight for winner
   */
  percentage: number;

  /**
   * Resolution method used
   */
  method: 'consensus' | 'majority' | 'veto' | 'tie-break' | 'escalated';

  /**
   * All votes cast
   */
  votes: Vote[];

  /**
   * Whether conflict was escalated
   */
  escalated: boolean;
}

/**
 * Conflict record for logging
 */
export interface ConflictRecord {
  timestamp: string;
  type: string;
  description: string;
  agents: string[];
  location?: string;
  votingResult: {
    winner?: string;
    method: string;
    escalated: boolean;
    percentage?: number;
  };
}

/**
 * Voting options
 */
export interface VotingOptions {
  /**
   * Custom weights per agent
   */
  weights?: AgentWeights;

  /**
   * Enable security reviewer veto
   * Default: true
   */
  securityVeto?: boolean;

  /**
   * Enable architect tie-breaker
   * Default: true
   */
  architectTieBreaker?: boolean;

  /**
   * Minimum consensus threshold (0-1)
   * If consensus below this, escalate
   * Default: 0.5 (50%)
   */
  minConsensus?: number;

  /**
   * Conflict log file path
   * Default: .ultra/conflicts.json
   */
  conflictsPath?: string;
}

/**
 * Default agent weights
 */
const DEFAULT_WEIGHTS: AgentWeights = {
  'ultra:security-reviewer': 2.0,
  'ultra:architect': 1.5,
  'ultra:quality-reviewer': 1.2,
  'ultra:code-reviewer': 1.2,
  'ultra:verifier': 1.1,
};

/**
 * Voting Mechanism
 *
 * Handles weighted voting with special rules for conflict resolution.
 */
export class VotingMechanism {
  private conflictsPath: string;
  private defaultWeights: AgentWeights;

  constructor(workspacePath: string = '/tmp/ultrapilot') {
    this.conflictsPath = path.join(workspacePath, '.ultra/conflicts.json');
    this.defaultWeights = { ...DEFAULT_WEIGHTS };
  }

  /**
   * Resolve a conflict through voting
   *
   * @param conflict - The conflict to resolve
   * @param proposals - Proposal from each agent
   * @param options - Voting options
   * @returns Voting result with winner
   */
  async resolveConflict(
    conflict: {
      type: string;
      description: string;
      location?: string;
    },
    proposals: Array<{ agent: string; content: string }>,
    options: VotingOptions = {}
  ): Promise<VotingResult> {
    // Merge weights
    const weights = {
      ...this.defaultWeights,
      ...(options.weights || {}),
    };

    // Build votes with weights
    const votes: Vote[] = proposals.map((p) => ({
      agent: p.agent,
      content: p.content,
      weight: weights[p.agent] || 1.0,
    }));

    // Check for security veto
    if (conflict.type === 'security' && options.securityVeto !== false) {
      const vetoResult = this.checkSecurityVeto(votes);
      if (vetoResult) {
        const result = this.buildResult(votes, vetoResult, 'veto');
        await this.logConflict(conflict, result);
        return result;
      }
    }

    // Group similar proposals
    const groups = this.groupSimilarProposals(votes);

    // Calculate weighted totals
    const tallies = this.calculateTallies(groups);

    // Find winner(s)
    const winners = this.findWinners(tallies);

    // Handle tie
    let winnerGroup = winners[0];
    let method: 'consensus' | 'majority' | 'veto' | 'tie-break' | 'escalated' = 'majority';

    if (winners.length > 1) {
      if (options.architectTieBreaker !== false) {
        winnerGroup = this.applyArchitectTieBreaker(winners);
        method = 'tie-break';
      } else {
        // Escalate tie
        const escalatedResult = this.escalateConflict(votes, 'tie');
        await this.logConflict(conflict, escalatedResult);
        return escalatedResult;
      }
    }

    // Check consensus threshold
    const totalWeight = Array.from(tallies.values()).reduce((sum, w) => sum + w.weight, 0);
    const percentage = winnerGroup.weight / totalWeight;
    const minConsensus = options.minConsensus ?? 0.5;

    if (percentage < minConsensus) {
      const escalatedResult = this.escalateConflict(votes, 'low-consensus');
      await this.logConflict(conflict, escalatedResult);
      return escalatedResult;
    }

    // Check for consensus (100%)
    if (percentage === 1.0) {
      method = 'consensus';
    }

    // Build result
    const result: VotingResult = {
      winner: winnerGroup.content,
      winnerAgents: winnerGroup.agents,
      winnerWeight: winnerGroup.weight,
      totalWeight,
      percentage,
      method,
      votes,
      escalated: false,
    };

    await this.logConflict(conflict, result);
    return result;
  }

  /**
   * Check for security reviewer veto
   *
   * If security reviewer votes against a proposal, that proposal is rejected.
   */
  private checkSecurityVeto(votes: Vote[]): Vote | null {
    const securityVote = votes.find((v) => v.agent.includes('security'));

    if (!securityVote) {
      return null; // No security reviewer present
    }

    // Check if any non-security votes differ
    const hasOpposition = votes.some(
      (v) =>
        !v.agent.includes('security') &&
        !this.similar(v.content, securityVote.content, 0.8)
    );

    if (hasOpposition) {
      // Security veto applies - return security vote as winner
      return securityVote;
    }

    return null;
  }

  /**
   * Group similar proposals
   */
  private groupSimilarProposals(votes: Vote[]): Map<string, Vote[]> {
    const groups = new Map<string, Vote[]>();

    for (const vote of votes) {
      // Find existing similar group
      let matched = false;
      for (const [key, groupVotes] of Array.from(groups.entries())) {
        if (this.similar(vote.content, key, 0.8)) {
          groupVotes.push(vote);
          matched = true;
          break;
        }
      }

      if (!matched) {
        groups.set(vote.content, [vote]);
      }
    }

    return groups;
  }

  /**
   * Calculate weighted totals for each group
   */
  private calculateTallies(
    groups: Map<string, Vote[]>
  ): Map<string, { weight: number; agents: string[]; content: string }> {
    const tallies = new Map();

    for (const [content, votes] of Array.from(groups.entries())) {
      const weight = votes.reduce((sum, v) => sum + v.weight, 0);
      const agents = votes.map((v) => v.agent);

      tallies.set(content, { weight, agents, content });
    }

    return tallies;
  }

  /**
   * Find winning group(s)
   */
  private findWinners<T extends { weight: number }>(
    tallies: Map<string, T>
  ): T[] {
    let maxWeight = 0;
    const winners: T[] = [];

    for (const group of Array.from(tallies.values())) {
      if (group.weight > maxWeight) {
        maxWeight = group.weight;
        winners.length = 0;
        winners.push(group);
      } else if (group.weight === maxWeight) {
        winners.push(group);
      }
    }

    return winners;
  }

  /**
   * Apply architect tie-breaker
   */
  private applyArchitectTieBreaker<T extends { agents: string[] }>(
    tiedGroups: T[]
  ): T {
    // Find group with architect vote
    for (const group of tiedGroups) {
      if (group.agents.some((a) => a.includes('architect'))) {
        return group;
      }
    }

    // No architect - return first
    return tiedGroups[0];
  }

  /**
   * Escalate conflict for human resolution
   */
  private escalateConflict(
    votes: Vote[],
    reason: string
  ): VotingResult {
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);

    return {
      winner: `<!-- ESCALATED: ${reason} -->\n${this.formatEscalatedOptions(votes)}`,
      winnerAgents: [],
      winnerWeight: 0,
      totalWeight,
      percentage: 0,
      method: 'escalated',
      votes,
      escalated: true,
    };
  }

  /**
   * Format escalated options for human review
   */
  private formatEscalatedOptions(votes: Vote[]): string {
    const lines: string[] = [];

    lines.push('⚠️  CONFLICT ESCALATED FOR HUMAN RESOLUTION');
    lines.push('');

    for (let i = 0; i < votes.length; i++) {
      const vote = votes[i];
      lines.push(`Option ${i + 1} (${vote.agent}, weight: ${vote.weight}):`);
      lines.push('```');
      lines.push(vote.content);
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Check if two contents are similar
   */
  private similar(content1: string, content2: string, threshold: number): boolean {
    const len1 = content1.length;
    const len2 = content2.length;

    if (len1 === 0 && len2 === 0) return true;
    if (len1 === 0 || len2 === 0) return false;

    const maxLen = Math.max(len1, len2);
    let matches = 0;

    for (let i = 0; i < Math.min(len1, len2); i++) {
      if (content1[i] === content2[i]) matches++;
    }

    return matches / maxLen >= threshold;
  }

  /**
   * Build voting result
   */
  private buildResult(
    votes: Vote[],
    winnerVote: Vote,
    method: 'consensus' | 'majority' | 'veto' | 'tie-break' | 'escalated'
  ): VotingResult {
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const percentage = winnerVote.weight / totalWeight;

    return {
      winner: winnerVote.content,
      winnerAgents: [winnerVote.agent],
      winnerWeight: winnerVote.weight,
      totalWeight,
      percentage,
      method,
      votes,
      escalated: false,
    };
  }

  /**
   * Log conflict to .ultra/conflicts.json
   */
  private async logConflict(
    conflict: { type: string; description: string; location?: string },
    result: VotingResult
  ): Promise<void> {
    const record: ConflictRecord = {
      timestamp: new Date().toISOString(),
      type: conflict.type,
      description: conflict.description,
      location: conflict.location,
      agents: result.votes.map((v) => v.agent),
      votingResult: {
        winner: result.escalated ? undefined : result.winner.substring(0, 100) + '...',
        method: result.method,
        escalated: result.escalated,
        percentage: result.escalated ? undefined : result.percentage,
      },
    };

    // Ensure directory exists
    const dir = path.dirname(this.conflictsPath);
    await fs.mkdir(dir, { recursive: true });

    // Read existing or create new
    let records: ConflictRecord[] = [];
    try {
      const content = await fs.readFile(this.conflictsPath, 'utf-8');
      const data = JSON.parse(content);
      records = data.conflicts || [];
    } catch {
      // File doesn't exist - create new
    }

    // Add new record
    records.push(record);

    // Write back
    await fs.writeFile(
      this.conflictsPath,
      JSON.stringify({ conflicts: records }, null, 2),
      'utf-8'
    );
  }

  /**
   * Get all logged conflicts
   */
  async getConflicts(): Promise<ConflictRecord[]> {
    try {
      const content = await fs.readFile(this.conflictsPath, 'utf-8');
      const data = JSON.parse(content);
      return data.conflicts || [];
    } catch {
      return [];
    }
  }

  /**
   * Clear conflict log
   */
  async clearConflicts(): Promise<void> {
    await fs.writeFile(
      this.conflictsPath,
      JSON.stringify({ conflicts: [] }, null, 2),
      'utf-8'
    );
  }
}

/**
 * Unit test examples
 *
 * ```typescript
 * // Test security veto
 * const voting = new VotingMechanism('/tmp/test');
 * const result = await voting.resolveConflict(
 *   { type: 'security', description: 'Auth method' },
 *   [
 *     { agent: 'ultra:security-reviewer', content: 'Use OAuth 2.0' },
 *     { agent: 'ultra:executor', content: 'Use basic auth' },
 *   ],
 *   { securityVeto: true }
 * );
 * assert(result.method === 'veto');
 * assert(result.winner.includes('OAuth 2.0'));
 *
 * // Test architect tie-break
 * const result2 = await voting.resolveConflict(
 *   { type: 'technical', description: 'Database choice' },
 *   [
 *     { agent: 'ultra:architect', content: 'PostgreSQL' },
 *     { agent: 'ultra:executor', content: 'PostgreSQL' },
 *     { agent: 'ultra:quality-reviewer', content: 'MySQL' },
 *     { agent: 'ultra:verifier', content: 'MySQL' },
 *   ],
 *   { architectTieBreaker: true }
 * );
 * assert(result2.method === 'tie-break');
 * assert(result2.winner.includes('PostgreSQL'));
 *
 * // Test escalation
 * const result3 = await voting.resolveConflict(
 *   { type: 'content', description: 'Code style' },
 *   [
 *     { agent: 'ultra:executor-1', content: 'Use tabs' },
 *     { agent: 'ultra:executor-2', content: 'Use spaces' },
 *   ],
 *   { minConsensus: 0.6 }
 * );
 * assert(result3.escalated === true);
 * ```
 */
