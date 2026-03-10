/**
 * wshobson Agent Integration - Task Decomposition
 *
 * Analyzes complex tasks and decomposes them into subtasks that can be
 * delegated to appropriate specialist agents.
 * Part of Phase 4: Smart Selection & Backend Decision
 */

import type { Agent } from './types.js';
import { AgentSelector } from './selector.js';

/**
 * Subtask with assigned agent
 */
export interface Subtask {
  description: string;
  requiredCapabilities: string[];
  dependencies: string[]; // Subtask IDs this depends on
  estimatedDuration: number; // minutes
  priority: 'high' | 'medium' | 'low';
}

/**
 * Decomposed task with subtasks
 */
export interface DecomposedTask {
  originalTask: string;
  subtasks: Map<string, Subtask>;
  executionOrder: string[]; // Subtask IDs in execution order
  estimatedTotalDuration: number; // minutes
  parallelizable: boolean; // Can subtasks run in parallel
}

/**
 * Task decomposer for breaking down complex tasks
 */
export class TaskDecomposer {
  constructor(private selector: AgentSelector) {}

  /**
   * Decompose a complex task into subtasks
   */
  async decompose(task: string): Promise<DecomposedTask> {
    const capabilities = this.selector.parseTaskCapabilities(task);
    const subtasks = new Map<string, Subtask>();

    // Detect task type and apply decomposition pattern
    const pattern = this.detectTaskPattern(task);

    switch (pattern.type) {
      case 'api-development':
        this.decomposeAPIDevelopment(task, subtasks);
        break;
      case 'frontend-development':
        this.decomposeFrontendDevelopment(task, subtasks);
        break;
      case 'testing':
        this.decomposeTesting(task, subtasks);
        break;
      case 'security-review':
        this.decomposeSecurityReview(task, subtasks);
        break;
      case 'documentation':
        this.decomposeDocumentation(task, subtasks);
        break;
      case 'bug-fix':
        this.decomposeBugFix(task, subtasks);
        break;
      default:
        this.decomposeGeneric(task, capabilities, subtasks);
    }

    // Calculate execution order
    const executionOrder = this.calculateExecutionOrder(subtasks);

    // Calculate total duration
    const totalDuration = Array.from(subtasks.values())
      .reduce((sum, task) => sum + task.estimatedDuration, 0);

    // Check if parallelizable
    const parallelizable = this.checkParallelizable(subtasks);

    return {
      originalTask: task,
      subtasks,
      executionOrder,
      estimatedTotalDuration: totalDuration,
      parallelizable,
    };
  }

  /**
   * Detect task pattern from description
   */
  private detectTaskPattern(task: string): { type: string; confidence: number } {
    const lowerTask = task.toLowerCase();

    // API development patterns
    if (lowerTask.includes('api') || lowerTask.includes('rest') || lowerTask.includes('graphql')) {
      if (lowerTask.includes('build') || lowerTask.includes('create') || lowerTask.includes('implement')) {
        return { type: 'api-development', confidence: 0.9 };
      }
    }

    // Frontend development patterns
    if (lowerTask.includes('ui') || lowerTask.includes('frontend') || lowerTask.includes('component')) {
      if (lowerTask.includes('build') || lowerTask.includes('create')) {
        return { type: 'frontend-development', confidence: 0.9 };
      }
    }

    // Testing patterns
    if (lowerTask.includes('test') || lowerTask.includes('testing') || lowerTask.includes('coverage')) {
      return { type: 'testing', confidence: 0.9 };
    }

    // Security review patterns
    if (lowerTask.includes('security') || lowerTask.includes('audit') || lowerTask.includes('vulnerability')) {
      return { type: 'security-review', confidence: 0.9 };
    }

    // Documentation patterns
    if (lowerTask.includes('documentation') || lowerTask.includes('docs') || lowerTask.includes('readme')) {
      return { type: 'documentation', confidence: 0.9 };
    }

    // Bug fix patterns
    if (lowerTask.includes('fix') || lowerTask.includes('debug') || lowerTask.includes('resolve')) {
      return { type: 'bug-fix', confidence: 0.8 };
    }

    return { type: 'generic', confidence: 0.5 };
  }

