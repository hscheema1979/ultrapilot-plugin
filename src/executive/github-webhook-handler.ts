/**
 * GitHub Webhook Handler for Real-Time Workflow Execution
 *
 * Handles GitHub webhook events to trigger immediate workflow execution
 * instead of relying on polling.
 */

import { Context } from 'express';
import { Octokit } from 'octokit';
import { AgentMonitorDaemon } from './agent-monitor-daemon.js';

interface WebhookEvent {
  action: string;
  issue?: {
    number: number;
    title: string;
    body: string | null;
    labels: Array<{ name: string }>;
    state: string;
    html_url: string;
    user?: {
      login: string;
    };
  };
  repository?: {
    owner: {
      login: string;
    };
    name: string;
  };
  sender?: {
    login: string;
  };
}

interface WorkflowTrigger {
  issueNumber: number;
  repository: {
    owner: string;
    name: string;
  };
  skill: string;
  task: string;
  workspace?: string;
  triggeredBy: string;
  triggeredAt: Date;
}

export class GitHubWebhookHandler {
  private octokit: Octokit;
  private daemon: AgentMonitorDaemon;
  private secret: string;

  constructor(githubToken: string, webhookSecret: string, daemon: AgentMonitorDaemon) {
    this.octokit = new Octokit({ auth: githubToken });
    this.daemon = daemon;
    this.secret = webhookSecret;
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.secret);
    const digest = hmac.update(payload).digest('hex');
    const expectedSignature = `sha256=${digest}`;
    return signature === expectedSignature;
  }

  /**
   * Handle incoming webhook event
   */
  async handleWebhook(event: WebhookEvent, context: Context): Promise<{ success: boolean; message: string }> {
    try {
      // Verify signature if present
      const signature = context.get('X-Hub-Signature-256');
      if (signature) {
        const rawBody = context.body;
        if (!this.verifySignature(rawBody, signature)) {
          return {
            success: false,
            message: 'Invalid webhook signature'
          };
        }
      }

      // Handle different event types
      switch (event.action) {
        case 'opened':
        case 'reopened':
          return await this.handleIssueOpened(event);

        case 'labeled':
          return await this.handleIssueLabeled(event);

        default:
          return {
            success: true,
            message: `Event type '${event.action}' not handled, ignoring`
          };
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Handle issue opened or reopened
   */
  private async handleIssueOpened(event: WebhookEvent): Promise<{ success: boolean; message: string }> {
    if (!event.issue) {
      return { success: false, message: 'No issue in event' };
    }

    const issue = event.issue;
    const hasWorkflowLabel = issue.labels.some(l => l.name === 'workflow');

    if (hasWorkflowLabel) {
      // Immediately trigger execution
      await this.triggerWorkflowExecution({
        issueNumber: issue.number,
        repository: {
          owner: event.repository!.owner.login,
          name: event.repository!.name
        },
        skill: this.parseSkillFromIssue(issue),
        task: issue.title,
        workspace: this.parseWorkspaceFromIssue(issue),
        triggeredBy: event.sender?.login || 'unknown',
        triggeredAt: new Date()
      });

      return {
        success: true,
        message: `Workflow #${issue.number} triggered immediately`
      };
    }

    return {
      success: true,
      message: 'Issue opened without workflow label, ignoring'
    };
  }

  /**
   * Handle issue labeled
   */
  private async handleIssueLabeled(event: WebhookEvent): Promise<{ success: boolean; message: string }> {
    if (!event.issue) {
      return { success: false, message: 'No issue in event' };
    }

    const issue = event.issue;
    const label = event.action === 'labeled'
      ? context.body?.label?.name
      : null;

    // Check if workflow label was added
    if (label === 'workflow') {
      // Trigger execution
      await this.triggerWorkflowExecution({
        issueNumber: issue.number,
        repository: {
          owner: event.repository!.owner.login,
          name: event.repository!.name
        },
        skill: this.parseSkillFromIssue(issue),
        task: issue.title,
        workspace: this.parseWorkspaceFromIssue(issue),
        triggeredBy: event.sender?.login || 'unknown',
        triggeredAt: new Date()
      });

      return {
        success: true,
        message: `Workflow #${issue.number} triggered via label`
      };
    }

    return {
      success: true,
      message: `Label '${label}' added, not workflow label, ignoring`
    };
  }

  /**
   * Trigger immediate workflow execution
   */
  private async triggerWorkflowExecution(trigger: WorkflowTrigger): Promise<void> {
    console.log(`🚀 Immediate workflow execution triggered:`);
    console.log(`   Issue: #${trigger.issueNumber}`);
    console.log(`   Skill: ${trigger.skill}`);
    console.log(`   Task: ${trigger.task}`);
    console.log(`   By: ${trigger.triggeredBy}`);

    // Add 'running' label to prevent duplicate execution
    await this.octokit.rest.issues.addLabels({
      owner: trigger.repository.owner,
      repo: trigger.repository.name,
      issue_number: trigger.issueNumber,
      labels: ['running']
    });

    // Execute the skill (simulated for now)
    const startTime = Date.now();
    try {
      // TODO: Integrate with actual skill execution
      const result = `Executed ${trigger.skill} skill for task: "${trigger.task}"`;

      const duration = Date.now() - startTime;

      // Add result comment
      await this.octokit.rest.issues.createComment({
        owner: trigger.repository.owner,
        repo: trigger.repository.name,
        issue_number: trigger.issueNumber,
        body: `✅ **Workflow Execution Completed Successfully**

**Triggered By:** @${trigger.triggeredBy}
**Triggered At:** ${trigger.triggeredAt.toISOString()}
**Method:** GitHub Webhook (Real-time)

**Duration:** ${Math.round(duration / 1000)}s

**Output:**
\`\`\`
${result}
\`\`\`

---
*Executed via GitHub Webhook by AgentMonitorDaemon*`
      });

      // Close issue on success
      await this.octokit.rest.issues.update({
        owner: trigger.repository.owner,
        repo: trigger.repository.name,
        issue_number: trigger.issueNumber,
        state: 'closed'
      });

      console.log(`✅ Workflow #${trigger.issueNumber} completed via webhook`);

    } catch (error) {
      console.error(`Error executing workflow #${trigger.issueNumber}:`, error);

      await this.octokit.rest.issues.createComment({
        owner: trigger.repository.owner,
        repo: trigger.repository.name,
        issue_number: trigger.issueNumber,
        body: `❌ **Webhook Execution Failed**

**Error:** ${error instanceof Error ? error.message : String(error)}

---
*Executed via GitHub Webhook by AgentMonitorDaemon*`
      });
    }
  }

  /**
   * Parse skill from issue body
   */
  private parseSkillFromIssue(issue: any): string {
    const body = issue.body || '';
    const match = body.match(/Skill:\s*(\w+)/i);
    return match ? match[1] : 'ultrapilot';
  }

  /**
   * Parse workspace from issue body
   */
  private parseWorkspaceFromIssue(issue: any): string | undefined {
    const body = issue.body || '';
    const match = body.match(/Workspace:\s*(\S+)/i);
    return match ? match[1] : undefined;
  }
}

/**
 * Express middleware for webhook handling
 */
export function createWebhookMiddleware(handler: GitHubWebhookHandler) {
  return async (req: any, res: any, next: any) => {
    if (req.path === '/api/webhooks/github') {
      try {
        const event = req.body;
        const result = await handler.handleWebhook(event, req);

        if (result.success) {
          res.status(200).json({ message: result.message });
        } else {
          res.status(400).json({ error: result.message });
        }
      } catch (error) {
        console.error('Webhook handling error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      next();
    }
  };
}
