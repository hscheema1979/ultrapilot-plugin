/**
 * Voting Mechanism
 *
 * Provides configurable voting system for conflict resolution with
 * weighted votes, veto power, and tie-breaking capabilities.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { ConflictRecord } from './synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Vote weight configuration
 */
export interface VoteWeight {
  /** Agent name or category */
  agent: string;
  /** Weight multiplier */
  weight: number;
  /** Whether this agent has veto power */
  veto: boolean;
  /** Priority for tie-breaking (higher = higher priority) */
  tieBreakPriority: number;
}

/**
 * Vote record
 */
export interface Vote {
  /** Agent who cast the vote */
  agent: string;
  /** Position being voted on */
  position: any;
  /** Vote weight */
  weight: number;
  /** Whether this is a veto vote */
  veto: boolean;
}

/**
 * Voting result
 */
export interface VotingResult {
  /** Winner (if any) */
  winner: {
    position: any;
    agents: string[];
    totalWeight: number;
  } | null;
  /** Vote counts by position */
  voteCounts: Array<{
    position: any;
    agents: string[];
    totalWeight: number;
    individualVotes: Vote[];
  }>;
  /** Whether veto was exercised */
  vetoExercised: boolean;
  /** Whether there was a tie */
  tie: boolean;
  /** Tie-breaking method used (if any) */
  tieBreakMethod?: 'priority' | 'random' | 'none';
}

/**
 * Voting configuration
 */
export interface VotingConfig {
  /** Agent weights */
  weights: VoteWeight[];
  /** Default weight for unconfigured agents */
  defaultWeight: number;
  /** Tie-breaking method */
  tieBreakMethod: 'priority' | 'random' | 'none';
  /** Whether to allow veto */
  allowVeto: boolean;
  /** Minimum vote threshold for winning */
  winThreshold: number; // 0.0 to 1.0 (e.g., 0.5 = simple majority)
}

/**
 * Voting Mechanism
 *
 * Implements configurable voting with:
 * - Weighted votes per agent
 * - Veto power for specific agents
 * - Tie-breaking strategies
 * - Configurable win thresholds
 */
export class VotingMechanism {
  private config: VotingConfig;
  private weightMap: Map<string, VoteWeight>;

  constructor(config: VotingConfig) {
    this.config = config;
    this.weightMap = new Map();

    // Build weight map
    for (const weight of config.weights) {
      this.weightMap.set(weight.agent, weight);
    }
  }

  /**
   * Conduct a vote on conflicting positions
   *
   * @param conflict - Conflict record containing positions
   * @returns Voting result
   *
   * @example
   * ```typescript
   * const result = votingMechanism.vote(conflict);
   * if (result.winner) {
   *   console.log(`Winner: ${result.winner.agents.join(', ')}`);
   * }
   * ```
   */
  vote(conflict: ConflictRecord): VotingResult {
    // Check for veto votes first
    const vetoVotes = this.getVetoVotes(conflict);

    if (vetoVotes.length > 0 && this.config.allowVeto) {
      return this.handleVeto(conflict, vetoVotes);
    }

    // No veto - conduct weighted voting
    return this.conductWeightedVoting(conflict);
  }

  /**
   * Get veto votes from conflict positions
   *
   * @param conflict - Conflict record
   * @returns Array of veto votes
   */
  private getVetoVotes(conflict: ConflictRecord): Vote[] {
    const vetoVotes: Vote[] = [];

    for (const position of conflict.positions) {
      const weight = this.weightMap.get(position.agent);

      if (weight && weight.veto) {
        vetoVotes.push({
          agent: position.agent,
          position: position.position,
          weight: weight.weight,
          veto: true,
        });
      }
    }

    return vetoVotes;
  }

