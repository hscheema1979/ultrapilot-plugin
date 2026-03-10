/**
 * Pattern Matcher Tests
 *
 * Test suite for pattern matching functionality with 50+ examples
 * covering both direct and autonomous classifications.
 */

import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../../src/intent-detection/PatternMatcher.js';
import { TaskType, DEFAULT_CONFIG } from '../../src/intent-detection/types.js';

describe('PatternMatcher', () => {
  const matcher = new PatternMatcher(DEFAULT_CONFIG);

  describe('Question Detection (Direct)', () => {
    const questionExamples = [
      'what is the best way to handle authentication?',
      'how do I implement a REST API?',
      'why is my code not working?',
      'when should I use TypeScript?',
      'where do I put the configuration file?',
      'which database is best for my use case?',
      'who is responsible for this module?',
      'explain how the event loop works',
      'describe the architecture of this system',
      'show me an example of async/await',
      'tell me about microservices',
      'can you help me understand closures?',
      'is there a better way to do this?',
      'are there any performance issues?',
      'does this approach scale well?',
      'do you have any suggestions?',
      'what are the pros and cons of GraphQL?',
      'how does the routing work?',
      'why is my test failing?',
      'explain the difference between let and const',
      'what is the time complexity of this algorithm?',
      'how can I optimize this query?',
      'why is the memory usage so high?',
      'when should I use a class vs a function?',
      'where is the bug in this code?',
      'which testing framework should I use?',
      'who maintains this package?',
      'can you explain the pipeline?',
      'is this thread-safe?',
      'are there any security vulnerabilities?',
      'does this work with async code?',
      'do I need to handle errors here?'
    ];

    questionExamples.forEach(example => {
      it(`should detect question in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.QUESTION);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('Exploration Detection (Direct)', () => {
    const explorationExamples = [
      'think about ways to improve the user experience',
      'consider different approaches for the data model',
      'explore ideas for the new feature',
      'brainstorm solutions for the scalability issue',
      'what if we used a different database?',
      'imagine we had unlimited resources',
      'could we implement this with WebSockets?',
      'what do you think about this architecture?',
      'ideas for improving the dashboard',
      'suggestions for better error handling',
      'think about the edge cases',
      'consider the security implications',
      'explore alternative implementations',
      'what if the server goes down?',
      'brainstorm ways to reduce latency',
      'imagine how this would work at scale',
      'could we simplify the design?',
      'what are your thoughts on this approach?'
    ];

    explorationExamples.forEach(example => {
      it(`should detect exploration in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.EXPLORATION);
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });
    });
  });

  describe('Feature Request Detection (Autonomous)', () => {
    const featureExamples = [
      'build me a REST API for user management',
      'create a new dashboard with charts',
      'implement authentication with OAuth',
      'develop a real-time notification system',
      'add email notifications to the app',
      'make me a landing page',
      'I want a mobile app for this',
      'I need a payment integration',
      'generate a report module',
      'construct a data pipeline',
      'build a admin panel',
      'create an API wrapper',
      'implement a caching layer',
      'develop a CLI tool',
      'add unit tests to this module',
      'make a responsive design',
      'I want to integrate with Slack',
      'I need a database migration script',
      'generate documentation',
      'construct a microservice architecture'
    ];

    featureExamples.forEach(example => {
      it(`should detect feature request in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.FEATURE_REQUEST);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('Bug Fix Detection (Autonomous)', () => {
    const bugFixExamples = [
      'fix the authentication bug',
      'debug the memory leak',
      'resolve the connection timeout issue',
      'the login is not working',
      'error when submitting the form',
      'problem with the data validation',
      'broken image upload feature',
      'fix the race condition',
      'debug why tests are failing',
      'resolve the CORS issue',
      'the app crashes on startup',
      'error in the payment flow',
      'fix the validation logic',
      'debug the performance issue',
      'resolve the merge conflict',
      'the API returns wrong data',
      'fix the SQL injection vulnerability',
      'error loading the configuration'
    ];

    bugFixExamples.forEach(example => {
      it(`should detect bug fix in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.BUG_FIX);
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });
    });
  });

  describe('Refactoring Detection', () => {
    const refactoringExamples = [
      'refactor the authentication module',
      'clean up the legacy code',
      'reorganize the project structure',
      'restructure the database schema',
      'optimize the query performance',
      'improve the code readability',
      'simplify the business logic',
      'refactor the API endpoints',
      'clean up the dependencies',
      'reorganize the file structure'
    ];

    refactoringExamples.forEach(example => {
      it(`should detect refactoring in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.REFACTORING);
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('Review Detection', () => {
    const reviewExamples = [
      'review the authentication code',
      'audit the security implementation',
      'check the performance of the API',
      'analyze the code quality',
      'examine the database design',
      'inspect the error handling',
      'evaluate the architecture',
      'assess the test coverage',
      'review the pull request',
      'audit the access controls'
    ];

    reviewExamples.forEach(example => {
      it(`should detect review in: "${example.substring(0, 50)}..."`, () => {
        const result = matcher.analyze(example);
        expect(result.taskType).toBe(TaskType.REVIEW);
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = matcher.analyze('');
      expect(result.confidence).toBe(0);
    });

    it('should handle very short input', () => {
      const result = matcher.analyze('help');
      expect(result).toBeDefined();
    });

    it('should handle mixed case', () => {
      const result = matcher.analyze('WhAt Is ThIs?');
      expect(result.taskType).toBe(TaskType.QUESTION);
    });

    it('should handle multiple question marks', () => {
      const result = matcher.analyze('how does this work???');
      expect(result.taskType).toBe(TaskType.QUESTION);
    });

    it('should prioritize strongest pattern', () => {
      const result = matcher.analyze('build me a REST API?');
      expect(result.taskType).toBe(TaskType.FEATURE_REQUEST);
    });
  });

  describe('Trigger Detection', () => {
    it('should detect question mark trigger', () => {
      const result = matcher.analyze('how does this work?');
      expect(result.triggers).toContain('?');
    });

    it('should detect multiple triggers', () => {
      const result = matcher.analyze('what is the best way to build this?');
      expect(result.triggers.length).toBeGreaterThan(0);
    });

    it('should return matched patterns', () => {
      const result = matcher.analyze('how do I implement this?');
      expect(result.matchedPatterns).toBeDefined();
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });
  });
});
