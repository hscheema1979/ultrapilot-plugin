/**
 * Mark Conflicts Strategy
 *
 * Default strategy that tags all conflicts for human resolution
 * without attempting automatic merging or voting.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult } from '../types.js';
import { ConflictRecord, ISynthesisStrategy } from '../synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Strategy options for mark conflicts
 */
export interface MarkConflictsOptions {
  /** Whether to preserve all agent outputs */
  preserveAllOutputs: boolean;
  /** Whether to group conflicts by type */
  groupConflicts: boolean;
  /** Conflict severity levels */
  includeSeverity: boolean;
}

/**
 * Mark Conflicts Strategy
 *
 * Tags all conflicts for human resolution:
 * - Does not attempt automatic merging
 * - Preserves all agent outputs
 * - Groups conflicts by type
 * - Includes severity levels
 * - Requires human review for all conflicts
 */
export class MarkConflictsStrategy implements ISynthesisStrategy {
  async synthesize(
    results: Map<string, DelegationResult>,
    options?: MarkConflictsOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    const opts = options || {
      preserveAllOutputs: true,
      groupConflicts: true,
      includeSeverity: true,
    };

    const conflicts: ConflictRecord[] = [];
    const output: any = {
      _metadata: {
        strategy: 'mark-conflicts',
        totalAgents: results.size,
        conflictsMarked: 0,
        requiresHumanReview: true,
      },
    };

    // Collect all agent outputs
    const allOutputs: Record<string, any> = {};
    for (const [agentName, result] of results) {
      if (result.success && result.result) {
        allOutputs[agentName] = result.result;
      }
    }

    if (opts.preserveAllOutputs) {
      output._allOutputs = allOutputs;
    }

    // Detect conflicts by type
    const fileConflicts = this.detectFileConflicts(allOutputs);
    const recommendationConflicts = this.detectRecommendationConflicts(allOutputs);
    const valueConflicts = this.detectValueConflicts(allOutputs);

    conflicts.push(...fileConflicts);
    conflicts.push(...recommendationConflicts);
    conflicts.push(...valueConflicts);

    // Mark all conflicts in output
    output.files = this.markConflictsInFiles(fileConflicts, allOutputs);
    output.recommendations = this.markConflictsInRecommendations(recommendationConflicts, allOutputs);
    output.values = this.markConflictsInValues(valueConflicts, allOutputs);

    // Update metadata
    output._metadata.conflictsMarked = conflicts.length;

    // Group conflicts if configured
    if (opts.groupConflicts) {
      output._conflictsByType = this.groupConflictsByType(conflicts);
    }

    // Add severity if configured
    if (opts.includeSeverity) {
      output._conflictsBySeverity = this.groupConflictsBySeverity(conflicts);
    }

    return {
      output,
      conflicts,
    };
  }

  /**
   * Detect file conflicts
   */
  private detectFileConflicts(outputs: Record<string, any>): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const fileEdits = new Map<string, Array<{ agent: string; edit: any }>>();

    // Collect file edits from all agents
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

