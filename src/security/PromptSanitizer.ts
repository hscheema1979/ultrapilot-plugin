/**
 * PromptSanitizer - Agent prompt injection detection and sanitization
 *
 * ReDoS PROTECTION:
 *
 * - Input length limited to 100KB to prevent memory exhaustion
 * - Simple literal patterns (no nested quantifiers)
 * - String operations instead of regex where possible
 * - No timeout mechanism (doesn't stop synchronous backtracking)
 */

import type { SanitizedPrompt, SanitizationContext } from './types';
import { InjectionDetectedError } from './errors';

export class PromptSanitizer {
  private static readonly MAX_PROMPT_LENGTH = 100_000; // 100KB

  // ReDoS-safe patterns (no nested quantifiers, no overlapping alternations)
  private static readonly INJECTION_PATTERNS = [
    /ignore previous instructions/i,
    /disregard.*above/i,
    /system:\s*user/i,
    /\[INST\]/i,
    /<\|.*?\|>/i,
    /jailbreak/i,
    /developer mode/i,
    /override.*protocol/i,
  ] as const;

  /**
   * Sanitize agent prompt
   *
   * @param prompt - Prompt to sanitize
   * @param allowedVars - Variables that can be interpolated
   * @param context - Sanitization context with variable values
   * @returns Sanitized prompt
   * @throws InjectionDetectedError if injection detected
   */
  async sanitizeAgentPrompt(
    prompt: string,
    allowedVars: string[] = [],
    context?: SanitizationContext
  ): Promise<SanitizedPrompt> {
    // Input length limit (prevent memory exhaustion)
    const maxLength = context?.maxLength || PromptSanitizer.MAX_PROMPT_LENGTH;
    if (prompt.length > maxLength) {
      throw new InjectionDetectedError(
        'Prompt too large',
        {
          pattern: 'length',
          inputLength: prompt.length,
          maxSize: maxLength,
        }
      );
    }

    // Check for injection patterns (ReDoS-safe)
    const detectedPatterns: string[] = [];
    for (const pattern of PromptSanitizer.INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        detectedPatterns.push(pattern.source);
      }
    }

    if (detectedPatterns.length > 0) {
      throw new InjectionDetectedError(
        'Prompt injection detected',
        { pattern: detectedPatterns.join(', ') }
      );
    }

    // Sanitize variables (string operations - ReDoS-safe)
    const variables = context?.variables || {};
    const sanitized = this.sanitizeVariables(prompt, allowedVars, variables);

    return {
      safe: true,
      sanitized,
      detectedPatterns: [],
      variablesReplaced: Object.keys(variables),
    };
  }

  /**
   * Sanitize variable placeholders (ReDoS-safe string operations)
   *
   * Uses indexOf/substring instead of regex to avoid ReDoS entirely
   */
  private sanitizeVariables(
    prompt: string,
    allowedVars: string[],
    variables: Record<string, string>
  ): string {
    let result = prompt;

    for (const v of allowedVars) {
      if (!(v in variables)) {
        continue; // Skip if variable not provided
      }

      const placeholder = `{${v}}`;
      const value = variables[v];

      // Use indexOf/substring instead of regex (ReDoS-safe)
      let index = result.indexOf(placeholder);
      while (index !== -1) {
        result = result.substring(0, index) + value + result.substring(index + placeholder.length);
        index = result.indexOf(placeholder, index + value.length);
      }
    }

    return result;
  }

  /**
   * Quick check for injection patterns (throws if detected)
   *
   * @param prompt - Prompt to check
   * @returns true if safe, throws if unsafe
   */
  async checkPromptSafe(prompt: string): Promise<boolean> {
    for (const pattern of PromptSanitizer.INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        throw new InjectionDetectedError(
          'Prompt injection detected',
          { pattern: pattern.source }
        );
      }
    }
    return true;
  }

  /**
   * Enhanced validation with obfuscation detection
   * NEW STATIC METHOD for wshobson integration
   *
   * @param prompt - Prompt to validate
   * @returns Validation result with safety status and issues
   */
  static async validateAgentPrompt(prompt: string): Promise<{ safe: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Existing injection patterns
    for (const pattern of PromptSanitizer.INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        issues.push(`Injection detected: ${pattern.source}`);
      }
    }

    // NEW: Obfuscation detection patterns
    const obfuscationPatterns = [
      { pattern: /eval\x28/, name: 'eval() hex encoded' },
      { pattern: /eval\\u0028/, name: 'eval() unicode encoded' },
      { pattern: /Function\s*\(/, name: 'Function constructor' },
      { pattern: /setTimeout\s*\(\s*['"`]/, name: 'setTimeout with string' },
      { pattern: /setInterval\s*\(\s*['"`]/, name: 'setInterval with string' },
      { pattern: /\.__proto__/, name: '__proto__ assignment' },
      { pattern: /\.prototype\[/, name: 'prototype manipulation' },
      { pattern: /\.\.\//, name: 'path traversal' },
      { pattern: /\b[A-Za-z0-9+/]{20,}={0,2}\b/, name: 'possible base64 payload' },
      { pattern: /\\u[0-9a-fA-F]{4}/gi, name: 'unicode escape' },
      { pattern: /\\x[0-9a-fA-F]{2}/gi, name: 'hex escape' },
      { pattern: /['"`][\w]{1,3}['"`]\s*\+\s*['"`][\w]{1,3}['"`]/, name: 'string concatenation' }
    ];

    for (const { pattern, name } of obfuscationPatterns) {
      if (pattern.test(prompt)) {
        issues.push(`Obfuscation detected: ${name}`);
      }
    }

    return {
      safe: issues.length === 0,
      issues
    };
  }
}
