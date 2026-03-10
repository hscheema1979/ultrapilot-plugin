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

  // === Domain Experts (Phase 1.5 Detailed Planning) ===
  'ultra:frontend-expert': {
    name: 'Frontend Expert',
    description: 'React, Vue, Angular, TypeScript, component architecture, state management, UI patterns',
    model: 'opus',
    capabilities: ['frontend-architecture', 'react', 'vue', 'angular', 'typescript', 'state-management', 'ui-components']
  },

  'ultra:backend-expert': {
    name: 'Backend Expert',
    description: 'Node.js, Python, Go, API design, microservices, WebSocket servers, REST, GraphQL',
    model: 'opus',
    capabilities: ['backend-architecture', 'nodejs', 'python', 'go', 'api-design', 'microservices', 'websocket', 'rest', 'graphql']
  },

  'ultra:database-expert': {
    name: 'Database Expert',
    description: 'PostgreSQL, MongoDB, Redis, schema design, migrations, indexing, query optimization',
    model: 'opus',
    capabilities: ['database-design', 'postgresql', 'mongodb', 'redis', 'sql', 'nosql', 'migrations', 'indexing', 'query-optimization']
  },

  'ultra:api-integration-expert': {
    name: 'API Integration Expert',
    description: 'I/O contracts, API boundaries, integration patterns, cross-domain communication, error handling',
    model: 'opus',
    capabilities: ['api-contracts', 'integration-design', 'io-boundaries', 'cross-domain-communication', 'error-handling']
  },

  'ultra:kubernetes-architect': {
    name: 'Kubernetes Architect',
    description: 'K8s deployments, services, ingress, Helm, Docker orchestration, containerization',
    model: 'opus',
    capabilities: ['kubernetes', 'docker', 'helm', 'deployment-strategies', 'containerization', 'orchestration']
  },

  'ultra:security-architect': {
    name: 'Security Architect',
    description: 'AuthN/AuthZ, encryption, OWASP, security patterns, threat modeling, secure design',
    model: 'opus',
    capabilities: ['security-design', 'authentication', 'authorization', 'encryption', 'threat-modeling', 'owasp']
  },

  'ultra:performance-expert': {
    name: 'Performance Expert',
    description: 'Caching strategies, load balancing, optimization, monitoring, performance tuning',
    model: 'sonnet',
    capabilities: ['performance-optimization', 'caching', 'load-balancing', 'monitoring', 'profiling']
  },

  'ultra:testing-expert': {
    name: 'Testing Expert',
    description: 'Test strategy, integration tests, E2E tests, coverage, test automation',
    model: 'sonnet',
    capabilities: ['test-strategy', 'integration-tests', 'e2e-tests', 'coverage', 'test-automation']
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
  },

  // === Agentic System Domain Experts ===
  'ultra:context-engineer': {
    name: 'Context Engineer',
    description: 'Manages context sharing, state synchronization, and information flow across multi-agent systems. Handles context window optimization, context compression, and context routing between agents.',
    model: 'opus',
    capabilities: ['context-management', 'state-synchronization', 'context-window-optimization', 'context-routing', 'multi-agent-coordination']
  },

  'ultra:ml-engineer': {
    name: 'ML Engineer',
    description: 'Machine learning model development, training pipelines, feature engineering, model evaluation, and deployment. Specializes in TensorFlow, PyTorch, scikit-learn, and ML infrastructure.',
    model: 'opus',
    capabilities: ['ml-model-development', 'training-pipelines', 'feature-engineering', 'model-evaluation', 'tensorflow', 'pytorch', 'scikit-learn', 'ml-infrastructure']
  },

  'ultra:mlops-engineer': {
    name: 'MLOps Engineer',
    description: 'Machine learning operations, model deployment, monitoring, CI/CD for ML, experiment tracking, model versioning, and ML infrastructure. Handles production ML systems at scale.',
    model: 'opus',
    capabilities: ['mlops', 'model-deployment', 'ml-monitoring', 'ml-cicd', 'experiment-tracking', 'model-versioning', 'ml-infrastructure', 'kubeflow', 'mlflow']
  },

  'ultra:conductor': {
    name: 'Conductor / Orchestrator',
    description: 'Multi-agent orchestration, workflow coordination, agent lifecycle management, task distribution, and result synthesis. Manages complex multi-agent workflows and ensures agents work together effectively.',
    model: 'opus',
    capabilities: ['agent-orchestration', 'workflow-coordination', 'agent-lifecycle-management', 'task-distribution', 'result-synthesis', 'multi-agent-workflows']
  },

  'ultra:agentic-architect': {
    name: 'Agentic Systems Architect',
    description: 'Designs agentic systems, multi-agent architectures, agent communication protocols, and coordination patterns. Experts in agent frameworks (LangChain, AutoGen, CrewAI) and agentic design patterns.',
    model: 'opus',
    capabilities: ['agentic-system-design', 'multi-agent-architecture', 'agent-communication', 'coordination-patterns', 'langchain', 'autogen', 'crewai', 'agent-frameworks']
  },

  'ultra:prompt-engineer': {
    name: 'Prompt Engineer',
    description: 'Prompt optimization, prompt engineering patterns, few-shot learning, chain-of-thought prompting, and prompt testing. Specializes in crafting effective prompts for LLMs and agentic systems.',
    model: 'sonnet',
    capabilities: ['prompt-engineering', 'prompt-optimization', 'few-shot-learning', 'chain-of-thought', 'prompt-testing', 'llm-interaction']
  }
};

