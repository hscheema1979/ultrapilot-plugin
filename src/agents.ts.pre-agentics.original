/**
 * Ultrapilot Agent Catalog
 *
 * Combines OMC's agent types with wshobson's parallel execution patterns.
 * All agents are invoked via the Task tool with appropriate model tiers.
 */

export interface AgentType {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  capabilities: string[];
}

export const AGENT_CATALOG: Record<string, AgentType> = {
  // === Core Orchestration ===
  'ultra:analyst': {
    name: 'Requirements Analyst',
    description: 'Extracts requirements, clarifies ambiguity, defines acceptance criteria',
    model: 'opus',
    capabilities: ['requirements-analysis', 'acceptance-criteria', 'clarification']
  },

  'ultra:architect': {
    name: 'System Architect',
    description: 'Designs system architecture, component boundaries, API contracts, technology stack',
    model: 'opus',
    capabilities: ['system-design', 'api-design', 'component-boundaries', 'tech-stack-selection']
  },

  'ultra:planner': {
    name: 'Implementation Planner',
    description: 'Creates detailed implementation plans with task breakdown and dependencies',
    model: 'opus',
    capabilities: ['task-breakdown', 'dependency-mapping', 'phased-planning']
  },

  'ultra:critic': {
    name: 'Plan Critic',
    description: 'Validates plans, identifies gaps, challenges assumptions',
    model: 'opus',
    capabilities: ['plan-validation', 'gap-analysis', 'assumption-challenging']
  },

  // === Implementation Agents ===
  'ultra:executor': {
    name: 'Executor (Sonnet)',
    description: 'Standard implementation tasks - moderate complexity',
    model: 'sonnet',
    capabilities: ['implementation', 'refactoring', 'feature-development']
  },

  'ultra:executor-low': {
    name: 'Executor (Haiku)',
    description: 'Simple implementation tasks - low complexity, single file',
    model: 'haiku',
    capabilities: ['simple-implementation', 'type-exports', 'minor-fixes']
  },

  'ultra:executor-high': {
    name: 'Executor (Opus)',
    description: 'Complex implementation tasks - architecture, multi-system integration',
    model: 'opus',
    capabilities: ['complex-implementation', 'architecture-refactoring', 'multi-system-integration']
  },

  // === Quality & Testing ===
  'ultra:test-engineer': {
    name: 'Test Engineer',
    description: 'Test strategy, coverage analysis, flaky-test hardening',
    model: 'sonnet',
    capabilities: ['test-strategy', 'coverage-analysis', 'test-hardening']
  },

  'ultra:verifier': {
    name: 'Completion Verifier',
    description: 'Evidence-backed verification of completion claims',
    model: 'sonnet',
    capabilities: ['verification', 'evidence-validation', 'completion-confirmation']
  },

  // === Review Agents ===
  'ultra:security-reviewer': {
    name: 'Security Reviewer',
    description: 'OWASP Top 10, authn/authz, injection vulnerabilities, security patterns',
    model: 'sonnet',
    capabilities: ['security-audit', 'vulnerability-detection', 'auth-validation']
  },

  'ultra:quality-reviewer': {
    name: 'Quality Reviewer',
    description: 'Performance, maintainability, algorithmic complexity, code smells',
    model: 'sonnet',
    capabilities: ['performance-analysis', 'maintainability-review', 'complexity-analysis']
  },

  'ultra:code-reviewer': {
    name: 'Code Reviewer',
    description: 'Comprehensive review: logic, maintainability, anti-patterns, API contracts',
    model: 'opus',
    capabilities: ['code-review', 'api-contract-validation', 'backward-compatibility']
  },

  // === Debugging & Analysis ===
  'ultra:debugger': {
    name: 'Debugger',
    description: 'Root-cause analysis, hypothesis-driven investigation, regression isolation',
    model: 'sonnet',
    capabilities: ['root-cause-analysis', 'hypothesis-testing', 'regression-detection']
  },

  'ultra:scientist': {
    name: 'Data Scientist',
    description: 'Statistical analysis, data patterns, metrics interpretation',
    model: 'sonnet',
    capabilities: ['statistical-analysis', 'data-interpretation', 'metrics-analysis']
  },

  // === Support Agents ===
  'ultra:build-fixer': {
    name: 'Build Fixer',
    description: 'Build failures, toolchain issues, type errors',
    model: 'sonnet',
    capabilities: ['build-troubleshooting', 'type-error-fixing', 'toolchain-issues']
  },

  'ultra:designer': {
    name: 'UX/UI Designer',
    description: 'UX architecture, interaction design, UI component structure',
    model: 'sonnet',
    capabilities: ['ux-design', 'interaction-design', 'ui-architecture']
  },

  'ultra:writer': {
    name: 'Technical Writer',
    description: 'Documentation, migration notes, user guides, API docs',
    model: 'haiku',
    capabilities: ['documentation', 'user-guides', 'api-documentation']
  },

  // === Wshobson-Inspired Parallel Agents ===
  'ultra:team-lead': {
    name: 'Team Lead',
    description: 'Team orchestration, work decomposition, lifecycle management',
    model: 'opus',
    capabilities: ['team-orchestration', 'work-decomposition', 'lifecycle-management']
  },

  'ultra:team-implementer': {
    name: 'Team Implementer',
    description: 'Parallel implementation with strict file ownership boundaries',
    model: 'sonnet',
    capabilities: ['parallel-implementation', 'file-ownership', 'conflict-avoidance']
  },

  'ultra:team-reviewer': {
    name: 'Team Reviewer',
    description: 'Multi-dimensional code review with deduplication',
    model: 'sonnet',
    capabilities: ['multi-dimensional-review', 'finding-deduplication', 'severity-consolidation']
  },

  'ultra:team-debugger': {
    name: 'Hypothesis Debugger',
    description: 'Competing hypotheses investigated in parallel',
    model: 'sonnet',
    capabilities: ['hypothesis-generation', 'parallel-investigation', 'evidence-ranking']
  },

  // === Documentation Specialist ===
  'ultra:document-specialist': {
    name: 'Documentation Specialist',
    description: 'External documentation lookup, reference research',
    model: 'sonnet',
    capabilities: ['external-docs', 'reference-lookup', 'documentation-research']
  }
};

