/**
 * Agent Monitoring Daemon
 *
 * Continuously monitors GitHub issues for workflow execution requests
 * and triggers UltraPilot skills to handle them.
 *
 * This is the EXECUTION BRIDGE that connects the dashboard to agents.
 */

import { Octokit } from 'octokit';

interface WorkflowIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  html_url: string;
  repository: {
    owner: string;
    name: string;
  };
}

interface TaskRequest {
  skill: string;
  task: string;
  workspace?: string;
  playbookId: string;
  parameters?: Record<string, any>;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

export class AgentMonitorDaemon {
  private octokit: Octokit;
  private pollingInterval: number = 60000; // 60 seconds
  private running: boolean = false;
  private checkRepos: Array<{ owner: string; repo: string }>;
  private executionLog: Map<number, Date> = new Map();

  constructor(token: string, checkRepos: Array<{ owner: string; repo: string }>) {
    this.octokit = new Octokit({ auth: token });
    this.checkRepos = checkRepos;
  }

  /**
   * Start the daemon - begins continuous monitoring loop
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('AgentMonitorDaemon is already running');
      return;
    }

    this.running = true;
    console.log('🚀 AgentMonitorDaemon started - monitoring for workflow issues');

    while (this.running) {
      try {
        await this.scanAndExecuteWorkflows();
      } catch (error) {
        console.error('Error in monitoring loop:', error);
      }

      // Sleep for polling interval
      await this.sleep(this.pollingInterval);
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    this.running = false;
    console.log('AgentMonitorDaemon stopped');
  }

  /**
   * Scan all configured repositories for workflow issues and execute them
   */
  private async scanAndExecuteWorkflows(): Promise<void> {
    console.log(`🔍 Scanning ${this.checkRepos.length} repositories for workflow issues...`);

    for (const repo of this.checkRepos) {
      try {
        const issues = await this.fetchWorkflowIssues(repo.owner, repo.repo);
        const pendingIssues = this.filterPendingIssues(issues);

        console.log(`Found ${pendingIssues.length} pending workflow issues in ${repo.owner}/${repo.repo}`);

        for (const issue of pendingIssues) {
          await this.executeWorkflow(issue);
        }
      } catch (error) {
        console.error(`Error scanning ${repo.owner}/${repo.repo}:`, error);
      }
    }
  }

