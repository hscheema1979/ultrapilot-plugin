/**
 * wshobson Result Synthesizer
 *
 * Combines results from multiple parallel agents into unified output.
 * Supports multiple synthesis strategies with conflict detection and resolution.
 *
 * This component:
 * - Merges non-conflicting sections from multiple results
 * - Detects conflicts (content, technical, security)
 * - Applies configurable resolution strategies
 * - Produces unified document with metadata
 * - Logs conflicts for human review
 *
 * @example
 * ```typescript
 * const synthesizer = new ResultSynthesizer(repo, logger);
 * const result = await synthesizer.synthesize(collectedResults, 'weighted-vote');
 * console.log(result.unified);  // Merged document
 * console.log(result.conflicts);  // Any unresolved conflicts
 * ```
 */

import type { IAgentRepository, Agent } from './types.js';
import type { CollectedResults } from './collector.js';
import { MergeStrategy } from './strategies/merge-strategy.js';
import { VoteStrategy } from './strategies/vote-strategy.js';
import { WeightedVoteStrategy } from './strategies/weighted-vote-strategy.js';
import { ConflictStrategy } from './strategies/conflict-strategy.js';
import { ArbitratorStrategy } from './strategies/arbitrator-strategy.js';

/**
 * Synthesis strategy type
 *
 * - merge: Combine non-conflicting sections, keep all conflicting versions
 * - vote: Majority vote for conflicts (requires 3+ agents)
 * - weighted-vote: Weighted voting with security veto and architect tie-breaker
 * - conflict: Mark all conflicts for human resolution
 * - arbitrator: Delegate to ultra:arbitrator agent for resolution
 */
export type SynthesisStrategy =
  | 'merge'
  | 'vote'
  | 'weighted-vote'
  | 'conflict'
  | 'arbitrator';

/**
 * Conflict type classification
 */
export type ConflictType = 'content' | 'technical' | 'security';

/**
 * Conflict detected during synthesis
 */
export interface Conflict {
  /**
   * Conflict type
   */
  type: ConflictType;

  /**
   * Human-readable description of the conflict
   */
  description: string;

  /**
   * Agents that disagree (names)
   */
  agents: string[];

  /**
   * Section or location of conflict
   */
  location?: string;

  /**
   * Proposed resolutions (one per agent)
   */
  proposals: Array<{
    agent: string;
    content: string;
  }>;

  /**
   * Resolution applied (if any)
   */
  resolution?: string;

  /**
   * Whether conflict was escalated for human review
   */
  escalated: boolean;

  /**
   * Confidence score for resolution (0-1)
   */
  confidence?: number;
}

/**
 * Synthesis result
 */
export interface SynthesisResult {
  /**
   * Unified merged document
   */
  unified: string;

  /**
   * List of conflicts (resolved or escalated)
   */
  conflicts: Conflict[];

  /**
   * Strategy used for synthesis
   */
  strategy: SynthesisStrategy;

  /**
   * Metadata about the synthesis process
   */
  metadata: {
    /**
     * Number of agents whose results were synthesized
     */
    agentCount: number;

    /**
     * Overall confidence in the result (0-1)
     * Based on agreement level and conflict resolution success
     */
    confidence: number;

    /**
     * How conflicts were resolved
     */
    resolutionMethod: string;

    /**
     * Time taken for synthesis (ms)
     */
    duration: number;

    /**
     * Number of sections merged
     */
    sectionsMerged: number;

    /**
     * Number of conflicts detected
     */
    conflictsDetected: number;

    /**
     * Number of conflicts resolved
     */
    conflictsResolved: number;

    /**
     * Number of conflicts escalated
     */
    conflictsEscalated: number;
  };

  /**
   * Per-agent contribution summary
   */
  contributions: Array<{
    agent: string;
    sectionsContributed: number;
    conflictsInitiated: number;
    conflictsResolved: number;
  }>;
}

/**
 * Synthesis options
 */
export interface SynthesisOptions {
  /**
   * Minimum confidence threshold (0-1)
   * Below this, synthesis will be escalated
   */
  minConfidence?: number;

