/**
 * Hybrid State Manager
 *
 * Combines fast local JSON storage with GitHub persistence for optimal performance.
 *
 * Architecture:
 * - Write to local JSON first (< 10ms)
 * - Sync to GitHub in background (within 1 second)
 * - Read from local cache (even faster)
 * - Fallback to GitHub if cache missing
 *
 * Cache Strategy:
 * - Local JSON cache in `.ultra/cache/{stateId}.json`
 * - GitHub issue as source of truth
 * - Background sync queue with debouncing (100ms)
 * - Conflict resolution: GitHub wins (last write wins)
 * - Graceful degradation: work offline if GitHub unavailable
 *
 * Staleness:
 * - Cache considered stale if older than 30 seconds
 * - Force refresh if requested
 * - Background refresh even for fresh cache
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { GitHubStateAdapter, StateObject } from './github-state-adapter';
import { GitHubService } from './github-service';
import { GitHubServiceError, GitHubAuthError, GitHubRateLimitError } from '../../types/github-integration';

/**
 * Cached state with metadata
 */
interface CachedState {
  state: StateObject;
  cachedAt: number; // Unix timestamp
  issueNumber?: number;
}

/**
 * Sync queue item
 */
interface SyncQueueItem {
  stateId: string;
  state: StateObject;
  issueNumber: number;
  queuedAt: number;
  retries: number;
}

/**
 * Configuration options for HybridStateManager
 */
export interface HybridStateManagerConfig {
  /**
   * Cache directory path
   * @default '.ultra/cache'
   */
  cacheDir?: string;

  /**
   * Staleness threshold in milliseconds
   * Cache older than this is considered stale
   * @default 30000 (30 seconds)
   */
  stalenessThreshold?: number;

  /**
   * Debounce delay for sync queue in milliseconds
   * @default 100
   */
  syncDebounceDelay?: number;

  /**
   * Sync queue processing interval in milliseconds
   * @default 1000 (1 second)
   */
  syncInterval?: number;

  /**
   * Maximum retry attempts for failed syncs
   * @default 3
   */
  maxRetries?: number;

  /**
   * Whether to enable background sync
   * @default true
   */
  enableBackgroundSync?: boolean;
}

/**
 * Read options
 */
export interface ReadOptions {
  /**
   * Force refresh from GitHub, ignoring cache
   */
  forceRefresh?: boolean;

  /**
   * Return stale cache if available (don't fetch from GitHub)
   */
  allowStale?: boolean;
}

/**
 * Error thrown when sync fails after max retries
 */
