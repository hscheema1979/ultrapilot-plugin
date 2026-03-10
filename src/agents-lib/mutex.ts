/**
 * Simple Mutex Implementation
 *
 * Provides mutex (mutual exclusion) for thread-safe operations.
 * Lightweight alternative to async-mutex package.
 */

export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Acquire lock and run function exclusively
   */
  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    // Acquire lock
    await this.acquire();

    try {
      // Run function
      const result = await fn();
      return result;
    } finally {
      // Always release lock
      this.release();
    }
  }

  /**
   * Acquire lock (wait if already locked)
   */
  private async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait in queue
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release lock
   */
  private release(): void {
    if (this.queue.length > 0) {
      // Wake up next waiter
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      // No waiters, unlock
      this.locked = false;
    }
  }
}
