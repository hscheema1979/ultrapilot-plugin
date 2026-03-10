/**
 * Repo Ask Agent Handler
 *
 * Answers questions about the repository:
 * - Explains code structure
 * - Describes patterns used
 * - Locates functionality
 * - Provides context
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface RepoAskResult {
  issueNumber: number;
  question: string;
  answer: string;
  references: string[];
  confidence: number;
}

/**
 * Repo Ask Agent Handler
 */
export class RepoAskHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle question about repository
   */
  async handleQuestion(issue: Issue, repoContext: any): Promise<RepoAskResult> {
    console.log(`[RepoAsk] Answering question in issue #${issue.number}`);

    // 1. Extract question from issue
    const question = this.extractQuestion(issue);

    // 2. Answer the question
    const answer = await this.answerQuestion(question, issue, repoContext);

    // 3. Generate answer comment
    const comment = this.generateAnswerComment(issue, answer);

    // 4. Post to GitHub
    await this.github.postComment(issue.number, comment);

    // 5. Close question if answered
    if (answer.confidence > 0.8) {
      await this.github.closeIssue(issue.number);
    }

    return answer;
  }

  /**
   * Extract question from issue
   */
  private extractQuestion(issue: Issue): string {
    // Remove common question prefixes
    const body = issue.body || '';

    const question = body
      .replace(/^question:\s*/i, '')
      .replace(/^ask:\s*/i, '')
      .replace(/^repo-ask\s*/i, '')
      .trim();

    return question || issue.title;
  }

  /**
   * Answer question using repo context
   */
  private async answerQuestion(question: string, issue: Issue, repoContext: any): Promise<RepoAskResult> {
    console.log(`[RepoAsk] Question: ${question}`);

    // Check for common question patterns
    const patterns = [
      {
        pattern: /how\s+(do|does|can|to)\s+.+?work/i,
        answer: 'This is explained in the README.',
        references: ['README.md']
      },
      {
        pattern: /where\s+is\s+(the\s+)?(.+?)(\s+located|\s+file|\s+code)?/i,
        answer: 'This functionality can be found in the source code.',
        references: ['src/']
      },
      {
        pattern: /what\s+(is|are)\s+(the\s+)?(.+?)(\s+pattern|\s+approach)?/i,
        answer: 'This pattern is documented in the code.',
        references: ['src/']
      }
    ];

    // Check if question matches a pattern
    for (const { pattern, answer, references } of patterns) {
      if (pattern.test(question)) {
        return {
          issueNumber: issue.number,
          question,
          answer,
          references,
          confidence: 0.7
        };
      }
    }

    // Use AI to answer
    return await this.answerWithAI(question, issue, repoContext);
  }

  /**
   * Use AI to answer question
   */
  private async answerWithAI(question: string, issue: Issue, repoContext: any): Promise<RepoAskResult> {
    const prompt = `
You are a repository expert. Answer this question about the codebase:

Question: ${question}

Context:
- Repository structure: ${JSON.stringify(repoContext.structure || {})}
- Available files: ${JSON.stringify(repoContext.files || [])}

Provide:
1. A clear, concise answer
2. Relevant file references (2-3 files)
3. Confidence level (high/medium/low)

Format:
Answer: [your answer]
References: [file1, file2, file3]
Confidence: [high/medium/low]
`;

    const result = await skillExecutor.executeSkill('repo-ask', {
      github: {
        owner: 'repository',
        repo: 'name',
        issueNumber: issue.number
      },
      params: { question, repoContext }
    });

    const answer = result.output || "I couldn't find a specific answer to your question.";
    const references: string[] = [];
    let confidence = 0.5;

    // Parse AI response
    if (result.success && result.output) {
      const lines = result.output.split('\n');

      for (const line of lines) {
        if (line.toLowerCase().startsWith('references:')) {
          const refs = line.replace(/references:/i, '').trim();
          refs.split(',').forEach(ref => references.push(ref.trim()));
        }
        if (line.toLowerCase().includes('confidence: high')) {
          confidence = 0.9;
        } else if (line.toLowerCase().includes('confidence: medium')) {
          confidence = 0.7;
        } else if (line.toLowerCase().includes('confidence: low')) {
          confidence = 0.5;
        }
      }
    }

    // If no references found, add some defaults
    if (references.length === 0) {
      references.push('README.md', 'src/');
    }

    return {
      issueNumber: issue.number,
      question,
      answer: answer.replace(/references:.*$/im, '').replace(/confidence:.*$/im, '').trim(),
      references,
      confidence
    };
  }

  /**
   * Generate answer comment
   */
  private generateAnswerComment(issue: Issue, answer: RepoAskResult): string {
    let comment = `## ❓ Repository Question\n\n`;
    comment += `**Question**: ${answer.question}\n\n`;
    comment += `**Answer**: ${answer.answer}\n\n`;

    if (answer.references.length > 0) {
      comment += `### References\n\n`;
      answer.references.forEach(ref => {
        comment += `- \`${ref}\`\n`;
      });
      comment += `\n`;
    }

    comment += `**Confidence**: ${this.getConfidenceBadge(answer.confidence)}\n\n`;

    if (answer.confidence < 0.7) {
      comment += `### ⚠️ Low Confidence\n\n`;
      comment += `This answer has low confidence. Please review the references and verify independently.\n\n`;
    }

    comment += `---\n\n`;
    comment += `*❓ Answered by Ultrapilot Repo Ask*`;

    return comment;
  }

  /**
   * Get confidence badge
   */
  private getConfidenceBadge(confidence: number): string {
    if (confidence >= 0.8) {
      return '🟢 High';
    } else if (confidence >= 0.6) {
      return '🟡 Medium';
    } else {
      return '🔴 Low';
    }
  }
}
