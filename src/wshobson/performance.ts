/**
 * wshobson Agent Integration - Performance Optimizations
 *
 * Collection of performance optimization utilities and helpers.
 * Part of Phase 5: Robustness & Performance.
 */

/**
 * Lazy loading utility for deferred initialization
 */
export class Lazy<T> {
  private value?: T;
  private initialized = false;
  private factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (!this.initialized) {
      this.value = this.factory();
      this.initialized = true;
    }
    return this.value!;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.value = undefined;
    this.initialized = false;
  }
}

/**
 * Memoization cache for expensive function calls
 */
export class MemoCache<TKey, TValue> {
  private cache = new Map<TKey, TValue>();
  private maxAge: number;
  private timestamps = new Map<TKey, number>();

  constructor(maxAge: number = 60000) { // 1 minute default
    this.maxAge = maxAge;
  }

  get(key: TKey): TValue | undefined {
    const timestamp = this.timestamps.get(key);
    if (timestamp && Date.now() - timestamp > this.maxAge) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return undefined;
    }
    return this.cache.get(key);
  }

  set(key: TKey, value: TValue): void {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Debounce utility for limiting function call frequency
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle utility for limiting function execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Batch processing utility for grouping operations
 */
export class BatchProcessor<T> {
  private batch: T[] = [];
  private batchSize: number;
  private timeout: number;
  private timeoutId?: NodeJS.Timeout;
  private processor: (batch: T[]) => Promise<void>;

  constructor(
    batchSize: number,
    timeout: number,
    processor: (batch: T[]) => Promise<void>
  ) {
    this.batchSize = batchSize;
    this.timeout = timeout;
    this.processor = processor;
  }

  async add(item: T): Promise<void> {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(() => this.flush(), this.timeout);
  }

  async flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if (this.batch.length === 0) {
      return;
    }

    const batch = this.batch.splice(0, this.batch.length);
    await this.processor(batch);
  }
}

/**
 * Object pool for reusing expensive objects
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset?: (obj: T) => void;
  private maxPoolSize: number;

  constructor(
    factory: () => T,
    reset?: (obj: T) => void,
    maxPoolSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxPoolSize = maxPoolSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxPoolSize) {
      if (this.reset) {
        this.reset(obj);
      }
      this.pool.push(obj);
    }
  }

  size(): number {
    return this.pool.length;
  }

  clear(): void {
    this.pool = [];
  }
}

/**
 * Performance measurement utility
 */
export class PerformanceTimer {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  checkpoint(name: string): number {
    const elapsed = Date.now() - this.startTime;
    this.checkpoints.set(name, elapsed);
    return elapsed;
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  getCheckpoints(): Map<string, number> {
    return new Map(this.checkpoints);
  }

  reset(): void {
    this.startTime = Date.now();
    this.checkpoints.clear();
  }
}

/**
 * Async mutex for preventing race conditions
 */
export class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.locked = false;
    }
  }

  async runExclusive<T>(callback: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await callback();
    } finally {
      this.release();
    }
  }
}

/**
 * Connection pool for managing limited resources
 */
export class ConnectionPool<T> {
  private connections: T[] = [];
  private available: T[] = [];
  private factory: () => Promise<T>;
  private destroy?: (conn: T) => Promise<void>;
  private maxConnections: number;

  constructor(
    factory: () => Promise<T>,
    destroy?: (conn: T) => Promise<void>,
    maxConnections: number = 10
  ) {
    this.factory = factory;
    this.destroy = destroy;
    this.maxConnections = maxConnections;
  }

  async acquire(): Promise<T> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    if (this.connections.length < this.maxConnections) {
      const conn = await this.factory();
      this.connections.push(conn);
      return conn;
    }

    // Wait for available connection
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(checkInterval);
          resolve(this.available.pop()!);
        }
      }, 10);
    });
  }

  release(conn: T): void {
    this.available.push(conn);
  }

  async close(): Promise<void> {
    if (this.destroy) {
      await Promise.all(this.connections.map((conn) => this.destroy!(conn)));
    }
    this.connections = [];
    this.available = [];
  }

  size(): number {
    return this.connections.length;
  }

  availableCount(): number {
    return this.available.length;
  }
}

/**
 * Performance profiler for measuring execution time
 */
export class Profiler {
  private measurements = new Map<string, number[]>();

  measure<T>(name: string, fn: () => T): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      const duration = Date.now() - start;
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
    }
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = Date.now() - start;
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
    }
  }

  getStats(name: string): { count: number; avg: number; min: number; max: number } | undefined {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return undefined;
    }

    const sum = measurements.reduce((a, b) => a + b, 0);
    const avg = sum / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);

    return { count: measurements.length, avg, min, max };
  }

  getAllStats(): Map<string, { count: number; avg: number; min: number; max: number }> {
    const stats = new Map();
    for (const [name, measurements] of this.measurements.entries()) {
      if (measurements.length > 0) {
        stats.set(name, this.getStats(name)!);
      }
    }
    return stats;
  }

  reset(): void {
    this.measurements.clear();
  }
}
