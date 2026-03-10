/**
 * GitHub State Adapter
 *
 * Adapter for reading/writing state to GitHub issue bodies using YAML frontmatter.
 * This follows the correct pattern of storing state in issue bodies, NOT comments.
 *
 * Issue body format:
 * ---
 * state_id: abc123
 * type: task_queue
 * updated_at: 2026-03-04T12:00:00Z
 * version: 1
 * ---
 *
 * This is human-readable content that appears in GitHub UI.
 * State is stored in YAML frontmatter above.
 */

import * as YAML from 'js-yaml';
import { GitHubService } from './github-service';
import type { GitHubIssue } from '../../types/github-integration';

/**
 * State object stored in GitHub issue frontmatter
 */
export interface StateObject {
  state_id: string;
  type: StateType;
  updated_at: string;
  version: number;
  data: Record<string, any>;
}

/**
 * Supported state types
 */
export type StateType =
  | 'task_queue'        // Task queues (intake, active, review, done, failed, blocked)
  | 'agent_state'       // Agent state (claims, assignments)
  | 'migration_progress' // Migration progress tracking
  | 'autopilot_state'   // Autopilot execution state
  | 'ralph_state'       // Ralph loop state
  | 'ultraqa_state'     // UltraQA cycle state
  | 'validation_state'; // Validation review state

/**
 * Task queue state data
 */
export interface TaskQueueState {
  queue_name: 'intake' | 'active' | 'review' | 'done' | 'failed' | 'blocked';
  task_count: number;
  tasks: Array<{
    id: string;
    title: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    size: 'xl' | 'lg' | 'md' | 'sm' | 'xs';
    created_at: string;
  }>;
}

/**
 * Agent state data
 */
export interface AgentStateData {
  agent_id: string;
  agent_type: string;
  claimed_tasks: string[];
  current_task?: string;
  status: 'idle' | 'active' | 'paused' | 'error';
  last_activity: string;
}

/**
 * Migration progress state data
 */
export interface MigrationProgressState {
  phase: string;
  step: number;
  total_steps: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  errors?: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
}

/**
 * Parsed issue body with frontmatter and content
 */
interface ParsedBody {
  frontmatter: Record<string, any>;
  content: string;
}

/**
 * Error thrown when state parsing fails
 */
export class StateParseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'StateParseError';
  }
}

/**
 * Error thrown when state version conflict is detected
 */
export class StateVersionConflictError extends Error {
  constructor(
    message: string,
    public currentVersion: number,
    public expectedVersion: number | null
  ) {
    super(message);
    this.name = 'StateVersionConflictError';
  }
}

/**
 * Options for state operations
 */
export interface StateOptions {
  /**
   * Expected version for optimistic concurrency control
   * If provided, operation will fail if current version doesn't match
   */
  expectedVersion?: number;

  /**
   * Whether to preserve human-readable content below frontmatter
   * @default true
   */
  preserveContent?: boolean;

  /**
   * Human-readable content to set below frontmatter
   * Only used if preserveContent is false
   */
  content?: string;
}

/**
 * GitHub State Adapter
 *
 * Manages state persistence using GitHub issue bodies with YAML frontmatter.
 */
export class GitHubStateAdapter {
  constructor(
    private githubService: GitHubService,
    private options: {
      /**
       * Whether to enable optimistic concurrency control
       * @default true
       */
      enableConcurrencyControl?: boolean;

      /**
       * Maximum number of retry attempts for version conflicts
       * @default 3
       */
      maxRetries?: number;
    } = {}
  ) {
    this.options = {
      enableConcurrencyControl: true,
      maxRetries: 3,
      ...options,
    };
  }

  /**
   * Read state from a GitHub issue
   *
   * @param issueNumber - The issue number to read from
   * @returns The parsed state object
   * @throws StateParseError if the issue body cannot be parsed
   * @throws Error if the issue cannot be fetched
   */
  async readState(issueNumber: number): Promise<StateObject> {
    const issue = await this.githubService.getTask(issueNumber);

    if (!issue.body) {
      throw new StateParseError(`Issue #${issueNumber} has no body`);
    }

    return this.parseState(issue.body);
  }

