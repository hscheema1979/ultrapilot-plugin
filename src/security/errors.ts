/**
 * UltraPilot Security Module Error Definitions
 *
 * All error classes extend Error with additional context for debugging
 * and security monitoring.
 */

import { FieldError } from './types';

export class ValidationError extends Error {
  readonly name = 'ValidationError';

  constructor(
    message: string,
    public fields: FieldError[]
  ) {
    super(message);
    Error.captureStackTrace(this, ValidationError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      fields: this.fields,
    };
  }
}

export class InjectionDetectedError extends Error {
  readonly name = 'InjectionDetectedError';

  constructor(
    message: string,
    public details: {
      pattern: string;
      inputLength?: number;
      maxSize?: number;
    }
  ) {
    super(message);
    Error.captureStackTrace(this, InjectionDetectedError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
    };
  }
}

export class SignatureVerificationError extends Error {
  readonly name = 'SignatureVerificationError';

  constructor(
    message: string,
    public reason: 'invalid' | 'expired' | 'replay',
    public age?: number
  ) {
    super(message);
    Error.captureStackTrace(this, SignatureVerificationError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      reason: this.reason,
      age: this.age,
    };
  }
}

export class AccessDeniedError extends Error {
  readonly name = 'AccessDeniedError';

  constructor(
    message: string,
    public resource: string,
    public requiredPermission: string,
    public agentId: string
  ) {
    super(message);
    Error.captureStackTrace(this, AccessDeniedError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      resource: this.resource,
      requiredPermission: this.requiredPermission,
      agentId: this.agentId,
    };
  }
}

export class RateLimitExceededError extends Error {
  readonly name = 'RateLimitExceededError';

  constructor(
    message: string,
    public operation: string,
    public retryAfter: number,
    public limit: number
  ) {
    super(message);
    Error.captureStackTrace(this, RateLimitExceededError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      operation: this.operation,
      retryAfter: this.retryAfter,
      limit: this.limit,
    };
  }
}

export class DatabaseResetError extends Error {
  readonly name = 'DatabaseResetError';

  constructor(
    message: string,
    public reason: 'not_in_test' | 'reset_in_progress' | 'close_failed'
  ) {
    super(message);
    Error.captureStackTrace(this, DatabaseResetError);
  }
}
