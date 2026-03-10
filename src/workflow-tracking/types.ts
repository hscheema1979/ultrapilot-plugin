/**
 * UltraPilot Workflow Tracking System - Type Definitions
 *
 * @version 1.0
 * @date 2026-03-03
 */

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow execution status
 */
export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Workflow execution mode
 */
export type WorkflowMode = 'sequential' | 'parallel';

/**
 * Workflow record
 */
export interface WorkflowRecord {
  id: string;
  sessionId: string;
  workflowId: string;
  name: string;
  status: WorkflowStatus;
  mode: WorkflowMode;
  stepsCount: number;
  completedSteps: number;
  failedSteps: number;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  metadata?: Record<string, any>;
  summary?: WorkflowSummary;
}

/**
 * Workflow summary
 */
export interface WorkflowSummary {
  totalDuration: number;
  phasesCompleted: number;
  agentsInvoked: number;
  messagesExchanged: number;
  decisionsMade: number;
  errors: number;
}

// ============================================================================
// Phase Types
// ============================================================================

/**
 * Phase names
 */
export type PhaseName = 'expansion' | 'planning' | 'execution' | 'qa' | 'validation' | 'verification';

/**
 * Phase transition record
 */
export interface PhaseRecord {
  workflowId: string;
  sessionId: string;
  phase: PhaseName | string;
  fromPhase?: PhaseName | string;
  toPhase: PhaseName | string;
  transitionedAt: Date;
  criteria?: PhaseTransitionCriteria;
  duration?: number;
}

/**
 * Phase transition criteria
 */
export interface PhaseTransitionCriteria {
  passed: string[];
  failed: string[];
  warnings?: string[];
}

// ============================================================================
// Agent Execution Types
// ============================================================================

/**
 * Model tier
 */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

/**
 * Agent execution record
 */
export interface AgentExecutionRecord {
  workflowId: string;
  sessionId: string;
  stepId: string;
  agentId: string;
  agentType: string;
  model: ModelTier;
  startedAt: Date;
  endedAt: Date;
  duration: number;
  inputText: string;
  outputText?: string;
  success: boolean;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// ============================================================================
// Communication Types
// ============================================================================

/**
 * Communication record
 */
export interface CommunicationRecord {
  workflowId: string;
  sessionId: string;
  messageId: string;
  fromAgent: string;
  toAgent?: string;
  channel: string;
  messageType: string;
  payloadSummary?: string;
  payloadJson?: string;
  sentAt: Date;
  deliveredAt?: Date;
}

// ============================================================================
// Decision Types
// ============================================================================

/**
 * Decision type
 */
export type DecisionType = 'routing' | 'escalation' | 'retry' | 'fallback' | 'validation';

/**
 * Decision record
 */
export interface DecisionRecord {
  workflowId: string;
  sessionId: string;
  decisionType: DecisionType;
  decisionTime: Date;
  inputContext: string;
  decision: string;
  reasoning: string;
  alternatives?: DecisionAlternative[];
  executorAgentId?: string;
  confidence?: number;
}

/**
 * Decision alternative
 */
export interface DecisionAlternative {
  option: string;
  score: number;
  reason?: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query options for filtering
 */
export interface QueryOptions {
  agentType?: string;
  agentId?: string;
  phase?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  offset?: number;
}

/**
 * Aggregate options
 */
export interface AggregateOptions {
  groupBy?: 'workflow' | 'date' | 'domain' | 'session';
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// ============================================================================
// Timeline Types
// ============================================================================

/**
 * Complete workflow timeline
 */
export interface WorkflowTimeline {
  workflow: WorkflowRecord;
  phases: PhaseRecord[];
  executions: AgentExecutionRecord[];
  communications: CommunicationRecord[];
  decisions: DecisionRecord[];
  timeline: TimelineEvent[];
}

/**
 * Unified timeline event
 */
export interface TimelineEvent {
  id: string;
  type: 'phase' | 'execution' | 'communication' | 'decision';
  timestamp: Date;
  data: PhaseRecord | AgentExecutionRecord | CommunicationRecord | DecisionRecord;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Phase metrics
 */
export interface PhaseMetrics {
  totalExecutions: number;
  avgDuration: number;
  successRate: number;
  avgAgentsInvoked: number;
  breakdown: Array<{
    group: string;
    count: number;
    duration: number;
  }>;
}

/**
 * Agent performance
 */
export interface AgentPerformance {
  agentId: string;
  agentType: string;
  model: ModelTier;
  totalInvocations: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  totalTokens: number;
  successRate: number;
}

/**
 * Token usage report
 */
export interface TokenUsageReport {
  totalTokens: number;
  byAgent: Record<string, number>;
  byModel: Record<ModelTier, number>;
  byPhase: Record<string, number>;
  estimatedCost: number;
}

/**
 * Performance report
 */
export interface PerformanceReport {
  summary: {
    totalDuration: number;
    phasesCompleted: number;
    agentsInvoked: number;
    messagesExchanged: number;
    totalTokens: number;
  };
  phases: Array<{
    name: string;
    duration: number;
    percentage: number;
  }>;
  agents: Array<{
    agentId: string;
    invocations: number;
    totalDuration: number;
    avgDuration: number;
    tokensUsed: number;
  }>;
  communications: {
    total: number;
    byChannel: Record<string, number>;
    topPairs: Array<{ from: string; to: string; count: number }>;
  };
  parallelism: {
    speedup: number;
    efficiency: number;
    bottlenecks: string[];
  };
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxSize: number;
  ttl: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Workflow tracking configuration
 */
export interface WorkflowTrackingConfig {
  enabled: boolean;
  dbPath?: string;
  samplingRate?: number;
  flushInterval?: number;
  maxBufferSize?: number;
  cacheSize?: {
    l1: number;
    l2: number;
  };
}