  /**
   * Decompose API development task
   */
  private decomposeAPIDevelopment(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: API design
    subtasks.set('design-api', {
      description: 'Design API architecture and endpoints',
      requiredCapabilities: ['api-design', 'architecture'],
      dependencies: [],
      estimatedDuration: 30,
      priority: 'high',
    });

    // Subtask 2: Database schema
    subtasks.set('design-schema', {
      description: 'Design database schema and relationships',
      requiredCapabilities: ['database-design', 'sql'],
      dependencies: [],
      estimatedDuration: 20,
      priority: 'high',
    });

    // Subtask 3: Implementation
    subtasks.set('implement-api', {
      description: 'Implement API endpoints and business logic',
      requiredCapabilities: ['implementation', 'backend'],
      dependencies: ['design-api', 'design-schema'],
      estimatedDuration: 60,
      priority: 'high',
    });

    // Subtask 4: Testing
    subtasks.set('test-api', {
      description: 'Write unit and integration tests for API',
      requiredCapabilities: ['testing', 'api-testing'],
      dependencies: ['implement-api'],
      estimatedDuration: 40,
      priority: 'medium',
    });

    // Subtask 5: Security review
    subtasks.set('security-review', {
      description: 'Review API for security vulnerabilities',
      requiredCapabilities: ['security', 'api-security'],
      dependencies: ['implement-api'],
      estimatedDuration: 30,
      priority: 'high',
    });

    // Subtask 6: Documentation
    subtasks.set('document-api', {
      description: 'Write API documentation (OpenAPI/Swagger)',
      requiredCapabilities: ['documentation', 'api-docs'],
      dependencies: ['implement-api'],
      estimatedDuration: 20,
      priority: 'low',
    });
  }

  /**
   * Decompose frontend development task
   */
  private decomposeFrontendDevelopment(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: UI/UX design
    subtasks.set('design-ui', {
      description: 'Design user interface and user experience',
      requiredCapabilities: ['ui-design', 'ux-design'],
      dependencies: [],
      estimatedDuration: 30,
      priority: 'high',
    });

    // Subtask 2: Component architecture
    subtasks.set('architecture-components', {
      description: 'Design component architecture and state management',
      requiredCapabilities: ['architecture', 'frontend'],
      dependencies: ['design-ui'],
      estimatedDuration: 20,
      priority: 'high',
    });

    // Subtask 3: Implementation
    subtasks.set('implement-ui', {
      description: 'Implement UI components and pages',
      requiredCapabilities: ['implementation', 'frontend'],
      dependencies: ['architecture-components'],
      estimatedDuration: 60,
      priority: 'high',
    });

    // Subtask 4: Testing
    subtasks.set('test-ui', {
      description: 'Write component and integration tests',
      requiredCapabilities: ['testing', 'frontend-testing'],
      dependencies: ['implement-ui'],
      estimatedDuration: 40,
      priority: 'medium',
    });

    // Subtask 5: Accessibility review
    subtasks.set('a11y-review', {
      description: 'Review for accessibility compliance (WCAG)',
      requiredCapabilities: ['accessibility', 'a11y'],
      dependencies: ['implement-ui'],
      estimatedDuration: 20,
      priority: 'medium',
    });
  }

  /**
   * Decompose testing task
   */
  private decomposeTesting(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: Test strategy
    subtasks.set('test-strategy', {
      description: 'Define test strategy and coverage goals',
      requiredCapabilities: ['testing', 'test-strategy'],
      dependencies: [],
      estimatedDuration: 15,
      priority: 'high',
    });

    // Subtask 2: Unit tests
    subtasks.set('unit-tests', {
      description: 'Write unit tests for critical paths',
      requiredCapabilities: ['testing', 'unit-testing'],
      dependencies: ['test-strategy'],
      estimatedDuration: 40,
      priority: 'high',
    });

    // Subtask 3: Integration tests
    subtasks.set('integration-tests', {
      description: 'Write integration tests for API flows',
      requiredCapabilities: ['testing', 'integration-testing'],
      dependencies: ['unit-tests'],
      estimatedDuration: 40,
      priority: 'medium',
    });

    // Subtask 4: E2E tests
    subtasks.set('e2e-tests', {
      description: 'Write end-to-end tests for user flows',
      requiredCapabilities: ['testing', 'e2e-testing'],
      dependencies: ['integration-tests'],
      estimatedDuration: 30,
      priority: 'low',
    });
  }

