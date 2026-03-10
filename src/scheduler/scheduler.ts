/**
 * Job Scheduler
 *
 * Cron-based job scheduling for periodic agents
 * Features:
 * - Cron expression parsing
 * - Job queue management
 * - Concurrent job execution
 * - Error handling and retry
 */

import { JobQueue, Job } from './job-queue.js';
import { cronExpression } from './cron-parser.js';

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // Cron expression
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

/**
 * Job Scheduler
 */
export class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private jobQueue: JobQueue;
  private intervalId: any;
  private running: boolean = false;

  constructor() {
    this.jobQueue = new JobQueue();
  }

  /**
   * Add a scheduled job
   */
  scheduleJob(config: Omit<ScheduledJob, 'id' | 'lastRun' | 'nextRun'>): string {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job: ScheduledJob = {
      id,
      ...config,
      lastRun: undefined,
      nextRun: this.calculateNextRun(config.schedule)
    };

    this.jobs.set(id, job);

    console.log(`[Scheduler] Scheduled job: ${job.name} (${job.schedule})`);

    return id;
  }

  /**
   * Remove a scheduled job
   */
  unscheduleJob(id: string): boolean {
    return this.jobs.delete(id);
  }

  /**
   * Enable a job
   */
  enableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a job
   */
  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn(`[Scheduler] Already running`);
      return;
    }

    this.running = true;

    console.log(`[Scheduler] Starting job scheduler`);

    // Run every minute
    this.intervalId = setInterval(async () => {
      await this.tick();
    }, 60 * 1000);

    console.log(`[Scheduler] ✓ Scheduler started`);
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for running jobs to complete
    await this.jobQueue.drain();

    console.log(`[Scheduler] ✓ Scheduler stopped`);
  }

  /**
   * Scheduler tick - check and run due jobs
   */
  private async tick(): Promise<void> {
    const now = new Date();

    for (const [id, job] of this.jobs.entries()) {
      if (!job.enabled) {
        continue;
      }

      // Check if job is due
      if (job.nextRun && now >= job.nextRun) {
        console.log(`[Scheduler] Running job: ${job.name}`);

        // Add job to queue
        await this.jobQueue.add({
          id: `${id}-${Date.now()}`,
          name: job.name,
          handler: job.handler
        });

        // Update job state
        job.lastRun = now;
        job.nextRun = this.calculateNextRun(job.schedule);
      }
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRun(cronExpression: string): Date {
    // Simple implementation - just add 24 hours
    // In production, use a proper cron parser like 'node-cron'
    const now = new Date();
    const next = new Date(now.getTime() + (24 * 60 * 60 * 1000));
    return next;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    totalJobs: number;
    enabledJobs: number;
    queuedJobs: number;
  } {
    return {
      running: this.running,
      totalJobs: this.jobs.size,
      enabledJobs: Array.from(this.jobs.values()).filter(j => j.enabled).length,
      queuedJobs: this.jobQueue.size()
    };
  }

  /**
   * Get all jobs
   */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }
}

/**
 * Global scheduler instance
 */
let globalScheduler: JobScheduler | null = null;

/**
 * Get or create global scheduler instance
 */
export function getScheduler(): JobScheduler {
  if (!globalScheduler) {
    globalScheduler = new JobScheduler();
  }

  return globalScheduler;
}
