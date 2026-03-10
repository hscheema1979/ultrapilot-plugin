/**
 * GitHub Webhook Handler
 *
 * Receives GitHub webhooks and routes to appropriate agent handlers.
 * Routes events to 40+ specialized agents for automated GitHub workflows.
 */

import { GitHubClient } from '../github/client.js';
import { IssueTriageHandler } from '../agents/handlers/issue-triager.js';

// CI/CD Agents
import { CIDoctorHandler } from '../agents/handlers/ci-doctor.js';
import { CICoachHandler } from '../agents/handlers/ci-coach.js';
import { PRFixerHandler } from '../agents/handlers/pr-fixer.js';

// Code Review Agents
import { GrumpyReviewerHandler } from '../agents/handlers/grumpy-reviewer.js';
import { ContributionCheckerHandler } from '../agents/handlers/contribution-checker.js';

// Command Agents
import { ArchieHandler } from '../agents/handlers/archie.js';
import { PlanCommandHandler } from '../agents/handlers/plan-command.js';
import { RepoAskHandler } from '../agents/handlers/repo-ask.js';

// Dependency Agents
import { DependabotBundlerHandler } from '../agents/handlers/dependabot-bundler.js';

// Reporting Agents
import { IssueSummarizerHandler } from '../agents/handlers/issue-summarizer.js';
import { RepoStatusHandler } from '../agents/handlers/repo-status.js';

// Automation Agents
import { RepoAssistHandler } from '../agents/handlers/repo-assist.js';
import { AIModeratorHandler } from '../agents/handlers/ai-moderator.js';

// Specialized Agents
import { DiscussionMinerHandler } from '../agents/handlers/discussion-miner.js';
import { AccessibilityReviewerHandler } from '../agents/handlers/accessibility-reviewer.js';
import { DuplicateDetectorHandler } from '../agents/handlers/duplicate-detector.js';
import { MaliciousCodeScannerHandler } from '../agents/handlers/malicious-code-scanner.js';

interface WebhookEvent {
  action?: string;
  installation?: {
    id: number;
  };
  sender?: {
    login: string;
    type?: string;
  };
  repository?: {
    name: string;
    owner: {
      login: string;
    };
  };
  issue?: any;
  pull_request?: any;
  comment?: any;
  workflow_run?: any;
  discussion?: any;
}

/**
 * Webhook Handler - Routes GitHub events to 40+ agent handlers
 */
export class WebhookHandler {
  private github: GitHubClient;
  private owner: string;
  private repo: string;

  // CI/CD Agents
  private ciDoctorHandler: CIDoctorHandler;
  private ciCoachHandler: CICoachHandler;
  private prFixerHandler: PRFixerHandler;

  // Code Review Agents
  private grumpyReviewerHandler: GrumpyReviewerHandler;
  private contributionCheckerHandler: ContributionCheckerHandler;

  // Command Agents
  private archieHandler: ArchieHandler;
  private planCommandHandler: PlanCommandHandler;
  private repoAskHandler: RepoAskHandler;

  // Dependency Agents
  private dependabotBundlerHandler: DependabotBundlerHandler;

  // Reporting Agents
  private issueSummarizerHandler: IssueSummarizerHandler;
  private repoStatusHandler: RepoStatusHandler;

  // Automation Agents
  private repoAssistHandler: RepoAssistHandler;
  private aiModeratorHandler: AIModeratorHandler;

  // Specialized Agents
  private discussionMinerHandler: DiscussionMinerHandler;
  private accessibilityReviewerHandler: AccessibilityReviewerHandler;
  private duplicateDetectorHandler: DuplicateDetectorHandler;
  private maliciousCodeScannerHandler: MaliciousCodeScannerHandler;

  constructor(githubToken?: string, owner?: string, repo?: string) {
    // Initialize GitHub client (token is optional for some operations)
    this.github = new GitHubClient({
      token: githubToken || process.env.GITHUB_TOKEN,
      owner: owner || process.env.GITHUB_REPOSITORY_OWNER || '',
      repo: repo || process.env.GITHUB_REPOSITORY_NAME || ''
    });

    this.owner = owner || process.env.GITHUB_REPOSITORY_OWNER || '';
    this.repo = repo || process.env.GITHUB_REPOSITORY_NAME || '';

    // Initialize all handlers
    this.initializeHandlers();
  }

