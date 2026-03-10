/**
 * wshobson Agent Selector
 *
 * Intelligent agent selection system that analyzes tasks and selects the best agent
 * based on capability matching, success rates, and category fit.
 *
 * Key features:
 * - Task analysis with capability extraction
 * - Multi-factor agent scoring (capability match + success rate + category fit)
 * - Confidence calculation with fallback chains
 * - Support for complexity-based selection
 *
 * @module wshobson/selector
 */

import type {
  Agent,
  IAgentRepository,
  Capability,
} from './types.js';

/**
 * Options for agent selection
 */
export interface SelectionOptions {
  /** Return top N candidates (default: 1) */
  maxAgents?: number;
  /** Minimum confidence to select an agent (default: 0.3) */
  minConfidence?: number;
  /** Generate fallback chain for selected agent (default: true) */
  fallbackChain?: boolean;
  /** Weight historical success rate in scoring (default: true) */
  considerSuccessRate?: boolean;
  /** Prefer idle agents for load balancing (default: true) */
  preferIdle?: boolean;
  /** Filter by agent category (optional) */
  category?: string;
}

/**
 * Result of agent selection
 */
export interface AgentSelection {
  /** Primary selected agent */
  agent: Agent;
  /** Confidence score (0-1) */
  confidence: number;
  /** Human-readable reasoning for selection */
  reasoning: string;
  /** Fallback agents if primary fails (ordered by priority) */
  fallbackChain: Agent[];
  /** Alternative agents that scored well */
  alternatives: Agent[];
  /** Task analysis details */
  taskAnalysis: TaskAnalysis;
}

/**
 * Result of analyzing a task description
 */
export interface TaskAnalysis {
  /** Required capabilities extracted from task */
  capabilities: string[];
  /** Detected task category (if any) */
  category?: string;
  /** Estimated task complexity */
  complexity: 'simple' | 'medium' | 'complex';
  /** Key phrases that influenced the analysis */
  keyPhrases: string[];
}

/**
 * Score breakdown for an agent
 */
interface AgentScore {
  agent: Agent;
  totalScore: number;
  capabilityScore: number;
  successRateScore: number;
  categoryScore: number;
  statusScore: number;
  confidence: number;
}

/**
 * Capability match result
 */
interface CapabilityMatch {
  capability: string;
  matchType: 'exact' | 'partial' | 'none';
  score: number;
  matchedBy?: Capability;
}

/**
 * Task complexity indicators
 */
const COMPLEXITY_PATTERNS = {
  simple: [
    'simple', 'basic', 'quick', 'easy', 'single', 'one',
    'straightforward', 'minor', 'small', 'trivial'
  ],
  complex: [
    'complex', 'complicated', 'advanced', 'multiple', 'integrate',
    'architecture', 'system', 'comprehensive', 'end-to-end',
    'full-stack', 'microservice', 'distributed', 'scalable'
  ]
};

/**
 * Keyword to capability mapping for extraction
 */
