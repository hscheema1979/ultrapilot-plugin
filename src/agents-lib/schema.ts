/**
 * wshobson Agent Schema Validation
 *
 * Uses Zod for schema validation with graceful fallback for legacy agents.
 * Addresses critic requirement for concrete R1 mitigation (Plugin Format Drift).
 *
 * SECURITY HARDENING (Revision 1):
 * - Safe YAML parsing using js-yaml with FAILSAFE_SCHEMA
 * - Strict Zod validation (no passthrough) to reject unknown properties
 * - Key whitelist validation to prevent prototype pollution
 * - Comprehensive input sanitization
 */

import { z } from 'zod';
import * as yaml from 'js-yaml';

/**
 * Whitelist of allowed frontmatter keys
 *
 * This whitelist prevents malicious properties from being injected into the parsed object.
 * Only these keys are allowed in agent frontmatter.
 */
const ALLOWED_FRONTMATTER_KEYS = [
  'name',
  'description',
  'category',
  'capabilities',
  'version',
  'model',
  // Add additional safe keys here as needed
] as const;

/**
 * Type guard to check if a key is in the allowed whitelist
 */
function isAllowedKey(key: string): key is typeof ALLOWED_FRONTMATTER_KEYS[number] {
  return ALLOWED_FRONTMATTER_KEYS.includes(key as any);
}

/**
 * Zod schema for agent frontmatter validation
 *
 * SECURITY: Uses .strict() instead of .passthrough() to reject unknown properties.
 * This prevents malicious properties from bypassing validation.
 *
 * Required fields with fallback support for legacy agents
 */
export const AgentFrontmatterSchema = z.object({
  name: z.string().min(1).describe("Agent name"),
  description: z.string().min(1).describe("Agent description"),
  category: z.string().default('general').describe("Agent category"),
  capabilities: z.array(z.string()).default([]).describe("Agent capabilities"),
  version: z.string().optional().describe("Agent version (for migration tracking)"),
  model: z.enum(['haiku', 'sonnet', 'opus', 'inherit', 'inherit-autodetect']).default('sonnet').describe("Preferred model tier"),
}).strict();  // SECURITY: Reject unknown properties (was .passthrough())

/**
 * Zod schema for full agent definition
 */
export const AgentSchema = z.object({
  name: z.string(),
  plugin: z.string(),
  path: z.string(),
  description: z.string(),
  capabilities: z.array(z.object({
    name: z.string(),
    hierarchy: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })),
  category: z.string(),
  examples: z.array(z.string()).default([]),
  metadata: z.object({
    frontmatter: z.record(z.string(), z.any()),
    content: z.string(),
  }),
  status: z.enum(['idle', 'working', 'failed']).default('idle'),
  lastUsed: z.number().default(0),
  successRate: z.number().min(0).max(1).default(0.5),
});

/**
 * Parse agent frontmatter from markdown file
 *
 * Handles both standard format and legacy formats with fallback
 */
export function parseAgentFrontmatter(content: string): {
  frontmatter: Record<string, any>;
  content: string;
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let frontmatter: Record<string, any> = {};
  let bodyContent = content;
  let valid = true;

  try {
    // Extract YAML frontmatter between --- delimiters
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];
      bodyContent = content.slice(frontmatterMatch[0].length).trim();

      // Parse YAML (basic implementation)
      frontmatter = parseYaml(yamlContent);

      // Validate against schema
      const result = AgentFrontmatterSchema.safeParse(frontmatter);

      if (!result.success) {
        errors.push(`Frontmatter validation failed: ${result.error.issues.map(e => e.message).join(', ')}`);
        valid = false;

        // Attempt to fix common issues
        frontmatter = fixCommonFrontmatterIssues(frontmatter);
      }
    } else {
      errors.push('No frontmatter found (missing --- delimiters)');
      valid = false;

      // Fallback: extract from content
      frontmatter = extractFrontmatterFromBody(bodyContent);
    }
  } catch (error) {
    errors.push(`Failed to parse frontmatter: ${error}`);
    valid = false;

    // Fallback to defaults
    frontmatter = {
      name: 'unknown',
      description: 'No description available',
      category: 'general',
      capabilities: [],
    };
  }

  return {
    frontmatter,
    content: bodyContent,
    valid,
    errors,
  };
}

