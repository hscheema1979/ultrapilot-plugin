/**
 * GitHub Integration Types
 *
 * Type definitions for GitHub API interactions including issues,
 * pull requests, comments, labels, and rate limiting.
 */

import { RequestError } from '@octokit/request-error';

/**
 * GitHub issue state
 */
export type IssueState = 'open' | 'closed' | 'all';

/**
 * GitHub issue sort field and direction
 */
export type IssueSortField = 'created' | 'updated' | 'comments';
export type SortDirection = 'asc' | 'desc';

/**
 * GitHub issue label
 */
export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
}

/**
 * GitHub issue user
 */
export interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  type: string;
}

/**
 * GitHub issue
 */
export interface GitHubIssue {
  id: number;
  node_id: string;
  url: string;
  number: number;
  title: string;
  state: IssueState;
  locked: boolean;
  labels: GitHubLabel[];
  user: GitHubUser;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  body: string | null;
}

/**
 * Issue creation parameters
 */
export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * Issue update parameters
 */
export interface UpdateIssueParams {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
}

/**
 * GitHub comment
 */
export interface GitHubComment {
  id: number;
  node_id: string;
  url: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  issue_url: string;
}

/**
 * Comment creation parameters
 */
export interface CreateCommentParams {
  body: string;
}

/**
 * Rate limit info from GitHub headers
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
  resource: string;
}

/**
 * GraphQL response format for issues
 */
export interface GraphQLIssuesResponse {
  repository?: {
    issues?: {
      nodes: GraphQLIssueNode[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount: number;
    };
  };
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: string;
    cost: number;
  };
}

/**
 * GraphQL issue node
 */
export interface GraphQLIssueNode {
  id: string;
  number: number;
  title: string;
  state: IssueState;
  body: string | null;
  labels: {
    nodes: GraphQLLabelNode[];
  };
  assignees: {
    nodes: GraphQLUserNode[];
  };
  comments: {
    totalCount: number;
  };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/**
 * GraphQL label node (different from REST format)
 */
export interface GraphQLLabelNode {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

/**
 * GraphQL user node (different from REST format)
 */
export interface GraphQLUserNode {
  login: string;
  id: number;
  avatarUrl?: string;
  avatar_url?: string;
}

/**
 * GraphQL query parameters
 */
export interface GraphQLQueryParams {
  owner: string;
  repo: string;
  labels?: string[];
  state?: IssueState;
  first?: number;
  after?: string;
}

/**
 * Cache entry with ETag
 */
export interface CacheEntry<T> {
  data: T;
  etag: string;
  timestamp: number;
}

/**
 * GitHub service configuration
 */
export interface GitHubServiceConfig {
  owner: string;
  repo: string;
  installationId?: number;
  baseUrl?: string;
  cacheMaxAge?: number; // milliseconds
}

/**
 * Error types for GitHub operations
 */
export class GitHubServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'GitHubServiceError';
  }
}

export class GitHubRateLimitError extends GitHubServiceError {
  constructor(
    message: string,
    public resetTime: number,
    public retryAfter: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 403);
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubAuthError extends GitHubServiceError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'AUTHENTICATION_FAILED', 401, originalError);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubNotFoundError extends GitHubServiceError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'GitHubNotFoundError';
  }
}

export class GitHubValidationError extends GitHubServiceError {
  constructor(message: string, public errors?: any[]) {
    super(message, 'VALIDATION_ERROR', 422);
    this.name = 'GitHubValidationError';
  }
}

/**
 * Parse Octokit RequestError into appropriate GitHubServiceError
 */
export function parseGitHubError(error: RequestError): GitHubServiceError {
  const status = error.status;
  const message = error.message || 'GitHub API error';

  switch (status) {
    case 401:
      return new GitHubAuthError('Authentication failed. Check GitHub App credentials.', error);
    case 403:
      // Check if it's a rate limit error
      if (message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('api rate limit')) {
        const resetTime = parseRateLimitReset(error);
        const retryAfter = calculateRetryAfter(resetTime);
        return new GitHubRateLimitError('GitHub rate limit exceeded', resetTime, retryAfter);
      }
      return new GitHubServiceError(message, 'FORBIDDEN', 403, error);
    case 404:
      return new GitHubNotFoundError('Resource');
    case 422:
      return new GitHubValidationError(message, (error as any).response?.data?.errors);
    default:
      return new GitHubServiceError(message, 'UNKNOWN', status, error);
  }
}

/**
 * Parse rate limit reset time from error headers
 */
function parseRateLimitReset(error: RequestError): number {
  const resetHeader = error.response?.headers['x-ratelimit-reset'];
  if (resetHeader) {
    return parseInt(resetHeader, 10) * 1000; // Convert to milliseconds
  }
  return Date.now() + 60000; // Default: 1 minute from now
}

/**
 * Calculate retry-after duration in milliseconds
 */
function calculateRetryAfter(resetTime: number): number {
  return Math.max(0, resetTime - Date.now());
}

/**
 * Task queue labels used in the autopilot system
 */
export const TASK_QUEUE_LABELS = {
  BACKLOG: 'queue:backlog',
  READY: 'queue:ready',
  IN_PROGRESS: 'queue:in-progress',
  REVIEW: 'queue:review',
  DONE: 'queue:done',
} as const;

/**
 * Task priority labels
 */
export const TASK_PRIORITY_LABELS = {
  CRITICAL: 'priority:critical',
  HIGH: 'priority:high',
  MEDIUM: 'priority:medium',
  LOW: 'priority:low',
} as const;

/**
 * Task size labels
 */
export const TASK_SIZE_LABELS = {
  XLARGE: 'size:xl',
  LARGE: 'size:lg',
  MEDIUM: 'size:md',
  SMALL: 'size:sm',
  XSMALL: 'size:xs',
} as const;
