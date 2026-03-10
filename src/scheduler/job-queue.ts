/**
 * Job Queue
 *
 * Queue for managing concurrent job execution
 */

export interface Job {
  id: string;
  name: string;
  handler: () => Promise<void>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  error?: Error;
}

/**
 * Job Queue
 */
export class JobQueue {
  private queue: Job[] = [];
  private running: Set<string> = new Set();
  private maxConcurrent: number = 3;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add job to queue
   */
  async add(job: Job): Promise<void> {
    job.status = 'pending';
    this.queue.push(job);

    // Try to process queue
    this.process();
  }

  /**
   * Process queue
   */
  private async process(): Promise<void> {
    // Process while we have capacity and jobs in queue
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();

      if (!job) {
        break;
      }

      // Mark as running
      job.status = 'running';
      this.running.add(job.id);

      // Execute job (don't await, let it run concurrently)
      this.execute(job);
    }
  }

  /**
   * Execute a job
   */
  private async execute(job: Job): Promise<void> {
    try {
      console.log(`[JobQueue] Executing job: ${job.name}`);

      await job.handler();

      job.status = 'completed';
      console.log(`[JobQueue] ✓ Job completed: ${job.name}`);

    } catch (error) {
      job.status = 'failed';
      job.error = error as Error;
      console.error(`[JobQueue] ✗ Job failed: ${job.name}`, error);

    } finally {
      // Remove from running set
      this.running.delete(job.id);

      // Try to process next job
      this.process();
    }
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Get number of running jobs
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Wait for all jobs to complete
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Simple cron parser placeholder
export namespace cronExpression {
  export function validate(expression: string): boolean {
    // Basic validation - check for 5 or 6 parts
    const parts = expression.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }
}
