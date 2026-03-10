/**
 * Majority Vote Strategy
 *
 * Resolves conflicts by majority voting when 3+ agents are involved.
 * Useful for breaking ties and reaching consensus.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult } from '../types.js';
import { ConflictRecord, ISynthesisStrategy } from '../synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Strategy options for majority vote
 */
export interface MajorityVoteOptions {
  /** Minimum number of agents required for voting (default: 3) */
  minAgentsForVoting: number;
  /** Threshold for majority (default: 0.5 for simple majority) */
  majorityThreshold: number;
  /** What to do when no majority is reached */
  noMajorityAction: 'mark-conflict' | 'use-first' | 'use-highest-success-rate';
}

/**
 * Majority Vote Strategy
 *
 * Resolves conflicts by voting:
 * - Requires 3+ agents for voting
 * - Simple majority wins (>50%)
 * - Configurable threshold
 * - Fallback for no majority scenarios
 */
export class MajorityVoteStrategy implements ISynthesisStrategy {
  async synthesize(
    results: Map<string, DelegationResult>,
    options?: MajorityVoteOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    const opts = options || {
      minAgentsForVoting: 3,
      majorityThreshold: 0.5,
      noMajorityAction: 'mark-conflict',
    };

    const conflicts: ConflictRecord[] = [];
    const output: any = {};

    // Group results by type
    const fileEdits = new Map<string, Array<{ agent: string; result: any }>>();
    const recommendations = new Map<string, Array<{ agent: string; recommendation: string }>>();
    const keyValuePairs = new Map<string, Array<{ agent: string; value: any }>>();

    // Categorize results
    for (const [agentName, result] of results) {
      if (!result.success || !result.result) {
        continue;
      }

      const agentResult = result.result;

      // File edits
      if (agentResult.files) {
        for (const [filePath, edit] of Object.entries(agentResult.files)) {
          if (!fileEdits.has(filePath)) {
            fileEdits.set(filePath, []);
          }
          fileEdits.get(filePath)!.push({ agent: agentName, result: edit });
        }
      }

      // Recommendations
      if (agentResult.recommendations) {
        for (const [topic, rec] of Object.entries(agentResult.recommendations)) {
          if (!recommendations.has(topic)) {
            recommendations.set(topic, []);
          }
          recommendations.get(topic)!.push({ agent: agentName, recommendation: rec as string });
        }
      }

      // Generic key-value pairs
      if (typeof agentResult === 'object' && agentResult !== null) {
        for (const [key, value] of Object.entries(agentResult)) {
          if (key !== 'files' && key !== 'recommendations') {
            if (!keyValuePairs.has(key)) {
              keyValuePairs.set(key, []);
            }
            keyValuePairs.get(key)!.push({ agent: agentName, value });
          }
        }
      }
    }

    // Apply majority voting to each category
    output.files = this.applyMajorityVoteToFileEdits(fileEdits, opts, conflicts);
    output.recommendations = this.applyMajorityVoteToRecommendations(recommendations, opts, conflicts);
    Object.assign(output, this.applyMajorityVoteToKeyValuePairs(keyValuePairs, opts, conflicts));

    return {
      output,
      conflicts,
    };
  }

