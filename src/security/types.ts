/**
 * UltraPilot Security Module Type Definitions
 *
 * This file defines all types used in I/O contracts between components.
 */

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface FieldError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  sanitized?: T;
  errors?: FieldError[];
}

// ============================================================================
// PROMPT TYPES
// ============================================================================

export interface SanitizedPrompt {
  safe: boolean;
  sanitized: string;
  detectedPatterns?: string[];
  variablesReplaced?: string[];
}

export interface SanitizationContext {
  variables: Record<string, string>;
  maxLength?: number;
  allowList?: string[];
}

// ============================================================================
// QUEUE INTEGRITY TYPES
// ============================================================================

export interface QueueState {
  tasks: Task[];
  metadata: Record<string, unknown>;
  version: number;
  lastModified: number;
}

export interface SignedQueueState {
  state: QueueState;
  signature: string;
  timestamp: number;
  nonce: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  reason?: 'invalid' | 'expired' | 'replay';
  age?: number;
}

// ============================================================================
// TASK PERMISSION TYPES
// ============================================================================

export enum TaskOperation {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  DELETE = 'delete',
  CLAIM = 'claim',
  RELEASE = 'release',
  UPDATE_STATUS = 'update_status',
}

export interface FileOwnershipInfo {
  owner: string;
  agentsAllowed: string[];
  createdAt: Date;
  lastModified: Date;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: string;
}

// ============================================================================
// RATE LIMITING TYPES
// ============================================================================

export enum RateLimitOperation {
  AGENT_SPAWN = 'agent_spawn',
  QUEUE_OPERATION = 'queue_operation',
  MESSAGE_SEND = 'message_send',
  VALIDATION_REQUEST = 'validation_request',
  PROMPT_SANITIZATION = 'prompt_sanitization',
}

export interface RateLimitConfig {
  max: number;
  window: number; // milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export enum AuditEventType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION_FAILURE = 'validation_failure',
  INJECTION_DETECTED = 'injection_detected',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  QUEUE_TAMPERING = 'queue_tampering',
  PERMISSION_DENIED = 'permission_denied',
  SIGNATURE_VERIFICATION_FAILED = 'signature_verification_failed',
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  agentId: string;
  resourceId?: string;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// DOMAIN TYPE IMPORTS (for completeness)
// ============================================================================

// These types would be imported from the actual domain modules
// Placeholder definitions shown for reference

export interface Task {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependencies: string[];
  fileOwnership: string[];
  createdAt: Date;
  assignedAgent?: string | null;
}

export interface WorkRequest {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
}

export interface AgentState {
  agentId: string;
  status: 'idle' | 'busy' | 'offline';
  currentTask: Task | null;
  tasksCompleted: number;
  lastHeartbeat: Date;
}