  /**
   * Handle veto votes
   *
   * @param conflict - Conflict record
   * @param vetoVotes - Array of veto votes
   * @returns Voting result with veto handling
   */
  private handleVeto(
    conflict: ConflictRecord,
    vetoVotes: Vote[]
  ): VotingResult {
    // Check if all veto votes agree
    const uniqueVetoPositions = new Set(
      vetoVotes.map(v => JSON.stringify(v.position))
    );

    if (uniqueVetoPositions.size === 1) {
      // All veto agents agree - they win
      const winningPosition = vetoVotes[0].position;

      return {
        winner: {
          position: winningPosition,
          agents: vetoVotes.map(v => v.agent),
          totalWeight: vetoVotes.reduce((sum, v) => sum + v.weight, 0),
        },
        voteCounts: [
          {
            position: winningPosition,
            agents: vetoVotes.map(v => v.agent),
            totalWeight: vetoVotes.reduce((sum, v) => sum + v.weight, 0),
            individualVotes: vetoVotes,
          },
        ],
        vetoExercised: true,
        tie: false,
        tieBreakMethod: undefined,
      };
    } else {
      // Veto agents disagree - this is a problem
      // Mark as no winner (requires human intervention)
      return {
        winner: null,
        voteCounts: vetoVotes.map(v => ({
          position: v.position,
          agents: [v.agent],
          totalWeight: v.weight,
          individualVotes: [v],
        })),
        vetoExercised: true,
        tie: true,
        tieBreakMethod: 'none',
      };
    }
  }

  /**
   * Conduct weighted voting
   *
   * @param conflict - Conflict record
   * @returns Voting result
   */
  private conductWeightedVoting(conflict: ConflictRecord): VotingResult {
    // Group votes by position
    const voteGroups = new Map<string, {
      position: any;
      agents: string[];
      totalWeight: number;
      individualVotes: Vote[];
    }>();

    // Collect all votes
    for (const position of conflict.positions) {
      const weight = this.weightMap.get(position.agent);
      const agentWeight = weight ? weight.weight : this.config.defaultWeight;
      const positionKey = JSON.stringify(position.position);

      if (!voteGroups.has(positionKey)) {
        voteGroups.set(positionKey, {
          position: position.position,
          agents: [],
          totalWeight: 0,
          individualVotes: [],
        });
      }

      const group = voteGroups.get(positionKey)!;
      group.agents.push(position.agent);
      group.totalWeight += agentWeight;
      group.individualVotes.push({
        agent: position.agent,
        position: position.position,
        weight: agentWeight,
        veto: weight ? weight.veto : false,
      });
    }

    // Convert to array and sort by weight
    const sortedGroups = Array.from(voteGroups.values()).sort(
      (a, b) => b.totalWeight - a.totalWeight
    );

    // Calculate total weight
    const totalWeight = sortedGroups.reduce((sum, g) => sum + g.totalWeight, 0);

    // Find winner(s)
    const topGroup = sortedGroups[0];
    const winThreshold = this.config.winThreshold;
    const hasMajority = topGroup.totalWeight / totalWeight >= winThreshold;

    if (hasMajority) {
      // Clear winner
      return {
        winner: {
          position: topGroup.position,
          agents: topGroup.agents,
          totalWeight: topGroup.totalWeight,
        },
        voteCounts: sortedGroups,
        vetoExercised: false,
        tie: false,
        tieBreakMethod: undefined,
      };
    } else {
      // No majority - check for tie
      const isTie = sortedGroups.length > 1 &&
        sortedGroups[0].totalWeight === sortedGroups[1].totalWeight;

      if (isTie) {
        // Tie - apply tie-breaking
        return this.breakTie(sortedGroups.slice(0, 2), totalWeight);
      } else {
        // No majority but not a tie - use highest weight
        return {
          winner: {
            position: topGroup.position,
            agents: topGroup.agents,
            totalWeight: topGroup.totalWeight,
          },
          voteCounts: sortedGroups,
          vetoExercised: false,
          tie: false,
          tieBreakMethod: undefined,
        };
      }
    }
  }

  /**
   * Break a tie between competing positions
   *
   * @param tiedGroups - Groups that are tied
   * @param totalWeight - Total weight of all votes
   * @returns Voting result with tie-breaking applied
   */
  private breakTie(
    tiedGroups: Array<{
      position: any;
      agents: string[];
      totalWeight: number;
      individualVotes: Vote[];
    }>,
    totalWeight: number
  ): VotingResult {
    if (this.config.tieBreakMethod === 'priority') {
      // Use agent priority for tie-breaking
      const winner = this.breakTieByPriority(tiedGroups);

      return {
        winner,
        voteCounts: tiedGroups,
        vetoExercised: false,
        tie: true,
        tieBreakMethod: 'priority',
      };
    } else if (this.config.tieBreakMethod === 'random') {
      // Random tie-break
      const winnerIndex = Math.floor(Math.random() * tiedGroups.length);
      const winnerGroup = tiedGroups[winnerIndex];

      return {
        winner: {
          position: winnerGroup.position,
          agents: winnerGroup.agents,
          totalWeight: winnerGroup.totalWeight,
        },
        voteCounts: tiedGroups,
        vetoExercised: false,
        tie: true,
        tieBreakMethod: 'random',
      };
    } else {
      // No tie-breaking - return no winner
      return {
        winner: null,
        voteCounts: tiedGroups,
        vetoExercised: false,
        tie: true,
        tieBreakMethod: 'none',
      };
    }
  }

