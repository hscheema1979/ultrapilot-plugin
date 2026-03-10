/**
 * GitHub Integration for UltraPilot
 *
 * This module provides the complete integration between GitHub and UltraPilot,
 * where GitHub issues trigger autonomous workflows with full audit logging.
 *
 * Key principles:
 * - GitHub is the single source of truth
 * - All state, decisions, and progress logged in GitHub
 * - Autonomous execution with GitHub webhook triggers
 * - Full audit trail via GitHub comments and commits
 */

import { EventEmitter } from 'events';
import { Octokit } from 'octokit';

/**
 * GitHub issue hierarchy levels
 */
export enum IssueLevel {
  MEGA_PROJECT = 'mega-project',
  PROJECT = 'project',
  WORKFLOW = 'workflow',
  COMPOUND_TASK = 'compound-task',
  ATOMIC_TASK = 'atomic-task'
}

/**
 * Phase labels
 */
export enum PhaseLabel {
  STEP_0_5 = 'step-0.5',
  PHASE_0 = 'phase:0',
  PHASE_1 = 'phase:1',
  PHASE_1_5 = 'phase:1.5',
  PHASE_2 = 'phase:2',
  PHASE_3 = 'phase:3',
  PHASE_4 = 'phase:4',
  PHASE_5 = 'phase:5',
  DONE = 'phase:done'
}

/**
 * Size labels
 */
export enum SizeLabel {
  XS = 'size:xs',
  S = 'size:s',
  M = 'size:m',
  L = 'size:l',
  XL = 'size:xl',
  XXL = 'size:xxl'
}

/**
 * Status labels
 */
export enum StatusLabel {
  TODO = 'status:todo',
  IN_PROGRESS = 'status:in-progress',
  REVIEW = 'status:review',
  QA = 'status:qa',
  VALIDATION = 'status:validation',
  COMPLETE = 'status:complete',
  FAILED = 'status:failed'
}

/**
 * GitHub integration configuration
 */
export interface GitHubIntegrationConfig {
  token: string;
  owner: string;
  repo: string;
  apiBaseUrl?: string;
  webhookSecret?: string;
}

/**
 * Issue data
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
  assignees: string[];
  repository: string;
  owner: string;
}

/**
 * Sizing result
 */
export interface SizingResult {
  agent: string;
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  reasoning: string;
  taskCount: number;
  estimatedDuration: string;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  agent: string;
  model: string;
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  gitCommit: string;
  duration: number;
}

/**
 * Review result
 */
export interface ReviewResult {
  reviewer: string;
  status: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED';
  issues: {
    critical: string[];
    high: string[];
    medium: string[];
    low: string[];
  };
  feedback: string;
}

/**
 * GitHub Integration class
 */
export class GitHubIntegration extends EventEmitter {
  private octokit: Octokit;
  private config: GitHubIntegrationConfig;
  private webhookHandler: any;

