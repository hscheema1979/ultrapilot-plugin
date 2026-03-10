/**
 * Result Synthesizer
 *
 * Intelligently combines results from multiple agents into unified output,
 * handling conflicts and applying configurable synthesis strategies.
 *
 * Part of Phase 3: Parallel Delegation & Result Synthesis
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DelegationResult } from './types.js';
import { EnhancedDelegationResult, ResultCollection } from './collector.js';
import { MergeNonConflictingStrategy } from './strategies/merge-non-conflicting.js';
import { MajorityVoteStrategy } from './strategies/majority-vote.js';
import { WeightedVoteStrategy } from './strategies/weighted-vote.js';
import { MarkConflictsStrategy } from './strategies/mark-conflicts.js';
import { UltraArbitratorStrategy } from './strategies/ultra-arbitrator.js';

/**
 * Synthesis strategy type
 */
export type SynthesisStrategy =
  | 'merge-non-conflicting'
  | 'majority-vote'
  | 'weighted-vote'
  | 'mark-conflicts'
  | 'ultra-arbitrator';

/**
 * Synthesis configuration
 */
export interface SynthesisConfig {
  /** Strategy to use for conflict resolution */
  strategy: SynthesisStrategy;
  /** Output file path (optional) */
  outputPath?: string;
  /** Whether to log conflicts to file */
  logConflicts: boolean;
  /** Conflict log path */
  conflictLogPath: string;
  /** Additional strategy-specific options */
  strategyOptions?: Record<string, any>;
}

/**
 * Conflict record
 */
export interface ConflictRecord {
  /** Conflict ID */
  id: string;
  /** Conflict type */
  type: 'file-edit' | 'recommendation' | 'dependency' | 'other';
  /** Agents involved */
  agents: string[];
  /** Their positions/results */
  positions: Array<{
    agent: string;
    position: any;
  }>;
  /** Resolution strategy used */
  resolutionStrategy: SynthesisStrategy;
  /** Final decision */
  decision: any;
  /** Timestamp */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Synthesis result
 */
export interface SynthesisResult {
  /** Synthesized output */
  output: any;
  /** Conflicts detected and resolved */
  conflicts: ConflictRecord[];
  /** Number of conflicts */
  conflictCount: number;
  /** Synthesis strategy used */
  strategy: SynthesisStrategy;
  /** Timestamp */
  synthesizedAt: number;
  /** Metadata */
  metadata: {
    totalAgents: number;
    successfulAgents: number;
    failedAgents: number;
    synthesisDuration: number;
  };
}

/**
 * Result Synthesizer
 *
 * Combines results from multiple agents using configurable strategies,
 * handling conflicts intelligently and logging all decisions.
 */
export class ResultSynthesizer {
  private config: SynthesisConfig;
  private strategies: Map<SynthesisStrategy, any>;

  constructor(config: SynthesisConfig) {
    this.config = config;
    this.strategies = new Map();

    // Initialize all strategies
    this.strategies.set('merge-non-conflicting', new MergeNonConflictingStrategy());
    this.strategies.set('majority-vote', new MajorityVoteStrategy());
    this.strategies.set('weighted-vote', new WeightedVoteStrategy());
    this.strategies.set('mark-conflicts', new MarkConflictsStrategy());
    this.strategies.set('ultra-arbitrator', new UltraArbitratorStrategy());
  }

  /**
   * Synthesize results from multiple agents
   *
   * @param collection - Result collection from collector
   * @returns Promise<SynthesisResult>
   *
   * @example
   * ```typescript
   * const result = await synthesizer.synthesize(collection);
   * console.log(`Synthesized with ${result.conflictCount} conflicts resolved`);
   * ```
   */
  async synthesize(collection: ResultCollection): Promise<SynthesisResult> {
    const startTime = Date.now();
    const synthesizedAt = Date.now();

    // Get the configured strategy
    const strategy = this.strategies.get(this.config.strategy);
    if (!strategy) {
      throw new Error(`Unknown synthesis strategy: ${this.config.strategy}`);
    }

    // Convert ResultCollection to Map<string, DelegationResult>
    const results = new Map<string, DelegationResult>();
    for (const [agentName, enhancedResult] of collection.results) {
      results.set(agentName, {
        agent: enhancedResult.agent,
        success: enhancedResult.success,
        result: enhancedResult.result,
        error: enhancedResult.error,
        duration: enhancedResult.duration,
        traceId: enhancedResult.traceId,
      });
    }

    // Apply synthesis strategy
    const synthesisOutput = await strategy.synthesize(
      results,
      this.config.strategyOptions
    );

    const synthesisDuration = Date.now() - startTime;

    // Build synthesis result
    const result: SynthesisResult = {
      output: synthesisOutput.output,
      conflicts: synthesisOutput.conflicts,
      conflictCount: synthesisOutput.conflicts.length,
      strategy: this.config.strategy,
      synthesizedAt,
      metadata: {
        totalAgents: collection.stats.totalAgents,
        successfulAgents: collection.stats.successCount,
        failedAgents: collection.stats.failureCount,
        synthesisDuration,
      },
    };

    // Log conflicts if configured
    if (this.config.logConflicts && result.conflicts.length > 0) {
      await this.logConflicts(result.conflicts);
    }

    // Write to output file if configured
    if (this.config.outputPath) {
      await this.writeOutput(result.output, this.config.outputPath);
    }

    return result;
  }

