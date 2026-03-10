/**
 * wshobson Agent Integration - Advanced Caching System
 *
 * Implements LRU cache with background refresh, cache warming, and
 * intelligent invalidation strategies. Part of Phase 5: Robustness & Performance.
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { RegistryCache, Agent, Plugin } from './types';
import { getMonitor } from './monitor';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  size: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  totalSize: number;
}

/**
 * Cache invalidation strategy
 */
export type InvalidationStrategy = 'time' | 'hash' | 'manual' | 'watcher';

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Maximum number of entries */
  maxEntries?: number;
  /** TTL for entries in milliseconds */
  ttl?: number;
  /** Enable background refresh */
  backgroundRefresh?: boolean;
  /** Background refresh interval in milliseconds */
  refreshInterval?: number;
  /** Enable cache warming on startup */
  warmOnStartup?: boolean;
  /** Invalidation strategy */
  invalidationStrategy?: InvalidationStrategy;
  /** Cache file path */
  cachePath?: string;
}

/**
 * LRU Cache implementation
 */
export class LRUCache<T> extends EventEmitter {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    hitRate: 0,
    totalSize: 0,
  };
  private config: Required<CacheConfig>;
  private monitor = getMonitor();
  private refreshInterval?: NodeJS.Timeout;
  private currentSize = 0;

  constructor(config: CacheConfig = {}) {
    super();

    this.config = {
      maxSize: config.maxSize ?? 50 * 1024 * 1024, // 50MB
      maxEntries: config.maxEntries ?? 1000,
      ttl: config.ttl ?? 3600000, // 1 hour
      backgroundRefresh: config.backgroundRefresh ?? true,
      refreshInterval: config.refreshInterval ?? 300000, // 5 minutes
      warmOnStartup: config.warmOnStartup ?? true,
      invalidationStrategy: config.invalidationStrategy ?? 'time',
      cachePath: config.cachePath ?? '.ultra/wshobson-cache.json',
    };

    // Start background refresh
    if (this.config.backgroundRefresh) {
      this.startBackgroundRefresh();
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      this.monitor.recordCacheOperation('miss', { key });
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      this.monitor.recordCacheOperation('miss', { key, reason: 'expired' });
      return undefined;
    }

    // Update access info for LRU
    entry.accessCount++;
    entry.lastAccess = Date.now();

    this.stats.hits++;
    this.updateHitRate();
    this.monitor.recordCacheOperation('hit', { key });

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, size?: number): void {
    const estimatedSize = size ?? this.estimateSize(value);

    // Check if we need to evict entries
    this.ensureSpace(estimatedSize);

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
      size: estimatedSize,
    };

    // If key exists, remove old size first
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
    }

    this.cache.set(key, entry);
    this.currentSize += estimatedSize;
    this.updateStats();
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.currentSize -= entry.size;
    this.cache.delete(key);
    this.updateStats();

    this.emit('invalidate', key);
    return true;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.updateStats();
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats, totalSize: this.currentSize };
  }

  /**
   * Invalidate entries by strategy
   */
  invalidate(key: string, strategy?: InvalidationStrategy): void {
    const actualStrategy = strategy ?? this.config.invalidationStrategy;

    switch (actualStrategy) {
      case 'time':
        // Immediate invalidation
        this.delete(key);
        break;

      case 'hash':
        // Hash-based invalidation would be handled by validation logic
        this.delete(key);
        break;

      case 'manual':
        // Explicit manual invalidation
        this.delete(key);
        break;

      case 'watcher':
        // File watcher triggered invalidation
        this.delete(key);
        this.monitor.recordCacheOperation('eviction', { key, reason: 'file-changed' });
        break;
    }
  }

  /**
   * Warm cache with data
   */
  async warm(data: Map<string, T>): Promise<void> {
    for (const [key, value] of data.entries()) {
      this.set(key, value);
    }

    this.emit('warmed', this.cache.size);
    this.monitor.log({
      level: 'info',
      message: `Cache warmed with ${data.size} entries`,
      metadata: { size: this.currentSize },
    });
  }

  /**
   * Ensure space for new entry
   */
  private ensureSpace(requiredSize: number): void {
    // Check max entries
    while (this.cache.size >= this.config.maxEntries && this.cache.size > 0) {
      this.evictLRU();
    }

    // Check max size
    while (
      this.currentSize + requiredSize > this.config.maxSize &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.cache.get(lruKey)!;
      this.currentSize -= entry.size;
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.monitor.recordCacheOperation('eviction', {
        key: lruKey,
        reason: 'lru',
      });
    }

    this.updateStats();
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.totalSize = this.currentSize;
    this.updateHitRate();
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Estimate size of value
   */
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate (2 bytes per char)
    } catch {
      return 1024; // Default 1KB
    }
  }

  /**
   * Start background refresh
   */
  private startBackgroundRefresh(): void {
    this.refreshInterval = setInterval(async () => {
      await this.refreshStaleEntries();
    }, this.config.refreshInterval);
  }

  /**
   * Refresh stale entries in background
   */
  private async refreshStaleEntries(): Promise<void> {
    const now = Date.now();
    const staleThreshold = this.config.ttl * 0.8; // Refresh at 80% of TTL
    let refreshed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > staleThreshold) {
        // Emit refresh event - caller should handle actual refresh
        this.emit('refresh', key, entry.value);
        refreshed++;
      }
    }

    if (refreshed > 0) {
      this.monitor.log({
        level: 'debug',
        message: `Background refresh triggered for ${refreshed} entries`,
        metadata: { refreshed },
      });
    }
  }

  /**
   * Stop background refresh
   */
  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopBackgroundRefresh();
    this.clear();
    this.removeAllListeners();
  }
}

