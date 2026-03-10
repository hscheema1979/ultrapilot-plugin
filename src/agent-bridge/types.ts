/**
 * Agent Bridge - Types and Interfaces
 *
 * Core types for loading, building, and invoking agents with full behavioral context.
 */

/**
 * Full agent definition loaded from agents-lib .md file
 * Contains both YAML frontmatter metadata and markdown behavioral content
 */
export interface AgentDefinition {
  // === Metadata from YAML frontmatter ===
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku' | 'inherit';
  tools: string[];
  color?: string;

  // === Full behavioral content from markdown ===
  systemPrompt: string;

  // === Source information ===
  plugin: string;
  domain: string;
  filePath: string;

  // === Performance ===
  loadedAt: Date;
  size: number;
}

/**
 * Domain context for agent invocation
 */
export interface DomainContext {
  domainId: string;
  name: string;
  type: string;
  description: string;
  goals?: string[];

  stack: {
    language: string;
    framework: string;
    testing: string;
    packageManager: string;
  };

  agents: string[];
  routing: {
    rules: Array<{
      pattern: string;
      agent: string;
    }>;
    ownership: 'auto-assign' | 'manual' | 'round-robin';
  };
}

/**
 * Workspace context for agent invocation
 */
export interface WorkspaceContext {
  path: string;
  domainId: string;
  availableAgents: string[];
  queuePaths: {
    intake: string;
    inProgress: string;
    review: string;
    completed: string;
    failed: string;
  };
}

/**
 * Task context for agent invocation
 */
export interface TaskContext {
  taskId: string;
  description: string;
  priority: string;
  type: string;
  assignedBy: string;
  createdAt: Date;
  workflowId?: string; // Optional workflow ID for workflow steps
}

/**
 * Complete invocation context
 */
export interface InvocationContext {
  domain: DomainContext;
  workspace: WorkspaceContext;
  task: TaskContext;
}

/**
 * Agent invocation options
 */
export interface InvocationOptions {
  agentId: string;
  task: string;
  context: InvocationContext;

  // Optional overrides
  model?: 'opus' | 'sonnet' | 'haiku';
  timeout?: number;
  verbose?: boolean;
}

/**
 * Agent invocation result
 */
export interface InvocationResult {
  success: boolean;
  agentId: string;
  agentName: string;
  model: string;

  message: string;
  output?: string;

  duration: number;
  startedAt: Date;
  completedAt: Date;

  errors?: string[];
  warnings?: string[];
}

/**
 * System prompt sections
 */
export interface SystemPromptSections {
  coreBehavior: string;
  domainContext?: string;
  workspaceContext?: string;
  taskContext?: string;
  guidelines?: string;
}

/**
 * Agent cache entry
 */
export interface AgentCacheEntry {
  definition: AgentDefinition;
  lastAccessed: Date;
  accessCount: number;
  size: number;
}

/**
 * Loader options
 */
export interface LoaderOptions {
  agentsLibPath?: string;
  enableCache?: boolean;
  cacheMaxSize?: number;
  cacheMaxAge?: number; // milliseconds
  hotReload?: boolean;
}

/**
 * System prompt builder options
 */
export interface PromptBuilderOptions {
  includeDomainContext?: boolean;
  includeWorkspaceContext?: boolean;
  includeTaskContext?: boolean;
  includeGuidelines?: boolean;
  format?: 'full' | 'concise' | 'minimal';
}

/**
 * Invoker options
 */
export interface InvokerOptions {
  defaultTimeout?: number;
  maxConcurrentInvocations?: number;
  enableMetrics?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Task Function - Matches Claude Code Task tool signature
 *
 * This function is injected from the host Claude Code environment
 * and enables agents to spawn other agents autonomously.
 */
export type TaskFunction = (params: {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  resume?: string;
  run_in_background?: boolean;
  max_turns?: number;
  isolation?: 'worktree';
}) => Promise<any>;
