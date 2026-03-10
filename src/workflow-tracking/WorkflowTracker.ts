/**
 * UltraPilot Workflow Tracking System - Workflow Tracker
 *
 * Coordinates tracking across workflow lifecycle.
 * Implements decorator pattern for non-invasive integration.
 *
 * @version 1.0
 * @date 2026-03-03
 */

import { v4 as uuidv4 } from 'uuid';
import { WorkflowExecutionStore } from './WorkflowExecutionStore.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { redactData, truncatePayload } from './redaction.js';

// Types
import type {
  WorkflowRecord,
  PhaseRecord,
  AgentExecutionRecord,
  DecisionRecord,
  WorkflowSummary
} from './types.js';

/**
 * Workflow Tracker
 *
 * Main coordinator for tracking workflow execution.
 * Uses decorator pattern to wrap AgentOrchestrator.
 */
export class WorkflowTracker {
  private store: WorkflowExecutionStore;
  private messageBus?: AgentMessageBus;
  private config: {
    samplingRate: number;
    maxBufferSize: number;
  };

  // Active workflow context
  private currentWorkflow?: {
    workflowId: string;
    sessionId: string;
    phase: string;
    startedAt: number;
  };

  // Write buffer
  private writeBuffer: Map<string, any[]> = new Map();
  private flushTimer?: NodeJS.Timeout;
  private isFlushing: boolean = false;

  // Message observer
  private messageObserver?: MessageObserver;

