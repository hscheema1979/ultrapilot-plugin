/**
 * Intent Detection System - Types
 *
 * Core type definitions for the hybrid execution architecture intent detection system.
 */

/**
 * Task type classification
 */
export enum TaskType {
  QUESTION = 'question',
  EXPLORATION = 'exploration',
  FEATURE_REQUEST = 'feature_request',
  BUG_FIX = 'bug_fix',
  REFACTORING = 'refactoring',
  REVIEW = 'review',
  UNKNOWN = 'unknown'
}

/**
 * Execution mode recommendation
 */
export enum ExecutionMode {
  /** Main Claude handles directly - for simple tasks */
  DIRECT = 'direct',
  /** Ultra-autoloop spawns autonomous agents - for complex tasks */
  AUTONOMOUS = 'autonomous'
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  /** Detected task type */
  taskType: TaskType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Matched patterns */
  matchedPatterns: string[];
  /** Triggering phrases found */
  triggers: string[];
}

/**
 * Complexity analysis result
 */
export interface ComplexityAnalysis {
  /** Overall complexity score (0-100+) */
  score: number;
  /** Estimated number of steps */
  estimatedSteps: number;
  /** Estimated duration in minutes */
  estimatedDuration: number;
  /** Breakdown by category */
  breakdown: {
    wordCount: number;
    technicalTerms: number;
    domainComplexity: number;
    multipliers: {
      phases: number;
      coordination: number;
      verification: number;
    };
  };
  /** Detected technical terms */
  technicalTerms: string[];
  /** Complex domains detected */
  complexDomains: string[];
}

/**
 * Decision matrix result
 */
export interface DecisionResult {
  /** Recommended execution mode */
  mode: ExecutionMode;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Reasoning for the decision */
  reasoning: string;
  /** Factors that influenced the decision */
  factors: string[];
}

/**
 * Complete intent analysis
 */
export interface IntentAnalysis {
  /** Original user message */
  input: string;
  /** Timestamp of analysis */
  timestamp: Date;
  /** Pattern match result */
  pattern: PatternMatch;
  /** Complexity analysis */
  complexity: ComplexityAnalysis;
  /** Decision result */
  decision: DecisionResult;
  /** Unique ID for tracking */
  id: string;
}

/**
 * Intent history entry
 */
export interface IntentHistoryEntry {
  id: string;
  timestamp: Date;
  input: string;
  analysis: IntentAnalysis;
  /** Whether the decision was correct (for learning) */
  correct?: boolean;
  /** User feedback */
  feedback?: string;
}

/**
 * Intent statistics
 */
export interface IntentStats {
  totalAnalyses: number;
  directDecisions: number;
  autonomousDecisions: number;
  accuracy: number;
  averageResponseTime: number;
  accuracyByTaskType: Record<TaskType, number>;
  confusionMatrix: Record<TaskType, Record<TaskType, number>>;
}

/**
 * Intent detection configuration
 */
export interface IntentDetectionConfig {
  /** Thresholds for decision making */
  thresholds: {
    /** Max complexity for direct mode */
    directMaxComplexity: number;
    /** Min steps for autonomous mode */
    autonomousMinSteps: number;
    /** Min confidence for automatic routing */
    minConfidence: number;
  };
  /** Pattern definitions */
  patterns: {
    question: string[];
    exploration: string[];
    featureRequest: string[];
    bugFix: string[];
    refactoring: string[];
    review: string[];
  };
  /** Technical terms that increase complexity */
  technicalTerms: string[];
  /** Complex domains that increase complexity */
  complexDomains: string[];
  /** Learning settings */
  learning: {
    enabled: boolean;
    feedbackRetention: number; // days
    minSamplesForRetraining: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: IntentDetectionConfig = {
  thresholds: {
    directMaxComplexity: 15,
    autonomousMinSteps: 5,
    minConfidence: 0.8
  },
  patterns: {
    question: [
      'what', 'how', 'why', 'when', 'where', 'which', 'who',
      'explain', 'describe', 'show me', 'tell me', 'can you',
      'is there', 'are there', 'does', 'do'
    ],
    exploration: [
      'think about', 'consider', 'explore', 'brainstorm',
      'what if', 'imagine', 'could we', 'what do you think',
      'ideas for', 'suggestions for'
    ],
    featureRequest: [
      'build', 'create', 'implement', 'develop', 'add',
      'make me', 'i want', 'i need', 'generate', 'construct'
    ],
    bugFix: [
      'fix', 'bug', 'error', 'issue', 'problem', 'broken',
      'not working', 'fails', 'crash', 'debug'
    ],
    refactoring: [
      'refactor', 'clean up', 'reorganize', 'restructure',
      'optimize', 'improve', 'simplify'
    ],
    review: [
      'review', 'audit', 'check', 'analyze', 'examine',
      'inspect', 'evaluate', 'assess'
    ]
  },
  technicalTerms: [
    'api', 'rest', 'graphql', 'database', 'sql', 'nosql',
    'authentication', 'authorization', 'oauth', 'jwt',
    'frontend', 'backend', 'fullstack', 'microservice',
    'docker', 'kubernetes', 'ci/cd', 'testing', 'deployment',
    'typescript', 'javascript', 'python', 'java', 'go',
    'react', 'vue', 'angular', 'node', 'express', 'fastify'
  ],
  complexDomains: [
    'machine learning', 'ai', 'cryptocurrency', 'blockchain',
    'distributed system', 'real-time', 'video streaming',
    'payment processing', 'healthcare', 'financial',
    'security', 'scalability', 'performance optimization'
  ],
  learning: {
    enabled: true,
    feedbackRetention: 30,
    minSamplesForRetraining: 100
  }
};