  /**
   * Whether to log conflicts to .ultra/conflicts.json
   */
  logConflicts?: boolean;

  /**
   * Custom weights for weighted-vote strategy
   */
  weights?: Record<string, number>;

  /**
   * Whether security reviewer has veto power
   */
  securityVeto?: boolean;

  /**
   * Whether architect has tie-breaker power
   */
  architectTieBreaker?: boolean;

  /**
   * Callback for progress updates
   */
  onProgress?: (update: SynthesisProgress) => void;
}

/**
 * Progress update during synthesis
 */
export interface SynthesisProgress {
  phase: 'detecting' | 'resolving' | 'merging' | 'complete';
  percentComplete: number;
  message: string;
  conflictsDetected?: number;
  conflictsResolved?: number;
}

/**
 * Result Synthesizer
 *
 * Orchestrates the synthesis process:
 * 1. Detect conflicts across all results
 * 2. Apply resolution strategy
 * 3. Merge resolved content
 * 4. Produce unified output
 */
export class ResultSynthesizer {
  private repo: IAgentRepository;
  private detector: ConflictDetector;
  private strategies: Map<SynthesisStrategy, SynthesisStrategyInterface>;
  private conflictsPath: string;

  constructor(repo: IAgentRepository, workspacePath: string = '/tmp/ultrapilot') {
    this.repo = repo;
    this.detector = new ConflictDetector();
    this.conflictsPath = `${workspacePath}/.ultra/conflicts.json`;

    // Initialize all strategies
    this.strategies = new Map<SynthesisStrategy, SynthesisStrategyInterface>();
    this.strategies.set('merge', new MergeStrategy(repo));
    this.strategies.set('vote', new VoteStrategy(repo));
    this.strategies.set('weighted-vote', new WeightedVoteStrategy(repo));
    this.strategies.set('conflict', new ConflictStrategy(repo));
    this.strategies.set('arbitrator', new ArbitratorStrategy(repo));
  }

  /**
   * Synthesize multiple results into unified output
   *
   * @param results - Collected results from multiple agents
   * @param strategy - Synthesis strategy to use
   * @param options - Optional configuration
   * @returns Unified result with metadata
   */
  async synthesize(
    results: CollectedResults,
    strategy: SynthesisStrategy = 'merge',
    options: SynthesisOptions = {}
  ): Promise<SynthesisResult> {
    const startTime = Date.now();

    this.reportProgress(options, {
      phase: 'detecting',
      percentComplete: 0,
      message: 'Detecting conflicts...',
    });

    // Step 1: Detect conflicts
    const conflicts = await this.detector.detectConflicts(results);

    this.reportProgress(options, {
      phase: 'detecting',
      percentComplete: 20,
      message: `Detected ${conflicts.length} conflicts`,
      conflictsDetected: conflicts.length,
    });

    // Step 2: Get strategy instance
    const strategyInstance = this.strategies.get(strategy);
    if (!strategyInstance) {
      throw new Error(`Unknown synthesis strategy: ${strategy}`);
    }

    // Step 3: Apply resolution strategy
    this.reportProgress(options, {
      phase: 'resolving',
      percentComplete: 30,
      message: `Resolving conflicts using ${strategy} strategy...`,
    });

    const resolutionResult = await strategyInstance.resolve(
      results,
      conflicts,
      options
    );

    this.reportProgress(options, {
      phase: 'resolving',
      percentComplete: 60,
      message: `Resolved ${resolutionResult.resolvedCount} conflicts`,
      conflictsResolved: resolutionResult.resolvedCount,
    });

    // Step 4: Merge resolved content
    this.reportProgress(options, {
      phase: 'merging',
      percentComplete: 70,
      message: 'Merging content...',
    });

    const mergedContent = await this.mergeContent(
      results,
      conflicts,
      resolutionResult.resolutions
    );

    // Step 5: Build contribution summary
    const contributions = this.buildContributions(results, conflicts);

    // Step 6: Calculate confidence
    const confidence = this.calculateConfidence(
      conflicts,
      resolutionResult.resolvedCount
    );

    // Step 7: Log conflicts if requested
    if (options.logConflicts !== false) {
      await this.logConflicts(conflicts, resolutionResult.resolutions);
    }

    const duration = Date.now() - startTime;
    const escalatedCount = conflicts.filter(
      (c) => !resolutionResult.resolutions.has(c.description)
    ).length;

    this.reportProgress(options, {
      phase: 'complete',
      percentComplete: 100,
      message: 'Synthesis complete',
    });

    return {
      unified: mergedContent,
      conflicts: this.updateConflicts(conflicts, resolutionResult.resolutions),
      strategy,
      metadata: {
        agentCount: results.total,
        confidence,
        resolutionMethod: strategy,
        duration,
        sectionsMerged: this.countSections(mergedContent),
        conflictsDetected: conflicts.length,
        conflictsResolved: resolutionResult.resolvedCount,
        conflictsEscalated: escalatedCount,
      },
      contributions,
    };
  }

