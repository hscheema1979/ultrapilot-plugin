/**
 * Scheduled Agents Configuration
 *
 * Defines which agents run on schedule
 */

import { getScheduler } from './scheduler.js';
import { RepoAssistHandler } from '../agents/handlers/repo-assist.js';
import { IssueSummarizerHandler } from '../agents/handlers/issue-summarizer.js';
import { RepoStatusHandler } from '../agents/handlers/repo-status.js';
import { DiscussionMinerHandler } from '../agents/handlers/discussion-miner.js';
import { GitHubClient } from '../github/client.js';

/**
 * Configure scheduled agents
 */
export function configureScheduledAgents(github: GitHubClient): void {
  const scheduler = getScheduler();

  // Daily repository assistance (runs at 2 AM UTC)
  scheduler.scheduleJob({
    name: 'daily-repo-assist',
    schedule: '0 2 * * *', // 2 AM UTC daily
    enabled: true,
    handler: async () => {
      console.log(`[ScheduledAgents] Running daily repo assistance`);
      const handler = new RepoAssistHandler(github);
      await handler.runDailyAssist();
    }
  });

  // Weekly issue summary (runs at 9 AM UTC on Monday)
  scheduler.scheduleJob({
    name: 'weekly-issue-summary',
    schedule: '0 9 * * 1', // 9 AM UTC on Monday
    enabled: true,
    handler: async () => {
      console.log(`[ScheduledAgents] Running weekly issue summary`);
      const handler = new IssueSummarizerHandler(github);
      await handler.generateSummary('weekly');
    }
  });

  // Daily repository status (runs at 8 AM UTC)
  scheduler.scheduleJob({
    name: 'daily-repo-status',
    schedule: '0 8 * * *', // 8 AM UTC daily
    enabled: true,
    handler: async () => {
      console.log(`[ScheduledAgents] Running daily repo status`);
      const handler = new RepoStatusHandler(github);
      await handler.generateStatus();
    }
  });

  // Weekly discussion mining (runs at 10 AM UTC on Friday)
  scheduler.scheduleJob({
    name: 'weekly-discussion-mining',
    schedule: '0 10 * * 5', // 10 AM UTC on Friday
    enabled: true,
    handler: async () => {
      console.log(`[ScheduledAgents] Running weekly discussion mining`);
      const handler = new DiscussionMinerHandler(github);
      await handler.mineDiscussions(7);
    }
  });

  console.log(`[ScheduledAgents] ✓ Configured 4 scheduled agents`);
}

/**
 * Get scheduled job info
 */
export function getScheduledJobsInfo(): any[] {
  const scheduler = getScheduler();
  const jobs = scheduler.getJobs();

  return jobs.map(job => ({
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled,
    lastRun: job.lastRun,
    nextRun: job.nextRun
  }));
}
