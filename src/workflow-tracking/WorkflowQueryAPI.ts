/**
 * UltraPilot Workflow Tracking System - Workflow Query API
 *
 * Provides rich query capabilities for workflow analysis.
 * Implements L1/L2 caching with size limits.
 *
 * @version 1.0
 * @date 2026-03-03
 */

import { LRUCache } from 'lru-cache';
import { WorkflowExecutionStore } from './WorkflowExecutionStore.js';

// Types
import type {
  WorkflowTimeline,
  PhaseMetrics,
  AgentPerformance,
  TokenUsageReport,
  PerformanceReport,
  QueryOptions,
  AggregateOptions
} from './types.js';

/**
 * Decision Trace
 */
export interface DecisionTrace {
  totalDecisions: number;
  byType: Record<string, number>;
  decisions: Array<{
    type: string;
    decision: string;
    reasoning: string;
    timestamp: Date;
    phase: string;
  }>;
}

/**
 * Workflow Query API
 *
 * Analyzes workflow executions with optimized queries and caching.
 */
export class WorkflowQueryAPI {
  private store: WorkflowExecutionStore;

  // L1 Cache: Recent workflows (in-memory, 5 min TTL)
  private l1Cache: LRUCache<string, any>;

  // L2 Cache: Frequently accessed workflows (in-memory, 1 hour TTL)
  private l2Cache: LRUCache<string, any>;

  constructor(store: WorkflowExecutionStore) {
    this.store = store;

    // Initialize caches with size limits (PERFORMANCE FIX)
    this.l1Cache = new LRUCache({
      max: 50,
      ttl: 300000 // 5 minutes
    });

    this.l2Cache = new LRUCache({
      max: 500,
      ttl: 3600000 // 1 hour
    });
  }