  /**
   * Merge content from all results with applied resolutions
   */
  private async mergeContent(
    results: CollectedResults,
    conflicts: Conflict[],
    resolutions: Map<string, string>
  ): Promise<string> {
    const sections: string[] = [];
    const seenSections = new Set<string>();

    // Process each successful result in order
    const allResults = [...results.successful, ...results.failed];

    for (const result of allResults) {
      const content = result.output;

      // Skip results with no output
      if (!content) {
        continue;
      }

      // Split into sections (assuming markdown-style headers)
      const lines = content.split('\n');
      let currentSection = '';

      for (const line of lines) {
        // Check if this is a section header
        if (line.startsWith('##') || line.startsWith('#')) {
          // Save previous section if not seen
          if (currentSection && !seenSections.has(currentSection)) {
            sections.push(currentSection);
            seenSections.add(currentSection);
          }

          // Check if this section has a resolution
          const sectionKey = line.trim();
          if (resolutions.has(sectionKey)) {
            currentSection = resolutions.get(sectionKey)!;
          } else {
            currentSection = line;
          }
        } else {
          currentSection += (currentSection ? '\n' : '') + line;
        }
      }

      // Add last section
      if (currentSection && !seenSections.has(currentSection)) {
        sections.push(currentSection);
        seenSections.add(currentSection);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Build contribution summary per agent
   */
  private buildContributions(
    results: CollectedResults,
    conflicts: Conflict[]
  ): Array<{
    agent: string;
    sectionsContributed: number;
    conflictsInitiated: number;
    conflictsResolved: number;
  }> {
    const allResults = [...results.successful, ...results.failed];

    return allResults.map((result) => {
      const agentConflicts = conflicts.filter((c) =>
        c.agents.includes(result.agentName)
      );

      return {
        agent: result.agentName,
        sectionsContributed: this.countSections(result.output ?? ''),
        conflictsInitiated: agentConflicts.length,
        conflictsResolved: 0, // Will be updated by strategy
      };
    });
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    conflicts: Conflict[],
    resolvedCount: number
  ): number {
    if (conflicts.length === 0) {
      return 1.0;
    }

    const agreementBonus = 1 - conflicts.length / 10; // Fewer conflicts = higher confidence
    const resolutionBonus = resolvedCount / conflicts.length;

    return Math.min(1.0, Math.max(0.0, (agreementBonus + resolutionBonus) / 2));
  }

  /**
   * Count sections in content
   */
  private countSections(content: string): number {
    const headers = content.match(/^##+\s/gm);
    return headers ? headers.length : 1;
  }

  /**
   * Log conflicts to .ultra/conflicts.json
   */
  private async logConflicts(
    conflicts: Conflict[],
    resolutions: Map<string, string>
  ): Promise<void> {
    const conflictLog = {
      timestamp: new Date().toISOString(),
      conflicts: conflicts.map((c) => ({
        type: c.type,
        description: c.description,
        agents: c.agents,
        location: c.location,
        resolution: resolutions.get(c.description),
        escalated: !resolutions.has(c.description),
      })),
    };

    // Ensure directory exists
    const dir = this.conflictsPath.substring(0, this.conflictsPath.lastIndexOf('/'));
    await import('fs').then((fs) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.conflictsPath,
        JSON.stringify(conflictLog, null, 2),
        'utf-8'
      );
    });
  }

  /**
   * Update conflicts with resolutions
   */
  private updateConflicts(
    conflicts: Conflict[],
    resolutions: Map<string, string>
  ): Conflict[] {
    return conflicts.map((c) => ({
      ...c,
      resolution: resolutions.get(c.description),
      escalated: !resolutions.has(c.description),
    }));
  }

  /**
   * Report progress if callback provided
   */
  private reportProgress(
    options: SynthesisOptions,
    update: SynthesisProgress
  ): void {
    if (options.onProgress) {
      options.onProgress(update);
    }
  }
}

/**
 * Strategy interface
 */
interface SynthesisStrategyInterface {
  resolve(
    results: CollectedResults,
    conflicts: Conflict[],
    options: SynthesisOptions
  ): Promise<ResolutionResult>;
}

/**
 * Resolution result from strategy
 */
interface ResolutionResult {
  resolutions: Map<string, string>;
  resolvedCount: number;
}

/**
 * Conflict Detector
 *
 * Analyzes multiple agent results to detect conflicts
 */
export class ConflictDetector {
  /**
   * Detect conflicts across all results
   */
  async detectConflicts(results: CollectedResults): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    const allResults = [...results.successful, ...results.failed];

    if (allResults.length < 2) {
      return conflicts;
    }

    // Compare each result with every other
    for (let i = 0; i < allResults.length; i++) {
      for (let j = i + 1; j < allResults.length; j++) {
        const result1 = allResults[i];
        const result2 = allResults[j];

        // Detect content conflicts
        const contentConflicts = this.detectContentConflicts(
          result1,
          result2
        );
        conflicts.push(...contentConflicts);

        // Detect technical conflicts
        const technicalConflicts = this.detectTechnicalConflicts(
          result1,
          result2
        );
        conflicts.push(...technicalConflicts);

        // Detect security conflicts
        const securityConflicts = this.detectSecurityConflicts(
          result1,
          result2
        );
        conflicts.push(...securityConflicts);
      }
    }

    return this.deduplicateConflicts(conflicts);
  }

  /**
   * Detect content conflicts (different recommendations for same topic)
   */
  private detectContentConflicts(
    result1: any,
    result2: any
  ): Conflict[] {
    const conflicts: Conflict[] = [];
    const sections1 = this.extractSections(result1.output);
    const sections2 = this.extractSections(result2.output);

    const agent1 = result1.agentId || result1.agentName || 'unknown';
    const agent2 = result2.agentId || result2.agentName || 'unknown';

    // Find overlapping sections with different content
    for (const [key1, content1] of Object.entries(sections1)) {
      if (sections2[key1]) {
        const content2 = sections2[key1];
        if (content1 !== content2 && this.isSignificantDifference(content1, content2)) {
          conflicts.push({
            type: 'content',
            description: `Different content for section: ${key1}`,
            agents: [agent1, agent2],
            location: key1,
            proposals: [
              { agent: agent1, content: content1 },
              { agent: agent2, content: content2 },
            ],
            escalated: false,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect technical conflicts (different implementations)
   */
  private detectTechnicalConflicts(
    result1: any,
    result2: any
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    const agent1 = result1.agentId || result1.agentName || 'unknown';
    const agent2 = result2.agentId || result2.agentName || 'unknown';

    // Check for conflicting library choices
    const libs1 = this.extractLibraries(result1.output);
    const libs2 = this.extractLibraries(result2.output);

    for (const lib of Array.from(libs1)) {
      if (libs2.has(lib) && this.isConflictingUsage(lib, result1.output, result2.output)) {
        conflicts.push({
          type: 'technical',
          description: `Conflicting usage of library: ${lib}`,
          agents: [agent1, agent2],
          location: 'imports/dependencies',
          proposals: [
            { agent: agent1, content: this.extractUsage(result1.output, lib) },
            { agent: agent2, content: this.extractUsage(result2.output, lib) },
          ],
          escalated: false,
        });
      }
    }

    return conflicts;
  }

  /**
   * Detect security conflicts (different security approaches)
   */
  private detectSecurityConflicts(
    result1: any,
    result2: any
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    const agent1 = result1.agentId || result1.agentName || 'unknown';
    const agent2 = result2.agentId || result2.agentName || 'unknown';

    // Check for conflicting security recommendations
    const security1 = this.extractSecurityRecommendations(result1.output);
    const security2 = this.extractSecurityRecommendations(result2.output);

    for (const rec1 of security1) {
      for (const rec2 of security2) {
        if (
          rec1.topic === rec2.topic &&
          rec1.recommendation !== rec2.recommendation
        ) {
          conflicts.push({
            type: 'security',
            description: `Conflicting security recommendation for: ${rec1.topic}`,
            agents: [agent1, agent2],
            location: 'security',
            proposals: [
              { agent: agent1, content: rec1.recommendation },
              { agent: agent2, content: rec2.recommendation },
            ],
            escalated: false,
            confidence: 0.9, // Security conflicts are high confidence
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract sections from markdown content
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
   * Check if difference is significant (> 10% different)
   */
  private isSignificantDifference(content1: string, content2: string): boolean {
    const len1 = content1.length;
    const len2 = content2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return false;

    // Simple character-level difference
    let diff = 0;
    const minLen = Math.min(len1, len2);
    for (let i = 0; i < minLen; i++) {
      if (content1[i] !== content2[i]) diff++;
    }
    diff += Math.abs(len1 - len2);

    return diff / maxLen > 0.1;
  }

  /**
   * Extract library names from code
   */
  private extractLibraries(content: string): Set<string> {
    const libs = new Set<string>();
    const imports = content.matchAll(
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
    );
    for (const match of Array.from(imports)) {
      const lib = match[1].split('/')[0];
      libs.add(lib);
    }
    return libs;
  }

  /**
   * Check if library usage is conflicting
   */
  private isConflictingUsage(
    lib: string,
    content1: string,
    content2: string
  ): boolean {
    // Extract usage patterns
    const usage1 = this.extractUsage(content1, lib);
    const usage2 = this.extractUsage(content2, lib);
    return usage1 !== usage2;
  }

  /**
   * Extract library usage pattern
   */
  private extractUsage(content: string, lib: string): string {
    const regex = new RegExp(`${lib}[^\\n]*(\\n[^\\n]*){0,3}`, 'g');
    const matches = content.match(regex);
    return matches ? matches.join('\n') : '';
  }

  /**
   * Extract security recommendations
   */
  private extractSecurityRecommendations(
    content: string
  ): Array<{ topic: string; recommendation: string }> {
    const recommendations: Array<{ topic: string; recommendation: string }> = [];

    // Look for security-related sections
    const securitySection = content.match(
      /##+\s*[Ss]ecurity[^#]*\n([\s\S]*?)(?=\n##+|\Z)/
    );

    if (securitySection) {
      const lines = securitySection[1].split('\n');
      for (const line of lines) {
        if (line.includes('should') || line.includes('must') || line.includes('recommend')) {
          recommendations.push({
            topic: 'general',
            recommendation: line.trim(),
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Deduplicate conflicts by description
   */
  private deduplicateConflicts(conflicts: Conflict[]): Conflict[] {
    const seen = new Set<string>();
    const unique: Conflict[] = [];

    for (const conflict of conflicts) {
      const key = `${conflict.type}:${conflict.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(conflict);
      } else {
        // Merge agents into existing conflict
        const existing = unique.find((c) => c.type === conflict.type && c.description === conflict.description);
        if (existing) {
          for (const agent of conflict.agents) {
            if (!existing.agents.includes(agent)) {
              existing.agents.push(agent);
            }
          }
          existing.proposals.push(...conflict.proposals);
        }
      }
    }

    return unique;
  }
}
