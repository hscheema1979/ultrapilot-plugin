/**
 * Claude API Types
 *
 * TypeScript interfaces for Anthropic Claude Messages API integration
 */

/**
 * Model mapping from UltraPilot model names to Claude model IDs
 */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

export interface ModelMapping {
  opus: string;
  sonnet: string;
  haiku: string;
}

/**
 * Default model mappings
 */
export const DEFAULT_MODELS: ModelMapping = {
  opus: 'claude-3-7-opus-20250219',
  sonnet: 'claude-3-7-sonnet-20250219',
  haiku: 'claude-3-5-haiku-20241022'
};

/**
 * Token usage tracking
 */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  output: string;
  tokens: TokenUsage;
  model: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Claude API error types
 */
export interface ClaudeAPIError {
  type: string;
  message: string;
  status?: number;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

/**
 * Execution options
 */
export interface ExecutionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  retryConfig?: Partial<RetryConfig>;
}

/**
 * API client configuration
 */
export interface ClaudeAPIClientConfig {
  apiKey: string;
  models?: Partial<ModelMapping>;
  baseURL?: string;
  timeout?: number;
  defaultRetryConfig?: Partial<RetryConfig>;
}