const KEYWORD_CAPABILITY_MAP: Record<string, string[]> = {
  // Backend capabilities
  'api': ['api', 'rest-api', 'backend'],
  'backend': ['backend', 'api'],
  'database': ['database', 'sql', 'nosql'],
  'sql': ['sql', 'database'],
  'nosql': ['nosql', 'database', 'mongodb'],
  'mongodb': ['nosql', 'database', 'mongodb'],
  'postgresql': ['sql', 'database', 'postgresql'],
  'auth': ['authentication', 'security'],
  'authentication': ['authentication', 'security'],
  'security': ['security', 'authentication'],
  'migration': ['database-migration', 'database'],

  // Frontend capabilities
  'frontend': ['frontend', 'ui'],
  'ui': ['ui', 'frontend'],
  'react': ['frontend', 'react', 'ui'],
  'vue': ['frontend', 'vue', 'ui'],
  'angular': ['frontend', 'angular', 'ui'],
  'component': ['ui', 'frontend'],
  'css': ['frontend', 'css'],
  'responsive': ['frontend', 'ui', 'responsive'],

  // DevOps capabilities
  'deploy': ['deployment', 'devops'],
  'deployment': ['deployment', 'devops'],
  'docker': ['docker', 'devops'],
  'kubernetes': ['kubernetes', 'devops'],
  'ci/cd': ['ci-cd', 'devops'],
  'cicd': ['ci-cd', 'devops'],
  'ci-cd': ['ci-cd', 'devops'],

  // Testing capabilities
  'test': ['testing', 'unit-test'],
  'testing': ['testing', 'unit-test'],
  'unit test': ['unit-test', 'testing'],
  'integration test': ['integration-test', 'testing'],
  'e2e': ['e2e-testing', 'testing'],

  // Documentation capabilities
  'document': ['documentation', 'writing'],
  'documentation': ['documentation', 'writing'],
  'readme': ['documentation', 'writing'],
  'api doc': ['api-documentation', 'documentation'],

  // Code quality
  'refactor': ['refactoring', 'code-quality'],
  'optimization': ['optimization', 'performance'],
  'performance': ['optimization', 'performance'],
  'review': ['code-review', 'quality'],
  'lint': ['linting', 'code-quality'],

  // Analysis capabilities
  'analyze': ['analysis', 'code-analysis'],
  'analysis': ['analysis', 'code-analysis'],
  'debug': ['debugging', 'troubleshooting'],
  'troubleshoot': ['troubleshooting', 'debugging'],
  'fix': ['bug-fix', 'debugging'],
  'bug': ['bug-fix', 'debugging'],

  // Architecture capabilities
  'architecture': ['architecture', 'system-design'],
  'design': ['design', 'architecture'],
  'pattern': ['design-patterns', 'architecture'],
  'structure': ['architecture', 'code-structure'],

  // Data capabilities
  'data': ['data-processing', 'data-analysis'],
  'etl': ['etl', 'data-processing'],
  'data-pipeline': ['data-pipeline', 'data-processing'],

  // Business capabilities
  'requirement': ['requirements-analysis', 'business-analysis'],
  'business': ['business-analysis', 'requirements-analysis'],
  'spec': ['specification', 'requirements-analysis'],
  'user story': ['user-stories', 'requirements-analysis'],
};

/**
 * Category keywords for extraction
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'backend': ['backend', 'api', 'server', 'database', 'microservice'],
  'frontend': ['frontend', 'ui', 'ux', 'component', 'interface'],
  'devops': ['deploy', 'docker', 'kubernetes', 'ci-cd', 'infrastructure'],
  'testing': ['test', 'testing', 'qa', 'e2e', 'integration'],
  'documentation': ['document', 'readme', 'api-doc', 'guide'],
  'analysis': ['analyze', 'analysis', 'investigate', 'research'],
  'architecture': ['architecture', 'design', 'pattern', 'structure'],
  'quality': ['review', 'refactor', 'quality', 'optimization'],
  'security': ['security', 'auth', 'vulnerability', 'penetration'],
};

/**
 * Agent Selector class
 *
 * Analyzes task descriptions and selects the best agent based on:
 * 1. Capability matching (exact > partial > none)
 * 2. Historical success rate
 * 3. Category fit
 * 4. Current status (prefer idle agents)
 */
export class AgentSelector {
  /**
   * Create a new AgentSelector
   *
   * @param repository - Agent repository for querying agents
   */
  constructor(private repository: IAgentRepository) {}

  /**
   * Select the best agent for a given task
   *
   * @param task - Task description
   * @param options - Selection options
   * @returns Agent selection with confidence and reasoning
   *
   * @example
   * ```typescript
   * const selector = new AgentSelector(repository);
   * const selection = await selector.selectAgent(
   *   "Create a REST API for user management",
   *   { maxAgents: 3, fallbackChain: true }
   * );
   *
   * console.log(`Selected: ${selection.agent.name}`);
   * console.log(`Confidence: ${selection.confidence}`);
   * console.log(`Reasoning: ${selection.reasoning}`);
   * ```
   */
  async selectAgent(
    task: string,
    options: SelectionOptions = {}
  ): Promise<AgentSelection> {
    // Apply default options
    const opts: Required<SelectionOptions> = {
      maxAgents: options.maxAgents ?? 1,
      minConfidence: options.minConfidence ?? 0.3,
      fallbackChain: options.fallbackChain ?? true,
      considerSuccessRate: options.considerSuccessRate ?? true,
      preferIdle: options.preferIdle ?? true,
      category: options.category ?? '' as string,
    };

    // Step 1: Analyze the task
    const taskAnalysis = this.analyzeTask(task);

    // Step 2: Find candidate agents
    const candidates = await this.findCandidates(taskAnalysis, opts);

    if (candidates.length === 0) {
      throw new Error(`No agents found matching task requirements: ${taskAnalysis.capabilities.join(', ')}`);
    }

    // Step 3: Score candidates
    const scored = this.scoreCandidates(candidates, taskAnalysis, opts);

    // Step 4: Select best agent(s)
    const selected = scored.slice(0, opts.maxAgents);

    const primary = selected[0];
    const fallbackChain = opts.fallbackChain
      ? this.buildFallbackChain(scored, primary, opts)
      : [];

    // Step 5: Generate reasoning
    const reasoning = this.generateReasoning(primary, taskAnalysis, candidates.length);

    // Step 6: Generate alternatives (next best candidates after primary)
    const alternatives = scored
      .slice(opts.maxAgents, opts.maxAgents + 5)
      .map(s => s.agent);

    return {
      agent: primary.agent,
      confidence: primary.confidence,
      reasoning,
      fallbackChain,
      alternatives,
      taskAnalysis,
    };
  }