    // Detect conflicts
    for (const [filePath, edits] of fileEdits) {
      if (edits.length > 1) {
        // Check if edits are identical
        const firstEdit = JSON.stringify(edits[0].edit);
        const allIdentical = edits.every(e => JSON.stringify(e.edit) === firstEdit);

        if (!allIdentical) {
          conflicts.push({
            id: uuidv4(),
            type: 'file-edit',
            agents: edits.map(e => e.agent),
            positions: edits.map(e => ({ agent: e.agent, position: e.edit })),
            resolutionStrategy: 'mark-conflicts',
            decision: null,
            timestamp: Date.now(),
            metadata: {
              filePath,
              severity: this.calculateSeverity('file-edit', edits.length),
            },
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

    // Collect recommendations from all agents
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

    // Detect conflicts
    for (const [topic, recs] of recommendations) {
      if (recs.length > 1) {
        // Check if recommendations are identical
        const normalizedRecs = recs.map(r => r.recommendation.trim().toLowerCase());
        const uniqueRecs = new Set(normalizedRecs);

        if (uniqueRecs.size > 1) {
          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: recs.map(r => r.agent),
            positions: recs.map(r => ({ agent: r.agent, position: r.recommendation })),
            resolutionStrategy: 'mark-conflicts',
            decision: null,
            timestamp: Date.now(),
            metadata: {
              topic,
              severity: this.calculateSeverity('recommendation', recs.length),
            },
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

    // Collect key-value pairs from all agents
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

    // Detect conflicts
    for (const [key, values] of keyValuePairs) {
      if (values.length > 1) {
        // Check if values are identical
        const firstValue = JSON.stringify(values[0].value);
        const allIdentical = values.every(v => JSON.stringify(v.value) === firstValue);

        if (!allIdentical) {
          conflicts.push({
            id: uuidv4(),
            type: 'other',
            agents: values.map(v => v.agent),
            positions: values.map(v => ({ agent: v.agent, position: v.value })),
            resolutionStrategy: 'mark-conflicts',
            decision: null,
            timestamp: Date.now(),
            metadata: {
              key,
              severity: this.calculateSeverity('other', values.length),
            },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Mark conflicts in files output
   */
  private markConflictsInFiles(
    conflicts: ConflictRecord[],
    outputs: Record<string, any>
  ): Record<string, any> {
    const files: Record<string, any> = {};

    for (const conflict of conflicts) {
      if (conflict.type === 'file-edit') {
        const filePath = conflict.metadata?.filePath;
        if (filePath) {
          files[filePath] = {
            _conflict: true,
            _conflictId: conflict.id,
            _agents: conflict.agents,
            _edits: conflict.positions.map(p => ({ agent: p.agent, edit: p.position })),
            _severity: conflict.metadata?.severity,
          };
        }
      }
    }

    return files;
  }

  /**
   * Mark conflicts in recommendations output
   */
  private markConflictsInRecommendations(
    conflicts: ConflictRecord[],
    outputs: Record<string, any>
  ): Record<string, any> {
    const recommendations: Record<string, any> = {};

    for (const conflict of conflicts) {
      if (conflict.type === 'recommendation') {
        const topic = conflict.metadata?.topic;
        if (topic) {
          recommendations[topic] = {
            _conflict: true,
            _conflictId: conflict.id,
            _agents: conflict.agents,
            _recommendations: conflict.positions.map(p => ({
              agent: p.agent,
              recommendation: p.position,
            })),
            _severity: conflict.metadata?.severity,
          };
        }
      }
    }

    return recommendations;
  }

  /**
   * Mark conflicts in values output
   */
  private markConflictsInValues(
    conflicts: ConflictRecord[],
    outputs: Record<string, any>
  ): Record<string, any> {
    const values: Record<string, any> = {};

    for (const conflict of conflicts) {
      if (conflict.type === 'other') {
        const key = conflict.metadata?.key;
        if (key) {
          values[key] = {
            _conflict: true,
            _conflictId: conflict.id,
            _agents: conflict.agents,
            _values: conflict.positions.map(p => ({ agent: p.agent, value: p.position })),
            _severity: conflict.metadata?.severity,
          };
        }
      }
    }

    return values;
  }

  /**
   * Group conflicts by type
   */
  private groupConflictsByType(conflicts: ConflictRecord[]): Record<string, ConflictRecord[]> {
    const grouped: Record<string, ConflictRecord[]> = {
      'file-edit': [],
      'recommendation': [],
      'dependency': [],
      'other': [],
    };

    for (const conflict of conflicts) {
      if (grouped[conflict.type]) {
        grouped[conflict.type].push(conflict);
      } else {
        grouped['other'].push(conflict);
      }
    }

    return grouped;
  }

  /**
   * Group conflicts by severity
   */
  private groupConflictsBySeverity(conflicts: ConflictRecord[]): Record<string, ConflictRecord[]> {
    const grouped: Record<string, ConflictRecord[]> = {
      high: [],
      medium: [],
      low: [],
    };

    for (const conflict of conflicts) {
      const severity = conflict.metadata?.severity || 'low';
      if (grouped[severity]) {
        grouped[severity].push(conflict);
      }
    }

    return grouped;
  }

  /**
   * Calculate conflict severity
   */
  private calculateSeverity(conflictType: string, agentCount: number): 'high' | 'medium' | 'low' {
    if (conflictType === 'file-edit') {
      return agentCount > 2 ? 'high' : 'medium';
    } else if (conflictType === 'recommendation') {
      return agentCount > 3 ? 'medium' : 'low';
    } else {
      return 'low';
    }
  }
}
