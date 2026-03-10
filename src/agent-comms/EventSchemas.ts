/**
 * Event Schemas Registry
 *
 * JSON Schema definitions for all AgentMessageBus event types.
 * Provides versioned schema support with comprehensive validation rules.
 */

/**
 * JSON Schema interface (subset for our use)
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  enum?: any[];
  const?: any;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  definitions?: Record<string, JSONSchema>;
  $defs?: Record<string, JSONSchema>;
}

/**
 * Schema version metadata
 */
export interface SchemaVersion {
  version: string;
  createdAt: Date;
  deprecatedAt?: Date;
  deprecatedBy?: string;
  migrationPath?: string;
}

/**
 * Versioned schema wrapper
 */
export interface VersionedSchema {
  schema: JSONSchema;
  metadata: SchemaVersion;
}

/**
 * Base event metadata schema (common to all events)
 */
const baseEventMetadata: JSONSchema = {
  type: 'object',
  properties: {
    eventId: {
      type: 'string',
      format: 'uuid',
      description: 'Unique event identifier'
    },
    causationId: {
      type: 'string',
      description: 'ID of the command that caused this event'
    },
    correlationId: {
      type: 'string',
      description: 'Correlation ID for tracing'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp'
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Event schema version'
    }
  }
};

/**
 * Agent reference schema
 */
const agentRefSchema: JSONSchema = {
  type: 'object',
  properties: {
    agentId: {
      type: 'string',
      minLength: 1,
      description: 'Unique agent identifier'
    },
    agentType: {
      type: 'string',
      enum: ['orchestrator', 'executor', 'planner', 'analyst', 'critic', 'verifier', 'debugger', 'reviewer', 'specialist'],
      description: 'Agent type/category'
    },
    agentName: {
      type: 'string',
      description: 'Human-readable agent name'
    }
  },
  required: ['agentId', 'agentType']
};

/**
 * Task reference schema
 */
const taskRefSchema: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      minLength: 1,
      description: 'Unique task identifier'
    },
    taskType: {
      type: 'string',
      enum: ['feature', 'bugfix', 'refactor', 'test', 'docs', 'review', 'analysis'],
      description: 'Task type'
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Task title'
    },
    status: {
      type: 'string',
      enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
      description: 'Task status'
    }
  },
  required: ['taskId', 'taskType', 'title', 'status']
};

/**
 * ====================================================================
 * PLAN EVENTS
 * ====================================================================
 */

/**
 * plan.created event schema
 * Emitted when a new implementation plan is created
 */
export const PLAN_CREATED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/plan.created.json',
  title: 'Plan Created Event',
  description: 'Emitted when a new implementation plan is created by the planner agent',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    planId: {
      type: 'string',
      minLength: 1,
      description: 'Unique plan identifier'
    },
    plan: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          maxLength: 200
        },
        description: {
          type: 'string',
          maxLength: 5000
        },
        phases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              phaseId: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              tasks: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['phaseId', 'name']
          },
          minItems: 1
        },
        estimatedDuration: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: {
              type: 'string',
              enum: ['minutes', 'hours', 'days']
            }
          }
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' }
            }
          }
        }
      },
      required: ['title', 'phases']
    },
    createdBy: agentRefSchema,
    domainId: {
      type: 'string',
      description: 'Domain context identifier'
    }
  },
  required: ['planId', 'plan', 'createdBy']
};

/**
 * plan.updated event schema
 * Emitted when an existing plan is modified
 */
export const PLAN_UPDATED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/plan.updated.json',
  title: 'Plan Updated Event',
  description: 'Emitted when an implementation plan is updated',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    planId: {
      type: 'string',
      minLength: 1
    },
    changes: {
      type: 'object',
      properties: {
        addedPhases: {
          type: 'array',
          items: taskRefSchema
        },
        removedPhases: {
          type: 'array',
          items: { type: 'string' }
        },
        modifiedPhases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              phaseId: { type: 'string' },
              changes: { type: 'object' }
            }
          }
        }
      }
    },
    updatedBy: agentRefSchema,
    reason: {
      type: 'string',
      maxLength: 1000
    }
  },
  required: ['planId', 'changes', 'updatedBy']
};

