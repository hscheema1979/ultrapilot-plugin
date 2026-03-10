/**
 * Repo Status Agent Handler
 *
 * Provides repository health status:
 * - Open issues by priority
 * - PR status overview
 * - Activity metrics
 * - Maintenance recommendations
 */

import { GitHubClient } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface RepoStatus {
  date: string;
  issues: {
    total: number;
    byPriority: Record<string, number>;
    stale: number;
  };
  pullRequests: {
    total: number;
    open: number;
    merged: number;
    reviewRequired: number;
  };
  activity: {
    commitsThisWeek: number;
    issuesOpenedThisWeek: number;
    issuesClosedThisWeek: number;
  };
  health: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Repo Status Agent Handler
 */
export class RepoStatusHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Generate repository status
   */
  async generateStatus(): Promise<RepoStatus> {
    console.log(`[RepoStatus] Generating repository status`);

    // 1. Fetch data from GitHub
    const issues = await this.github.getIssues();
    const pullRequests = await this.github.getPullRequests();
    const commits = await this.github.getRecentCommits();

    // 2. Analyze status
    const status = this.analyzeStatus(issues, pullRequests, commits);

    // 3. Generate status comment
    const comment = this.generateStatusComment(status);

    // 4. Post to status issue or create new one
    const statusIssueNumber = await this.findOrCreateStatusIssue();
    await this.github.postComment(statusIssueNumber, comment);

    return status;
  }

  /**
   * Analyze repository status
   */
  private analyzeStatus(issues: any[], pullRequests: any[], commits: any[]): RepoStatus {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Analyze issues
    const byPriority: Record<string, number> = {};
    let stale = 0;

    for (const issue of issues) {
      // Count by priority label
      const priorityLabel = issue.labels.find((l: any) =>
        ['critical', 'high', 'medium', 'low'].includes(l.name.toLowerCase())
      );

      if (priorityLabel) {
        byPriority[priorityLabel.name] = (byPriority[priorityLabel.name] || 0) + 1;
      }

      // Count stale issues (no activity for 30 days)
      const updatedAt = new Date(issue.updated_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (updatedAt < thirtyDaysAgo) {
        stale++;
      }
    }

    // Analyze PRs
    const openPRs = pullRequests.filter(pr => pr.state === 'open');
    const reviewRequired = openPRs.filter(pr =>
      pr.labels.some((l: any) => l.name === 'review-required')
    ).length;

    const mergedPRs = pullRequests.filter(pr => pr.state === 'closed' && pr.merged_at);

    // Analyze activity
    const commitsThisWeek = commits.filter(c =>
      new Date(c.date) > oneWeekAgo
    ).length;

    const issuesOpenedThisWeek = issues.filter(i =>
      new Date(i.created_at) > oneWeekAgo
    ).length;

    const issuesClosedThisWeek = issues.filter(i =>
      i.closed_at && new Date(i.closed_at) > oneWeekAgo
    ).length;

    // Determine health score
    const health = this.calculateHealth({
      stale,
      openPRs: openPRs.length,
      reviewRequired,
      issuesOpenedThisWeek,
      issuesClosedThisWeek
    });

    return {
      date: new Date().toISOString().split('T')[0],
      issues: {
        total: issues.length,
        byPriority,
        stale
      },
      pullRequests: {
        total: pullRequests.length,
        open: openPRs.length,
        merged: mergedPRs.length,
        reviewRequired
      },
      activity: {
        commitsThisWeek,
        issuesOpenedThisWeek,
        issuesClosedThisWeek
      },
      health
    };
  }

  /**
   * Calculate repository health
   */
  private calculateHealth(metrics: any): RepoStatus['health'] {
    let score = 100;

    // Deduct for stale issues
    score -= metrics.stale * 2;

    // Deduct for PRs needing review
    score -= metrics.reviewRequired * 5;

    // Bonus for closing issues
    score += metrics.issuesClosedThisWeek * 3;

    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Find or create status issue
   */
  private async findOrCreateStatusIssue(): Promise<number> {
    // In a real implementation, this would search for an existing
    // status issue or create a new one
    return 1;
  }

  /**
   * Generate status comment
   */
  private generateStatusComment(status: RepoStatus): string {
    let comment = `## 🏥 Repository Health Status\n\n`;
    comment += `**Date**: ${status.date}\n`;
    comment += `**Health**: ${this.getHealthEmoji(status.health)} ${status.health.toUpperCase()}\n\n`;

    comment += `### 📋 Issues\n\n`;
    comment += `- **Total**: ${status.issues.total}\n`;
    comment += `- **Stale**: ${status.issues.stale}\n`;

    if (Object.keys(status.issues.byPriority).length > 0) {
      comment += `- **By Priority**:\n`;

      for (const [priority, count] of Object.entries(status.issues.byPriority)) {
        comment += `  - ${priority}: ${count}\n`;
      }
    }

    comment += `\n### 🔮 Pull Requests\n\n`;
    comment += `- **Total**: ${status.pullRequests.total}\n`;
    comment += `- **Open**: ${status.pullRequests.open}\n`;
    comment += `- **Merged**: ${status.pullRequests.merged}\n`;
    comment += `- **Need Review**: ${status.pullRequests.reviewRequired}\n`;

    comment += `\n### 📈 Activity (This Week)\n\n`;
    comment += `- **Commits**: ${status.activity.commitsThisWeek}\n`;
    comment += `- **Issues Opened**: ${status.activity.issuesOpenedThisWeek}\n`;
    comment += `- **Issues Closed**: ${status.activity.issuesClosedThisWeek}\n`;

    if (status.health === 'poor' || status.health === 'fair') {
      comment += `\n### ⚠️ Recommendations\n\n`;

      if (status.issues.stale > 10) {
        comment += `- Consider closing or updating ${status.issues.stale} stale issues\n`;
      }

      if (status.pullRequests.reviewRequired > 5) {
        comment += `- ${status.pullRequests.reviewRequired} PRs need review - prioritize review queue\n`;
      }

      if (status.activity.commitsThisWeek < 5) {
        comment += `- Low commit activity - check for blockers\n`;
      }
    }

    comment += `\n---\n\n`;
    comment += `*🏥 Status by Ultrapilot Repo Status*`;

    return comment;
  }

  /**
   * Get health emoji
   */
  private getHealthEmoji(health: string): string {
    const emojis: Record<string, string> = {
      'excellent': '🟢',
      'good': '🟡',
      'fair': '🟠',
      'poor': '🔴'
    };

    return emojis[health] || '⚪';
  }
}