  constructor(store: WorkflowExecutionStore, config: any = {}) {
    this.store = store;
    this.config = {
      samplingRate: config.samplingRate ?? 1.0,
      maxBufferSize: config.maxBufferSize ?? 100
    };

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Set message bus for communication tracking
   */
  setMessageBus(messageBus: AgentMessageBus): void {
    this.messageBus = messageBus;
    this.messageObserver = new MessageObserver(messageBus, this);
  }

  /**
   * Start tracking a new workflow
   */
  async startWorkflow(
    sessionId: string,
    workflowId: string,
    metadata: {
      name: string;
      mode: 'sequential' | 'parallel';
      stepsCount: number;
    }
  ): Promise<void> {
    const id = uuidv4();

    const workflow: WorkflowRecord = {
      id,
      sessionId,
      workflowId,
      name: metadata.name,
      status: 'running',
      mode: metadata.mode,
      stepsCount: metadata.stepsCount,
      completedSteps: 0,
      failedSteps: 0,
      startedAt: new Date()
    };

    await this.store.createWorkflow(workflow);

    // Set current workflow context
    this.currentWorkflow = {
      workflowId,
      sessionId,
      phase: 'expansion',
      startedAt: Date.now()
    };
  }

  /**
   * Record phase transition
   */
  async recordPhaseTransition(
    phase: string,
    fromPhase: string | null,
    toPhase: string,
    criteria: any,
    timing: {
      phaseDuration: number;
      totalDuration: number;
    }
  ): Promise<void> {
    if (!this.currentWorkflow) {
      console.warn('[WorkflowTracker] No active workflow to record phase transition');
      return;
    }

    const phaseRecord: PhaseRecord = {
      workflowId: this.currentWorkflow.workflowId,
      sessionId: this.currentWorkflow.sessionId,
      phase: toPhase,
      fromPhase: fromPhase || undefined,
      toPhase,
      transitionedAt: new Date(),
      criteria,
      duration: timing.phaseDuration
    };

    await this.store.recordPhase(phaseRecord);

    // Update current phase
    this.currentWorkflow.phase = toPhase;
  }

  /**
   * Record agent invocation
   */
  async recordAgentInvocation(
    agentId: string,
    invocation: {
      sessionId: string;
      workflowId: string;
      phaseId: string;
      stepId?: string;
      task: string;
      input: any;
      output: any;
      model: string;
      tokens: {
        input: number;
        output: number;
        total: number;
      };
      duration: number;
      success: boolean;
      error?: string;
      filesModified?: string[];
    }
  ): Promise<void> {
    if (!this.currentWorkflow) {
      console.warn('[WorkflowTracker] No active workflow to record agent invocation');
      return;
    }

    // Redact sensitive data
    const sanitizedInput = redactData(invocation.input);
    const sanitizedOutput = redactData(invocation.output);

    const executionRecord: AgentExecutionRecord = {
      workflowId: this.currentWorkflow.workflowId,
      sessionId: invocation.sessionId,
      stepId: invocation.stepId || agentId,
      agentId,
      agentType: agentId, // Could be refined from agent registry
      model: invocation.model as 'opus' | 'sonnet' | 'haiku',
      startedAt: new Date(Date.now() - invocation.duration),
      endedAt: new Date(),
      duration: invocation.duration,
      inputText: typeof sanitizedInput === 'string' ? sanitizedInput : JSON.stringify(sanitizedInput),
      outputText: sanitizedOutput ? (typeof sanitizedOutput === 'string' ? sanitizedOutput : JSON.stringify(sanitizedOutput)) : undefined,
      success: invocation.success,
      errorMessage: invocation.error,
      inputTokens: invocation.tokens.input,
      outputTokens: invocation.tokens.output,
      totalTokens: invocation.tokens.total
    };

    await this.store.recordExecution(executionRecord);
  }

  /**
   * Record decision
   */
  async recordDecision(decision: {
    sessionId: string;
    workflowId: string;
    phaseId: string;
    type: 'routing' | 'escalation' | 'retry' | 'fallback' | 'validation';
    input: any;
    decision: string;
    reasoning: string;
    confidence?: number;
    alternatives?: Array<{
      option: string;
      score: number;
    }>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.currentWorkflow) {
      console.warn('[WorkflowTracker] No active workflow to record decision');
      return;
    }

    const decisionRecord: DecisionRecord = {
      workflowId: this.currentWorkflow.workflowId,
      sessionId: decision.sessionId,
      decisionType: decision.type,
      decisionTime: new Date(),
      inputContext: typeof decision.input === 'string' ? decision.input : JSON.stringify(decision.input),
      decision: decision.decision,
      reasoning: decision.reasoning,
      alternatives: decision.alternatives,
      confidence: decision.confidence
    };

    await this.store.recordDecision(decisionRecord);
  }

  /**
   * Record communication
   */
  async recordCommunication(message: {
    sessionId: string;
    workflowId: string;
    from: string;
    to: string | string[];
    channel: string;
    type: string;
    payload: any;
    correlationId?: string;
  }): Promise<void> {
    if (!this.currentWorkflow) {
      return; // Ignore if no active workflow
    }

    const payloadSummary = truncatePayload(message.payload, 500);
    const payloadJson = truncatePayload(message.payload, 5000);

    await this.store.createWorkflow({
      id: uuidv4(),
      sessionId: message.sessionId,
      workflowId: message.workflowId,
      name: '',
      status: 'running',
      mode: 'sequential',
      stepsCount: 0,
      completedSteps: 0,
      failedSteps: 0,
      startedAt: new Date()
    });

    await this.store.recordCommunication({
      workflowId: this.currentWorkflow.workflowId,
      sessionId: message.sessionId,
      messageId: message.correlationId || uuidv4(),
      fromAgent: message.from,
      toAgent: Array.isArray(message.to) ? message.to[0] : message.to,
      channel: message.channel,
      messageType: message.type,
      payloadSummary,
      payloadJson,
      sentAt: new Date()
    });
  }

  /**
   * End workflow tracking
   */
  async endWorkflow(
    status: 'success' | 'failed' | 'cancelled',
    summary: {
      totalDuration: number;
      phasesCompleted: number;
      agentsInvoked: number;
      messagesExchanged: number;
      decisionsMade: number;
      errors: number;
    }
  ): Promise<void> {
    if (!this.currentWorkflow) {
      console.warn('[WorkflowTracker] No active workflow to end');
      return;
    }

    // Final flush
    await this.flush();

    // Update workflow
    await this.store.updateWorkflow(this.currentWorkflow.workflowId, {
      status: status === 'success' ? 'completed' : status,
      endedAt: new Date(),
      duration: summary.totalDuration,
      completedSteps: summary.phasesCompleted,
      failedSteps: summary.errors,
      summary
    });

    // Clear current workflow
    this.currentWorkflow = undefined;
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('[WorkflowTracker] Flush error:', err);
      });
    }, 50); // 50ms flush interval
  }

  /**
   * Flush any pending writes
   */
  private async flush(): Promise<void> {
    if (this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      await this.store.flush();
    } catch (error) {
      console.error('[WorkflowTracker] Store flush failed:', error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Get current workflow context
   */
  getCurrentWorkflow(): { workflowId: string; sessionId: string; phase: string } | undefined {
    return this.currentWorkflow;
  }

  /**
   * Close tracker and cleanup resources
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    if (this.messageObserver) {
      this.messageObserver.close();
    }

    await this.flush();
    this.store.close();
  }
}

/**
 * Message Observer
 *
 * Non-blocking observer for AgentMessageBus events.
 */
class MessageObserver {
  private messageBus: AgentMessageBus;
  private tracker: WorkflowTracker;
  private trackingQueue: Array<any> = [];
  private processingInterval?: NodeJS.Timeout;
  private subscriptions: Function[] = [];

  constructor(messageBus: AgentMessageBus, tracker: WorkflowTracker) {
    this.messageBus = messageBus;
    this.tracker = tracker;

    // Subscribe to message events
    this.subscribeToEvents();

    // Process queue asynchronously
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(err => {
        console.error('[MessageObserver] Process error:', err);
      });
    }, 100);
  }

  /**
   * Subscribe to message bus events
   */
  private subscribeToEvents(): void {
    // Non-blocking subscriptions
    const onPublished = (event: any) => {
      this.trackingQueue.push({ type: 'published', ...event });
    };

    const onDelivered = (event: any) => {
      this.trackingQueue.push({ type: 'delivered', ...event });
    };

    const onFailed = (event: any) => {
      this.trackingQueue.push({ type: 'failed', ...event });
    };

    // Store unsubscribe functions
    this.subscriptions.push(
      (() => { this.messageBus!.removeListener('published', onPublished); }) as any,
      (() => { this.messageBus!.removeListener('delivered', onDelivered); }) as any,
      (() => { this.messageBus!.removeListener('failed', onFailed); }) as any
    );
  }

  /**
   * Process tracking queue asynchronously
   */
  private async processQueue(): Promise<void> {
    while (this.trackingQueue.length > 0) {
      const event = this.trackingQueue.shift();

      if (!event) continue;

      const currentWorkflow = this.tracker.getCurrentWorkflow();
      if (!currentWorkflow) continue;

      // Extract message data from event
      const messageData = {
        sessionId: currentWorkflow.sessionId,
        workflowId: currentWorkflow.workflowId,
        from: event.from || event.agent,
        to: event.to,
        channel: event.channel,
        type: event.type || event.messageType,
        payload: event.message || event.payload,
        correlationId: event.messageId || event.id
      };

      await this.tracker.recordCommunication(messageData);
    }
  }

  /**
   * Close observer and cleanup
   */
  close(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Unsubscribe from all events
    this.subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });

    this.subscriptions = [];
  }
}
