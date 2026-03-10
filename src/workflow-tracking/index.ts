/**
 * UltraPilot Workflow Tracking System
 *
 * Comprehensive observability into multi-agent workflow execution.
 *
 * @version 1.0
 * @date 2026-03-03
 *
 * @example
 * ```typescript
 * import { enableWorkflowTracking } from './workflow-tracking';
 *
 * // In AgentOrchestrator constructor
 * enableWorkflowTracking(this, messageBus, { enabled: true });
 * ```
 */

// Core components
export { WorkflowTracker } from './WorkflowTracker.js';
export { WorkflowExecutionStore } from './WorkflowExecutionStore.js';
export { WorkflowQueryAPI } from './WorkflowQueryAPI.js';

// Types
export * from './types.js';

// Configuration
export { DEFAULT_CONFIG, loadConfig, validateConfig } from './config.js';

// Integration helpers
export {
  initializeWorkflowTracking,
  decorateWithTracking,
  enableWorkflowTracking,
  disableWorkflowTracking,
  getQueryAPI
} from './integration.js';

// Utilities
export {
  redactData,
  redactString,
  truncateText,
  truncatePayload,
  sanitizeError,
  generateId,
  now,
  toTimestamp,
  fromDate
} from './redaction.js';
