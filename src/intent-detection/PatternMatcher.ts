/**
 * Pattern Matcher - Task Type Detection
 *
 * Analyzes user input to detect task type (question, exploration, feature request, etc.)
 * using pattern matching and trigger phrase detection.
 */

import { TaskType, PatternMatch, IntentDetectionConfig } from './types.js';

export class PatternMatcher {
  private config: IntentDetectionConfig;

  constructor(config: IntentDetectionConfig) {
    this.config = config;
  }

  /**
   * Analyze input to detect task type
   */
  analyze(input: string): PatternMatch {
    const normalizedInput = input.toLowerCase().trim();
    const results: Array<{ type: TaskType; confidence: number; triggers: string[] }> = [];

    // Check each pattern category
    results.push(this.checkQuestionPatterns(normalizedInput));
    results.push(this.checkExplorationPatterns(normalizedInput));
    results.push(this.checkFeatureRequestPatterns(normalizedInput));
    results.push(this.checkBugFixPatterns(normalizedInput));
    results.push(this.checkRefactoringPatterns(normalizedInput));
    results.push(this.checkReviewPatterns(normalizedInput));

    // Sort by confidence and get the best match
    results.sort((a, b) => b.confidence - a.confidence);
    const best = results[0];

    return {
      taskType: best.type,
      confidence: best.confidence,
      matchedPatterns: this.getPatternNamesForType(best.type),
      triggers: best.triggers
    };
  }

  /**
   * Check for question patterns
   */
  private checkQuestionPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.question.filter(pattern => {
      return input.includes(pattern) || input.startsWith(pattern);
    });

    // Questions ending with ?
    const hasQuestionMark = input.includes('?');
    if (hasQuestionMark) {
      triggers.push('?');
    }

    const confidence = triggers.length > 0 ? 0.95 : 0;
    return { type: TaskType.QUESTION, confidence, triggers };
  }

  /**
   * Check for exploration patterns
   */
  private checkExplorationPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.exploration.filter(pattern => {
      return input.includes(pattern);
    });

    const confidence = triggers.length > 0 ? 0.9 : 0;
    return { type: TaskType.EXPLORATION, confidence, triggers };
  }

  /**
   * Check for feature request patterns
   */
  private checkFeatureRequestPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.featureRequest.filter(pattern => {
      return input.includes(pattern);
    });

    // Feature requests often start with action verbs
    const startsWithAction = this.config.patterns.featureRequest.some(pattern => {
      return input.startsWith(pattern);
    });

    if (startsWithAction && !triggers.includes(this.config.patterns.featureRequest.find(p => input.startsWith(p)) || '')) {
      const firstWord = input.split(' ')[0];
      if (firstWord) {
        triggers.push(firstWord);
      }
    }

    const confidence = triggers.length > 0 ? 0.95 : 0;
    return { type: TaskType.FEATURE_REQUEST, confidence, triggers };
  }

  /**
   * Check for bug fix patterns
   */
  private checkBugFixPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.bugFix.filter(pattern => {
      return input.includes(pattern);
    });

    const confidence = triggers.length > 0 ? 0.9 : 0;
    return { type: TaskType.BUG_FIX, confidence, triggers };
  }

  /**
   * Check for refactoring patterns
   */
  private checkRefactoringPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.refactoring.filter(pattern => {
      return input.includes(pattern);
    });

    const confidence = triggers.length > 0 ? 0.85 : 0;
    return { type: TaskType.REFACTORING, confidence, triggers };
  }

  /**
   * Check for review patterns
   */
  private checkReviewPatterns(input: string): { type: TaskType; confidence: number; triggers: string[] } {
    const triggers = this.config.patterns.review.filter(pattern => {
      return input.includes(pattern);
    });

    const confidence = triggers.length > 0 ? 0.85 : 0;
    return { type: TaskType.REVIEW, confidence, triggers };
  }

  /**
   * Get pattern names for a given task type
   */
  private getPatternNamesForType(type: TaskType): string[] {
    switch (type) {
      case TaskType.QUESTION:
        return this.config.patterns.question;
      case TaskType.EXPLORATION:
        return this.config.patterns.exploration;
      case TaskType.FEATURE_REQUEST:
        return this.config.patterns.featureRequest;
      case TaskType.BUG_FIX:
        return this.config.patterns.bugFix;
      case TaskType.REFACTORING:
        return this.config.patterns.refactoring;
      case TaskType.REVIEW:
        return this.config.patterns.review;
      default:
        return [];
    }
  }

  /**
   * Update patterns dynamically
   */
  updatePatterns(config: Partial<IntentDetectionConfig['patterns']>): void {
    this.config.patterns = Object.assign({}, this.config.patterns, config);
  }
}
