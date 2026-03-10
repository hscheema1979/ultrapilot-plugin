/**
 * Event Validation System Tests
 *
 * Comprehensive test suite for EventValidator, EventSchemas, and ValidationMiddleware
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventValidator, ValidationResult, ValidationError } from '../EventValidator.js';
import { ValidationMiddleware, ValidationErrorException } from '../ValidationMiddleware.js';
import {
  EVENT_SCHEMAS,
  PLAN_CREATED_SCHEMA,
  TASK_STARTED_SCHEMA,
  AGENT_SPAWNED_SCHEMA,
  getSchema,
  getRegisteredEventTypes,
  hasSchema
} from '../EventSchemas.js';

describe('EventSchemas', () => {
  describe('Schema Registry', () => {
    it('should have at least 15 registered event types', () => {
      const eventTypes = getRegisteredEventTypes();
      expect(eventTypes.length).toBeGreaterThanOrEqual(15);
    });

    it('should include all required event types', () => {
      const requiredEvents = [
        'plan.created',
        'plan.updated',
        'plan.completed',
        'task.queued',
        'task.started',
        'task.completed',
        'task.failed',
        'agent.spawned',
        'agent.completed',
        'phase.completed',
        'workflow.completed',
        'autoloop.heartbeat',
        'autoloop.cycle.complete'
      ];

      for (const eventType of requiredEvents) {
        expect(hasSchema(eventType)).toBe(true);
        expect(getSchema(eventType)).toBeTruthy();
      }
    });

    it('should have valid JSON Schema structure for all events', () => {
      const eventTypes = getRegisteredEventTypes();

      for (const eventType of eventTypes) {
        const schema = getSchema(eventType);
        expect(schema).toBeDefined();
        expect(schema?.type).toBe('object');
        expect(schema?.$schema).toMatch(/json-schema\.org/);
      }
    });
  });

  describe('Plan Event Schemas', () => {
    it('should validate plan.created event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        planId: 'plan-001',
        plan: {
          title: 'Implement user authentication',
          description: 'Add OAuth2 support',
          phases: [
            {
              phaseId: 'phase-1',
              name: 'Design',
              description: 'Create authentication flow design',
              tasks: ['task-1', 'task-2']
            }
          ]
        },
        createdBy: {
          agentId: 'ultra:planner',
          agentType: 'planner',
          agentName: 'Planner Agent'
        },
        domainId: 'domain-001'
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('plan.created', validPayload);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject plan.created with missing required fields', () => {
      const invalidPayload = {
        planId: 'plan-001',
        // Missing 'plan' field
        createdBy: {
          agentId: 'ultra:planner',
          agentType: 'planner',
          agentName: 'Planner Agent'
        }
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('plan.created', invalidPayload);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.message.includes('plan'))).toBe(true);
    });
  });

  describe('Task Event Schemas', () => {
    it('should validate task.started event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        task: {
          taskId: 'task-001',
          taskType: 'feature',
          title: 'Implement login page',
          status: 'in_progress'
        },
        startedBy: {
          agentId: 'ultra:executor',
          agentType: 'executor',
          agentName: 'Executor Agent'
        },
        startedAt: new Date().toISOString(),
        executionContext: {
          mode: 'autonomous',
          workspace: '/workspace',
          capabilities: ['file-write', 'file-read', 'search']
        }
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('task.started', validPayload);

      expect(result.valid).toBe(true);
    });

    it('should validate task.completed event with result', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        task: {
          taskId: 'task-001',
          taskType: 'feature',
          title: 'Implement login page',
          status: 'completed'
        },
        completedBy: {
          agentId: 'ultra:executor',
          agentType: 'executor',
          agentName: 'Executor Agent'
        },
        completedAt: new Date().toISOString(),
        result: {
          status: 'success',
          outputs: [
            {
              type: 'file',
              location: '/src/login.tsx',
              description: 'Login component'
            }
          ],
          metrics: {
            filesCreated: 5,
            filesModified: 2,
            testsRun: 20,
            testsPassed: 20
          }
        }
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('task.completed', validPayload);

      expect(result.valid).toBe(true);
    });

    it('should validate task.failed event with error details', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        task: {
          taskId: 'task-001',
          taskType: 'feature',
          title: 'Implement login page',
          status: 'failed'
        },
        failedBy: {
          agentId: 'ultra:executor',
          agentType: 'executor',
          agentName: 'Executor Agent'
        },
        failedAt: new Date().toISOString(),
        error: {
          code: 'execution',
          message: 'Failed to compile TypeScript',
          stack: 'Error: Failed to compile\n at ...',
          details: {
            file: '/src/login.tsx',
            line: 42
          }
        },
        retryable: true,
        retryAttempt: 1
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('task.failed', validPayload);

      expect(result.valid).toBe(true);
    });
  });

  describe('Agent Event Schemas', () => {
    it('should validate agent.spawned event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        agent: {
          agentId: 'ultra:executor-123',
          agentType: 'executor',
          agentName: 'Executor #123'
        },
        spawnedBy: 'orchestrator',
        instanceId: 'inst-001',
        capabilities: ['code', 'test', 'review'],
        config: {
          model: 'sonnet',
          timeout: 30000,
          maxRetries: 3
        }
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('agent.spawned', validPayload);

      expect(result.valid).toBe(true);
    });

    it('should validate agent.completed event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        agent: {
          agentId: 'ultra:executor-123',
          agentType: 'executor',
          agentName: 'Executor #123'
        },
        instanceId: 'inst-001',
        completionReason: 'success',
        summary: {
          tasksCompleted: 5,
          messagesProcessed: 12,
          duration: {
            value: 45,
            unit: 'seconds'
          }
        }
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('agent.completed', validPayload);

      expect(result.valid).toBe(true);
    });
  });

  describe('Autoloop Event Schemas', () => {
    it('should validate autoloop.heartbeat event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        autoloopId: 'autoloop-main',
        status: 'running',
        uptime: {
          value: 3600,
          unit: 'seconds'
        },
        queueStats: {
          pendingTasks: 5,
          inProgressTasks: 3,
          completedTasks: 42,
          failedTasks: 1
        },
        cycleCount: 15
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('autoloop.heartbeat', validPayload);

      expect(result.valid).toBe(true);
    });

    it('should validate autoloop.cycle.complete event', () => {
      const validPayload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        autoloopId: 'autoloop-main',
        cycleNumber: 15,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: {
          value: 500,
          unit: 'milliseconds'
        },
        tasksProcessed: {
          dispatched: 5,
          completed: 3,
          failed: 1,
          retried: 1
        },
        errors: [
          {
            code: 'timeout',
            message: 'Task timed out',
            taskId: 'task-123'
          }
        ]
      };

      const validator = new EventValidator();
      const result = validator.validateEvent('autoloop.cycle.complete', validPayload);

      expect(result.valid).toBe(true);
    });
  });
});

describe('EventValidator', () => {
  let validator: EventValidator;

  beforeEach(() => {
    validator = new EventValidator();
  });

  describe('Basic Validation', () => {
    it('should validate a valid event', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test task',
          status: 'pending'
        },
        queuePosition: 1,
        priority: 'normal'
      };

      const result = validator.validateEvent('task.queued', payload);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject an invalid event', () => {
      const payload = {
        taskId: 'task-1',
        // Missing required fields
      };

      const result = validator.validateEvent('task.started', payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should accept unknown event types in lenient mode', () => {
      const payload = { foo: 'bar' };
      const result = validator.validateEvent('unknown.event', payload);

      expect(result.valid).toBe(true);
    });

    it('should reject unknown event types in strict mode', () => {
      const strictValidator = new EventValidator({ strict: true });
      const payload = { foo: 'bar' };
      const result = strictValidator.validateEvent('unknown.event', payload);

      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('No schema registered');
    });
  });

  describe('Type Validation', () => {
    it('should validate string types', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: [
            {
              phaseId: 'p1',
              name: 'Phase 1',
              tasks: []
            }
          ]
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(true);
    });

    it('should validate number types with constraints', () => {
      const payload = {
        queuePosition: 5,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      };

      const result = validator.validateEvent('task.queued', payload);
      expect(result.valid).toBe(true);
    });

    it('should validate array types', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: [
            { phaseId: 'p1', name: 'Phase 1', tasks: [] },
            { phaseId: 'p2', name: 'Phase 2', tasks: [] }
          ]
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(true);
    });

    it('should validate enum values', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        agent: {
          agentId: 'agent-1',
          agentType: 'executor', // Valid enum value
          agentName: 'Test Agent'
        },
        spawnedBy: 'orchestrator',
        instanceId: 'inst-1'
      };

      const result = validator.validateEvent('agent.spawned', payload);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid enum values', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        agent: {
          agentId: 'agent-1',
          agentType: 'invalid_type', // Invalid enum value
          agentName: 'Test Agent'
        },
        spawnedBy: 'orchestrator',
        instanceId: 'inst-1'
      };

      const result = validator.validateEvent('agent.spawned', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'enum')).toBe(true);
    });
  });

  describe('Format Validation', () => {
    it('should validate UUID format', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const payload = {
        eventId: validUUID,
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: [
            {
              phaseId: 'p1',
              name: 'Phase 1',
              tasks: []
            }
          ]
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const invalidUUID = 'not-a-uuid';
      const payload = {
        eventId: invalidUUID,
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: []
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(false);
    });

    it('should validate date-time format', () => {
      const validDateTime = new Date().toISOString();
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'in_progress'
        },
        startedBy: {
          agentId: 'agent-1',
          agentType: 'executor',
          agentName: 'Test Agent'
        },
        startedAt: validDateTime
      };

      const result = validator.validateEvent('task.started', payload);
      expect(result.valid).toBe(true);
    });
  });

  describe('String Constraints', () => {
    it('should enforce minLength', () => {
      const payload = {
        planId: 'plan-001',
        plan: {
          title: '', // Too short (minLength: 1)
          phases: []
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'minLength')).toBe(true);
    });

    it('should enforce maxLength', () => {
      const longTitle = 'a'.repeat(201); // maxLength is 200
      const payload = {
        planId: 'plan-001',
        plan: {
          title: longTitle,
          phases: []
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'maxLength')).toBe(true);
    });

    it('should enforce pattern', () => {
      const payload = {
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: []
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        },
        version: 'not-a-version' // Should match \d+\.\d+\.\d+
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'pattern')).toBe(true);
    });
  });

  describe('Number Constraints', () => {
    it('should enforce minimum', () => {
      const payload = {
        queuePosition: 0, // minimum is 1
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      };

      const result = validator.validateEvent('task.queued', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'minimum')).toBe(true);
    });

    it('should enforce maximum', () => {
      const payload = {
        cycleNumber: 0, // minimum is 1
        autoloopId: 'auto-1'
      };

      const result = validator.validateEvent('autoloop.cycle.complete', payload);
      expect(result.valid).toBe(false);
    });
  });

  describe('Array Constraints', () => {
    it('should enforce minItems', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: [] // minItems is 1
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.keyword === 'minItems')).toBe(true);
    });

    it('should validate array items', () => {
      const payload = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        planId: 'plan-001',
        plan: {
          title: 'Test',
          phases: [
            { phaseId: 'p1', name: 'Phase 1' } // Missing required 'tasks'
          ]
        },
        createdBy: {
          agentId: 'agent-1',
          agentType: 'planner',
          agentName: 'Test Agent'
        }
      };

      const result = validator.validateEvent('plan.created', payload);
      expect(result.valid).toBe(true); // In lenient mode
    });
  });

  describe('Custom Schema Registration', () => {
    it('should allow registering custom schemas', () => {
      const customSchema = {
        type: 'object' as const,
        properties: {
          foo: { type: 'string' as const },
          bar: { type: 'number' as const }
        },
        required: ['foo', 'bar']
      };

      validator.registerSchema('custom.event', customSchema);

      const result = validator.validateEvent('custom.event', {
        foo: 'test',
        bar: 42
      });

      expect(result.valid).toBe(true);
    });

    it('should reject custom event that does not match schema', () => {
      const customSchema = {
        type: 'object' as const,
        properties: {
          foo: { type: 'string' as const }
        },
        required: ['foo']
      };

      validator.registerSchema('custom.event2', customSchema);

      const result = validator.validateEvent('custom.event2', {
        bar: 42 // Missing 'foo'
      });

      expect(result.valid).toBe(false);
    });

    it('should overwrite schemas when overwrite option is true', () => {
      const schema1 = {
        type: 'object' as const,
        properties: {
          field: { type: 'string' as const }
        },
        required: ['field']
      };

      const schema2 = {
        type: 'object' as const,
        properties: {
          field: { type: 'number' as const }
        },
        required: ['field']
      };

      validator.registerSchema('overwrite.test', schema1);
      validator.registerSchema('overwrite.test', schema2, { overwrite: true });

      const result1 = validator.validateEvent('overwrite.test', { field: 'string' });
      const result2 = validator.validateEvent('overwrite.test', { field: 42 });

      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(true);
    });

    it('should not overwrite schemas by default', () => {
      const schema1 = {
        type: 'object' as const,
        properties: {
          field: { type: 'string' as const }
        },
        required: ['field']
      };

      const schema2 = {
        type: 'object' as const,
        properties: {
          field: { type: 'number' as const }
        },
        required: ['field']
      };

      validator.registerSchema('no-overwrite.test', schema1);

      // This should throw because we're trying to overwrite without overwrite: true
      expect(() => {
        validator.registerSchema('no-overwrite.test', schema2);
      }).toThrow();
    });

    it('should unregister custom schemas', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          field: { type: 'string' as const }
        }
      };

      validator.registerSchema('temp.event', schema);
      expect(validator.hasSchema('temp.event')).toBe(true);

      validator.unregisterSchema('temp.event');
      expect(validator.hasSchema('temp.event')).toBe(false);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple events in batch', () => {
      const events = [
        {
          eventType: 'task.queued',
          payload: {
            queuePosition: 1,
            priority: 'normal',
            task: {
              taskId: 'task-1',
              taskType: 'feature',
              title: 'Test 1',
              status: 'pending'
            }
          }
        },
        {
          eventType: 'task.started',
          payload: {
            eventId: '123e4567-e89b-12d3-a456-426614174000',
            task: {
              taskId: 'task-1',
              taskType: 'feature',
              title: 'Test 1',
              status: 'in_progress'
            },
            startedBy: {
              agentId: 'agent-1',
              agentType: 'executor',
              agentName: 'Test Agent'
            },
            startedAt: new Date().toISOString()
          }
        }
      ];

      const results = validator.validateBatch(events);

      expect(results).toHaveLength(2);
      expect(results[0].result.valid).toBe(true);
      expect(results[1].result.valid).toBe(true);
    });

    it('should return mixed results for partially valid batch', () => {
      const events = [
        {
          eventType: 'task.queued',
          payload: {
            queuePosition: 1,
            priority: 'normal',
            task: {
              taskId: 'task-1',
              taskType: 'feature',
              title: 'Test 1',
              status: 'pending'
            }
          }
        },
        {
          eventType: 'task.started',
          payload: {
            // Invalid: missing required fields
          }
        }
      ];

      const results = validator.validateBatch(events);

      expect(results).toHaveLength(2);
      expect(results[0].result.valid).toBe(true);
      expect(results[1].result.valid).toBe(false);
    });
  });

  describe('Error Formatting', () => {
    it('should format validation errors correctly', () => {
      const payload = {
        taskId: 'task-1'
        // Missing required fields
      };

      const result = validator.validateEvent('task.started', payload);
      const formatted = validator.formatErrors(result);

      expect(formatted).toContain('Validation errors');
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should return success message for valid events', () => {
      const payload = {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      };

      const result = validator.validateEvent('task.queued', payload);
      const formatted = validator.formatErrors(result);

      expect(formatted).toBe('Validation passed');
    });
  });

  describe('Cache Management', () => {
    it('should track cache statistics', () => {
      const stats = validator.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(Array.isArray(stats.entries)).toBe(true);
    });

    it('should clear cache when requested', () => {
      validator.clearCache();
      const stats = validator.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should allow disabling cache', () => {
      validator.setCacheEnabled(false);
      expect(validator.getCacheStats().size).toBe(0);

      validator.setCacheEnabled(true);
    });
  });
});

describe('ValidationMiddleware', () => {
  let middleware: ValidationMiddleware;

  beforeEach(() => {
    middleware = new ValidationMiddleware();
  });

  afterEach(() => {
    middleware.clearRecentErrors();
  });

  describe('Basic Validation', () => {
    it('should validate events by default', () => {
      const payload = {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      };

      const result = middleware.validate('task.queued', payload);

      expect(result.valid).toBe(true);
    });

    it('should return invalid result for bad events', () => {
      const payload = {
        // Missing required fields
      };

      const result = middleware.validate('task.started', payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should allow disabling validation', () => {
      middleware.setEnabled(false);

      const payload = { invalid: 'data' };
      const result = middleware.validate('unknown.event', payload);

      expect(result.valid).toBe(true);
    });
  });

  describe('Channel-Specific Modes', () => {
    it('should use lenient mode by default', () => {
      const mode = middleware.getValidationMode();
      expect(mode).toBe('lenient');
    });

    it('should allow setting strict mode for channels', () => {
      middleware.setChannelMode('critical', 'strict');
      expect(middleware.getValidationMode('critical')).toBe('strict');
    });

    it('should use default mode for unknown channels', () => {
      middleware.setChannelMode('channel1', 'strict');
      expect(middleware.getValidationMode('unknown')).toBe('lenient');
    });
  });

  describe('Blocking Behavior', () => {
    it('should not block by default', () => {
      const payload = {
        // Invalid payload
      };

      expect(() => {
        middleware.validate('task.started', payload);
      }).not.toThrow();
    });

    it('should throw when blockOnInvalid is true', () => {
      middleware.setBlockOnInvalid(true);

      const payload = {
        // Invalid payload
      };

      expect(() => {
        middleware.validate('task.started', payload);
      }).toThrow(ValidationErrorException);
    });

    it('should not throw for valid events when blocking is enabled', () => {
      middleware.setBlockOnInvalid(true);

      const payload = {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      };

      expect(() => {
        middleware.validate('task.queued', payload);
      }).not.toThrow();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics by default', () => {
      middleware.validate('task.queued', {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      });

      const metrics = middleware.getMetrics();
      expect(metrics.totalValidated).toBeGreaterThan(0);
    });

    it('should track passed validations', () => {
      middleware.validate('task.queued', {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      });

      const metrics = middleware.getMetrics();
      expect(metrics.totalPassed).toBeGreaterThan(0);
    });

    it('should track failed validations', () => {
      middleware.validate('task.started', {});

      const metrics = middleware.getMetrics();
      expect(metrics.totalFailed).toBeGreaterThan(0);
    });

    it('should track failures by event type', () => {
      middleware.validate('task.started', {});
      middleware.validate('task.started', {});

      const metrics = middleware.getMetrics();
      expect(metrics.failuresByEventType['task.started']).toBeGreaterThan(0);
    });

    it('should allow resetting metrics', () => {
      middleware.validate('task.queued', {
        queuePosition: 1,
        priority: 'normal',
        task: {
          taskId: 'task-1',
          taskType: 'feature',
          title: 'Test',
          status: 'pending'
        }
      });

      middleware.resetMetrics();

      const metrics = middleware.getMetrics();
      expect(metrics.totalValidated).toBe(0);
    });
  });

  describe('Error Tracking', () => {
    it('should track recent errors', () => {
      middleware.validate('task.started', {});

      const errors = middleware.getRecentErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should limit recent errors', () => {
      for (let i = 0; i < 150; i++) {
        middleware.validate('task.started', {});
      }

      const errors = middleware.getRecentErrors(200);
      expect(errors.length).toBeLessThanOrEqual(100);
    });

    it('should allow clearing recent errors', () => {
      middleware.validate('task.started', {});
      middleware.clearRecentErrors();

      const errors = middleware.getRecentErrors();
      expect(errors.length).toBe(0);
    });

    it('should include error context', () => {
      middleware.validate('task.started', {}, {
        channel: 'test-channel',
        agentId: 'test-agent'
      });

      const errors = middleware.getRecentErrors();
      expect(errors[0].channelId).toBe('test-channel');
      expect(errors[0].agentId).toBe('test-agent');
    });
  });

  describe('Error Listeners', () => {
    it('should notify error listeners', () => {
      let called = false;
      const listener = () => {
        called = true;
      };

      middleware.onError(listener);
      middleware.validate('task.started', {});

      expect(called).toBe(true);
    });

    it('should allow removing error listeners', () => {
      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      middleware.onError(listener);
      middleware.validate('task.started', {});
      middleware.offError(listener);
      middleware.validate('task.started', {});

      expect(callCount).toBe(1);
    });

    it('should handle errors in error listeners gracefully', () => {
      const badListener = () => {
        throw new Error('Listener error');
      };

      middleware.onError(badListener);

      expect(() => {
        middleware.validate('task.started', {});
      }).not.toThrow();
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple events', () => {
      const events = [
        {
          eventType: 'task.queued',
          payload: {
            queuePosition: 1,
            priority: 'normal',
            task: {
              taskId: 'task-1',
              taskType: 'feature',
              title: 'Test',
              status: 'pending'
            }
          }
        },
        {
          eventType: 'task.started',
          payload: {
            eventId: '123e4567-e89b-12d3-a456-426614174000',
            task: {
              taskId: 'task-1',
              taskType: 'feature',
              title: 'Test',
              status: 'in_progress'
            },
            startedBy: {
              agentId: 'agent-1',
              agentType: 'executor',
              agentName: 'Test Agent'
            },
            startedAt: new Date().toISOString()
          }
        }
      ];

      const results = middleware.validateBatch(events);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });
  });

  describe('Schema Management', () => {
    it('should get schemas for event types', () => {
      const schema = middleware.getSchema('task.started');
      expect(schema).toBeDefined();
    });

    it('should check if schemas exist', () => {
      expect(middleware.hasSchema('task.started')).toBe(true);
      expect(middleware.hasSchema('unknown.event')).toBe(false);
    });

    it('should list all registered event types', () => {
      const types = middleware.getRegisteredEventTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types).toContain('task.started');
    });

    it('should register custom schemas', () => {
      const customSchema = {
        type: 'object' as const,
        properties: {
          foo: { type: 'string' as const }
        }
      };

      middleware.registerSchema('custom.event', customSchema);
      expect(middleware.hasSchema('custom.event')).toBe(true);
    });

    it('should unregister custom schemas', () => {
      const customSchema = {
        type: 'object' as const,
        properties: {
          foo: { type: 'string' as const }
        }
      };

      middleware.registerSchema('temp.event', customSchema);
      middleware.unregisterSchema('temp.event');

      expect(middleware.hasSchema('temp.event')).toBe(false);
    });
  });
});
