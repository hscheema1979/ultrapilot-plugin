/**
 * Domain Initializer - Setup autonomous domain in a workspace
 *
 * Creates .ultra/ directory structure, domain.json configuration,
 * initializes queues, routines, and prepares for autoloop.
 *
 * Each workspace = one autonomous domain
 * One-time setup per workspace
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { existsSync } from 'fs';
import { AGENT_CATALOG, AgentType } from '../agents.js';

/**
 * Agent definition with explicit agentic structure
 */
export interface AgentDefinition {
  name: string;
  role: string;
  model: 'opus' | 'sonnet' | 'haiku';
  capabilities: string[];
  ownership: string[];
  autonomous?: boolean;
  coordination?: boolean;
  parallel?: boolean;
  reviewer?: boolean;
  debugger?: boolean;
  vetoPower?: boolean;
}

/**
 * Routine definition with task list
 */
export interface RoutineDefinition {
  name: string;
  schedule: string;
  enabled: boolean;
  agent: string;
  tasks: string[];
  timeout?: number;
  onFailure?: 'log-and-continue' | 'alert-and-escalate' | 'retry' | 'halt';
}

/**
 * Quality gate definition
 */
export interface QualityGateDefinition {
  name: string;
  enabled: boolean;
  checks: string[];
}

/**
 * Domain configuration with explicit agentic structure
 */
export interface DomainConfig {
  domainId: string;
  name: string;
  type: string;
  description: string;

  stack: {
    language: string;
    framework: string;
    packageManager: string;
    testing: string;
    versionControl: string;
    mainBranch: string;
  };

  agents: AgentDefinition[];

  routing: {
    rules: Array<{
      pattern: string;
      agent: string;
    }>;
    priority: 'fifo' | 'priority-based' | 'weighted';
    ownership: 'auto-assign' | 'manual' | 'round-robin';
  };

  priorityMatrix: {
    levels: string[];
    rules: Record<string, string[]>;
  };

  routines: RoutineDefinition[];

  queues: {
    intake: string;
    'in-progress': string;
    review: string;
    completed: string;
    failed: string;
  };

  qualityGates: QualityGateDefinition[];

  autoloop: {
    enabled: boolean;
    cycleTime: string;
    mode: string;
    heartbeatFile: string;
  };

  workspace: string;
  [key: string]: any; // Allow domain-specific fields like tradingParameters, developmentParameters
}

/**
 * Domain initialization options
 */
export interface DomainInitOptions {
  name: string;
  description: string;
  type: string;

  language: string;
  framework: string;
  packageManager: string;
  testing: string;

  agents: string[]; // Agent names (will be expanded to full definitions)
  routines?: Array<{ name: string; schedule: string; agent?: string; tasks?: string[] }>;

  domainParameters?: Record<string, any>; // Domain-specific params (tradingParameters, developmentParameters, etc.)

  autoloopCycleTime?: number;
}

/**
 * Domain validation result
 */
export interface DomainValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Domain Initializer class
 */
