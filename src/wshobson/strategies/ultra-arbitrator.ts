/**
 * Ultra Arbitrator Strategy
 *
 * Delegates conflict resolution to the ultra:arbitrator agent,
 * which uses AI to intelligently resolve conflicts.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult } from '../types.js';
import { ConflictRecord, ISynthesisStrategy } from '../synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Strategy options for ultra arbitrator
 */
export interface UltraArbitratorOptions {
  /** Arbitrator agent name (default: 'ultra:arbitrator') */
  arbitratorAgent: string;
  /** Maximum time to wait for arbitration (default: 30 seconds) */
  arbitrationTimeout: number;
  /** Fallback strategy if arbitration fails */
  fallbackStrategy: 'majority-vote' | 'weighted-vote' | 'mark-conflicts';
  /** Whether to include all agent outputs in arbitration request */
  includeAllOutputs: boolean;
}

/**
 * Ultra Arbitrator Strategy
 *
 * Delegates conflict resolution to ultra:arbitrator:
 * - Sends conflicts to arbitrator agent
 * - AI-powered conflict resolution
 * - Configurable timeout
 * - Fallback to other strategies if needed
 */
export class UltraArbitratorStrategy implements ISynthesisStrategy {
  async synthesize(
    results: Map<string, DelegationResult>,
    options?: UltraArbitratorOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    const opts = options || {
      arbitratorAgent: 'ultra:arbitrator',
      arbitrationTimeout: 30000, // 30 seconds
      fallbackStrategy: 'majority-vote',
      includeAllOutputs: true,
    };

    const conflicts: ConflictRecord[] = [];
    const output: any = {};

    // Step 1: Detect conflicts
    const detectedConflicts = this.detectConflicts(results);
    conflicts.push(...detectedConflicts);

    // Step 2: If no conflicts, return simple merged output
    if (conflicts.length === 0) {
      return this.mergeWithoutConflicts(results, conflicts);
    }

    // Step 3: Delegate to arbitrator
    try {
      const arbitrationResult = await this.arbitrateConflicts(
        results,
        conflicts,
        opts
      );

      // Step 4: Apply arbitration decisions
      Object.assign(output, arbitrationResult.output);

      return {
        output,
        conflicts: arbitrationResult.conflicts,
      };
    } catch (error) {
      // Arbitration failed - use fallback strategy
      console.warn(`Arbitration failed: ${error}. Using fallback strategy: ${opts.fallbackStrategy}`);

      // Import fallback strategy dynamically
      const { MajorityVoteStrategy } = await import('./majority-vote.js');
      const fallback = new MajorityVoteStrategy();

      return fallback.synthesize(results);
    }
  }

  /**
   * Detect conflicts in results
   */
  private detectConflicts(results: Map<string, DelegationResult>): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const allOutputs: Record<string, any> = {};

    // Collect all outputs
    for (const [agentName, result] of results) {
      if (result.success && result.result) {
        allOutputs[agentName] = result.result;
      }
    }

    // Detect file conflicts
    const fileConflicts = this.detectFileConflicts(allOutputs);
    conflicts.push(...fileConflicts);

    // Detect recommendation conflicts
    const recommendationConflicts = this.detectRecommendationConflicts(allOutputs);
    conflicts.push(...recommendationConflicts);

    // Detect value conflicts
    const valueConflicts = this.detectValueConflicts(allOutputs);
    conflicts.push(...valueConflicts);

