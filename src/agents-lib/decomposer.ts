/**
 * wshobson Task Decomposer
 *
 * Analyzes complex tasks and breaks them down into subtasks with appropriate
 * agent assignments and dependency tracking. This is critical for wshobson's
 * parallel agent orchestration pattern where complex tasks need to be split
 * across multiple specialized agents.
 *
 * Key features:
 * - Natural language task analysis to identify components
 * - Automatic subtask decomposition with proper granularity
 * - Agent-capability matching for each subtask
 * - Dependency detection between subtasks
 * - Execution plan generation (sequential/parallel/mixed)
 * - Complexity estimation for time planning
 * - Support for hierarchical decomposition (multi-level breakdown)
 *
 * @example
 * ```typescript
 * const decomposer = new TaskDecomposer(repository);
 *
 * const decomposition = await decomposer.decompose(
 *   'Build a REST API for task management',
 *   {
 *     maxDepth: 2,
 *     preferParallel: true
 *   }
 * );
 *
 * console.log(`Execution plan: ${decomposition.executionPlan}`);
 * console.log(`Subtasks: ${decomposition.subtasks.length}`);
 *
 * // Execute based on decomposition
 * for (const subtask of decomposition.subtasks) {
 *   if (subtask.dependencies.length === 0) {
 *     // Can run in parallel
 *     await executeSubtask(subtask);
 *   }
 * }
 * ```
 */

import type { IAgentRepository, Agent, Capability } from './types.js';

/**
 * Subtask result from task decomposition
 *
 * Represents a single atomic task that can be delegated to an agent.
 * Contains all metadata needed for execution planning and agent assignment.
 */
export interface Subtask {
  /**
   * Unique identifier for this subtask
   * Format: '{parent-id}-{index}' or generated UUID
   */
  id: string;

  /**
   * Human-readable description of the subtask
   * Should be clear and actionable for an agent
   */
  description: string;

  /**
   * Capabilities required to complete this subtask
   * Used for agent matching and selection
   */
  requiredCapabilities: string[];

  /**
   * Suggested agents that can handle this subtask
   * Ordered by suitability (best match first)
   */
  suggestedAgents: string[];

  /**
   * IDs of subtasks this depends on
   * Empty array means this can run immediately
   */
  dependencies: string[];

  /**
   * Estimated complexity level
   * Used for time estimation and resource allocation
   */
  estimatedComplexity: 'low' | 'medium' | 'high';

  /**
   * Estimated duration in milliseconds
   * Based on complexity and historical data
   */
  estimatedDuration?: number;

  /**
   * Files or paths this subtask will likely modify
   * Used for file ownership planning
   */
  affectedPaths?: string[];

  /**
   * Additional metadata for execution planning
   */
  metadata?: {
    /**
     * Whether this subtask can be further decomposed
     */
    decomposable?: boolean;

    /**
     * Priority level (1-10, higher is more important)
     */
    priority?: number;

    /**
     * Tags for categorization
     */
    tags?: string[];

    /**
     * Custom properties
     */
    [key: string]: any;
  };
}

/**
 * Task decomposition result
 *
 * Complete breakdown of a complex task with execution plan and
 * agent assignments ready for parallel execution.
 */
export interface TaskDecomposition {
  /**
   * Original task description
   */
  originalTask: string;

  /**
   * Decomposed subtasks
   * Ordered by dependency (tasks with no dependencies first)
   */
  subtasks: Subtask[];

  /**
   * Execution strategy
   * - sequential: Tasks must run one after another
   * - parallel: All tasks can run concurrently
   * - mixed: Some can run in parallel, others must wait
   */
  executionPlan: 'sequential' | 'parallel' | 'mixed';

  /**
   * Estimated total duration in milliseconds
   * For parallel plans, this is the longest critical path
   * For sequential, this is the sum of all subtasks
   */
  estimatedDuration: number;

  /**
   * Agent assignments
   * Maps agent names to their assigned subtask IDs
   */
  agentAssignments: Map<string, string[]>;

  /**
   * Decomposition metadata
   */
  metadata: {
    /**
     * Decomposition depth reached
     */
    depth: number;

    /**
     * Timestamp when decomposition was created
     */
    timestamp: number;

    /**
     * Unique decomposition ID
     */
    decompositionId: string;

    /**
     * Confidence score for this decomposition (0-1)
     */
    confidence: number;
  };
}