  /**
   * Fetch all workflow issues from a repository
   */
  private async fetchWorkflowIssues(owner: string, repo: string): Promise<WorkflowIssue[]> {
    const response = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: 'workflow',
      state: 'open',
      per_page: 100
    });

    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map(l => l.name),
      state: issue.state,
      html_url: issue.html_url,
      repository: { owner, name: repo }
    }));
  }

  /**
   * Filter issues that are pending execution
   * - Must have 'workflow' label
   * - Must NOT have 'running' label
   * - Must be in 'open' state
   * - Must not have been executed in the last 5 minutes (prevent duplicate execution)
   */
  private filterPendingIssues(issues: WorkflowIssue[]): WorkflowIssue[] {
    return issues.filter(issue => {
      // Check for running label
      if (issue.labels.includes('running')) {
        return false;
      }

      // Check for recent execution (prevent duplicate execution)
      const lastExecution = this.executionLog.get(issue.number);
      if (lastExecution && Date.now() - lastExecution.getTime() < 300000) {
        return false;
      }

      return true;
    });
  }

  /**
   * Execute a workflow issue
   */
  private async executeWorkflow(issue: WorkflowIssue): Promise<void> {
    console.log(`🎯 Executing workflow #${issue.number}: ${issue.title}`);

    // Mark as running
    await this.addLabel(issue, 'running');
    this.executionLog.set(issue.number, new Date());

    try {
      // Parse task from issue body
      const task = this.parseTaskFromIssue(issue);

      // Execute the UltraPilot skill
      const result = await this.executeSkill(task);

      // Update issue with result
      await this.updateIssueWithResult(issue, result);

      // Close issue if successful
      if (result.success) {
        await this.closeIssue(issue);
        console.log(`✅ Workflow #${issue.number} completed successfully`);
      } else {
        console.error(`❌ Workflow #${issue.number} failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error executing workflow #${issue.number}:`, error);

      // Add error comment
      await this.addComment(issue, `❌ **Execution Error:**\n\`\`\`${error}\`\`\``);
    }
  }

  /**
   * Parse task from issue body
   */
  private parseTaskFromIssue(issue: WorkflowIssue): TaskRequest {
    const body = issue.body;

    // Look for structured data in issue body
    const skillMatch = body.match(/Skill:\s*(\w+)/i);
    const taskMatch = body.match(/Task:\s*([\s\S]*?)(?=Parameters:|$)/i);
    const workspaceMatch = body.match(/Workspace:\s*(\S+)/i);

    const skill = skillMatch ? skillMatch[1] : 'ultrapilot';
    const taskText = taskMatch ? taskMatch[1].trim() : issue.title;
    const workspace = workspaceMatch ? workspaceMatch[1] : undefined;

    return {
      skill,
      task: taskText,
      workspace,
      playbookId: skill,
      parameters: {}
    };
  }

  /**
   * Execute an UltraPilot skill
   */
  private async executeSkill(task: TaskRequest): Promise<ExecutionResult> {
    const startTime = Date.now();

    console.log(`🔧 Executing skill: ${task.skill}`);
    console.log(`📝 Task: ${task.task}`);
    if (task.workspace) {
      console.log(`🏢 Workspace: ${task.workspace}`);
    }

    try {
      // For now, we'll simulate execution
      // TODO: Integrate with actual skill execution system
      const output = `Executed ${task.skill} skill for task: "${task.task}"`;

      return {
        success: true,
        output,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Update issue with execution result
   */
  private async updateIssueWithResult(issue: WorkflowIssue, result: ExecutionResult): Promise<void> {
    const comment = this.formatResultComment(result);
    await this.addComment(issue, comment);
  }

  /**
   * Format execution result as GitHub comment
   */
  private formatResultComment(result: ExecutionResult): string {
    if (result.success) {
      return `✅ **Workflow Execution Completed Successfully**

**Duration:** ${Math.round(result.duration / 1000)}s

**Output:**
\`\`\`
${result.output}
\`\`\`

---
*Executed by AgentMonitorDaemon*`;
    } else {
      return `❌ **Workflow Execution Failed**

**Duration:** ${Math.round(result.duration / 1000)}s

**Error:**
\`\`\`
${result.error}
\`\`\`

---
*Executed by AgentMonitorDaemon*`;
    }
  }

  /**
   * Add a label to an issue
   */
  private async addLabel(issue: WorkflowIssue, label: string): Promise<void> {
    try {
      await this.octokit.rest.issues.addLabels({
        owner: issue.repository.owner,
        repo: issue.repository.name,
        issue_number: issue.number,
        labels: [label]
      });
    } catch (error) {
      console.error(`Failed to add label "${label}" to issue #${issue.number}:`, error);
    }
  }

  /**
   * Add a comment to an issue
   */
  private async addComment(issue: WorkflowIssue, comment: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: issue.repository.owner,
      repo: issue.repository.name,
      issue_number: issue.number,
      body: comment
    });
  }

  /**
   * Close an issue
   */
  private async closeIssue(issue: WorkflowIssue): Promise<void> {
    await this.octokit.rest.issues.update({
      owner: issue.repository.owner,
      repo: issue.repository.name,
      issue_number: issue.number,
      state: 'closed'
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create and start the daemon
 */
export async function createAndStartDaemon(githubToken: string): Promise<AgentMonitorDaemon> {
  const checkRepos = [
    { owner: 'hscheema1979', repo: 'control-room' },
    { owner: 'hscheema1979', repo: 'ultrapilot-dashboard' },
    { owner: 'hscheema1979', repo: 'hscheema1979' }
  ];

  const daemon = new AgentMonitorDaemon(githubToken, checkRepos);

  // Start in background
  daemon.start().catch(error => {
    console.error('Fatal error in AgentMonitorDaemon:', error);
    process.exit(1);
  });

  return daemon;
}