  /**
   * Decompose security review task
   */
  private decomposeSecurityReview(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: Static analysis
    subtasks.set('static-analysis', {
      description: 'Run static analysis and dependency vulnerability scan',
      requiredCapabilities: ['security', 'static-analysis'],
      dependencies: [],
      estimatedDuration: 20,
      priority: 'high',
    });

    // Subtask 2: Code review
    subtasks.set('code-review', {
      description: 'Review code for security vulnerabilities',
      requiredCapabilities: ['security', 'code-review'],
      dependencies: ['static-analysis'],
      estimatedDuration: 40,
      priority: 'high',
    });

    // Subtask 3: Architecture review
    subtasks.set('arch-review', {
      description: 'Review architecture for security patterns',
      requiredCapabilities: ['security', 'architecture'],
      dependencies: [],
      estimatedDuration: 30,
      priority: 'high',
    });

    // Subtask 4: Penetration testing
    subtasks.set('pentest', {
      description: 'Perform penetration testing',
      requiredCapabilities: ['security', 'penetration-testing'],
      dependencies: ['code-review', 'arch-review'],
      estimatedDuration: 60,
      priority: 'high',
    });

    // Subtask 5: Remediation plan
    subtasks.set('remediation', {
      description: 'Create security remediation plan',
      requiredCapabilities: ['security', 'documentation'],
      dependencies: ['pentest'],
      estimatedDuration: 20,
      priority: 'medium',
    });
  }

  /**
   * Decompose documentation task
   */
  private decomposeDocumentation(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: Documentation plan
    subtasks.set('doc-plan', {
      description: 'Plan documentation structure and content',
      requiredCapabilities: ['documentation', 'technical-writing'],
      dependencies: [],
      estimatedDuration: 15,
      priority: 'high',
    });

    // Subtask 2: Write content
    subtasks.set('write-docs', {
      description: 'Write documentation content',
      requiredCapabilities: ['documentation', 'writing'],
      dependencies: ['doc-plan'],
      estimatedDuration: 40,
      priority: 'high',
    });

    // Subtask 3: Examples and tutorials
    subtasks.set('examples', {
      description: 'Create code examples and tutorials',
      requiredCapabilities: ['documentation', 'teaching'],
      dependencies: ['write-docs'],
      estimatedDuration: 30,
      priority: 'medium',
    });

    // Subtask 4: Review and edit
    subtasks.set('review-docs', {
      description: 'Review and edit documentation for clarity',
      requiredCapabilities: ['documentation', 'editing'],
      dependencies: ['write-docs'],
      estimatedDuration: 20,
      priority: 'medium',
    });
  }

  /**
   * Decompose bug fix task
   */
  private decomposeBugFix(task: string, subtasks: Map<string, Subtask>): void {
    // Subtask 1: Root cause analysis
    subtasks.set('root-cause', {
      description: 'Analyze root cause of the bug',
      requiredCapabilities: ['debugging', 'analysis'],
      dependencies: [],
      estimatedDuration: 20,
      priority: 'high',
    });

    // Subtask 2: Fix implementation
    subtasks.set('implement-fix', {
      description: 'Implement bug fix',
      requiredCapabilities: ['implementation', 'debugging'],
      dependencies: ['root-cause'],
      estimatedDuration: 30,
      priority: 'high',
    });

    // Subtask 3: Regression tests
    subtasks.set('regression-tests', {
      description: 'Write regression tests to prevent recurrence',
      requiredCapabilities: ['testing', 'regression-testing'],
      dependencies: ['implement-fix'],
      estimatedDuration: 20,
      priority: 'medium',
    });

    // Subtask 4: Code review
    subtasks.set('review-fix', {
      description: 'Review fix for correctness and side effects',
      requiredCapabilities: ['code-review', 'quality'],
      dependencies: ['implement-fix'],
      estimatedDuration: 15,
      priority: 'medium',
    });
  }