  /**
   * Break tie by agent priority
   *
   * @param tiedGroups - Groups that are tied
   * @returns Winner with highest priority agent
   */
  private breakTieByPriority(
    tiedGroups: Array<{
      position: any;
      agents: string[];
      totalWeight: number;
      individualVotes: Vote[];
    }>
  ): {
    position: any;
    agents: string[];
    totalWeight: number;
  } | null {
    let highestPriority = -1;
    let winnerGroup: typeof tiedGroups[0] | null = null;

    for (const group of tiedGroups) {
      // Find highest priority agent in group
      let groupMaxPriority = -1;

      for (const agent of group.agents) {
        const weight = this.weightMap.get(agent);

        if (weight && weight.tieBreakPriority > groupMaxPriority) {
          groupMaxPriority = weight.tieBreakPriority;
        }
      }

      // Check if this group has higher priority
      if (groupMaxPriority > highestPriority) {
        highestPriority = groupMaxPriority;
        winnerGroup = group;
      }
    }

    if (winnerGroup) {
      return {
        position: winnerGroup.position,
        agents: winnerGroup.agents,
        totalWeight: winnerGroup.totalWeight,
      };
    }

    return null;
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<VotingConfig>): void {
    this.config = { ...this.config, ...config };

    // Rebuild weight map if weights changed
    if (config.weights) {
      this.weightMap.clear();
      for (const weight of config.weights) {
        this.weightMap.set(weight.agent, weight);
      }
    }
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): VotingConfig {
    return { ...this.config };
  }

  /**
   * Add or update agent weight
   *
   * @param agent - Agent name
   * @param weight - Weight configuration
   */
  setAgentWeight(agent: string, weight: VoteWeight): void {
    this.weightMap.set(agent, weight);

    // Update config
    const existingIndex = this.config.weights.findIndex(w => w.agent === agent);
    if (existingIndex >= 0) {
      this.config.weights[existingIndex] = weight;
    } else {
      this.config.weights.push(weight);
    }
  }

  /**
   * Remove agent weight
   *
   * @param agent - Agent name
   */
  removeAgentWeight(agent: string): void {
    this.weightMap.delete(agent);
    this.config.weights = this.config.weights.filter(w => w.agent !== agent);
  }

  /**
   * Get agent weight
   *
   * @param agent - Agent name
   * @returns Weight configuration or undefined
   */
  getAgentWeight(agent: string): VoteWeight | undefined {
    return this.weightMap.get(agent);
  }

  /**
   * Generate voting summary for logging
   *
   * @param result - Voting result
   * @returns Human-readable summary
   */
  generateVotingSummary(result: VotingResult): string {
    const lines: string[] = [];

    lines.push('=== Voting Summary ===\n');

    if (result.vetoExercised) {
      lines.push('Veto exercised: YES');
    }

    if (result.tie) {
      lines.push(`Tie: YES (${result.tieBreakMethod})`);
    }

    lines.push('');

    if (result.winner) {
      lines.push('Winner:');
      lines.push(`  Agents: ${result.winner.agents.join(', ')}`);
      lines.push(`  Total weight: ${result.winner.totalWeight}`);
      lines.push('');
    }

    lines.push('Vote counts:');
    for (const count of result.voteCounts) {
      lines.push(`  Position: ${JSON.stringify(count.position).substring(0, 50)}...`);
      lines.push(`    Agents: ${count.agents.join(', ')}`);
      lines.push(`    Total weight: ${count.totalWeight}`);
      lines.push(`    Individual votes: ${count.individualVotes.length}`);
    }

    lines.push('');
    lines.push('='.repeat(50));

    return lines.join('\n');
  }
}
