/**
 * InputValidator - WorkRequest validation using Zod schemas
 *
 * SQL INJECTION PROTECTION:
 *
 * This validator uses Zod schemas for type safety. All database operations
 * MUST use parameterized queries to prevent SQL injection. The existing
 * codebase already uses parameterized queries via better-sqlite3.
 *
 * @example
 * // SAFE: Parameterized query
 * db.prepare('INSERT INTO tasks (id, data) VALUES (?, ?)').run(taskId, jsonData);
 *
 * @example
 * // UNSAFE: Never concatenate user input
 * db.prepare(`INSERT INTO tasks (id, data) VALUES ('${userInput}', ...)`).run();
 */

import { z } from 'zod';
import type { ValidationResult } from './types';
import { ValidationError } from './errors';

export class InputValidator {
  private taskSchema = z.object({
    id: z.string().uuid('Invalid task ID format'),
    description: z.string().max(2000, 'Task description must be less than 2000 characters'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    status: z.enum(['pending', 'in-progress', 'completed', 'failed']).optional(),
    dependencies: z.array(z.string().uuid()).max(50, 'Too many dependencies (max 50)'),
    fileOwnership: z.array(z.string()).max(20, 'Too many files claimed (max 20)'),
    createdAt: z.date().optional(),
    assignedAgent: z.string().optional(),
  });

  private workRequestSchema = z.object({
    id: z.string().uuid('Invalid work request ID format'),
    title: z.string()
      .max(200, 'Title must be less than 200 characters')
      .regex(/[^\0]/, 'Title cannot contain null bytes'),
    description: z.string()
      .max(5000, 'Description must be less than 5000 characters')
      .regex(/[^\0]/, 'Description cannot contain null bytes'),
    tasks: z.array(this.taskSchema).max(100, 'Too many tasks (max 100)'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    createdAt: z.date().optional(),
  });

  /**
   * Validate work request
   *
   * @param request - Work request to validate
   * @returns Validation result with sanitized data
   * @throws ValidationError if validation fails
   */
  async validateWorkRequest(request: unknown): Promise<ValidationResult<any>> {
    try {
      const sanitized = await this.workRequestSchema.parseAsync(request);
      return {
        valid: true,
        sanitized: sanitized,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fields = error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Work request validation failed', fields);
      }
      throw error;
    }
  }

  /**
   * Validate task
   *
   * @param task - Task to validate
   * @returns Validation result with sanitized data
   * @throws ValidationError if validation fails
   */
  async validateTask(task: unknown): Promise<ValidationResult<any>> {
    try {
      const sanitized = await this.taskSchema.parseAsync(task);
      return {
        valid: true,
        sanitized: sanitized,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fields = error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Task validation failed', fields);
      }
      throw error;
    }
  }
}
