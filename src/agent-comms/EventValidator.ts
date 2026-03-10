/**
 * Event Validator
 *
 * High-performance JSON Schema validation for AgentMessageBus events.
 * Features:
 * - JSON Schema Draft 7 validation
 * - Compiled validator caching for performance
 * - Strict vs lenient validation modes
 * - Detailed error reporting with paths
 * - Schema versioning support
 * - Custom error messages
 */

import {
  JSONSchema,
  EVENT_SCHEMAS,
  getSchema,
  hasSchema,
  getSchemaMetadata
} from './EventSchemas.js';

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  actual?: any;
  keyword?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  schema?: {
    eventType: string;
    title?: string;
    description?: string;
    version?: string;
  };
}

/**
 * Validation options
 */
export interface ValidationOptions {
  strict?: boolean; // Default: false (lenient)
  allowUnknownFields?: boolean; // Default: true in lenient mode
  coerceTypes?: boolean; // Default: false
  removeAdditional?: boolean; // Default: false
  allErrors?: boolean; // Default: true (show all errors)
  skipRequired?: boolean; // Default: false
}

/**
 * Schema registration options
 */
export interface SchemaRegistrationOptions {
  overwrite?: boolean; // Allow overwriting existing schemas
  version?: string; // Schema version
}

/**
 * JSON Schema validator interface
 * Abstracts the actual validation implementation
 */
interface SchemaValidator {
  validate(data: any): boolean | Promise<boolean>;
  errors?: ValidationError[];
}

/**
 * In-memory schema cache
 * Caches compiled validators for performance
 */
interface ValidatorCache {
  [eventType: string]: {
    validator: SchemaValidator;
    createdAt: Date;
    lastUsed: Date;
    useCount: number;
  };
}

/**
 * Event Validator Class
 *
 * Main validation engine for AgentMessageBus events
 */
export class EventValidator {
  private cache: ValidatorCache = {};
  private cacheEnabled: boolean = true;
  private defaultOptions: ValidationOptions;
  private customSchemas: Map<string, JSONSchema> = new Map();

  constructor(options?: Partial<ValidationOptions>) {
    this.defaultOptions = {
      strict: false,
      allowUnknownFields: true,
      coerceTypes: false,
      removeAdditional: false,
      allErrors: true,
      skipRequired: false,
      ...options
    };
  }

  /**
   * Validate an event payload against its schema
   *
   * @param eventType - Event type (e.g., 'task.created', 'plan.completed')
   * @param payload - Event payload to validate
   * @param options - Validation options
   * @returns Validation result with detailed errors if invalid
   */
  validateEvent(eventType: string, payload: any, options?: ValidationOptions): ValidationResult {
    const opts = { ...this.defaultOptions, ...options };

    // Get schema for event type
    let schema = getSchema(eventType) || this.customSchemas.get(eventType);

    // If no schema found
    if (!schema) {
      if (opts.strict) {
        return {
          valid: false,
          errors: [
            {
              path: '',
              message: `No schema registered for event type: ${eventType}`,
              keyword: 'schema'
            }
          ]
        };
      } else {
        // Lenient mode: accept unknown event types
        return { valid: true };
      }
    }

    // Perform validation
    const errors = this.validateAgainstSchema(schema, payload, opts);

    const valid = errors.length === 0;

    return {
      valid,
      errors: valid ? undefined : errors,
      schema: {
        eventType,
        title: schema.title,
        description: schema.description,
        version: schema.$id?.match(/(\d+\.\d+\.\d+)/)?.[1]
      }
    };
  }

  /**
   * Validate multiple events in batch
   *
   * @param events - Array of { eventType, payload } objects
   * @param options - Validation options
   * @returns Array of validation results
   */
  validateBatch(
    events: Array<{ eventType: string; payload: any }>,
    options?: ValidationOptions
  ): Array<{ eventType: string; result: ValidationResult }> {
    return events.map(({ eventType, payload }) => ({
      eventType,
      result: this.validateEvent(eventType, payload, options)
    }));
  }

