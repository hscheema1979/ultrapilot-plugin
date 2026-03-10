/**
 * Intent Detection System - Main Export
 *
 * Hybrid execution architecture:
 * - Simple tasks → Main Claude handles directly
 * - Complex tasks → Ultra-autoloop spawns autonomous agents
 */

export * from './types.js';
export * from './IntentDetector.js';
export * from './PatternMatcher.js';
export * from './ComplexityAnalyzer.js';
export * from './DecisionMatrix.js';