/**
 * Task decomposition options
 *
 * Controls how the decomposer analyzes and breaks down tasks.
 */
export interface DecompositionOptions {
  /**
   * Maximum decomposition depth
   * Default: 2 (break down into subtasks, but not sub-subtasks)
   */
  maxDepth?: number;

  /**
   * Agent repository for capability matching
   * If not provided, uses default repository from constructor
   */
  agentRepository?: IAgentRepository;

  /**
   * Whether to prefer parallel execution when possible
   * Default: true (favor parallel for efficiency)
   */
  preferParallel?: boolean;

  /**
   * Maximum number of subtasks to create
   * Prevents over-decomposition of complex tasks
   * Default: 10
   */
  maxSubtasks?: number;

  /**
   * Minimum complexity threshold for decomposition
   * Tasks below this threshold won't be decomposed further
   * Default: 'medium'
   */
  minComplexity?: 'low' | 'medium' | 'high';

  /**
   * Custom decomposition patterns
   * Allows domain-specific task breakdown rules
   */
  patterns?: DecompositionPattern[];

  /**
   * Whether to include file ownership analysis
   * Default: true
   */
  analyzeFileOwnership?: boolean;
}

/**
 * Decomposition pattern for domain-specific task breakdown
 *
 * Allows customization of decomposition logic for specific
 * task types or domains.
 */
export interface DecompositionPattern {
  /**
   * Pattern name for identification
   */
  name: string;

  /**
   * Regex or keyword match to trigger this pattern
   * Can be a single RegExp or an array of strings/RegExp
   */
  match: RegExp | string[] | (string | RegExp)[];

  /**
   * Subtask templates
   * Each template defines a subtask with placeholders
   */
  subtasks: Array<{
    /**
     * Subtask description template
     * Can use {task} as placeholder for original task
     */
    description: string;

    /**
     * Required capabilities
     */
    capabilities: string[];

    /**
     * Suggested agent categories
     */
    agents: string[];

    /**
     * Default complexity
     */
    complexity: 'low' | 'medium' | 'high';

    /**
     * Dependencies (indices of subtasks this depends on)
     */
    dependencies?: number[];

    /**
     * Whether this can run in parallel
     */
    parallel?: boolean;
  }>;
}

/**
 * Task analysis result
 *
 * Internal representation used during decomposition process.
 */
interface TaskAnalysis {
  /**
   * Main task components identified
   */
  components: string[];

  /**
   * Detected task type/category
   */
  taskType: string;

  /**
   * Complexity assessment
   */
  complexity: 'low' | 'medium' | 'high';

  /**
   * Keywords found in task description
   */
  keywords: string[];

  /**
   * Technologies/libraries mentioned
   */
  technologies: string[];

  /**
   * File patterns detected (e.g., '*.ts', 'api/*')
   */
  filePatterns: string[];
}

/**
 * Default decomposition patterns for common task types
 */