  /**
   * Apply majority voting to file edits
   */
  private applyMajorityVoteToFileEdits(
    fileEdits: Map<string, Array<{ agent: string; result: any }>>,
    opts: MajorityVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, any> {
    const files: Record<string, any> = {};

    for (const [filePath, edits] of fileEdits) {
      if (edits.length < opts.minAgentsForVoting) {
        // Not enough agents for voting - use first result
        files[filePath] = edits[0].result;
        continue;
      }

      // Count votes for each unique edit
      const voteCounts = new Map<string, { count: number; agents: string[]; edit: any }>();

      for (const { agent, result } of edits) {
        const editKey = JSON.stringify(result);

        if (!voteCounts.has(editKey)) {
          voteCounts.set(editKey, { count: 0, agents: [], edit: result });
        }

        const voteData = voteCounts.get(editKey)!;
        voteData.count++;
        voteData.agents.push(agent);
      }

      // Find majority
      let winner: { edit: any; count: number; agents: string[] } | null = null;
      const totalVotes = edits.length;
      const requiredVotes = Math.ceil(totalVotes * opts.majorityThreshold);

      for (const { edit, count, agents } of voteCounts.values()) {
        if (count >= requiredVotes) {
          winner = { edit, count, agents };
          break;
        }
      }

      if (winner) {
        // Majority winner found
        files[filePath] = winner.edit;

        // Log conflict if there was disagreement
        if (voteCounts.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: winner.agents,
            positions: edits.map(e => ({ agent: e.agent, position: e.result })),
            resolutionStrategy: 'majority-vote',
            decision: winner.edit,
            timestamp: Date.now(),
            metadata: {
              filePath,
              voteCount: winner.count,
              totalVotes,
              votePercentage: winner.count / totalVotes,
            },
          });
        }
      } else {
        // No majority - apply fallback action
        if (opts.noMajorityAction === 'use-first') {
          files[filePath] = edits[0].result;
        } else if (opts.noMajorityAction === 'use-highest-success-rate') {
          // Would need agent success rate data - use first for now
          files[filePath] = edits[0].result;
        } else {
          // Mark as conflict
          files[filePath] = {
            _conflict: true,
            _voteCounts: Array.from(voteCounts.values()).map(v => ({
              agents: v.agents,
              count: v.count,
              edit: v.edit,
            })),
          };

          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: edits.map(e => e.agent),
            positions: edits.map(e => ({ agent: e.agent, position: e.result })),
            resolutionStrategy: 'majority-vote',
            decision: null, // No majority reached
            timestamp: Date.now(),
            metadata: {
              filePath,
              reason: 'no-majority',
              voteCounts: Array.from(voteCounts.values()).map(v => ({
                agents: v.agents,
                count: v.count,
              })),
            },
          });
        }
      }
    }

    return files;
  }

  /**
   * Apply majority voting to recommendations
   */
  private applyMajorityVoteToRecommendations(
    recommendations: Map<string, Array<{ agent: string; recommendation: string }>>,
    opts: MajorityVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, string> {
    const recs: Record<string, string> = {};

    for (const [topic, recsList] of recommendations) {
      if (recsList.length < opts.minAgentsForVoting) {
        recs[topic] = recsList[0].recommendation;
        continue;
      }

      // Count votes for each unique recommendation
      const voteCounts = new Map<string, { count: number; agents: string[] }>();

      for (const { agent, recommendation } of recsList) {
        const normalizedRec = recommendation.trim().toLowerCase();

        if (!voteCounts.has(normalizedRec)) {
          voteCounts.set(normalizedRec, { count: 0, agents: [] });
        }

        const voteData = voteCounts.get(normalizedRec)!;
        voteData.count++;
        voteData.agents.push(agent);
      }

      // Find majority
      let winner: { recommendation: string; count: number; agents: string[] } | null = null;
      const totalVotes = recsList.length;
      const requiredVotes = Math.ceil(totalVotes * opts.majorityThreshold);

      for (const [rec, data] of voteCounts) {
        if (data.count >= requiredVotes) {
          winner = { recommendation: rec, count: data.count, agents: data.agents };
          break;
        }
      }

      if (winner) {
        recs[topic] = winner.recommendation;

        // Log if there was disagreement
        if (voteCounts.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: winner.agents,
            positions: recsList.map(r => ({
              agent: r.agent,
              position: r.recommendation,
            })),
            resolutionStrategy: 'majority-vote',
            decision: winner.recommendation,
            timestamp: Date.now(),
            metadata: {
              topic,
              voteCount: winner.count,
              totalVotes,
            },
          });
        }
      } else {
        // No majority - mark as conflict
        recs[topic] = {
          _conflict: true,
          _voteCounts: Array.from(voteCounts.entries()).map(([rec, data]) => ({
            recommendation: rec,
            agents: data.agents,
            count: data.count,
          })),
        };
      }
    }

    return recs;
  }

  /**
   * Apply majority voting to key-value pairs
   */
  private applyMajorityVoteToKeyValuePairs(
    keyValuePairs: Map<string, Array<{ agent: string; value: any }>>,
    opts: MajorityVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, any> {
    const output: Record<string, any> = {};

    for (const [key, values] of keyValuePairs) {
      if (values.length < opts.minAgentsForVoting) {
        output[key] = values[0].value;
        continue;
      }

      // Count votes for each unique value
      const voteCounts = new Map<string, { count: number; agents: string[]; value: any }>();

      for (const { agent, value } of values) {
        const valueKey = JSON.stringify(value);

        if (!voteCounts.has(valueKey)) {
          voteCounts.set(valueKey, { count: 0, agents: [], value });
        }

        const voteData = voteCounts.get(valueKey)!;
        voteData.count++;
        voteData.agents.push(agent);
      }

      // Find majority
      let winner: { value: any; count: number; agents: string[] } | null = null;
      const totalVotes = values.length;
      const requiredVotes = Math.ceil(totalVotes * opts.majorityThreshold);

      for (const { value, count, agents } of voteCounts.values()) {
        if (count >= requiredVotes) {
          winner = { value, count, agents };
          break;
        }
      }

      if (winner) {
        output[key] = winner.value;

        // Log if there was disagreement
        if (voteCounts.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'other',
            agents: winner.agents,
            positions: values.map(v => ({ agent: v.agent, position: v.value })),
            resolutionStrategy: 'majority-vote',
            decision: winner.value,
            timestamp: Date.now(),
            metadata: { key, voteCount: winner.count, totalVotes },
          });
        }
      } else {
        // No majority - mark as conflict
        output[key] = {
          _conflict: true,
          _voteCounts: Array.from(voteCounts.values()).map(v => ({
            agents: v.agents,
            count: v.count,
            value: v.value,
          })),
        };
      }
    }

    return output;
  }
}