/**
 * Registry cache with persistence
 */
export class RegistryCacheManager {
  private cache: LRUCache<any>;
  private config: Required<CacheConfig>;
  private monitor = getMonitor();

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 50 * 1024 * 1024,
      maxEntries: config.maxEntries ?? 1000,
      ttl: config.ttl ?? 3600000,
      backgroundRefresh: config.backgroundRefresh ?? true,
      refreshInterval: config.refreshInterval ?? 300000,
      warmOnStartup: config.warmOnStartup ?? true,
      invalidationStrategy: config.invalidationStrategy ?? 'time',
      cachePath: config.cachePath ?? '.ultra/wshobson-cache.json',
    };

    this.cache = new LRUCache(this.config);
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<RegistryCache | null> {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(this.config.cachePath, 'utf-8');
      const cached = JSON.parse(data);

      // Validate cache version/hash
      if (!this.validateCache(cached)) {
        this.monitor.log({
          level: 'warn',
          message: 'Cache validation failed, will rebuild',
          metadata: { reason: 'validation-failed' },
        });
        return null;
      }

      // Warm cache with loaded data
      const cacheMap = new Map<string, any>();
      cacheMap.set('plugins', cached.plugins);
      cacheMap.set('agents', cached.agents);
      cacheMap.set('capabilities', cached.capabilities);
      cacheMap.set('circuitBreaker', cached.circuitBreaker);

      await this.cache.warm(cacheMap);

      this.monitor.log({
        level: 'info',
        message: 'Cache loaded from disk',
        metadata: {
          pluginCount: cached.metadata.pluginCount,
          agentCount: cached.metadata.agentCount,
        },
      });

      return cached;
    } catch (error) {
      this.monitor.log({
        level: 'warn',
        message: 'Failed to load cache from disk',
        metadata: { error: (error as Error).message },
      });
      return null;
    }
  }

  /**
   * Save cache to disk
   */
  async save(cache: RegistryCache): Promise<void> {
    try {
      const fs = require('fs').promises;
      const data = JSON.stringify(cache, null, 2);
      await fs.writeFile(this.config.cachePath, data, 'utf-8');

      this.monitor.log({
        level: 'info',
        message: 'Cache saved to disk',
        metadata: {
          pluginCount: cache.metadata.pluginCount,
          agentCount: cache.metadata.agentCount,
        },
      });
    } catch (error) {
      this.monitor.log({
        level: 'error',
        message: 'Failed to save cache to disk',
        metadata: { error: (error as Error).message },
      });
    }
  }

  /**
   * Get cached value
   */
  get(key: string): any {
    return this.cache.get(key);
  }

  /**
   * Set cached value
   */
  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    this.cache.invalidate(key, this.config.invalidationStrategy);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Validate cache integrity
   */
  private validateCache(cache: any): boolean {
    // Check required fields
    if (!cache.plugins || !cache.agents || !cache.metadata) {
      return false;
    }

    // Check version/hash if available
    if (cache.metadata.version) {
      const currentHash = this.generateVersionHash();
      if (cache.metadata.version !== currentHash) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate version hash for cache validation
   */
  private generateVersionHash(): string {
    // Simple hash based on timestamp and config
    const data = `${this.config.maxSize}-${this.config.maxEntries}-${this.config.ttl}`;
    return createHash('md5').update(data).digest('hex');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.cache.destroy();
  }
}

/**
 * Singleton cache manager instance
 */
let cacheManagerInstance: RegistryCacheManager | null = null;

/**
 * Get or create the cache manager singleton
 */
export function getCacheManager(config?: CacheConfig): RegistryCacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new RegistryCacheManager(config);
  }
  return cacheManagerInstance;
}

/**
 * Reset the cache manager singleton (for testing)
 */
export function resetCacheManager(): void {
  if (cacheManagerInstance) {
    cacheManagerInstance.destroy();
    cacheManagerInstance = null;
  }
}