export class DomainInitializer {
  private workspacePath: string;
  private ultraPath: string;

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
    this.ultraPath = path.join(workspacePath, '.ultra');
  }

  /**
   * Check if domain is already initialized
   */
  isInitialized(): boolean {
    return existsSync(path.join(this.ultraPath, 'state', 'initialized'));
  }

  /**
   * Validate environment before setup
   */
  async validateEnvironment(): Promise<DomainValidation> {
    const result: DomainValidation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check write permissions
    try {
      await fs.access(this.workspacePath, fs.constants.W_OK);
    } catch {
      result.valid = false;
      result.errors.push('No write permission for current directory');
    }

    // Check git repository
    const gitPath = path.join(this.workspacePath, '.git');
    if (!existsSync(gitPath)) {
      result.warnings.push('Not a git repository. Run: git init');
    }

    // Check package manager
    const hasNpm = await this.commandExists('npm');
    const hasYarn = await this.commandExists('yarn');
    const hasPnpm = await this.commandExists('pnpm');

    if (!hasNpm && !hasYarn && !hasPnpm) {
      result.warnings.push('No package manager found (npm/yarn/pnpm)');
    }

    return result;
  }

  /**
   * Initialize domain with configuration
   */
  async initialize(options: DomainInitOptions): Promise<void> {
    // Validate environment first
    const validation = await this.validateEnvironment();
    if (!validation.valid) {
      throw new Error(`Domain validation failed:\n${validation.errors.join('\n')}`);
    }

    // Check if already initialized
    if (this.isInitialized()) {
      throw new Error('Domain already initialized. Use --reconfigure to change settings.');
    }

    // Create directory structure
    await this.createDirectoryStructure();

    // Generate domain configuration
    const config = this.generateDomainConfig(options);

    // Write configuration files
    await this.writeConfiguration(config);

    // Create initialized flag
    await fs.writeFile(
      path.join(this.ultraPath, 'state', 'initialized'),
      new Date().toISOString()
    );

    // Set file permissions
    await this.setFilePermissions();

    console.log('✅ Domain initialized successfully');
    console.log(`   Domain: ${config.name}`);
    console.log(`   ID: ${config.domainId}`);
    console.log(`   Type: ${config.type}`);
    console.log(`   Agents: ${config.agents.length} configured`);
    console.log(`   Routines: ${config.routines.length} scheduled`);
    console.log('');
    console.log('📋 Organizational Hierarchy:');
    console.log('   CEO: You (Vision & Goals)');
    console.log('   COO: Claude Code CLI (Architecture & Resources)');
    console.log('   UltraLead: Domain Manager');
    console.log('   Autoloop: VP of Operations (Heartbeat)');
    console.log('   UltraWorkers: Autonomous Agents');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review domain.json configuration');
    console.log('  2. Start autoloop: /ultra-autoloop start');
    console.log('  3. Add tasks to intake queue');
    console.log('  4. Use /ultrapilot for feature development');
    console.log('');
    console.log('🪨 The boulder never stops.');
  }

  /**
   * Create .ultra/ directory structure
   */
  private async createDirectoryStructure(): Promise<void> {
    const dirs = [
      this.ultraPath,
      path.join(this.ultraPath, 'queues'),
      path.join(this.ultraPath, 'routines'),
      path.join(this.ultraPath, 'state'),
      path.join(this.ultraPath, 'shared')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Generate domain configuration from options
   */
  private generateDomainConfig(options: DomainInitOptions): DomainConfig {
    const domainId = `domain-${options.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    // Expand agent names to full definitions
    const agents = this.expandAgentDefinitions(options.agents);

    const config: DomainConfig = {
      domainId,
      name: options.name,
      type: options.type,
      description: options.description,

      stack: {
        language: options.language,
        framework: options.framework,
        packageManager: options.packageManager,
        testing: options.testing,
        versionControl: 'git',
        mainBranch: 'main'
      },

      agents,

      routing: {
        rules: this.getDefaultRoutingRules(options.agents),
        priority: 'priority-based',
        ownership: 'auto-assign'
      },

      priorityMatrix: this.getDefaultPriorityMatrix(),

      routines: this.generateRoutines(options.routines, options.agents),

      queues: {
        intake: 'queues/intake.json',
        'in-progress': 'queues/in-progress.json',
        review: 'queues/review.json',
        completed: 'queues/completed.json',
        failed: 'queues/failed.json'
      },

      qualityGates: this.getDefaultQualityGates(),

      autoloop: {
        enabled: true,
        cycleTime: `${options.autoloopCycleTime || 30}s`,
        mode: 'continuous',
        heartbeatFile: '.ultra/state/autoloop.json'
      },

      workspace: this.workspacePath,

      ...options.domainParameters // Allow domain-specific parameters
    };

    return config;
  }

  /**
   * Expand agent names to full definitions with explicit agentic structure
   */
  private expandAgentDefinitions(agentNames: string[]): AgentDefinition[] {
    return agentNames.map(name => {
      const def = this.getAgentMetadata(name);
      return {
        name,
        role: def.role,
        model: def.model,
        capabilities: def.capabilities,
        ownership: def.ownership,
        autonomous: def.autonomous,
        ...def.flags
      };
    });
  }

  /**
   * Get agent metadata from AGENT_CATALOG
   */
  private getAgentMetadata(agentName: string): {
    role: string;
    model: 'opus' | 'sonnet' | 'haiku';
    capabilities: string[];
    ownership: string[];
    autonomous: boolean;
    flags?: Record<string, boolean>;
  } {
    // Import from comprehensive agent catalog (173+ agents)
    const agent = AGENT_CATALOG[agentName];

    if (!agent) {
      // Return default for unknown agents
      return {
        role: 'General Agent',
        model: 'sonnet',
        capabilities: ['general-purpose'],
        ownership: [],
        autonomous: false
      };
    }

    // Map AgentType to domain initializer format
    const metadata: any = {
      role: this.inferRoleFromDescription(agent.description),
      model: agent.model,
      capabilities: agent.capabilities,
      ownership: this.inferOwnershipFromAgentName(agentName),
      autonomous: this.inferAutonomyFromModel(agent.model)
    };

    // Add flags based on agent type
    if (agent.name.includes('lead') || agent.name.includes('orchestrator') || agent.name.includes('coordinator')) {
      metadata.flags = { coordination: true };
    } else if (agent.name.includes('implementer') || agent.name.includes('builder')) {
      metadata.flags = { parallel: true };
    } else if (agent.name.includes('reviewer') || agent.name.includes('auditor')) {
      metadata.flags = { reviewer: true };
      if (agent.name.includes('security') || agent.name.includes('risk') || agent.name.includes('safety')) {
        metadata.flags.vetoPower = true;
      }
    } else if (agent.name.includes('debugger') || agent.name.includes('diagnostics')) {
      metadata.flags = { debugger: true };
    }

    return metadata;
  }

  /**
   * Infer role from agent description
   */
  private inferRoleFromDescription(description: string): string {
    // Extract first meaningful phrase from description
    const words = description.split(' ').slice(0, 5).join(' ');
    return words.length > 40 ? words.slice(0, 40) + '...' : words;
  }

  /**
   * Infer ownership based on agent name
   */
  private inferOwnershipFromAgentName(agentName: string): string[] {
    // Infer ownership patterns from agent name
    if (agentName.includes('team-lead') || agentName.includes('orchestrator')) {
      return ['.ultra/queues/*', '.ultra/state/*', 'agent-coordination'];
    }
    if (agentName.includes('test') || agentName.includes('quality')) {
      return ['tests/**/*', '**/*.test.ts', '**/*.spec.ts', 'quality-gates/**/*'];
    }
    if (agentName.includes('security')) {
      return ['security/**/*', 'auth/**/*', 'credentials/**/*'];
    }
    if (agentName.includes('debugger')) {
      return ['bug-fixes/**/*', 'errors/**/*', 'diagnostics/**/*'];
    }
    if (agentName.includes('architect')) {
      return ['architecture/**/*', 'docs/architecture/**/*', 'infrastructure/**/*'];
    }
    if (agentName.includes('writer') || agentName.includes('document')) {
      return ['docs/**/*', '*.md', 'README.md', 'AGENTS.md'];
    }

    // Default: software development files
    return ['src/**/*.ts', 'lib/**/*.ts', 'skills/**/*', 'tests/**/*'];
  }

  /**
   * Infer autonomy based on model
   */
  private inferAutonomyFromModel(model: string): boolean {
    // Opus agents are typically autonomous
    if (model === 'opus') return true;

    return false;
  }

  /**
   * Generate routines with explicit task lists
   */
  private generateRoutines(
    customRoutines: Array<{ name: string; schedule: string; agent?: string; tasks?: string[] }> | undefined,
    agents: string[]
  ): RoutineDefinition[] {
    const defaults: RoutineDefinition[] = [];

    // Add domain-health-check if team-lead is present
    if (agents.includes('ultra:team-lead')) {
      defaults.push({
        name: 'domain-health-check',
        schedule: 'every 30s',
        enabled: true,
        agent: 'ultra:team-lead',
        tasks: [
          'Check .ultra/queues/intake.json for new tasks',
          'Review .ultra/state/autoloop.json for cycle health',
          'Verify all autonomous agents are responsive',
          'Check for stuck tasks in in-progress queue',
          'Report domain health status to .ultra/state/health.json'
        ],
        timeout: 10,
        onFailure: 'log-and-continue'
      });
    }

    // Map custom routines
    const mapped = (customRoutines || []).map(r => ({
      name: r.name,
      schedule: r.schedule,
      enabled: true,
      agent: r.agent || this.inferAgentForRoutine(r.name, agents),
      tasks: r.tasks || ['Execute routine tasks'],
      timeout: 15,
      onFailure: 'log-and-continue' as const
    }));

    return [...defaults, ...mapped];
  }

  /**
   * Infer appropriate agent for a routine
   */
  private inferAgentForRoutine(routineName: string, agents: string[]): string {
    const mapping: Record<string, string> = {
      'test': 'ultra:test-engineer',
      'security': 'ultra:security-reviewer',
      'quality': 'ultra:quality-reviewer',
      'performance': 'ultra:quality-reviewer',
      'health': 'ultra:team-lead'
    };

    for (const [key, agent] of Object.entries(mapping)) {
      if (routineName.toLowerCase().includes(key) && agents.includes(agent)) {
        return agent;
      }
    }

    return agents[0] || 'ultra:team-lead';
  }

  /**
   * Get default priority matrix
   */
  private getDefaultPriorityMatrix() {
    return {
      levels: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      rules: {
        CRITICAL: ['security-vulnerability', 'data-loss', 'system-down', 'autoloop-stopped', 'risk-limit-breached'],
        HIGH: ['test-failure', 'bug-fix', 'performance-issue', 'build-broken', 'live-trading'],
        MEDIUM: ['feature-development', 'test-coverage', 'documentation', 'signal-generation', 'position-monitor'],
        LOW: ['code-cleanup', 'optimization', 'minor-refactor', 'analysis', 'reporting']
      }
    };
  }

  /**
   * Get default quality gates
   */
  private getDefaultQualityGates(): QualityGateDefinition[] {
    return [
      {
        name: 'implementation-validation',
        enabled: true,
        checks: [
          'Code follows language best practices',
          'No build errors',
          'No lint violations',
          'File ownership boundaries respected',
          'All tests passing'
        ]
      },
      {
        name: 'security-validation',
        enabled: true,
        checks: [
          'No exposed secrets or credentials',
          'Dependencies up to date with no critical vulnerabilities',
          'Authentication and authorization properly implemented',
          'Input validation and sanitization in place'
        ]
      },
      {
        name: 'performance-validation',
        enabled: true,
        checks: [
          'No obvious memory leaks',
          'Response times within acceptable bounds',
          'No excessive resource consumption',
          'Database queries optimized (if applicable)'
        ]
      }
    ];
  }

  /**
   * Get default routing rules based on enabled agents
   */
  private getDefaultRoutingRules(agents: string[]): Array<{ pattern: string; agent: string }> {
    const rules: Array<{ pattern: string; agent: string }> = [];

    const agentPatterns: Record<string, string[]> = {
      // Team coordination
      'ultra:team-lead': ['orchestrate', 'coordinate', 'team', 'domain', 'workflow'],

      // Development
      'ultra:team-implementer': ['feature', 'implement', 'add', 'create', 'build'],
      'ultra:executor': ['feature', 'implement', 'add', 'create', 'build'],

      // Quality & Testing
      'ultra:test-engineer': ['test', 'spec', 'coverage', 'qa'],
      'ultra:team-reviewer': ['review', 'refactor', 'clean'],
      'ultra:code-reviewer': ['review', 'refactor', 'clean'],

      // Debugging
      'ultra:team-debugger': ['bug', 'fix', 'error', 'issue', 'failure'],
      'ultra:debugger': ['bug', 'fix', 'error', 'issue', 'failure'],

      // Security & Performance
      'ultra:security-reviewer': ['security', 'auth', 'vulnerability', 'secret'],
      'ultra:quality-reviewer': ['performance', 'slow', 'memory', 'optimize'],

      // Trading domain
      'ultra:quant-analyst': ['strategy', 'signal', 'backtest', 'quant', 'analysis'],
      'ultra:risk-manager': ['risk', 'var', 'position', 'circuit', 'exposure', 'limit'],
      'ultra:trading-architect': ['architecture', 'infrastructure', 'design', 'system'],
      'ultra:execution-developer': ['broker', 'order', 'execution', 'oauth', 'tradier', 'schwab']
    };

    for (const agent of agents) {
      const patterns = agentPatterns[agent];
      if (patterns) {
        rules.push({
          pattern: patterns.join('|'),
          agent
        });
      }
    }

    return rules;
  }

  /**
   * Write configuration files
   */
  private async writeConfiguration(config: DomainConfig): Promise<void> {
    // Write domain.json
    await fs.writeFile(
      path.join(this.ultraPath, 'domain.json'),
      JSON.stringify(config, null, 2),
      { mode: 0o600 }
    );

    // Write workspace.json
    await fs.writeFile(
      path.join(this.ultraPath, 'workspace.json'),
      JSON.stringify({
        workspacePath: this.workspacePath,
        domainId: config.domainId,
        createdAt: config.createdAt
      }, null, 2),
      { mode: 0o600 }
    );

    // Initialize empty queues
    const queues = {
      intake: [],
      'in-progress': [],
      review: [],
      completed: [],
      failed: []
    };

    for (const [queueName, tasks] of Object.entries(queues)) {
      await fs.writeFile(
        path.join(this.ultraPath, 'queues', `${queueName}.json`),
        JSON.stringify(tasks, null, 2)
      );
    }

    // Create routine configurations (explicit agentic format)
    for (const routine of config.routines) {
      const routineConfig = {
        name: routine.name,
        schedule: routine.schedule,
        enabled: routine.enabled,
        agent: routine.agent,
        lastRun: null,
        tasks: routine.tasks,
        timeout: routine.timeout || 15,
        onFailure: routine.onFailure || 'log-and-continue',
        failures: null
      };

      await fs.writeFile(
        path.join(this.ultraPath, 'routines', `${routine.name}.json`),
        JSON.stringify(routineConfig, null, 2)
      );
    }

    // Create autoloop state
    await fs.writeFile(
      path.join(this.ultraPath, 'state', 'autoloop.json'),
      JSON.stringify({
        enabled: false,
        pid: null,
        startedAt: null,
        cycleCount: 0,
        lastCycle: null,
        lastCycleDuration: null
      }, null, 2)
    );

    // Create .gitignore
    await fs.writeFile(
      path.join(this.ultraPath, '.gitignore'),
      `# Ignore state files (may contain sensitive data)
state/

# Ignore runtime queue files
queues/*.json

# Keep domain config and schemas
!.gitignore
*.json
`
    );
  }

  /**
   * Set secure file permissions
   */
  private async setFilePermissions(): Promise<void> {
    // Directories: 700 (owner read/write/execute only)
    await fs.chmod(this.ultraPath, 0o700);
    await fs.chmod(path.join(this.ultraPath, 'queues'), 0o700);
    await fs.chmod(path.join(this.ultraPath, 'routines'), 0o700);
    await fs.chmod(path.join(this.ultraPath, 'state'), 0o700);
  }

  /**
   * Load existing domain configuration
   */
  async loadDomainConfig(): Promise<DomainConfig> {
    const configPath = path.join(this.ultraPath, 'domain.json');

    if (!existsSync(configPath)) {
      throw new Error('Domain not initialized. Run /ultra-domain-setup first.');
    }

    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Reconfigure existing domain
   */
  async reconfigure(updates: Partial<DomainConfig>): Promise<void> {
    const config = await this.loadDomainConfig();

    const updated = {
      ...config,
      ...updates,
      version: '1.0.1' // Increment version
    };

    await fs.writeFile(
      path.join(this.ultraPath, 'domain.json'),
      JSON.stringify(updated, null, 2),
      { mode: 0o600 }
    );

    console.log('✅ Domain reconfigured successfully');
  }

  /**
   * Reset domain (delete everything)
   */
  async reset(): Promise<void> {
    if (!existsSync(this.ultraPath)) {
      throw new Error('Domain not initialized');
    }

    await fs.rm(this.ultraPath, { recursive: true, force: true });
    console.log('✅ Domain reset successfully');
  }

  /**
   * Check if a command exists
   */
  private async commandExists(cmd: string): Promise<boolean> {
    try {
      await fs.access(`/usr/bin/${cmd}`, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create domain initializer
 */
export function createDomainInitializer(workspacePath?: string): DomainInitializer {
  return new DomainInitializer(workspacePath);
}