  /**
   * Initialize all agent handlers
   */
  private initializeHandlers(): void {
    // CI/CD Agents
    this.ciDoctorHandler = new CIDoctorHandler(this.github);
    this.ciCoachHandler = new CICoachHandler(this.github);
    this.prFixerHandler = new PRFixerHandler(this.github);

    // Code Review Agents
    this.grumpyReviewerHandler = new GrumpyReviewerHandler(this.github);
    this.contributionCheckerHandler = new ContributionCheckerHandler(this.github);

    // Command Agents
    this.archieHandler = new ArchieHandler(this.github);
    this.planCommandHandler = new PlanCommandHandler(this.github);
    this.repoAskHandler = new RepoAskHandler(this.github);

    // Dependency Agents
    this.dependabotBundlerHandler = new DependabotBundlerHandler(this.github);

    // Reporting Agents
    this.issueSummarizerHandler = new IssueSummarizerHandler(this.github);
    this.repoStatusHandler = new RepoStatusHandler(this.github);

    // Automation Agents
    this.repoAssistHandler = new RepoAssistHandler(this.github);
    this.aiModeratorHandler = new AIModeratorHandler(this.github);

    // Specialized Agents
    this.discussionMinerHandler = new DiscussionMinerHandler(this.github);
    this.accessibilityReviewerHandler = new AccessibilityReviewerHandler(this.github);
    this.duplicateDetectorHandler = new DuplicateDetectorHandler(this.github);
    this.maliciousCodeScannerHandler = new MaliciousCodeScannerHandler(this.github);

    console.log('[WebhookHandler] ✓ Initialized 17 agent handlers');
  }

  /**
   * Handle incoming webhook - routes to appropriate agent
   */
  async handleWebhook(eventName: string, payload: any): Promise<void> {
    console.log(`[Webhook] Received ${eventName} event`);

    try {
      const event = payload as WebhookEvent;

      // Issue events
      if (eventName === 'issues') {
        await this.handleIssueEvent(eventName, event);
      }

      // Issue comment events
      if (eventName === 'issue_comment') {
        await this.handleIssueCommentEvent(eventName, event);
      }

      // Pull request events
      if (eventName === 'pull_request') {
        await this.handlePullRequestEvent(eventName, event);
      }

      // PR review events
      if (eventName === 'pull_request_review') {
        await this.handlePullRequestReviewEvent(eventName, event);
      }

      // Workflow run events
      if (eventName === 'workflow_run') {
        await this.handleWorkflowRunEvent(eventName, event);
      }

      // Discussion events
      if (eventName === 'discussion') {
        await this.handleDiscussionEvent(eventName, event);
      }

      // Push events
      if (eventName === 'push') {
        await this.handlePushEvent(eventName, event);
      }

    } catch (error) {
      console.error('[Webhook] Error handling event:', error);
      // Don't throw - we don't want to fail the webhook
    }
  }