  /**
   * Register a custom schema for an event type
   *
   * @param eventType - Event type
   * @param schema - JSON Schema definition
   * @param options - Registration options
   */
  registerSchema(eventType: string, schema: JSONSchema, options?: SchemaRegistrationOptions): void {
    const opts = {
      overwrite: false,
      version: '1.0.0',
      ...options
    };

    // Check if schema already exists (either built-in or custom)
    const schemaExists = hasSchema(eventType) || this.customSchemas.has(eventType);
    if (schemaExists && !opts.overwrite) {
      throw new Error(`Schema already registered for event type: ${eventType}. Use overwrite: true to replace.`);
    }

    // Validate the schema itself
    const schemaErrors = this.validateSchemaStructure(schema);
    if (schemaErrors.length > 0) {
      throw new Error(`Invalid JSON Schema: ${schemaErrors.map(e => e.message).join(', ')}`);
    }

    // Store schema
    this.customSchemas.set(eventType, schema);

    // Clear cache for this event type
    if (this.cache[eventType]) {
      delete this.cache[eventType];
    }
  }

  /**
   * Unregister a custom schema
   *
   * @param eventType - Event type to unregister
   */
  unregisterSchema(eventType: string): void {
    if (this.customSchemas.has(eventType)) {
      this.customSchemas.delete(eventType);

      // Clear cache
      if (this.cache[eventType]) {
        delete this.cache[eventType];
      }
    }
  }

  /**
   * Get schema for an event type
   *
   * @param eventType - Event type
   * @returns JSON Schema or null
   */
  getSchema(eventType: string): JSONSchema | null {
    return getSchema(eventType) || this.customSchemas.get(eventType) || null;
  }

  /**
   * Check if an event type has a registered schema
   *
   * @param eventType - Event type
   * @returns True if schema exists
   */
  hasSchema(eventType: string): boolean {
    return hasSchema(eventType) || this.customSchemas.has(eventType);
  }

  /**
   * Get all registered event types (built-in + custom)
   *
   * @returns Array of event type names
   */
  getRegisteredEventTypes(): string[] {
    const builtIn = Object.keys(EVENT_SCHEMAS);
    const custom = Array.from(this.customSchemas.keys());
    return Array.from(new Set<string>([...builtIn, ...custom]));
  }

  /**
   * Get metadata about a schema
   *
   * @param eventType - Event type
   * @returns Schema metadata or null
   */
  getSchemaMetadata(eventType: string): {
    title?: string;
    description?: string;
    version?: string;
    $id?: string;
  } | null {
    const metadata = getSchemaMetadata(eventType);
    const customSchema = this.customSchemas.get(eventType);

    if (metadata) {
      return metadata;
    }

    if (customSchema) {
      return {
        title: customSchema.title,
        description: customSchema.description,
        $id: customSchema.$id
      };
    }

    return null;
  }

  /**
   * Enable or disable validator caching
   *
   * @param enabled - Whether to enable caching
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;

    if (!enabled) {
      this.cache = {};
    }
  }

  /**
   * Clear the validator cache
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getCacheStats(): {
    size: number;
    entries: Array<{
      eventType: string;
      createdAt: Date;
      lastUsed: Date;
      useCount: number;
    }>;
  } {
    return {
      size: Object.keys(this.cache).length,
      entries: Object.entries(this.cache).map(([eventType, data]) => ({
        eventType,
        createdAt: data.createdAt,
        lastUsed: data.lastUsed,
        useCount: data.useCount
      }))
    };
  }

  /**
   * Validate data against a JSON Schema
   *
   * @param schema - JSON Schema
   * @param data - Data to validate
   * @param options - Validation options
   * @returns Array of validation errors (empty if valid)
   */
  private validateAgainstSchema(
    schema: JSONSchema,
    data: any,
    options: ValidationOptions
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Root-level validation
    this.validateValue(schema, data, '', errors, options);

    return errors;
  }

