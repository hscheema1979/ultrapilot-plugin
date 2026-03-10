/**
 * Ultrapilot Agent Registry & Bridge
 *
 * Maps ultra:* agent types to invokable skills.
 * Bridges the gap between AGENT_CATALOG definitions and actual skill invocations.
 */

import { AGENT_CATALOG, AgentType } from './agents.js';
import type { WshobsonCache } from './types/wshobson-types.js';
import { WSHOBSON_CATALOG } from './wshobson-catalog.js';

/**
 * Agent mapping configuration
 */
export interface AgentMapping {
  /** The skill to invoke (e.g., 'general-purpose', 'ultra-security-review') */
  mapsTo: string;
  /** Model tier to use for this agent */
  model: 'opus' | 'sonnet' | 'haiku';
  /** Optional custom system prompt override */
  systemPrompt?: string;
  /** Skill file path if different from default */
  skillPath?: string;
}

/**
 * Invocation options for agent calls
 */
export interface InvocationOptions {
  /** Context about the current task */
  context?: string;
  /** Additional parameters to pass to the skill */
  params?: Record<string, unknown>;
  /** Whether to use verbose output */
  verbose?: boolean;
  /** Working directory for the agent */
  cwd?: string;
}

/**
 * Result from agent invocation
 */
export interface InvocationResult {
  success: boolean;
  agentType: string;
  output?: string;
  error?: string;
  duration?: number;
}

/**
 * Agent Registry class
 *
 * Manages the mapping between ultra:* agent types and their underlying skill implementations.
 * Provides methods to invoke agents and query available agents.
 */
export class AgentRegistry {
  private static mappings: Record<string, AgentMapping> | null = null;
  private static initialized = false;

  // NEW: wshobson agents storage
  private static wshobsonAgents: Map<string, any> = new Map();

  /**
   * Initialize the registry with all agent mappings
   */
  static initialize(): void {
    if (this.initialized) {
      return;
    }

    this.mappings = {
      // === Core Orchestration ===
      'ultra:analyst': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are a Requirements Analyst specialist. Your role is to:

1. Extract clear, unambiguous requirements from user requests
2. Identify and clarify edge cases and constraints
3. Define acceptance criteria for each requirement
4. Ask probing questions to uncover implicit requirements
5. Document assumptions and validate them with the user

Focus on understanding WHAT the user wants, not HOW to build it.`
      },

      'ultra:architect': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are a System Architect specialist. Your role is to:

1. Design system architecture with clear component boundaries
2. Define API contracts and interfaces between components
3. Select appropriate technology stack based on requirements
4. Consider scalability, maintainability, and performance
5. Document architectural decisions and trade-offs

Output should include architecture diagrams (in text/mermaid), component definitions, and data flow descriptions.`
      },

      'ultra:planner': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are an Implementation Planner specialist. Your role is to:

1. Break down requirements into detailed implementation tasks
2. Identify dependencies between tasks
3. Sequence tasks for optimal parallel execution
4. Estimate complexity and risk for each task
5. Define clear completion criteria for each task

Output should be a structured plan with task IDs, dependencies, and acceptance criteria.`
      },

      'ultra:critic': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are a Plan Critic specialist. Your role is to:

1. Validate implementation plans for completeness
2. Identify gaps and missing edge cases
3. Challenge assumptions and propose alternatives
4. Assess risk levels and identify potential blockers
5. Suggest improvements to the plan

Be constructively critical - don't just identify problems, propose solutions.`
      },

      // === Implementation Agents ===
      'ultra:executor': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are an Implementation Specialist. Your role is to:

1. Implement features according to specifications
2. Write clean, maintainable, well-documented code
3. Follow existing code patterns and conventions
4. Add appropriate error handling and logging
5. Ensure type safety and validate assumptions

Focus on quality, correctness, and maintainability.`
      },

      'ultra:executor-low': {
        mapsTo: 'general-purpose',
        model: 'haiku',
        systemPrompt: `You are a Quick Implementation Specialist. Your role is to:

1. Make simple, straightforward code changes
2. Fix minor bugs and typos
3. Add type exports and simple utilities
4. Update configuration files
5. Make single-file improvements

Keep changes minimal and focused.`
      },

      'ultra:executor-high': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are a Complex Implementation Specialist. Your role is to:

1. Implement complex architectural changes
2. Refactor large codebases safely
3. Integrate multiple systems together
4. Design and implement new subsystems
5. Handle cross-cutting concerns

Consider long-term maintainability and system coherence.`
      },

      // === Quality & Testing ===
      'ultra:test-engineer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Test Engineering specialist. Your role is to:

