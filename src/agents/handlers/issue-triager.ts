/**
 * Issue Triage Agent Handler
 *
 * Automatically triages issues and PRs:
 * - Analyzes content
 * - Categorizes issue type
 * - Applies appropriate labels
 * - Posts triage comment
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface TriageResult {
  issueNumber: number;
  category: IssueCategory;
  labels: string[];
  comment: string;
  confidence: number;
}

export interface IssueCategory {
  type: 'bug' | 'feature' | 'enhancement' | 'documentation' | 'question' | 'maintenance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  component?: string;
}

/**
 * Issue Triage Agent Handler
 */
export class IssueTriageHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle issue created event
   */
  async handleIssueCreated(issue: Issue): Promise<TriageResult> {
    console.log(`[IssueTriage] Triaging issue #${issue.number}: ${issue.title}`);

    // 1. Analyze issue content
    const category = await this.categorizeIssue(issue);
    console.log(`[IssueTriage] Category: ${JSON.stringify(category)}`);

    // 2. Generate labels
    const labels = this.generateLabels(category, issue);
    console.log(`[IssueTriage] Labels: ${labels.join(', ')}`);

    // 3. Generate triage comment
    const comment = this.generateTriageComment(issue, category);
    console.log(`[IssueTriage] Generated comment`);

    // 4. Apply labels to GitHub
    await this.github.addLabels(issue.number, labels);

    // 5. Post triage comment
    await this.github.postComment(issue.number, comment);

    return {
      issueNumber: issue.number,
      category,
      labels,
      comment,
      confidence: 0.85
    };
  }

  /**
   * Categorize issue based on content analysis
   */
  private async categorizeIssue(issue: Issue): Promise<IssueCategory> {
    const content = `${issue.title}\n\n${issue.body}`.toLowerCase();

    // Determine issue type
    let type: IssueCategory['type'] = 'question';

    if (this.matchesKeywords(content, ['bug', 'error', 'broken', 'crash', 'fail', 'fix', 'doesn\'t work'])) {
      type = 'bug';
    } else if (this.matchesKeywords(content, ['feature', 'add', 'implement', 'new', 'create'])) {
      type = 'feature';
    } else if (this.matchesKeywords(content, ['improve', 'enhance', 'optimize', 'refactor'])) {
      type = 'enhancement';
    } else if (this.matchesKeywords(content, ['doc', 'readme', 'wiki', 'guide', 'tutorial'])) {
      type = 'documentation';
    } else if (this.matchesKeywords(content, ['help', 'how to', 'question', '?'])) {
      type = 'question';
    } else if (this.matchesKeywords(content, ['dependabot', 'dependency', 'upgrade'])) {
      type = 'maintenance';
    }

    // Determine severity
    let severity: IssueCategory['severity'] = 'medium';

    if (this.matchesKeywords(content, ['critical', 'urgent', 'blocking', 'production'])) {
      severity = 'critical';
    } else if (this.matchesKeywords(content, ['high priority', 'important'])) {
      severity = 'high';
    } else if (this.matchesKeywords(content, ['low priority', 'minor', 'nice to have'])) {
      severity = 'low';
    }

    // Extract component (if mentioned)
    const component = this.extractComponent(content);

    return { type, severity, component };
  }

  /**
   * Check if content matches any of the keywords
   */
  private matchesKeywords(content: string, keywords: string[]): boolean {
    return keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Extract component from issue content
   */
  private extractComponent(content: string): string | undefined {
    // Common component patterns
    const componentPatterns = [
      /(?:component|module|service|area):\s*(\w+)/i,
      /in\s+(?:the|module)\s+(\w+)/i
    ];

    for (const pattern of componentPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }

    return undefined;
  }

  /**
   * Generate labels from category
   */
  private generateLabels(category: IssueCategory, issue: Issue): string[] {
    const labels: string[] = [];

    // Type label
    labels.push(category.type);

    // Severity label (only for bugs)
    if (category.type === 'bug') {
      labels.push(category.severity);
    }

    // Component label (if present)
    if (category.component) {
      labels.push(category.component);
    }

    // Good first issue indicator
    if (this.isGoodFirstIssue(issue)) {
      labels.push('good first issue');
    }

    // Help wanted indicator
    if (this.matchesKeywords(issue.body, ['help wanted', 'mentors available'])) {
      labels.push('help wanted');
    }

    return labels;
  }

  /**
   * Check if issue is good for first-time contributors
   */
  private isGoodFirstIssue(issue: Issue): boolean {
    const content = issue.body.toLowerCase();

    // Short, focused issues
    const isShort = issue.body.length < 500;

    // Not too complex
    const notComplex = !this.matchesKeywords(content, [
      'complex', 'architecture', 'refactor', 'multiple', 'several'
    ]);

    return isShort && notComplex;
  }

  /**
   * Generate triage comment
   */
  private generateTriageComment(issue: Issue, category: IssueCategory): string {
    const { type, severity, component } = category;

    let comment = `## 🔖 Issue Triage\n\n`;
    comment += `**Issue Type**: ${this.capitalize(type)}\n`;

    if (type === 'bug') {
      comment += `**Severity**: ${this.capitalize(severity)}\n`;
    }

    if (component) {
      comment += `**Component**: ${this.capitalize(component)}\n`;
    }

    comment += `\n### Summary\n\n`;
    comment += `${this.generateSummary(issue, category)}\n`;

    // Add recommendations
    const recommendations = this.generateRecommendations(issue, category);
    if (recommendations.length > 0) {
      comment += `\n### Recommendations\n\n`;
      recommendations.forEach(rec => {
        comment += `- ${rec}\n`;
      });
    }

    // Add next steps
    comment += `\n### Next Steps\n\n`;
    comment += this.generateNextSteps(issue, category);

    comment += `\n\n---\n\n*🤖 Auto-triaged by Ultrapilot Issue Triage Agent*`;

    return comment;
  }

  /**
   * Generate issue summary
   */
  private generateSummary(issue: Issue, category: IssueCategory): string {
    const summaries: Record<string, string> = {
      'bug': `This appears to be a **bug** ${category.severity !== 'low' ? `that needs attention` : `that can be addressed`}.`,
      'feature': `This is a **feature request** for new functionality.`,
      'enhancement': `This is an **enhancement** to existing functionality.`,
      'documentation': `This relates to **documentation**.`,
      'question': `This appears to be a **question** that needs clarification.`,
      'maintenance': `This is a **maintenance** task.`
    };

    return summaries[category.type] || 'Thank you for your contribution!';
  }

  /**
   * Generate recommendations based on category
   */
  private generateRecommendations(issue: Issue, category: IssueCategory): string[] {
    const recommendations: string[] = [];

    if (category.type === 'bug') {
      recommendations.push('Include steps to reproduce if not already present');
      recommendations.push('Add error logs or screenshots if applicable');

      if (category.severity === 'critical') {
        recommendations.push('🚨 This issue has been marked as critical - please prioritize investigation');
      }
    }

    if (category.type === 'feature' || category.type === 'enhancement') {
      recommendations.push('Consider breaking this down into smaller sub-issues if it involves multiple changes');
      recommendations.push('Check for similar existing issues or feature requests');
    }

    if (issue.labels.some(l => l.name === 'good first issue')) {
      recommendations.push('Great first issue! Feel free to ask questions in comments if you need guidance.');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(issue: Issue, category: IssueCategory): string {
    if (category.type === 'question') {
      return 'Maintainers will review and respond to your question shortly.';
    }

    if (category.type === 'bug' && category.severity === 'critical') {
      return `This has been flagged as **${category.severity} priority**. A maintainer will investigate ASAP.`;
    }

    return 'This issue has been triaged and is ready for maintainer review.';
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