const DEFAULT_PATTERNS: DecompositionPattern[] = [
  {
    name: 'rest-api',
    match: [/rest\s*api/i, /api\s*development/i, /backend\s*api/i],
    subtasks: [
      {
        description: 'Design database schema and data models for {task}',
        capabilities: ['database-design', 'schema-modeling', 'data-modeling'],
        agents: ['database-designer', 'backend-developer'],
        complexity: 'high',
        parallel: false,
      },
      {
        description: 'Implement API endpoints and controllers for {task}',
        capabilities: ['api-development', 'rest-api', 'backend-development'],
        agents: ['backend-developer', 'api-developer'],
        complexity: 'high',
        dependencies: [0],
        parallel: false,
      },
      {
        description: 'Add authentication and authorization to {task}',
        capabilities: ['authentication', 'security', 'authorization'],
        agents: ['security-specialist', 'auth-specialist'],
        complexity: 'medium',
        dependencies: [1],
        parallel: false,
      },
      {
        description: 'Write API documentation and tests for {task}',
        capabilities: ['documentation', 'testing', 'api-documentation'],
        agents: ['technical-writer', 'test-engineer', 'api-documenter'],
        complexity: 'medium',
        dependencies: [2],
        parallel: false,
      },
      {
        description: 'Create error handling and validation for {task}',
        capabilities: ['error-handling', 'validation', 'backend-development'],
        agents: ['backend-developer', 'qa-engineer'],
        complexity: 'medium',
        dependencies: [1],
        parallel: true,
      },
    ],
  },
  {
    name: 'frontend-feature',
    match: [/frontend\s*feature/i, /ui\s*component/i, /user\s*interface/i],
    subtasks: [
      {
        description: 'Design UI/UX mockups and wireframes for {task}',
        capabilities: ['ui-design', 'ux-design', 'mockup-design'],
        agents: ['ux-designer', 'ui-designer'],
        complexity: 'medium',
        parallel: false,
      },
      {
        description: 'Implement frontend components for {task}',
        capabilities: ['frontend-development', 'component-development', 'ui-implementation'],
        agents: ['frontend-developer', 'ui-developer'],
        complexity: 'high',
        dependencies: [0],
        parallel: false,
      },
      {
        description: 'Add state management for {task}',
        capabilities: ['state-management', 'frontend-architecture'],
        agents: ['frontend-architect', 'state-management-specialist'],
        complexity: 'medium',
        dependencies: [1],
        parallel: true,
      },
      {
        description: 'Implement responsive design for {task}',
        capabilities: ['responsive-design', 'css', 'styling'],
        agents: ['ui-developer', 'css-specialist'],
        complexity: 'low',
        dependencies: [1],
        parallel: true,
      },
      {
        description: 'Write frontend tests for {task}',
        capabilities: ['frontend-testing', 'unit-testing', 'e2e-testing'],
        agents: ['test-engineer', 'qa-engineer'],
        complexity: 'medium',
        dependencies: [1],
        parallel: true,
      },
    ],
  },
  {
    name: 'database-migration',
    match: [/database\s*migration/i, /schema\s*change/i, /data\s*migration/i],
    subtasks: [
      {
        description: 'Analyze current database schema and plan migration for {task}',
        capabilities: ['database-analysis', 'schema-analysis'],
        agents: ['database-analyst', 'dba'],
        complexity: 'high',
        parallel: false,
      },
      {
        description: 'Create migration scripts for {task}',
        capabilities: ['migration-scripting', 'sql-development'],
        agents: ['database-developer', 'backend-developer'],
        complexity: 'high',
        dependencies: [0],
        parallel: false,
      },
      {
        description: 'Create rollback plan for {task}',
        capabilities: ['rollback-planning', 'database-safety'],
        agents: ['dba', 'database-architect'],
        complexity: 'medium',
        dependencies: [0],
        parallel: true,
      },
      {
        description: 'Test migration on staging environment for {task}',
        capabilities: ['database-testing', 'migration-testing'],
        agents: ['test-engineer', 'qa-engineer'],
        complexity: 'high',
        dependencies: [1, 2],
        parallel: false,
      },
    ],
  },
  {
    name: 'testing-suite',
    match: [/test\s*suite/i, /testing\s*framework/i, /test\s*coverage/i],
    subtasks: [
      {
        description: 'Design test strategy and test cases for {task}',
        capabilities: ['test-strategy', 'test-planning', 'qa-planning'],
        agents: ['qa-architect', 'test-engineer'],
        complexity: 'medium',
        parallel: false,
      },
      {
        description: 'Set up testing framework and infrastructure for {task}',
        capabilities: ['testing-infrastructure', 'ci-cd', 'devops'],
        agents: ['devops-engineer', 'test-engineer'],
        complexity: 'medium',
        dependencies: [0],
        parallel: false,
      },
      {
        description: 'Write unit tests for {task}',
        capabilities: ['unit-testing', 'test-writing'],
        agents: ['test-engineer', 'developer'],
        complexity: 'high',
        dependencies: [1],
        parallel: true,
      },
      {
        description: 'Write integration tests for {task}',
        capabilities: ['integration-testing', 'test-writing'],
        agents: ['test-engineer', 'qa-engineer'],
        complexity: 'high',
        dependencies: [1],
        parallel: true,
      },
      {
        description: 'Configure test coverage reporting for {task}',
        capabilities: ['coverage-reporting', 'testing-metrics'],
        agents: ['qa-engineer', 'test-engineer'],
        complexity: 'low',
        dependencies: [2, 3],
        parallel: true,
      },
    ],
  },
  {
    name: 'documentation',
    match: [/documentation/i, /docs\s*update/i, /api\s*docs/i],
    subtasks: [
      {
        description: 'Analyze code and extract documentation requirements for {task}',
        capabilities: ['code-analysis', 'documentation-planning'],
        agents: ['technical-analyst', 'technical-writer'],
        complexity: 'low',
        parallel: false,
      },
      {
        description: 'Write code documentation and comments for {task}',
        capabilities: ['code-documentation', 'technical-writing'],
        agents: ['developer', 'technical-writer'],
        complexity: 'medium',
        dependencies: [0],
        parallel: true,
      },
      {
        description: 'Create user guides and tutorials for {task}',
        capabilities: ['user-documentation', 'tutorial-writing'],
        agents: ['technical-writer', 'documentation-specialist'],
        complexity: 'medium',
        dependencies: [0],
        parallel: true,
      },
      {
        description: 'Generate API documentation from code for {task}',
        capabilities: ['api-documentation', 'documentation-generation'],
        agents: ['api-documenter', 'technical-writer'],
        complexity: 'low',
        dependencies: [1],
        parallel: true,
      },
    ],
  },
  {
    name: 'security-audit',
    match: [/security\s*audit/i, /security\s*review/i, /vulnerability\s*scan/i],
    subtasks: [
      {
        description: 'Perform static code analysis for security vulnerabilities in {task}',
        capabilities: ['static-analysis', 'security-analysis', 'code-review'],
        agents: ['security-analyst', 'code-reviewer'],
        complexity: 'high',
        parallel: false,
      },
      {
        description: 'Check dependencies for known vulnerabilities in {task}',
        capabilities: ['dependency-checking', 'vulnerability-scanning'],
        agents: ['security-specialist', 'devops-engineer'],
        complexity: 'medium',
        dependencies: [0],
        parallel: true,
      },
      {
        description: 'Review authentication and authorization in {task}',
        capabilities: ['auth-review', 'security-review'],
        agents: ['security-specialist', 'auth-specialist'],
        complexity: 'high',
        dependencies: [0],
        parallel: true,
      },
      {
        description: 'Generate security report and remediation plan for {task}',
        capabilities: ['security-reporting', 'technical-writing'],
        agents: ['security-analyst', 'technical-writer'],
        complexity: 'medium',
        dependencies: [1, 2],
        parallel: false,
      },
    ],
  },
];

