/**
 * wshobson Synthesis Strategies
 *
 * Exports all synthesis strategies for result combination.
 *
 * @example
 * ```typescript
 * import { MergeStrategy, WeightedVoteStrategy } from './strategies/index.js';
 * ```
 */

export { MergeStrategy } from './merge-strategy.js';
export { VoteStrategy } from './vote-strategy.js';
export { WeightedVoteStrategy } from './weighted-vote-strategy.js';
export { ConflictStrategy } from './conflict-strategy.js';
export { ArbitratorStrategy } from './arbitrator-strategy.js';