/**
 * plan.completed event schema
 * Emitted when all phases in a plan are completed
 */
export const PLAN_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/plan.completed.json',
  title: 'Plan Completed Event',
  description: 'Emitted when a plan execution is completed',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    planId: {
      type: 'string',
      minLength: 1
    },
    completionStatus: {
      type: 'string',
      enum: ['success', 'partial', 'failed']
    },
    summary: {
      type: 'object',
      properties: {
        totalPhases: { type: 'number' },
        completedPhases: { type: 'number' },
        totalTasks: { type: 'number' },
        completedTasks: { type: 'number' },
        failedTasks: { type: 'number' },
        duration: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['milliseconds', 'seconds', 'minutes'] }
          }
        }
      }
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['code', 'docs', 'test', 'config'] },
          path: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }
  },
  required: ['planId', 'completionStatus', 'summary']
};

/**
 * ====================================================================
 * TASK EVENTS
 * ====================================================================
 */

/**
 * task.queued event schema
 * Emitted when a task is added to the execution queue
 */
export const TASK_QUEUED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/task.queued.json',
  title: 'Task Queued Event',
  description: 'Emitted when a task is queued for execution',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    task: taskRefSchema,
    queuePosition: {
      type: 'number',
      minimum: 1
    },
    priority: {
      type: 'string',
      enum: ['critical', 'high', 'normal', 'low']
    },
    assignedTo: agentRefSchema,
    dependencies: {
      type: 'array',
      items: { type: 'string' }
    },
    estimatedDuration: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: { type: 'string', enum: ['minutes', 'hours'] }
      }
    }
  },
  required: ['task', 'queuePosition', 'priority']
};

/**
 * task.started event schema
 * Emitted when an agent begins executing a task
 */
export const TASK_STARTED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/task.started.json',
  title: 'Task Started Event',
  description: 'Emitted when task execution begins',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    task: taskRefSchema,
    startedBy: agentRefSchema,
    startedAt: {
      type: 'string',
      format: 'date-time'
    },
    executionContext: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['autonomous', 'supervised', 'interactive']
        },
        workspace: {
          type: 'string',
          description: 'Workspace path'
        },
        capabilities: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['file-write', 'file-read', 'shell', 'search', 'browser']
          }
        }
      }
    }
  },
  required: ['task', 'startedBy', 'startedAt']
};

/**
 * task.completed event schema
 * Emitted when a task finishes successfully
 */
export const TASK_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/task.completed.json',
  title: 'Task Completed Event',
  description: 'Emitted when a task completes successfully',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    task: taskRefSchema,
    completedBy: agentRefSchema,
    completedAt: {
      type: 'string',
      format: 'date-time'
    },
    duration: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: {
          type: 'string',
          enum: ['milliseconds', 'seconds', 'minutes']
        }
      }
    },
    result: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['success', 'partial']
        },
        outputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['file', 'message', 'artifact', 'commit']
              },
              location: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        metrics: {
          type: 'object',
          properties: {
            filesCreated: { type: 'number' },
            filesModified: { type: 'number' },
            testsRun: { type: 'number' },
            testsPassed: { type: 'number' }
          }
        }
      }
    }
  },
  required: ['task', 'completedBy', 'completedAt', 'result']
};

/**
 * task.failed event schema
 * Emitted when a task execution fails
 */
export const TASK_FAILED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/task.failed.json',
  title: 'Task Failed Event',
  description: 'Emitted when a task execution fails',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    task: taskRefSchema,
    failedBy: agentRefSchema,
    failedAt: {
      type: 'string',
      format: 'date-time'
    },
    error: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          enum: ['validation', 'execution', 'timeout', 'permission', 'resource', 'unknown']
        },
        message: {
          type: 'string',
          minLength: 1,
          maxLength: 1000
        },
        stack: {
          type: 'string',
          description: 'Error stack trace'
        },
        details: {
          type: 'object',
          description: 'Additional error context'
        }
      },
      required: ['code', 'message']
    },
    retryable: {
      type: 'boolean',
      description: 'Whether the task can be retried'
    },
    retryAttempt: {
      type: 'number',
      minimum: 0,
      description: 'Current retry attempt number'
    }
  },
  required: ['task', 'failedBy', 'failedAt', 'error']
};

