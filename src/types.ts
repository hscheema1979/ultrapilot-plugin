/**
 * Agent State & Communication - Unified Types
 *
 * Complete type definitions for Agent State Store and Message Bus.
 */

/**
 * Agent State - Complete agent memory across invocations
 */
export interface AgentState {
  // Identity
  agentId: string;
  version: number;
  lastUpdated: Date;
  createdAt?: Date;

  // Task state
  currentTask?: string;
  completedTasks: string[];
  failedTasks: string[];
  status?: 'idle' | 'busy' | 'error' | 'offline';

  // Work state
  filesModified: string[];
  decisions: Array<{
    timestamp: Date;
    decision: string;
    reasoning: string;
  }>;
  context: Record<string, any>;

  // Domain association
  domainId?: string;

  // Metrics
  totalInvocations: number;
  successRate: number;
  averageDuration: number;
}

/**
 * State filter for queries
 */
export interface StateFilter {
  currentTask?: string;
  status?: string;
  domainId?: string;
  agentIds?: string[];
  limit?: number;
}

/**
 * State update operation
 */
export interface StateUpdate {
  version?: number; // For optimistic locking
  merge?: boolean;
  requesterId?: string;
}

/**
 * Agent Message - Core message structure
 */
export interface AgentMessage {
  id?: string;
  from: string;
  to?: string;
  channel?: string;
  type: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
  replyTo?: string;
  priority?: MessagePriority;
}

/**
 * Message priority
 */
export enum MessagePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low'
}

/**
 * Message handler function
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Subscription handle
 */
export interface Subscription {
  id: string;
  agentId: string;
  channel: string;
  unsubscribe: () => Promise<void>;
  isActive: () => boolean;
}

/**
 * Message filter
 */
export interface MessageFilter {
  priority?: MessagePriority[];
  type?: string[];
  since?: Date;
}

/**
 * Invocation context for agent bridge
 */
export interface InvocationContext {
  domain: DomainContext;
  workspace: WorkspaceContext;
  task: TaskContext;
}

/**
 * Domain context
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
 * Workspace context
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
 * Task context
 */
export interface TaskContext {
  taskId: string;
  description: string;
  priority: string;
  type: string;
  assignedBy: string;
  createdAt: Date;
}

/**
 * Invocation options
 */
export interface InvocationOptions {
  agentId: string;
  task: string;
  context: InvocationContext;
  model?: 'opus' | 'sonnet' | 'haiku';
  timeout?: number;
  verbose?: boolean;
}

/**
 * Invocation result
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
 * Workflow definition for orchestrator
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
  dependencies?: Record<number, number[]>; // stepIndex -> [dependencyIndices]
}

/**
 * Workflow step
 */
export interface WorkflowStep {
  agent: string;
  task: string;
  context: Partial<InvocationContext>;
  inputs?: Record<string, string>; // JSON path references
  outputs?: Record<string, string>; // JSON path references
  communicationChannels?: string[];
}

/**
 * Workflow result
 */
export interface WorkflowResult {
  success: boolean;
  steps: Array<{
    stepIndex: number;
    agent: string;
    result: InvocationResult;
  }>;
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

/**
 * WebSocket message types for real-time event streaming
 */

/**
 * WebSocket message format
 */
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'subscribed' | 'unsubscribed' | 'connected' | 'event' | 'error';
  topic?: string;
  sequenceNumber?: number;
  payload?: unknown;
  timestamp?: string;
}

/**
 * WebSocket subscription info
 */
export interface WebSocketSubscription {
  wsClientId: string;
  topic: string;
  subscribedAt: Date;
  lastSequenceNumber: number;
}

/**
 * Event types for WebSocket streaming
 */
export type UltraEventType =
  | 'plan.created'
  | 'task.queued'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'agent.spawned'
  | 'phase.completed'
  | 'heartbeat'
  | 'session.started'
  | 'session.stopped'
  | 'cycle.complete'
  | 'routine.executed';

/**
 * Ultra event for WebSocket streaming
 */
export interface UltraEvent {
  type: UltraEventType;
  sessionId?: string;
  payload: unknown;
  timestamp: Date;
  sequenceNumber?: number;
}
