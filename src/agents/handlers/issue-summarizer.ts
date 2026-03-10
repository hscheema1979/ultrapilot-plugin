/**
 * Issue Summarizer Agent Handler
 *
 * Generates periodic summaries of issues:
 * - Weekly issue digest
 * - Categorization by status
 * - Highlights important issues
 * - Tracks progress metrics
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface IssueSummary {
  period: 'daily' | 'weekly' | 'monthly';
  date: string;
  totalIssues: number;
  byStatus: Record<string, number>;
  byLabel: Record<string, number>;
  highlights: string[];
}

/**
 * Issue Summarizer Agent Handler
 */
export class IssueSummarizerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Generate issue summary
   */
  async generateSummary(period: 'daily' | 'weekly' | 'monthly' = 'weekly'): Promise<IssueSummary> {
    console.log(`[IssueSummarizer] Generating ${period} issue summary`);

    // 1. Fetch issues from GitHub
    const issues = await this.github.getIssues();

    // 2. Analyze issues
    const summary = this.analyzeIssues(issues, period);

    // 3. Generate summary comment
    const comment = this.generateSummaryComment(summary);

    // 4. Post to GitHub (create a new issue or comment on tracking issue)
    const summaryIssueNumber = await this.findOrCreateSummaryIssue();
    await this.github.postComment(summaryIssueNumber, comment);

    return summary;
  }

  /**
   * Analyze issues
   */
  private analyzeIssues(issues: Issue[], period: string): IssueSummary {
    const byStatus: Record<string, number> = {};
    const byLabel: Record<string, number> = {};
    const highlights: string[] = [];

    // Count by status
    for (const issue of issues) {
      byStatus[issue.state] = (byStatus[issue.state] || 0) + 1;

      // Count labels
      for (const label of issue.labels) {
        byLabel[label.name] = (byLabel[label.name] || 0) + 1;
      }
    }

    // Identify highlights
    const criticalIssues = issues.filter(i =>
      i.labels.some(l => l.name === 'critical' || l.name === 'urgent')
    );

    if (criticalIssues.length > 0) {
      highlights.push(`${criticalIssues.length} critical issues need attention`);
    }

    const newIssues = issues.filter(i =>
      i.state === 'open' && i.created_at > this.getPeriodStart(period)
    );

    if (newIssues.length > 0) {
      highlights.push(`${newIssues.length} new issues this ${period}`);
    }

    const closedIssues = issues.filter(i =>
      i.state === 'closed' && i.closed_at && i.closed_at > this.getPeriodStart(period)
    );

    if (closedIssues.length > 0) {
      highlights.push(`${closedIssues.length} issues closed this ${period}`);
    }

    return {
      period: period as any,
      date: new Date().toISOString().split('T')[0],
      totalIssues: issues.length,
      byStatus,
      byLabel,
      highlights
    };
  }

  /**
   * Get period start date
   */
  private getPeriodStart(period: string): Date {
    const now = new Date();

    switch (period) {
      case 'daily':
        return new Date(now.setDate(now.getDate() - 1));
      case 'weekly':
        return new Date(now.setDate(now.getDate() - 7));
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(now.setDate(now.getDate() - 7));
    }
  }

  /**
   * Find or create summary issue
   */
  private async findOrCreateSummaryIssue(): Promise<number> {
    // In a real implementation, this would search for an existing
    // tracking issue or create a new one
    // For now, return a placeholder
    return 1;
  }

  /**
   * Generate summary comment
   */
  private generateSummaryComment(summary: IssueSummary): string {
    let comment = `## 📊 Issue Summary - ${summary.period.toUpperCase()}\n\n`;
    comment += `**Date**: ${summary.date}\n`;
    comment += `**Period**: ${summary.period}\n\n`;

    comment += `### Overview\n\n`;
    comment += `- **Total Issues**: ${summary.totalIssues}\n`;
    comment += `- **By Status**:\n`;

    for (const [status, count] of Object.entries(summary.byStatus)) {
      comment += `  - ${status}: ${count}\n`;
    }

    comment += `\n### Top Labels\n\n`;

    const sortedLabels = Object.entries(summary.byLabel)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    for (const [label, count] of sortedLabels) {
      comment += `- **${label}**: ${count}\n`;
    }

    if (summary.highlights.length > 0) {
      comment += `\n### Highlights\n\n`;

      for (const highlight of summary.highlights) {
        comment += `- ${highlight}\n`;
      }
    }

    comment += `\n---\n\n`;
    comment += `*📊 Summarized by Ultrapilot Issue Summarizer*`;

    return comment;
  }
}
