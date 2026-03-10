/**
 * Claude API Client
 *
 * Production-ready client for Anthropic Claude Messages API
 * Features: Rate limiting, retries, error handling, token tracking
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelTier,
  ModelMapping,
  TokenUsage,
  AgentExecutionResult,
  RetryConfig,
  ExecutionOptions,
  ClaudeAPIClientConfig
} from './types/claude';
import {
  DEFAULT_MODELS,
  DEFAULT_RETRY_CONFIG
} from './types/claude';

/**
 * Claude API Client
 *
 * Handles all interactions with Anthropic Claude Messages API
 */
export class ClaudeAPIClient {
  private client: Anthropic;
  private models: ModelMapping;
  private retryConfig: RetryConfig;

  constructor(config: ClaudeAPIClientConfig) {
    // Validate API key
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('Claude API key is required');
    }

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout || 60000 // Default 60s timeout
    });

    // Set model mappings
    this.models = {
      opus: config.models?.opus || DEFAULT_MODELS.opus,
      sonnet: config.models?.sonnet || DEFAULT_MODELS.sonnet,
      haiku: config.models?.haiku || DEFAULT_MODELS.haiku
    };

    // Set retry configuration
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.defaultRetryConfig
    };
  }

  /**
   * Execute agent with Claude API
   *
   * @param prompt - Agent prompt/instructions
   * @param modelTier - Model tier (opus/sonnet/haiku)
   * @param options - Execution options
   * @returns Execution result with output and metadata
   */
  async execute(
    prompt: string,
    modelTier: ModelTier = 'sonnet',
    options: ExecutionOptions = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const modelId = this.mapModel(modelTier);

    console.log(`[ClaudeAPI] Executing ${modelTier} (${modelId})`);
    console.log(`[ClaudeAPI] Prompt length: ${prompt.length} chars`);

    try {
      const response = await this.executeWithRetry(
        prompt,
        modelId,
        options
      );

      const result: AgentExecutionResult = {
        output: this.extractText(response),
        tokens: this.extractTokenUsage(response),
        model: modelId,
        duration: Date.now() - startTime,
        success: true
      };

      console.log(`[ClaudeAPI] Execution complete:`, {
        duration: `${result.duration}ms`,
        tokens: result.tokens,
        model: modelTier
      });

      return result;

    } catch (error) {
      return this.handleExecutionError(error, modelId, startTime);
    }
  }

  /**
   * Execute with automatic retry logic
   */
  private async executeWithRetry(
    prompt: string,
    modelId: string,
    options: ExecutionOptions,
    attempt: number = 0
  ): Promise<Anthropic.Message> {
    try {
      // Disable streaming for non-streaming mode
      const stream = options.stream || false;

      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: options.stopSequences,
        stream,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Type assertion: we know it's a Message when stream=false
      return response as Anthropic.Message;

    } catch (error: any) {
      // Check if we should retry
      if (this.shouldRetry(error, attempt)) {
        const delay = this.calculateDelay(attempt);

        console.warn(`[ClaudeAPI] Retry ${attempt + 1}/${this.retryConfig.maxRetries} ` +
                     `after ${delay}ms: ${error.message}`);

        await this.delay(delay);
        return this.executeWithRetry(prompt, modelId, options, attempt + 1);
      }

      // Don't retry, throw the error
      throw error;
    }
  }

  /**
   * Determine if error is retryable
   */
  private shouldRetry(error: any, attempt: number): boolean {
    // Max retries exceeded
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    // Rate limit (429) - Always retry
    if (error.status === 429) {
      return true;
    }

    // Server errors (5xx) - Retry
    if (error.status && error.status >= 500 && error.status < 600) {
      return true;
    }

    // Network errors - Retry
    if (error.type === 'network' || error.code === 'ECONNRESET') {
      return true;
    }

    // Don't retry other errors (4xx client errors, auth, etc.)
    return false;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number): number {
    const delay = this.retryConfig.initialDelay *
                  Math.pow(this.retryConfig.backoffMultiplier, attempt);

    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract text from response
   */
  private extractText(response: Anthropic.Message): string {
    if (response.content && response.content.length > 0) {
      const block = response.content[0];

      if (block.type === 'text') {
        return block.text;
      }
    }

    return '';
  }

  /**
   * Extract token usage from response
   */
  private extractTokenUsage(response: Anthropic.Message): TokenUsage {
    const input = response.usage?.input_tokens || 0;
    const output = response.usage?.output_tokens || 0;

    return {
      input,
      output,
      total: input + output
    };
  }

  /**
   * Handle execution error
   */
  private handleExecutionError(
    error: any,
    modelId: string,
    startTime: number
  ): AgentExecutionResult {
    console.error(`[ClaudeAPI] Execution failed:`, error);

    let errorMessage = 'Unknown error';

    if (error.message) {
      errorMessage = error.message;
    }

    if (error.status) {
      errorMessage = `API Error ${error.status}: ${errorMessage}`;
    }

    return {
      output: '',
      tokens: { input: 0, output: 0, total: 0 },
      model: modelId,
      duration: Date.now() - startTime,
      success: false,
      error: errorMessage
    };
  }

  /**
   * Map model tier to Claude model ID
   */
  private mapModel(modelTier: ModelTier): string {
    return this.models[modelTier] || this.models.sonnet;
  }

  /**
   * Health check - Verify API key is valid
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.models.haiku,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      });

      console.log(`[ClaudeAPI] Health check passed`);
      return true;

    } catch (error) {
      console.error(`[ClaudeAPI] Health check failed:`, error);
      return false;
    }
  }
}

/**
 * Global client instance (initialized on first use)
 */
let globalClient: ClaudeAPIClient | null = null;

/**
 * Get or create global Claude API client
 */
export function getClaudeClient(): ClaudeAPIClient {
  if (!globalClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    globalClient = new ClaudeAPIClient({ apiKey });
  }

  return globalClient;
}

/**
 * Reset global client (useful for testing)
 */
export function resetClaudeClient(): void {
  globalClient = null;
}

/**
 * Convenience function for wshobson agent integration
 * Reuses existing ClaudeAPIClient singleton
 *
 * @param prompt - Agent prompt/instructions
 * @param model - Model tier (opus/sonnet/haiku)
 * @param options - Execution options
 * @returns Execution result with output and metadata
 */
export async function executeWshobsonAgent(
  prompt: string,
  model: 'opus' | 'sonnet' | 'haiku',
  options: {
    maxTokens?: number;
    systemPrompt?: string;
    tools?: any[];
  } = {}
): Promise<{ output: string; usage: any }> {
  const client = getClaudeClient();

  const modelMapping = {
    opus: 'claude-3-7-opus-20250219',
    sonnet: 'claude-3-7-sonnet-20250219',
    haiku: 'claude-3-5-haiku-20241022'
  };

  // Build execution options
  const execOptions: ExecutionOptions = {
    maxTokens: options.maxTokens || 4096,
    systemPrompt: options.systemPrompt,
    tools: options.tools || []
  };

  // Execute using existing client
  const result = await client.execute(prompt, model, execOptions);

  return {
    output: result.output,
    usage: result.tokens
  };
}