/**
 * ====================================================================
 * AGENT EVENTS
 * ====================================================================
 */

/**
 * agent.spawned event schema
 * Emitted when a new agent instance is created
 */
export const AGENT_SPAWNED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/agent.spawned.json',
  title: 'Agent Spawned Event',
  description: 'Emitted when a new agent instance is spawned',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    agent: agentRefSchema,
    spawnedBy: {
      type: 'string',
      description: 'Process or agent that spawned this agent'
    },
    instanceId: {
      type: 'string',
      description: 'Unique instance identifier'
    },
    capabilities: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['code', 'analysis', 'planning', 'review', 'debug', 'test', 'docs', 'coordination']
      }
    },
    config: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus']
        },
        timeout: {
          type: 'number',
          minimum: 0
        },
        maxRetries: {
          type: 'number',
          minimum: 0
        }
      }
    }
  },
  required: ['agent', 'spawnedBy', 'instanceId']
};

/**
 * agent.completed event schema
 * Emitted when an agent finishes its work
 */
export const AGENT_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/agent.completed.json',
  title: 'Agent Completed Event',
  description: 'Emitted when an agent completes its lifecycle',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    agent: agentRefSchema,
    instanceId: {
      type: 'string'
    },
    completionReason: {
      type: 'string',
      enum: ['success', 'cancelled', 'timeout', 'error']
    },
    summary: {
      type: 'object',
      properties: {
        tasksCompleted: { type: 'number' },
        messagesProcessed: { type: 'number' },
        duration: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['seconds', 'minutes'] }
          }
        }
      }
    }
  },
  required: ['agent', 'instanceId', 'completionReason']
};

/**
 * ====================================================================
 * PHASE & WORKFLOW EVENTS
 * ====================================================================
 */

/**
 * phase.completed event schema
 * Emitted when a workflow phase is completed
 */
export const PHASE_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/phase.completed.json',
  title: 'Phase Completed Event',
  description: 'Emitted when a workflow phase is completed',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    phaseId: {
      type: 'string',
      minLength: 1
    },
    phaseName: {
      type: 'string',
      minLength: 1
    },
    workflowId: {
      type: 'string',
      description: 'Parent workflow identifier'
    },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'skipped']
    },
    tasksCompleted: {
      type: 'number',
      minimum: 0
    },
    tasksTotal: {
      type: 'number',
      minimum: 0
    },
    duration: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: { type: 'string', enum: ['seconds', 'minutes', 'hours'] }
      }
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          location: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }
  },
  required: ['phaseId', 'phaseName', 'status']
};

/**
 * workflow.completed event schema
 * Emitted when an entire workflow is completed
 */
export const WORKFLOW_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/workflow.completed.json',
  title: 'Workflow Completed Event',
  description: 'Emitted when a workflow execution is completed',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    workflowId: {
      type: 'string',
      minLength: 1
    },
    workflowType: {
      type: 'string',
      enum: ['ultrapilot', 'ultra-ralph', 'ultra-team', 'ultra-review', 'custom']
    },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'failed', 'cancelled']
    },
    summary: {
      type: 'object',
      properties: {
        totalPhases: { type: 'number' },
        completedPhases: { type: 'number' },
        totalTasks: { type: 'number' },
        completedTasks: { type: 'number' },
        failedTasks: { type: 'number' },
        duration: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['minutes', 'hours'] }
          }
        },
        agentsUsed: {
          type: 'number',
          minimum: 0
        }
      }
    },
    result: {
      type: 'object',
      properties: {
        outputs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              location: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        metrics: {
          type: 'object',
          properties: {
            totalFiles: { type: 'number' },
            testsPassed: { type: 'number' },
            coverage: { type: 'number' }
          }
        }
      }
    }
  },
  required: ['workflowId', 'workflowType', 'status', 'summary']
};

