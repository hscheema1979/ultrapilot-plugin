/**
 * Plan Command Agent Handler
 *
 * Responds to /plan command in issues/PRs:
 * - Creates implementation plan
 * - Breaks down tasks
 * - Estimates effort
 * - Identifies dependencies
 */

import { GitHubClient, Issue } from '../../github/client.js';
import { skillExecutor } from '../../execution/skill-executor.js';

export interface PlanResult {
  issueNumber: number;
  tasks: {
    title: string;
    description: string;
    effort: 'small' | 'medium' | 'large';
    dependencies: string[];
  }[];
  totalEstimate: string;
  risks: string[];
}

/**
 * Plan Command Agent Handler
 */
export class PlanCommandHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Handle /plan command in issue
   */
  async handlePlanCommand(issue: Issue): Promise<PlanResult> {
    console.log(`[PlanCommand] Creating plan for issue #${issue.number}`);

    // 1. Generate implementation plan
    const plan = await this.generatePlan(issue);
    console.log(`[PlanCommand] Generated ${plan.tasks.length} tasks`);

    // 2. Generate plan comment
    const comment = this.generatePlanComment(issue, plan);

    // 3. Post to GitHub
    await this.github.postComment(issue.number, comment);

    // 4. Apply label
    await this.github.addLabels(issue.number, ['planned']);

    return plan;
  }

  /**
   * Generate implementation plan
   */
  private async generatePlan(issue: Issue): Promise<PlanResult> {
    // Use AI to break down the issue into tasks
    const prompt = `
Break down this issue into implementation tasks. For each task provide:
1. Title (clear, actionable)
2. Description (what needs to be done)
3. Effort estimate (small/medium/large)
4. Dependencies (other tasks or prerequisites)

Issue: ${issue.title}
Body: ${issue.body || 'No description'}

Format each task as:
## Task: Title
Description: ...
Effort: ...
Dependencies: ...
`;

    const result = await skillExecutor.executeSkill('plan-command', {
      github: {
        owner: 'repository',
        repo: 'name',
        issueNumber: issue.number
      },
      params: { issue: issue.body }
    });

    const tasks: PlanResult['tasks'] = [];
    const risks: string[] = [];

    // Parse AI response
    if (result.success && result.output) {
      const taskBlocks = result.output.split('## Task:').filter(b => b.trim());

      for (const block of taskBlocks) {
        const lines = block.split('\n').filter(l => l.trim());

        const title = lines[0]?.trim() || 'Untitled Task';

        let description = '';
        let effort: PlanResult['tasks'][0]['effort'] = 'medium';
        const dependencies: string[] = [];

        for (const line of lines.slice(1)) {
          if (line.toLowerCase().startsWith('description:')) {
            description = line.replace(/description:/i, '').trim();
          } else if (line.toLowerCase().startsWith('effort:')) {
            const effortStr = line.replace(/effort:/i, '').trim().toLowerCase();
            if (effortStr.includes('small')) effort = 'small';
            else if (effortStr.includes('large')) effort = 'large';
          } else if (line.toLowerCase().startsWith('dependencies:')) {
            const deps = line.replace(/dependencies:/i, '').trim();
            if (deps) {
              dependencies.push(deps);
            }
          }
        }

        tasks.push({
          title,
          description,
          effort,
          dependencies
        });
      }
    }

    // If no tasks parsed, create a default task
    if (tasks.length === 0) {
      tasks.push({
        title: `Implement: ${issue.title}`,
        description: issue.body || 'No description provided',
        effort: 'medium',
        dependencies: []
      });
    }

    // Identify risks
    risks.push(...this.identifyRisks(tasks, issue));

    // Calculate total estimate
    const totalEstimate = this.calculateTotalEffort(tasks);

    return {
      issueNumber: issue.number,
      tasks,
      totalEstimate,
      risks
    };
  }

  /**
   * Identify risks in the plan
   */
  private identifyRisks(tasks: PlanResult['tasks'], issue: Issue): string[] {
    const risks: string[] = [];

    // Check for large tasks
    const largeTasks = tasks.filter(t => t.effort === 'large');
    if (largeTasks.length > 0) {
      risks.push(`${largeTasks.length} large tasks - consider breaking down further`);
    }

    // Check for complex dependencies
    const tasksWithDeps = tasks.filter(t => t.dependencies.length > 2);
    if (tasksWithDeps.length > 0) {
      risks.push('Complex task dependencies - consider parallelization');
    }

    // Check for missing details
    const vagueTasks = tasks.filter(t => t.description.length < 50);
    if (vagueTasks.length > 0) {
      risks.push('Some tasks lack detail - clarify requirements before starting');
    }

    return risks;
  }

  /**
   * Calculate total effort estimate
   */
  private calculateTotalEffort(tasks: PlanResult['tasks']): string {
    const effortMap = {
      'small': 1,
      'medium': 3,
      'large': 8
    };

    const totalDays = tasks.reduce((sum, task) => {
      return sum + (effortMap[task.effort] || 3);
    }, 0);

    if (totalDays <= 3) {
      return `${totalDays} day${totalDays > 1 ? 's' : ''} (small)`;
    } else if (totalDays <= 10) {
      return `${totalDays} days (medium)`;
    } else {
      return `${totalDays} days (large project)`;
    }
  }

  /**
   * Generate plan comment
   */
  private generatePlanComment(issue: Issue, plan: PlanResult): string {
    let comment = `## 📋 Implementation Plan\n\n`;
    comment += `**Issue**: #${issue.number} - ${issue.title}\n`;
    comment += `**Total Estimate**: ${plan.totalEstimate}\n\n`;

    comment += `### Tasks (${plan.tasks.length})\n\n`;

    // Group tasks by effort
    const byEffort = {
      'small': plan.tasks.filter(t => t.effort === 'small'),
      'medium': plan.tasks.filter(t => t.effort === 'medium'),
      'large': plan.tasks.filter(t => t.effort === 'large')
    };

    // List all tasks with checkboxes
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      const effortEmoji = this.getEffortEmoji(task.effort);

      comment += `#### ${i + 1}. ${task.title} ${effortEmoji}\n\n`;
      comment += `${task.description}\n\n`;

      if (task.dependencies.length > 0) {
        comment += `**Dependencies**: ${task.dependencies.join(', ')}\n\n`;
      }
    }

    // Risks section
    if (plan.risks.length > 0) {
      comment += `### ⚠️ Risks & Considerations\n\n`;
      plan.risks.forEach(risk => {
        comment += `- ${risk}\n`;
      });
      comment += `\n`;
    }

    // Summary section
    comment += `### Summary\n\n`;
    comment += `- **Total Tasks**: ${plan.tasks.length}\n`;
    comment += `- **Small Tasks**: ${byEffort.small.length}\n`;
    comment += `- **Medium Tasks**: ${byEffort.medium.length}\n`;
    comment += `- **Large Tasks**: ${byEffort.large.length}\n`;
    comment += `- **Estimated Effort**: ${plan.totalEstimate}\n`;

    comment += `\n---\n\n`;
    comment += `*📋 Planned by Ultrapilot Plan Command*`;

    return comment;
  }

  /**
   * Get effort emoji
   */
  private getEffortEmoji(effort: string): string {
    const emojis: Record<string, string> = {
      'small': '🟢',
      'medium': '🟡',
      'large': '🔴'
    };

    return emojis[effort] || '⚪';
  }
}
