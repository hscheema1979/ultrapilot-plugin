/**
 * Vote Synthesis Strategy
 *
 * Uses majority vote to resolve conflicts.
 * Requires 3+ agents for meaningful voting.
 *
 * Use case: When you have multiple agents and want democratic resolution.
 *
 * @example
 * ```typescript
 * const strategy = new VoteStrategy(repo);
 * const result = await strategy.resolve(results, conflicts, options);
 * // Winner is the most common answer
 * ```
 */

import type { IAgentRepository } from '../types.js';
import type { SynthesisOptions, Conflict } from '../synthesizer.js';

/**
 * Vote Strategy Result
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Vote Strategy
 *
 * For each conflict, count votes for each proposal.
 * The proposal with most votes wins.
 */
export class VoteStrategy {
  private repo: IAgentRepository;

  constructor(repo: IAgentRepository) {
    this.repo = repo;
  }

  /**
   * Resolve conflicts by majority vote
   *
   * @param results - Collected agent results
   * @param conflicts - Detected conflicts
   * @param options - Synthesis options
   * @returns Resolution result with voted winners
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
        // Conflict - vote
        const winner = this.vote(sectionContents, conflictForSection);
        resolutions.set(sectionKey, winner);
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
   * Vote on conflicting content
   *
   * Returns the content with most votes.
   * Ties are resolved by choosing the first option.
   */
  private vote(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string {
    // Group similar content
    const votes = new Map<string, number>();

    for (const item of contents) {
      // Find similar existing content
      let matched = false;
      for (const [key, count] of Array.from(votes.entries())) {
        if (this.similar(item.content, key)) {
          votes.set(key, count + 1);
          matched = true;
          break;
        }
      }

      if (!matched) {
        votes.set(item.content, 1);
      }
    }

    // Find winner
    let winner = '';
    let maxVotes = 0;

    for (const [content, count] of Array.from(votes.entries())) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = content;
      }
    }

    // Add vote annotation
    const percentage = Math.round((maxVotes / contents.length) * 100);
    return `<!-- Majority vote (${percentage}%) -->\n${winner}`;
  }

  /**
   * Check if two contents are similar (> 80% match)
   */
  private similar(content1: string, content2: string): boolean {
    const len1 = content1.length;
    const len2 = content2.length;

    if (len1 === 0 && len2 === 0) return true;
    if (len1 === 0 || len2 === 0) return false;

    // Simple character similarity
    const maxLen = Math.max(len1, len2);
    let matches = 0;

    for (let i = 0; i < Math.min(len1, len2); i++) {
      if (content1[i] === content2[i]) matches++;
    }

    return matches / maxLen > 0.8;
  }
}