/**
 * ====================================================================
 * AUTOLOOP EVENTS
 * ====================================================================
 */

/**
 * autoloop.heartbeat event schema
 * Emitted periodically by the autoloop to indicate health
 */
export const AUTOLOOP_HEARTBEAT_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/autoloop.heartbeat.json',
  title: 'Autoloop Heartbeat Event',
  description: 'Periodic heartbeat from the autoloop system',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    autoloopId: {
      type: 'string',
      minLength: 1
    },
    status: {
      type: 'string',
      enum: ['running', 'paused', 'stopping', 'error']
    },
    uptime: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: {
          type: 'string',
          enum: ['seconds', 'minutes', 'hours']
        }
      }
    },
    queueStats: {
      type: 'object',
      properties: {
        pendingTasks: { type: 'number', minimum: 0 },
        inProgressTasks: { type: 'number', minimum: 0 },
        completedTasks: { type: 'number', minimum: 0 },
        failedTasks: { type: 'number', minimum: 0 }
      }
    },
    cycleCount: {
      type: 'number',
      minimum: 0
    }
  },
  required: ['autoloopId', 'status']
};

/**
 * autoloop.cycle.complete event schema
 * Emitted when an autoloop cycle completes
 */
export const AUTOLOOP_CYCLE_COMPLETE_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/autoloop.cycle.complete.json',
  title: 'Autoloop Cycle Complete Event',
  description: 'Emitted when an autoloop processing cycle completes',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    autoloopId: {
      type: 'string',
      minLength: 1
    },
    cycleNumber: {
      type: 'number',
      minimum: 1
    },
    startedAt: {
      type: 'string',
      format: 'date-time'
    },
    completedAt: {
      type: 'string',
      format: 'date-time'
    },
    duration: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: {
          type: 'string',
          enum: ['milliseconds', 'seconds']
        }
      }
    },
    tasksProcessed: {
      type: 'object',
      properties: {
        dispatched: { type: 'number', minimum: 0 },
        completed: { type: 'number', minimum: 0 },
        failed: { type: 'number', minimum: 0 },
        retried: { type: 'number', minimum: 0 }
      }
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          taskId: { type: 'string' }
        }
      }
    }
  },
  required: ['autoloopId', 'cycleNumber']
};

/**
 * ====================================================================
 * DOMAIN EVENTS
 * ====================================================================
 */

/**
 * domain.initialized event schema
 * Emitted when a new domain is initialized
 */
export const DOMAIN_INITIALIZED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/domain.initialized.json',
  title: 'Domain Initialized Event',
  description: 'Emitted when a new domain is initialized',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    domainId: {
      type: 'string',
      minLength: 1
    },
    name: {
      type: 'string',
      minLength: 1
    },
    type: {
      type: 'string',
      enum: ['library', 'application', 'service', 'plugin']
    },
    stack: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        framework: { type: 'string' },
        testing: { type: 'string' },
        packageManager: { type: 'string' }
      }
    },
    initializedBy: {
      type: 'string'
    }
  },
  required: ['domainId', 'name', 'type']
};

/**
 * domain.agent.assigned event schema
 * Emitted when an agent is assigned to a domain
 */
export const DOMAIN_AGENT_ASSIGNED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/domain.agent.assigned.json',
  title: 'Domain Agent Assigned Event',
  description: 'Emitted when an agent is assigned to a domain',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    domainId: {
      type: 'string',
      minLength: 1
    },
    agent: agentRefSchema,
    role: {
      type: 'string',
      enum: ['primary', 'secondary', 'specialist', 'reviewer']
    },
    capabilities: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  required: ['domainId', 'agent', 'role']
};

/**
 * ====================================================================
 * REVIEW EVENTS
 * ====================================================================
 */

/**
 * review.started event schema
 * Emitted when a code review starts
 */
