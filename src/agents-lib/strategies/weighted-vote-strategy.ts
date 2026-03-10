/**
 * Weighted Vote Synthesis Strategy
 *
 * Uses weighted voting with special rules:
 * - Security reviewer has veto power for security conflicts
 * - Architect has tie-breaker power for technical conflicts
 * - Other agents have default weight of 1
 *
 * Use case: When you want domain expert influence in conflict resolution.
 *
 * @example
 * ```typescript
 * const strategy = new WeightedVoteStrategy(repo);
 * const result = await strategy.resolve(results, conflicts, {
 *   securityVeto: true,
 *   architectTieBreaker: true
 * });
 * ```
 */

import type { IAgentRepository } from '../types.js';
import type { SynthesisOptions, Conflict } from '../synthesizer.js';

/**
 * Vote weight configuration
 */
interface AgentWeights {
  [agentName: string]: number;
}

/**
 * Weighted Vote Strategy Result
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Default agent weights
 */
const DEFAULT_WEIGHTS: AgentWeights = {
  'ultra:security-reviewer': 2, // Security reviewer has extra weight
  'ultra:architect': 1.5, // Architect has extra weight
  'ultra:quality-reviewer': 1.2, // Quality reviewer has slight weight
};

/**
 * Weighted Vote Strategy
 *
 * Agents vote with configurable weights.
 * Security reviewer can veto security conflicts.
 * Architect can break ties on technical conflicts.
 */
export class WeightedVoteStrategy {
  private repo: IAgentRepository;
  private defaultWeights: AgentWeights;

  constructor(repo: IAgentRepository) {
    this.repo = repo;
    this.defaultWeights = { ...DEFAULT_WEIGHTS };
  }

  /**
   * Resolve conflicts by weighted voting
   *
   * @param results - Collected agent results
   * @param conflicts - Detected conflicts
   * @param options - Synthesis options
   * @returns Resolution result with weighted vote winners
   */
  async resolve(
    results: any,
    conflicts: Conflict[],
    options: SynthesisOptions = {}
  ): Promise<ResolutionResult> {
    const resolutions = new Map<string, string>();
    let resolvedCount = 0;

    // Merge custom weights with defaults
    const weights = {
      ...this.defaultWeights,
      ...(options.weights || {}),
    };

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
        // Conflict - weighted vote
        const winner = this.weightedVote(
          sectionContents,
          conflictForSection,
          weights,
          options
        );
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
   * Weighted vote on conflicting content
   *
   * Special rules:
   * - Security conflicts: security reviewer can veto (weight = infinity if opposed)
   * - Technical conflicts: architect gets +1 weight in ties
   * - Otherwise, sum weighted votes
   */
  private weightedVote(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict,
    weights: AgentWeights,
    options: SynthesisOptions
  ): string {
    // Check for security veto
    if (
      conflict.type === 'security' &&
      options.securityVeto !== false
    ) {
      const securityVote = this.checkSecurityVeto(contents, conflict);
      if (securityVote) {
        return `<!-- Security veto applied -->\n${securityVote}`;
      }
    }

    // Group similar content and calculate weighted votes
    const voteGroups = new Map<string, { content: string; weight: number; agents: string[] }>();

    for (const item of contents) {
      const weight = weights[item.agent] || 1.0;

      // Find similar existing content
      let matched = false;
      for (const [key, group] of Array.from(voteGroups.entries())) {
        if (this.similar(item.content, key)) {
          group.weight += weight;
          group.agents.push(item.agent);
          matched = true;
          break;
        }
      }

      if (!matched) {
        voteGroups.set(item.content, {
          content: item.content,
          weight,
          agents: [item.agent],
        });
      }
    }

    // Find max weight
    let maxWeight = 0;
    let winners: string[] = [];

    for (const [content, group] of Array.from(voteGroups.entries())) {
      if (group.weight > maxWeight) {
        maxWeight = group.weight;
        winners = [content];
      } else if (group.weight === maxWeight) {
        winners.push(content);
      }
    }

    // Handle tie with architect
    let winner = winners[0];
    if (winners.length > 1 && options.architectTieBreaker !== false) {
      winner = this.architectTieBreaker(winners, voteGroups);
    }

    // Build annotation
    const winnerGroup = voteGroups.get(winner)!;
    const totalWeight = Array.from(voteGroups.values()).reduce((sum, g) => sum + g.weight, 0);
    const percentage = Math.round((winnerGroup.weight / totalWeight) * 100);

    return `<!-- Weighted vote (${percentage}%) by ${winnerGroup.agents.join(', ')} -->\n${winner}`;
  }

  /**
   * Check for security reviewer veto
   *
   * If security reviewer voted against a proposal, that proposal is rejected.
   */
  private checkSecurityVeto(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string | null {
    const securityAgent = contents.find((c) =>
      c.agent.includes('security')
    );

    if (!securityAgent) {
      return null; // No security reviewer present
    }

    // Find what security reviewer voted for
    const securityVote = securityAgent.content;

    // Check if any other agent voted differently
    const hasOpposition = contents.some(
      (c) => c.agent !== securityAgent.agent && !this.similar(c.content, securityVote)
    );

    if (hasOpposition) {
      // Security reviewer veto - use security version
      return securityVote;
    }

    return null;
  }

  /**
   * Architect tie-breaker
   *
   * If there's a tie and architect is involved, use architect's preference.
   */
  private architectTieBreaker(
    tiedOptions: string[],
    voteGroups: Map<string, { content: string; weight: number; agents: string[] }>
  ): string {
    // Find which option has architect vote
    for (const option of tiedOptions) {
      const group = voteGroups.get(option);
      if (group && group.agents.some((a) => a.includes('architect'))) {
        return option;
      }
    }

    // No architect in tie - return first
    return tiedOptions[0];
  }

  /**
   * Check if two contents are similar (> 80% match)
   */
  private similar(content1: string, content2: string): boolean {
    const len1 = content1.length;
    const len2 = content2.length;

    if (len1 === 0 && len2 === 0) return true;
    if (len1 === 0 || len2 === 0) return false;

    const maxLen = Math.max(len1, len2);
    let matches = 0;

    for (let i = 0; i < Math.min(len1, len2); i++) {
      if (content1[i] === content2[i]) matches++;
    }

    return matches / maxLen > 0.8;
  }
}