  /**
   * Decompose generic task
   */
  private decomposeGeneric(task: string, capabilities: string[], subtasks: Map<string, Subtask>): void {
    // Simple breakdown for unknown patterns
    subtasks.set('analyze', {
      description: `Analyze requirements for: ${task}`,
      requiredCapabilities: ['analysis', ...capabilities.slice(0, 2)],
      dependencies: [],
      estimatedDuration: 15,
      priority: 'high',
    });

    subtasks.set('implement', {
      description: `Implement: ${task}`,
      requiredCapabilities: ['implementation', ...capabilities.slice(0, 3)],
      dependencies: ['analyze'],
      estimatedDuration: 45,
      priority: 'high',
    });

    subtasks.set('test', {
      description: `Test implementation of: ${task}`,
      requiredCapabilities: ['testing', ...capabilities.slice(0, 2)],
      dependencies: ['implement'],
      estimatedDuration: 30,
      priority: 'medium',
    });
  }

  /**
   * Calculate execution order based on dependencies
   */
  private calculateExecutionOrder(subtasks: Map<string, Subtask>): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) {
        return;
      }
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected: ${taskId}`);
      }

      visiting.add(taskId);

      const subtask = subtasks.get(taskId);
      if (!subtask) {
        return;
      }

      // Visit dependencies first
      for (const dep of subtask.dependencies) {
        visit(dep);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      order.push(taskId);
    };

    // Visit all subtasks
    for (const taskId of subtasks.keys()) {
      visit(taskId);
    }

    return order;
  }

  /**
   * Check if subtasks can run in parallel
   */
  private checkParallelizable(subtasks: Map<string, Subtask>): boolean {
    // Check if there are subtasks with no dependencies
    const hasIndependentTasks = Array.from(subtasks.values()).some(
      task => task.dependencies.length === 0
    );

    return hasIndependentTasks && subtasks.size > 1;
  }

  /**
   * Match subtasks to agents
   */
  async matchSubtasksToAgents(decomposed: DecomposedTask): Promise<Map<string, Agent[]>> {
    const assignments = new Map<string, Agent[]>();

    for (const [id, subtask] of decomposed.subtasks) {
      const results = await this.selector.selectAgents(
        {
          requiredCapabilities: subtask.requiredCapabilities,
          minSuccessRate: 0.7,
          excludeStatus: ['failed'],
        },
        3 // Top 3 agents for each subtask
      );

      assignments.set(id, results.map(r => r.agent));
    }

    return assignments;
  }

  /**
   * Get parallel execution groups
   */
  getParallelGroups(decomposed: DecomposedTask): string[][] {
    const groups: string[][] = [];
    const assigned = new Set<string>();

    for (const taskId of decomposed.executionOrder) {
      if (assigned.has(taskId)) {
        continue;
      }

      const subtask = decomposed.subtasks.get(taskId);
      if (!subtask) {
        continue;
      }

      // Check if all dependencies are satisfied
      const depsSatisfied = subtask.dependencies.every(dep => assigned.has(dep));

      if (depsSatisfied && subtask.dependencies.length === 0) {
        // Can run in parallel with other independent tasks
        // Find all tasks with no dependencies
        const parallelTasks = Array.from(decomposed.subtasks.entries())
          .filter(([id, task]) => !assigned.has(id) && task.dependencies.length === 0)
          .map(([id]) => id);

        if (parallelTasks.length > 0) {
          groups.push(parallelTasks);
          parallelTasks.forEach(id => assigned.add(id));
        }
      } else if (depsSatisfied) {
        // Must run sequentially
        groups.push([taskId]);
        assigned.add(taskId);
      }
    }

    return groups;
  }
}