  /**
   * Log conflicts to file
   *
   * @param conflicts - Array of conflict records
   */
  private async logConflicts(conflicts: ConflictRecord[]): Promise<void> {
    try {
      const conflictLog: ConflictLog = {
        conflicts,
        loggedAt: Date.now(),
        strategy: this.config.strategy,
      };

      // Ensure directory exists
      const logDir = path.dirname(this.config.conflictLogPath);
      await fs.mkdir(logDir, { recursive: true });

      // Write conflict log
      await fs.writeFile(
        this.config.conflictLogPath,
        JSON.stringify(conflictLog, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to write conflict log:', error);
    }
  }

  /**
   * Write synthesized output to file
   *
   * @param output - Synthesized output
   * @param outputPath - Output file path
   */
  private async writeOutput(output: any, outputPath: string): Promise<void> {
    try {
      // Ensure directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Write output
      const content = typeof output === 'string'
        ? output
        : JSON.stringify(output, null, 2);

      await fs.writeFile(outputPath, content, 'utf-8');
    } catch (error) {
      console.error('Failed to write output:', error);
    }
  }

  /**
   * Update synthesis configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<SynthesisConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): SynthesisConfig {
    return { ...this.config };
  }

  /**
   * Generate summary report for synthesis result
   *
   * @param result - Synthesis result
   * @returns Human-readable summary report
   */
  generateSummary(result: SynthesisResult): string {
    const lines: string[] = [];

    lines.push('=== Synthesis Result Summary ===\n');

    // Metadata
    lines.push('Metadata:');
    lines.push(`  Total agents: ${result.metadata.totalAgents}`);
    lines.push(`  Successful: ${result.metadata.successfulAgents}`);
    lines.push(`  Failed: ${result.metadata.failedAgents}`);
    lines.push(`  Synthesis duration: ${result.metadata.synthesisDuration}ms`);
    lines.push(`  Strategy: ${result.strategy}`);
    lines.push('');

    // Conflicts
    lines.push(`Conflicts: ${result.conflictCount}`);
    if (result.conflicts.length > 0) {
      lines.push('');

      for (const conflict of result.conflicts) {
        lines.push(`  [${conflict.id}] ${conflict.type}`);
        lines.push(`    Agents: ${conflict.agents.join(', ')}`);
        lines.push(`    Resolution: ${conflict.resolutionStrategy}`);

        if (conflict.metadata) {
          lines.push(`    Metadata: ${JSON.stringify(conflict.metadata)}`);
        }

        lines.push('');
      }
    }

    lines.push(`Synthesized at: ${new Date(result.synthesizedAt).toISOString()}`);
    lines.push('='.repeat(50));

    return lines.join('\n');
  }
}

/**
 * Conflict log structure
 */
interface ConflictLog {
  conflicts: ConflictRecord[];
  loggedAt: number;
  strategy: SynthesisStrategy;
}

/**
 * Base synthesis strategy interface
 */
export interface ISynthesisStrategy {
  /**
   * Synthesize results from multiple agents
   *
   * @param results - Map of agent name to delegation result
   * @param options - Strategy-specific options
   * @returns Promise with synthesized output and conflicts
   */
  synthesize(
    results: Map<string, DelegationResult>,
    options?: Record<string, any>
  ): Promise<{
    output: any;
    conflicts: ConflictRecord[];
  }>;
}