  /**
   * Write state to a GitHub issue
   *
   * @param issueNumber - The issue number to update
   * @param state - The state object to write
   * @param options - Optional parameters for the write operation
   * @throws StateVersionConflictError if version conflict is detected
   * @throws Error if the issue cannot be updated
   */
  async writeState(
    issueNumber: number,
    state: StateObject,
    options: StateOptions = {}
  ): Promise<void> {
    await this.writeStateWithRetry(issueNumber, state, options, 0);
  }

  /**
   * Update state in a GitHub issue with partial data
   *
   * @param issueNumber - The issue number to update
   * @param updates - Partial state data to merge
   * @param options - Optional parameters for the update operation
   * @throws StateVersionConflictError if version conflict is detected
   * @throws Error if the issue cannot be updated
   */
  async updateState(
    issueNumber: number,
    updates: Partial<StateObject> & { data?: Partial<Record<string, any>> },
    options: StateOptions = {}
  ): Promise<void> {
    // Read current state
    const currentState = await this.readState(issueNumber);

    // Merge updates
    const updatedState: StateObject = {
      ...currentState,
      ...updates,
      updated_at: new Date().toISOString(),
      version: currentState.version + 1,
    };

    // Merge data if provided
    if (updates.data) {
      updatedState.data = {
        ...currentState.data,
        ...updates.data,
      };
    }

    // Write updated state
    await this.writeState(issueNumber, updatedState, {
      ...options,
      expectedVersion: options.expectedVersion ?? currentState.version,
    });
  }

  /**
   * Parse state from an issue body string
   *
   * @param body - The issue body to parse
   * @returns The parsed state object
   * @throws StateParseError if the body cannot be parsed
   */
  parseState(body: string): StateObject {
    return parseStateFromBody(body);
  }

  /**
   * Serialize state to an issue body string
   *
   * @param state - The state object to serialize
   * @param content - Optional human-readable content to include below frontmatter
   * @returns The serialized issue body
   */
  serializeState(state: StateObject, content: string = ''): string {
    return serializeStateBody(state, content);
  }

  /**
   * Create a new state object
   *
   * @param type - The type of state
   * @param data - The state data
   * @returns A new state object
   */
  createState(type: StateType, data: Record<string, any>): StateObject {
    return {
      state_id: generateStateId(),
      type,
      updated_at: new Date().toISOString(),
      version: 1,
      data,
    };
  }