/**
 * Task Decomposer
 *
 * Analyzes complex tasks and decomposes them into executable subtasks
 * with proper agent assignments and dependency tracking.
 */
export class TaskDecomposer {
  private repository: IAgentRepository;
  private patterns: DecompositionPattern[];

  /**
   * Create a new task decomposer
   *
   * @param repository - Agent repository for capability matching
   * @param patterns - Optional custom decomposition patterns
   */
  constructor(repository: IAgentRepository, patterns?: DecompositionPattern[]) {
    this.repository = repository;
    this.patterns = patterns || DEFAULT_PATTERNS;
  }

  /**
   * Decompose a complex task into subtasks
   *
   * This is the main entry point for task decomposition. It:
   * 1. Analyzes the task to identify components and complexity
   * 2. Matches against decomposition patterns
   * 3. Generates subtasks with appropriate agent assignments
   * 4. Detects dependencies between subtasks
   * 5. Creates execution plan (sequential/parallel/mixed)
   * 6. Estimates duration and assigns agents
   *
   * @param task - Complex task description to decompose
   * @param options - Decomposition options
   * @returns Promise resolving to task decomposition
   *
   * @example
   * ```typescript
   * const decomposition = await decomposer.decompose(
   *   'Build a REST API for task management',
   *   {
   *     maxDepth: 2,
   *     preferParallel: true,
   *     maxSubtasks: 10
   *   }
   * );
   *
   * console.log(`Plan: ${decomposition.executionPlan}`);
   * console.log(`Subtasks: ${decomposition.subtasks.length}`);
   * console.log(`Duration: ${decomposition.estimatedDuration}ms`);
   * ```
   */
  async decompose(
    task: string,
    options: DecompositionOptions = {}
  ): Promise<TaskDecomposition> {
    // Merge options with defaults
    const mergedOptions: Required<Omit<DecompositionOptions, 'agentRepository' | 'patterns'>> & {
      agentRepository?: IAgentRepository;
      patterns?: DecompositionPattern[];
    } = {
      maxDepth: options.maxDepth ?? 2,
      preferParallel: options.preferParallel ?? true,
      maxSubtasks: options.maxSubtasks ?? 10,
      minComplexity: options.minComplexity ?? 'medium',
      analyzeFileOwnership: options.analyzeFileOwnership ?? true,
      agentRepository: options.agentRepository,
      patterns: options.patterns,
    };

    // Use provided repository or default
    const repo = mergedOptions.agentRepository || this.repository;

    // Phase 1: Analyze the task
    const analysis = this.analyzeTask(task);

    // Phase 2: Match against patterns
    const matchedPattern = this.matchPattern(task, analysis);

    // Phase 3: Generate subtasks
    let subtasks = matchedPattern
      ? this.generateSubtasksFromPattern(task, matchedPattern)
      : this.generateSubtasksFromAnalysis(task, analysis, mergedOptions.maxSubtasks);

    // Phase 4: Match agents to subtasks
    subtasks = await this.matchAgentsToSubtasks(subtasks, repo);

    // Phase 5: Detect and set dependencies
    subtasks = this.detectDependencies(subtasks);

    // Phase 6: Estimate durations
    subtasks = this.estimateDurations(subtasks);

    // Phase 7: Analyze file ownership if requested
    if (mergedOptions.analyzeFileOwnership) {
      subtasks = this.analyzeFileOwnershipImpact(subtasks, analysis);
    }

    // Phase 8: Create execution plan
    const executionPlan = this.createExecutionPlan(subtasks, mergedOptions.preferParallel);

    // Phase 9: Create agent assignments
    const agentAssignments = this.createAgentAssignments(subtasks);

    // Phase 10: Calculate total duration
    const estimatedDuration = this.calculateTotalDuration(subtasks, executionPlan);

    // Phase 11: Calculate confidence
    const confidence = this.calculateConfidence(subtasks, analysis, matchedPattern !== undefined);

    // Create decomposition result
    const decompositionId = this.generateDecompositionId();

    return {
      originalTask: task,
      subtasks,
      executionPlan,
      estimatedDuration,
      agentAssignments,
      metadata: {
        depth: 1,
        timestamp: Date.now(),
        decompositionId,
        confidence,
      },
    };
  }

