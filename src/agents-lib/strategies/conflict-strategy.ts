/**
 * Conflict Synthesis Strategy
 *
 * Marks all conflicts for human resolution.
 * Does NOT attempt to resolve conflicts automatically.
 *
 * Use case: When you want manual review of all conflicts.
 *
 * @example
 * ```typescript
 * const strategy = new ConflictStrategy(repo);
 * const result = await strategy.resolve(results, conflicts, options);
 * // All conflicts are marked and escalated
 * ```
 */

import type { IAgentRepository } from '../types.js';
import type { SynthesisOptions, Conflict } from '../synthesizer.js';

/**
 * Conflict Strategy Result
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Conflict Strategy
 *
 * All conflicts are marked with clear indicators.
 * No automatic resolution is attempted.
 * All conflicts are marked as escalated.
 */
export class ConflictStrategy {
  private repo: IAgentRepository;

  constructor(repo: IAgentRepository) {
    this.repo = repo;
  }

  /**
   * Mark all conflicts for human resolution
   *
   * @param results - Collected agent results
   * @param conflicts - Detected conflicts
   * @param options - Synthesis options
   * @returns Resolution result with all conflicts marked
   */
  async resolve(
    results: any,
    conflicts: Conflict[],
    options: SynthesisOptions = {}
  ): Promise<ResolutionResult> {
    const resolutions = new Map<string, string>();
    let resolvedCount = 0;

    // Extract all unique sections
    const allSections = this.extractAllSections(results);

    // Process each section
    for (const [sectionKey, sectionContents] of Object.entries(allSections)) {
      const conflictForSection = conflicts.find((c) => c.location === sectionKey);

      if (!conflictForSection) {
        // No conflict - use first version
        resolutions.set(sectionKey, sectionContents[0].content);
        resolvedCount++;
      } else {
        // Conflict - mark for human review
        const markedContent = this.markForHumanReview(
          sectionContents,
          conflictForSection
        );
        resolutions.set(sectionKey, markedContent);
        resolvedCount++;
      }
    }

    return { resolutions, resolvedCount };
  }

  /**
   * Extract all sections from all results
   */
  private extractAllSections(results: any): Record<string, Array<{ agent: string; content: string }>> {
    const sections: Record<string, Array<{ agent: string; content: string }>> = {};
    const allResults = [...results.successful, ...results.failed];

    for (const result of allResults) {
      const content = result.output;
      const resultSections = this.extractSections(content);

      const agentName = result.agentId || result.agentName || 'unknown';

      for (const [key, sectionContent] of Object.entries(resultSections)) {
        if (!sections[key]) {
          sections[key] = [];
        }
        sections[key].push({
          agent: agentName,
          content: sectionContent,
        });
      }
    }

    return sections;
  }

  /**
   * Extract sections from content
   */
  private extractSections(content: string): Record<string, string> {
    const sections: Record<string, string> = {
      '_default': content
    };
    const lines = content.split('\n');
    let currentKey = '_default';
    let currentContent = '';

    for (const line of lines) {
      if (line.match(/^##+\s/)) {
        if (currentContent) {
          sections[currentKey] = currentContent.trim();
        }
        currentKey = line.trim();
        currentContent = '';
      } else {
        currentContent += line + '\n';
      }
    }

    if (currentContent) {
      sections[currentKey] = currentContent.trim();
    }

    return sections;
  }

  /**
   * Mark conflict for human review
   *
   * Creates a detailed conflict report with all options
   */
  private markForHumanReview(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('```');
    lines.push(`⚠️  CONFLICT REQUIRES HUMAN RESOLUTION`);
    lines.push('');
    lines.push(`Type: ${conflict.type.toUpperCase()}`);
    lines.push(`Description: ${conflict.description}`);
    lines.push(`Location: ${conflict.location || 'unknown'}`);
    lines.push(`Agents: ${conflict.agents.join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // List all options
    for (let i = 0; i < contents.length; i++) {
      const item = contents[i];
      lines.push(`Option ${i + 1} (from ${item.agent}):`);
      lines.push('```');
      lines.push(item.content);
      lines.push('```');
      lines.push('');
    }

    // Instructions
    lines.push('---');
    lines.push('');
    lines.push('ACTION REQUIRED:');
    lines.push('1. Review all options above');
    lines.push('2. Choose the best option or create a compromise');
    lines.push('3. Replace this entire block with your decision');
    lines.push('```');

    return lines.join('\n');
  }
}
