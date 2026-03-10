/**
 * GitHub Webhook Handler for UltraPilot
 *
 * This module handles GitHub webhook events and triggers UltraPilot workflows.
 * It integrates with the GitHubIntegration class to provide autonomous execution.
 *
 * Usage:
 * ```typescript
 * const webhookHandler = new UltraPilotWebhookHandler({
 *   githubToken: process.env.GITHUB_TOKEN,
 *   webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
 * });
 *
 * app.post('/webhook/github', webhookHandler.handleWebhook.bind(webhookHandler));
 * ```
 */

import { GitHubIntegration, createGitHubIntegration } from './GitHubIntegration.js';
import { Hmac } from 'crypto';

/**
 * Webhook handler configuration
 */
export interface WebhookHandlerConfig {
  githubToken: string;
  webhookSecret?: string;
  owner?: string;
  repo?: string;
}

/**
 * Webhook event payload
 */
export interface WebhookEvent {
  name: string;
  payload: any;
}

/**
 * UltraPilot Webhook Handler
 */
export class UltraPilotWebhookHandler {
  private githubIntegration: GitHubIntegration;
  private config: WebhookHandlerConfig;
  private agentSpawner: AgentSpawner;
  private ultraPilotOrchestrator: UltraPilotOrchestrator;

  constructor(config: WebhookHandlerConfig) {
    this.config = config;

    // Extract owner/repo from config if provided
    const owner = config.owner || process.env.GITHUB_OWNER || '';
    const repo = config.repo || process.env.GITHUB_REPO || '';

    this.githubIntegration = createGitHubIntegration({
      token: config.githubToken,
      owner,
      repo,
      webhookSecret: config.webhookSecret
    });

    // Initialize agent spawner
    this.agentSpawner = new AgentSpawner(config.githubToken);

    // Initialize UltraPilot orchestrator
    this.ultraPilotOrchestrator = new UltraPilotOrchestrator(this.githubIntegration);

    // Setup event listeners
    this.setupEventListeners();

    console.log('[WebhookHandler] Initialized');
  }

  /**
   * Setup event listeners for GitHub integration events
   */
  private setupEventListeners(): void {
    // Listen for sizing requests
    this.githubIntegration.on('sizing:requested', async (data) => {
      console.log('[WebhookHandler] Sizing requested, spawning agents...');
      await this.handleSizingRequest(data);
    });

    // Listen for workflow requests
    this.githubIntegration.on('workflow:requested', async (data) => {
      console.log('[WebhookHandler] Workflow requested, starting UltraPilot...');
      await this.handleWorkflowRequest(data);
    });

    // Listen for escalations
    this.githubIntegration.on('escalated', async (data) => {
      console.log('[WebhookHandler] Escalation received:', data.issue);
      await this.handleEscalation(data);
    });
  }