    return conflicts;
  }

  /**
   * Detect file conflicts
   */
  private detectFileConflicts(outputs: Record<string, any>): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const fileEdits = new Map<string, Array<{ agent: string; edit: any }>>();

    for (const [agentName, result] of Object.entries(outputs)) {
      if (result.files) {
        for (const [filePath, edit] of Object.entries(result.files)) {
          if (!fileEdits.has(filePath)) {
            fileEdits.set(filePath, []);
          }
          fileEdits.get(filePath)!.push({ agent: agentName, edit });
        }
      }
    }

    for (const [filePath, edits] of fileEdits) {
      if (edits.length > 1) {
        const firstEdit = JSON.stringify(edits[0].edit);
        const allIdentical = edits.every(e => JSON.stringify(e.edit) === firstEdit);

        if (!allIdentical) {
          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: edits.map(e => e.agent),
            positions: edits.map(e => ({ agent: e.agent, position: e.edit })),
            resolutionStrategy: 'ultra-arbitrator',
            decision: null, // Will be filled by arbitrator
            timestamp: Date.now(),
            metadata: { filePath },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect recommendation conflicts
   */
  private detectRecommendationConflicts(outputs: Record<string, any>): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const recommendations = new Map<string, Array<{ agent: string; recommendation: string }>>();

    for (const [agentName, result] of Object.entries(outputs)) {
      if (result.recommendations) {
        for (const [topic, rec] of Object.entries(result.recommendations)) {
          if (!recommendations.has(topic)) {
            recommendations.set(topic, []);
          }
          recommendations.get(topic)!.push({ agent: agentName, recommendation: rec as string });
        }
      }
    }

    for (const [topic, recs] of recommendations) {
      if (recs.length > 1) {
        const normalizedRecs = recs.map(r => r.recommendation.trim().toLowerCase());
        const uniqueRecs = new Set(normalizedRecs);

        if (uniqueRecs.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: recs.map(r => r.agent),
            positions: recs.map(r => ({ agent: r.agent, position: r.recommendation })),
            resolutionStrategy: 'ultra-arbitrator',
            decision: null,
            timestamp: Date.now(),
            metadata: { topic },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect value conflicts
   */
  private detectValueConflicts(outputs: Record<string, any>): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const keyValuePairs = new Map<string, Array<{ agent: string; value: any }>>();

    for (const [agentName, result] of Object.entries(outputs)) {
      if (typeof result === 'object' && result !== null) {
        for (const [key, value] of Object.entries(result)) {
          if (key !== 'files' && key !== 'recommendations') {
            if (!keyValuePairs.has(key)) {
              keyValuePairs.set(key, []);
            }
            keyValuePairs.get(key)!.push({ agent: agentName, value });
          }
        }
      }
    }

    for (const [key, values] of keyValuePairs) {
      if (values.length > 1) {
        const firstValue = JSON.stringify(values[0].value);
        const allIdentical = values.every(v => JSON.stringify(v.value) === firstValue);

        if (!allIdentical) {
          conflicts.push({
            id: uuidv4(),
            type: 'other',
            agents: values.map(v => v.agent),
            positions: values.map(v => ({ agent: v.agent, position: v.value })),
            resolutionStrategy: 'ultra-arbitrator',
            decision: null,
            timestamp: Date.now(),
            metadata: { key },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Arbitrate conflicts using ultra:arbitrator
   *
   * Note: This is a placeholder implementation. In production,
   * this would invoke the ultra:arbitrator agent via the skill system.
   */
  private async arbitrateConflicts(
    results: Map<string, DelegationResult>,
    conflicts: ConflictRecord[],
    opts: UltraArbitratorOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    // Prepare arbitration request
    const arbitrationRequest = {
      conflicts: conflicts.map(c => ({
        id: c.id,
        type: c.type,
        agents: c.agents,
        positions: c.positions,
        metadata: c.metadata,
      })),
      context: {
        totalAgents: results.size,
        agentNames: Array.from(results.keys()),
      },
      options: {
        includeAllOutputs: opts.includeAllOutputs,
      },
    };

    // TODO: Invoke ultra:arbitrator agent via skill system
    // For now, use a simple heuristic-based arbitration

    const output: any = {
      _metadata: {
        strategy: 'ultra-arbitrator',
        arbitratorAgent: opts.arbitratorAgent,
        conflictsResolved: 0,
        conflictsEscalated: 0,
      },
    };

    // Apply heuristic-based arbitration
    for (const conflict of conflicts) {
      const resolution = this.heuristicArbitration(conflict);

      if (resolution.decision !== null) {
        // Apply decision
        this.applyDecision(output, conflict, resolution.decision);

        // Update conflict with decision
        conflict.decision = resolution.decision;
        conflict.metadata = {
          ...conflict.metadata,
          arbitrator: opts.arbitratorAgent,
          arbitrationReason: resolution.reason,
        };

        output._metadata.conflictsResolved++;
      } else {
        // Escalate to human
        output._metadata.conflictsEscalated++;
        this.markForHumanResolution(output, conflict);
      }
    }

    return {
      output,
      conflicts,
    };
  }

  /**
   * Heuristic-based arbitration (placeholder)
   *
   * In production, this would be replaced by actual AI arbitration
   */
  private heuristicArbitration(conflict: ConflictRecord): {
    decision: any;
    reason: string;
  } {
    // Simple heuristic: prefer the first agent's position
    // In production, ultra:arbitrator would use sophisticated AI

    if (conflict.type === 'file-edit') {
      return {
        decision: conflict.positions[0].position,
        reason: 'heuristic: first-agent-preference',
      };
    } else if (conflict.type === 'recommendation') {
      return {
        decision: conflict.positions[0].position,
        reason: 'heuristic: first-agent-preference',
      };
    } else {
      return {
        decision: conflict.positions[0].position,
        reason: 'heuristic: first-agent-preference',
      };
    }
  }

  /**
   * Apply arbitration decision to output
   */
  private applyDecision(output: any, conflict: ConflictRecord, decision: any): void {
    if (conflict.type === 'file-edit') {
      if (!output.files) {
        output.files = {};
      }
      output.files[conflict.metadata!.filePath] = decision;
    } else if (conflict.type === 'recommendation') {
      if (!output.recommendations) {
        output.recommendations = {};
      }
      output.recommendations[conflict.metadata!.topic] = decision;
    } else {
      if (!output.values) {
        output.values = {};
      }
      output.values[conflict.metadata!.key] = decision;
    }
  }

  /**
   * Mark conflict for human resolution
   */
  private markForHumanResolution(output: any, conflict: ConflictRecord): void {
    if (conflict.type === 'file-edit') {
      if (!output.files) {
        output.files = {};
      }
      output.files[conflict.metadata!.filePath] = {
        _conflict: true,
        _conflictId: conflict.id,
        _escalated: true,
        _reason: 'arbitration-failed',
        _agents: conflict.agents,
        _positions: conflict.positions,
      };
    } else if (conflict.type === 'recommendation') {
      if (!output.recommendations) {
        output.recommendations = {};
      }
      output.recommendations[conflict.metadata!.topic] = {
        _conflict: true,
        _conflictId: conflict.id,
        _escalated: true,
        _reason: 'arbitration-failed',
        _agents: conflict.agents,
        _positions: conflict.positions,
      };
    }
  }

  /**
   * Merge results without conflicts
   */
  private mergeWithoutConflicts(
    results: Map<string, DelegationResult>,
    conflicts: ConflictRecord[]
  ): {
    output: any;
    conflicts: ConflictRecord[];
  } {
    const output: any = {};

    for (const [agentName, result] of results) {
      if (result.success && result.result) {
        Object.assign(output, result.result);
      }
    }

    return {
      output,
      conflicts,
    };
  }
}
