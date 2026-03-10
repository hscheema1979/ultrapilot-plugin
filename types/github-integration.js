/**
 * GitHub Integration Types
 *
 * Type definitions for GitHub API interactions including issues,
 * pull requests, comments, labels, and rate limiting.
 */
/**
 * Error types for GitHub operations
 */
export class GitHubServiceError extends Error {
    code;
    statusCode;
    originalError;
    constructor(message, code, statusCode, originalError) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.originalError = originalError;
        this.name = 'GitHubServiceError';
    }
}
export class GitHubRateLimitError extends GitHubServiceError {
    resetTime;
    retryAfter;
    constructor(message, resetTime, retryAfter) {
        super(message, 'RATE_LIMIT_EXCEEDED', 403);
        this.resetTime = resetTime;
        this.retryAfter = retryAfter;
        this.name = 'GitHubRateLimitError';
    }
}
export class GitHubAuthError extends GitHubServiceError {
    originalError;
    constructor(message, originalError) {
        super(message, 'AUTHENTICATION_FAILED', 401, originalError);
        this.originalError = originalError;
        this.name = 'GitHubAuthError';
    }
}
export class GitHubNotFoundError extends GitHubServiceError {
    constructor(resource) {
        super(`${resource} not found`, 'NOT_FOUND', 404);
        this.name = 'GitHubNotFoundError';
    }
}
export class GitHubValidationError extends GitHubServiceError {
    errors;
    constructor(message, errors) {
        super(message, 'VALIDATION_ERROR', 422);
        this.errors = errors;
        this.name = 'GitHubValidationError';
    }
}
/**
 * Parse Octokit RequestError into appropriate GitHubServiceError
 */
export function parseGitHubError(error) {
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
            return new GitHubValidationError(message, error.response?.data?.errors);
        default:
            return new GitHubServiceError(message, 'UNKNOWN', status, error);
    }
}
/**
 * Parse rate limit reset time from error headers
 */
function parseRateLimitReset(error) {
    const resetHeader = error.response?.headers['x-ratelimit-reset'];
    if (resetHeader) {
        return parseInt(resetHeader, 10) * 1000; // Convert to milliseconds
    }
    return Date.now() + 60000; // Default: 1 minute from now
}
/**
 * Calculate retry-after duration in milliseconds
 */
function calculateRetryAfter(resetTime) {
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
};
/**
 * Task priority labels
 */
export const TASK_PRIORITY_LABELS = {
    CRITICAL: 'priority:critical',
    HIGH: 'priority:high',
    MEDIUM: 'priority:medium',
    LOW: 'priority:low',
};
/**
 * Task size labels
 */
export const TASK_SIZE_LABELS = {
    XLARGE: 'size:xl',
    LARGE: 'size:lg',
    MEDIUM: 'size:md',
    SMALL: 'size:sm',
    XSMALL: 'size:xs',
};
//# sourceMappingURL=github-integration.js.map