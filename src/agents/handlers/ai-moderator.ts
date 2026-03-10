/**
 * AI Moderator Agent Handler
 *
 * Moderates repository discussions:
 * - Detects toxic comments
 * - Identifies spam
 * - Enforces code of conduct
 * - Provides warnings
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface ModerationResult {
  issueNumber: number;
  action: 'approve' | 'warn' | 'hide' | 'lock';
  violations: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }[];
  warningsIssued: number;
}

/**
 * AI Moderator Agent Handler
 */
export class AIModeratorHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Moderate issue or comment
   */
  async moderateIssue(issue: Issue, comments?: any[]): Promise<ModerationResult> {
    console.log(`[AIModerator] Moderating issue #${issue.number}`);

    const violations: ModerationResult['violations'] = [];
    let warningsIssued = 0;

    // 1. Moderate issue title and body
    const issueViolations = await this.moderateContent(issue.title + ' ' + (issue.body || ''), issue);
    violations.push(...issueViolations);

    // 2. Moderate comments if provided
    if (comments) {
      for (const comment of comments) {
        const commentViolations = await this.moderateContent(comment.body, issue);
        violations.push(...commentViolations);
      }
    }

    // 3. Determine action based on violations
    const action = this.determineAction(violations);

    // 4. Take action
    if (action === 'warn') {
      await this.issueWarning(issue, violations);
      warningsIssued = 1;
    } else if (action === 'hide') {
      await this.hideContent(issue);
    } else if (action === 'lock') {
      await this.lockIssue(issue);
    }

    // 5. Log moderation action
    await this.logModerationAction(issue, action, violations);

    return {
      issueNumber: issue.number,
      action,
      violations,
      warningsIssued
    };
  }

  /**
   * Moderate content for violations
   */
  private async moderateContent(content: string, context: Issue): Promise<ModerationResult['violations']> {
    const violations: ModerationResult['violations'] = [];
    const lowerContent = content.toLowerCase();

    // Check for toxic patterns
    const toxicPatterns = [
      { pattern: /stupid|idiot|dumb/i, type: 'Insult', severity: 'medium' },
      { pattern: /hate|kill|die/i, type: 'Threatening language', severity: 'high' },
      { pattern: /\b(s+h+i+t+)\b/i, type: 'Profanity', severity: 'low' },
      { pattern: /spam|click here|buy now/i, type: 'Spam', severity: 'high' }
    ];

    for (const { pattern, type, severity } of toxicPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type,
          severity: severity as any,
          description: `Detected ${type.toLowerCase()} in content`
        });
      }
    }

    // Check for excessive caps (shouting)
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.5 && content.length > 50) {
      violations.push({
        type: 'Excessive caps',
        severity: 'low',
        description: 'Excessive use of capital letters'
      });
    }

    // Use AI for more subtle detection
    const aiViolations = await this.detectWithAI(content, context);
    violations.push(...aiViolations);

    return violations;
  }

  /**
   * Use AI to detect violations
   */
  private async detectWithAI(content: string, context: Issue): Promise<ModerationResult['violations']> {
    const prompt = `
Moderate this content for:
1. Toxic language
2. Spam
3. Code of conduct violations

Content:
${content.substring(0, 500)}

Return violations in format:
TYPE|SEVERITY|description
`;

    const result = await skillExecutor.executeSkill('ai-moderator', {
      github: {
        owner: 'repository',
        repo: 'name',
        issueNumber: context.number
      },
      params: { content }
    });

    const violations: ModerationResult['violations'] = [];

    if (result.success && result.output) {
      const lines = result.output.split('\n').filter(line => line.includes('|'));

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 3) {
          violations.push({
            type: parts[0].trim(),
            severity: parts[1].trim().toLowerCase() as any,
            description: parts[2].trim()
          });
        }
      }
    }

    return violations;
  }

  /**
   * Determine moderation action
   */
  private determineAction(violations: ModerationResult['violations']): ModerationResult['action'] {
    const highSeverity = violations.filter(v => v.severity === 'high').length;
    const mediumSeverity = violations.filter(v => v.severity === 'medium').length;
    const totalViolations = violations.length;

    if (highSeverity > 0 || totalViolations > 5) {
      return 'lock';
    }

    if (highSeverity > 0 || mediumSeverity > 2 || totalViolations > 3) {
      return 'hide';
    }

    if (totalViolations > 0) {
      return 'warn';
    }

    return 'approve';
  }

  /**
   * Issue warning
   */
  private async issueWarning(issue: Issue, violations: ModerationResult['violations']): Promise<void> {
    const comment = `### ⚠️ Content Warning\n\n`;
    const warningContent = `${comment}This issue contains content that may not align with our community standards.\n\n` +
      `**Violations detected**:\n` +
      violations.map(v => `- ${v.type}: ${v.description}`).join('\n') +
      `\n\nPlease review our [Code of Conduct](CODE_OF_CONDUCT.md) and ensure future contributions align with community standards.\n\n` +
      `*⚠️ Moderated by Ultrapilot AI Moderator*`;

    await this.github.postComment(issue.number, warningContent);
  }

  /**
   * Hide content
   */
  private async hideContent(issue: Issue): Promise<void> {
    // Add a label to minimize visibility
    await this.github.addLabels(issue.number, ['hidden']);
    await this.issueWarning(issue, []);
  }

  /**
   * Lock issue
   */
  private async lockIssue(issue: Issue): Promise<void> {
    // In a real implementation, this would lock the issue
    await this.github.addLabels(issue.number, ['locked']);
  }

  /**
   * Log moderation action
   */
  private async logModerationAction(issue: Issue, action: string, violations: ModerationResult['violations']): Promise<void> {
    // In a real implementation, this would log to a moderation channel
    console.log(`[AIModerator] Issue #${issue.number}: ${action} (${violations.length} violations)`);
  }
}
