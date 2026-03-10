/**
 * Decision Matrix - Execution Mode Routing
 *
 * Determines whether a task should be handled directly by main Claude
 * or routed to autonomous ultra-autoloop execution based on task type
 * and complexity analysis.
 */

import { ExecutionMode, DecisionResult, TaskType, PatternMatch, ComplexityAnalysis, IntentDetectionConfig } from './types.js';

export class DecisionMatrix {
  private config: IntentDetectionConfig;

  constructor(config: IntentDetectionConfig) {
    this.config = config;
  }

  /**
   * Make decision based on pattern match and complexity analysis
   */
  decide(pattern: PatternMatch, complexity: ComplexityAnalysis): DecisionResult {
    const factors: string[] = [];
    let mode: ExecutionMode;
    let confidence: number;
    let reasoning: string;

    // Rule 1: Questions and exploration ALWAYS go direct
    if (pattern.taskType === TaskType.QUESTION || pattern.taskType === TaskType.EXPLORATION) {
      mode = ExecutionMode.DIRECT;
      confidence = 1.0;
      reasoning = `Detected ${pattern.taskType} type - these are always handled directly by main Claude for immediate conversation.`;
      factors.push('Task type: ' + pattern.taskType);

      return { mode, confidence, reasoning, factors };
    }

    // Rule 2: Feature requests ALWAYS go autonomous
    if (pattern.taskType === TaskType.FEATURE_REQUEST) {
      mode = ExecutionMode.AUTONOMOUS;
      confidence = 1.0;
      reasoning = `Detected feature request - these are always handled autonomously by ultra-autoloop for comprehensive execution.`;
      factors.push('Task type: ' + pattern.taskType);

      return { mode, confidence, reasoning, factors };
    }

    // Rule 3: Bug fixes, refactoring, reviews go autonomous if complex
    if ([TaskType.BUG_FIX, TaskType.REFACTORING, TaskType.REVIEW].includes(pattern.taskType)) {
      if (complexity.score >= this.config.thresholds.directMaxComplexity) {
        mode = ExecutionMode.AUTONOMOUS;
        confidence = 0.95;
        reasoning = `${pattern.taskType} with complexity ${complexity.score} exceeds threshold - autonomous execution for thorough analysis and fix.`;
        factors.push(`Task type: ${pattern.taskType}`, `Complexity: ${complexity.score}`);
      } else {
        mode = ExecutionMode.DIRECT;
        confidence = 0.85;
        reasoning = `${pattern.taskType} with low complexity ${complexity.score} - can be handled directly.`;
        factors.push(`Task type: ${pattern.taskType}`, `Complexity: ${complexity.score}`);
      }

      return { mode, confidence, reasoning, factors };
    }

    // Rule 4: Simple tasks (complexity ≤ 15 AND steps = 1) go direct
    if (complexity.score <= this.config.thresholds.directMaxComplexity && complexity.estimatedSteps === 1) {
      mode = ExecutionMode.DIRECT;
      confidence = 0.95;
      reasoning = `Simple task detected (complexity: ${complexity.score}, steps: ${complexity.estimatedSteps}) - main Claude can handle this directly.`;
      factors.push(`Low complexity: ${complexity.score}`, `Single step: ${complexity.estimatedSteps}`);

      return { mode, confidence, reasoning, factors };
    }

    // Rule 5: Complex tasks (complexity ≥ 40 OR steps ≥ 5) go autonomous
    if (complexity.score >= 40 || complexity.estimatedSteps >= this.config.thresholds.autonomousMinSteps) {
      mode = ExecutionMode.AUTONOMOUS;
      confidence = 1.0;
      reasoning = `Complex task detected (complexity: ${complexity.score}, steps: ${complexity.estimatedSteps}) - requires autonomous execution with multiple agents.`;
      factors.push(`High complexity: ${complexity.score}`, `Multiple steps: ${complexity.estimatedSteps}`);

      return { mode, confidence, reasoning, factors };
    }

    // Rule 6: Gray zone - default to autonomous
    mode = ExecutionMode.AUTONOMOUS;
    confidence = 0.8;
    reasoning = `Task in gray zone (complexity: ${complexity.score}, steps: ${complexity.estimatedSteps}) - defaulting to autonomous execution for thoroughness.`;
    factors.push(`Gray zone complexity: ${complexity.score}`, `Estimated steps: ${complexity.estimatedSteps}`, 'Default: autonomous');

    return { mode, confidence, reasoning, factors };
  }

  /**
   * Check if confidence meets minimum threshold
   */
  isConfidentEnough(decision: DecisionResult): boolean {
    return decision.confidence >= this.config.thresholds.minConfidence;
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<IntentDetectionConfig['thresholds']>): void {
    this.config.thresholds = Object.assign({}, this.config.thresholds, thresholds);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): IntentDetectionConfig['thresholds'] {
    return { ...this.config.thresholds };
  }
}