  constructor(config: GitHubIntegrationConfig) {
    super();

    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.apiBaseUrl
    });

    this.setupWebhookHandler();
  }

  /**
   * Setup webhook handler for GitHub events
   */
  private setupWebhookHandler(): void {
    // This would typically be done with express and github-webhook middleware
    // For now, we'll provide methods that can be called manually
    console.log('[GitHubIntegration] Webhook handler ready');
  }

  /**
   * Handle issue opened event
   */
  async handleIssueOpened(issue: GitHubIssue): Promise<void> {
    console.log(`[GitHubIntegration] Issue opened: #${issue.number} - ${issue.title}`);

    // Check if this is a feature request for UltraPilot
    if (this.isFeatureRequest(issue)) {
      console.log('[GitHubIntegration] Feature request detected, triggering STEP 0.5: Multi-Agent Task Sizing');
      await this.triggerTaskSizing(issue);
    }
  }

  /**
   * Handle issue labeled event
   */
  async handleIssueLabeled(issue: GitHubIssue, label: string): Promise<void> {
    console.log(`[GitHubIntegration] Issue labeled: #${issue.number} - ${label}`);

    // If labeled "ready", start UltraPilot workflow
    if (label === 'ready') {
      console.log('[GitHubIntegration] Issue marked ready, starting UltraPilot workflow');
      await this.triggerUltraPilotWorkflow(issue);
    }
  }

  /**
   * Check if issue is a feature request
   */
  private isFeatureRequest(issue: GitHubIssue): boolean {
    return issue.labels.some(l =>
      l === 'mega-project' ||
      l === 'project' ||
      l === 'feature-request'
    );
  }

  /**
   * Trigger STEP 0.5: Multi-Agent Task Sizing
   */
  async triggerTaskSizing(issue: GitHubIssue): Promise<void> {
    console.log(`[GitHubIntegration] Starting task sizing for issue #${issue.number}`);

    // Create sizing issue
    const sizingIssue = await this.createIssue({
      title: `[Sizing] ${issue.title}`,
      body: 'Running multi-agent task sizing...',
      labels: ['sizing', 'step-0.5']
    });

    // Emit event for UltraPilot to spawn sizing agents
    this.emit('sizing:requested', {
      issueNumber: issue.number,
      title: issue.title,
      description: issue.body,
      repository: issue.repository,
      owner: issue.owner,
      sizingIssueNumber: sizingIssue.number
    });
  }

  /**
   * Post sizing result to GitHub
   */
  async postSizingResult(
    sizingIssueNumber: number,
    result: SizingResult
  ): Promise<void> {
    const comment = `**Agent:** ${result.agent}\n` +
      `**Model:** Opus\n` +
      `**Size Estimate:** ${result.size}\n\n` +
      `**Reasoning:**\n${result.reasoning}\n\n` +
      `**Breakdown:**\n` +
      `- Task count: ${result.taskCount}\n` +
      `- Estimated duration: ${result.estimatedDuration}`;

    await this.createComment(sizingIssueNumber, comment);
  }

  /**
   * Aggregate sizing results and reach consensus
   */
  async aggregateSizingResults(
    issueNumber: number,
    sizingIssueNumber: number,
    results: SizingResult[]
  ): Promise<{ size: string; consensus: boolean }> {
    // Count size votes
    const sizeCounts = results.reduce((acc, result) => {
      acc[result.size] = (acc[result.size] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Reach consensus (use safest size if disagreement)
    const sizeOrder = ['XXL', 'XL', 'L', 'M', 'S', 'XS'];
    let consensusSize = 'M';
    let maxCount = 0;

    for (const size of sizeOrder) {
      if (sizeCounts[size] > maxCount) {
        maxCount = sizeCounts[size];
        consensusSize = size;
      }
    }

    // Check if unanimous
    const unanimous = maxCount === results.length;

    // Update sizing issue
    await this.updateIssue(sizingIssueNumber, {
      state: 'closed',
      labels: ['sizing', 'complete', `size:${consensusSize.toLowerCase()}`]
    });

    // Update original issue
    const issue = await this.getIssue(issueNumber);
    await this.updateIssue(issueNumber, {
      labels: [...issue.labels, `size:${consensusSize.toLowerCase()}`]
    });

    // Create comment with consensus
    await this.createComment(issueNumber, `
## Task Sizing Complete

**Consensus Size:** ${consensusSize}
**Unanimous:** ${unanimous ? 'Yes' : 'No (used safest size)'}

### Sizing Results
${results.map(r => `- **${r.agent}**: ${r.size}`).join('\n')}

### Next Steps
${this.getNextStepsForSize(consensusSize)}
    `);

    return { size: consensusSize, consensus: unanimous };
  }

  /**
   * Get next steps based on size
   */
  private getNextStepsForSize(size: string): string {
    switch (size) {
      case 'XXL':
        return 'Decomposing into 5 sub-projects...\nEach sub-project will run independently.';
      case 'XL':
      case 'L':
        return 'Entering PLAN-ONLY MODE...\nRunning Phases 0-1, then decomposing into workflows.';
      default:
        return 'Proceeding to Phase 0 (Requirements + Architecture)...';
    }
  }

  /**
   * Decompose XXL issue into projects
   */
  async decomposeIntoProjects(
    issue: GitHubIssue,
    projects: Array<{ name: string; domain: string }>
  ): Promise<number[]> {
    console.log(`[GitHubIntegration] Decomposing issue #${issue.number} into ${projects.length} projects`);

    const projectIssues = [];

    for (const project of projects) {
      const projectIssue = await this.createIssue({
        title: `[Project] ${project.name}`,
        body: `
Sub-project of: #${issue.number}

## Scope
${project.name}

## Size
Estimated: L (30-50 tasks, 4-6 hours)

## Dependencies
Depends on: #${issue.number}

## Next Steps
1. Run multi-agent task sizing for this project
2. Decompose into workflows
3. Create workflow issues
        `,
        labels: ['project', 'size:l', `domain:${project.domain}`]
      });

      projectIssues.push(projectIssue);

      // Link to parent issue
      await this.createComment(issue.number, `Created sub-project: #${projectIssue.number} - ${project.name}`);
    }

    // Create GitHub Project Board
    const projectBoard = await this.createProjectBoard('Relay Web UI Mega-Project');

    // Add columns
    const columns = ['Backlog', 'Planning', 'In Progress', 'QA', 'Complete'];
    const columnIds = [];

    for (const column of columns) {
      const columnData = await this.createProjectColumn(projectBoard.id, column);
      columnIds.push({ name: column, id: columnData.id });
    }

    // Add all project issues to the board
    const backlogColumn = columnIds.find(c => c.name === 'Backlog');
    if (backlogColumn) {
      for (const projectIssue of projectIssues) {
        await this.addProjectCard(backlogColumn.id, projectIssue.id);
      }
    }

    // Update parent issue
    await this.updateIssue(issue.number, {
      labels: [...issue.labels, 'decomposed'],
      body: `${issue.body}\n\n## Decomposition\nCreated ${projectIssues.length} sub-projects:\n${projectIssues.map(p => `- #${p.number}: ${p.title}`).join('\n')}`
    });

    return projectIssues.map(p => p.number);
  }

  /**
   * Trigger UltraPilot workflow for an issue
   */
  async triggerUltraPilotWorkflow(issue: GitHubIssue): Promise<void> {
    console.log(`[GitHubIntegration] Starting UltraPilot workflow for issue #${issue.number}`);

    // Emit event for UltraPilot to start
    this.emit('workflow:requested', {
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body,
      repository: issue.repository,
      owner: issue.owner,
      labels: issue.labels
    });
  }

  /**
   * Update issue with phase progress
   */
  async updatePhaseProgress(
    issueNumber: number,
    phase: string,
    status: string,
    data?: any
  ): Promise<void> {
    const comment = `## Phase ${phase}: ${status}\n\n` +
      (data ? `**Details:**\n${JSON.stringify(data, null, 2)}` : '');

    await this.createComment(issueNumber, comment);
  }

  /**
   * Post agent execution result
   */
  async postAgentExecutionResult(
    issueNumber: number,
    result: AgentExecutionResult
  ): Promise<void> {
    const comment = `## ⚡ Task Execution Complete\n\n` +
      `**Agent:** ${result.agent}\n` +
      `**Model:** ${result.model}\n` +
      `**Duration:** ${result.duration}ms\n\n` +
      `### Output\n\`\`\`\n${result.output}\n\`\`\`\n\n` +
      `### Files Modified\n${result.filesModified.map(f => `- ${f}`).join('\n')}\n\n` +
      `### Files Created\n${result.filesCreated.map(f => `- ${f}`).join('\n')}\n\n` +
      `### Git Commit\n\`\`\`\nCommit: ${result.gitCommit}\n\`\`\``;

    await this.createComment(issueNumber, comment);
  }

  /**
   * Post review result
   */
  async postReviewResult(
    issueNumber: number,
    result: ReviewResult
  ): Promise<void> {
    const issues = result.issues;

    const comment = `**Agent:** ${result.reviewer}\n` +
      `**Model:** Sonnet\n` +
      `**Review:** Plan Review\n` +
      `**Status:** ${result.status}\n\n` +
      `### Issues Found\n` +
      `- **Critical:** ${issues.critical.length}\n` +
      `- **High:** ${issues.high.length}\n` +
      `- **Medium:** ${issues.medium.length}\n` +
      `- **Low:** ${issues.low.length}\n\n` +
      (issues.critical.length > 0 || issues.high.length > 0 ?
        `### Critical Issues\n${issues.critical.map(i => `- ${i}`).join('\n')}\n\n` +
        `### High Priority Issues\n${issues.high.map(i => `- ${i}`).join('\n')}\n\n` :
        '') +
      `### Approval Status\n` +
      `${result.status === 'APPROVED' ? '✅' : '❌'} ${result.status}`;

    await this.createComment(issueNumber, comment);
  }

  /**
   * Post QA cycle result
   */
  async postQACycleResult(
    issueNumber: number,
    cycleNumber: number,
    results: {
      buildSuccess: boolean;
      buildLog: string;
      lintSuccess: boolean;
      lintLog: string;
      testSuccess: boolean;
      testLog: string;
      testCount: { passing: number; total: number };
    }
  ): Promise<void> {
    const comment = `## 🧪 QA Cycle ${cycleNumber} Results\n\n` +
      `### Build\n${results.buildSuccess ? '✅ PASSED' : '❌ FAILED'}\n\`\`\`\n${results.buildLog}\n\`\`\`\n\n` +
      `### Lint\n${results.lintSuccess ? '✅ PASSED' : '❌ FAILED'}\n\`\`\`\n${results.lintLog}\n\`\`\`\n\n` +
      `### Tests\n${results.testSuccess ? '✅ PASSED' : '❌ FAILED'}\n\`\`\`\n${results.testLog}\n\`\`\`\n\n` +
      `**Tests:** ${results.testCount.passing}/${results.testCount.total} passing\n\n` +
      `### Conclusion\n` +
      `${results.buildSuccess && results.lintSuccess && results.testSuccess ?
        '✅ All checks passed - Ready for validation' :
        '❌ Some checks failed - Fixing and retrying...'}`;

    await this.createComment(issueNumber, comment);
  }

  /**
   * Post verification result
   */
  async postVerificationResult(
    issueNumber: number,
    results: {
      buildSuccess: boolean;
      buildLog: string;
      testSuccess: boolean;
      testLog: string;
      testCount: { passing: number; total: number };
      gitCommit: string;
      gitBranch: string;
    }
  ): Promise<void> {
    const comment = `## ✅ Verification Complete\n\n` +
      `### Build\n${results.buildSuccess ? '✅ SUCCESS' : '❌ FAILED'}\n\`\`\`\n${results.buildLog}\n\`\`\`\n\n` +
      `### Tests\n${results.testSuccess ? '✅ SUCCESS' : '❌ FAILED'}\n\`\`\`\n${results.testLog}\n\`\`\`\n\n` +
      `**Tests:** ${results.testCount.passing}/${results.testCount.total} passing\n\n` +
      `### Git Information\n` +
      `- **Commit:** ${results.gitCommit}\n` +
      `- **Branch:** ${results.gitBranch}\n\n` +
      `### Conclusion\n` +
      `${results.buildSuccess && results.testSuccess ?
        '✅ VERIFICATION PASSED - All evidence collected' :
        '❌ VERIFICATION FAILED - Check logs'}`;

    await this.createComment(issueNumber, comment);
  }

  /**
   * Mark workflow complete
   */
  async markWorkflowComplete(
    issueNumber: number,
    result: {
      duration: number;
      filesCreated: string[];
      filesModified: string[];
      testsPassed: number;
      buildSuccess: boolean;
      validationResults: any;
      verificationResults: any;
      gitCommit: string;
      gitBranch: string;
    }
  ): Promise<void> {
    // Close issue
    await this.updateIssue(issueNumber, {
      state: 'closed',
      labels: ['status:complete', 'phase:done']
    });

    // Create completion summary
    const comment = `## 🎉 Workflow Complete\n\n` +
      `**Duration:** ${result.duration}ms\n` +
      `**Completed:** ${new Date().toISOString()}\n\n` +
      `### Summary\n` +
      `- **Files Created:** ${result.filesCreated.length}\n` +
      `- **Files Modified:** ${result.filesModified.length}\n` +
      `- **Tests Passing:** ${result.testsPassed}\n` +
      `- **Build Success:** ${result.buildSuccess ? '✅' : '❌'}\n\n` +
      `### Files\n` +
      `**Created:**\n${result.filesCreated.map(f => `- ${f}`).join('\n')}\n\n` +
      `**Modified:**\n${result.filesModified.map(f => `- ${f}`).join('\n')}\n\n` +
      `### Git Commit\n\`\`\`\nCommit: ${result.gitCommit}\nBranch: ${result.gitBranch}\n\`\`\`\n\n` +
      `---\n\n**All phases complete!** ✅`;

    await this.createComment(issueNumber, comment);
  }

  /**
   * Create a GitHub issue
   */
  async createIssue(data: {
    title: string;
    body: string;
    labels: string[];
    assignees?: string[];
  }): Promise<{ number: number; id: number }> {
    const response = await this.octokit.rest.issues.create({
      owner: this.config.owner,
      repo: this.config.repo,
      title: data.title,
      body: data.body,
      labels: data.labels,
      assignees: data.assignees || []
    });

    return {
      number: response.data.number,
      id: response.data.id
    };
  }

  /**
   * Get a GitHub issue
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    const response = await this.octokit.rest.issues.get({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: issueNumber
    });

    return {
      number: response.data.number,
      title: response.data.title,
      body: response.data.body || '',
      labels: response.data.labels.map(l => l.name),
      state: response.data.state as 'open' | 'closed',
      assignees: response.data.assignees.map(a => a.login),
      repository: this.config.repo,
      owner: this.config.owner
    };
  }

  /**
   * Update a GitHub issue
   */
  async updateIssue(issueNumber: number, data: {
    state?: 'open' | 'closed';
    labels?: string[];
    body?: string;
  }): Promise<void> {
    await this.octokit.rest.issues.update({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: issueNumber,
      state: data.state,
      labels: data.labels,
      body: data.body
    });
  }

  /**
   * Create a comment on an issue
   */
  async createComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.config.owner,
      repo: this.config.repo,
      issue_number: issueNumber,
      body
    });
  }

  /**
   * Create a project board
   */
  async createProjectBoard(name: string): Promise<{ id: number }> {
    // Note: GitHub Projects API is different for Projects (classic) vs Projects Beta
    // This is a simplified version for Projects Beta
    const response = await this.octokit.rest.projects.createForRepo({
      owner: this.config.owner,
      repo: this.config.repo,
      name
    });

    return { id: response.data.id };
  }

  /**
   * Create a column in a project board
   */
  async createProjectColumn(projectId: number, name: string): Promise<{ id: number }> {
    const response = await this.octokit.rest.projects.createColumn({
      project_id: projectId,
      name
    });

    return { id: response.data.id };
  }

  /**
   * Add a card to a project column
   */
  async addProjectCard(columnId: number, contentId: number): Promise<void> {
    await this.octokit.rest.projects.createCard({
      column_id: columnId,
      content_id: contentId,
      content_type: 'Issue'
    });
  }

  /**
   * Move a project card
   */
  async moveProjectCard(cardId: number, targetColumnId: number): Promise<void> {
    // Get the card first to retrieve its current position
    const card = await this.octokit.rest.projects.getCard({
      card_id: cardId
    });

    // Move to top of target column
    await this.octokit.rest.projects.moveCard({
      card_id: cardId,
      position: 'top',
      column_id: targetColumnId
    });
  }

  /**
   * Handle escalation to user
   */
  async handleEscalation(
    issueNumber: number,
    issue: string,
    context?: Record<string, unknown>
  ): Promise<void> {
    const comment = `## ⚠️ ESCALATION REQUIRED\n\n` +
      `**Issue:** ${issue}\n\n` +
      (context ? `**Context:**\n${JSON.stringify(context, null, 2)}` : '') +
      `\n\n**Action Required:** Please review and provide guidance.`;

    await this.createComment(issueNumber, comment);

    // Emit escalation event
    this.emit('escalated', {
      issueNumber,
      issue,
      context,
      timestamp: new Date()
    });
  }
}

/**
 * Factory function
 */
export function createGitHubIntegration(config: GitHubIntegrationConfig): GitHubIntegration {
  return new GitHubIntegration(config);
}
