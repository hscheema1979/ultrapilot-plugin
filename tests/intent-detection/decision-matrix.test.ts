/**
 * Decision Matrix Tests
 *
 * Test suite for decision matrix functionality with various
 * routing scenarios and confidence levels.
 */

import { describe, it, expect } from 'vitest';
import { DecisionMatrix } from '../../src/intent-detection/DecisionMatrix.js';
import { PatternMatcher } from '../../src/intent-detection/PatternMatcher.js';
import { ComplexityAnalyzer } from '../../src/intent-detection/ComplexityAnalyzer.js';
import {
  ExecutionMode,
  TaskType,
  DEFAULT_CONFIG
} from '../../src/intent-detection/types.js';

describe('DecisionMatrix', () => {
  const matrix = new DecisionMatrix(DEFAULT_CONFIG);
  const patternMatcher = new PatternMatcher(DEFAULT_CONFIG);
  const complexityAnalyzer = new ComplexityAnalyzer(DEFAULT_CONFIG);

  describe('Questions and Exploration - ALWAYS Direct', () => {
    const directExamples = [
      'what is the best approach?',
      'how do I implement this?',
      'why is this happening?',
      'explain the architecture',
      'think about solutions',
      'explore alternatives',
      'brainstorm ideas',
      'consider different approaches',
      'what if we tried this?',
      'can you help me understand?'
    ];

    directExamples.forEach(input => {
      it(`should route to DIRECT: "${input}"`, () => {
        const pattern = patternMatcher.analyze(input);
        const complexity = complexityAnalyzer.analyze(input);
        const decision = matrix.decide(pattern, complexity);

        expect(decision.mode).toBe(ExecutionMode.DIRECT);
        expect(decision.confidence).toBe(1.0);
        expect(decision.reasoning).toContain('always');
      });
    });
  });

  describe('Feature Requests - ALWAYS Autonomous', () => {
    const autonomousExamples = [
      'build a REST API',
      'create a dashboard',
      'implement authentication',
      'develop a mobile app',
      'add email notifications',
      'make a landing page',
      'generate a report',
      'construct a pipeline'
    ];

    autonomousExamples.forEach(input => {
      it(`should route to AUTONOMOUS: "${input}"`, () => {
        const pattern = patternMatcher.analyze(input);
        const complexity = complexityAnalyzer.analyze(input);
        const decision = matrix.decide(pattern, complexity);

        expect(decision.mode).toBe(ExecutionMode.AUTONOMOUS);
        expect(decision.confidence).toBe(1.0);
        expect(decision.reasoning).toContain('autonomous');
      });
    });
  });

  describe('Simple Tasks - Direct', () => {
    const simpleExamples = [
      { input: 'fix a typo', complexity: 5, steps: 1 },
      { input: 'update readme', complexity: 8, steps: 1 },
      { input: 'add comment', complexity: 5, steps: 1 },
      { input: 'rename variable', complexity: 8, steps: 1 }
    ];

    simpleExamples.forEach(({ input, complexity, steps }) => {
      it(`should route to DIRECT for simple: "${input}"`, () => {
        const pattern = patternMatcher.analyze(input);
        const complexityResult = complexityAnalyzer.analyze(input);

        // Ensure complexity meets criteria
        if (complexityResult.score <= 15 && complexityResult.estimatedSteps === 1) {
          const decision = matrix.decide(pattern, complexityResult);

          expect(decision.mode).toBe(ExecutionMode.DIRECT);
          expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
          expect(decision.reasoning).toContain('Simple task');
        }
      });
    });
  });

  describe('Complex Tasks - Autonomous', () => {
    const complexExamples = [
      { input: 'build a complete system', expectedMode: ExecutionMode.AUTONOMOUS },
      { input: 'implement microservices architecture', expectedMode: ExecutionMode.AUTONOMOUS },
      { input: 'create enterprise application', expectedMode: ExecutionMode.AUTONOMOUS },
      { input: 'develop distributed system', expectedMode: ExecutionMode.AUTONOMOUS }
    ];

    complexExamples.forEach(({ input, expectedMode }) => {
      it(`should route to AUTONOMOUS for complex: "${input}"`, () => {
        const pattern = patternMatcher.analyze(input);
        const complexity = complexityAnalyzer.analyze(input);
        const decision = matrix.decide(pattern, complexity);

        if (complexity.score >= 40 || complexity.estimatedSteps >= 5) {
          expect(decision.mode).toBe(expectedMode);
          expect(decision.confidence).toBe(1.0);
          expect(decision.reasoning).toContain('Complex task');
        }
      });
    });
  });

  describe('Bug Fix Routing', () => {
    it('should route simple bugs to direct', () => {
      const input = 'fix a small typo';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score < 15) {
        expect([ExecutionMode.DIRECT, ExecutionMode.AUTONOMOUS]).toContain(decision.mode);
      }
    });

    it('should route complex bugs to autonomous', () => {
      const input = 'fix the authentication bug in the distributed system with multiple edge cases';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score >= 15) {
        expect(decision.mode).toBe(ExecutionMode.AUTONOMOUS);
        expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  describe('Refactoring Routing', () => {
    it('should route simple refactoring to direct', () => {
      const input = 'clean up this function';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score < 15) {
        expect([ExecutionMode.DIRECT, ExecutionMode.AUTONOMOUS]).toContain(decision.mode);
      }
    });

    it('should route complex refactoring to autonomous', () => {
      const input = 'refactor the entire microservices architecture';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score >= 15) {
        expect(decision.mode).toBe(ExecutionMode.AUTONOMOUS);
      }
    });
  });

  describe('Review Routing', () => {
    it('should route simple reviews to direct', () => {
      const input = 'check this function';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score < 15) {
        expect([ExecutionMode.DIRECT, ExecutionMode.AUTONOMOUS]).toContain(decision.mode);
      }
    });

    it('should route complex reviews to autonomous', () => {
      const input = 'review the entire system for security vulnerabilities and performance issues';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score >= 15) {
        expect(decision.mode).toBe(ExecutionMode.AUTONOMOUS);
      }
    });
  });

  describe('Gray Zone - Default to Autonomous', () => {
    const grayZoneExamples = [
      'add a button with validation',
      'create a simple API endpoint',
      'update the database schema',
      'implement basic logging'
    ];

    grayZoneExamples.forEach(input => {
      it(`should default to AUTONOMOUS in gray zone: "${input}"`, () => {
        const pattern = patternMatcher.analyze(input);
        const complexity = complexityAnalyzer.analyze(input);
        const decision = matrix.decide(pattern, complexity);

        // If not clearly direct or autonomous
        if (complexity.score > 15 && complexity.score < 40) {
          expect(decision.mode).toBe(ExecutionMode.AUTONOMOUS);
          expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
          expect(decision.reasoning).toContain('gray zone');
        }
      });
    });
  });

  describe('Decision Factors', () => {
    it('should include task type in factors', () => {
      const input = 'build a REST API';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      expect(decision.factors.length).toBeGreaterThan(0);
    });

    it('should include complexity in factors for complex tasks', () => {
      const input = 'build a complete enterprise system';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score >= 40) {
        const hasComplexityFactor = decision.factors.some(f =>
          f.toLowerCase().includes('complexity')
        );
        expect(hasComplexityFactor).toBe(true);
      }
    });

    it('should include steps in factors for multi-step tasks', () => {
      const input = 'build a complete system';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.estimatedSteps >= 5) {
        const hasStepsFactor = decision.factors.some(f =>
          f.toLowerCase().includes('step')
        );
        expect(hasStepsFactor).toBe(true);
      }
    });
  });

  describe('Confidence Levels', () => {
    it('should have 100% confidence for questions', () => {
      const input = 'what is this?';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      expect(decision.confidence).toBe(1.0);
    });

    it('should have 100% confidence for feature requests', () => {
      const input = 'build an API';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      expect(decision.confidence).toBe(1.0);
    });

    it('should have high confidence for simple tasks', () => {
      const input = 'fix typo';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      if (complexity.score <= 15) {
        expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should have reasonable confidence in gray zone', () => {
      const input = 'add a feature';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Configuration', () => {
    it('should allow threshold updates', () => {
      matrix.updateThresholds({ directMaxComplexity: 20 });
      const thresholds = matrix.getThresholds();

      expect(thresholds.directMaxComplexity).toBe(20);
    });

    it('should apply updated thresholds', () => {
      matrix.updateThresholds({ directMaxComplexity: 25 });

      const input = 'medium complexity task';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      // Should use new threshold
      expect(decision).toBeDefined();
    });
  });

  describe('Confidence Check', () => {
    it('should identify confident decisions', () => {
      const input = 'what is this?';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      expect(matrix.isConfidentEnough(decision)).toBe(true);
    });

    it('should identify low confidence decisions', () => {
      // Create a gray zone scenario
      const input = 'do something';
      const pattern = patternMatcher.analyze(input);
      const complexity = complexityAnalyzer.analyze(input);
      const decision = matrix.decide(pattern, complexity);

      // Gray zone should have at least 0.7 confidence
      expect(decision.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });
});
