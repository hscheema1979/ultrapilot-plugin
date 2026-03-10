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
    reset: number;
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
    cacheMaxAge?: number;
}
/**
 * Error types for GitHub operations
 */
export declare class GitHubServiceError extends Error {
    code: string;
    statusCode?: number | undefined;
    originalError?: Error | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined, originalError?: Error | undefined);
}
export declare class GitHubRateLimitError extends GitHubServiceError {
    resetTime: number;
    retryAfter: number;
    constructor(message: string, resetTime: number, retryAfter: number);
}
export declare class GitHubAuthError extends GitHubServiceError {
    originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
export declare class GitHubNotFoundError extends GitHubServiceError {
    constructor(resource: string);
}
export declare class GitHubValidationError extends GitHubServiceError {
    errors?: any[] | undefined;
    constructor(message: string, errors?: any[] | undefined);
}
/**
 * Parse Octokit RequestError into appropriate GitHubServiceError
 */
export declare function parseGitHubError(error: RequestError): GitHubServiceError;
/**
 * Task queue labels used in the autopilot system
 */
export declare const TASK_QUEUE_LABELS: {
    readonly BACKLOG: "queue:backlog";
    readonly READY: "queue:ready";
    readonly IN_PROGRESS: "queue:in-progress";
    readonly REVIEW: "queue:review";
    readonly DONE: "queue:done";
};
/**
 * Task priority labels
 */
export declare const TASK_PRIORITY_LABELS: {
    readonly CRITICAL: "priority:critical";
    readonly HIGH: "priority:high";
    readonly MEDIUM: "priority:medium";
    readonly LOW: "priority:low";
};
/**
 * Task size labels
 */
export declare const TASK_SIZE_LABELS: {
    readonly XLARGE: "size:xl";
    readonly LARGE: "size:lg";
    readonly MEDIUM: "size:md";
    readonly SMALL: "size:sm";
    readonly XSMALL: "size:xs";
};
//# sourceMappingURL=github-integration.d.ts.map