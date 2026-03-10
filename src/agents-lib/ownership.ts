/**
 * File Ownership Registry
 *
 * Implements the wshobson pattern for preventing concurrent edits to the same file.
 * This is critical for parallel agent execution - each agent claims exclusive ownership
 * of files it will modify, preventing merge conflicts and data races.
 *
 * Key features:
 * - Exclusive file ownership per agent
 * - Conflict detection before ownership transfer
 * - Automatic timeout-based cleanup
 * - Persistent state storage
 * - Thread-safe operations with mutex
 *
 * @example
 * ```typescript
 * const registry = new FileOwnershipRegistry('/tmp/ownership-state.json');
 *
 * // Agent 1 claims files
 * await registry.claimOwnership('agent-1', [
 *   '/project/src/auth.ts',
 *   '/project/src/auth/types.ts'
 * ]);
 *
 * // Agent 2 tries to claim same file (fails)
 * const violations = await registry.validateOwnership('agent-2', [
 *   '/project/src/auth.ts'
 * ]);
 * // violations = [{ filePath: '/project/src/auth.ts', currentOwner: 'agent-1' }]
 *
 * // Agent 1 releases ownership
 * await registry.releaseOwnership('agent-1', [
 *   '/project/src/auth.ts'
 * ]);
 *
 * // Now agent 2 can claim it
 * await registry.claimOwnership('agent-2', ['/project/src/auth.ts']);
 * ```
 */

