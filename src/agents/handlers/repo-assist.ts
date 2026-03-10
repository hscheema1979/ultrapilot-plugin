/**
 * Repo Assist Agent Handler
 *
 * Automated repository assistance:
 * - Maintains issue labels
 * - Cleans up stale issues
 * - Updates documentation
 * - Performs routine maintenance
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface RepoAssistResult {
  tasksCompleted: string[];
  issuesProcessed: number;
  labelsAdded: number;
  issuesClosed: number;
}

/**
 * Repo Assist Agent Handler
 */
export class RepoAssistHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Run daily repository assistance
   */
  async runDailyAssist(): Promise<RepoAssistResult> {
    console.log(`[RepoAssist] Running daily repository assistance`);

    const tasksCompleted: string[] = [];
    let issuesProcessed = 0;
    let labelsAdded = 0;
    let issuesClosed = 0;

    // 1. Clean up stale issues
    const staleResult = await this.cleanupStaleIssues();
    tasksCompleted.push(`Cleaned up ${staleResult} stale issues`);
    issuesClosed += staleResult;

    // 2. Normalize labels
    const labelResult = await this.normalizeLabels();
    tasksCompleted.push(`Added ${labelResult} missing labels`);
    labelsAdded += labelResult;

    // 3. Update documentation
    const docResult = await this.updateDocumentation();
    if (docResult) {
      tasksCompleted.push('Updated documentation');
    }

    // 4. Generate status report
    const report = await this.generateAssistReport({
      tasksCompleted,
      issuesProcessed,
      labelsAdded,
      issuesClosed
    });

    return report;
  }

  /**
   * Clean up stale issues
   */
  private async cleanupStaleIssues(): Promise<number> {
    console.log(`[RepoAssist] Cleaning up stale issues`);

    const issues = await this.github.getIssues();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let closed = 0;

    for (const issue of issues) {
      if (issue.state === 'open') {
        const updatedAt = new Date(issue.updated_at);

        // Check if stale
        if (updatedAt < thirtyDaysAgo) {
          // Add stale warning label
          await this.github.addLabels(issue.number, ['stale']);

          // Close if very old (60 days)
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

          if (updatedAt < sixtyDaysAgo) {
            await this.github.closeIssue(issue.number);
            closed++;
          }
        }
      }
    }

    return closed;
  }

  /**
   * Normalize labels across issues
   */
  private async normalizeLabels(): Promise<number> {
    console.log(`[RepoAssist] Normalizing labels`);

    const issues = await this.github.getIssues();
    let labelsAdded = 0;

    for (const issue of issues) {
      if (issue.state === 'open') {
        // Check if issue has priority label
        const hasPriority = issue.labels.some(l =>
          ['critical', 'high', 'medium', 'low'].includes(l.name.toLowerCase())
        );

        if (!hasPriority) {
          // Add default priority
          await this.github.addLabels(issue.number, ['medium']);
          labelsAdded++;
        }

        // Check if issue has type label
        const hasType = issue.labels.some(l =>
          ['bug', 'feature', 'enhancement', 'documentation'].includes(l.name.toLowerCase())
        );

        if (!hasType) {
          // Try to infer type from title
          const title = issue.title.toLowerCase();

          if (title.includes('bug') || title.includes('error')) {
            await this.github.addLabels(issue.number, ['bug']);
            labelsAdded++;
          } else if (title.includes('feature') || title.includes('add')) {
            await this.github.addLabels(issue.number, ['feature']);
            labelsAdded++;
          }
        }
      }
    }

    return labelsAdded;
  }

  /**
   * Update documentation
   */
  private async updateDocumentation(): Promise<boolean> {
    console.log(`[RepoAssist] Checking documentation updates`);

    // In a real implementation, this would check if docs need updating
    // based on recent changes
    return false;
  }

  /**
   * Generate assistance report
   */
  private async generateAssistReport(metrics: any): Promise<RepoAssistResult> {
    const report: RepoAssistResult = {
      tasksCompleted: metrics.tasksCompleted,
      issuesProcessed: metrics.issuesProcessed,
      labelsAdded: metrics.labelsAdded,
      issuesClosed: metrics.issuesClosed
    };

    // Generate comment for tracking issue
    const comment = this.generateAssistComment(report);
    const assistIssueNumber = await this.findOrCreateAssistIssue();
    await this.github.postComment(assistIssueNumber, comment);

    return report;
  }

  /**
   * Find or create assist tracking issue
   */
  private async findOrCreateAssistIssue(): Promise<number> {
    // In a real implementation, this would search for an existing
    // tracking issue or create a new one
    return 1;
  }

  /**
   * Generate assist comment
   */
  private generateAssistComment(report: RepoAssistResult): string {
    let comment = `## 🤖 Repository Assistance Report\n\n`;
    comment += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    comment += `### Tasks Completed\n\n`;

    for (const task of report.tasksCompleted) {
      comment += `- ✅ ${task}\n`;
    }

    comment += `\n### Metrics\n\n`;
    comment += `- **Issues Processed**: ${report.issuesProcessed}\n`;
    comment += `- **Labels Added**: ${report.labelsAdded}\n`;
    comment += `- **Issues Closed**: ${report.issuesClosed}\n`;

    comment += `\n---\n\n`;
    comment += `*🤖 Assisted by Ultrapilot Repo Assist*`;

    return comment;
  }
}