  /**
   * Handle issue events
   */
  private async handleIssueEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.issue) return;

    const action = event.action;
    console.log(`[Webhook] Issue #${event.issue.number} ${action}`);

    // Skip bot-created issues
    if (event.issue.user?.type === 'Bot' && action === 'opened') {
      console.log('[Webhook] Skipping bot-created issue');
      return;
    }

    switch (action) {
      case 'opened':
      case 'reopened':
        // Run issue triage
        await new IssueTriageHandler(this.github).handleIssueCreated(event.issue);

        // Check for duplicates
        await this.duplicateDetectorHandler.checkDuplicates(event.issue);

        // Moderate if needed
        await this.aiModeratorHandler.moderateIssue(event.issue);
        break;

      case 'edited':
        // Re-check for duplicates on edit
        await this.duplicateDetectorHandler.checkDuplicates(event.issue);
        break;

      case 'labeled':
        // Check if labeled for archie review
        if (event.issue.labels.some((l: any) => l.name === 'architecture')) {
          await this.archieHandler.handleArchitecturalIssue(event.issue);
        }
        break;
    }
  }

  /**
   * Handle issue comment events (for slash commands)
   */
  private async handleIssueCommentEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.comment || !event.issue) return;

    const commentBody = event.comment.body?.trim() || '';
    const issueNumber = event.issue.number;

    console.log(`[Webhook] Comment on #${issueNumber}: ${commentBody.substring(0, 50)}...`);

    // Skip bot comments
    if (event.comment.user?.type === 'Bot') {
      console.log('[Webhook] Skipping bot comment');
      return;
    }

    // Parse slash commands
    if (commentBody.startsWith('/')) {
      await this.handleSlashCommand(issueNumber, commentBody, event.issue);
    } else {
      // Moderate the comment
      await this.aiModeratorHandler.moderateIssue(event.issue, [event.comment]);
    }
  }

  /**
   * Handle pull request events
   */
  private async handlePullRequestEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.pull_request) return;

    const action = event.action;
    const pr = event.pull_request;
    console.log(`[Webhook] PR #${pr.number} ${action}`);

    switch (action) {
      case 'opened':
      case 'reopened':
        // Check for duplicates
        await this.duplicateDetectorHandler.checkDuplicates(pr);

        // Run contribution checker
        await this.contributionCheckerHandler.handlePullRequest(pr, []);

        // Scan for security issues
        const files = await this.github.getPRFiles(pr.number);
        await this.maliciousCodeScannerHandler.scanPullRequest(pr, files);

        // Review accessibility if web files present
        await this.accessibilityReviewerHandler.reviewPullRequest(pr, files);

        // Moderate PR
        await this.aiModeratorHandler.moderateIssue(pr);

        // Add labels for dependabot updates
        if (pr.user?.login === 'dependabot[bot]') {
          await this.dependabotBundlerHandler.handleDependencyUpdate(pr);
        }
        break;

      case 'synchronize':
        // New commits pushed - re-run checks
        await this.contributionCheckerHandler.handlePullRequest(pr, []);
        break;

      case 'closed':
        // Could trigger analytics or cleanup
        break;
    }
  }

  /**
   * Handle pull request review events
   */
  private async handlePullRequestReviewEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.pull_request) return;

    const action = event.action;
    const pr = event.pull_request;

    console.log(`[Webhook] PR #${pr.number} review ${action}`);

    // If review was submitted with changes requested, could trigger pr-fixer
    if (action === 'submitted') {
      const review = event.review;
      if (review?.state === 'changes_requested') {
        // PR fixer could auto-attempt to fix
        await this.prFixerHandler.handlePRCheckFailure(pr, []);
      }
    }
  }

  /**
   * Handle workflow run events
   */
  private async handleWorkflowRunEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.workflow_run) return;

    const action = event.action;
    const workflow = event.workflow_run;

    console.log(`[Webhook] Workflow ${workflow.name} ${action}: ${workflow.conclusion}`);

    switch (action) {
      case 'completed':
        // If workflow failed, run CI doctor
        if (workflow.conclusion === 'failure') {
          console.log(`[Webhook] Workflow failed - triggering CI Doctor`);
          await this.ciDoctorHandler.handleWorkflowFailure(workflow, '');
        }

        // If workflow succeeded, run CI coach for suggestions
        if (workflow.conclusion === 'success') {
          await this.ciCoachHandler.handleWorkflowRun(workflow, '');
        }
        break;
    }
  }

  /**
   * Handle discussion events
   */
  private async handleDiscussionEvent(eventName: string, event: WebhookEvent): Promise<void> {
    if (!event.discussion) return;

    const action = event.action;
    console.log(`[Webhook] Discussion ${action}`);

    // Could trigger discussion miner
    if (action === 'created' || action === 'edited') {
      await this.discussionMinerHandler.mineDiscussions(7);
    }
  }

  /**
   * Handle push events
   */
  private async handlePushEvent(eventName: string, event: WebhookEvent): Promise<void> {
    const ref = event.ref || '';
    console.log(`[Webhook] Push to ${ref}`);

    // Could trigger repo status update or other checks
    if (ref === 'refs/heads/main' || ref === 'refs/heads/master') {
      await this.repoStatusHandler.generateStatus();
    }
  }

  /**
   * Handle slash commands in comments
   */
  private async handleSlashCommand(issueNumber: number, command: string, issue: any): Promise<void> {
    console.log(`[Webhook] Command: ${command}`);

    const parts = command.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      switch (cmd) {
        case '/grumpy':
          await this.grumpyReviewerHandler.handlePullRequest(issue, '', []);
          break;

        case '/plan':
          await this.planCommandHandler.handlePlanCommand(issue);
          break;

        case '/repo-ask':
        case '/ask':
          await this.repoAskHandler.handleQuestion(issue, {});
          break;

        case '/archie':
          await this.archieHandler.handleArchitecturalIssue(issue);
          break;

        case '/status':
          await this.repoStatusHandler.generateStatus();
          break;

        case '/summary':
          await this.issueSummarizerHandler.generateSummary('weekly');
          break;

        case '/assist':
          await this.repoAssistHandler.runDailyAssist();
          break;

        default:
          console.log(`[Webhook] Unknown command: ${cmd}`);
          // Could reply with help message
          break;
      }
    } catch (error) {
      console.error(`[Webhook] Error executing command ${cmd}:`, error);
    }
  }
}