/**
 * Get the appropriate model tier for an agent type
 */
export function getAgentModel(agentType: string): 'opus' | 'sonnet' | 'haiku' {
  return AGENT_CATALOG[agentType]?.model || 'sonnet';
}

/**
 * Get agent description
 */
export function getAgentDescription(agentType: string): string {
  return AGENT_CATALOG[agentType]?.description || 'Unknown agent type';
}

/**
 * List all agent types by category
 */
export function listAgentsByCategory(category: 'orchestration' | 'implementation' | 'quality' | 'review' | 'domain-experts' | 'debugging' | 'support' | 'team' | 'agentic-systems'): string[] {
  const categoryMap: Record<string, string[]> = {
    orchestration: ['ultra:analyst', 'ultra:architect', 'ultra:planner', 'ultra:critic'],
    implementation: ['ultra:executor', 'ultra:executor-low', 'ultra:executor-high'],
    quality: ['ultra:test-engineer', 'ultra:verifier'],
    review: ['ultra:security-reviewer', 'ultra:quality-reviewer', 'ultra:code-reviewer'],
    'domain-experts': ['ultra:frontend-expert', 'ultra:backend-expert', 'ultra:database-expert', 'ultra:api-integration-expert', 'ultra:kubernetes-architect', 'ultra:security-architect', 'ultra:performance-expert', 'ultra:testing-expert'],
    debugging: ['ultra:debugger', 'ultra:scientist'],
    support: ['ultra:build-fixer', 'ultra:designer', 'ultra:writer', 'ultra:document-specialist'],
    team: ['ultra:team-lead', 'ultra:team-implementer', 'ultra:team-reviewer', 'ultra:team-debugger'],
    'agentic-systems': ['ultra:context-engineer', 'ultra:ml-engineer', 'ultra:mlops-engineer', 'ultra:conductor', 'ultra:agentic-architect', 'ultra:prompt-engineer']
  };

  return categoryMap[category] || [];
}

/**
 * Load specialist agents from the agent library into AGENT_CATALOG
 *
 * Scans the agents-lib/plugins directory and merges all 113+ specialist agents
 * into the UltraPilot AGENT_CATALOG for use by orchestrator agents.
 *
 * @param pluginsDir - Path to agent library plugins directory (default: ./agents-lib/plugins)
 * @returns Number of agents loaded
 *
 * @example
 * ```typescript
 * import { loadWshobsonAgents, AGENT_CATALOG } from './agents.js';
 *
 * const count = await loadWshobsonAgents();
 * console.log(`Loaded ${count} specialist agents`);
 * console.log(`Total agents: ${Object.keys(AGENT_CATALOG).length}`);
 * ```
 */
