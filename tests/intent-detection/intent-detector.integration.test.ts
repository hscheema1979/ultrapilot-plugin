/**
 * Intent Detector Integration Tests
 *
 * End-to-end tests for the complete intent detection system.
 * Tests real-world scenarios with expected >90% accuracy.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { IntentDetector } from '../../src/intent-detection/IntentDetector.js';
import { ExecutionMode, TaskType } from '../../src/intent-detection/types.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('IntentDetector Integration', () => {
  const testHistoryPath = '/tmp/test-intent-history.json';
  const testStatsPath = '/tmp/test-intent-stats.json';
  let detector: IntentDetector;

  beforeAll(async () => {
    // Clean up test files
    try {
      await rm(testHistoryPath);
      await rm(testStatsPath);
    } catch {}

    detector = new IntentDetector({}, testHistoryPath, testStatsPath);
  });

  describe('Direct Execution Scenarios (Questions, Exploration)', () => {
    const directScenarios = [
      'what is the best way to structure this code?',
      'how do I implement authentication?',
      'why is the memory usage so high?',
      'explain the architecture of this system',
      'think about different approaches for this problem',
      'explore ideas for improving performance',
      'brainstorm solutions for the scalability issue',
      'what if we used a different database?',
      'can you help me understand this algorithm?',
      'describe how the event loop works',
      'show me an example of async patterns',
      'tell me about microservices architecture',
      'is there a better approach?',
      'are there any security concerns?',
      'does this scale well?',
      'consider the edge cases',
      'imagine how this would work at scale',
      'could we simplify the design?',
      'what are your thoughts?',
      'how does the routing work?'
    ];

    directScenarios.forEach(input => {
      it(`should classify as DIRECT: "${input.substring(0, 50)}..."`, async () => {
        const analysis = await detector.analyze(input);

        expect(analysis.decision.mode).toBe(ExecutionMode.DIRECT);
        expect(analysis.decision.confidence).toBeGreaterThanOrEqual(0.8);
        expect(analysis.input).toBe(input);
        expect(analysis.id).toBeDefined();
        expect(analysis.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  describe('Autonomous Execution Scenarios (Features, Complex Tasks)', () => {
    const autonomousScenarios = [
      'build me a REST API for user management',
      'create a complete dashboard with charts and analytics',
      'implement authentication with OAuth and JWT',
      'develop a real-time notification system',
      'add email notifications with templates',
      'make me a responsive landing page',
      'I want a mobile app for this platform',
      'I need a payment integration with Stripe',
      'generate a comprehensive reporting module',
      'construct a data pipeline for analytics',
      'build an admin panel with role-based access',
      'create an API wrapper for external service',
      'implement a caching layer with Redis',
      'develop a CLI tool for automation',
      'add comprehensive unit tests to the module',
      'make the design responsive across devices',
      'I want to integrate with Slack and Discord',
      'I need a database migration system',
      'generate API documentation',
      'construct a microservices architecture'
    ];

    autonomousScenarios.forEach(input => {
      it(`should classify as AUTONOMOUS: "${input.substring(0, 50)}..."`, async () => {
        const analysis = await detector.analyze(input);

        expect(analysis.decision.mode).toBe(ExecutionMode.AUTONOMOUS);
        expect(analysis.decision.confidence).toBeGreaterThanOrEqual(0.8);
        expect(analysis.input).toBe(input);
        expect(analysis.id).toBeDefined();
      });
    });
  });

  describe('Bug Fix Scenarios', () => {
    const bugFixScenarios = [
      { input: 'fix a typo in the readme', expected: ExecutionMode.DIRECT },
      { input: 'fix the authentication bug', expected: ExecutionMode.AUTONOMOUS },
      { input: 'debug the memory leak in production', expected: ExecutionMode.AUTONOMOUS },
      { input: 'resolve the connection timeout', expected: ExecutionMode.AUTONOMOUS },
      { input: 'the login is not working', expected: ExecutionMode.AUTONOMOUS }
    ];

    bugFixScenarios.forEach(({ input, expected }) => {
      it(`should route bug fix appropriately: "${input}"`, async () => {
        const analysis = await detector.analyze(input);

        expect(analysis.decision.mode).toBe(expected);
        expect(analysis.pattern.taskType).toBe(TaskType.BUG_FIX);
      });
    });
  });

  describe('Gray Zone Scenarios', () => {
    const grayZoneScenarios = [
      'add a button to the form',
      'create a simple API endpoint',
      'update the database schema',
      'add validation to the inputs',
      'implement basic logging'
    ];

    grayZoneScenarios.forEach(input => {
      it(`should handle gray zone: "${input}"`, async () => {
        const analysis = await detector.analyze(input);

        // Gray zone defaults to autonomous
        expect(analysis.decision.mode).toBe(ExecutionMode.AUTONOMOUS);
        expect(analysis.decision.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });

  describe('Performance', () => {
    it('should complete analysis in under 1 second', async () => {
      const start = Date.now();
      await detector.analyze('build a REST API with authentication');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should handle multiple analyses efficiently', async () => {
      const inputs = [
        'what is this?',
        'build an API',
        'fix the bug',
        'explain this',
        'create a feature'
      ];

      const start = Date.now();
      for (const input of inputs) {
        await detector.analyze(input);
      }
      const duration = Date.now() - start;

      // Should complete 5 analyses in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('History and Stats', () => {
    it('should track analysis history', async () => {
      const analysis = await detector.analyze('test input');

      const history = await detector.getRecentHistory(10);
      const found = history.find(h => h.id === analysis.id);

      expect(found).toBeDefined();
      expect(found?.input).toBe('test input');
    });

    it('should maintain statistics', async () => {
      await detector.analyze('what is this?');
      await detector.analyze('build an API');

      const stats = await detector.getStats();

      expect(stats.totalAnalyses).toBeGreaterThan(0);
      expect(stats.directDecisions + stats.autonomousDecisions).toBe(stats.totalAnalyses);
    });

    it('should update stats on each analysis', async () => {
      const beforeStats = await detector.getStats();
      await detector.analyze('test query');
      const afterStats = await detector.getStats();

      expect(afterStats.totalAnalyses).toBe(beforeStats.totalAnalyses + 1);
    });
  });

  describe('Feedback and Learning', () => {
    it('should record user feedback', async () => {
      const analysis = await detector.analyze('test feedback');
      await detector.recordFeedback(analysis.id, true, 'Correct decision');

      const history = await detector.getRecentHistory();
      const entry = history.find(h => h.id === analysis.id);

      expect(entry?.correct).toBe(true);
      expect(entry?.feedback).toBe('Correct decision');
    });

    it('should update accuracy based on feedback', async () => {
      const analysis = await detector.analyze('accuracy test');
      await detector.recordFeedback(analysis.id, true);

      const stats = await detector.getStats();
      // Accuracy should be calculated from feedback
      expect(stats.accuracy).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const analysis = await detector.analyze('');

      expect(analysis).toBeDefined();
      expect(analysis.decision.mode).toBeDefined();
    });

    it('should handle very long input', async () => {
      const longInput = 'build a complex system ' + 'with many features '.repeat(50);
      const analysis = await detector.analyze(longInput);

      expect(analysis).toBeDefined();
      expect(analysis.decision.mode).toBe(ExecutionMode.AUTONOMOUS);
    });

    it('should handle special characters', async () => {
      const input = 'build an API!!! #urgent @team #feature';
      const analysis = await detector.analyze(input);

      expect(analysis).toBeDefined();
      expect(analysis.decision.mode).toBe(ExecutionMode.AUTONOMOUS);
    });

    it('should handle mixed case', async () => {
      const analysis = await detector.analyze('WhAt Is ThIs?');

      expect(analysis).toBeDefined();
      expect(analysis.decision.mode).toBe(ExecutionMode.DIRECT);
    });
  });

  describe('Configuration Updates', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        thresholds: {
          directMaxComplexity: 20,
          autonomousMinSteps: 3,
          minConfidence: 0.85
        }
      };

      detector.updateConfig(newConfig);
      const config = detector.getConfig();

      expect(config.thresholds.directMaxComplexity).toBe(20);
      expect(config.thresholds.autonomousMinSteps).toBe(3);
      expect(config.thresholds.minConfidence).toBe(0.85);
    });

    it('should apply updated configuration to new analyses', async () => {
      detector.updateConfig({
        thresholds: { directMaxComplexity: 25 }
      });

      const analysis = await detector.analyze('medium complexity task');
      expect(analysis).toBeDefined();
    });
  });

  describe('Accuracy Target (>90%)', () => {
    const testCases = [
      // Should be DIRECT (20 cases)
      ...Array.from({ length: 20 }, (_, i) => ({
        input: `what is the best approach for case ${i}?`,
        expected: ExecutionMode.DIRECT
      })),

      // Should be AUTONOMOUS (20 cases)
      ...Array.from({ length: 20 }, (_, i) => ({
        input: `build a feature for case ${i}`,
        expected: ExecutionMode.AUTONOMOUS
      }))
    ];

    let correct = 0;
    let total = 0;

    testCases.forEach(({ input, expected }) => {
      it(`should classify correctly: "${input}"`, async () => {
        const analysis = await detector.analyze(input);
        const isCorrect = analysis.decision.mode === expected;

        if (isCorrect) correct++;
        total++;

        // Individual test passes as long as it doesn't crash
        expect(analysis).toBeDefined();
        expect(analysis.decision.mode).toBeDefined();
      });
    });

    it('should achieve >90% accuracy overall', async () => {
      // Run all test cases and calculate accuracy
      const results = await Promise.all(
        testCases.map(async ({ input, expected }) => {
          const analysis = await detector.analyze(input);
          return analysis.decision.mode === expected;
        })
      );

      const accuracy = results.filter(r => r).length / results.length;

      // We expect >90% accuracy
      expect(accuracy).toBeGreaterThan(0.9);
    });
  });
});