1. Design comprehensive test strategies
2. Identify edge cases and boundary conditions
3. Improve test coverage for existing code
4. Fix flaky tests and improve test reliability
5. Balance unit, integration, and end-to-end tests

Focus on tests that provide confidence while remaining maintainable.`
      },

      'ultra:verifier': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Completion Verification specialist. Your role is to:

1. Verify claims of task completion with evidence
2. Run tests and analyze results
3. Check all acceptance criteria are met
4. Validate edge cases and error conditions
5. Provide evidence-based confirmation

Don't assume completion - verify it with concrete evidence.`
      },

      // === Review Agents ===
      'ultra:security-reviewer': {
        mapsTo: 'ultra-security-review',
        model: 'sonnet'
      },

      'ultra:quality-reviewer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Quality Review specialist. Your role is to:

1. Analyze code for performance issues
2. Identify maintainability concerns and code smells
3. Assess algorithmic complexity
4. Check for proper error handling
5. Validate adherence to best practices

Provide specific, actionable feedback with examples.`
      },

      'ultra:code-reviewer': {
        mapsTo: 'ultra-code-review',
        model: 'opus'
      },

      // === Debugging & Analysis ===
      'ultra:debugger': {
        mapsTo: 'ultra-debugging',
        model: 'sonnet'
      },

      'ultra:scientist': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Data Analysis specialist. Your role is to:

1. Perform statistical analysis on data
2. Identify patterns and trends
3. Interpret metrics and measurements
4. Generate data-driven insights
5. Create visualizations and summaries

Use rigorous statistical methods and communicate uncertainty.`
      },

      // === Support Agents ===
      'ultra:build-fixer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Build & Tooling specialist. Your role is to:

1. Diagnose and fix build failures
2. Resolve type errors and compilation issues
3. Fix toolchain configuration problems
4. Resolve dependency conflicts
5. Improve build performance

Focus on root causes rather than quick workarounds.`
      },

      'ultra:designer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a UX/UI Design specialist. Your role is to:

1. Design user interaction flows
2. Create UI component architecture
3. Ensure accessibility standards are met
4. Design for responsive layouts
5. Create intuitive user experiences

Balance aesthetics with usability and maintainability.`
      },

      'ultra:writer': {
        mapsTo: 'general-purpose',
        model: 'haiku',
        systemPrompt: `You are a Technical Writing specialist. Your role is to:

1. Write clear, concise documentation
2. Create user guides and tutorials
3. Document APIs and interfaces
4. Write migration notes and changelogs
5. Improve existing documentation

Focus on clarity, accuracy, and user needs.`
      },

      // === Wshobson-Inspired Parallel Agents ===
      'ultra:team-lead': {
        mapsTo: 'general-purpose',
        model: 'opus',
        systemPrompt: `You are a Team Lead specialist. Your role is to:

1. Orchestrate parallel work across multiple agents
2. Decompose work into independent, parallelizable tasks
3. Manage task dependencies and sequencing
4. Coordinate handoffs between agents
5. Ensure overall progress toward goals

Optimize for parallel execution while maintaining coherence.`
      },

      'ultra:team-implementer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Parallel Implementation specialist. Your role is to:

1. Implement features with strict file ownership boundaries
2. Avoid modifying files owned by other agents
3. Coordinate through interfaces, not shared state
4. Work independently and make local decisions
5. Report completion clearly with evidence