export async function loadWshobsonAgents(
  pluginsDir: string = './agents-lib/plugins'
): Promise<number> {
  try {
    const { createInMemoryRepository } = await import('./agents-lib/repositories/index.js');
    const path = await import('path');
    const url = await import('url');

    // Resolve plugins directory relative to this file
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const resolvedPluginsDir = path.resolve(__dirname, pluginsDir);

    console.log(`[UltraPilot] Loading wshobson agents from: ${resolvedPluginsDir}`);

    // Create repository and scan plugins
    const repo = await createInMemoryRepository(resolvedPluginsDir);
    const agents = await repo.query({});

    let loaded = 0;
    for (const agent of agents) {
      const agentId = `agents-lib:${agent.name}`;

      // Map specialist agent to UltraPilot format
      AGENT_CATALOG[agentId] = {
        name: agent.name,
        description: agent.description,
        model: mapModelTier(agent.category),
        capabilities: agent.capabilities.map((c: any) => c.name)
      };

      loaded++;
    }

    console.log(`[UltraPilot] Loaded ${loaded} specialist agents into AGENT_CATALOG`);
    console.log(`[UltraPilot] Total agents in catalog: ${Object.keys(AGENT_CATALOG).length}`);

    return loaded;
  } catch (error) {
    console.error('[UltraPilot] Failed to load wshobson agents:', error);
    return 0;
  }
}

/**
 * Map wshobson category to UltraPilot model tier
 *
 * @param category - wshobson agent category
 * @returns Appropriate model tier for the category
 */
function mapModelTier(category: string): 'opus' | 'sonnet' | 'haiku' {
  const lower = category.toLowerCase();

  // Architecture/analysis -> opus (highest reasoning)
  if (lower.includes('architect') || lower.includes('analyst') || lower.includes('design')) {
    return 'opus';
  }

  // Implementation/development -> sonnet (balanced)
  if (lower.includes('developer') || lower.includes('pro') || lower.includes('engineer')) {
    return 'sonnet';
  }

  // Simple/documentation tasks -> haiku (fastest)
  if (lower.includes('writer') || lower.includes('document')) {
    return 'haiku';
  }

  // Default to sonnet for unknown categories
  return 'sonnet';
}

/**
 * Initialize UltraPilot with all agents
 *
 * Loads UltraPilot's core agents plus all specialist agents from the agent library.
 * This should be called once at startup to make all agents available.
 *
 * @param options - Configuration options
 * @returns Total number of agents loaded
 *
 * @example
 * ```typescript
 * import { initializeUltraPilot, AGENT_CATALOG } from './agents.js';
 *
 * const total = await initializeUltraPilot({
 *   loadWshobson: true,
 *   wshobsonPluginsDir: './agents-lib/plugins'
 * });
 *
 * console.log(`Initialized ${total} agents`);
 * console.log(`Available: ${Object.keys(AGENT_CATALOG).join(', ')}`);
 * ```
 */
export async function initializeUltraPilot(options?: {
  loadWshobson?: boolean;
  wshobsonPluginsDir?: string;
}): Promise<number> {
  const { loadWshobson = true, wshobsonPluginsDir = './agents-lib/plugins' } = options || {};

  console.log('[UltraPilot] Initializing agent catalog...');

  // Count core UltraPilot agents
  const coreAgentCount = Object.keys(AGENT_CATALOG).length;
  console.log(`[UltraPilot] Loaded ${coreAgentCount} core UltraPilot agents`);

  // Load wshobson agents if requested
  let wshobsonAgentCount = 0;
  if (loadWshobson) {
    try {
      wshobsonAgentCount = await loadWshobsonAgents(wshobsonPluginsDir);
    } catch (error) {
      console.warn('[UltraPilot] Failed to load wshobson agents:', error);
      console.warn('[UltraPilot] Continuing with core agents only');
    }
  }

  const total = coreAgentCount + wshobsonAgentCount;
  console.log(`[UltraPilot] Initialization complete: ${total} agents available`);

  return total;
}

/**
 * Auto-initialize UltraPilot when module loads (optional convenience)
 *
 * This is automatically called when the agents module is imported,
 * unless ULTRAPILOT_AUTO_INIT env var is set to 'false'.
 *
 * To disable auto-initialization:
 *   ULTRAPILOT_AUTO_INIT=false node your-app.js
 */
let _initialized = false;
export async function ensureInitialized(): Promise<number> {
  if (!_initialized) {
    const autoInit = process.env.ULTRAPILOT_AUTO_INIT !== 'false';
    if (autoInit) {
      const total = await initializeUltraPilot({ loadWshobson: true });
      _initialized = true;
      return total;
    }
  }
  return Object.keys(AGENT_CATALOG).length;
}