  /**
   * Handle incoming webhook from GitHub
   */
  async handleWebhook(request: {
    headers: Record<string, string>;
    body: string;
  }): Promise<{ status: number; body: string }> {
    try {
      // Verify webhook signature if secret is configured
      if (this.config.webhookSecret) {
        const signature = request.headers['x-hub-signature-256'];
        if (!signature) {
          return {
            status: 401,
            body: JSON.stringify({ error: 'No signature provided' })
          };
        }

        const expectedSignature = this.computeSignature(request.body, this.config.webhookSecret);
        if (!this.safeCompare(signature, expectedSignature)) {
          return {
            status: 401,
            body: JSON.stringify({ error: 'Invalid signature' })
          };
        }
      }

      // Parse event
      const event = this.parseEvent(request);
      console.log(`[WebhookHandler] Received event: ${event.name}`);

      // Handle event
      await this.handleEvent(event);

      return {
        status: 200,
        body: JSON.stringify({ success: true })
      };
    } catch (error: any) {
      console.error('[WebhookHandler] Error handling webhook:', error);
      return {
        status: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  /**
   * Parse webhook event
   */
  private parseEvent(request: { headers: Record<string, string>; body: string }): WebhookEvent {
    const eventName = request.headers['x-github-event'];
    const payload = JSON.parse(request.body);

    return {
      name: eventName,
      payload
    };
  }

  /**
   * Handle specific GitHub event
   */
  async handleEvent(event: WebhookEvent): Promise<void> {
    switch (event.name) {
      case 'issues':
        await this.handleIssuesEvent(event.payload);
        break;

      case 'issue_comment':
        await this.handleIssueCommentEvent(event.payload);
        break;

      case 'project_card':
        await this.handleProjectCardEvent(event.payload);
        break;

      default:
        console.log(`[WebhookHandler] Unhandled event: ${event.name}`);
    }
  }

  /**
   * Handle issues event (opened, edited, labeled, etc.)
   */
  async handleIssuesEvent(payload: any): Promise<void> {
    const action = payload.action;
    const issue = payload.issue;

    console.log(`[WebhookHandler] Issue ${action}: #${issue.number} - ${issue.title}`);

    // Extract owner/repo
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;

    // Update integration config if needed
    if (!this.config.owner) this.config.owner = owner;
    if (!this.config.repo) this.config.repo = repo;

    const githubIssue = {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map((l: any) => l.name),
      state: issue.state,
      assignees: issue.assignees.map((a: any) => a.login),
      repository: repo,
      owner
    };

    switch (action) {
      case 'opened':
        await this.githubIntegration.handleIssueOpened(githubIssue);
        break;

      case 'labeled':
        await this.githubIntegration.handleIssueLabeled(githubIssue, payload.label.name);
        break;

      case 'edited':
        // Handle issue edits if needed
        break;

      case 'closed':
        // Handle issue closure if needed
        break;
    }
  }

  /**
   * Handle issue_comment event
   */
  async handleIssueCommentEvent(payload: any): Promise<void> {
    const action = payload.action;
    const comment = payload.comment.body;

    console.log(`[WebhookHandler] Comment ${action} on issue #${payload.issue.number}`);

    // Check if comment is a command
    if (comment.startsWith('/ultrapilot ')) {
      const command = comment.substring('/ultrapilot '.length).trim();
      await this.handleUltrapilotCommand(payload.issue, command);
    }
  }

  /**
   * Handle /ultrapilot commands in comments
   */
  async handleUltrapilotCommand(issue: any, command: string): Promise<void> {
    console.log(`[WebhookHandler] UltraPilot command: ${command}`);

    const issueNumber = issue.number;

    switch (command) {
      case 'start':
        // Start or resume workflow
        await this.githubIntegration.triggerUltraPilotWorkflow({
          number: issueNumber,
          title: issue.title,
          body: issue.body || '',
          labels: issue.labels.map((l: any) => l.name),
          state: issue.state,
          assignees: issue.assignees.map((a: any) => a.login),
          repository: this.config.repo || '',
          owner: this.config.owner || ''
        });
        break;

      case 'stop':
      case 'cancel':
        // Cancel workflow
        await this.ultraPilotOrchestrator.cancelWorkflow(issueNumber);
        break;

      case 'status':
        // Show workflow status
        const status = await this.ultraPilotOrchestrator.getWorkflowStatus(issueNumber);
        await this.githubIntegration.createComment(issueNumber, `
## UltraPilot Status

**Workflow:** #${issueNumber}
**Status:** ${status.status}
**Current Phase:** ${status.phase}
**Tasks Completed:** ${status.tasksCompleted}/${status.totalTasks}
**Duration:** ${status.duration}ms
        `);
        break;

      case 'retry':
        // Retry failed workflow
        await this.ultraPilotOrchestrator.retryWorkflow(issueNumber);
        break;

      default:
        await this.githubIntegration.createComment(issueNumber, `Unknown command: ${command}`);
    }
  }

  /**
   * Handle project_card event (moved, created, deleted, etc.)
   */
  async handleProjectCardEvent(payload: any): Promise<void> {
    const action = payload.action;
    const card = payload.project_card;

    console.log(`[WebhookHandler] Project card ${action}`);

    // Track card movements on project boards
    if (action === 'moved') {
      // Update workflow state based on column
      await this.handleCardMoved(card);
    }
  }

  /**
   * Handle card moved on project board
   */
  async handleCardMoved(card: any): Promise<void> {
    // Extract issue number from card
    const issueNumber = parseInt(card.content_url.split('/').pop());

    // Map column to phase
    const phaseMapping: Record<string, string> = {
      'Backlog': 'planning',
      'Planning': 'phase-0',
      'Review': 'phase-1.5',
      'Ready': 'ready',
      'In Progress': 'phase-2',
      'QA': 'phase-3',
      'Validation': 'phase-4',
      'Verification': 'phase-5',
      'Complete': 'done'
    };

    // Update workflow phase if needed
    const phase = phaseMapping[card.column_name];
    if (phase) {
      await this.ultraPilotOrchestrator.updateWorkflowPhase(issueNumber, phase);
    }
  }

  /**
   * Handle sizing request
   */
  async handleSizingRequest(data: any): Promise<void> {
    const { issueNumber, title, description } = data;

    // Spawn 3 sizing agents in parallel
    const sizingAgents = [
      {
        name: 'ultra:planner',
        prompt: `Estimate task size for: ${description}\n\nOutput: XS/S/M/L/XL/XXL with reasoning`
      },
      {
        name: 'ultra:architect',
        prompt: `Estimate architectural complexity for: ${description}\n\nOutput: XS/S/M/L/XL/XXL with reasoning`
      },
      {
        name: 'ultra:team-lead',
        prompt: `Estimate execution complexity for: ${description}\n\nOutput: XS/S/M/L/XL/XXL with reasoning`
      }
    ];

    const results = await Promise.all(
      sizingAgents.map(agent =>
        this.agentSpawner.spawnAgent(agent.name, {
          model: 'opus',
          prompt: agent.prompt,
          githubIssue: data.sizingIssueNumber
        })
      )
    );

    // Post results to GitHub
    for (const result of results) {
      await this.githubIntegration.postSizingResult(
        data.sizingIssueNumber,
        result
      );
    }

    // Aggregate and reach consensus
    await this.githubIntegration.aggregateSizingResults(
      issueNumber,
      data.sizingIssueNumber,
      results
    );
  }

  /**
   * Handle workflow request
   */
  async handleWorkflowRequest(data: any): Promise<void> {
    const { issueNumber, title, body, labels } = data;

    // Start UltraPilot workflow
    await this.ultraPilotOrchestrator.startWorkflow({
      issueNumber,
      title,
      body,
      labels
    });
  }

  /**
   * Handle escalation
   */
  async handleEscalation(data: any): Promise<void> {
    const { issueNumber, issue, context } = data;

    // Escalation already posted to GitHub by GitHubIntegration
    // Here we would implement additional notification logic
    // e.g., send Slack notification, email, etc.

    console.log(`[WebhookHandler] Escalation for issue #${issueNumber}: ${issue}`);
  }

  /**
   * Compute HMAC signature for webhook verification
   */
  private computeSignature(payload: string, secret: string): string {
    const hmac = Hmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Safe string comparison to prevent timing attacks
   */
  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

/**
 * Agent Spawner (placeholder - would integrate with actual agent system)
 */
class AgentSpawner {
  private githubToken: string;

  constructor(githubToken: string) {
    this.githubToken = githubToken;
  }

  async spawnAgent(agentType: string, config: any): Promise<any> {
    // This would integrate with the actual agent spawning system
    // For now, return mock data
    console.log(`[AgentSpawner] Spawning ${agentType} (model: ${config.model})`);

    // Simulate agent execution
    await this.delay(2000);

    return {
      agent: agentType,
      size: this.randomSize(),
      reasoning: `Analysis based on task complexity and requirements.`,
      taskCount: Math.floor(Math.random() * 50) + 10,
      estimatedDuration: `${Math.floor(Math.random() * 10) + 1} hours`
    };
  }

  private randomSize(): 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' {
    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return sizes[Math.floor(Math.random() * sizes.length)] as any;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * UltraPilot Orchestrator (placeholder - would integrate with actual UltraPilot system)
 */
class UltraPilotOrchestrator {
  private githubIntegration: GitHubIntegration;
  private workflows: Map<number, any> = new Map();

  constructor(githubIntegration: GitHubIntegration) {
    this.githubIntegration = githubIntegration;
  }

  async startWorkflow(data: any): Promise<void> {
    console.log(`[Orchestrator] Starting workflow for issue #${data.issueNumber}`);

    // Store workflow state
    this.workflows.set(data.issueNumber, {
      status: 'running',
      phase: 'phase-0',
      startTime: Date.now()
    });

    // This would integrate with the actual UltraPilot skill
    // For now, simulate workflow execution
    await this.simulateWorkflow(data.issueNumber);
  }

  private async simulateWorkflow(issueNumber: number): Promise<void> {
    // Phase 0
    await this.githubIntegration.updatePhaseProgress(issueNumber, '0', 'Requirements & Architecture');
    await this.delay(5000);

    // Phase 1
    await this.githubIntegration.updatePhaseProgress(issueNumber, '1', 'Planning');
    await this.delay(5000);

    // Phase 1.5
    await this.githubIntegration.updatePhaseProgress(issueNumber, '1.5', 'Review');
    await this.delay(5000);

    // Phase 2
    await this.githubIntegration.updatePhaseProgress(issueNumber, '2', 'Execution');
    await this.delay(10000);

    // Phase 3
    await this.githubIntegration.updatePhaseProgress(issueNumber, '3', 'QA');
    await this.delay(5000);

    // Phase 4
    await this.githubIntegration.updatePhaseProgress(issueNumber, '4', 'Validation');
    await this.delay(5000);

    // Phase 5
    await this.githubIntegration.updatePhaseProgress(issueNumber, '5', 'Verification');
    await this.delay(5000);

    // Complete
    await this.githubIntegration.markWorkflowComplete(issueNumber, {
      duration: Date.now() - (this.workflows.get(issueNumber)?.startTime || Date.now()),
      filesCreated: ['file1.ts', 'file2.ts'],
      filesModified: ['file3.ts'],
      testsPassed: 50,
      buildSuccess: true,
      validationResults: { security: { approved: true }, quality: { approved: true }, code: { approved: true } },
      verificationResults: { passed: true },
      gitCommit: 'abc123',
      gitBranch: 'main'
    });

    this.workflows.delete(issueNumber);
  }

  async cancelWorkflow(issueNumber: number): Promise<void> {
    console.log(`[Orchestrator] Cancelling workflow #${issueNumber}`);
    this.workflows.delete(issueNumber);
  }

  async getWorkflowStatus(issueNumber: number): Promise<any> {
    return this.workflows.get(issueNumber) || {
      status: 'not_found',
      phase: 'unknown',
      tasksCompleted: 0,
      totalTasks: 0,
      duration: 0
    };
  }

  async retryWorkflow(issueNumber: number): Promise<void> {
    console.log(`[Orchestrator] Retrying workflow #${issueNumber}`);
    // Implementation would retry failed workflow
  }

  async updateWorkflowPhase(issueNumber: number, phase: string): Promise<void> {
    const workflow = this.workflows.get(issueNumber);
    if (workflow) {
      workflow.phase = phase;
      this.workflows.set(issueNumber, workflow);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function
 */
export function createWebhookHandler(config: WebhookHandlerConfig): UltraPilotWebhookHandler {
  return new UltraPilotWebhookHandler(config);
}
