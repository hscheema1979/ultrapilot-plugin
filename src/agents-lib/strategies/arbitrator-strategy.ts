/**
 * Arbitrator Synthesis Strategy
 *
 * Delegates conflict resolution to ultra:arbitrator agent.
 * The arbitrator is a specialized agent that makes decisions.
 *
 * Use case: When you want AI-assisted conflict resolution
 * with a dedicated decision-making agent.
 *
 * @example
 * ```typescript
 * const strategy = new ArbitratorStrategy(repo);
 * const result = await strategy.resolve(results, conflicts, options);
 * // Conflicts are resolved by arbitrator agent
 * ```
 */

import type { IAgentRepository } from '../types.js';
import type { SynthesisOptions, Conflict } from '../synthesizer.js';

/**
 * Arbitrator Strategy Result
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Arbitrator prompt template
 */
const ARBITRATOR_PROMPT = (conflict: Conflict, options: Array<{ agent: string; content: string }>) => `
You are an expert arbitrator resolving a conflict between multiple AI agents.

## Conflict Details
- Type: ${conflict.type}
- Description: ${conflict.description}
- Location: ${conflict.location || 'unknown'}
- Agents disagreeing: ${conflict.agents.join(', ')}

## Options to Choose From

${options.map((opt, i) => `
### Option ${i + 1} (from ${opt.agent})
${opt.content}
`).join('\n')}

## Your Task
1. Analyze all options carefully
2. Consider the conflict type (${conflict.type}):
   - Content conflicts: Choose the most accurate and comprehensive
   - Technical conflicts: Choose the most robust and maintainable
   - Security conflicts: Choose the most secure option
3. Provide your resolution below

## Resolution Format
Provide ONLY the chosen content, without commentary or explanation.
`;

/**
 * Arbitrator Strategy
 *
 * Delegates to ultra:arbitrator agent for resolution.
 * If arbitrator is not available, falls back to weighted vote.
 */
export class ArbitratorStrategy {
  private repo: IAgentRepository;
  private arbitratorName = 'ultra:arbitrator';

  constructor(repo: IAgentRepository) {
    this.repo = repo;
  }

  /**
   * Resolve conflicts using arbitrator agent
   *
   * @param results - Collected agent results
   * @param conflicts - Detected conflicts
   * @param options - Synthesis options
   * @returns Resolution result with arbitrator decisions
   */
  async resolve(
    results: any,
    conflicts: Conflict[],
    options: SynthesisOptions = {}
  ): Promise<ResolutionResult> {
    const resolutions = new Map<string, string>();
    let resolvedCount = 0;

    // Check if arbitrator is available
    const hasArbitrator = await this.checkArbitratorAvailable();

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
        // Conflict - use arbitrator or fallback
        let resolution: string;
        if (hasArbitrator) {
          resolution = await this.resolveWithArbitrator(
            sectionContents,
            conflictForSection
          );
        } else {
          resolution = this.fallbackResolution(sectionContents, conflictForSection);
        }

        resolutions.set(sectionKey, resolution);
        resolvedCount++;
      }
    }

    return { resolutions, resolvedCount };
  }

  /**
   * Check if arbitrator agent is available
   */
  private async checkArbitratorAvailable(): Promise<boolean> {
    try {
      const agent = await this.repo.getAgent(this.arbitratorName);
      return !!agent;
    } catch {
      return false;
    }
  }

  /**
   * Resolve conflict using arbitrator agent
   *
   * In a real implementation, this would:
   * 1. Call the arbitrator agent with the conflict details
   * 2. Get the arbitrator's decision
   * 3. Return the decision
   *
   * For now, this is a mock implementation.
   */
  private async resolveWithArbitrator(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): Promise<string> {
    // Build prompt
    const prompt = ARBITRATOR_PROMPT(conflict, contents);

    // TODO: In real implementation, call arbitrator agent here
    // For now, use a simple heuristic
    return this.mockArbitratorDecision(contents, conflict);
  }

  /**
   * Mock arbitrator decision (fallback)
   *
   * In production, this would call the actual arbitrator agent.
   * For now, uses simple heuristics.
   */
  private mockArbitratorDecision(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string {
    // For security conflicts, prefer security reviewer
    if (conflict.type === 'security') {
      const securityOption = contents.find((c) => c.agent.includes('security'));
      if (securityOption) {
        return `<!-- Arbitrator (security preference) -->\n${securityOption.content}`;
      }
    }

    // For technical conflicts, prefer architect
    if (conflict.type === 'technical') {
      const architectOption = contents.find((c) => c.agent.includes('architect'));
      if (architectOption) {
        return `<!-- Arbitrator (architect preference) -->\n${architectOption.content}`;
      }
    }

    // For content conflicts, prefer the longest/most detailed
    const longestOption = contents.reduce((longest, current) =>
      current.content.length > longest.content.length ? current : longest
    );

    return `<!-- Arbitrator decision -->\n${longestOption.content}`;
  }

  /**
   * Fallback resolution when arbitrator is unavailable
   *
   * Uses weighted vote as fallback
   */
  private fallbackResolution(
    contents: Array<{ agent: string; content: string }>,
    conflict: Conflict
  ): string {
    // Simple heuristic: prefer specialist for conflict type
    if (conflict.type === 'security') {
      const securityOption = contents.find((c) => c.agent.includes('security'));
      if (securityOption) {
        return `<!-- Fallback: security preference -->\n${securityOption.content}`;
      }
    }

    if (conflict.type === 'technical') {
      const architectOption = contents.find((c) => c.agent.includes('architect'));
      if (architectOption) {
        return `<!-- Fallback: architect preference -->\n${architectOption.content}`;
      }
    }

    // Default to first option
    return `<!-- Fallback: first option -->\n${contents[0].content}`;
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
}