  /**
   * Check if an issue has valid state
   *
   * @param issueNumber - The issue number to check
   * @returns True if the issue has valid state, false otherwise
   */
  async hasState(issueNumber: number): Promise<boolean> {
    try {
      await this.readState(issueNumber);
      return true;
    } catch (error) {
      if (error instanceof StateParseError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get state type from an issue
   *
   * @param issueNumber - The issue number to check
   * @returns The state type, or null if the issue has no valid state
   */
  async getStateType(issueNumber: number): Promise<StateType | null> {
    try {
      const state = await this.readState(issueNumber);
      return state.type;
    } catch (error) {
      if (error instanceof StateParseError) {
        return null;
      }
      throw error;
    }
  }

  // Private methods

  /**
   * Write state with retry for version conflicts
   */
  private async writeStateWithRetry(
    issueNumber: number,
    state: StateObject,
    options: StateOptions,
    attempt: number
  ): Promise<void> {
    try {
      // Check version if expected version is provided
      if (this.options.enableConcurrencyControl && options.expectedVersion !== undefined) {
        const currentIssue = await this.githubService.getTask(issueNumber);

        if (currentIssue.body) {
          try {
            const currentState = this.parseState(currentIssue.body);

            if (currentState.version !== options.expectedVersion) {
              throw new StateVersionConflictError(
                `Version conflict: expected ${options.expectedVersion}, got ${currentState.version}`,
                currentState.version,
                options.expectedVersion
              );
            }
          } catch (error) {
            // If we can't parse current state, proceed with write
            if (!(error instanceof StateVersionConflictError)) {
              console.warn(`Failed to parse current state, proceeding with write:`, error);
            } else {
              throw error;
            }
          }
        }
      }

      // Get current issue to preserve content if needed
      let content = options.content ?? '';
      if (options.preserveContent !== false && !options.content) {
        try {
          const currentIssue = await this.githubService.getTask(issueNumber);
          if (currentIssue.body) {
            const parsed = parseBody(currentIssue.body);
            content = parsed.content;
          }
        } catch (error) {
          // If we can't read current issue, use empty content
          console.warn(`Failed to read current issue body:`, error);
        }
      }

      // Serialize state with content
      const newBody = this.serializeState(state, content);

      // Update issue
      await this.githubService.updateTask(issueNumber, { body: newBody });
    } catch (error) {
      // Retry on version conflicts
      if (
        error instanceof StateVersionConflictError &&
        attempt < (this.options.maxRetries ?? 3)
      ) {
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));

        // Update expected version and retry
        await this.writeStateWithRetry(
          issueNumber,
          state,
          {
            ...options,
            expectedVersion: error.currentVersion,
          },
          attempt + 1
        );
        return;
      }

      throw error;
    }
  }

  /**
   * Validate state type
   */
  private isValidStateType(type: string): type is StateType {
    return isValidStateType(type);
  }

  /**
   * Generate a unique state ID
   */
  private generateStateId(): string {
    return generateStateId();
  }
}

/**
 * Parse issue body into frontmatter and content
 */
function parseBody(body: string): ParsedBody {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = body.match(frontmatterRegex);

  if (!match) {
    throw new StateParseError('Issue body does not contain valid YAML frontmatter');
  }

  const [, frontmatterStr, content] = match;

  let frontmatter: Record<string, any>;
  try {
    frontmatter = YAML.load(frontmatterStr) as Record<string, any>;

    // Convert Date objects to ISO strings for consistency
    if (frontmatter.updated_at instanceof Date) {
      frontmatter.updated_at = frontmatter.updated_at.toISOString();
    }
  } catch (error) {
    throw new StateParseError('Failed to parse YAML frontmatter', error as Error);
  }

  return {
    frontmatter,
    content: content.trim(),
  };
}

/**
 * Validate state type
 */
function isValidStateType(type: string): type is StateType {
  const validTypes: StateType[] = [
    'task_queue',
    'agent_state',
    'migration_progress',
    'autopilot_state',
    'ralph_state',
    'ultraqa_state',
    'validation_state',
  ];
  return validTypes.includes(type as StateType);
}

/**
 * Generate a unique state ID
 */
function generateStateId(): string {
  return `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse state from an issue body string (standalone utility for testing)
 *
 * @param body - The issue body to parse
 * @returns The parsed state object
 * @throws StateParseError if the body cannot be parsed
 */
export function parseStateFromBody(body: string): StateObject {
  try {
    const parsed = parseBody(body);

    // Validate required fields
    const requiredFields: (keyof StateObject)[] = ['state_id', 'type', 'updated_at', 'version', 'data'];
    for (const field of requiredFields) {
      if (!(field in parsed.frontmatter)) {
        throw new StateParseError(`Missing required field: ${field}`);
      }
    }

    // Validate type
    if (!isValidStateType(parsed.frontmatter.type)) {
      throw new StateParseError(`Invalid state type: ${parsed.frontmatter.type}`);
    }

    return parsed.frontmatter as StateObject;
  } catch (error) {
    if (error instanceof StateParseError) {
      throw error;
    }
    throw new StateParseError('Failed to parse state from issue body', error as Error);
  }
}

/**
 * Serialize state to an issue body string (standalone utility for testing)
 *
 * @param state - The state object to serialize
 * @param content - Optional human-readable content to include below frontmatter
 * @returns The serialized issue body
 */
export function serializeStateBody(state: StateObject, content: string = ''): string {
  // Update timestamp if not already set
  const stateToSerialize = {
    ...state,
    updated_at: state.updated_at || new Date().toISOString(),
  };

  // Serialize frontmatter
  const frontmatter = YAML.dump(stateToSerialize, {
    indent: 2,
    lineWidth: -1, // Don't line wrap
    noRefs: true,  // Don't use anchors/aliases
    sortKeys: false, // Preserve key order
  });

  // Combine frontmatter with content
  return `---\n${frontmatter}---\n${content}`;
}

/**
 * Factory function to create a GitHubStateAdapter instance
 */
export function createGitHubStateAdapter(
  githubService: GitHubService,
  options?: ConstructorParameters<typeof GitHubStateAdapter>[1]
): GitHubStateAdapter {
  return new GitHubStateAdapter(githubService, options);
}