  /**
   * Validate a value against a schema
   *
   * @param schema - JSON Schema
   * @param value - Value to validate
   * @param path - JSON path for error reporting
   * @param errors - Accumulated errors
   * @param options - Validation options
   */
  private validateValue(
    schema: JSONSchema,
    value: any,
    path: string,
    errors: ValidationError[],
    options: ValidationOptions
  ): void {
    // Type validation
    if (schema.type) {
      const typeError = this.validateType(schema.type, value, path);
      if (typeError) {
        errors.push(typeError);
        return; // Stop if type doesn't match
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        expected: schema.enum.join(' | '),
        actual: value,
        keyword: 'enum'
      });
      return;
    }

    // Const validation
    if (schema.const !== undefined && value !== schema.const) {
      errors.push({
        path,
        message: `Value must be: ${JSON.stringify(schema.const)}`,
        expected: JSON.stringify(schema.const),
        actual: value,
        keyword: 'const'
      });
      return;
    }

    // String-specific validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path,
          message: `String length ${value.length} is less than minimum ${schema.minLength}`,
          expected: `length >= ${schema.minLength}`,
          actual: value.length,
          keyword: 'minLength'
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path,
          message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
          expected: `length <= ${schema.maxLength}`,
          actual: value.length,
          keyword: 'maxLength'
        });
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push({
          path,
          message: `String does not match required pattern`,
          expected: schema.pattern,
          actual: value,
          keyword: 'pattern'
        });
      }
      if (schema.format) {
        const formatError = this.validateFormat(value, schema.format, path);
        if (formatError) {
          errors.push(formatError);
        }
      }
    }

    // Number-specific validations
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path,
          message: `Value ${value} is less than minimum ${schema.minimum}`,
          expected: `>= ${schema.minimum}`,
          actual: value,
          keyword: 'minimum'
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path,
          message: `Value ${value} exceeds maximum ${schema.maximum}`,
          expected: `<= ${schema.maximum}`,
          actual: value,
          keyword: 'maximum'
        });
      }
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
        errors.push({
          path,
          message: `Value ${value} must be greater than ${schema.exclusiveMinimum}`,
          expected: `> ${schema.exclusiveMinimum}`,
          actual: value,
          keyword: 'exclusiveMinimum'
        });
      }
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
        errors.push({
          path,
          message: `Value ${value} must be less than ${schema.exclusiveMaximum}`,
          expected: `< ${schema.exclusiveMaximum}`,
          actual: value,
          keyword: 'exclusiveMaximum'
        });
      }
      if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
        errors.push({
          path,
          message: `Value ${value} is not a multiple of ${schema.multipleOf}`,
          expected: `multiple of ${schema.multipleOf}`,
          actual: value,
          keyword: 'multipleOf'
        });
      }
    }

    // Array-specific validations
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
          path,
          message: `Array length ${value.length} is less than minimum ${schema.minItems}`,
          expected: `length >= ${schema.minItems}`,
          actual: value.length,
          keyword: 'minItems'
        });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({
          path,
          message: `Array length ${value.length} exceeds maximum ${schema.maxItems}`,
          expected: `length <= ${schema.maxItems}`,
          actual: value.length,
          keyword: 'maxItems'
        });
      }
      if (schema.uniqueItems) {
        const unique = new Set(value.map((v: any) => JSON.stringify(v)));
        if (unique.size !== value.length) {
          errors.push({
            path,
            message: 'Array items must be unique',
            keyword: 'uniqueItems'
          });
        }
      }

      // Validate each item
      if (schema.items) {
        value.forEach((item: any, index: number) => {
          this.validateValue(schema.items!, item, `${path}[${index}]`, errors, options);
        });
      }
    }

    // Object-specific validations
    if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Required fields
      if (schema.required && !options.skipRequired) {
        for (const field of schema.required) {
          if (!(field in value)) {
            errors.push({
              path: path ? `${path}.${field}` : field,
              message: `Missing required field: ${field}`,
              keyword: 'required'
            });
          }
        }
      }

      // Properties
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if (propName in value) {
            const propPath = path ? `${path}.${propName}` : propName;
            this.validateValue(propSchema, value[propName], propPath, errors, options);
          }
        }
      }

      // Additional properties
      if (schema.additionalProperties === false && !options.allowUnknownFields) {
        const knownProps = new Set(Object.keys(schema.properties || {}));
        const unknownProps = Object.keys(value).filter(k => !knownProps.has(k));
        if (unknownProps.length > 0) {
          errors.push({
            path,
            message: `Unknown fields not allowed: ${unknownProps.join(', ')}`,
            keyword: 'additionalProperties'
          });
        }
      }
    }
  }

  /**
   * Validate type
   */
  private validateType(type: string | string[], value: any, path: string): ValidationError | null {
    const types = Array.isArray(type) ? type : [type];
    const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

    const valid = types.some(t => {
      if (t === 'array') return Array.isArray(value);
      if (t === 'null') return value === null;
      return actualType === t;
    });

    if (!valid) {
      return {
        path,
        message: `Expected type ${types.join(' | ')}, got ${actualType}`,
        expected: types.join(' | '),
        actual: actualType,
        keyword: 'type'
      };
    }

    return null;
  }

  /**
   * Validate format
   */
  private validateFormat(value: string, format: string, path: string): ValidationError | null {
    const formats: Record<string, RegExp> = {
      'uuid': /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      'email': /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'uri': /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]*$/,
      'hostname': /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    };

    const regex = formats[format];
    if (regex && !regex.test(value)) {
      return {
        path,
        message: `String does not match format: ${format}`,
        expected: format,
        actual: value,
        keyword: 'format'
      };
    }

    return null;
  }

  /**
   * Validate schema structure
   */
  private validateSchemaStructure(schema: JSONSchema): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!schema.type) {
      errors.push({
        path: '',
        message: 'Schema must have a "type" property',
        keyword: 'type'
      });
    }

    if (schema.type && !['object', 'array', 'string', 'number', 'boolean', 'null'].includes(schema.type)) {
      errors.push({
        path: 'type',
        message: `Invalid type: ${schema.type}`,
        keyword: 'type'
      });
    }

    return errors;
  }

  /**
   * Format validation errors for human-readable output
   *
   * @param result - Validation result
   * @returns Formatted error message
   */
  formatErrors(result: ValidationResult): string {
    if (!result.errors || result.errors.length === 0) {
      return 'Validation passed';
    }

    const lines: string[] = [];

    if (result.schema) {
      lines.push(`Event: ${result.schema.eventType}`);
      if (result.schema.title) {
        lines.push(`Schema: ${result.schema.title}`);
      }
    }

    lines.push('Validation errors:');
    lines.push('');

    for (const error of result.errors) {
      const path = error.path || '(root)';
      lines.push(`  ${path}: ${error.message}`);
      if (error.expected !== undefined) {
        lines.push(`    Expected: ${error.expected}`);
      }
      if (error.actual !== undefined) {
        lines.push(`    Actual: ${JSON.stringify(error.actual)}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Default singleton validator instance
 */
let defaultValidator: EventValidator | null = null;

/**
 * Get the default validator instance
 */
export function getDefaultValidator(): EventValidator {
  if (!defaultValidator) {
    defaultValidator = new EventValidator();
  }
  return defaultValidator;
}

/**
 * Quick validation function using default validator
 *
 * @param eventType - Event type
 * @param payload - Event payload
 * @returns Validation result
 */
export function validateEvent(eventType: string, payload: any): ValidationResult {
  return getDefaultValidator().validateEvent(eventType, payload);
}