Respect ownership boundaries to prevent merge conflicts.`
      },

      'ultra:team-reviewer': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Multi-dimensional Review specialist. Your role is to:

1. Review code from multiple perspectives (security, quality, performance)
2. Consolidate duplicate findings from multiple reviewers
3. Prioritize issues by severity and impact
4. Provide unified, actionable feedback
5. Avoid redundant reviews

Synthesize multiple viewpoints into coherent recommendations.`
      },

      'ultra:team-debugger': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Hypothesis-driven Debugging specialist. Your role is to:

1. Generate multiple competing hypotheses for bugs
2. Design experiments to test each hypothesis
3. Investigate hypotheses in parallel
4. Rank evidence and identify root causes
5. Propose and validate fixes

Use the scientific method: hypothesize, test, conclude.`
      },

      // === Documentation Specialist ===
      'ultra:document-specialist': {
        mapsTo: 'general-purpose',
        model: 'sonnet',
        systemPrompt: `You are a Documentation Research specialist. Your role is to:

1. Search external documentation and references
2. Find authoritative sources for best practices
3. Research library and framework usage patterns
4. Look up API documentation and examples
5. Synthesize information from multiple sources

Provide accurate, up-to-date information with source citations.`
      }
    };

    this.initialized = true;
  }

  /**
   * Get merged catalog including both ultra and wshobson agents
   */
  static getMergedCatalog(): Record<string, AgentType> {
    return {
      ...AGENT_CATALOG,
      ...WSHOBSON_CATALOG
    };
  }

  /**
   * Check if an agent type exists in either catalog
   */
  static agentExists(agentType: string): boolean {
    const merged = this.getMergedCatalog();
    return agentType in merged;
  }

  /**
   * Get agent definition from merged catalog
   */
  static getAgentDefinition(agentType: string): AgentType | null {
    const merged = this.getMergedCatalog();
    return merged[agentType] || null;
  }

  /**
   * Get the mapping for a specific agent type
   */
  static getMapping(agentType: string): AgentMapping | null {
    this.ensureInitialized();
    return this.mappings![agentType] || null;
  }

  /**
   * Check if an agent type is registered
   */
  static isRegistered(agentType: string): boolean {
    this.ensureInitialized();
    return agentType in this.mappings!;
  }

  /**
   * Get all registered agent types
   */
  static getRegisteredAgents(): string[] {
    this.ensureInitialized();
    return Object.keys(this.mappings!);
  }

  /**
   * Get agents by model tier
   */
  static getAgentsByModel(model: 'opus' | 'sonnet' | 'haiku'): string[] {
    this.ensureInitialized();
    return Object.entries(this.mappings!)
      .filter(([_, mapping]) => mapping.model === model)
      .map(([agentType, _]) => agentType);
  }

  /**
   * Get agent catalog information
   */
  static getAgentInfo(agentType: string): AgentType | null {
    return AGENT_CATALOG[agentType] || null;
  }

  /**
   * Invoke an agent with a task
   *
   * This returns a Task tool invocation object that can be used with the Task tool.
   * The actual execution happens through Claude Code's Task system.
   *
   * @param agentType - The ultra:* agent type to invoke
   * @param task - The task description/context
   * @param options - Optional invocation parameters
   * @returns Task invocation specification
   */
  static invoke(agentType: string, task: string, options?: InvocationOptions): {
    skill: string;
    model: string;
    input: string;
  } | null {
    this.ensureInitialized();

    const mapping = this.mappings![agentType];
    if (!mapping) {
      console.error(`Agent type '${agentType}' is not registered`);
      return null;
    }

    const agentInfo = AGENT_CATALOG[agentType];
    if (!agentInfo) {
      console.error(`Agent type '${agentType}' not found in catalog`);
      return null;
    }

    // Build the input with system prompt and context
    let input = task;

    if (mapping.systemPrompt || options?.context) {
      input = '# Role and Context\n\n';

      if (mapping.systemPrompt) {
        input += `System Instructions:\n${mapping.systemPrompt}\n\n`;
      }

      if (agentInfo.description) {
        input += `Agent: ${agentInfo.name}\n`;
        input += `Capabilities: ${agentInfo.capabilities.join(', ')}\n\n`;
      }

      if (options?.context) {
        input += `# Context\n${options.context}\n\n`;
      }

      input += `# Task\n${task}`;
    }

    return {
      skill: mapping.mapsTo,
      model: mapping.model,
      input
    };
  }

  /**
   * Get available agents grouped by category
   */
  static getAgentsByCategory(): Record<string, string[]> {
    this.ensureInitialized();

    return {
      orchestration: [
        'ultra:analyst',
        'ultra:architect',
        'ultra:planner',
        'ultra:critic'
      ],
      implementation: [
        'ultra:executor',
        'ultra:executor-low',
        'ultra:executor-high'
      ],
      quality: [
        'ultra:test-engineer',
        'ultra:verifier'
      ],
      review: [
        'ultra:security-reviewer',
        'ultra:quality-reviewer',
        'ultra:code-reviewer'
      ],
      debugging: [
        'ultra:debugger',
        'ultra:scientist'
      ],
      support: [
        'ultra:build-fixer',
        'ultra:designer',
        'ultra:writer',
        'ultra:document-specialist'
      ],
      team: [
        'ultra:team-lead',
        'ultra:team-implementer',
        'ultra:team-reviewer',
        'ultra:team-debugger'
      ]
    };
  }

  /**
   * Validate that all agents in the catalog have mappings
   */
  static validateCoverage(): {
    valid: boolean;
    unmapped: string[];
    total: number;
    mapped: number;
  } {
    this.ensureInitialized();

    const catalogAgents = Object.keys(AGENT_CATALOG);
    const mappedAgents = Object.keys(this.mappings!);
    const unmapped = catalogAgents.filter(agent => !mappedAgents.includes(agent));

    return {
      valid: unmapped.length === 0,
      unmapped,
      total: catalogAgents.length,
      mapped: mappedAgents.length
    };
  }

  /**
   * Ensure registry is initialized
   */
  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /**
   * Reset the registry (mainly for testing)
   */
  static reset(): void {
    this.mappings = null;
    this.initialized = false;
  }

  // ========================================================================
  // wshobson Agent Support Methods (NEW for integration)
  // ========================================================================

  /**
   * Register wshobson agent (NEW METHOD)
   */
  static registerWshobsonAgent(agent: any): void {
    // Basic validation
    if (!agent.name?.trim()) {
      throw new Error('Agent name is required');
    }

    // Check for duplicates
    if (this.wshobsonAgents.has(agent.name)) {
      console.warn(`[AgentRegistry] Duplicate agent name: ${agent.name}, overwriting`);
    }

    this.wshobsonAgents.set(agent.name, agent);
  }

  /**
   * Get wshobson agent by name (NEW METHOD)
   */
  static getWshobsonAgent(name: string): any | null {
    return this.wshobsonAgents.get(name) || null;
  }

  /**
   * List all wshobson agents (NEW METHOD)
   */
  static listWshobsonAgents(): any[] {
    return Array.from(this.wshobsonAgents.values());
  }

  /**
   * Load agents from cache (NEW METHOD)
   * Matches ACTUAL cache structure from .wshobson-cache.json
   */
  static loadFromCache(cache: WshobsonCache): void {
    for (const [pluginName, pluginData] of Object.entries(cache.plugins)) {
      for (const agent of pluginData.agents) {
        this.registerWshobsonAgent(agent);
      }
    }

    console.log(`[AgentRegistry] Loaded ${this.wshobsonAgents.size} wshobson agents from cache`);
  }

  /**
   * Get registry statistics
   */
  static getStats(): {
    totalAgents: number;
    byModel: Record<string, number>;
    bySkill: Record<string, number>;
  } {
    this.ensureInitialized();

    const byModel: Record<string, number> = { opus: 0, sonnet: 0, haiku: 0 };
    const bySkill: Record<string, number> = {};

    Object.values(this.mappings!).forEach(mapping => {
      byModel[mapping.model]++;
      bySkill[mapping.mapsTo] = (bySkill[mapping.mapsTo] || 0) + 1;
    });

    return {
      totalAgents: Object.keys(this.mappings!).length,
      byModel,
      bySkill
    };
  }
}

// Auto-initialize on module load
AgentRegistry.initialize();