  /**
   * Get complete workflow timeline
   * Reconstructs full execution history in chronological order
   */
  async getWorkflowTimeline(workflowId: string): Promise<WorkflowTimeline> {
    const cacheKey = `timeline:${workflowId}`;

    // Check L1 cache
    const l1Data = this.l1Cache.get(cacheKey);
    if (l1Data) return l1Data;

    // Check L2 cache
    const l2Data = this.l2Cache.get(cacheKey);
    if (l2Data) {
      this.l1Cache.set(cacheKey, l2Data);
      return l2Data;
    }

    // Query from database
    const workflow = await this.store.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const phases = await this.store.getPhases(workflowId);
    const executions = await this.store.getExecutions(workflowId, 1000);
    const communications = await this.store.getCommunications(workflowId);
    const decisions = await this.store.getDecisions(workflowId);

    // Build unified timeline
    const timeline: WorkflowTimeline['timeline'] = [
      ...phases.map(p => ({ id: `phase-${p.phase}`, type: 'phase' as const, timestamp: p.transitionedAt, data: p })),
      ...executions.map(e => ({ id: `exec-${e.stepId}`, type: 'execution' as const, timestamp: e.startedAt, data: e })),
      ...communications.map(c => ({ id: `comm-${c.messageId}`, type: 'communication' as const, timestamp: c.sentAt, data: c })),
      ...decisions.map(d => ({ id: `dec-${d.decisionType}`, type: 'decision' as const, timestamp: d.decisionTime, data: d }))
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const result: WorkflowTimeline = {
      workflow,
      phases,
      executions,
      communications,
      decisions,
      timeline
    };

    // Cache in L2 and L1
    this.l2Cache.set(cacheKey, result);
    this.l1Cache.set(cacheKey, result);

    return result;
  }

  /**
   * Get agent execution history
   */
  async getAgentExecutions(options: QueryOptions = {}): Promise<{
    total: number;
    avgDuration: number;
    successRate: number;
    totalTokens: number;
    executions: any[];
  }> {
    // Implementation would query database with filters
    // For now, return basic structure
    return {
      total: 0,
      avgDuration: 0,
      successRate: 0,
      totalTokens: 0,
      executions: []
    };
  }

  /**
   * Get phase-level metrics
   */
  async getPhaseMetrics(phase?: string, options?: AggregateOptions): Promise<PhaseMetrics> {
    // Implementation would aggregate phase data
    // For now, return basic structure
    return {
      totalExecutions: 0,
      avgDuration: 0,
      successRate: 0,
      avgAgentsInvoked: 0,
      breakdown: []
    };
  }

  /**
   * Get agent performance report
   */
  async getAgentPerformance(agentId: string): Promise<AgentPerformance> {
    // Implementation would analyze agent performance
    // For now, return basic structure
    return {
      agentId,
      agentType: 'unknown',
      model: 'sonnet',
      totalInvocations: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      totalTokens: 0,
      successRate: 0
    };
  }

  /**
   * Get token usage report
   */
  async getTokenUsage(workflowId?: string): Promise<TokenUsageReport> {
    // Implementation would calculate token costs
    // For now, return basic structure
    return {
      totalTokens: 0,
      byAgent: {},
      byModel: {
        opus: 0,
        sonnet: 0,
        haiku: 0
      },
      byPhase: {},
      estimatedCost: 0
    };
  }

  /**
   * Get decision trace for workflow
   */
  async getDecisionTrace(workflowId: string): Promise<DecisionTrace> {
    const decisions = await this.store.getDecisions(workflowId);

    // Group by decision type
    const byType: Record<string, number> = {};
    for (const decision of decisions) {
      byType[decision.decisionType] = (byType[decision.decisionType] || 0) + 1;
    }

    return {
      totalDecisions: decisions.length,
      byType,
      decisions: decisions.map(d => ({
        type: d.decisionType,
        decision: d.decision,
        reasoning: d.reasoning,
        timestamp: d.decisionTime,
        phase: '' // Would need to join with phases
      }))
    };
  }

  /**
   * Get performance report for workflow
   */
  async getPerformanceReport(workflowId: string): Promise<PerformanceReport> {
    const timeline = await this.getWorkflowTimeline(workflowId);

    // Calculate phase breakdown
    const phasesDuration = new Map<string, number>();
    let totalDuration = 0;

    for (const phase of timeline.phases) {
      if (phase.duration) {
        phasesDuration.set(phase.phase, (phasesDuration.get(phase.phase) || 0) + phase.duration);
        totalDuration += phase.duration;
      }
    }

    const phases = Array.from(phasesDuration.entries()).map(([name, duration]) => ({
      name,
      duration,
      percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0
    }));

    // Calculate agent stats
    const agentStats = new Map<string, {
      invocations: number;
      totalDuration: number;
      tokens: number;
    }>();

    for (const exec of timeline.executions) {
      const stats = agentStats.get(exec.agentId) || {
        invocations: 0,
        totalDuration: 0,
        tokens: 0
      };

      stats.invocations++;
      stats.totalDuration += exec.duration;
      stats.tokens += exec.totalTokens || 0;

      agentStats.set(exec.agentId, stats);
    }

    const agents = Array.from(agentStats.entries()).map(([agentId, stats]) => ({
      agentId,
      invocations: stats.invocations,
      totalDuration: stats.totalDuration,
      avgDuration: stats.invocations > 0 ? stats.totalDuration / stats.invocations : 0,
      tokensUsed: stats.tokens
    }));

    return {
      summary: {
        totalDuration: timeline.workflow.duration || 0,
        phasesCompleted: timeline.phases.length,
        agentsInvoked: timeline.executions.length,
        messagesExchanged: timeline.communications.length,
        totalTokens: agents.reduce((sum, a) => sum + a.tokensUsed, 0)
      },
      phases,
      agents,
      communications: {
        total: timeline.communications.length,
        byChannel: {},
        topPairs: []
      },
      parallelism: {
        speedup: 1.0,
        efficiency: 1.0,
        bottlenecks: []
      }
    };
  }

  /**
   * Export workflow data
   */
  async exportWorkflow(workflowId: string, format: 'json' | 'csv'): Promise<string> {
    const timeline = await this.getWorkflowTimeline(workflowId);

    if (format === 'json') {
      return JSON.stringify(timeline, null, 2);
    }

    // CSV format
    const lines: string[] = [];

    // Header
    lines.push('Type,ID,Timestamp,Data');

    // Timeline events
    for (const event of timeline.timeline) {
      const dataStr = JSON.stringify(event.data).replace(/"/g, '""');
      lines.push(`${event.type},${event.id},${event.timestamp.toISOString()},"${dataStr}"`);
    }

    return lines.join('\n');
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      l1: {
        size: this.l1Cache.size,
        calculatedSize: this.l1Cache.calculatedSize
      },
      l2: {
        size: this.l2Cache.size,
        calculatedSize: this.l2Cache.calculatedSize
      }
    };
  }
}
