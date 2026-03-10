/**
 * Validation Middleware for AgentMessageBus
 *
 * Integrates EventValidator with AgentMessageBus to automatically
 * validate all published events before persistence and delivery.
 *
 * Features:
 * - Automatic validation on publish()
 * - Strict vs lenient modes per channel
 * - Validation error handling with DLQ routing
 * - Metrics and telemetry
 * - Schema registration helpers
 */

import { EventValidator, ValidationResult, ValidationOptions, ValidationError } from './EventValidator.js';
import { JSONSchema } from './EventSchemas.js';

/**
 * Validation metrics
 */
export interface ValidationMetrics {
  totalValidated: number;
  totalPassed: number;
  totalFailed: number;
  validationErrors: number;
  failuresByEventType: Record<string, number>;
  averageValidationTime: number; // milliseconds
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  enabled: boolean;
  defaultMode: 'strict' | 'lenient';
  channelModes: Record<string, 'strict' | 'lenient'>;
  blockOnInvalid: boolean; // Block publishing if validation fails
  logErrors: boolean;
  collectMetrics: boolean;
  customValidator?: EventValidator;
}

/**
 * Validation error with context
 */
export interface ValidationErrorWithContext {
  eventType: string;
  channelId?: string;
  agentId?: string;
  timestamp: Date;
  errors: ValidationError[];
  blocked: boolean;
}

/**
 * Validation middleware class
 *
 * Wraps AgentMessageBus publish() methods to add automatic validation
 */
export class ValidationMiddleware {
  private validator: EventValidator;
  private config: ValidationConfig;
  private metrics: ValidationMetrics;

  // Error tracking
  private recentErrors: ValidationErrorWithContext[] = [];
  private maxRecentErrors: number = 100;

  // Event listeners
  private errorListeners: Array<(error: ValidationErrorWithContext) => void> = [];

  constructor(config?: Partial<ValidationConfig>) {
    this.config = {
      enabled: true,
      defaultMode: 'lenient',
      channelModes: {},
      blockOnInvalid: false,
      logErrors: true,
      collectMetrics: true,
      ...config
    };

    this.validator = this.config.customValidator || new EventValidator({
      strict: this.config.defaultMode === 'strict'
    });

    this.metrics = {
      totalValidated: 0,
      totalPassed: 0,
      totalFailed: 0,
      validationErrors: 0,
      failuresByEventType: {},
      averageValidationTime: 0
    };
  }

  /**
   * Validate an event before publishing
   *
   * Called by AgentMessageBus.publish() before persisting the message.
   *
   * @param eventType - Event type (from message.type)
   * @param payload - Message payload
   * @param context - Publishing context (channel, agent)
   * @returns Validation result
   */
  validate(eventType: string, payload: any, context?: {
    channel?: string;
    agentId?: string;
  }): ValidationResult {
    const startTime = Date.now();

    // Check if validation is enabled
    if (!this.config.enabled) {
      return { valid: true };
    }

    // Determine validation mode
    const mode = this.getValidationMode(context?.channel);
    const options: ValidationOptions = {
      strict: mode === 'strict',
      allowUnknownFields: mode === 'lenient',
      allErrors: true
    };

    // Perform validation
    const result = this.validator.validateEvent(eventType, payload, options);

    // Update metrics
    if (this.config.collectMetrics) {
      this.updateMetrics(eventType, result, Date.now() - startTime);
    }

    // Handle validation failure
    if (!result.valid) {
      this.handleValidationError(eventType, payload, result, context);
    }

    return result;
  }

  /**
   * Validate a batch of events
   *
   * @param events - Array of events with context
   * @returns Array of validation results
   */
  validateBatch(events: Array<{
    eventType: string;
    payload: any;
    channel?: string;
    agentId?: string;
  }>): Array<ValidationResult & { eventType: string }> {
    return events.map(({ eventType, payload, channel, agentId }) => ({
      eventType,
      ...this.validate(eventType, payload, { channel, agentId })
    }));
  }

  /**
   * Register a custom schema for an event type
   *
   * @param eventType - Event type
   * @param schema - JSON Schema
   * @param options - Registration options
   */
  registerSchema(eventType: string, schema: JSONSchema, options?: {
    overwrite?: boolean;
    version?: string;
  }): void {
    this.validator.registerSchema(eventType, schema, options);
  }

  /**
   * Unregister a custom schema
   *
   * @param eventType - Event type to unregister
   */
  unregisterSchema(eventType: string): void {
    this.validator.unregisterSchema(eventType);
  }

  /**
   * Get schema for an event type
   *
   * @param eventType - Event type
   * @returns JSON Schema or null
   */
  getSchema(eventType: string): JSONSchema | null {
    return this.validator.getSchema(eventType);
  }

  /**
   * Check if an event type has a registered schema
   *
   * @param eventType - Event type
   * @returns True if schema exists
   */
  hasSchema(eventType: string): boolean {
    return this.validator.hasSchema(eventType);
  }

  /**
   * Get all registered event types
   *
   * @returns Array of event type names
   */
  getRegisteredEventTypes(): string[] {
    return this.validator.getRegisteredEventTypes();
  }

  /**
   * Set validation mode for a specific channel
   *
   * @param channel - Channel name
   * @param mode - Validation mode
   */
  setChannelMode(channel: string, mode: 'strict' | 'lenient'): void {
    this.config.channelModes[channel] = mode;
  }

  /**
   * Get validation mode for a channel
   *
   * @param channel - Channel name
   * @returns Validation mode
   */
  getValidationMode(channel?: string): 'strict' | 'lenient' {
    if (channel && this.config.channelModes[channel]) {
      return this.config.channelModes[channel];
    }
    return this.config.defaultMode;
  }

