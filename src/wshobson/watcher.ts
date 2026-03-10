/**
 * wshobson Agent Integration - File Watcher System
 *
 * Implements cross-platform file watching using chokidar for cache invalidation
 * and hot-reloading. Part of Phase 5: Robustness & Performance.
 */

import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { getMonitor } from './monitor';
import { getCacheManager } from './cache';

/**
 * File change event
 */
export interface FileChangeEvent {
  path: string;
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  timestamp: number;
}

/**
 * Watcher configuration
 */
export interface WatcherConfig {
  /** Paths to watch */
  paths: string[];
  /** Debounce delay in ms (to avoid duplicate events) */
  debounceDelay?: number;
  /** Ignore patterns */
  ignored?: string | RegExp | (string | RegExp)[];
  /** Enable watching */
  enabled?: boolean;
  /** Invalidation delay in ms (time to wait before invalidating cache) */
  invalidationDelay?: number;
  /** Maximum invalidation delay */
  maxInvalidationDelay?: number;
}

/**
 * File watcher for agent files
 */
export class FileWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private config: Required<WatcherConfig>;
  private monitor = getMonitor();
  private cacheManager = getCacheManager();
  private pendingInvalidations = new Map<string, NodeJS.Timeout>();
  private fileChangeHistory = new Map<string, number>();

  constructor(config: WatcherConfig) {
    super();

    this.config = {
      paths: config.paths,
      debounceDelay: config.debounceDelay ?? 1000, // 1 second
      ignored: config.ignored ?? /[\/\\]\.|node_modules/,
      enabled: config.enabled ?? true,
      invalidationDelay: config.invalidationDelay ?? 60000, // 60 seconds
      maxInvalidationDelay: config.maxInvalidationDelay ?? 300000, // 5 minutes
    };

    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * Start watching files
   */
  start(): void {
    if (this.watcher) {
      this.monitor.log({
        level: 'warn',
        message: 'File watcher already running',
      });
      return;
    }

    this.monitor.log({
      level: 'info',
      message: 'Starting file watcher',
      metadata: { paths: this.config.paths },
    });

    this.watcher = chokidar.watch(this.config.paths, {
      ignored: this.config.ignored,
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on('add', (path) => this.handleFileChange(path, 'add'))
      .on('change', (path) => this.handleFileChange(path, 'change'))
      .on('unlink', (path) => this.handleFileChange(path, 'unlink'))
      .on('addDir', (path) => this.handleFileChange(path, 'addDir'))
      .on('unlinkDir', (path) => this.handleFileChange(path, 'unlinkDir'))
      .on('error', (error) => this.handleError(error))
      .on('ready', () => this.handleReady());

    this.emit('started');
  }

  /**
   * Stop watching files
   */
  stop(): void {
    if (this.watcher) {
      this.monitor.log({
        level: 'info',
        message: 'Stopping file watcher',
      });

      // Clear all pending invalidations
      for (const timeout of this.pendingInvalidations.values()) {
        clearTimeout(timeout);
      }
      this.pendingInvalidations.clear();

      this.watcher.close();
      this.watcher = undefined;

      this.emit('stopped');
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(path: string, type: FileChangeEvent['type']): void {
    const event: FileChangeEvent = {
      path,
      type,
      timestamp: Date.now(),
    };

    // Check if this is a recent change (debounce)
    const lastChange = this.fileChangeHistory.get(path);
    if (lastChange && event.timestamp - lastChange < this.config.debounceDelay) {
      return;
    }

    this.fileChangeHistory.set(path, event.timestamp);

    this.monitor.log({
      level: 'debug',
      message: `File ${type}: ${path}`,
      metadata: { type, path },
    });

    this.emit('change', event);

    // Schedule cache invalidation
    this.scheduleInvalidation(path);
  }

  /**
   * Schedule cache invalidation with delay
   */
  private scheduleInvalidation(path: string): void {
    // Clear existing timeout if any
    const existingTimeout = this.pendingInvalidations.get(path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Calculate delay based on file type and history
    const delay = this.calculateInvalidationDelay(path);

    const timeout = setTimeout(() => {
      this.invalidateCacheForPath(path);
      this.pendingInvalidations.delete(path);
      this.fileChangeHistory.delete(path);
    }, delay);

    this.pendingInvalidations.set(path, timeout);

    this.monitor.log({
      level: 'debug',
      message: `Scheduled cache invalidation for ${path}`,
      metadata: { delay, path },
    });
  }

  /**
   * Calculate invalidation delay based on file type and history
   */
  private calculateInvalidationDelay(path: string): number {
    // Agent files get shorter delay
    if (path.includes('/agents/') || path.includes('\\agents\\')) {
      return this.config.invalidationDelay;
    }

    // Plugin files get longer delay
    if (path.includes('/plugins/') || path.includes('\\plugins\\')) {
      return this.config.maxInvalidationDelay;
    }

    // Default delay
    return this.config.invalidationDelay;
  }

  /**
   * Invalidate cache for specific path
   */
  private invalidateCacheForPath(path: string): void {
    this.monitor.log({
      level: 'info',
      message: `Invalidating cache for ${path}`,
      metadata: { path },
    });

    // Extract agent or plugin name from path
    const agentMatch = path.match(/(?:\/|\\)agents(?:\/|\\)(.+?)\.md$/);
    const pluginMatch = path.match(/(?:\/|\\)plugins(?:\/|\\)(.+?)(?:\/|\\)/);

    if (agentMatch) {
      const agentName = agentMatch[1];
      this.cacheManager.invalidate(`agent:${agentName}`);
      this.emit('invalidate', { type: 'agent', name: agentName, path });
    } else if (pluginMatch) {
      const pluginName = pluginMatch[1];
      this.cacheManager.invalidate(`plugin:${pluginName}`);
      this.emit('invalidate', { type: 'plugin', name: pluginName, path });
    } else {
      // Generic path-based invalidation
      this.cacheManager.invalidate(path);
      this.emit('invalidate', { type: 'path', path });
    }
  }

  /**
   * Handle watcher error
   */
  private handleError(error: Error): void {
    this.monitor.log({
      level: 'error',
      message: 'File watcher error',
      metadata: { error: error.message },
    });

    this.emit('error', error);
  }

  /**
   * Handle watcher ready event
   */
  private handleReady(): void {
    this.monitor.log({
      level: 'info',
      message: 'File watcher ready',
      metadata: { paths: this.config.paths },
    });

    this.emit('ready');
  }

  /**
   * Get watched paths
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return [];
    }

    return Object.keys(this.watcher.getWatched());
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.watcher !== undefined;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.fileChangeHistory.clear();
  }
}

/**
 * Singleton file watcher instance
 */
let fileWatcherInstance: FileWatcher | null = null;

/**
 * Get or create the file watcher singleton
 */
export function getFileWatcher(config?: WatcherConfig): FileWatcher {
  if (!fileWatcherInstance) {
    if (!config) {
      throw new Error('FileWatcher config required on first call');
    }
    fileWatcherInstance = new FileWatcher(config);
  }
  return fileWatcherInstance;
}

/**
 * Reset the file watcher singleton (for testing)
 */
export function resetFileWatcher(): void {
  if (fileWatcherInstance) {
    fileWatcherInstance.destroy();
    fileWatcherInstance = null;
  }
}

/**
 * Create file watcher for agent plugins
 */
export function createAgentWatcher(pluginsPath: string): FileWatcher {
  const agentPaths = [
    `${pluginsPath}/*/agents/*.md`,
    `${pluginsPath}/*/*.md`,
  ];

  return new FileWatcher({
    paths: agentPaths,
    ignored: /[\/\\]\.|node_modules/,
    debounceDelay: 1000,
    invalidationDelay: 60000,
  });
}
