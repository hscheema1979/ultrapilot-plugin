/**
 * GitHub Service
 *
 * Core service for interacting with GitHub API using Octokit SDK.
 * Features:
 * - GitHub App authentication with auto-rotating installation tokens
 * - Sliding window rate limiting (not token bucket)
 * - ETag-based caching for efficient data retrieval
 * - Comprehensive error handling with retry logic
 * - GraphQL with pagination and cost tracking
 */

import { Octokit } from 'octokit';
import { RequestError } from '@octokit/request-error';
import { GitHubAppAuthManager } from './github-app-auth';
import type {
  GitHubIssue,
  CreateIssueParams,
  UpdateIssueParams,
  GitHubComment,
  CreateCommentParams,
  GitHubLabel,
  GraphQLIssuesResponse,
  GraphQLIssueNode,
  GraphQLQueryParams,
  CacheEntry,
  GitHubServiceConfig,
  RateLimitInfo,
} from '../../types/github-integration';
import {
  GitHubServiceError,
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubValidationError,
  parseGitHubError,
} from '../../types/github-integration';

/**
 * Sliding window rate limiter for GitHub API
 *
 * Uses GitHub's X-RateLimit headers to implement sliding window rate limiting.
 * Unlike token bucket, this respects GitHub's actual reset time.
 */
class GitHubRateLimiter {
  private limit: number = 5000;
  private remaining: number = 5000;
  private resetTime: number = 0; // Unix timestamp in seconds
  private resource: string = 'core';

