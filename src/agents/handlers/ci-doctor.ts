/**
 * CI Doctor Agent Handler
 *
 * Diagnoses CI/CD failures:
 * - Analyzes workflow run logs
 * - Identifies failure patterns
 * - Suggests fixes
 * - Provides remediation steps
 */

import { GitHubClient, WorkflowRun } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface CIDiagnosis {
  runId: string;
  status: 'pass' | 'fail' | 'flaky';
  failureType?: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

/**
 * CI Doctor Agent Handler
 */
export class CIDoctorHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle workflow run failure
   */
  async handleWorkflowFailure(run: WorkflowRun, logs: string): Promise<CIDiagnosis> {
    console.log(`[CIDoctor] Diagnosing workflow run ${run.id}`);

    // 1. Analyze failure pattern
    const diagnosis = await this.diagnoseFailure(run, logs);
    console.log(`[CIDoctor] Diagnosis: ${diagnosis.rootCause}`);

    // 2. Generate diagnostic comment
    const comment = this.generateDiagnosticComment(run, diagnosis);

    // 3. Post to GitHub
    const runNumber = run.run_number || run.id;
    await this.github.postComment(
      runNumber,
      comment
    );

    return diagnosis;
  }

  /**
   * Diagnose failure from logs
   */
  private async diagnoseFailure(run: WorkflowRun, logs: string): Promise<CIDiagnosis> {
    // Check for common failure patterns
    const patterns = [
      { pattern: /npm ERR!/i, type: 'npm_install_error', fix: 'Run `npm ci` to clean install dependencies' },
      { pattern: /Cannot find module/i, type: 'missing_module', fix: 'Install missing dependencies' },
      { pattern: /Test failed/i, type: 'test_failure', fix: 'Review and fix failing tests' },
      { pattern: /Build failed/i, type: 'build_error', fix: 'Fix build errors in code' },
      { pattern: /timeout/i, type: 'timeout', fix: 'Increase timeout or optimize workflow' },
      { pattern: /permission denied/i, type: 'permissions', fix: 'Check workflow permissions' },
      { pattern: /ECONNREFUSED/i, type: 'network', fix: 'Check network connectivity and service availability' }
    ];

    for (const { pattern, type, fix } of patterns) {
      if (pattern.test(logs)) {
        return {
          runId: run.id,
          status: 'fail',
          failureType: type,
          rootCause: `Detected ${type.replace('_', ' ')}`,
          suggestedFix: fix,
          confidence: 0.85
        };
      }
    }

    // If no pattern matched, use AI to analyze
    const analysis = await this.analyzeWithAI(run, logs);

    return {
      runId: run.id,
      status: 'fail',
      failureType: 'unknown',
      rootCause: analysis.rootCause,
      suggestedFix: analysis.suggestedFix,
      confidence: 0.75
    };
  }

  /**
   * Use AI to analyze failure
   */
  private async analyzeWithAI(run: WorkflowRun, logs: string): Promise<{ rootCause: string; suggestedFix: string }> {
    const prompt = `
Analyze this CI/CD failure and provide:
1. Root cause (1 sentence)
2. Suggested fix (1-2 sentences)

Workflow: ${run.name}
Status: ${run.conclusion}
Logs (excerpt):
${logs.substring(0, 2000)}
`;

    const result = await skillExecutor.executeSkill('ci-doctor', {
      github: {
        owner: 'repository',
        repo: 'name',
        runId: run.id
      },
      params: { logs }
    });

    if (!result.success) {
      return {
        rootCause: 'Unable to determine root cause automatically',
        suggestedFix: 'Review workflow logs manually for detailed error information'
      };
    }

    // Parse AI response (simplified)
    const lines = result.output?.split('\n') || [];
    return {
      rootCause: lines[0] || 'Unknown cause',
      suggestedFix: lines[1] || 'Review logs for more details'
    };
  }

  /**
   * Generate diagnostic comment
   */
  private generateDiagnosticComment(run: WorkflowRun, diagnosis: CIDiagnosis): string {
    let comment = `## 🩺 CI Doctor Diagnosis\n\n`;
    comment += `**Workflow**: ${run.name}\n`;
    comment += `**Run ID**: ${diagnosis.runId}\n`;
    comment += `**Status**: ${this.getStatusEmoji(diagnosis.status)} ${diagnosis.status}\n\n`;

    if (diagnosis.failureType) {
      comment += `**Failure Type**: \`${diagnosis.failureType}\`\n\n`;
    }

    comment += `### Root Cause\n\n`;
    comment += `${diagnosis.rootCause}\n\n`;

    comment += `### Suggested Fix\n\n`;
    comment += `${diagnosis.suggestedFix}\n\n`;

    comment += `### Next Steps\n\n`;
    comment += `1. Review the [workflow logs](${run.html_url}) for full details\n`;
    comment += `2. Apply the suggested fix\n`;
    comment += `3. Push changes to trigger a new run\n`;

    comment += `\n---\n\n*🤖 Diagnosed by Ultrapilot CI Doctor*`;

    return comment;
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'pass': '✅',
      'fail': '❌',
      'flaky': '⚠️'
    };

    return emojis[status] || '❓';
  }
}
