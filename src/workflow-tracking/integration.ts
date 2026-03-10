/**
 * UltraPilot Workflow Tracking System - Integration Helper
 *
 * Provides easy integration with AgentOrchestrator using decorator pattern.
 *
 * @version 1.0
 * @date 2026-03-03
 */

import { WorkflowTracker } from './WorkflowTracker.js';
import { WorkflowExecutionStore } from './WorkflowExecutionStore.js';
import { WorkflowQueryAPI } from './WorkflowQueryAPI.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { loadConfig, validateConfig } from './config.js';

/**
 * Initialize workflow tracking
 *
 * @param config - Configuration options
 * @returns Workflow tracker instance or null if disabled
 */
export function initializeWorkflowTracking(config?: {
  enabled?: boolean;
  dbPath?: string;
}): {
  tracker: WorkflowTracker | null;
  queryAPI: WorkflowQueryAPI | null;
} {
  const finalConfig = {
    ...loadConfig(),
    ...config
  };

  // Validate config
  validateConfig(finalConfig);

  // Check if enabled
  if (!finalConfig.enabled) {
    console.log('[WorkflowTracking] Disabled by configuration');
    return {
      tracker: null,
      queryAPI: null
    };
  }

  try {
    // Initialize store
    const store = new WorkflowExecutionStore({
      dbPath: finalConfig.dbPath
    });

    // Initialize tracker
    const tracker = new WorkflowTracker(store, finalConfig);

    // Initialize query API
    const queryAPI = new WorkflowQueryAPI(store);

    console.log('[WorkflowTracking] Initialized successfully');

    return {
      tracker,
      queryAPI
    };

  } catch (error) {
    console.error('[WorkflowTracking] Initialization failed:', error);
    return {
      tracker: null,
      queryAPI: null
    };
  }
}

/**
 * Decorate AgentOrchestrator with workflow tracking
 *
 * Usage:
 * ```typescript
 * import { decorateWithTracking } from './workflow-tracking';
 *
 * class AgentOrchestrator {
 *   // ... existing code ...
 * }
 *
 * // Apply tracking decorator
 * decorateWithTracking(AgentOrchestrator.prototype);
 * ```
 */
export function decorateWithTracking(orchestratorPrototype: any): void {
  if (!orchestratorPrototype) {
    console.warn('[WorkflowTracking] Cannot decorate null prototype');
    return;
  }

  // Store original executeWorkflow method
  const originalExecuteWorkflow = orchestratorPrototype.executeWorkflow;

  // Override with tracking wrapper
  orchestratorPrototype.executeWorkflow = async function(this: any, workflow: any) {
    const tracker: WorkflowTracker | null = this._workflowTracker;

    if (!tracker) {
      // No tracking, call original method
      return originalExecuteWorkflow.call(this, workflow);
    }

    const sessionId = crypto.randomUUID();
    const startedAt = Date.now();

    // Start tracking
    await tracker.startWorkflow(sessionId, workflow.id, {
      name: workflow.name,
      mode: workflow.mode,
      stepsCount: workflow.steps.length
    });

    try {
      // Execute original workflow
      const result = await originalExecuteWorkflow.call(this, workflow);

      // Record successful completion
      await tracker.endWorkflow('success', {
        totalDuration: result.duration,
        phasesCompleted: 1,
        agentsInvoked: result.steps.length,
        messagesExchanged: result.steps.reduce((sum: number, s: any) => sum + (s.messages || 0), 0),
        decisionsMade: 0,
        errors: result.failed
      });

      return result;

    } catch (error) {
      // Record failure
      await tracker.endWorkflow('failed', {
        totalDuration: Date.now() - startedAt,
        phasesCompleted: 0,
        agentsInvoked: 0,
        messagesExchanged: 0,
        decisionsMade: 0,
        errors: 1
      });

      throw error;
    }
  };

  // Store original executeStep method
  const originalExecuteStep = orchestratorPrototype.executeStep;

  // Override with tracking wrapper (if exists)
  if (originalExecuteStep) {
    orchestratorPrototype.executeStep = async function(this: any, step: any, workflow: any) {
      const tracker: WorkflowTracker | null = this._workflowTracker;
      const startedAt = Date.now();

      // Execute original step
      const result = await originalExecuteStep.call(this, step, workflow);

      // Record agent invocation
      if (tracker) {
        await tracker.recordAgentInvocation(step.agentId, {
          sessionId: tracker.getCurrentWorkflow()?.sessionId || '',
          workflowId: workflow.id,
          phaseId: tracker.getCurrentWorkflow()?.phase || 'execution',
          stepId: step.id,
          task: step.task,
          input: step.context,
          output: result.result,
          model: result.model || 'sonnet',
          tokens: {
            input: 0,
            output: 0,
            total: 0
          },
          duration: result.duration || Date.now() - startedAt,
          success: result.success,
          error: result.error
        });
      }

      return result;
    };
  }
}

/**
 * Integration helper for AgentOrchestrator
 *
 * Usage in AgentOrchestrator constructor:
 * ```typescript
 * import { enableWorkflowTracking } from './workflow-tracking';
 *
 * class AgentOrchestrator {
 *   constructor(bridge, stateStore, messageBus, config = {}) {
 *     // ... existing code ...
 *
 *     // Enable workflow tracking
 *     enableWorkflowTracking(this, messageBus, config);
 *   }
 * }
 * ```
 */
export function enableWorkflowTracking(
  orchestrator: any,
  messageBus: AgentMessageBus,
  config?: {
    enabled?: boolean;
    dbPath?: string;
  }
): void {
  if (!orchestrator) {
    console.warn('[WorkflowTracking] Cannot enable on null orchestrator');
    return;
  }

  const { tracker, queryAPI } = initializeWorkflowTracking(config);

  if (!tracker) {
    return;
  }

  // Store tracker on orchestrator instance
  orchestrator._workflowTracker = tracker;
  orchestrator._workflowQueryAPI = queryAPI;

  // Connect message bus
  if (messageBus) {
    tracker.setMessageBus(messageBus);
  }

  console.log('[WorkflowTracking] Enabled for AgentOrchestrator');
}

/**
 * Get workflow query API from orchestrator
 */
export function getQueryAPI(orchestrator: any): WorkflowQueryAPI | null {
  return orchestrator?._workflowQueryAPI || null;
}

/**
 * Disable workflow tracking for orchestrator
 */
export function disableWorkflowTracking(orchestrator: any): void {
  if (!orchestrator) {
    return;
  }

  const tracker = orchestrator._workflowTracker;
  if (tracker) {
    tracker.close().catch((err: any) => {
      console.error('[WorkflowTracking] Error closing tracker:', err);
    });
  }

  delete orchestrator._workflowTracker;
  delete orchestrator._workflowQueryAPI;

  console.log('[WorkflowTracking] Disabled for AgentOrchestrator');
}
