/**
 * Discussion Miner Agent Handler
 *
 * Extracts insights from discussions:
 * - Identifies common themes
 * - Extracts feature requests
 * - Finds pain points
 * - Summarizes feedback
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface DiscussionInsights {
  period: string;
  totalDiscussions: number;
  themes: {
    name: string;
    count: number;
    examples: string[];
  }[];
  featureRequests: string[];
  painPoints: string[];
  summary: string;
}

/**
 * Discussion Miner Agent Handler
 */
export class DiscussionMinerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Mine discussions for insights
   */
  async mineDiscussions(days: number = 7): Promise<DiscussionInsights> {
    console.log(`[DiscussionMiner] Mining discussions from last ${days} days`);

    // 1. Fetch discussions from GitHub
    const issues = await this.github.getIssues();

    // 2. Filter discussions (issues with 'discussion' label)
    const discussions = issues.filter(i =>
      i.labels.some(l => l.name.toLowerCase() === 'discussion')
    );

    // 3. Extract insights
    const insights = await this.extractInsights(discussions, days);

    // 4. Generate insights report
    const comment = this.generateInsightsComment(insights);

    // 5. Post to tracking issue
    const trackingIssueNumber = await this.findOrCreateTrackingIssue();
    await this.github.postComment(trackingIssueNumber, comment);

    return insights;
  }

  /**
   * Extract insights from discussions
   */
  private async extractInsights(discussions: Issue[], days: number): Promise<DiscussionInsights> {
    const themes: DiscussionInsights['themes'] = [];
    const featureRequests: string[] = [];
    const painPoints: string[] = [];

    // Analyze each discussion
    for (const discussion of discussions) {
      const content = `${discussion.title}\n\n${discussion.body || ''}`.toLowerCase();

      // Check for feature request patterns
      if (this.matchesKeywords(content, ['feature', 'request', 'would be nice', 'wish'])) {
        featureRequests.push(discussion.title);
      }

      // Check for pain points
      if (this.matchesKeywords(content, ['frustrating', 'difficult', 'confusing', 'problem', 'struggle'])) {
        painPoints.push(discussion.title);
      }

      // Extract themes using AI
      const themesFromAI = await this.extractThemes(discussion);
      themes.push(...themesFromAI);
    }

    // Aggregate themes
    const aggregatedThemes = this.aggregateThemes(themes);

    // Generate summary using AI
    const summary = await this.generateSummary(discussions);

    return {
      period: `Last ${days} days`,
      totalDiscussions: discussions.length,
      themes: aggregatedThemes.slice(0, 5),
      featureRequests: featureRequests.slice(0, 10),
      painPoints: painPoints.slice(0, 10),
      summary
    };
  }

  /**
   * Extract themes from discussion using AI
   */
  private async extractThemes(discussion: Issue): Promise<DiscussionInsights['themes']> {
    const prompt = `
Extract the main themes from this discussion. Return 2-3 themes.

Title: ${discussion.title}
Body: ${discussion.body?.substring(0, 500)}

Format:
Theme 1: theme name
Theme 2: theme name
`;

    const result = await skillExecutor.executeSkill('discussion-miner', {
      github: {
        owner: 'repository',
        repo: 'name',
        issueNumber: discussion.number
      },
      params: { discussion: discussion.body }
    });

    const themes: DiscussionInsights['themes'] = [];

    if (result.success && result.output) {
      const lines = result.output.split('\n').filter(l => l.toLowerCase().includes('theme'));

      for (const line of lines) {
        const themeName = line.replace(/theme\s*\d*:\s*/i, '').trim();
        if (themeName) {
          themes.push({
            name: themeName,
            count: 1,
            examples: [discussion.title]
          });
        }
      }
    }

    return themes;
  }

  /**
   * Aggregate similar themes
   */
  private aggregateThemes(themes: DiscussionInsights['themes']): DiscussionInsights['themes'] {
    const aggregated: Record<string, DiscussionInsights['themes'][0]> = {};

    for (const theme of themes) {
      const key = theme.name.toLowerCase();

      if (!aggregated[key]) {
        aggregated[key] = {
          name: theme.name,
          count: 0,
          examples: []
        };
      }

      aggregated[key].count += theme.count;
      aggregated[key].examples.push(...theme.examples);
    }

    // Convert to array and sort by count
    return Object.values(aggregated)
      .sort((a, b) => b.count - a.count)
      .map(theme => ({
        ...theme,
        examples: [...new Set(theme.examples)] // Dedupe
      }));
  }

  /**
   * Generate summary using AI
   */
  private async generateSummary(discussions: Issue[]): Promise<string> {
    if (discussions.length === 0) {
      return 'No discussions to summarize.';
    }

    const prompt = `
Summarize these community discussions in 2-3 sentences.

Discussions:
${discussions.map(d => `- ${d.title}`).join('\n')}
`;

    const result = await skillExecutor.executeSkill('discussion-miner', {
      github: {
        owner: 'repository',
        repo: 'name'
      },
      params: { discussions: discussions.map(d => d.title).join('\n') }
    });

    return result.success && result.output
      ? result.output
      : `Analyzed ${discussions.length} community discussions.`;
  }

  /**
   * Find or create tracking issue
   */
  private async findOrCreateTrackingIssue(): Promise<number> {
    // In a real implementation, this would search for or create a tracking issue
    return 1;
  }

  /**
   * Generate insights comment
   */
  private generateInsightsComment(insights: DiscussionInsights): string {
    let comment = `## 💬 Discussion Insights\n\n`;
    comment += `**Period**: ${insights.period}\n`;
    comment += `**Total Discussions**: ${insights.totalDiscussions}\n\n`;

    comment += `### Summary\n\n`;
    comment += `${insights.summary}\n\n`;

    if (insights.themes.length > 0) {
      comment += `### 🔥 Top Themes\n\n`;

      for (const theme of insights.themes) {
        comment += `**${theme.name}** (${theme.count} mentions)\n`;
        if (theme.examples.length > 0) {
          comment += `- ${theme.examples[0]}\n`;
        }
      }

      comment += `\n`;
    }

    if (insights.featureRequests.length > 0) {
      comment += `### ✨ Feature Requests\n\n`;

      for (const request of insights.featureRequests.slice(0, 5)) {
        comment += `- ${request}\n`;
      }

      comment += `\n`;
    }

    if (insights.painPoints.length > 0) {
      comment += `### 😣 Pain Points\n\n`;

      for (const pain of insights.painPoints.slice(0, 5)) {
        comment += `- ${pain}\n`;
      }

      comment += `\n`;
    }

    comment += `---\n\n`;
    comment += `*💬 Mined by Ultrapilot Discussion Miner*`;

    return comment;
  }

  /**
   * Check if content matches keywords
   */
  private matchesKeywords(content: string, keywords: string[]): boolean {
    return keywords.some(keyword => content.includes(keyword));
  }
}
