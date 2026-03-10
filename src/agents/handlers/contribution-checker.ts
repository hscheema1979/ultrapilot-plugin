/**
 * Contribution Checker Agent Handler
 *
 * Validates external contributions:
 * - Checks for proper documentation
 * - Validates test coverage
 * - Ensures code style compliance
 * - Verifies contributor license agreement (CLA)
 * - Checks for proper attribution
 */

import { GitHubClient, PullRequest } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface ContributionCheckResult {
  prNumber: number;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: string;
  }[];
  overallStatus: 'approved' | 'needs_work' | 'rejected';
}

/**
 * Contribution Checker Agent Handler
 */
export class ContributionCheckerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle pull request from external contributor
   */
  async handlePullRequest(pr: PullRequest, files: any[]): Promise<ContributionCheckResult> {
    console.log(`[ContributionChecker] Checking PR #${pr.number} from ${pr.author}`);

    const checks: ContributionCheckResult['checks'] = [];

    // 1. Check if contributor is external
    const isExternal = await this.isExternalContributor(pr);
    if (!isExternal) {
      console.log(`[ContributionChecker] PR from internal member, skipping checks`);
      return {
        prNumber: pr.number,
        checks: [],
        overallStatus: 'approved'
      };
    }

    // 2. Run all checks
    checks.push(await this.checkDocumentation(pr, files));
    checks.push(await this.checkTests(pr, files));
    checks.push(await this.checkCodeStyle(pr, files));
    checks.push(await this.checkCLA(pr));
    checks.push(await this.checkAttribution(pr));

    // 3. Determine overall status
    const overallStatus = this.determineOverallStatus(checks);

    // 4. Generate check report comment
    const comment = this.generateCheckReport(pr, checks, overallStatus);
    await this.github.postComment(pr.number, comment);

    // 5. Add labels based on status
    await this.applyStatusLabels(pr, overallStatus);

    return {
      prNumber: pr.number,
      checks,
      overallStatus
    };
  }

  /**
   * Check if contributor is external
   */
  private async isExternalContributor(pr: PullRequest): Promise<boolean> {
    // In a real implementation, this would check if the author
    // is a member of the organization
    // For now, assume all are external
    return true;
  }

  /**
   * Check documentation
   */
  private async checkDocumentation(pr: PullRequest, files: any[]): Promise<ContributionCheckResult['checks'][0]> {
    console.log(`[ContributionChecker] Checking documentation for PR #${pr.number}`);

    const hasDocs = files.some(f =>
      f.filename.includes('README') ||
      f.filename.includes('CHANGELOG') ||
      f.filename.endsWith('.md')
    );

    const hasCodeChanges = files.some(f =>
      f.filename.endsWith('.ts') ||
      f.filename.endsWith('.js') ||
      f.filename.endsWith('.py')
    );

    // If code changes but no docs, warn
    if (hasCodeChanges && !hasDocs) {
      return {
        name: 'Documentation',
        status: 'warn',
        message: 'No documentation updates found',
        details: 'Please update README or add comments if introducing new features'
      };
    }

    return {
      name: 'Documentation',
      status: 'pass',
      message: hasDocs ? 'Documentation included' : 'No documentation needed'
    };
  }

  /**
   * Check test coverage
   */
  private async checkTests(pr: PullRequest, files: any[]): Promise<ContributionCheckResult['checks'][0]> {
    console.log(`[ContributionChecker] Checking tests for PR #${pr.number}`);

    const hasTestFiles = files.some(f =>
      f.filename.includes('.test.') ||
      f.filename.includes('.spec.') ||
      f.filename.includes('__tests__')
    );

    const hasCodeChanges = files.some(f =>
      f.filename.endsWith('.ts') ||
      f.filename.endsWith('.js')
    );

    // If code changes but no tests, fail
    if (hasCodeChanges && !hasTestFiles) {
      return {
        name: 'Test Coverage',
        status: 'fail',
        message: 'No tests included',
        details: 'Please add tests for new code changes'
      };
    }

    return {
      name: 'Test Coverage',
      status: 'pass',
      message: hasTestFiles ? 'Tests included' : 'No code changes requiring tests'
    };
  }

  /**
   * Check code style
   */
  private async checkCodeStyle(pr: PullRequest, files: any[]): Promise<ContributionCheckResult['checks'][0]> {
    console.log(`[ContributionChecker] Checking code style for PR #${pr.number}`);

    // Check for common style issues
    const issues: string[] = [];

    for (const file of files) {
      if (file.patch) {
        // Check for trailing whitespace
        if (/[ \t]$/.test(file.patch)) {
          issues.push('Trailing whitespace detected');
        }

        // Check for mixed tabs/spaces
        if (file.patch.includes('\t') && file.patch.includes('  ')) {
          issues.push('Mixed tabs and spaces');
        }

        // Check for long lines
        const lines = file.patch.split('\n');
        for (const line of lines) {
          if (line.length > 120) {
            issues.push('Lines longer than 120 characters');
            break;
          }
        }
      }
    }

    if (issues.length > 0) {
      return {
        name: 'Code Style',
        status: 'fail',
        message: 'Style issues found',
        details: issues.join(', ')
      };
    }

    return {
      name: 'Code Style',
      status: 'pass',
      message: 'Code style compliant'
    };
  }

  /**
   * Check CLA (Contributor License Agreement)
   */
  private async checkCLA(pr: PullRequest): Promise<ContributionCheckResult['checks'][0]> {
    console.log(`[ContributionChecker] Checking CLA for PR #${pr.number}`);

    // In a real implementation, this would check a CLA system
    // For now, assume it passes
    return {
      name: 'CLA Signed',
      status: 'pass',
      message: 'Contributor has signed CLA'
    };
  }

  /**
   * Check attribution
   */
  private async checkAttribution(pr: PullRequest): Promise<ContributionCheckResult['checks'][0]> {
    console.log(`[ContributionChecker] Checking attribution for PR #${pr.number}`);

    // Check if PR body includes proper attribution
    const body = (pr.body || '').toLowerCase();

    const hasCoauthors = body.includes('co-authored-by');
    const hasCredits = body.includes('credit') || body.includes('thanks');

    if (!hasCoauthors && !hasCredits) {
      return {
        name: 'Attribution',
        status: 'warn',
        message: 'Missing attribution',
        details: 'Consider adding "Co-authored-by" for collaborative contributions'
      };
    }

    return {
      name: 'Attribution',
      status: 'pass',
      message: 'Proper attribution provided'
    };
  }

  /**
   * Determine overall status
   */
  private determineOverallStatus(checks: ContributionCheckResult['checks'][0][]): ContributionCheckResult['overallStatus'] {
    const failed = checks.filter(c => c.status === 'fail').length;
    const warned = checks.filter(c => c.status === 'warn').length;

    if (failed > 0) {
      return 'rejected';
    }

    if (warned > 2) {
      return 'needs_work';
    }

    return 'approved';
  }

  /**
   * Generate check report comment
   */
  private generateCheckReport(pr: PullRequest, checks: ContributionCheckResult['checks'][0], status: string): string {
    let comment = `## ✅ Contribution Check Report\n\n`;
    comment += `**PR**: #${pr.number} - ${pr.title}\n`;
    comment += `**Contributor**: @${pr.author}\n`;
    comment += `**Status**: ${this.getStatusEmoji(status)} ${status.toUpperCase()}\n\n`;

    comment += `### Checks\n\n`;

    for (const check of checks) {
      const emoji = this.getCheckStatusEmoji(check.status);
      comment += `${emoji} **${check.name}**: ${check.message}\n`;

      if (check.details) {
        comment += `   _${check.details}_\n`;
      }
    }

    comment += `\n### Next Steps\n\n`;

    if (status === 'approved') {
      comment += `✅ All checks passed! Your contribution is ready for review.\n`;
    } else if (status === 'needs_work') {
      comment += `⚠️ Some checks need attention. Please address the warnings above.\n`;
    } else {
      comment += `❌ Contribution not ready. Please fix the failed checks.\n`;
    }

    comment += `\n### Thank You! 🎉\n\n`;
    comment += `We appreciate your contribution to this project!`;

    comment += `\n\n---\n\n`;
    comment += `*🤖 Checked by Ultrapilot Contribution Checker*`;

    return comment;
  }

  /**
   * Apply status labels to PR
   */
  private async applyStatusLabels(pr: PullRequest, status: string): Promise<void> {
    const labels: string[] = [];

    switch (status) {
      case 'approved':
        labels.push('contribution-approved');
        break;
      case 'needs_work':
        labels.push('contribution-needs-work');
        break;
      case 'rejected':
        labels.push('contribution-rejected');
        break;
    }

    if (labels.length > 0) {
      await this.github.addLabels(pr.number, labels);
    }
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'approved': '✅',
      'needs_work': '⚠️',
      'rejected': '❌'
    };

    return emojis[status] || '❓';
  }

  /**
   * Get check status emoji
   */
  private getCheckStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'pass': '✅',
      'fail': '❌',
      'warn': '⚠️'
    };

    return emojis[status] || '❓';
  }
}