/**
 * Get the appropriate model tier for an agent type
 * @deprecated Use AgentRegistry.getMapping(agentType)?.model instead
 */
export function getAgentModel(agentType: string): 'opus' | 'sonnet' | 'haiku' {
  return AGENT_CATALOG[agentType]?.model || 'sonnet';
}

/**
 * Get agent description
 * @deprecated Use AgentRegistry.getAgentInfo(agentType)?.description instead
 */
export function getAgentDescription(agentType: string): string {
  return AGENT_CATALOG[agentType]?.description || 'Unknown agent type';
}

/**
 * List all agent types by category
 * @deprecated Use AgentRegistry.getAgentsByCategory() instead
 */
export function listAgentsByCategory(category: 'orchestration' | 'implementation' | 'quality' | 'review' | 'debugging' | 'support' | 'team'): string[] {
  const categoryMap: Record<string, string[]> = {
    orchestration: ['ultra:analyst', 'ultra:architect', 'ultra:planner', 'ultra:critic'],
    implementation: ['ultra:executor', 'ultra:executor-low', 'ultra:executor-high'],
    quality: ['ultra:test-engineer', 'ultra:verifier'],
    review: ['ultra:security-reviewer', 'ultra:quality-reviewer', 'ultra:code-reviewer'],
    debugging: ['ultra:debugger', 'ultra:scientist'],
    support: ['ultra:build-fixer', 'ultra:designer', 'ultra:writer', 'ultra:document-specialist'],
    team: ['ultra:team-lead', 'ultra:team-implementer', 'ultra:team-reviewer', 'ultra:team-debugger']
  };

  return categoryMap[category] || [];
}

/**
 * Check if an agent type is valid
 * @deprecated Use AgentRegistry.isRegistered(agentType) instead
 */
export function isValidAgentType(agentType: string): boolean {
  return agentType in AGENT_CATALOG;
}