  /**
   * Wait for rate limit availability if needed
   */
  async waitForAvailability(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // If we have requests remaining, proceed
    if (this.remaining > 1) {
      return;
    }

    // If we're rate limited and reset time is in the future, wait
    if (now < this.resetTime) {
      const waitTime = (this.resetTime - now) * 1000 + 1000; // Add 1s buffer
      console.warn(`[GitHub] Rate limit exceeded. Waiting ${waitTime / 1000}s until reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Update rate limit state from response headers
   */
  updateFromHeaders(headers: Headers | Record<string, string>): void {
    const getHeader = (name: string): string | null => {
      if (headers instanceof Headers) {
        return headers.get(name);
      }
      return headers[name.toLowerCase()] || headers[name] || null;
    };

    const limit = getHeader('X-RateLimit-Limit');
    const remaining = getHeader('X-RateLimit-Remaining');
    const reset = getHeader('X-RateLimit-Reset');
    const resource = getHeader('X-RateLimit-Resource');

    if (limit) this.limit = parseInt(limit, 10);
    if (remaining) this.remaining = parseInt(remaining, 10);
    if (reset) this.resetTime = parseInt(reset, 10);
    if (resource) this.resource = resource;
  }

  /**
   * Get current rate limit info
   */
  getRateLimitInfo(): RateLimitInfo {
    return {
      limit: this.limit,
      remaining: this.remaining,
      reset: this.resetTime,
      used: this.limit - this.remaining,
      resource: this.resource,
    };
  }

  /**
   * Check if approaching rate limit
   */
  isNearLimit(threshold: number = 100): boolean {
    return this.remaining <= threshold;
  }
}

/**
 * ETag-based cache for GitHub API responses
 */
class GitHubCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxAge: number;

  constructor(maxAge: number = 300000) { // Default: 5 minutes
    this.maxAge = maxAge;
  }

  /**
   * Get cached entry if still valid
   */
  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Set cache entry with ETag
   */
  set<T>(key: string, data: T, etag: string): void {
    this.cache.set(key, {
      data,
      etag,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * GitHub Service - Main API client
 */
export class GitHubService {
  private octokit: Octokit | null = null;
  private authManager: GitHubAppAuthManager;
  private rateLimiter: GitHubRateLimiter;
  private cache: GitHubCache;
  private config: GitHubServiceConfig;
  private installationId: number;

  // GraphQL cost tracking
  private graphqlCostUsed: number = 0;
  private graphqlCostLimit: number = 5000;

  constructor(config: GitHubServiceConfig, authManager: GitHubAppAuthManager) {
    this.config = config;
    this.authManager = authManager;
    this.rateLimiter = new GitHubRateLimiter();
    this.cache = new GitHubCache(config.cacheMaxAge);

    // Get installation ID from config or auth manager
    this.installationId = config.installationId || 0;

    // Initialize Octokit lazily
    this.initializeOctokit();
  }

  /**
   * Initialize Octokit with GitHub App authentication
   */
  public async initializeOctokit(): Promise<void> {
    if (this.octokit) return;

    try {
      const token = await this.authManager.getInstallationToken(this.installationId);

      this.octokit = new Octokit({
        auth: token,
        baseUrl: this.config.baseUrl,
        request: {
          fetch: this.fetchWithRateLimit.bind(this),
        },
      });

      console.log('[GitHub] Octokit initialized with GitHub App token');
    } catch (error) {
      console.error('[GitHub] Failed to initialize Octokit:', error);
      throw new GitHubAuthError('Failed to initialize GitHub client', error as Error);
    }
  }

  /**
   * Ensure Octokit is initialized
   */
  private async ensureOctokit(): Promise<Octokit> {
    if (!this.octokit) {
      await this.initializeOctokit();
    }

    // Check if token needs refresh (token expires after 1 hour)
    if (this.authManager.shouldRotateToken()) {
      console.log('[GitHub] Token rotation needed, refreshing...');
      await this.initializeOctokit();
    }

    return this.octokit!;
  }

  /**
   * Fetch wrapper with rate limiting and error handling
   */
  private async fetchWithRateLimit(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    await this.rateLimiter.waitForAvailability();

    const response = await fetch(input, init);

    // Update rate limiter from headers
    this.rateLimiter.updateFromHeaders(response.headers);

    // Warn if approaching rate limit
    if (this.rateLimiter.isNearLimit(100)) {
      console.warn(
        `[GitHub] Approaching rate limit: ${this.rateLimiter.getRateLimitInfo().remaining} remaining`
      );
    }

    return response;
  }

  /**
   * Execute API call with retry logic
   */
  private async executeWithRetry<T>(
    apiCall: () => Promise<T>,
    context: string
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication/authorization errors
        if (error instanceof GitHubAuthError ||
            error instanceof GitHubNotFoundError ||
            error instanceof GitHubValidationError) {
          throw error;
        }

        // Don't retry on RequestError with specific statuses
        if (error instanceof RequestError) {
          const status = error.status;
          if (status === 401 || status === 403 || status === 404 || status === 422) {
            throw parseGitHubError(error);
          }

          // Handle rate limit errors
          if (status === 403 && error.message.toLowerCase().includes('rate limit')) {
            const ghError = parseGitHubError(error);
            if (ghError instanceof GitHubRateLimitError) {
              await this.rateLimiter.waitForAvailability();
              continue;
            }
            throw ghError;
          }
        }

        // Retry 5xx errors with exponential backoff
        if (error instanceof RequestError && error.status && error.status >= 500) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.warn(`[GitHub] ${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // Don't retry other errors
        throw error instanceof RequestError ? parseGitHubError(error) : error;
      }
    }

    throw lastError || new GitHubServiceError('Max retries exceeded', 'MAX_RETRIES_EXCEEDED');
  }

  /**
   * Create a new issue
   */
  async createTask(params: CreateIssueParams): Promise<GitHubIssue> {
    const octokit = await this.ensureOctokit();

    return this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        ...params,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Invalidate cache for lists
      this.cache.clear();

      return response.data as GitHubIssue;
    }, 'createTask');
  }

  /**
   * Get a single issue with ETag caching
   */
  async getTask(issueNumber: number): Promise<GitHubIssue> {
    const octokit = await this.ensureOctokit();
    const cacheKey = `issue:${issueNumber}`;

    const cached = this.cache.get<GitHubIssue>(cacheKey);
    if (cached) {
      try {
        // Use If-None-Match header for conditional request
        const response = await octokit.rest.issues.get({
          owner: this.config.owner,
          repo: this.config.repo,
          issue_number: issueNumber,
          headers: {
            'If-None-Match': cached.etag,
          },
        });

        this.rateLimiter.updateFromHeaders(response.headers);

        if (response.status === 304) {
          console.log(`[GitHub] Issue ${issueNumber} not modified, using cache`);
          return cached.data;
        }

        // Update cache with fresh data
        const etag = response.headers.etag || '';
        this.cache.set(cacheKey, response.data as GitHubIssue, etag);
        return response.data as GitHubIssue;
      } catch (error) {
        if (error instanceof RequestError && error.status === 304) {
          return cached.data;
        }
        throw error;
      }
    }

    // No cache, fetch fresh data
    return this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.get({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Cache the response
      const etag = response.headers.etag || '';
      this.cache.set(cacheKey, response.data as GitHubIssue, etag);

      return response.data as GitHubIssue;
    }, 'getTask');
  }

  /**
   * Update an issue
   */
  async updateTask(issueNumber: number, params: UpdateIssueParams): Promise<GitHubIssue> {
    const octokit = await this.ensureOctokit();

    return this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.update({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        ...params,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Invalidate cache for this issue and lists
      this.cache.delete(`issue:${issueNumber}`);
      this.cache.clear();

      return response.data as GitHubIssue;
    }, 'updateTask');
  }

  /**
   * Get issues by label using GraphQL with pagination
   */
  async getTasksByLabel(label: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubIssue[]> {
    const octokit = await this.ensureOctokit();
    const issues: GitHubIssue[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const query = this.buildIssuesQuery([label], state, 100, cursor);

      try {
        const response = await octokit.graphql<{ repository: any }>(query, {
          owner: this.config.owner,
          repo: this.config.repo,
        });

        // Track GraphQL cost
        if (response.rateLimit) {
          this.updateGraphQLCost(response.rateLimit);
        }

        const repository = response.repository;
        if (!repository || !repository.issues) {
          break;
        }

        const issuesData = repository.issues;
        issues.push(...this.transformGraphQLIssues(issuesData.nodes));

        hasNextPage = issuesData.pageInfo.hasNextPage;
        cursor = issuesData.pageInfo.endCursor;
      } catch (error) {
        if (error instanceof RequestError) {
          throw parseGitHubError(error);
        }
        throw error;
      }
    }

    return issues;
  }

  /**
   * Get issues by queue label using GraphQL with pagination
   */
  async getTasksByQueue(queue: string): Promise<GitHubIssue[]> {
    const queueLabel = `queue:${queue}`;
    return this.getTasksByLabel(queueLabel);
  }

  /**
   * Add a label to an issue
   */
  async addLabel(issueNumber: number, label: string): Promise<void> {
    const octokit = await this.ensureOctokit();

    await this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.addLabels({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        labels: [label],
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Invalidate cache
      this.cache.delete(`issue:${issueNumber}`);
      this.cache.clear();
    }, 'addLabel');
  }

  /**
   * Remove a label from an issue
   */
  async removeLabel(issueNumber: number, label: string): Promise<void> {
    const octokit = await this.ensureOctokit();

    await this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.removeLabel({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        name: label,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Invalidate cache
      this.cache.delete(`issue:${issueNumber}`);
      this.cache.clear();
    }, 'removeLabel').catch((error) => {
      // Ignore 404 if label doesn't exist
      if (error instanceof GitHubNotFoundError) {
        console.warn(`[GitHub] Label ${label} not found on issue ${issueNumber}`);
        return;
      }
      throw error;
    });
  }

  /**
   * Execute GraphQL query
   */
  async graphql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const octokit = await this.ensureOctokit();

    return this.executeWithRetry(async () => {
      const response = await octokit.graphql<T>(query, {
        ...variables,
      });

      // Track GraphQL cost if available
      if (response && typeof response === 'object' && 'rateLimit' in response) {
        this.updateGraphQLCost((response as any).rateLimit);
      }

      return response as T;
    }, 'graphql');
  }

  /**
   * Create a label in the repository
   */
  async createLabel(name: string, color: string, description?: string): Promise<void> {
    const octokit = await this.ensureOctokit();

    await this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.createLabel({
        owner: this.config.owner,
        repo: this.config.repo,
        name,
        color,
        description,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      // Invalidate cache
      this.cache.clear();
    }, 'createLabel').catch((error) => {
      // Ignore error if label already exists
      if (error instanceof GitHubValidationError) {
        console.warn(`[GitHub] Label ${name} already exists`);
        return;
      }
      throw error;
    });
  }

  /**
   * Add a comment to an issue
   */
  async createComment(issueNumber: number, params: CreateCommentParams): Promise<GitHubComment> {
    const octokit = await this.ensureOctokit();

    return this.executeWithRetry(async () => {
      const response = await octokit.rest.issues.createComment({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        ...params,
      });

      this.rateLimiter.updateFromHeaders(response.headers);

      return response.data as GitHubComment;
    }, 'createComment');
  }

  /**
   * Get rate limit info
   */
  getRateLimitInfo(): RateLimitInfo {
    return this.rateLimiter.getRateLimitInfo();
  }

  /**
   * Get GraphQL cost info
   */
  getGraphQLCostInfo(): { used: number; limit: number; remaining: number } {
    return {
      used: this.graphqlCostUsed,
      limit: this.graphqlCostLimit,
      remaining: this.graphqlCostLimit - this.graphqlCostUsed,
    };
  }

  /**
   * Update GraphQL cost tracking
   */
  private updateGraphQLCost(rateLimit: any): void {
    if (rateLimit.remaining !== undefined) {
      this.graphqlCostLimit = rateLimit.limit;
      this.graphqlCostUsed = rateLimit.limit - rateLimit.remaining;
    }

    if (rateLimit.cost !== undefined) {
      this.graphqlCostUsed += rateLimit.cost;
    }

    // Warn if approaching GraphQL limit
    const remaining = this.graphqlCostLimit - this.graphqlCostUsed;
    if (remaining < 500) {
      console.warn(`[GitHub] GraphQL cost running low: ${remaining} remaining`);
    }
  }

  /**
   * Build GraphQL query for issues
   */
  private buildIssuesQuery(
    labels: string[],
    state: 'open' | 'closed' | 'all' = 'open',
    first: number = 100,
    after: string | null = null
  ): string {
    const labelsStr = labels.map(l => `"${l}"`).join(', ');
    const afterStr = after ? `, after: "${after}"` : '';

    return `
      query ($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues(first: ${first}${afterStr}, labels: [${labelsStr}], states: [${state}]) {
            nodes {
              id
              number
              title
              state
              body
              labels(first: 20) {
                nodes {
                  id
                  name
                  color
                  description
                }
              }
              assignees(first: 10) {
                nodes {
                  login
                  id
                  avatarUrl
                }
              }
              comments {
                totalCount
              }
              createdAt
              updatedAt
              closedAt
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            totalCount
          }
        }
        rateLimit {
          limit
          remaining
          resetAt
          cost
        }
      }
    `;
  }

  /**
   * Transform GraphQL issues to REST format
   */
  private transformGraphQLIssues(nodes: GraphQLIssueNode[]): GitHubIssue[] {
    return nodes.map(node => ({
      id: parseInt(String(node.id).replace(/\D/g, ''), 10),
      node_id: String(node.id),
      url: '', // Can be constructed if needed
      number: node.number,
      title: node.title,
      state: node.state,
      locked: false,
      labels: node.labels.nodes.map(label => ({
        id: parseInt(String(label.id).replace(/\D/g, ''), 10),
        node_id: String(label.id),
        url: '',
        name: label.name,
        color: label.color,
        default: false,
        description: label.description,
      })),
      user: {
        login: '', // Not returned in this query
        id: 0,
        node_id: '',
        avatar_url: '',
        type: 'User',
      },
      assignee: null, // First assignee
      assignees: node.assignees.nodes.map(assignee => ({
        login: assignee.login,
        id: assignee.id,
        node_id: String(assignee.id),
        avatar_url: assignee.avatar_url || assignee.avatarUrl,
        type: 'User',
      })),
      comments: node.comments.totalCount,
      created_at: node.createdAt,
      updated_at: node.updatedAt,
      closed_at: node.closedAt,
      body: node.body,
    }));
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Close service connection
   */
  async close(): Promise<void> {
    this.cache.clear();
    this.octokit = null;
    await this.authManager.close();
  }
}

/**
 * Factory function to create GitHubService instance
 */
export async function createGitHubService(
  config: GitHubServiceConfig,
  authManager: GitHubAppAuthManager
): Promise<GitHubService> {
  const service = new GitHubService(config, authManager);
  await service.initializeOctokit();
  return service;
}
