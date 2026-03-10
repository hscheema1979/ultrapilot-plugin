/**
 * Archie (Architect) Agent Handler
 *
 * Provides architectural guidance:
 * - Reviews code architecture
 * - Suggests design patterns
 * - Identifies architectural debt
 * - Proposes refactoring opportunities
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface ArchieReview {
  issueNumber: number;
  architecturalFindings: {
    category: 'pattern' | 'structure' | 'coupling' | 'scalability' | 'maintainability';
    severity: 'critical' | 'major' | 'minor';
    finding: string;
    recommendation: string;
  }[];
  suggestedPatterns: string[];
  refactoringOpportunities: string[];
}

/**
 * Archie Agent Handler
 */
export class ArchieHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle issue requiring architectural review
   */
  async handleArchitecturalIssue(issue: Issue): Promise<ArchieReview> {
    console.log(`[Archie] Providing architectural guidance for issue #${issue.number}`);

    // 1. Analyze architectural concerns
    const review = await this.analyzeArchitecture(issue);
    console.log(`[Archie] Found ${review.architecturalFindings.length} architectural findings`);

    // 2. Generate architectural review comment
    const comment = this.generateArchitecturalComment(issue, review);

    // 3. Post to GitHub
    await this.github.postComment(issue.number, comment);

    return review;
  }

  /**
   * Analyze architecture
   */
  private async analyzeArchitecture(issue: Issue): Promise<ArchieReview> {
    const content = `${issue.title}\n\n${issue.body}`.toLowerCase();

    const findings: ArchieReview['architecturalFindings'] = [];
    const suggestedPatterns: string[] = [];
    const refactoringOpportunities: string[] = [];

    // Detect architectural concerns
    if (this.matchesKeywords(content, ['architecture', 'design', 'structure', 'pattern'])) {
      findings.push({
        category: 'structure',
        severity: 'major',
        finding: 'Architectural review requested',
        recommendation: 'Consider SOLID principles and design patterns'
      });
    }

    if (this.matchesKeywords(content, ['scalability', 'performance', 'load'])) {
      findings.push({
        category: 'scalability',
        severity: 'major',
        finding: 'Scalability concerns identified',
        recommendation: 'Consider caching, load balancing, or horizontal scaling'
      });
      suggestedPatterns.push('Caching Pattern', 'Load Balancer Pattern');
    }

    if (this.matchesKeywords(content, ['coupled', 'tightly', 'dependency', 'modular'])) {
      findings.push({
        category: 'coupling',
        severity: 'major',
        finding: 'Potential coupling issues',
        recommendation: 'Apply dependency injection and interface segregation'
      });
      suggestedPatterns.push('Dependency Injection', 'Facade Pattern');
    }

    if (this.matchesKeywords(content, ['refactor', 'cleanup', 'technical debt'])) {
      findings.push({
        category: 'maintainability',
        severity: 'minor',
        finding: 'Refactoring needed',
        recommendation: 'Break down large functions, extract common logic'
      });
      refactoringOpportunities.push('Extract Method', 'Replace Conditional with Polymorphism');
    }

    // Use AI for deeper analysis
    const aiAnalysis = await this.analyzeWithAI(issue);
    findings.push(...aiAnalysis.findings);
    suggestedPatterns.push(...aiAnalysis.patterns);
    refactoringOpportunities.push(...aiAnalysis.refactoring);

    return {
      issueNumber: issue.number,
      architecturalFindings: findings,
      suggestedPatterns: [...new Set(suggestedPatterns)],
      refactoringOpportunities: [...new Set(refactoringOpportunities)]
    };
  }

  /**
   * Use AI to analyze architecture
   */
  private async analyzeWithAI(issue: Issue): Promise<{
    findings: ArchieReview['architecturalFindings'];
    patterns: string[];
    refactoring: string[];
  }> {
    const prompt = `You are Archie, an expert software architect. Review this issue and provide:
1. Architectural findings (2-3)
2. Suggested design patterns (2-3)
3. Refactoring opportunities (2-3)

Issue: ${issue.title}
Body: ${issue.body?.substring(0, 1000)}
`;<arg_value><arg_value>I need to continue writing this file. Let me complete the archie.ts handler.</think>`
You are Archie, an expert software architect. Review this issue and provide:
1. Architectural findings (2-3)
2. Suggested design patterns (2-3)
3. Refactoring opportunities (2-3)

Issue: ${issue.title}
Body: ${issue.body?.substring(0, 1000)}
`;

    const result = await skillExecutor.executeSkill('archie', {
      github: {
        owner: 'repository',
        repo: 'name',
        issueNumber: issue.number
      },
      params: { issue: issue.body }
    });

    const findings: ArchieReview['architecturalFindings'] = [];
    const patterns: string[] = [];
    const refactoring: string[] = [];

    // Parse AI response (simplified)
    if (result.success && result.output) {
      const lines = result.output.split('\n');

      for (const line of lines) {
        if (line.toLowerCase().includes('finding:')) {
          findings.push({
            category: 'pattern',
            severity: 'major',
            finding: line,
            recommendation: 'Review and apply suggested pattern'
          });
        }
        if (line.toLowerCase().includes('pattern:')) {
          patterns.push(line.replace(/pattern:/i, '').trim());
        }
        if (line.toLowerCase().includes('refactor:')) {
          refactoring.push(line.replace(/refactor:/i, '').trim());
        }
      }
    }

    return { findings, patterns, refactoring };
  }

  /**
   * Check if content matches keywords
   */
  private matchesKeywords(content: string, keywords: string[]): boolean {
    return keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Generate architectural comment
   */
  private generateArchitecturalComment(issue: Issue, review: ArchieReview): string {
    let comment = `## 🏛️ Architectural Review\n\n`;
    comment += `**Issue**: #${issue.number} - ${issue.title}\n\n`;

    if (review.architecturalFindings.length > 0) {
      comment += `### Architectural Findings\n\n`;

      for (const finding of review.architecturalFindings) {
        const emoji = this.getCategoryEmoji(finding.category);
        const severity = this.getSeverityEmoji(finding.severity);

        comment += `${emoji} **${finding.category}** ${severity}\n`;
        comment += `**Finding**: ${finding.finding}\n`;
        comment += `**Recommendation**: ${finding.recommendation}\n\n`;
      }
    }

    if (review.suggestedPatterns.length > 0) {
      comment += `### Suggested Design Patterns\n\n`;
      review.suggestedPatterns.forEach(pattern => {
        comment += `- **${pattern}**\n`;
      });
      comment += `\n`;
    }

    if (review.refactoringOpportunities.length > 0) {
      comment += `### Refactoring Opportunities\n\n`;
      review.refactoringOpportunities.forEach(opp => {
        comment += `- ${opp}\n`;
      });
      comment += `\n`;
    }

    comment += `### Resources\n\n`;
    comment += `- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)\n`;
    comment += `- [Design Patterns](https://refactoring.guru/design-patterns)\n`;
    comment += `- [Clean Code](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)\n`;

    comment += `\n---\n\n`;
    comment += `*🏛️ Architected by Ultrapilot Archie*`;

    return comment;
  }

  /**
   * Get category emoji
   */
  private getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'pattern': '🎨',
      'structure': '🏗️',
      'coupling': '🔗',
      'scalability': '📈',
      'maintainability': '🔧'
    };

    return emojis[category] || '📋';
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

    return emojis[severity] || '';
  }
}
