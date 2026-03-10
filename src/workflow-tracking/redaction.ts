/**
 * UltraPilot Workflow Tracking System - Data Redaction
 *
 * Basic redaction for sensitive data in workflow logs.
 * Enhanced content-based detection deferred to v2.
 *
 * @version 1.0
 * @date 2026-03-03
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Sensitive field name patterns
 * These match field names that commonly contain secrets
 */
const SENSITIVE_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /auth/i,
  /credential/i,
  /apikey/i,
  /access[_-]?token/i
];

/**
 * Base64 string pattern
 * Matches base64 strings longer than 32 characters
 */
const BASE64_PATTERN = /[A-Za-z0-9+/]{40,}={0,2}/g;

/**
 * Redact sensitive data from an object
 *
 * This implementation:
 * - Checks field names against sensitive patterns
 * - Truncates long base64 strings
 * - Preserves structure of the object
 *
 * @param data - Data to redact
 * @returns Redacted data
 */
export function redactData(data: any): any {
  if (!data) {
    return data;
  }

  // Primitive types
  if (typeof data !== 'object') {
    return redactString(String(data));
  }

  // Arrays
  if (Array.isArray(data)) {
    return data.map(item => redactData(item));
  }

  // Objects
  const redacted: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveFieldName(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactString(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Redact sensitive content from a string
 *
 * @param str - String to redact
 * @returns Redacted string
 */
export function redactString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // Truncate long base64 strings
  if (str.length > 100) {
    // Check if it looks like base64
    if (BASE64_PATTERN.test(str)) {
      return `[REDACTED_BASE64:${str.substring(0, 8)}...]`;
    }

    // Truncate very long strings
    if (str.length > 1000) {
      return str.substring(0, 1000) + '...[TRUNCATED]';
    }
  }

  return str;
}

/**
 * Truncate text to a maximum length
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number = 10000): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + '...[TRUNCATED]';
}

/**
 * Check if a field name is sensitive
 *
 * @param fieldName - Field name to check
 * @returns True if field name is sensitive
 */
function isSensitiveFieldName(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Truncate a payload to a summary
 *
 * @param payload - Payload object to truncate
 * @param maxLength - Maximum length for JSON string
 * @returns Truncated JSON string
 */
export function truncatePayload(payload: any, maxLength: number = 5000): string {
  try {
    const json = JSON.stringify(payload);

    if (json.length <= maxLength) {
      return json;
    }

    return json.substring(0, maxLength) + '...[TRUNCATED]';
  } catch (error) {
    return '[UNSERIALIZABLE_PAYLOAD]';
  }
}

/**
 * Sanitize error message for logging
 *
 * @param error - Error to sanitize
 * @returns Sanitized error string
 */
export function sanitizeError(error: Error | string | unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return redactString(error);
  }

  return String(error);
}

/**
 * Generate a safe ID (UUID)
 *
 * @returns UUID string
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Current timestamp (Unix epoch in milliseconds)
 *
 * @returns Current timestamp
 */
export function now(): number {
  return Date.now();
}

/**
 * Convert Date to Unix timestamp (milliseconds)
 *
 * @param date - Date to convert
 * @returns Unix timestamp
 */
export function toTimestamp(date: Date): number {
  return date.getTime();
}

/**
 * Convert Unix timestamp to Date
 *
 * @param timestamp - Unix timestamp
 * @returns Date
 */
export function fromDate(timestamp: number): Date {
  return new Date(timestamp);
}
