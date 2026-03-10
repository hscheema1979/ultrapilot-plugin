/**
 * Agent Repository Exports
 *
 * Unified exports for all repository implementations.
 * Supports both InMemory and SQLite backends.
 */

export { InMemoryAgentRepository, createInMemoryRepository } from './in-memory.js';
export {
  SQLiteAgentRepository,
  createSQLiteRepository,
  createRepository,
  migrateInMemoryToSQLite,
  benchmarkRepositories,
} from './sqlite.js';

export type {
  IAgentRepository,
  Agent,
  Plugin,
  Skill,
  QueryOptions,
  RegistryStats,
  RegistryCache,
  CapabilityIndex,
  CircuitBreakerState,
  Capability,
  FileOwnership,
  TraceContext,
} from '../types.js';