/**
 * Safely parse YAML frontmatter with security protections
 *
 * SECURITY IMPLEMENTATION (Revision 1):
 * 1. Uses js-yaml library with FAILSAFE_SCHEMA to prevent code execution
 * 2. Validates all keys against an allowed whitelist
 * 3. Prevents prototype pollution via key validation
 * 4. Provides clear error messages for invalid input
 *
 * @param yamlContent - Raw YAML string from frontmatter
 * @returns Parsed object with only allowed keys
 * @throws Error if YAML is malformed or contains disallowed keys
 */
function parseYaml(yamlContent: string): Record<string, any> {
  // Step 1: Parse YAML using FAILSAFE_SCHEMA only
  // FAILSAFE_SCHEMA only parses: strings, arrays, numbers, booleans, null
  // It explicitly blocks: !!js/function, !!js/regexp, !!js/undefined, and other unsafe types
  let parsed: any;
  try {
    parsed = yaml.load(yamlContent, {
      schema: yaml.FAILSAFE_SCHEMA,
    }) as Record<string, any>;
  } catch (error) {
    throw new Error(`YAML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Ensure we have a plain object
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('YAML must parse to an object, not ' + typeof parsed);
  }

  // Step 3: Validate keys against whitelist and filter
  const result: Record<string, any> = {};

  for (const key of Object.keys(parsed)) {
    // SECURITY: Prevent prototype pollution
    // Never allow __proto__, constructor, or prototype properties
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn(`[Security] Blocked dangerous key: ${key}`);
      continue;
    }

    // SECURITY: Check key against whitelist
    if (!isAllowedKey(key)) {
      // Skip disallowed keys instead of throwing - maintain backward compatibility
      // but log a warning for debugging
      console.warn(`[Security] Skipping disallowed frontmatter key: ${key}`);
      continue;
    }

    const value = parsed[key];

    // SECURITY: Validate value types
    // Only allow primitive types and arrays of primitives
    if (value === null) {
      result[key] = null;
    } else if (typeof value === 'string') {
      result[key] = value;
    } else if (typeof value === 'number') {
      result[key] = value;
    } else if (typeof value === 'boolean') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      // Validate array elements are strings (for capabilities array)
      if (key === 'capabilities') {
        result[key] = value.map((item, idx) => {
          if (typeof item !== 'string') {
            console.warn(`[Security] capabilities[${idx}] is not a string, converting`);
            return String(item);
          }
          return item;
        });
      } else {
        // For other arrays, just validate they don't contain objects
        const hasObjects = value.some(item => typeof item === 'object' && item !== null);
        if (hasObjects) {
          console.warn(`[Security] Array ${key} contains objects, filtering`);
          result[key] = value.filter(item => typeof item !== 'object' || item === null);
        } else {
          result[key] = value;
        }
      }
    } else {
      console.warn(`[Security] Skipping ${key}: unsupported type ${typeof value}`);
    }
  }

  return result;
}

/**
 * Fix common frontmatter issues
 */
function fixCommonFrontmatterIssues(frontmatter: Record<string, any>): Record<string, any> {
  const fixed = { ...frontmatter };

  // Ensure required fields exist
  if (!fixed.name) {
    fixed.name = 'unknown';
  }

  if (!fixed.description) {
    fixed.description = fixed.name || 'No description';
  }

  if (!fixed.category) {
    fixed.category = 'general';
  }

  if (!Array.isArray(fixed.capabilities)) {
    fixed.capabilities = [];
  }

  // Ensure version field exists (for migration tracking)
  if (!fixed.version) {
    fixed.version = '1.0.0';
  }

  return fixed;
}

/**
 * Extract frontmatter from body when --- delimiters missing
 */
function extractFrontmatterFromBody(content: string): Record<string, any> {
  const result: Record<string, any> = {
    name: 'unknown',
    description: '',
    category: 'general',
    capabilities: [],
  };

  // Try to extract name from first heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    result.name = headingMatch[1].toLowerCase().replace(/\s+/g, '-');
    result.description = headingMatch[1];
  }

  return result;
}

/**
 * Validate agent definition
 */
export function validateAgent(agent: any): {
  valid: boolean;
  errors: string[];
  agent?: any;
} {
  const result = AgentSchema.safeParse(agent);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      agent: result.data,
    };
  }

  return {
    valid: false,
    errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
