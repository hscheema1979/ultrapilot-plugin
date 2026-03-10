/**
 * Weighted Vote Strategy
 *
 * Resolves conflicts using weighted voting where some agents have
 * more influence than others (e.g., security veto, architect tie-breaker).
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult } from '../types.js';
import { ConflictRecord, ISynthesisStrategy } from '../synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent weight configuration
 */
export interface AgentWeight {
  /** Agent name or category */
  agent: string;
  /** Weight multiplier (default: 1.0) */
  weight: number;
  /** Whether this agent has veto power */
  veto: boolean;
}

/**
 * Strategy options for weighted voting
 */
export interface WeightedVoteOptions {
  /** Agent weights */
  agentWeights: AgentWeight[];
  /** Default weight for agents not in the list */
  defaultWeight: number;
  /** What to do when veto is used */
  vetoAction: 'reject-all' | 'require-consensus';
}

/**
 * Weighted Vote Strategy
 *
 * Resolves conflicts using weighted voting:
 * - Security reviewer has veto power
 * - Architect acts as tie-breaker for technical conflicts
 * - Other agents have equal weight (configurable)
 * - Veto power overrides all votes
 */
export class WeightedVoteStrategy implements ISynthesisStrategy {
  async synthesize(
    results: Map<string, DelegationResult>,
    options?: WeightedVoteOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    const opts = options || {
      agentWeights: [
        { agent: 'security-reviewer', weight: 2.0, veto: true },
        { agent: 'architect', weight: 1.5, veto: false },
      ],
      defaultWeight: 1.0,
      vetoAction: 'reject-all',
    };

    const conflicts: ConflictRecord[] = [];
    const output: any = {};

    // Build weight map
    const weightMap = new Map<string, { weight: number; veto: boolean }>();
    for (const aw of opts.agentWeights) {
      weightMap.set(aw.agent, { weight: aw.weight, veto: aw.veto });
    }

    // Helper function to get agent weight
    const getWeight = (agentName: string): { weight: number; veto: boolean } => {
      return weightMap.get(agentName) || {
        weight: opts.defaultWeight,
        veto: false,
      };
    };

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

    // Apply weighted voting to each category
    output.files = this.applyWeightedVoteToFileEdits(
      fileEdits,
      getWeight,
      opts,
      conflicts
    );
    output.recommendations = this.applyWeightedVoteToRecommendations(
      recommendations,
      getWeight,
      opts,
      conflicts
    );
    Object.assign(
      output,
      this.applyWeightedVoteToKeyValuePairs(keyValuePairs, getWeight, opts, conflicts)
    );

    return {
      output,
      conflicts,
    };
  }

  /**
   * Apply weighted voting to file edits
   */
  private applyWeightedVoteToFileEdits(
    fileEdits: Map<string, Array<{ agent: string; result: any }>>,
    getWeight: (agent: string) => { weight: number; veto: boolean },
    opts: WeightedVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, any> {
    const files: Record<string, any> = {};

    for (const [filePath, edits] of fileEdits) {
      // Check for veto
      const vetoVotes = edits.filter(e => getWeight(e.agent).veto);

      if (vetoVotes.length > 0) {
        // Check if all veto agents agree
        const uniqueVetos = new Set(vetoVotes.map(v => JSON.stringify(v.result)));

        if (uniqueVetos.size === 1) {
          // All veto agents agree - use their decision
          files[filePath] = vetoVotes[0].result;

          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: vetoVotes.map(v => v.agent),
            positions: edits.map(e => ({ agent: e.agent, position: e.result })),
            resolutionStrategy: 'weighted-vote',
            decision: vetoVotes[0].result,
            timestamp: Date.now(),
            metadata: {
              filePath,
              reason: 'veto-unanimous',
              vetoAgents: vetoVotes.map(v => v.agent),
            },
          });
        } else {
          // Veto agents disagree - require consensus
          files[filePath] = {
            _conflict: true,
            _reason: 'veto-disagreement',
            _vetoAgents: vetoVotes.map(v => ({
              agent: v.agent,
              edit: v.result,
            })),
            _allEdits: edits.map(e => ({ agent: e.agent, edit: e.result })),
          };

          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: edits.map(e => e.agent),
            positions: edits.map(e => ({ agent: e.agent, position: e.result })),
            resolutionStrategy: 'weighted-vote',
            decision: null,
            timestamp: Date.now(),
            metadata: {
              filePath,
              reason: 'veto-disagreement',
            },
          });
        }