import { Mutex } from './mutex.js';
import { writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * Ownership violation details
 */
export interface OwnershipViolation {
  /**
   * File path that violates ownership rules
   */
  filePath: string;

  /**
   * Agent ID that currently owns the file
   */
  currentOwner: string;

  /**
   * When the ownership was claimed
   */
  claimedAt: number;

  /**
   * Whether the ownership has timed out
   */
  isTimedOut: boolean;
}

/**
 * Ownership record for persistence
 */
interface OwnershipRecord {
  agentId: string;
  claimedAt: number;
  lastAccessed: number;
}

/**
 * Ownership state structure
 */
interface OwnershipState {
  version: string;
  lastUpdated: number;
  ownership: Record<string, OwnershipRecord>;  // filePath -> record
}

/**
 * File Ownership Registry Options
 */
export interface OwnershipRegistryOptions {
  /**
   * Ownership timeout in milliseconds
   * Default: 300000 (5 minutes)
   */
  ownershipTimeout?: number;

  /**
   * Whether to automatically cleanup timed-out ownerships
   * Default: true
   */
  autoCleanup?: boolean;

  /**
   * Interval for automatic cleanup in milliseconds
   * Default: 60000 (1 minute)
   */
  cleanupInterval?: number;

  /**
   * Whether to persist state to disk
   * Default: true
   */
  persistState?: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: OwnershipRegistryOptions = {
  ownershipTimeout: 300000,  // 5 minutes
  autoCleanup: true,
  cleanupInterval: 60000,     // 1 minute
  persistState: true,
};

/**
 * File Ownership Registry
 *
 * Manages exclusive file ownership for parallel agent execution.
 * Prevents concurrent edits and merge conflicts.
 */
export class FileOwnershipRegistry {
  private statePath: string;
  private options: OwnershipRegistryOptions;
  private mutex: Mutex;
  private state: OwnershipState;
  private cleanupTimer?: NodeJS.Timeout;

  /**
   * Create a new ownership registry
   *
   * @param statePath - Path to persist ownership state (JSON file)
   * @param options - Configuration options
   */
  constructor(statePath: string, options: OwnershipRegistryOptions = {}) {
    this.statePath = statePath;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.mutex = new Mutex();
    this.state = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      ownership: {},
    };

    // Start automatic cleanup if enabled
    if (this.options.autoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Initialize the registry and load existing state
   *
   * @returns Promise that resolves when initialized
   */
  async initialize(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.options.persistState && existsSync(this.statePath)) {
        await this.loadState();
      }
    });
  }

  /**
   * Claim ownership of files for an agent
   *
   * This will fail if any file is already owned by another agent.
   * Ownership is exclusive - only one agent can own a file at a time.
   *
   * @param agentId - Agent claiming ownership
   * @param filePaths - Array of file paths to claim
   * @throws Error if any file is already owned
   *
   * @example
   * ```typescript
   * await registry.claimOwnership('agent-1', [
   *   '/project/src/auth.ts',
   *   '/project/src/auth/types.ts'
   * ]);
   * ```
   */
  async claimOwnership(agentId: string, filePaths: string[]): Promise<void> {
    await this.mutex.runExclusive(async () => {
      // Normalize file paths
      const normalizedPaths = filePaths.map(p => this.normalizePath(p));

      // Check for conflicts with existing ownership
      const conflicts: Array<{ path: string; owner: string }> = [];
      for (const path of normalizedPaths) {
        const existing = this.state.ownership[path];
        if (existing && existing.agentId !== agentId) {
          // Check if existing ownership has timed out
          if (!this.isTimedOut(existing)) {
            conflicts.push({ path, owner: existing.agentId });
          } else {
            // Clean up timed-out ownership
            delete this.state.ownership[path];
          }
        }
      }

      // If there are conflicts, throw error
      if (conflicts.length > 0) {
        const conflictList = conflicts
          .map(c => `'${c.path}' (owned by ${c.owner})`)
          .join(', ');
        throw new Error(
          `Cannot claim ownership - files already owned: ${conflictList}`
        );
      }

      // Claim ownership
      const now = Date.now();
      for (const path of normalizedPaths) {
        this.state.ownership[path] = {
          agentId,
          claimedAt: now,
          lastAccessed: now,
        };
      }

      // Update state timestamp
      this.state.lastUpdated = now;

      // Persist if enabled
      if (this.options.persistState) {
        await this.saveState();
      }
    });
  }

  /**
   * Check who owns a file
   *
   * @param filePath - File path to check
   * @returns Agent ID that owns the file, or null if unowned
   *
   * @example
   * ```typescript
   * const owner = await registry.checkOwnership('/project/src/auth.ts');
   * if (owner) {
   *   console.log(`File owned by: ${owner}`);
   * } else {
   *   console.log('File is unowned');
   * }
   * ```
   */
  async checkOwnership(filePath: string): Promise<string | null> {
    return await this.mutex.runExclusive(async () => {
      const normalizedPath = this.normalizePath(filePath);
      const record = this.state.ownership[normalizedPath];

      if (!record) {
        return null;
      }

      // Check if ownership has timed out
      if (this.isTimedOut(record)) {
        delete this.state.ownership[normalizedPath];
        if (this.options.persistState) {
          await this.saveState();
        }
        return null;
      }

      // Update last accessed time
      record.lastAccessed = Date.now();
      return record.agentId;
    });
  }

  /**
   * Release ownership of files
   *
   * @param agentId - Agent releasing ownership
   * @param filePaths - Array of file paths to release
   *
   * @example
   * ```typescript
   * await registry.releaseOwnership('agent-1', [
   *   '/project/src/auth.ts',
   *   '/project/src/auth/types.ts'
   * ]);
   * ```
   */
  async releaseOwnership(agentId: string, filePaths: string[]): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const normalizedPaths = filePaths.map(p => this.normalizePath(p));
      let modified = false;

      for (const path of normalizedPaths) {
        const record = this.state.ownership[path];
        if (record && record.agentId === agentId) {
          delete this.state.ownership[path];
          modified = true;
        }
      }

      // Persist if modified
      if (modified && this.options.persistState) {
        this.state.lastUpdated = Date.now();
        await this.saveState();
      }
    });
  }

  /**
   * Validate ownership for a set of files
   *
   * Checks if the agent can claim ownership of the given files.
   * Returns a list of violations (files owned by other agents).
   *
   * @param agentId - Agent to validate ownership for
   * @param filePaths - Array of file paths to validate
   * @returns Array of ownership violations
   *
   * @example
   * ```typescript
   * const violations = await registry.validateOwnership('agent-2', [
   *   '/project/src/auth.ts',
   *   '/project/src/user.ts'
   * ]);
   *
   * if (violations.length > 0) {
   *   console.log('Cannot claim files:');
   *   violations.forEach(v => {
   *     console.log(`  ${v.filePath} owned by ${v.currentOwner}`);
   *   });
   * }
   * ```
   */
  async validateOwnership(
    agentId: string,
    filePaths: string[]
  ): Promise<OwnershipViolation[]> {
    return await this.mutex.runExclusive(async () => {
      const violations: OwnershipViolation[] = [];
      const normalizedPaths = filePaths.map(p => this.normalizePath(p));

      for (const path of normalizedPaths) {
        const record = this.state.ownership[path];

        if (record && record.agentId !== agentId) {
          // Check if ownership has timed out
          const timedOut = this.isTimedOut(record);
          if (!timedOut) {
            violations.push({
              filePath: path,
              currentOwner: record.agentId,
              claimedAt: record.claimedAt,
              isTimedOut: false,
            });
          } else {
            // Clean up timed-out ownership
            delete this.state.ownership[path];
          }
        }
      }

      // Persist if we cleaned up timed-out ownerships
      if (violations.length < filePaths.length && this.options.persistState) {
        await this.saveState();
      }

      return violations;
    });
  }

  /**
   * Get all files owned by an agent
   *
   * @param agentId - Agent ID to query
   * @returns Set of file paths owned by the agent
   *
   * @example
   * ```typescript
   * const files = await registry.getOwnership('agent-1');
   * console.log(`Agent owns ${files.size} files`);
   * files.forEach(file => console.log(`  ${file}`));
   * ```
   */
  async getOwnership(agentId: string): Promise<Set<string>> {
    return await this.mutex.runExclusive(async () => {
      const ownedFiles = new Set<string>();

      for (const [path, record] of Object.entries(this.state.ownership)) {
        if (record.agentId === agentId) {
          // Check if ownership has timed out
          if (this.isTimedOut(record)) {
            delete this.state.ownership[path];
          } else {
            ownedFiles.add(path);
          }
        }
      }

      // Persist if we cleaned up timed-out ownerships
      if (ownedFiles.size < Object.keys(this.state.ownership).length && this.options.persistState) {
        await this.saveState();
      }

      return ownedFiles;
    });
  }

  /**
   * Clear all ownership records
   *
   * Useful for testing or resetting state.
   *
   * @example
   * ```typescript
   * await registry.clearAll();
   * console.log('All ownership cleared');
   * ```
   */
  async clearAll(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.state.ownership = {};
      this.state.lastUpdated = Date.now();

      if (this.options.persistState) {
        await this.saveState();
      }
    });
  }

  /**
   * Get ownership statistics
   *
   * @returns Statistics about current ownership state
   *
   * @example
   * ```typescript
   * const stats = await registry.getStats();
   * console.log(`Total owned files: ${stats.totalFiles}`);
   * console.log(`Active agents: ${stats.activeAgents}`);
   * ```
   */
  async getStats(): Promise<{
    totalFiles: number;
    activeAgents: number;
    agentsWithOwnership: Record<string, number>;
  }> {
    return await this.mutex.runExclusive(async () => {
      const agentsWithOwnership: Record<string, number> = {};

      for (const record of Object.values(this.state.ownership)) {
        if (!this.isTimedOut(record)) {
          agentsWithOwnership[record.agentId] =
            (agentsWithOwnership[record.agentId] || 0) + 1;
        }
      }

      return {
        totalFiles: Object.keys(this.state.ownership).length,
        activeAgents: Object.keys(agentsWithOwnership).length,
        agentsWithOwnership,
      };
    });
  }

  /**
   * Destroy the registry and cleanup resources
   *
   * Stops cleanup timer and optionally deletes state file.
   *
   * @param deleteStateFile - Whether to delete the state file (default: false)
   *
   * @example
   * ```typescript
   * await registry.destroy(true);
   * ```
   */
  async destroy(deleteStateFile: boolean = false): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Delete state file if requested
    if (deleteStateFile && existsSync(this.statePath)) {
      await unlink(this.statePath);
    }
  }

  /**
   * Load state from disk
   */
  private async loadState(): Promise<void> {
    try {
      const data = await readFile(this.statePath, 'utf-8');
      const loaded = JSON.parse(data) as OwnershipState;

      // Validate state structure
      if (loaded.version && loaded.ownership) {
        this.state = loaded;
      } else {
        throw new Error('Invalid state file format');
      }
    } catch (error) {
      console.warn(`Failed to load ownership state: ${error}`);
      // Start with fresh state
      this.state = {
        version: '1.0.0',
        lastUpdated: Date.now(),
        ownership: {},
      };
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    try {
      const data = JSON.stringify(this.state, null, 2);
      await writeFile(this.statePath, data, 'utf-8');
    } catch (error) {
      console.error(`Failed to save ownership state: ${error}`);
    }
  }

  /**
   * Check if ownership has timed out
   */
  private isTimedOut(record: OwnershipRecord): boolean {
    const timeout = this.options.ownershipTimeout || DEFAULT_OPTIONS.ownershipTimeout!;
    const elapsed = Date.now() - record.lastAccessed;
    return elapsed > timeout;
  }

  /**
   * Normalize file path for consistent comparison
   */
  private normalizePath(path: string): string {
    // Convert to absolute path if relative
    if (!path.startsWith('/')) {
      path = `/tmp/${path}`;
    }

    // Remove redundant slashes
    path = path.replace(/\/+/g, '/');

    // Remove trailing slash (except root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    return path;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    const interval = this.options.cleanupInterval || DEFAULT_OPTIONS.cleanupInterval!;

    this.cleanupTimer = setInterval(async () => {
      await this.cleanupTimedOut();
    }, interval);
  }

  /**
   * Cleanup timed-out ownerships
   */
  private async cleanupTimedOut(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      let modified = false;
      const now = Date.now();
      const timeout = this.options.ownershipTimeout || DEFAULT_OPTIONS.ownershipTimeout!;

      for (const [path, record] of Object.entries(this.state.ownership)) {
        if (now - record.lastAccessed > timeout) {
          delete this.state.ownership[path];
          modified = true;
        }
      }

      if (modified && this.options.persistState) {
        this.state.lastUpdated = now;
        await this.saveState();
      }
    });
  }
}

/**
 * Create a file ownership registry
 *
 * Factory function for creating a registry with default options.
 *
 * @param statePath - Path to persist ownership state
 * @param options - Configuration options
 * @returns Initialized registry instance
 *
 * @example
 * ```typescript
 * const registry = await createOwnershipRegistry('/tmp/ownership.json', {
 *   ownershipTimeout: 600000,  // 10 minutes
 *   autoCleanup: true
 * });
 * ```
 */
export async function createOwnershipRegistry(
  statePath: string,
  options?: OwnershipRegistryOptions
): Promise<FileOwnershipRegistry> {
  const registry = new FileOwnershipRegistry(statePath, options);
  await registry.initialize();
  return registry;
}