  /**
   * Analyze a task to extract components and characteristics
   *
   * @param task - Task description to analyze
   * @returns Task analysis result
   */
  private analyzeTask(task: string): TaskAnalysis {
    const words = task.toLowerCase().split(/\s+/);
    const keywords: string[] = [];
    const technologies: string[] = [];
    const components: string[] = [];
    const filePatterns: string[] = [];

    // Extract keywords
    const keywordPatterns = [
      'api', 'rest', 'graphql', 'database', 'schema', 'migration',
      'frontend', 'backend', 'ui', 'ux', 'component', 'service',
      'test', 'testing', 'documentation', 'security', 'auth',
      'deploy', 'ci', 'cd', 'monitoring', 'logging',
    ];

    for (const word of words) {
      if (keywordPatterns.some(kw => word.includes(kw))) {
        keywords.push(word);
      }
    }

    // Extract technologies
    const techPatterns = [
      'react', 'vue', 'angular', 'svelte', 'node', 'express',
      'postgres', 'mysql', 'mongodb', 'redis', 'docker',
      'kubernetes', 'aws', 'azure', 'gcp', 'typescript',
      'python', 'java', 'go', 'rust', 'graphql',
    ];

    for (const word of words) {
      if (techPatterns.some(tech => word.includes(tech))) {
        technologies.push(word);
      }
    }

    // Detect task type
    const taskType = this.detectTaskType(task, keywords);

    // Estimate complexity
    const complexity = this.estimateComplexity(task, keywords, components.length);

    // Extract file patterns
    const filePatternMatches = task.match(/[\w-]+\*\.[\w]+/g) || [];
    filePatterns.push(...filePatternMatches);

    return {
      components,
      taskType,
      complexity,
      keywords,
      technologies,
      filePatterns,
    };
  }

  /**
   * Detect task type from description and keywords
   */
  private detectTaskType(task: string, keywords: string[]): string {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('api') || taskLower.includes('endpoint')) {
      return 'rest-api';
    }
    if (taskLower.includes('frontend') || taskLower.includes('ui') || taskLower.includes('component')) {
      return 'frontend-feature';
    }
    if (taskLower.includes('database') || taskLower.includes('migration')) {
      return 'database-migration';
    }
    if (taskLower.includes('test') || taskLower.includes('testing')) {
      return 'testing-suite';
    }
    if (taskLower.includes('document') || taskLower.includes('docs')) {
      return 'documentation';
    }
    if (taskLower.includes('security') || taskLower.includes('audit')) {
      return 'security-audit';
    }

