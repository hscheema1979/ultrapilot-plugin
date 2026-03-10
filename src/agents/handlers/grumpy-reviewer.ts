/**
 * Grumpy Reviewer Agent Handler
 *
 * Provides thorough, strict code review:
 * - Finds potential bugs
 * - Identifies performance issues
 * - Checks for security vulnerabilities
 * - Enforces code quality standards
 * - Maintains a grumpy, critical persona
 */

import { GitHubClient, PullRequest } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface CodeReviewResult {
  prNumber: number;
  issues: {
    severity: 'critical' | 'major' | 'minor' | 'nitpick';
    file: string;
    line?: number;
    description: string;
    suggestion?: string;
  }[];
  summary: string;
  approval: 'approve' | 'request_changes' | 'comment';
}

/**
 * Grumpy Reviewer Agent Handler
 */
export class GrumpyReviewerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle pull request for code review
   */
  async handlePullRequest(pr: PullRequest, diff: string, files: any[]): Promise<CodeReviewResult> {
    console.log(`[GrumpyReviewer] Grumpily reviewing PR #${pr.number}`);

    // 1. Analyze the PR for issues
    const issues = await this.findIssues(pr, diff, files);
    console.log(`[GrumpyReviewer] Found ${issues.length} issues to complain about`);

    // 2. Generate approval decision
    const approval = this.makeApprovalDecision(issues);

    // 3. Generate review comment
    const summary = this.generateGrumpySummary(pr, issues, approval);

    // 4. Post review comments on each file
    for (const issue of issues) {
      if (issue.file && issue.line) {
        await this.github.postPRComment(
          pr.number,
          issue.file,
          issue.line,
          this.formatIssue(issue)
        );
      }
    }

    // 5. Post overall review comment
    await this.github.postComment(pr.number, summary);

    return {
      prNumber: pr.number,
      issues,
      summary,
      approval
    };
  }

  /**
   * Find issues in the PR
   */
  private async findIssues(pr: PullRequest, diff: string, files: any[]): Promise<CodeReviewResult['issues']> {
    const issues: CodeReviewResult['issues'] = [];

    // Check for common issues
    for (const file of files) {
      const filename = file.filename;

      // Check for console.logs
      if (file.patch?.includes('console.log')) {
        issues.push({
          severity: 'minor',
          file: filename,
          description: 'Left debug console.log statements in production code',
          suggestion: 'Remove console.log or replace with proper logging'
        });
      }

      // Check for TODOs without issues
      if (file.patch?.includes('TODO') || file.patch?.includes('FIXME')) {
        issues.push({
          severity: 'nitpick',
          file: filename,
          description: 'Contains TODO/FIXME comments',
          suggestion: 'Create GitHub issues to track these tasks'
        });
      }

      // Check for hardcoded values
      if (file.patch?.match(/localhost|127\.0\.0\.1/)) {
        issues.push({
          severity: 'major',
          file: filename,
          description: 'Hardcoded localhost addresses',
          suggestion: 'Use environment variables for configuration'
        });
      }

      // Check for missing error handling
      if (file.patch?.includes('.then(') && !file.patch?.includes('.catch')) {
        issues.push({
          severity: 'major',
          file: filename,
          description: 'Promise without error handler',
          suggestion: 'Add .catch() or try/catch for proper error handling'
        });
      }

      // Check for large files
      if (file.changes && file.changes > 500) {
        issues.push({
          severity: 'minor',
          file: filename,
          description: `Large file change: ${file.changes} lines`,
          suggestion: 'Consider splitting into smaller, focused commits'
        });
      }
    }

    // Use AI to find more subtle issues
    const aiIssues = await this.findAIIssues(pr, diff);
    issues.push(...aiIssues);

    return issues;
  }

  /**
   * Use AI to find code issues
   */
  private async findAIIssues(pr: PullRequest, diff: string): Promise<CodeReviewResult['issues']> {
    const prompt = `
You are a GRUMPY, EXPERIENCED code reviewer. Review this pull request diff and find:
1. Potential bugs
2. Performance issues
3. Security vulnerabilities
4. Code quality problems

Be THOROUGH and STRICT. Don't approve anything easily.

PR: ${pr.title}
Branch: ${pr.head.ref}
Diff (excerpt):
${diff.substring(0, 3000)}

Return findings in format:
SEVERITY|file|line|description|suggestion
`;

    const result = await skillExecutor.executeSkill('grumpy-reviewer', {
      github: {
        owner: 'repository',
        repo: 'name',
        prNumber: pr.number
      },
      params: { diff: diff.substring(0, 2000) }
    });

    const issues: CodeReviewResult['issues'] = [];

    if (result.success && result.output) {
      // Parse AI output (simplified)
      const lines = result.output.split('\n').filter(line => line.includes('|'));

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 4) {
          issues.push({
            severity: parts[0].trim() as any,
            file: parts[1].trim(),
            line: parts[2] ? parseInt(parts[2].trim()) : undefined,
            description: parts[3].trim(),
            suggestion: parts[4] ? parts[4].trim() : undefined
          });
        }
      }
    }

    return issues;
  }

  /**
   * Make approval decision
   */
  private makeApprovalDecision(issues: CodeReviewResult['issues']): CodeReviewResult['approval'] {
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const majorCount = issues.filter(i => i.severity === 'major').length;

    if (criticalCount > 0) {
      return 'request_changes';
    }

    if (majorCount > 3) {
      return 'request_changes';
    }

    if (issues.length === 0) {
      return 'approve';
    }

    return 'comment';
  }

  /**
   * Generate grumpy summary
   */
  private generateGrumpySummary(pr: PullRequest, issues: CodeReviewResult['issues'], approval: string): string {
    const grumpyOpenings = [
      "Ugh, another PR to review. Fine, let's see what we have here...",
      "I suppose I should review this. Don't expect me to be nice about it.",
      "Let's get this over with. Here's what's wrong with your code:",
      "*sigh* I've seen better code from bootcamp graduates. Here's the deal:"
    ];

    const opening = grumpyOpenings[Math.floor(Math.random() * grumpyOpenings.length)];

    let comment = `## 😤 Grumpy Code Review\n\n`;
    comment += `${opening}\n\n`;

    comment += `**PR**: #${pr.number} - ${pr.title}\n`;
    comment += `**Verdict**: ${this.getVerdictEmoji(approval)} ${approval.replace('_', ' ').toUpperCase()}\n\n`;

    if (issues.length === 0) {
      comment += `### begrudgingly Approved\n\n`;
      comment += `Fine. This is acceptable. I guess. Don't let it go to your head.\n`;
    } else {
      comment += `### Issues Found (${issues.length})\n\n`;

      // Group by severity
      const bySeverity = {
        critical: issues.filter(i => i.severity === 'critical'),
        major: issues.filter(i => i.severity === 'major'),
        minor: issues.filter(i => i.severity === 'minor'),
        nitpick: issues.filter(i => i.severity === 'nitpick')
      };

      if (bySeverity.critical.length > 0) {
        comment += `#### 🚨 Critical (${bySeverity.critical.length})\n`;
        bySeverity.critical.forEach(i => {
          comment += `- **${i.file}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (bySeverity.major.length > 0) {
        comment += `#### ⚠️ Major (${bySeverity.major.length})\n`;
        bySeverity.major.forEach(i => {
          comment += `- **${i.file}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (bySeverity.minor.length > 0) {
        comment += `#### 📝 Minor (${bySeverity.minor.length})\n`;
        bySeverity.minor.forEach(i => {
          comment += `- **${i.file}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (bySeverity.nitpick.length > 0) {
        comment += `#### 🔍 Nitpicks (${bySeverity.nitpick.length})\n`;
        bySeverity.nitpick.forEach(i => {
          comment += `- **${i.file}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (approval === 'request_changes') {
        comment += `### Fix These Before Merging\n\n`;
        comment += `I'm requesting changes. Fix the critical and major issues, then I'll reconsider.\n`;
      }
    }

    comment += `\n---\n\n`;
    comment += `*🤖 Grumpily reviewed by Ultrapilot*`;

    return comment;
  }

  /**
   * Format issue for inline comment
   */
  private formatIssue(issue: CodeReviewResult['issues'][0]): string {
    let text = `${this.getSeverityEmoji(issue.severity)} **${issue.severity.toUpperCase()}**: ${issue.description}`;

    if (issue.suggestion) {
      text += `\n\n**Suggestion**: ${issue.suggestion}`;
    }

    return text;
  }

  /**
   * Get verdict emoji
   */
  private getVerdictEmoji(approval: string): string {
    const emojis: Record<string, string> = {
      'approve': '👎',
      'request_changes': '🚫',
      'comment': '😒'
    };

    return emojis[approval] || '😐';
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      'critical': '🚨',
      'major': '⚠️',
      'minor': '📝',
      'nitpick': '🔍'
    };

    return emojis[severity] || '❓';
  }
}
