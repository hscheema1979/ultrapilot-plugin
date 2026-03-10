/**
 * Intent Detector - Core Orchestrator
 *
 * Main orchestrator for the intent detection system.
 * Coordinates pattern matching, complexity analysis, and decision making.
 * Logs all decisions for learning and improvement.
 */

import { v4 as uuidv4 } from 'uuid';
import { PatternMatcher } from './PatternMatcher.js';
import { ComplexityAnalyzer } from './ComplexityAnalyzer.js';
import { DecisionMatrix } from './DecisionMatrix.js';
import {
  IntentAnalysis,
  IntentHistoryEntry,
  IntentStats,
  IntentDetectionConfig,
  DEFAULT_CONFIG,
  ExecutionMode,
  TaskType
} from './types.js';

export class IntentDetector {
  private patternMatcher: PatternMatcher;
  private complexityAnalyzer: ComplexityAnalyzer;
  private decisionMatrix: DecisionMatrix;
  private config: IntentDetectionConfig;
  private historyPath: string;
  private statsPath: string;

  constructor(
    config: Partial<IntentDetectionConfig> = {},
    historyPath: string = '.ultra/state/intent-history.json',
    statsPath: string = '.ultra/state/intent-stats.json'
  ) {
    this.config = Object.assign({}, DEFAULT_CONFIG, config);
    this.patternMatcher = new PatternMatcher(this.config);
    this.complexityAnalyzer = new ComplexityAnalyzer(this.config);
    this.decisionMatrix = new DecisionMatrix(this.config);
    this.historyPath = historyPath;
    this.statsPath = statsPath;
  }

  /**
   * Analyze intent from user input
   */
  async analyze(input: string): Promise<IntentAnalysis> {
    const startTime = Date.now();

    // Step 1: Pattern matching
    const pattern = this.patternMatcher.analyze(input);

    // Step 2: Complexity analysis
    const complexity = this.complexityAnalyzer.analyze(input);

    // Step 3: Decision making
    const decision = this.decisionMatrix.decide(pattern, complexity);

    const analysis: IntentAnalysis = {
      input,
      timestamp: new Date(),
      pattern,
      complexity,
      decision,
      id: uuidv4()
    };

    // Log to history
    await this.logToHistory(analysis);

    // Update stats
    await this.updateStats(analysis, Date.now() - startTime);

    return analysis;
  }

  /**
   * Quick check for direct execution (for performance-critical paths)
   */
  async shouldHandleDirectly(input: string): Promise<boolean> {
    const analysis = await this.analyze(input);
    return analysis.decision.mode === ExecutionMode.DIRECT;
  }

  /**
   * Get recommendation for execution mode
   */
  async getExecutionMode(input: string): Promise<ExecutionMode> {
    const analysis = await this.analyze(input);
    return analysis.decision.mode;
  }

  /**
   * Record user feedback for learning
   */
  async recordFeedback(analysisId: string, correct: boolean, feedback?: string): Promise<void> {
    const history = await this.loadHistory();
    const entry = history.find(e => e.id === analysisId);

    if (entry) {
      entry.correct = correct;
      entry.feedback = feedback;
      await this.saveHistory(history);

      // Update stats with feedback
      const stats = await this.loadStats();
      if (correct) {
        stats.accuracy = this.calculateAccuracy(history);
      }
      await this.saveStats(stats);
    }
  }

  /**
   * Get intent statistics
   */
  async getStats(): Promise<IntentStats> {
    return await this.loadStats();
  }

  /**
   * Get recent history
   */
  async getRecentHistory(limit: number = 100): Promise<IntentHistoryEntry[]> {
    const history = await this.loadHistory();
    return history.slice(-limit);
  }

  /**
   * Log analysis to history
   */
  private async logToHistory(analysis: IntentAnalysis): Promise<void> {
    const history = await this.loadHistory();
    const entry: IntentHistoryEntry = {
      id: analysis.id,
      timestamp: analysis.timestamp,
      input: analysis.input,
      analysis
    };

    history.push(entry);

    // Keep only last 1000 entries
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    await this.saveHistory(history);
  }

  /**
   * Update statistics
   */
  private async updateStats(analysis: IntentAnalysis, responseTime: number): Promise<void> {
    const stats = await this.loadStats();

    stats.totalAnalyses++;
    if (analysis.decision.mode === ExecutionMode.DIRECT) {
      stats.directDecisions++;
    } else {
      stats.autonomousDecisions++;
    }

    // Update average response time
    const totalTime = stats.averageResponseTime * (stats.totalAnalyses - 1) + responseTime;
    stats.averageResponseTime = totalTime / stats.totalAnalyses;

    await this.saveStats(stats);
  }

  /**
   * Calculate accuracy from history
   */
  private calculateAccuracy(history: IntentHistoryEntry[]): number {
    const entriesWithFeedback = history.filter(e => e.correct !== undefined);
    if (entriesWithFeedback.length === 0) return 0;

    const correct = entriesWithFeedback.filter(e => e.correct).length;
    return correct / entriesWithFeedback.length;
  }

  /**
   * Load history from disk
   */
  private async loadHistory(): Promise<IntentHistoryEntry[]> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.historyPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      return [];
    }
  }

  /**
   * Save history to disk
   */
  private async saveHistory(history: IntentHistoryEntry[]): Promise<void> {
    try {
      const fs = await import('fs/promises');
      await fs.mkdir('.ultra/state', { recursive: true });
      await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Failed to save intent history:', error);
    }
  }

  /**
   * Load stats from disk
   */
  private async loadStats(): Promise<IntentStats> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.statsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, return default stats
      return {
        totalAnalyses: 0,
        directDecisions: 0,
        autonomousDecisions: 0,
        accuracy: 0,
        averageResponseTime: 0,
        accuracyByTaskType: {
          [TaskType.QUESTION]: 0,
          [TaskType.EXPLORATION]: 0,
          [TaskType.FEATURE_REQUEST]: 0,
          [TaskType.BUG_FIX]: 0,
          [TaskType.REFACTORING]: 0,
          [TaskType.REVIEW]: 0,
          [TaskType.UNKNOWN]: 0
        },
        confusionMatrix: {} as Record<string, Record<string, number>>
      };
    }
  }

  /**
   * Save stats to disk
   */
  private async saveStats(stats: IntentStats): Promise<void> {
    try {
      const fs = await import('fs/promises');
      await fs.mkdir('.ultra/state', { recursive: true });
      await fs.writeFile(this.statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('Failed to save intent stats:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IntentDetectionConfig>): void {
    this.config = Object.assign({}, this.config, config);
    this.patternMatcher = new PatternMatcher(this.config);
    this.complexityAnalyzer = new ComplexityAnalyzer(this.config);
    this.decisionMatrix = new DecisionMatrix(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): IntentDetectionConfig {
    return Object.assign({}, this.config);
  }
}