  /**
   * Analyze a task description to extract requirements
   *
   * Extracts capabilities, category, and complexity from natural language.
   *
   * @param task - Task description
   * @returns Task analysis with extracted metadata
   *
   * @example
   * ```typescript
   * const analysis = selector.analyzeTask("Create a simple REST API");
   * console.log(analysis);
   * // {
   * //   capabilities: ['api', 'rest-api', 'backend'],
   * //   complexity: 'simple',
   * //   keyPhrases: ['simple', 'rest', 'api']
   * // }
   * ```
   */
  analyzeTask(task: string): TaskAnalysis {
    const lowerTask = task.toLowerCase();
    const words = lowerTask.split(/\s+/);

    // Extract capabilities using keyword mapping
    const capabilities = this.extractCapabilities(task, words);

    // Detect category
    const category = this.detectCategory(lowerTask);

    // Determine complexity
    const complexity = this.determineComplexity(lowerTask);

    // Extract key phrases
    const keyPhrases = this.extractKeyPhrases(task, lowerTask);

    return {
      capabilities,
      category,
      complexity,
      keyPhrases,
    };
  }

  /**
   * Extract capabilities from task description
   *
   * Uses keyword mapping to find relevant capabilities.
   * Supports multi-word phrases like "integration test".
   */
  private extractCapabilities(task: string, words: string[]): string[] {
    const capabilities = new Set<string>();

    // Check for multi-word phrases first (longest match first)
    const sortedKeywords = Object.entries(KEYWORD_CAPABILITY_MAP)
      .sort((a, b) => b[0].length - a[0].length); // Sort by length descending

    for (const [keyword, caps] of sortedKeywords) {
      if (task.toLowerCase().includes(keyword)) {
        caps.forEach(cap => capabilities.add(cap));
      }
    }

    // If no capabilities found, use general capability
    if (capabilities.size === 0) {
      capabilities.add('general');
    }

    return Array.from(capabilities);
  }

