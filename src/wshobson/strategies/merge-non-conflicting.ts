/**
 * Merge Non-Conflicting Strategy
 *
 * Combines results from multiple agents by merging non-conflicting
 * additions and new sections, leaving conflicts for human resolution.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import { DelegationResult } from '../types.js';
import { ConflictRecord, ISynthesisStrategy } from '../synthesizer.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Strategy options for merge non-conflicting
 */
export interface MergeNonConflictingOptions {
  /** Whether to attempt automatic merging of code */
  autoMergeCode: boolean;
  /** Whether to preserve all agent outputs in comments */
  preserveAgentOutputs: boolean;
}

/**
 * Merge Non-Conflicting Strategy
 *
 * Merges results by combining non-conflicting additions:
 * - New sections that don't overlap
 * - Different files edited by different agents
 * - Non-overlapping code additions
 * - Marks conflicts for human resolution
 */
export class MergeNonConflictingStrategy implements ISynthesisStrategy {
  async synthesize(
    results: Map<string, DelegationResult>,
    options?: MergeNonConflictingOptions
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }> {
    const opts = options || {
      autoMergeCode: true,
      preserveAgentOutputs: false,
    };

    const conflicts: ConflictRecord[] = [];
    const mergedOutput: any = {};
    const fileEdits = new Map<string, Array<{ agent: string; edit: any }>>();
    const textSections = new Map<string, Array<{ agent: string; content: string }>>();

    // Step 1: Categorize results by type
    for (const [agentName, result] of results) {
      if (!result.success || !result.result) {
        continue;
      }

      const agentResult = result.result;

      // Categorize result type
      if (agentResult.files) {
        // File edits
        for (const [filePath, edit] of Object.entries(agentResult.files)) {
          if (!fileEdits.has(filePath)) {
            fileEdits.set(filePath, []);
          }
          fileEdits.get(filePath)!.push({ agent: agentName, edit });
        }
      } else if (agentResult.sections) {
        // Text sections
        for (const [sectionName, content] of Object.entries(agentResult.sections)) {
          if (!textSections.has(sectionName)) {
            textSections.set(sectionName, []);
          }
          textSections.get(sectionName)!.push({ agent: agentName, content: content as string });
        }
      } else if (typeof agentResult === 'object') {
        // Generic object merge
        for (const [key, value] of Object.entries(agentResult)) {
          if (!mergedOutput[key]) {
            mergedOutput[key] = value;
          } else if (JSON.stringify(mergedOutput[key]) !== JSON.stringify(value)) {
            // Conflict detected
            conflicts.push({
              id: uuidv4(),
              type: 'other',
              agents: [agentName],
              positions: [{ agent: agentName, position: { key, value } }],
              resolutionStrategy: 'merge-non-conflicting',
              decision: null, // Mark for human resolution
              timestamp: Date.now(),
              metadata: { conflictType: 'object-key', key },
            });
          }
        }
      } else if (typeof agentResult === 'string') {
        // Text output - append with agent attribution
        if (!mergedOutput.content) {
          mergedOutput.content = [];
        }
        mergedOutput.content.push({ agent: agentName, text: agentResult });
      }
    }

    // Step 2: Merge file edits
    const files: Record<string, any> = {};
    for (const [filePath, edits] of fileEdits) {
      if (edits.length === 1) {
        // No conflict
        files[filePath] = edits[0].edit;
      } else {
        // Multiple agents edited same file - potential conflict
        const conflict = this.detectFileConflict(filePath, edits);
        if (conflict) {
          conflicts.push(conflict);
          // Mark for human resolution
          files[filePath] = {
            _conflict: true,
            _agents: edits.map(e => e.agent),
            _edits: edits.map(e => e.edit),
          };
        } else {
          // Merge non-conflicting edits
          files[filePath] = this.mergeFileEdits(edits);
        }
      }
    }

    if (Object.keys(files).length > 0) {
      mergedOutput.files = files;
    }

    // Step 3: Merge text sections
    const sections: Record<string, any> = {};
    for (const [sectionName, contents] of textSections) {
      if (contents.length === 1) {
        // No conflict
        sections[sectionName] = contents[0].content;
      } else {
        // Multiple agents provided same section - check for conflicts
        const uniqueContents = new Set(contents.map(c => c.content));
        if (uniqueContents.size === 1) {
          // All agents provided identical content
          sections[sectionName] = contents[0].content;
        } else {
          // Conflict - different content for same section
          conflicts.push({
            id: uuidv4(),
            type: 'recommendation',
            agents: contents.map(c => c.agent),
            positions: contents.map(c => ({ agent: c.agent, position: c.content })),
            resolutionStrategy: 'merge-non-conflicting',
            decision: null, // Mark for human resolution
            timestamp: Date.now(),
            metadata: { sectionName },
          });

          // Preserve all versions with agent attribution
          sections[sectionName] = {
            _conflict: true,
            _agents: contents.map(c => c.agent),
            _versions: contents.map(c => ({ agent: c.agent, content: c.content })),
          };
        }
      }
    }

    if (Object.keys(sections).length > 0) {
      mergedOutput.sections = sections;
    }

    return {
      output: mergedOutput,
      conflicts,
    };
  }

  /**
   * Detect if file edits conflict
   *
   * @param filePath - File path
   * @param edits - Array of edits from different agents
   * @returns Conflict record or null if no conflict
   */
  private detectFileConflict(
    filePath: string,
    edits: Array<{ agent: string; edit: any }>
  ): ConflictRecord | null {
    // Check if edits are identical
    const firstEdit = JSON.stringify(edits[0].edit);
    const allIdentical = edits.every(e => JSON.stringify(e.edit) === firstEdit);

    if (allIdentical) {
      return null; // No conflict - all edits are identical
    }

    // Check if edits affect different parts of the file
    // This is a simplified check - real implementation would parse the file
    // and check line ranges

    // For now, treat multiple edits to same file as potential conflict
    return {
      id: uuidv4(),
      type: 'file-edit',
      agents: edits.map(e => e.agent),
      positions: edits.map(e => ({ agent: e.agent, position: e.edit })),
      resolutionStrategy: 'merge-non-conflicting',
      decision: null, // Mark for human resolution
      timestamp: Date.now(),
      metadata: { filePath, conflictType: 'multiple-edits' },
    };
  }

  /**
   * Merge non-conflicting file edits
   *
   * @param edits - Array of edits from different agents
   * @returns Merged edit
   */
  private mergeFileEdits(edits: Array<{ agent: string; edit: any }>): any {
    // If all edits are identical, return any one of them
    const firstEdit = JSON.stringify(edits[0].edit);
    const allIdentical = edits.every(e => JSON.stringify(e.edit) === firstEdit);

    if (allIdentical) {
      return edits[0].edit;
    }

    // Otherwise, mark as conflict (should be handled by detectFileConflict)
    return {
      _conflict: true,
      _agents: edits.map(e => e.agent),
      _edits: edits.map(e => e.edit),
    };
  }
}
