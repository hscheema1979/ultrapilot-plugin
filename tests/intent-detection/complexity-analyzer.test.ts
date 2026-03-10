/**
 * Complexity Analyzer Tests
 *
 * Test suite for complexity analysis functionality with various
 * task complexities and step estimations.
 */

import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from '../../src/intent-detection/ComplexityAnalyzer.js';
import { DEFAULT_CONFIG } from '../../src/intent-detection/types.js';

describe('ComplexityAnalyzer', () => {
  const analyzer = new ComplexityAnalyzer(DEFAULT_CONFIG);

  describe('Simple Tasks (Direct - Complexity ≤ 15)', () => {
    const simpleExamples = [
      { input: 'fix a typo', expectedMaxScore: 10 },
      { input: 'add a comment', expectedMaxScore: 10 },
      { input: 'rename a variable', expectedMaxScore: 10 },
      { input: 'update the readme', expectedMaxScore: 10 },
      { input: 'change the color', expectedMaxScore: 10 },
      { input: 'what is this?', expectedMaxScore: 8 },
      { input: 'how does it work?', expectedMaxScore: 8 },
      { input: 'explain this function', expectedMaxScore: 10 },
      { input: 'show me an example', expectedMaxScore: 8 },
      { input: 'is this correct?', expectedMaxScore: 8 }
    ];

    simpleExamples.forEach(({ input, expectedMaxScore }) => {
      it(`should classify as simple: "${input}"`, () => {
        const result = analyzer.analyze(input);
        expect(result.score).toBeLessThanOrEqual(expectedMaxScore);
        expect(result.estimatedSteps).toBe(1);
      });
    });
  });

  describe('Medium Tasks (Gray Zone)', () => {
    const mediumExamples = [
      { input: 'add a button to the form', minScore: 15, maxScore: 35 },
      { input: 'create a simple API endpoint', minScore: 20, maxScore: 40 },
      { input: 'update the database schema', minScore: 20, maxScore: 45 },
      { input: 'add validation to inputs', minScore: 15, maxScore: 35 },
      { input: 'implement basic authentication', minScore: 25, maxScore: 50 },
      { input: 'write unit tests for module', minScore: 15, maxScore: 35 }
    ];

    mediumExamples.forEach(({ input, minScore, maxScore }) => {
      it(`should classify as medium: "${input}"`, () => {
        const result = analyzer.analyze(input);
        expect(result.score).toBeGreaterThanOrEqual(minScore);
        expect(result.score).toBeLessThanOrEqual(maxScore);
        expect(result.estimatedSteps).toBeGreaterThan(0);
      });
    });
  });

  describe('Complex Tasks (Autonomous - Complexity ≥ 40)', () => {
    const complexExamples = [
      {
        input: 'build a complete REST API with authentication, database, testing, and deployment',
        minScore: 40,
        minSteps: 5
      },
      {
        input: 'implement a microservices architecture with service mesh, API gateway, and distributed tracing',
        minScore: 60,
        minSteps: 8
      },
      {
        input: 'create a real-time collaboration system with WebSockets, conflict resolution, and offline support',
        minScore: 50,
        minSteps: 6
      },
      {
        input: 'develop a machine learning pipeline with data preprocessing, model training, and deployment',
        minScore: 55,
        minSteps: 7
      },
      {
        input: 'build a payment processing system with PCI compliance, fraud detection, and multi-currency support',
        minScore: 65,
        minSteps: 8
      }
    ];

    complexExamples.forEach(({ input, minScore, minSteps }) => {
      it(`should classify as complex: "${input.substring(0, 50)}..."`, () => {
        const result = analyzer.analyze(input);
        expect(result.score).toBeGreaterThanOrEqual(minScore);
        expect(result.estimatedSteps).toBeGreaterThanOrEqual(minSteps);
      });
    });
  });

  describe('Technical Terms Detection', () => {
    it('should detect API term', () => {
      const result = analyzer.analyze('build an API');
      expect(result.technicalTerms).toContain('api');
    });

    it('should detect multiple technical terms', () => {
      const result = analyzer.analyze('build a REST API with PostgreSQL database and JWT authentication');
      expect(result.technicalTerms.length).toBeGreaterThan(2);
    });

    it('should increase complexity with technical terms', () => {
      const simple = analyzer.analyze('build a system');
      const technical = analyzer.analyze('build a REST API with microservices and Docker');
      expect(technical.score).toBeGreaterThan(simple.score);
    });
  });

  describe('Complex Domains Detection', () => {
    it('should detect machine learning domain', () => {
      const result = analyzer.analyze('implement machine learning model');
      expect(result.complexDomains).toContain('machine learning');
    });

    it('should detect payment processing domain', () => {
      const result = analyzer.analyze('build payment processing system');
      expect(result.complexDomains).toContain('payment processing');
    });

    it('should increase complexity with complex domains', () => {
      const simple = analyzer.analyze('build a system');
      const complex = analyzer.analyze('build a machine learning system');
      expect(complex.score).toBeGreaterThan(simple.score);
    });
  });

  describe('Multipliers', () => {
    it('should apply phase multiplier for multi-phase tasks', () => {
      const result = analyzer.analyze('design the architecture and then implement the API');
      expect(result.breakdown.multipliers.phases).toBeGreaterThan(1.0);
    });

    it('should apply coordination multiplier for integration tasks', () => {
      const result = analyzer.analyze('integrate multiple microservices');
      expect(result.breakdown.multipliers.coordination).toBeGreaterThan(1.0);
    });

    it('should apply verification multiplier for production tasks', () => {
      const result = analyzer.analyze('deploy to production with security testing');
      expect(result.breakdown.multipliers.verification).toBeGreaterThan(1.0);
    });
  });

  describe('Step Estimation', () => {
    it('should estimate 1 step for very simple tasks', () => {
      const result = analyzer.analyze('fix typo');
      expect(result.estimatedSteps).toBe(1);
    });

    it('should estimate more steps for complex tasks', () => {
      const result = analyzer.analyze('build a complete system with API, database, authentication, and deployment');
      expect(result.estimatedSteps).toBeGreaterThan(3);
    });

    it('should scale steps with complexity', () => {
      const simple = analyzer.analyze('add comment');
      const complex = analyzer.analyze('build enterprise application');
      expect(complex.estimatedSteps).toBeGreaterThan(simple.estimatedSteps);
    });
  });

  describe('Duration Estimation', () => {
    it('should estimate duration for simple tasks', () => {
      const result = analyzer.analyze('fix bug');
      expect(result.estimatedDuration).toBeGreaterThan(0);
      expect(result.estimatedDuration).toBeLessThan(30);
    });

    it('should estimate longer duration for complex tasks', () => {
      const result = analyzer.analyze('build complete system');
      expect(result.estimatedDuration).toBeGreaterThan(30);
    });

    it('should scale duration with steps and complexity', () => {
      const simple = analyzer.analyze('add comment');
      const complex = analyzer.analyze('build microservices architecture');
      expect(complex.estimatedDuration).toBeGreaterThan(simple.estimatedDuration);
    });
  });

  describe('Breakdown', () => {
    it('should provide detailed breakdown', () => {
      const result = analyzer.analyze('build a REST API with authentication');
      expect(result.breakdown.wordCount).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.technicalTerms).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.domainComplexity).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.multipliers.phases).toBeGreaterThan(0);
      expect(result.breakdown.multipliers.coordination).toBeGreaterThan(0);
      expect(result.breakdown.multipliers.verification).toBeGreaterThan(0);
    });

    it('should track technical terms found', () => {
      const result = analyzer.analyze('build REST API with JWT auth and Docker');
      expect(result.technicalTerms.length).toBeGreaterThan(0);
    });

    it('should track complex domains found', () => {
      const result = analyzer.analyze('implement machine learning for payment processing');
      expect(result.complexDomains.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = analyzer.analyze('');
      expect(result.score).toBe(0);
      expect(result.estimatedSteps).toBe(1);
    });

    it('should handle very short input', () => {
      const result = analyzer.analyze('hi');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long input', () => {
      const longInput = 'build ' + 'complex '.repeat(100);
      const result = analyzer.analyze(longInput);
      expect(result.score).toBeGreaterThan(0);
      expect(result.estimatedSteps).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const result = analyzer.analyze('fix the bug!!! #urgent @team');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Learning and Updates', () => {
    it('should allow updating technical terms', () => {
      const customTerms = ['blockchain', 'smartcontract'];
      analyzer.updateKnowledge(customTerms, []);
      const result = analyzer.analyze('implement smartcontract');
      expect(result.technicalTerms.length).toBeGreaterThan(0);
    });

    it('should allow updating complex domains', () => {
      const customDomains = ['quantum computing'];
      analyzer.updateKnowledge([], customDomains);
      const result = analyzer.analyze('build quantum computing system');
      expect(result.complexDomains).toContain('quantum computing');
    });
  });
});
