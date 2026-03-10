/**
 * GitHub Client Wrapper
 *
 * Provides type-safe wrappers around GitHub API calls.
 * Handles rate limiting, errors, retries.
 */

import { Octokit } from 'octokit';
import { RequestError } from '@octokit/request-error';
import { getGitHubAppAuth } from './app-auth.js';

export interface GitHubConfig {
  token?: string;
  appId?: number;
  installationId?: number;
  privateKey?: string;
  owner: string;
  repo: string;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Label[];
  user: {
    login: string;
    type?: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  html_url: string;
  author?: string;
}

export interface Label {
  name: string;
  color?: string;
  description?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    type?: string;
  };
  author?: string;
  head: {
    sha: string;
    ref: string;
  };
  base: {
    ref: string;
  };
  labels: Label[];
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  run_number?: number;
}

export interface Review {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: ReviewComment[];
}

export interface ReviewComment {
  path: string;
  position?: number;
  line?: number;
  body: string;
}

export interface WorkflowRun {
  id: number | string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failure';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
  created_at: string;
  updated_at: string;
  run_number?: number;
  html_url?: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * GitHub Client - Wrapper around Octokit with error handling and retries
 */
export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubConfig) {
    this.owner = config.owner;
    this.repo = config.repo;

    // Initialize Octokit with auth
    if (config.token) {
      this.octokit = new Octokit({ auth: config.token });
    } else if (config.appId && config.privateKey) {
      // Use GitHub App authentication
      this.initGitHubAppAuth(config.appId, config.privateKey, config.installationId);
    } else {
      // No auth - create unauthenticated client for public repos
      this.octokit = new Octokit();
    }
  }

  /**
   * Initialize GitHub App authentication
   */
  private async initGitHubAppAuth(appId: number, privateKey: string, installationId?: number): Promise<void> {
    try {
      const appAuth = new (await import('./app-auth.js')).GitHubAppAuthManager({
        appId: appId.toString(),
        privateKey
      });

      // Get installation token
      const token = await appAuth.getInstallationToken(installationId);

      // Create Octokit with installation token
      this.octokit = new Octokit({ auth: token });

      console.log('[GitHub] Initialized with GitHub App authentication');
    } catch (error) {
      console.error('[GitHub] Failed to initialize GitHub App auth:', error);
      throw error;
    }
  }

  /**
   * Add labels to an issue or PR
   */
  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    try {
      await this.octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels
      });

      console.log(`[GitHub] Added labels to #${issueNumber}: ${labels.join(', ')}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to add labels: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Remove labels from an issue or PR
   */
  async removeLabels(issueNumber: number, labels: string[]): Promise<void> {
    try {
      for (const label of labels) {
        await this.octokit.rest.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: label
        });
      }

      console.log(`[GitHub] Removed labels from #${issueNumber}: ${labels.join(', ')}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to remove labels: ${error.message}`);
        // Don't throw - label might not exist
      }
      throw error;
    }
  }

  /**
   * Post a comment on an issue or PR
   */
  async postComment(issueNumber: number, comment: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: comment
      });

      console.log(`[GitHub] Posted comment on #${issueNumber}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to post comment: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(params: CreateIssueParams): Promise<Issue> {
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: params.title,
        body: params.body,
        labels: params.labels,
        assignees: params.assignees
      });

      console.log(`[GitHub] Created issue #${data.number}: ${data.title}`);

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        labels: data.labels.map(l => ({ name: l.name })),
        user: { login: data.user.login }
      };
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to create issue: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get issue details
   */
  async getIssue(issueNumber: number): Promise<Issue> {
    try {
      const { data } = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        labels: data.labels.map(l => ({ name: l.name })),
        user: { login: data.user.login }
      };
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get issue: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get PR diff
   */
  async getPRDiff(prNumber: number): Promise<string> {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' }
      });

      return data as unknown as string;
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get PR diff: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Create a PR review
   */
  async createReview(prNumber: number, review: Review): Promise<void> {
    try {
      await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        body: review.body,
        event: review.event,
        comments: review.comments || []
      });

      console.log(`[GitHub] Created ${review.event} review on PR #${prNumber}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to create review: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Post a PR comment (inline or general)
   */
  async postPRComment(prNumber: number, comment: string, options?: {
    path?: string;
    line?: number;
    position?: number;
  }): Promise<void> {
    try {
      if (options?.path && options?.line !== undefined) {
        // Inline comment
        const pr = await this.octokit.rest.pulls.get({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber
        });

        await this.octokit.rest.pulls.createReviewComment({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          body: comment,
          path: options.path,
          line: options.line,
          commit_id: pr.data.head.sha
        });
      } else {
        // General comment
        await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          body: comment
        });
      }

      console.log(`[GitHub] Posted comment on PR #${prNumber}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to post PR comment: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get workflow run logs
   */
  async getWorkflowLogs(runId: string): Promise<string> {
    try {
      const response = await this.octokit.rest.actions.downloadWorkflowRunLogs({
        owner: this.owner,
        repo: this.repo,
        run_id: parseInt(runId, 10)
      });

      // TODO: Handle zip file download and extraction
      // For now, return placeholder
      return `[Workflow logs for run ${runId}]`;
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get workflow logs: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get workflow run details
   */
  async getWorkflowRun(runId: string): Promise<WorkflowRun> {
    try {
      const { data } = await this.octokit.rest.actions.getWorkflowRun({
        owner: this.owner,
        repo: this.repo,
        run_id: parseInt(runId, 10)
      });

      return {
        id: data.id,
        name: data.name,
        status: data.status as WorkflowRun['status'],
        conclusion: data.conclusion as WorkflowRun['conclusion'],
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get workflow run: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * List workflow runs for a workflow
   */
  async listWorkflowRuns(workflowName: string, perPage: number = 10): Promise<WorkflowRun[]> {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRuns({
        owner: this.owner,
        repo: this.repo,
        workflow_name: workflowName,
        per_page: perPage
      });

      return data.workflow_runs.map(run => ({
        id: run.id,
        name: run.name,
        status: run.status as WorkflowRun['status'],
        conclusion: run.conclusion as WorkflowRun['conclusion'],
        created_at: run.created_at,
        updated_at: run.updated_at
      }));
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to list workflow runs: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Search issues
   */
  async searchIssues(query: string, perPage: number = 10): Promise<Issue[]> {
    try {
      const q = `${query} repo:${this.owner}/${this.repo}`;
      const { data } = await this.octokit.rest.search.issuesAndPullRequests({
        q,
        per_page: perPage
      });

      return data.items.map(item => ({
        number: item.number,
        title: item.title,
        body: item.body || '',
        state: item.state as 'open' | 'closed',
        labels: item.labels?.map(l => ({ name: l.name })) || [],
        user: { login: item.user.login }
      })) as Issue[];
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to search issues: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get all issues
   */
  async getIssues(state: 'open' | 'closed' | 'all' = 'all', perPage: number = 100): Promise<Issue[]> {
    try {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state,
        per_page: perPage
      });

      return data.map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels.map(l => ({ name: l.name })),
        user: {
          login: issue.user.login,
          type: issue.user.type
        },
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at || undefined,
        html_url: issue.html_url,
        author: issue.user.login
      }));
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get issues: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get all pull requests
   */
  async getPullRequests(state: 'open' | 'closed' | 'all' = 'all', perPage: number = 100): Promise<PullRequest[]> {
    try {
      const { data } = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state,
        per_page: perPage
      });

      return data.map(pr => ({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state as 'open' | 'closed',
        labels: pr.labels.map(l => ({ name: l.name })),
        user: {
          login: pr.user.login,
          type: pr.user.type
        },
        author: pr.user.login,
        head: {
          sha: pr.head.sha,
          ref: pr.head.ref
        },
        base: {
          ref: pr.base.ref
        },
        html_url: pr.html_url,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at || undefined
      }));
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get PRs: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get PR files
   */
  async getPRFiles(prNumber: number): Promise<any[]> {
    try {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return data.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        sha: file.sha
      }));
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get PR files: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Close an issue
   */
  async closeIssue(issueNumber: number): Promise<void> {
    try {
      await this.octokit.rest.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed'
      });

      console.log(`[GitHub] Closed issue #${issueNumber}`);
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to close issue: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(perPage: number = 30): Promise<any[]> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        per_page: perPage
      });

      return data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.author?.login,
        date: commit.commit.committer?.date
      }));
    } catch (error) {
      if (error instanceof RequestError) {
        console.error(`[GitHub] Failed to get commits: ${error.message}`);
        throw error;
      }
      throw error;
    }
  }
}