  /**
   * Enable or disable validation
   *
   * @param enabled - Whether to enable validation
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if validation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Set whether to block publishing on validation failure
   *
   * @param block - Whether to block on invalid events
   */
  setBlockOnInvalid(block: boolean): void {
    this.config.blockOnInvalid = block;
  }

  /**
   * Get validation metrics
   *
   * @returns Current metrics
   */
  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset validation metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalValidated: 0,
      totalPassed: 0,
      totalFailed: 0,
      validationErrors: 0,
      failuresByEventType: {},
      averageValidationTime: 0
    };
  }

  /**
   * Get recent validation errors
   *
   * @param limit - Maximum number of errors to return
   * @returns Recent validation errors
   */
  getRecentErrors(limit: number = 10): ValidationErrorWithContext[] {
    return this.recentErrors.slice(-limit);
  }

  /**
   * Clear recent errors
   */
  clearRecentErrors(): void {
    this.recentErrors = [];
  }

  /**
   * Add error event listener
   *
   * @param listener - Callback function for validation errors
   */
  onError(listener: (error: ValidationErrorWithContext) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * Remove error event listener
   *
   * @param listener - Callback function to remove
   */
  offError(listener: (error: ValidationErrorWithContext) => void): void {
    const idx = this.errorListeners.indexOf(listener);
    if (idx !== -1) {
      this.errorListeners.splice(idx, 1);
    }
  }

  /**
   * Get the underlying validator instance
   */
  getValidator(): EventValidator {
    return this.validator;
  }

  /**
   * Update metrics after validation
   */
  private updateMetrics(eventType: string, result: ValidationResult, duration: number): void {
    this.metrics.totalValidated++;
    this.metrics.averageValidationTime =
      (this.metrics.averageValidationTime * (this.metrics.totalValidated - 1) + duration) /
      this.metrics.totalValidated;

    if (result.valid) {
      this.metrics.totalPassed++;
    } else {
      this.metrics.totalFailed++;
      this.metrics.validationErrors += result.errors?.length || 0;

      // Track failures by event type
      this.metrics.failuresByEventType[eventType] =
        (this.metrics.failuresByEventType[eventType] || 0) + 1;
    }
  }

  /**
   * Handle validation error
   */
  private handleValidationError(
    eventType: string,
    payload: any,
    result: ValidationResult,
    context?: {
      channel?: string;
      agentId?: string;
    }
  ): void {
    const errorContext: ValidationErrorWithContext = {
      eventType,
      channelId: context?.channel,
      agentId: context?.agentId,
      timestamp: new Date(),
      errors: result.errors || [],
      blocked: this.config.blockOnInvalid
    };

    // Store in recent errors
    this.recentErrors.push(errorContext);
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }

    // Log error
    if (this.config.logErrors) {
      this.logValidationError(errorContext, result);
    }

    // Emit to listeners
    for (const listener of this.errorListeners) {
      try {
        listener(errorContext);
      } catch (error) {
        console.error('Error in validation error listener:', error);
      }
    }

    // Block if configured
    if (this.config.blockOnInvalid) {
      const error = new ValidationErrorException(
        `Event validation failed for type: ${eventType}`,
        errorContext
      );
      throw error;
    }
  }

  /**
   * Log validation error
   */
  private logValidationError(errorContext: ValidationErrorWithContext, result: ValidationResult): void {
    const lines: string[] = [
      '=== Event Validation Error ===',
      `Event Type: ${errorContext.eventType}`,
      `Channel: ${errorContext.channelId || 'N/A'}`,
      `Agent: ${errorContext.agentId || 'N/A'}`,
      `Timestamp: ${errorContext.timestamp.toISOString()}`,
      ''
    ];

    if (result.errors) {
      lines.push('Errors:');
      for (const err of result.errors) {
        lines.push(`  ${err.path || '(root)'}: ${err.message}`);
        if (err.expected !== undefined) {
          lines.push(`    Expected: ${err.expected}`);
        }
        if (err.actual !== undefined) {
          lines.push(`    Actual: ${JSON.stringify(err.actual)}`);
        }
      }
    }

    lines.push('');
    lines.push(`Blocked: ${errorContext.blocked ? 'Yes' : 'No'}`);

    console.error(lines.join('\n'));
  }
}

/**
 * Validation error exception
 * Thrown when blockOnInvalid is true and validation fails
 */
export class ValidationErrorException extends Error {
  public readonly context: ValidationErrorWithContext;

  constructor(message: string, context: ValidationErrorWithContext) {
    super(message);
    this.name = 'ValidationErrorException';
    this.context = context;
  }
}

/**
 * Default singleton middleware instance
 */
let defaultMiddleware: ValidationMiddleware | null = null;

/**
 * Get the default middleware instance
 */
export function getDefaultMiddleware(): ValidationMiddleware {
  if (!defaultMiddleware) {
    defaultMiddleware = new ValidationMiddleware();
  }
  return defaultMiddleware;
}

/**
 * Create middleware with custom configuration
 */
export function createMiddleware(config?: Partial<ValidationConfig>): ValidationMiddleware {
  return new ValidationMiddleware(config);
}

/**
 * Quick validation function using default middleware
 *
 * @param eventType - Event type
 * @param payload - Event payload
 * @param context - Publishing context
 * @returns Validation result
 */
export function validateEvent(
  eventType: string,
  payload: any,
  context?: {
    channel?: string;
    agentId?: string;
  }
): ValidationResult {
  return getDefaultMiddleware().validate(eventType, payload, context);
}
