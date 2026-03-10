/**
 * CI Coach Agent Handler
 *
 * Provides CI/CD improvement suggestions:
 * - Analyzes workflow configuration
 * - Suggests optimizations
 * - Recommends best practices
 * - Identifies security issues
 */

import { GitHubClient, WorkflowRun } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface CICoachRecommendations {
  runId: string;
  category: 'performance' | 'security' | 'reliability' | 'best-practices';
  recommendations: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * CI Coach Agent Handler
 */
export class CICoachHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle workflow run and provide coaching
   */
  async handleWorkflowRun(run: WorkflowRun, workflowContent: string): Promise<CICoachRecommendations> {
    console.log(`[CICoach] Coaching workflow run ${run.id}`);

    // 1. Analyze workflow
    const recommendations = await this.analyzeWorkflow(run, workflowContent);
    console.log(`[CICoach] Found ${recommendations.recommendations.length} recommendations`);

    // 2. Generate coaching comment
    const comment = this.generateCoachingComment(run, recommendations);

    // 3. Post to GitHub
    const runNumber = run.run_number || run.id;
    await this.github.postComment(
      runNumber,
      comment
    );

    return recommendations;
  }

  /**
   * Analyze workflow and generate recommendations
   */
  private async analyzeWorkflow(run: WorkflowRun, workflowContent: string): Promise<CICoachRecommendations> {
    const recommendations: string[] = [];
    let category: CICoachRecommendations['category'] = 'best-practices';
    let priority: CICoachRecommendations['priority'] = 'medium';

    // Check for caching
    if (!workflowContent.includes('actions/cache')) {
      recommendations.push('💡 Add dependency caching to speed up workflows');
      priority = 'high';
    }

    // Check for matrix builds
    if (!workflowContent.includes('matrix:')) {
      recommendations.push('💡 Consider using matrix builds to test across multiple versions');
      category = 'performance';
    }

    // Check for concurrency limits
    if (!workflowContent.includes('concurrency:')) {
      recommendations.push('💡 Add concurrency limits to prevent resource conflicts');
      category = 'reliability';
    }

    // Check for security best practices
    if (workflowContent.includes('permissions: read-all')) {
      recommendations.push('🔒 Use minimal permissions instead of `read-all` for better security');
      category = 'security';
      priority = 'high';
    }

    // Check for hardcoded secrets
    if (workflowContent.match(/password|api[_-]?key/i)) {
      recommendations.push('🔒 Ensure sensitive data is stored in GitHub Secrets, not in workflow files');
      category = 'security';
      priority = 'high';
    }

    // Check for timeout
    if (!workflowContent.includes('timeout-minutes:')) {
      recommendations.push('⏱️ Add `timeout-minutes` to prevent hanging workflows');
      category = 'reliability';
    }

    // Check for artifact uploads
    if (!workflowContent.includes('upload-artifact')) {
      recommendations.push('📦 Upload build artifacts for debugging failed runs');
      category = 'best-practices';
    }

    // If no recommendations found, use AI to analyze
    if (recommendations.length === 0) {
      const aiRecommendations = await this.analyzeWithAI(run, workflowContent);
      recommendations.push(...aiRecommendations);
    }

    return {
      runId: run.id,
      category,
      recommendations,
      priority
    };
  }

  /**
   * Use AI to analyze workflow
   */
  private async analyzeWithAI(run: WorkflowRun, workflowContent: string): Promise<string[]> {
    const prompt = `
Analyze this GitHub Actions workflow and provide 3-5 specific improvement recommendations.
Focus on: performance, security, reliability, or best practices.

Workflow name: ${run.name}
Workflow content:
${workflowContent.substring(0, 1500)}
`;

    const result = await skillExecutor.executeSkill('ci-coach', {
      github: {
        owner: 'repository',
        repo: 'name',
        runId: run.id
      },
      params: { workflow: workflowContent }
    });

    if (!result.success) {
      return ['Review workflow configuration for optimization opportunities'];
    }

    // Parse AI response for recommendations
    return result.output?.split('\n').filter(line => line.trim().length > 0) || [];
  }

  /**
   * Generate coaching comment
   */
  private generateCoachingComment(run: WorkflowRun, recommendations: CICoachRecommendations): string {
    let comment = `## 🎯 CI Coach Recommendations\n\n`;
    comment += `**Workflow**: ${run.name}\n`;
    comment += `**Category**: ${this.getCategoryEmoji(recommendations.category)} ${recommendations.category}\n`;
    comment += `**Priority**: ${this.getPriorityEmoji(recommendations.priority)} ${recommendations.priority}\n\n`;

    comment += `### Suggestions\n\n`;
    recommendations.recommendations.forEach((rec, index) => {
      comment += `${index + 1}. ${rec}\n`;
    });

    comment += `\n### Resources\n\n`;
    comment += `- [GitHub Actions Best Practices](https://docs.github.com/en/actions/learn-github-actions/best-practices-for-github-actions)\n`;
    comment += `- [Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)\n`;

    comment += `\n---\n\n*🤖 Coached by Ultrapilot CI Coach*`;

    return comment;
  }

  /**
   * Get category emoji
   */
  private getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'performance': '⚡',
      'security': '🔒',
      'reliability': '🛡️',
      'best-practices': '✨'
    };

    return emojis[category] || '💡';
  }

  /**
   * Get priority emoji
   */
  private getPriorityEmoji(priority: string): string {
    const emojis: Record<string, string> = {
      'high': '🔴',
      'medium': '🟡',
      'low': '🟢'
    };

    return emojis[priority] || '⚪';
  }
}