export const REVIEW_STARTED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/review.started.json',
  title: 'Review Started Event',
  description: 'Emitted when a code review begins',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    reviewId: {
      type: 'string',
      minLength: 1
    },
    reviewType: {
      type: 'string',
      enum: ['security', 'quality', 'code', 'performance']
    },
    target: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['commit', 'pull-request', 'files', 'task']
        },
        identifier: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    reviewer: agentRefSchema,
    criteria: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  required: ['reviewId', 'reviewType', 'target', 'reviewer']
};

/**
 * review.completed event schema
 * Emitted when a code review completes
 */
export const REVIEW_COMPLETED_SCHEMA: JSONSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ultrapilot.dev/schemas/review.completed.json',
  title: 'Review Completed Event',
  description: 'Emitted when a code review completes',
  type: 'object',
  properties: {
    ...baseEventMetadata.properties,
    reviewId: {
      type: 'string',
      minLength: 1
    },
    reviewType: {
      type: 'string',
      enum: ['security', 'quality', 'code', 'performance']
    },
    reviewer: agentRefSchema,
    result: {
      type: 'string',
      enum: ['approved', 'approved-with-changes', 'changes-requested', 'rejected']
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'info']
          },
          category: { type: 'string' },
          message: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              column: { type: 'number' }
            }
          },
          suggestion: { type: 'string' }
        }
      }
    },
    metrics: {
      type: 'object',
      properties: {
        filesReviewed: { type: 'number' },
        linesOfCode: { type: 'number' },
        issuesFound: { type: 'number' },
        duration: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['seconds', 'minutes'] }
          }
        }
      }
    }
  },
  required: ['reviewId', 'reviewType', 'reviewer', 'result']
};

/**
 * ====================================================================
 * SCHEMA REGISTRY
 * ====================================================================
 */

/**
 * Complete schema registry
 * Maps event types to their JSON schemas
 */
export const EVENT_SCHEMAS: Record<string, JSONSchema> = {
  // Plan events
  'plan.created': PLAN_CREATED_SCHEMA,
  'plan.updated': PLAN_UPDATED_SCHEMA,
  'plan.completed': PLAN_COMPLETED_SCHEMA,

  // Task events
  'task.queued': TASK_QUEUED_SCHEMA,
  'task.started': TASK_STARTED_SCHEMA,
  'task.completed': TASK_COMPLETED_SCHEMA,
  'task.failed': TASK_FAILED_SCHEMA,

  // Agent events
  'agent.spawned': AGENT_SPAWNED_SCHEMA,
  'agent.completed': AGENT_COMPLETED_SCHEMA,

  // Phase & workflow events
  'phase.completed': PHASE_COMPLETED_SCHEMA,
  'workflow.completed': WORKFLOW_COMPLETED_SCHEMA,

  // Autoloop events
  'autoloop.heartbeat': AUTOLOOP_HEARTBEAT_SCHEMA,
  'autoloop.cycle.complete': AUTOLOOP_CYCLE_COMPLETE_SCHEMA,

  // Domain events
  'domain.initialized': DOMAIN_INITIALIZED_SCHEMA,
  'domain.agent.assigned': DOMAIN_AGENT_ASSIGNED_SCHEMA,

  // Review events
  'review.started': REVIEW_STARTED_SCHEMA,
  'review.completed': REVIEW_COMPLETED_SCHEMA
};

/**
 * Get all registered event types
 */
export function getRegisteredEventTypes(): string[] {
  return Object.keys(EVENT_SCHEMAS);
}

/**
 * Get schema for an event type
 */
export function getSchema(eventType: string): JSONSchema | null {
  return EVENT_SCHEMAS[eventType] || null;
}

/**
 * Check if an event type has a registered schema
 */
export function hasSchema(eventType: string): boolean {
  return eventType in EVENT_SCHEMAS;
}

/**
 * Get schema metadata
 */
export function getSchemaMetadata(eventType: string): {
  title?: string;
  description?: string;
  $id?: string;
} | null {
  const schema = EVENT_SCHEMAS[eventType];
  if (!schema) return null;

  return {
    title: schema.title,
    description: schema.description,
    $id: schema.$id
  };
}