  /**
   * Detect task category from keywords
   */
  private detectCategory(task: string): string | undefined {
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (task.includes(keyword)) {
          return category;
        }
      }
    }
    return undefined;
  }

  /**
   * Determine task complexity from description
   */
  private determineComplexity(task: string): 'simple' | 'medium' | 'complex' {
    // Check for complex indicators
    for (const pattern of COMPLEXITY_PATTERNS.complex) {
      if (task.includes(pattern)) {
        return 'complex';
      }
    }

    // Check for simple indicators
    for (const pattern of COMPLEXITY_PATTERNS.simple) {
      if (task.includes(pattern)) {
        return 'simple';
      }
    }

    // Default to medium
    return 'medium';
  }

  /**
   * Extract key phrases that influenced the analysis
   */
  private extractKeyPhrases(task: string, lowerTask: string): string[] {
    const phrases: string[] = [];

    // Extract capability-related phrases
    for (const keyword of Object.keys(KEYWORD_CAPABILITY_MAP)) {
      if (lowerTask.includes(keyword)) {
        // Extract the phrase with context
        const regex = new RegExp(`.{0,20}${keyword}.{0,20}`, 'gi');
        const matches = task.match(regex);
        if (matches) {
          phrases.push(...matches.map(m => m.trim()));
        }
      }
    }

    // Extract complexity indicators
    for (const pattern of [...COMPLEXITY_PATTERNS.simple, ...COMPLEXITY_PATTERNS.complex]) {
      if (lowerTask.includes(pattern)) {
        phrases.push(pattern);
      }
    }

    return phrases;
  }

  /**
   * Find candidate agents for the task
   */
  private async findCandidates(
    analysis: TaskAnalysis,
    options: Required<SelectionOptions>
  ): Promise<Agent[]> {
    const queryOptions: Parameters<IAgentRepository['query']>[0] = {};

    // Filter by capabilities if specified
    if (analysis.capabilities.length > 0) {
      queryOptions.capabilities = analysis.capabilities;
    }

    // Filter by category if specified
    if (options.category) {
      queryOptions.category = options.category;
    } else if (analysis.category) {
      queryOptions.category = analysis.category;
    }

    // Prefer idle agents if option enabled
    if (options.preferIdle) {
      queryOptions.status = 'idle';
    }

    // Query repository
    let candidates = await this.repository.query(queryOptions);

    // If no candidates with strict filters, relax filters
    if (candidates.length === 0) {
      // Try without status filter
      delete queryOptions.status;
      candidates = await this.repository.query(queryOptions);

      // If still no candidates, try without category
      if (candidates.length === 0) {
        delete queryOptions.category;
        candidates = await this.repository.query(queryOptions);
      }
    }

    return candidates;
  }

  /**
   * Score candidates based on multiple factors
   */
  private scoreCandidates(
    candidates: Agent[],
    analysis: TaskAnalysis,
    options: Required<SelectionOptions>
  ): AgentScore[] {
    const scores: AgentScore[] = [];

    for (const agent of candidates) {
      const capabilityScore = this.calculateCapabilityScore(agent, analysis);
      const categoryScore = this.calculateCategoryScore(agent, analysis);
      const statusScore = this.calculateStatusScore(agent, options);
      const successRateScore = agent.successRate;

      // Weighted combination
      const weights = {
        capability: 0.5,
        successRate: options.considerSuccessRate ? 0.3 : 0.0,
        category: 0.1,
        status: 0.1,
      };

      const totalScore =
        (capabilityScore * weights.capability) +
        (successRateScore * weights.successRate) +
        (categoryScore * weights.category) +
        (statusScore * weights.status);

      // Normalize to 0-1 range
      const normalizedScore = Math.min(1, Math.max(0, totalScore));

      scores.push({
        agent,
        totalScore: normalizedScore,
        capabilityScore,
        successRateScore,
        categoryScore,
        statusScore,
        confidence: this.calculateConfidence(normalizedScore, analysis),
      });
    }

    // Sort by total score (descending)
    return scores.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Calculate capability match score
   *
   * Scoring:
   * - Exact match: 1.0
   * - Partial match: 0.5-0.9 based on overlap
   * - No match: 0.0
   */
  private calculateCapabilityScore(agent: Agent, analysis: TaskAnalysis): number {
    if (analysis.capabilities.length === 0) {
      return 0.5; // Neutral score if no capabilities specified
    }

    const agentCaps = agent.capabilities.map(c => c.name);
    let totalScore = 0;
    let matchCount = 0;

    for (const requiredCap of analysis.capabilities) {
      const match = this.matchCapability(requiredCap, agentCaps);
      totalScore += match.score;
      if (match.score > 0) {
        matchCount++;
      }
    }

    // Average score across all required capabilities
    const avgScore = totalScore / analysis.capabilities.length;

    // Boost score if agent has high confidence in matched capabilities
    if (matchCount > 0) {
      const avgConfidence = this.getAverageCapabilityConfidence(agent, analysis.capabilities);
      return avgScore * (0.8 + avgConfidence * 0.2); // 0.8-1.0 range based on confidence
    }

    return avgScore;
  }

  /**
   * Match a single required capability against agent capabilities
   */
  private matchCapability(
    required: string,
    agentCapabilities: string[]
  ): { matchType: 'exact' | 'partial' | 'none'; score: number } {
    // Exact match
    if (agentCapabilities.includes(required)) {
      return { matchType: 'exact', score: 1.0 };
    }

    // Partial match (hierarchical or substring)
    for (const agentCap of agentCapabilities) {
      const lowerRequired = required.toLowerCase();
      const lowerAgentCap = agentCap.toLowerCase();

      // Hierarchical match (e.g., "api" matches "rest-api")
      if (lowerAgentCap.includes(lowerRequired) || lowerRequired.includes(lowerAgentCap)) {
        return { matchType: 'partial', score: 0.7 };
      }

      // Word overlap (e.g., "rest-api" matches "api")
      const requiredWords = lowerRequired.split(/[-\s]+/);
      const agentWords = lowerAgentCap.split(/[-\s]+/);
      const overlap = requiredWords.filter(w => agentWords.includes(w)).length;

      if (overlap > 0) {
        return { matchType: 'partial', score: 0.5 + (overlap / Math.max(requiredWords.length, agentWords.length)) * 0.3 };
      }
    }

    return { matchType: 'none', score: 0.0 };
  }

  /**
   * Get average confidence for capabilities that match
   */
  private getAverageCapabilityConfidence(agent: Agent, requiredCaps: string[]): number {
    const confidences: number[] = [];

    for (const cap of agent.capabilities) {
      if (requiredCaps.includes(cap.name)) {
        confidences.push(cap.confidence);
      }
    }

    if (confidences.length === 0) {
      return 0.5; // Default confidence
    }

    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  /**
   * Calculate category fit score
   */
  private calculateCategoryScore(agent: Agent, analysis: TaskAnalysis): number {
    if (!analysis.category) {
      return 0.5; // Neutral if no category detected
    }

    // Exact match
    if (agent.category === analysis.category) {
      return 1.0;
    }

    // Partial match (category names might be related)
    const agentCatLower = agent.category.toLowerCase();
    const taskCatLower = analysis.category.toLowerCase();

    if (agentCatLower.includes(taskCatLower) || taskCatLower.includes(agentCatLower)) {
      return 0.7;
    }

    return 0.3; // Low score for mismatched category
  }

  /**
   * Calculate status score (prefer idle agents)
   */
  private calculateStatusScore(agent: Agent, options: Required<SelectionOptions>): number {
    if (!options.preferIdle) {
      return 1.0; // Don't consider status
    }

    switch (agent.status) {
      case 'idle':
        return 1.0;
      case 'working':
        return 0.5;
      case 'failed':
        return 0.2;
      default:
        return 0.5;
    }
  }

  /**
   * Calculate confidence score based on total score and task complexity
   */
  private calculateConfidence(totalScore: number, analysis: TaskAnalysis): number {
    let confidence = totalScore;

    // Adjust confidence based on complexity
    switch (analysis.complexity) {
      case 'simple':
        // High confidence for simple tasks
        confidence = Math.min(1.0, confidence + 0.1);
        break;
      case 'complex':
        // Lower confidence for complex tasks
        confidence = Math.max(0.0, confidence - 0.15);
        break;
      case 'medium':
        // No adjustment for medium complexity
        break;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Build fallback chain for selected agent
   *
   * Creates ordered list of alternative agents to try if primary fails.
   */
  private buildFallbackChain(
    scored: AgentScore[],
    primary: AgentScore,
    options: Required<SelectionOptions>
  ): Agent[] {
    const chain: Agent[] = [];

    // Add agents with confidence >= 0.5
    for (const score of scored) {
      if (score.agent.name !== primary.agent.name && score.confidence >= 0.5) {
        chain.push(score.agent);

        // Limit fallback chain to 5 agents
        if (chain.length >= 5) {
          break;
        }
      }
    }

    return chain;
  }

  /**
   * Generate human-readable reasoning for selection
   */
  private generateReasoning(
    selected: AgentScore,
    analysis: TaskAnalysis,
    candidateCount: number
  ): string {
    const parts: string[] = [];

    // Agent name and category
    parts.push(`Selected "${selected.agent.name}" (${selected.agent.category})`);

    // Capability match
    const matchedCaps = analysis.capabilities.filter(cap =>
      selected.agent.capabilities.some(ac => ac.name === cap)
    );

    if (matchedCaps.length > 0) {
      parts.push(`with capabilities: ${matchedCaps.join(', ')}`);
    }

    // Score breakdown
    parts.push(
      `(capability: ${(selected.capabilityScore * 100).toFixed(0)}%, ` +
      `success rate: ${(selected.successRateScore * 100).toFixed(0)}%, ` +
      `category: ${(selected.categoryScore * 100).toFixed(0)}%)`
    );

    // Complexity
    parts.push(`for ${analysis.complexity} task`);

    // Candidate pool
    parts.push(`from ${candidateCount} candidates`);

    return parts.join(' ');
  }

  /**
   * Get multiple top candidates without selecting
   *
   * Useful for displaying options to users.
   *
   * @param task - Task description
   * @param limit - Maximum number of candidates to return
   * @returns Array of scored candidates
   */
  async getCandidates(task: string, limit = 5): Promise<AgentScore[]> {
    const analysis = this.analyzeTask(task);
    const candidates = await this.findCandidates(analysis, {
      maxAgents: limit,
      minConfidence: 0.0,
      fallbackChain: false,
      considerSuccessRate: true,
      preferIdle: true,
      category: '',
    });

    const scored = this.scoreCandidates(candidates, analysis, {
      maxAgents: limit,
      minConfidence: 0.0,
      fallbackChain: false,
      considerSuccessRate: true,
      preferIdle: true,
      category: '',
    });

    return scored.slice(0, limit);
  }
}

/**
 * Create an AgentSelector with default options
 *
 * @param repository - Agent repository
 * @returns Configured agent selector
 */
export function createAgentSelector(repository: IAgentRepository): AgentSelector {
  return new AgentSelector(repository);
}
