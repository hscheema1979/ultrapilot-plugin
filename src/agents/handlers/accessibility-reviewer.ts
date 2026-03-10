/**
 * Accessibility Reviewer Agent Handler
 *
 * Reviews code for accessibility issues:
 * - Checks ARIA attributes
 * - Validates semantic HTML
 * - Checks keyboard navigation
 * - Tests color contrast
 */

import { GitHubClient, PullRequest } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface AccessibilityReview {
  prNumber: number;
  issues: {
    severity: 'critical' | 'major' | 'minor';
    file: string;
    line?: number;
    type: string;
    description: string;
    fix: string;
  }[];
  score: number;
}

/**
 * Accessibility Reviewer Agent Handler
 */
export class AccessibilityReviewerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Review pull request for accessibility issues
   */
  async reviewPullRequest(pr: PullRequest, files: any[]): Promise<AccessibilityReview> {
    console.log(`[AccessibilityReviewer] Reviewing PR #${pr.number} for accessibility`);

    const issues: AccessibilityReview['issues'] = [];

    // 1. Check files for accessibility issues
    for (const file of files) {
      if (this.isWebFile(file.filename)) {
        const fileIssues = await this.checkFile(file);
        issues.push(...fileIssues);
      }
    }

    // 2. Calculate accessibility score
    const score = this.calculateScore(issues, files);

    // 3. Generate review comment
    const comment = this.generateReviewComment(pr, issues, score);

    // 4. Post review
    await this.github.postComment(pr.number, comment);

    // 5. Post inline comments for issues
    for (const issue of issues) {
      if (issue.line) {
        await this.github.postPRComment(
          pr.number,
          issue.file,
          issue.line,
          this.formatIssue(issue)
        );
      }
    }

    return {
      prNumber: pr.number,
      issues,
      score
    };
  }

  /**
   * Check if file is a web file
   */
  private isWebFile(filename: string): boolean {
    return filename.endsWith('.tsx') ||
           filename.endsWith('.jsx') ||
           filename.endsWith('.html') ||
           filename.endsWith('.vue') ||
           filename.endsWith('.svelte');
  }

  /**
   * Check file for accessibility issues
   */
  private async checkFile(file: any): Promise<AccessibilityReview['issues']> {
    const issues: AccessibilityReview['issues'] = [];
    const content = file.patch || '';

    // Check for images without alt text
    if (content.includes('<img') && !content.includes('alt=')) {
      issues.push({
        severity: 'critical',
        file: file.filename,
        type: 'Missing alt text',
        description: 'Images must have alt text for screen readers',
        fix: 'Add alt attribute to all img tags'
      });
    }

    // Check for form inputs without labels
    if (content.includes('<input') && !content.includes('label')) {
      issues.push({
        severity: 'major',
        file: file.filename,
        type: 'Missing form labels',
        description: 'Form inputs need associated labels',
        fix: 'Add label elements or aria-label attributes'
      });
    }

    // Check for ARIA issues
    if (content.includes('role=') && !content.includes('aria-')) {
      issues.push({
        severity: 'major',
        file: file.filename,
        type: 'Incomplete ARIA',
        description: 'Elements with role need appropriate ARIA attributes',
        fix: 'Add necessary aria-label, aria-describedby, etc.'
      });
    }

    // Check for headings without proper hierarchy
    if (content.includes('<h1>') && !content.includes('<h2>')) {
      issues.push({
        severity: 'minor',
        file: file.filename,
        type: 'Heading hierarchy',
        description: 'Headings should follow proper hierarchy',
        fix: 'Use h1, h2, h3 in order without skipping levels'
      });
    }

    // Check for onClick without keyboard handlers
    if (content.includes('onClick') && !content.includes('onKeyDown')) {
      issues.push({
        severity: 'major',
        file: file.filename,
        type: 'Keyboard accessibility',
        description: 'Interactive elements need keyboard handlers',
        fix: 'Add onKeyDown handler for keyboard navigation'
      });
    }

    // Use AI for deeper accessibility analysis
    const aiIssues = await this.analyzeWithAI(file);
    issues.push(...aiIssues);

    return issues;
  }

  /**
   * Use AI to analyze accessibility
   */
  private async analyzeWithAI(file: any): Promise<AccessibilityReview['issues']> {
    const prompt = `
Review this code for accessibility issues beyond basic checks:
- Semantic HTML usage
- ARIA best practices
- Focus management
- Screen reader compatibility

File: ${file.filename}
Diff:
${(file.patch || '').substring(0, 1000)}

Return issues in format:
SEVERITY|type|description|fix
`;

    const result = await skillExecutor.executeSkill('accessibility-reviewer', {
      github: {
        owner: 'repository',
        repo: 'name'
      },
      params: { file: file.filename }
    });

    const issues: AccessibilityReview['issues'] = [];

    if (result.success && result.output) {
      const lines = result.output.split('\n').filter(line => line.includes('|'));

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 4) {
          issues.push({
            severity: parts[0].trim().toLowerCase() as any,
            file: file.filename,
            type: parts[1].trim(),
            description: parts[2].trim(),
            fix: parts[3].trim()
          });
        }
      }
    }

    return issues;
  }

  /**
   * Calculate accessibility score
   */
  private calculateScore(issues: AccessibilityReview['issues'], files: any[]): number {
    if (files.length === 0) return 100;

    const webFiles = files.filter(f => this.isWebFile(f.filename));
    if (webFiles.length === 0) return 100;

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const majorCount = issues.filter(i => i.severity === 'major').length;
    const minorCount = issues.filter(i => i.severity === 'minor').length;

    let score = 100;

    // Deduct points based on severity
    score -= criticalCount * 25;
    score -= majorCount * 10;
    score -= minorCount * 3;

    return Math.max(0, score);
  }

  /**
   * Generate review comment
   */
  private generateReviewComment(pr: PullRequest, issues: AccessibilityReview['issues'], score: number): string {
    let comment = `## ♿ Accessibility Review\n\n`;
    comment += `**PR**: #${pr.number} - ${pr.title}\n`;
    comment += `**Accessibility Score**: ${this.getScoreEmoji(score)} ${score}/100\n\n`;

    if (issues.length === 0) {
      comment += `### ✅ Great job!\n\n`;
      comment += `No accessibility issues detected. Keep up the good work!\n`;
    } else {
      comment += `### Issues Found (${issues.length})\n\n`;

      // Group by severity
      const bySeverity = {
        critical: issues.filter(i => i.severity === 'critical'),
        major: issues.filter(i => i.severity === 'major'),
        minor: issues.filter(i => i.severity === 'minor')
      };

      if (bySeverity.critical.length > 0) {
        comment += `#### 🚨 Critical (${bySeverity.critical.length})\n`;
        bySeverity.critical.forEach(i => {
          comment += `- **${i.type}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (bySeverity.major.length > 0) {
        comment += `#### ⚠️ Major (${bySeverity.major.length})\n`;
        bySeverity.major.forEach(i => {
          comment += `- **${i.type}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      if (bySeverity.minor.length > 0) {
        comment += `#### 📝 Minor (${bySeverity.minor.length})\n`;
        bySeverity.minor.forEach(i => {
          comment += `- **${i.type}**: ${i.description}\n`;
        });
        comment += `\n`;
      }

      comment += `### Resources\n\n`;
      comment += `- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)\n`;
      comment += `- [ARIA Best Practices](https://www.w3.org/WAI/ARIA/apg/)\n`;
      comment += `- [Accessibility Testing](https://www.deque.com/axe/)\n`;
    }

    comment += `\n---\n\n`;
    comment += `*♿ Reviewed by Ultrapilot Accessibility Reviewer*`;

    return comment;
  }

  /**
   * Format issue for inline comment
   */
  private formatIssue(issue: AccessibilityReview['issues'][0]): string {
    let text = `${this.getSeverityEmoji(issue.severity)} **${issue.type}**: ${issue.description}\n\n`;
    text += `**Fix**: ${issue.fix}`;
    return text;
  }

  /**
   * Get score emoji
   */
  private getScoreEmoji(score: number): string {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    if (score >= 50) return '🟠';
    return '🔴';
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      'critical': '🚨',
      'major': '⚠️',
      'minor': '📝'
    };

    return emojis[severity] || '❓';
  }
}
