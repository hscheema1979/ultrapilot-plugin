/**
 * Merge Synthesis Strategy
 *
 * Combines non-conflicting sections from multiple agent results.
 * For conflicting sections, includes all versions with markers.
 *
 * Use case: When you want to preserve all agent contributions
 * and manually review conflicts later.
 *
 * @example
 * ```typescript
 * const strategy = new MergeStrategy(repo);
 * const result = await strategy.resolve(results, conflicts, options);
 * // result.resolutions has unique sections merged, conflicts marked
 * ```
 */

import type { IAgentRepository } from '../types.js';
import type { SynthesisOptions, Conflict } from '../synthesizer.js';

/**
 * Merge Strategy Result
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Merge Strategy
 *
 * Non-conflicting sections are merged directly.
 * Conflicting sections are marked with conflict markers.
 */
export class MergeStrategy {
  private repo: IAgentRepository;

  constructor(repo: IAgentRepository) {
    this.repo = repo;
  }

  /**
   * Resolve conflicts by merging non-conflicting sections
   *
   * @param results - Collected agent results
   * @param conflicts - Detected conflicts
   * @param options - Synthesis options
   * @returns Resolution result with merged sections
   */
  async resolve(
    results: any,
    conflicts: Conflict[],
    options: SynthesisOptions = {}
  ): Promise<ResolutionResult> {
    const resolutions = new Map<string, string>();
    let resolvedCount = 0;

    // Extract all unique sections from all results
    const allSections = this.extractAllSections(results);

    // Process each section
    for (const [sectionKey, sectionContents] of Object.entries(allSections)) {
      const conflictForSection = conflicts.find((c) => c.location === sectionKey);

      if (!conflictForSection) {
        // No conflict - merge first version
        resolutions.set(sectionKey, sectionContents[0].content);
        resolvedCount++;
      } else {
        // Conflict - mark all versions
        const markedContent = this.markConflict(sectionContents, conflictForSection);
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
        // Save previous section
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
   * Mark conflicting section with conflict markers
   */
  private markConflict(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string {
    const marker = `<!-- CONFLICT: ${conflict.description} -->`;
    const versions = contents
      .map((c) => `<!-- Version by ${c.agent} -->\n${c.content}`)
      .join('\n\n');

    return `${marker}\n${versions}\n<!-- END CONFLICT -->`;
  }
}
