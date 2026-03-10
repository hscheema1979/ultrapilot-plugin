/**
 * Duplicate Detector Agent Handler
 *
 * Detects duplicate issues and PRs:
 * - Finds similar titles
 * - Compares descriptions
 * - Suggests merging
 * - Links related items
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from './skill-executor.js';

export interface DuplicateDetection {
  issueNumber: number;
  duplicates: {
    number: number;
    title: string;
    similarity: number;
    url: string;
  }[];
  action: 'mark_duplicate' | 'link_related' | 'none';
  confidence: number;
}

/**
 * Duplicate Detector Agent Handler
 */
export class DuplicateDetectorHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Check if issue is a duplicate
   */
  async checkDuplicates(issue: Issue): Promise<DuplicateDetection> {
    console.log(`[DuplicateDetector] Checking for duplicates of issue #${issue.number}`);

    // 1. Fetch all issues
    const allIssues = await this.github.getIssues();

    // 2. Filter out the current issue
    const otherIssues = allIssues.filter(i => i.number !== issue.number);

    // 3. Find potential duplicates
    const duplicates = await this.findDuplicates(issue, otherIssues);

    // 4. Determine action
    const { action, confidence } = this.determineAction(duplicates);

    // 5. Take action
    if (action === 'mark_duplicate' && confidence > 0.8) {
      await this.markAsDuplicate(issue, duplicates[0]);
    } else if (action === 'link_related' && duplicates.length > 0) {
      await this.linkRelatedIssues(issue, duplicates);
    }

    // 6. Post detection comment
    const comment = this.generateDetectionComment(issue, duplicates, action, confidence);
    await this.github.postComment(issue.number, comment);

    return {
      issueNumber: issue.number,
      duplicates,
      action,
      confidence
    };
  }

  /**
   * Find potential duplicates
   */
  private async findDuplicates(issue: Issue, candidates: Issue[]): Promise<DuplicateDetection['duplicates']> {
    const duplicates: DuplicateDetection['duplicates'] = [];

    for (const candidate of candidates) {
      // Calculate similarity
      const titleSimilarity = this.calculateStringSimilarity(issue.title, candidate.title);
      const bodySimilarity = this.calculateBodySimilarity(issue.body || '', candidate.body || '');

      // Overall similarity (weighted)
      const overallSimilarity = (titleSimilarity * 0.7) + (bodySimilarity * 0.3);

      // If similarity is above threshold, it's a potential duplicate
      if (overallSimilarity > 0.5) {
        duplicates.push({
          number: candidate.number,
          title: candidate.title,
          similarity: overallSimilarity,
          url: candidate.html_url
        });
      }
    }

    // Sort by similarity (highest first)
    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Exact match
    if (s1 === s2) return 1.0;

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;

    // Simple word overlap
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate body similarity
   */
  private calculateBodySimilarity(body1: string, body2: string): number {
    if (!body1 || !body2) return 0;

    // Compare first 500 chars
    const s1 = body1.substring(0, 500).toLowerCase();
    const s2 = body2.substring(0, 500).toLowerCase();

    return this.calculateStringSimilarity(s1, s2);
  }

  /**
   * Determine action based on duplicates
   */
  private determineAction(duplicates: DuplicateDetection['duplicates']): {
    action: DuplicateDetection['action'];
    confidence: number;
  } {
    if (duplicates.length === 0) {
      return { action: 'none', confidence: 0 };
    }

    const topDuplicate = duplicates[0];

    if (topDuplicate.similarity > 0.85) {
      return { action: 'mark_duplicate', confidence: topDuplicate.similarity };
    }

    if (topDuplicate.similarity > 0.6) {
      return { action: 'link_related', confidence: topDuplicate.similarity };
    }

    return { action: 'none', confidence: topDuplicate.similarity };
  }

  /**
   * Mark issue as duplicate
   */
  private async markAsDuplicate(issue: Issue, duplicate: DuplicateDetection['duplicates'][0]): Promise<void> {
    console.log(`[DuplicateDetector] Marking issue #${issue.number} as duplicate of #${duplicate.number}`);

    // Add duplicate label
    await this.github.addLabels(issue.number, ['duplicate']);

    // Post comment linking to original
    const comment = `This issue has been marked as a duplicate of #${duplicate.number}.\n\n` +
      `Please continue the discussion there.`;

    await this.github.postComment(issue.number, comment);

    // Close the duplicate issue
    await this.github.closeIssue(issue.number);
  }

  /**
   * Link related issues
   */
  private async linkRelatedIssues(issue: Issue, duplicates: DuplicateDetection['duplicates']): Promise<void> {
    console.log(`[DuplicateDetector] Linking #${issue.number} to related issues`);

    const comment = `This issue may be related to:\n\n` +
      duplicates
        .filter(d => d.similarity > 0.6)
        .map(d => `- #${d.number} (${Math.round(d.similarity * 100)}% similar)`)
        .join('\n');

    await this.github.postComment(issue.number, comment);

    // Add related label
    await this.github.addLabels(issue.number, ['related']);
  }

  /**
   * Generate detection comment
   */
  private generateDetectionComment(
    issue: Issue,
    duplicates: DuplicateDetection['duplicates'],
    action: string,
    confidence: number
  ): string {
    let comment = `## 🔍 Duplicate Detection\n\n`;
    comment += `**Issue**: #${issue.number} - ${issue.title}\n`;
    comment += `**Action**: ${action}\n`;
    comment += `**Confidence**: ${Math.round(confidence * 100)}%\n\n`;

    if (duplicates.length > 0) {
      comment += `### Similar Issues Found\n\n`;

      for (const dup of duplicates.slice(0, 5)) {
        comment += `- **#${dup.number}** (${Math.round(dup.similarity * 100)}% similar)\n`;
        comment += `  ${dup.title}\n`;
      }

      if (action === 'mark_duplicate') {
        comment += `\nThis issue has been marked as a duplicate of #${duplicates[0].number}.\n`;
      }
    } else {
      comment += `### No Duplicates Found\n\n`;
      comment += `This issue appears to be unique.\n`;
    }

    comment += `\n---\n\n`;
    comment += `*🔍 Detected by Ultrapilot Duplicate Detector*`;

    return comment;
  }
}