    return 'general';
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(
    task: string,
    keywords: string[],
    componentCount: number
  ): 'low' | 'medium' | 'high' {
    const taskLower = task.toLowerCase();

    // High complexity indicators
    if (
      taskLower.includes('architecture') ||
      taskLower.includes('system') ||
      taskLower.includes('migration') ||
      keywords.length > 5 ||
      task.length > 200
    ) {
      return 'high';
    }

    // Low complexity indicators
    if (
      taskLower.includes('update') ||
      taskLower.includes('fix') ||
      taskLower.includes('add') ||
      keywords.length <= 2 ||
      task.length < 50
    ) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Match task against decomposition patterns
   */
  private matchPattern(task: string, analysis: TaskAnalysis): DecompositionPattern | undefined {
    const allPatterns = [...this.patterns, ...DEFAULT_PATTERNS];

    for (const pattern of allPatterns) {
      if (pattern.match instanceof RegExp) {
        if (pattern.match.test(task)) {
          return pattern;
        }
      } else if (Array.isArray(pattern.match)) {
        for (const match of pattern.match) {
          if (match instanceof RegExp) {
            if (match.test(task)) {
              return pattern;
            }
          } else if (typeof match === 'string') {
            if (task.toLowerCase().includes(match.toLowerCase())) {
              return pattern;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Generate subtasks from matched pattern
   */
  private generateSubtasksFromPattern(task: string, pattern: DecompositionPattern): Subtask[] {
    const subtasks: Subtask[] = [];

    for (let i = 0; i < pattern.subtasks.length; i++) {
      const template = pattern.subtasks[i];
      const description = template.description.replace('{task}', task);

      const subtask: Subtask = {
        id: this.generateSubtaskId(i),
        description,
        requiredCapabilities: template.capabilities,
        suggestedAgents: template.agents,
        dependencies: (template.dependencies || []).map(dep => this.generateSubtaskId(dep)),
        estimatedComplexity: template.complexity,
        metadata: {
          priority: 5,
          tags: [pattern.name],
        },
      };

      subtasks.push(subtask);
    }

    return subtasks;
  }

  /**
   * Generate subtasks from task analysis (fallback)
   */
  private generateSubtasksFromAnalysis(
    task: string,
    analysis: TaskAnalysis,
    maxSubtasks: number
  ): Subtask[] {
    const subtasks: Subtask[] = [];

    // Default decomposition for unknown task types
    const defaultSubtasks = [
      {
        description: `Analyze requirements and plan implementation for: ${task}`,
        capabilities: ['requirements-analysis', 'planning'],
        agents: ['business-analyst', 'planner'],
        complexity: 'medium' as const,
        parallel: false,
      },
      {
        description: `Implement core functionality for: ${task}`,
        capabilities: ['development', 'implementation'],
        agents: ['developer', 'implementer'],
        complexity: 'high' as const,
        dependencies: [0],
        parallel: false,
      },
      {
        description: `Write tests for: ${task}`,
        capabilities: ['testing', 'quality-assurance'],
        agents: ['test-engineer', 'qa-engineer'],
        complexity: 'medium' as const,
        dependencies: [1],
        parallel: true,
      },
      {
        description: `Create documentation for: ${task}`,
        capabilities: ['documentation', 'writing'],
        agents: ['technical-writer', 'documenter'],
        complexity: 'low' as const,
        dependencies: [1],
        parallel: true,
      },
    ];

    for (let i = 0; i < Math.min(defaultSubtasks.length, maxSubtasks); i++) {
      const template = defaultSubtasks[i];

      const subtask: Subtask = {
        id: this.generateSubtaskId(i),
        description: template.description,
        requiredCapabilities: template.capabilities,
        suggestedAgents: template.agents,
        dependencies: (template.dependencies || []).map(dep => this.generateSubtaskId(dep)),
        estimatedComplexity: template.complexity,
        metadata: {
          priority: 5,
          tags: ['general', analysis.taskType],
        },
      };

      subtasks.push(subtask);
    }

    return subtasks;
  }

  /**
   * Match agents to subtasks based on capabilities
   */
  private async matchAgentsToSubtasks(
    subtasks: Subtask[],
    repository: IAgentRepository
  ): Promise<Subtask[]> {
    const updatedSubtasks = await Promise.all(
      subtasks.map(async (subtask) => {
        // Find agents matching required capabilities
        const matchedAgents = await this.findAgentsForCapabilities(
          subtask.requiredCapabilities,
          repository
        );

        // If we found better matches, update suggested agents
        if (matchedAgents.length > 0) {
          return {
            ...subtask,
            suggestedAgents: matchedAgents.map(agent => agent.name),
          };
        }

        return subtask;
      })
    );

    return updatedSubtasks;
  }

  /**
   * Find agents that match required capabilities
   */
  private async findAgentsForCapabilities(
    capabilities: string[],
    repository: IAgentRepository
  ): Promise<Agent[]> {
    try {
      // Use repository to find agents by capabilities
      const agents = await repository.findAgentsByCapabilities(capabilities);

      // Sort by success rate and capability match
      return agents.sort((a, b) => {
        const aScore = this.calculateAgentCapabilityScore(a, capabilities);
        const bScore = this.calculateAgentCapabilityScore(b, capabilities);

        if (bScore !== aScore) {
          return bScore - aScore; // Higher score first
        }

        return b.successRate - a.successRate; // Then by success rate
      });
    } catch {
      // If repository query fails, return empty array
      return [];
    }
  }

  /**
   * Calculate how well an agent matches required capabilities
   */
  private calculateAgentCapabilityScore(agent: Agent, required: string[]): number {
    let score = 0;
    const agentCapabilities = agent.capabilities.map(c => c.name.toLowerCase());

    for (const req of required) {
      const reqLower = req.toLowerCase();
      for (const agentCap of agentCapabilities) {
        if (agentCap.includes(reqLower) || reqLower.includes(agentCap)) {
          score += 1;
          break;
        }
      }
    }

    return score;
  }

  /**
   * Detect dependencies between subtasks
   */
  private detectDependencies(subtasks: Subtask[]): Subtask[] {
    // Dependencies are already set by pattern or analysis
    // This method could be enhanced to detect additional implicit dependencies
    return subtasks;
  }

  /**
   * Estimate duration for each subtask
   */
  private estimateDurations(subtasks: Subtask[]): Subtask[] {
    return subtasks.map(subtask => {
      const baseDuration = {
        low: 5 * 60 * 1000,      // 5 minutes
        medium: 15 * 60 * 1000,  // 15 minutes
        high: 30 * 60 * 1000,    // 30 minutes
      };

      return {
        ...subtask,
        estimatedDuration: baseDuration[subtask.estimatedComplexity],
      };
    });
  }

  /**
   * Analyze file ownership impact for subtasks
   */
  private analyzeFileOwnershipImpact(subtasks: Subtask[], analysis: TaskAnalysis): Subtask[] {
    return subtasks.map(subtask => {
      const paths: string[] = [];

      // Infer paths from task description and capabilities
      const desc = subtask.description.toLowerCase();

      if (desc.includes('api') || desc.includes('endpoint')) {
        paths.push('api/', 'src/api/', 'controllers/');
      }
      if (desc.includes('frontend') || desc.includes('ui')) {
        paths.push('src/components/', 'src/views/', 'src/styles/');
      }
      if (desc.includes('test')) {
        paths.push('tests/', '__tests__/', 'test/');
      }
      if (desc.includes('database') || desc.includes('schema')) {
        paths.push('src/models/', 'migrations/', 'src/db/');
      }
      if (desc.includes('document')) {
        paths.push('docs/', 'README.md', 'API.md');
      }

      return {
        ...subtask,
        affectedPaths: paths.length > 0 ? paths : undefined,
      };
    });
  }

  /**
   * Create execution plan for subtasks
   */
  private createExecutionPlan(
    subtasks: Subtask[],
    preferParallel: boolean
  ): 'sequential' | 'parallel' | 'mixed' {
    if (subtasks.length === 0) {
      return 'sequential';
    }

    if (subtasks.length === 1) {
      return 'sequential';
    }

    // Check if any subtask has dependencies
    const hasDependencies = subtasks.some(st => st.dependencies.length > 0);

    if (!hasDependencies) {
      // All can run in parallel
      return preferParallel ? 'parallel' : 'sequential';
    }

    // Check if all have dependencies (fully sequential)
    const allHaveDependencies = subtasks.every(st => st.dependencies.length > 0);

    if (allHaveDependencies && this.isSequentialChain(subtasks)) {
      return 'sequential';
    }

    // Mixed: some can run in parallel, others must wait
    return 'mixed';
  }

  /**
   * Check if subtasks form a sequential chain
   */
  private isSequentialChain(subtasks: Subtask[]): boolean {
    for (let i = 1; i < subtasks.length; i++) {
      const prevId = subtasks[i - 1].id;
      if (!subtasks[i].dependencies.includes(prevId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Create agent assignments map
   */
  private createAgentAssignments(subtasks: Subtask[]): Map<string, string[]> {
    const assignments = new Map<string, string[]>();

    for (const subtask of subtasks) {
      // Use the first suggested agent for each subtask
      const primaryAgent = subtask.suggestedAgents[0];
      if (primaryAgent) {
        const current = assignments.get(primaryAgent) || [];
        current.push(subtask.id);
        assignments.set(primaryAgent, current);
      }
    }

    return assignments;
  }

  /**
   * Calculate total duration for execution plan
   */
  private calculateTotalDuration(subtasks: Subtask[], plan: 'sequential' | 'parallel' | 'mixed'): number {
    if (plan === 'sequential') {
      // Sum of all durations
      return subtasks.reduce((sum, st) => sum + (st.estimatedDuration || 0), 0);
    }

    if (plan === 'parallel') {
      // Maximum duration (longest subtask)
      return Math.max(...subtasks.map(st => st.estimatedDuration || 0));
    }

    // Mixed: Calculate critical path
    return this.calculateCriticalPath(subtasks);
  }

  /**
   * Calculate critical path duration for mixed execution
   */
  private calculateCriticalPath(subtasks: Subtask[]): number {
    const subtaskMap = new Map(subtasks.map(st => [st.id, st]));
    const memo = new Map<string, number>();

    const calculatePath = (taskId: string): number => {
      if (memo.has(taskId)) {
        return memo.get(taskId)!;
      }

      const subtask = subtaskMap.get(taskId);
      if (!subtask) return 0;

      const duration = subtask.estimatedDuration || 0;

      if (subtask.dependencies.length === 0) {
        memo.set(taskId, duration);
        return duration;
      }

      const maxDepDuration = Math.max(
        ...subtask.dependencies.map(dep => calculatePath(dep))
      );

      const total = duration + maxDepDuration;
      memo.set(taskId, total);
      return total;
    };

    // Find the maximum path from all subtasks
    return Math.max(...Array.from(subtaskMap.keys()).map(id => calculatePath(id)));
  }

  /**
   * Calculate confidence score for decomposition
   */
  private calculateConfidence(
    subtasks: Subtask[],
    analysis: TaskAnalysis,
    hasPattern: boolean
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence if we matched a pattern
    if (hasPattern) {
      confidence += 0.3;
    }

    // Increase confidence if all subtasks have agent suggestions
    const allHaveAgents = subtasks.every(st => st.suggestedAgents.length > 0);
    if (allHaveAgents) {
      confidence += 0.1;
    }

    // Increase confidence if subtasks have clear dependencies
    const hasClearDeps = subtasks.every(st =>
      st.dependencies.length === 0 || st.dependencies.length < 3
    );
    if (hasClearDeps) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate a unique subtask ID
   */
  private generateSubtaskId(index: number): string {
    return `subtask-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique decomposition ID
   */
  private generateDecompositionId(): string {
    return `decomp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a task decomposer instance
 *
 * Factory function for creating a decomposer with a repository and optional patterns.
 *
 * @param repository - Agent repository
 * @param patterns - Optional custom decomposition patterns
 * @returns Configured task decomposer instance
 *
 * @example
 * ```typescript
 * const decomposer = createTaskDecomposer(repository, [
 *   {
 *     name: 'custom-pattern',
 *     match: ['custom task'],
 *     subtasks: [...]
 *   }
 * ]);
 * ```
 */
export function createTaskDecomposer(
  repository: IAgentRepository,
  patterns?: DecompositionPattern[]
): TaskDecomposer {
  return new TaskDecomposer(repository, patterns);
}