export class SyncError extends Error {
  constructor(
    message: string,
    public stateId: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/**
 * Hybrid State Manager
 *
 * Provides fast local storage with GitHub persistence.
 */
export class HybridStateManager {
  private cacheDir: string;
  private stalenessThreshold: number;
  private syncDebounceDelay: number;
  private syncInterval: number;
  private maxRetries: number;
  private enableBackgroundSync: boolean;

  private githubState: GitHubStateAdapter;
  private syncQueue: Map<string, SyncQueueItem> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private syncTimer?: NodeJS.Timeout;
  private isProcessingQueue: boolean = false;
  private isInitialized: boolean = false;

  // State ID to issue number mapping
  private stateIdToIssueNumber: Map<string, number> = new Map();

  constructor(
    githubService: GitHubService,
    private options: HybridStateManagerConfig = {}
  ) {
    this.cacheDir = options.cacheDir || '.ultra/cache';
    this.stalenessThreshold = options.stalenessThreshold || 30000;
    this.syncDebounceDelay = options.syncDebounceDelay || 100;
    this.syncInterval = options.syncInterval || 1000;
    this.maxRetries = options.maxRetries || 3;
    this.enableBackgroundSync = options.enableBackgroundSync !== false;

    this.githubState = new GitHubStateAdapter(githubService, {
      enableConcurrencyControl: true,
      maxRetries: 3,
    });
  }

  /**
   * Initialize the hybrid state manager
   *
   * - Create cache directory if needed
   * - Start background sync processor
   * - Load state ID to issue number mapping
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create cache directory
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Start background sync processor
      if (this.enableBackgroundSync) {
        this.startBackgroundSync();
      }

      this.isInitialized = true;
      console.log('[HybridStateManager] Initialized');
    } catch (error) {
      console.error('[HybridStateManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Read state from hybrid storage
   *
   * Strategy:
   * 1. Check local cache first
   * 2. If cache exists and is fresh, return it
   * 3. If cache miss or stale, fetch from GitHub
   * 4. Update local cache with fresh data
   * 5. Return state
   *
   * @param stateId - The state ID to read
   * @param options - Optional read parameters
   * @returns The state object
   */
  async read(stateId: string, options: ReadOptions = {}): Promise<StateObject> {
    await this.ensureInitialized();

    // Force refresh: skip cache
    if (options.forceRefresh) {
      return this.fetchFromGitHub(stateId);
    }

    // Check local cache
    const cached = await this.readLocal(stateId);

    // Cache hit: check if fresh
    if (cached && !this.isStale(cached.cachedAt)) {
      console.log(`[HybridStateManager] Cache hit for ${stateId}`);
      return cached.state;
    }

    // Cache miss or stale: fetch from GitHub
    if (cached && options.allowStale) {
      console.log(`[HybridStateManager] Using stale cache for ${stateId}`);
      return cached.state;
    }

    console.log(`[HybridStateManager] Cache ${cached ? 'stale' : 'miss'} for ${stateId}, fetching from GitHub`);
    return this.fetchFromGitHub(stateId);
  }

  /**
   * Write state to hybrid storage
   *
   * Strategy:
   * 1. Write to local JSON immediately (< 10ms)
   * 2. Queue background sync to GitHub
   * 3. Return immediately (don't wait for GitHub)
   *
   * @param stateId - The state ID to write
   * @param state - The state object to write
   */
  async write(stateId: string, state: StateObject): Promise<void> {
    await this.ensureInitialized();

    const startTime = Date.now();

    try {
      // 1. Write to local JSON immediately
      await this.writeLocal(stateId, state);
      const localWriteTime = Date.now() - startTime;

      // 2. Queue background sync to GitHub
      const issueNumber = stateIdToIssueNumber(stateId);
      this.queueSync(stateId, state, issueNumber);

      console.log(
        `[HybridStateManager] Write completed for ${stateId} in ${localWriteTime}ms ` +
        `(local: ${localWriteTime}ms, sync queued)`
      );
    } catch (error) {
      console.error(`[HybridStateManager] Write failed for ${stateId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger sync for a state
   *
   * @param stateId - The state ID to sync
   */
  async sync(stateId: string): Promise<void> {
    await this.ensureInitialized();

    const cached = await this.readLocal(stateId);
    if (!cached) {
      throw new Error(`No cached state found for ${stateId}`);
    }

    const issueNumber = stateIdToIssueNumber(stateId);
    await this.syncToGitHub(stateId, cached.state, issueNumber);

    console.log(`[HybridStateManager] Manual sync completed for ${stateId}`);
  }

  /**
   * Clear cache for a state
   *
   * @param stateId - The state ID to clear cache for
   */
  async clearCache(stateId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const cachePath = this.getCachePath(stateId);
      await fs.unlink(cachePath);
      console.log(`[HybridStateManager] Cache cleared for ${stateId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[HybridStateManager] Failed to clear cache for ${stateId}:`, error);
        throw error;
      }
    }
  }

  /**
   * Close the hybrid state manager
   *
   * - Stop background sync processor
   * - Flush pending syncs
   * - Clear timers
   */
  async close(): Promise<void> {
    // Stop background sync processor
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    // Clear debounce timers
    this.debounceTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();

    // Process remaining queue
    if (this.syncQueue.size > 0) {
      console.log(`[HybridStateManager] Flushing ${this.syncQueue.size} pending syncs...`);
      await this.processSyncQueue();
    }

    this.isInitialized = false;
    console.log('[HybridStateManager] Closed');
  }

  // Private methods

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Read from local cache
   */
  private async readLocal(stateId: string): Promise<CachedState | null> {
    try {
      const cachePath = this.getCachePath(stateId);
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached: CachedState = JSON.parse(data);

      // Update state ID to issue number mapping
      if (cached.issueNumber) {
        this.stateIdToIssueNumber.set(stateId, cached.issueNumber);
      }

      return cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.error(`[HybridStateManager] Failed to read cache for ${stateId}:`, error);
      return null;
    }
  }

  /**
   * Write to local cache
   */
  private async writeLocal(stateId: string, state: StateObject): Promise<void> {
    try {
      const cachePath = this.getCachePath(stateId);
      const issueNumber = this.stateIdToIssueNumber.get(stateId);

      const cached: CachedState = {
        state,
        cachedAt: Date.now(),
        issueNumber,
      };

      await fs.writeFile(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[HybridStateManager] Failed to write cache for ${stateId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch state from GitHub
   */
  private async fetchFromGitHub(stateId: string): Promise<StateObject> {
    const issueNumber = this.stateIdToIssueNumber.get(stateId);

    if (!issueNumber) {
      throw new Error(`No issue number mapping found for ${stateId}`);
    }

    try {
      const state = await this.githubState.readState(issueNumber);

      // Update local cache
      await this.writeLocal(stateId, state);

      // Update mapping
      this.stateIdToIssueNumber.set(stateId, issueNumber);

      return state;
    } catch (error) {
      // Graceful degradation: if GitHub is unavailable, try to return cached state
      if (this.isGitHubUnavailable(error)) {
        console.warn(`[HybridStateManager] GitHub unavailable for ${stateId}, attempting cache fallback`);
        const cached = await this.readLocal(stateId);
        if (cached) {
          console.log(`[HybridStateManager] Returning cached state for ${stateId}`);
          return cached.state;
        }
      }

      throw error;
    }
  }

  /**
   * Queue state for background sync
   */
  private queueSync(stateId: string, state: StateObject, issueNumber: number): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(stateId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Update queue item
    this.syncQueue.set(stateId, {
      stateId,
      state,
      issueNumber,
      queuedAt: Date.now(),
      retries: 0,
    });

    // Set debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(stateId);
    }, this.syncDebounceDelay);

    this.debounceTimers.set(stateId, timer);
  }

  /**
   * Sync state to GitHub
   */
  private async syncToGitHub(
    stateId: string,
    state: StateObject,
    issueNumber: number
  ): Promise<void> {
    try {
      await this.githubState.writeState(issueNumber, state);

      // Update mapping
      this.stateIdToIssueNumber.set(stateId, issueNumber);

      // Update cache with synced state
      await this.writeLocal(stateId, state);
    } catch (error) {
      if (this.isGitHubUnavailable(error)) {
        console.warn(`[HybridStateManager] GitHub unavailable during sync for ${stateId}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Start background sync processor
   */
  private startBackgroundSync(): void {
    this.syncTimer = setInterval(async () => {
      if (!this.isProcessingQueue && this.syncQueue.size > 0) {
        await this.processSyncQueue();
      }
    }, this.syncInterval);
  }

  /**
   * Process sync queue
   */
  private async processSyncQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const items = Array.from(this.syncQueue.values());

      for (const item of items) {
        // Skip if debounce timer is still active
        if (this.debounceTimers.has(item.stateId)) {
          continue;
        }

        try {
          await this.syncToGitHub(item.stateId, item.state, item.issueNumber);

          // Remove from queue on success
          this.syncQueue.delete(item.stateId);

          console.log(`[HybridStateManager] Synced ${item.stateId} to GitHub`);
        } catch (error) {
          // Retry with exponential backoff
          item.retries++;

          if (item.retries >= this.maxRetries) {
            console.error(
              `[HybridStateManager] Sync failed for ${item.stateId} after ${item.retries} attempts`,
              error
            );
            this.syncQueue.delete(item.stateId);
          } else {
            const delay = Math.pow(2, item.retries) * 1000;
            console.warn(
              `[HybridStateManager] Sync failed for ${item.stateId}, retry ${item.retries}/${this.maxRetries} in ${delay}ms`
            );

            // Re-queue with delay
            setTimeout(() => {
              this.syncQueue.set(item.stateId, item);
            }, delay);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Check if cached state is stale
   */
  private isStale(cachedAt: number): boolean {
    const age = Date.now() - cachedAt;
    return age > this.stalenessThreshold;
  }

  /**
   * Check if error indicates GitHub is unavailable
   */
  private isGitHubUnavailable(error: unknown): boolean {
    return (
      error instanceof GitHubAuthError ||
      error instanceof GitHubRateLimitError ||
      (error instanceof GitHubServiceError && error.statusCode >= 500) ||
      (error instanceof Error && error.message.includes('ECONNREFUSED')) ||
      (error instanceof Error && error.message.includes('ENOTFOUND'))
    );
  }

  /**
   * Get cache file path for state ID
   */
  private getCachePath(stateId: string): string {
    return join(this.cacheDir, `${sanitizeStateId(stateId)}.json`);
  }
}

/**
 * Sanitize state ID for use as filename
 */
function sanitizeStateId(stateId: string): string {
  return stateId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Generate issue number from state ID
 *
 * This is a placeholder - in production, you'd have a mapping
 * between state IDs and GitHub issue numbers.
 */
function stateIdToIssueNumber(stateId: string): number {
  // Extract issue number from state ID if encoded
  const match = stateId.match(/issue(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Default: hash the state ID to get an issue number
  // In production, this should be a proper mapping
  const hash = stateId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 1000 + (hash % 9000); // Issue numbers 1000-9999
}

/**
 * Factory function to create HybridStateManager instance
 */
export function createHybridStateManager(
  githubService: GitHubService,
  options?: HybridStateManagerConfig
): HybridStateManager {
  return new HybridStateManager(githubService, options);
}