        continue;
      }

      // No veto - apply weighted voting
      const voteWeights = new Map<string, { totalWeight: number; agents: string[]; edit: any }>();

      for (const { agent, result } of edits) {
        const { weight } = getWeight(agent);
        const editKey = JSON.stringify(result);

        if (!voteWeights.has(editKey)) {
          voteWeights.set(editKey, { totalWeight: 0, agents: [], edit: result });
        }

        const voteData = voteWeights.get(editKey)!;
        voteData.totalWeight += weight;
        voteData.agents.push(agent);
      }

      // Find winner by weight
      let winner: { edit: any; totalWeight: number; agents: string[] } | null = null;
      let maxWeight = 0;

      for (const { edit, totalWeight, agents } of voteWeights.values()) {
        if (totalWeight > maxWeight) {
          maxWeight = totalWeight;
          winner = { edit, totalWeight, agents };
        }
      }

      if (winner) {
        files[filePath] = winner.edit;

        // Log if there was disagreement
        if (voteWeights.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: winner.agents,
            positions: edits.map(e => ({ agent: e.agent, position: e.result })),
            resolutionStrategy: 'weighted-vote',
            decision: winner.edit,
            timestamp: Date.now(),
            metadata: {
              filePath,
              totalWeight: winner.totalWeight,
              allWeights: Array.from(voteWeights.values()).map(v => ({
                agents: v.agents,
                totalWeight: v.totalWeight,
              })),
            },
          });
        }
      } else {
        // Should not happen, but handle gracefully
        files[filePath] = edits[0].result;
      }
    }

    return files;
  }

  /**
   * Apply weighted voting to recommendations
   */
  private applyWeightedVoteToRecommendations(
    recommendations: Map<string, Array<{ agent: string; recommendation: string }>>,
    getWeight: (agent: string) => { weight: number; veto: boolean },
    opts: WeightedVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, string> {
    const recs: Record<string, string> = {};

    for (const [topic, recsList] of recommendations) {
      // Check for veto
      const vetoVotes = recsList.filter(r => getWeight(r.agent).veto);

      if (vetoVotes.length > 0) {
        // Check if all veto agents agree
        const uniqueVetos = new Set(
          vetoVotes.map(v => v.recommendation.trim().toLowerCase())
        );

        if (uniqueVetos.size === 1) {
          // All veto agents agree
          recs[topic] = vetoVotes[0].recommendation;
        } else {
          // Veto agents disagree
          recs[topic] = {
            _conflict: true,
            _reason: 'veto-disagreement',
            _vetoRecommendations: vetoVotes.map(v => ({
              agent: v.agent,
              recommendation: v.recommendation,
            })),
          };

          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: recsList.map(r => r.agent),
            positions: recsList.map(r => ({
              agent: r.agent,
              position: r.recommendation,
            })),
            resolutionStrategy: 'weighted-vote',
            decision: null,
            timestamp: Date.now(),
            metadata: { topic, reason: 'veto-disagreement' },
          });
        }

        continue;
      }

      // No veto - apply weighted voting
      const voteWeights = new Map<
        string,
        { totalWeight: number; agents: string[]; recommendation: string }
      >();

      for (const { agent, recommendation } of recsList) {
        const { weight } = getWeight(agent);
        const normalizedRec = recommendation.trim().toLowerCase();

        if (!voteWeights.has(normalizedRec)) {
          voteWeights.set(normalizedRec, { totalWeight: 0, agents: [], recommendation });
        }

        const voteData = voteWeights.get(normalizedRec)!;
        voteData.totalWeight += weight;
        voteData.agents.push(agent);
      }

      // Find winner by weight
      let winner: { recommendation: string; totalWeight: number; agents: string[] } | null = null;
      let maxWeight = 0;

      for (const { recommendation, totalWeight, agents } of voteWeights.values()) {
        if (totalWeight > maxWeight) {
          maxWeight = totalWeight;
          winner = { recommendation, totalWeight, agents };
        }
      }

      if (winner) {
        recs[topic] = winner.recommendation;

        // Log if there was disagreement
        if (voteWeights.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: winner.agents,
            positions: recsList.map(r => ({
              agent: r.agent,
              position: r.recommendation,
            })),
            resolutionStrategy: 'weighted-vote',
            decision: winner.recommendation,
            timestamp: Date.now(),
            metadata: { topic, totalWeight: winner.totalWeight },
          });
        }
      }
    }

    return recs;
  }

  /**
   * Apply weighted voting to key-value pairs
   */
  private applyWeightedVoteToKeyValuePairs(
    keyValuePairs: Map<string, Array<{ agent: string; value: any }>>,
    getWeight: (agent: string) => { weight: number; veto: boolean },
    opts: WeightedVoteOptions,
    conflicts: ConflictRecord[]
  ): Record<string, any> {
    const output: Record<string, any> = {};

    for (const [key, values] of keyValuePairs) {
      // Check for veto
      const vetoVotes = values.filter(v => getWeight(v.agent).veto);

      if (vetoVotes.length > 0) {
        // Check if all veto agents agree
        const uniqueVetos = new Set(vetoVotes.map(v => JSON.stringify(v.value)));

        if (uniqueVetos.size === 1) {
          output[key] = vetoVotes[0].value;
        } else {
          output[key] = {
            _conflict: true,
            _reason: 'veto-disagreement',
            _vetoValues: vetoVotes.map(v => ({ agent: v.agent, value: v.value })),
          };
        }

        continue;
      }

      // No veto - apply weighted voting
      const voteWeights = new Map<string, { totalWeight: number; agents: string[]; value: any }>();

      for (const { agent, value } of values) {
        const { weight } = getWeight(agent);
        const valueKey = JSON.stringify(value);

        if (!voteWeights.has(valueKey)) {
          voteWeights.set(valueKey, { totalWeight: 0, agents: [], value });
        }

        const voteData = voteWeights.get(valueKey)!;
        voteData.totalWeight += weight;
        voteData.agents.push(agent);
      }

      // Find winner by weight
      let winner: { value: any; totalWeight: number; agents: string[] } | null = null;
      let maxWeight = 0;

      for (const { value, totalWeight, agents } of voteWeights.values()) {
        if (totalWeight > maxWeight) {
          maxWeight = totalWeight;
          winner = { value, totalWeight, agents };
        }
      }

      if (winner) {
        output[key] = winner.value;

        // Log if there was disagreement
        if (voteWeights.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'other',
            agents: winner.agents,
            positions: values.map(v => ({ agent: v.agent, position: v.value })),
            resolutionStrategy: 'weighted-vote',
            decision: winner.value,
            timestamp: Date.now(),
            metadata: { key, totalWeight: winner.totalWeight },
          });
        }
      }
    }

    return output;
  }
}
