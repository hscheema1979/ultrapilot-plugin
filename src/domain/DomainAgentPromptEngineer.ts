/**
 * Domain Agent Prompt Engineer
 *
 * Generates system prompts for domain agents based on domain configuration.
 * Ensures agents have clear goals, agency, overhead responsibilities, and domain context.
 *
 * Prompt Structure:
 * 1. Agent Identity (role, model tier)
 * 2. Domain Context (domain type, goals, stack)
 * 3. Agency Level (autonomy, veto power, file ownership)
 * 4. Goals & Responsibilities
 * 5. Overhead & Maintenance (routines, quality gates)
 * 6. Communication Protocols
 * 7. Decision Boundaries
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

export interface AgentPromptConfig {
  agentName: string;
  agentRole: string;
  domainConfig: any;
  agentCapabilities: string[];
  fileOwnership: string[];
  autonomy: boolean;
  specialFlags?: {
    coordination?: boolean;
    parallel?: boolean;
    reviewer?: boolean;
    debugger?: boolean;
    vetoPower?: boolean;
  };
}

export interface GeneratedPrompt {
  agentName: string;
  systemPrompt: string;
  metadata: {
    version: string;
    generatedAt: string;
    domainId: string;
    agentType: string;
  };
}

/**
 * Domain Agent Prompt Engineer class
 */
export class DomainAgentPromptEngineer {
  private domainPath: string;
  private domainConfig: any;

  constructor(domainPath: string) {
    this.domainPath = domainPath;
    const domainJsonPath = join(domainPath, '.ultra', 'domain.json');

    if (!existsSync(domainJsonPath)) {
      throw new Error(`Domain not found at: ${domainPath}`);
    }

    this.domainConfig = JSON.parse(readFileSync(domainJsonPath, 'utf-8'));
  }

  /**
   * Generate prompts for all agents in domain
   */
  generateAllAgentPrompts(): GeneratedPrompt[] {
    const prompts: GeneratedPrompt[] = [];

    for (const agent of this.domainConfig.agents) {
      const prompt = this.generateAgentPrompt(agent);
      prompts.push(prompt);
    }

    return prompts;
  }

  /**
   * Generate system prompt for a single agent
   */
  generateAgentPrompt(agent: any): GeneratedPrompt {
    const config: AgentPromptConfig = {
      agentName: agent.name,
      agentRole: agent.role,
      domainConfig: this.domainConfig,
      agentCapabilities: agent.capabilities,
      fileOwnership: agent.ownership,
      autonomy: agent.autonomous,
      specialFlags: {
        coordination: agent.coordination,
        parallel: agent.parallel,
        reviewer: agent.reviewer,
        debugger: agent.debugger,
        vetoPower: agent.vetoPower
      }
    };

    const systemPrompt = this.buildSystemPrompt(config);

    return {
      agentName: agent.name,
      systemPrompt,
      metadata: {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        domainId: this.domainConfig.domainId,
        agentType: agent.name
      }
    };
  }

  /**
   * Build system prompt for agent
   */
  private buildSystemPrompt(config: AgentPromptConfig): string {
    const sections = [
      this.identitySection(config),
      this.domainContextSection(config),
      this.agencyLevelSection(config),
      this.goalsSection(config),
      this.overheadSection(config),
      this.communicationSection(config),
      this.boundariesSection(config),
      this.decisionFrameworkSection(config)
    ];

    return sections.filter(s => s).join('\n\n') + '\n';
  }

  /**
   * Identity Section
   */
  private identitySection(config: AgentPromptConfig): string {
    return `# IDENTITY

You are **${config.agentName}**, the **${config.agentRole}** for the **${this.domainConfig.name}** domain.

**Model Tier**: ${this.inferModelTier(config.agentName)}
**Agent Type**: ${config.agentName}
**Domain**: ${this.domainConfig.name}
**Type**: ${this.domainConfig.type}

You are part of an autonomous agency framework called **UltraPilot**.`;
  }

  /**
   * Domain Context Section
   */
  private domainContextSection(config: AgentPromptConfig): string {
    const goals = config.domainConfig.goals || config.domainConfig.description || 'Domain operation and management';
    const stack = config.domainConfig.stack || {};

    return `# DOMAIN CONTEXT

## Domain Goals
${goals}

## Domain Type
${this.domainConfig.type}

## Technical Stack
- **Language**: ${stack.language || 'Not specified'}
- **Framework**: ${stack.framework || 'Not specified'}
- **Package Manager**: ${stack.packageManager || 'Not specified'}
- **Testing**: ${stack.testing || 'Not specified'}
- **Version Control**: ${stack.versionControl || 'git'}
- **Main Branch**: ${stack.mainBranch || 'main'}

## Domain Parameters
${this.formatDomainParameters(config.domainConfig)}`;
  }

  /**
   * Agency Level Section
   */
  private agencyLevelSection(config: AgentPromptConfig): string {
    const sections = [];

    sections.push(`## Autonomy Level`);
    sections.push(config.autonomy
      ? '✅ **AUTONOMOUS**: You work independently without constant supervision. Make decisions within your authority boundaries.'
      : '⚠️  **MANAGED**: You require approval for significant decisions.'
    );

    if (config.specialFlags?.vetoPower) {
      sections.push(`## Veto Power`);
      sections.push(`🛑 **VETO POWER**: You have authority to veto operations that violate critical constraints (security, risk limits, quality gates). Your veto is binding and requires explicit override to ignore.`);
    }

    if (config.specialFlags?.coordination) {
      sections.push(`## Coordination Authority`);
      sections.push(`📋 **COORDINATION**: You orchestrate other agents, assign work, manage task queues, and ensure domain health. You are the domain manager (UltraLead).`);
    }

    if (config.specialFlags?.reviewer) {
      sections.push(`## Review Authority`);
      sections.push(`🔍 **REVIEWER**: You review work for quality, security, performance, or architectural integrity. Your approval may be required before work is considered complete.`);
    }

    return `# AGENCY LEVEL\n\n${sections.join('\n\n')}`;
  }

  /**
   * Goals Section
   */
  private goalsSection(config: AgentPromptConfig): string {
    return `# GOALS & RESPONSIBILITIES

## Your Capabilities
${config.agentCapabilities.map(cap => `- **${cap}**`).join('\n')}

## File Ownership
You own the following files and areas:
${config.fileOwnership.map(f => `- \`${f}\``).join('\n')}

${this.getSpecificGoals(config)}`;
  }

  /**
   * Overhead Section
   */
  private overheadSection(config: AgentPromptConfig): string {
    const routines = config.domainConfig.routines || [];
    const qualityGates = config.domainConfig.qualityGates || [];

    return `# OVERHEAD & MAINTENANCE

## Routine Tasks
You are responsible for the following routines:
${routines.map((r: any) => `- **${r.name}** (${r.schedule}): ${r.tasks?.slice(0, 2).join(', ') || 'Execute routine tasks'}`).join('\n')}

## Quality Gates
You must ensure the following quality checks pass:
${qualityGates.map((g: any) => `- **${g.name}**:\n  ${g.checks?.map((c: any) => `  - ${c}`).join('\n') || ''}`).join('\n\n')}`;
  }

  /**
   * Communication Section
   */
  private communicationSection(config: AgentPromptConfig): string {
    return `# COMMUNICATION PROTOCOLS

## Report To
- **CEO**: User (provides vision and goals)
- **COO**: Claude Code CLI session (architecture and resources)
- **UltraLead**: Domain manager (${config.domainConfig.name})

## Coordinate With
- Other domain agents via shared state files
- Task queues (.ultra/queues/)
- Domain signals (.ultra/shared/domain-signals.json)

## Status Reporting
Report:
- Task progress
- Blockers or issues
- Quality gate failures
- Security concerns (with veto if critical)

## Inter-Domain Communication
When communicating with other domains:
1. Write signals to \`.ultra/shared/domain-signals.json\`
2. Use clear, structured format
3. Include timestamp and domain name
4. Specify expected response or action`;
  }

  /**
   * Boundaries Section
   */
  private boundariesSection(config: AgentPromptConfig): string {
    return `# DECISION BOUNDARIES

## Within Your Authority
${this.getAuthorityBoundaries(config)}

## Requires Approval
${this.getApprovalBoundaries(config)}

## Beyond Your Authority
${this.getBeyondAuthority(config)}

## Escalation Path
1. If uncertain, consult UltraLead (${this.domainConfig.name}-lead)
2. For critical issues (security, risk, system down), escalate immediately
3. Document escalation reason and context`;
  }

  /**
   * Decision Framework Section
   */
  private decisionFrameworkSection(config: AgentPromptConfig): string {
    return `# DECISION FRAMEWORK

## Decision Principles
1. **Alignment**: Does this advance domain goals?
2. **Quality**: Does this meet quality gate standards?
3. **Security**: Does this compromise security? (Use veto if yes)
4. **Performance**: Does this meet performance expectations?
5. **Ownership**: Is this within your file ownership boundaries?

## Decision Process
1. **Analyze**: Understand the task and context
2. **Check Authority**: Is this within your boundaries?
3. **Evaluate**: Apply decision principles
4. **Act**: Execute or escalate
5. **Report**: Update queues and state files

## "The Boulder Never Stops"
- Persistent execution through errors
- If blocked, document and escalate
- If uncertain, ask but don't stop
- Maintain forward momentum`;
  }

  /**
   * Get agent-specific goals
   */
  private getSpecificGoals(config: AgentPromptConfig): string {
    const goalMap: Record<string, string> = {
      'ultra:team-lead': `## Primary Responsibilities
- Orchestrate domain workflow and agent coordination
- Monitor task queues and assign work to appropriate agents
- Spawn ultra-workers for parallel execution
- Maintain domain health and resolve blockers
- Report domain status to COO (current session)

## Success Metrics
- Tasks processed per cycle
- Agent utilization rate
- Domain health score
- Blocker resolution time`,
      'ultra:team-implementer': `## Primary Responsibilities
- Implement features and fixes within owned file paths
- Respect file ownership boundaries
- Coordinate parallel work with other implementers
- Ensure implementation quality gates pass
- Report completion and transfer ownership

## Success Metrics
- Features implemented correctly
- File ownership respected
- Quality gates passing
- Parallel efficiency`,
      'ultra:test-engineer': `## Primary Responsibilities
- Design and implement tests for code changes
- Ensure test coverage meets or exceeds target (${config.domainConfig.developmentParameters?.testCoverageTarget || 80}%)
- Run test suite on code changes
- Report failures to debugging team
- Maintain test quality and prevent flaky tests

## Success Metrics
- Test coverage percentage
- Tests passing rate
- Test execution time
- Defect detection rate`,
      'ultra:security-reviewer': `## Primary Responsibilities
- Conduct security audits on code changes
- Validate authentication and authorization
- Scan for exposed secrets and vulnerabilities
- Review dependencies for security issues
- Exercise veto power on critical security concerns

## Success Metrics
- Vulnerabilities detected
- Security coverage
- Response time to critical issues
- Veto usage (should be rare but decisive)`,
      'ultra:quality-reviewer': `## Primary Responsibilities
- Analyze code for performance issues
- Review algorithmic complexity
- Identify memory leaks and resource problems
- Validate production readiness
- Recommend optimizations

## Success Metrics
- Performance improvements
- Resource utilization
- Response time optimizations
- Production readiness score`,
      'ultra:team-debugger': `## Primary Responsibilities
- Investigate bugs and test failures
- Root cause analysis using hypothesis-driven debugging
- Propose and implement fixes
- Verify fixes resolve issues
- Document findings and patterns

## Success Metrics
- Bugs resolved
- Root cause identification rate
- Fix effectiveness
- Time to resolution`,
      'ultra:code-reviewer': `## Primary Responsibilities
- Review code for maintainability and best practices
- Identify anti-patterns and code smells
- Suggest refactoring opportunities
- Ensure code consistency
- Provide constructive feedback

## Success Metrics
- Code quality improvements
- Review coverage
- Feedback effectiveness
- Maintainability score`
    };

    return goalMap[config.agentName] || `## Primary Responsibilities
Execute tasks within your capabilities and ownership boundaries.
Maintain quality standards and communicate progress.`;
  }

  /**
   * Get authority boundaries
   */
  private getAuthorityBoundaries(config: AgentPromptConfig): string {
    if (config.specialFlags?.vetoPower) {
      return '- Veto operations that violate critical constraints\n- Make decisions within your file ownership\n- Execute tasks without pre-approval';
    }
    if (config.specialFlags?.coordination) {
      return '- Assign tasks to agents\n- Coordinate workflow\n- Manage domain health\n- Resolve blockers';
    }
    return '- Execute assigned tasks\n- Make decisions within file ownership\n- Report progress and issues';
  }

  /**
   * Get approval boundaries
   */
  private getApprovalBoundaries(config: AgentPromptConfig): string {
    if (config.specialFlags?.vetoPower) {
      return 'Critical security decisions (use veto, not approval)';
    }
    return '- Major architectural changes\n- Cross-domain coordination\n- Breaking changes to owned files';
  }

  /**
   * Get beyond authority
   */
  private getBeyondAuthority(config: AgentPromptConfig): string {
    return '- Tasks outside your capabilities\n- Files outside your ownership\n- Domain goal changes\n- Agent hiring/firing';
  }

  /**
   * Infer model tier from agent name
   */
  private inferModelTier(agentName: string): string {
    // Check domain config for model
    const agent = this.domainConfig.agents.find((a: any) => a.name === agentName);
    if (agent?.model) {
      const tierMap: Record<string, string> = {
        'opus': 'Opus (Highest reasoning)',
        'sonnet': 'Sonnet (Balanced performance)',
        'haiku': 'Haiku (Fast execution)'
      };
      return tierMap[agent.model] || 'Sonnet';
    }

    // Default tier based on agent type
    const tierMap: Record<string, string> = {
      'ultra:team-lead': 'Opus (Highest reasoning)',
      'ultra:trading-architect': 'Opus (Highest reasoning)',
      'ultra:quant-analyst': 'Opus (Highest reasoning)',
      'ultra:risk-manager': 'Opus (Highest reasoning)',
      'ultra:code-reviewer': 'Opus (Highest reasoning)',
      'ultra:team-implementer': 'Sonnet (Balanced)',
      'ultra:team-reviewer': 'Sonnet (Balanced)',
      'ultra:team-debugger': 'Sonnet (Balanced)',
      'ultra:test-engineer': 'Sonnet (Balanced)',
      'ultra:debugger': 'Sonnet (Balanced)',
      'ultra:security-reviewer': 'Sonnet (Balanced)',
      'ultra:quality-reviewer': 'Sonnet (Balanced)',
      'ultra:executor': 'Sonnet (Balanced)',
      'ultra:data-engineer': 'Haiku (Fast execution)'
    };

    return tierMap[agentName] || 'Sonnet';
  }

  /**
   * Format domain parameters
   */
  private formatDomainParameters(domainConfig: any): string {
    const params: string[] = [];

    for (const [key, value] of Object.entries(domainConfig)) {
      // Skip standard fields
      if (['domainId', 'name', 'type', 'description', 'stack', 'agents',
           'routing', 'priorityMatrix', 'routines', 'queues', 'qualityGates',
           'autoloop', 'workspace', 'goals'].includes(key)) {
        continue;
      }

      if (typeof value === 'object') {
        params.push(`**${key}**:\n${JSON.stringify(value, null, 2)}`);
      } else {
        params.push(`**${key}**: ${value}`);
      }
    }

    return params.length > 0 ? params.join('\n') : 'None';
  }

  /**
   * Save generated prompts to .ultra/prompts/
   */
  savePrompts(prompts: GeneratedPrompt[]): void {
    const promptsDir = join(this.domainPath, '.ultra', 'prompts');

    if (!existsSync(promptsDir)) {
      // Would create directory in real implementation
    }

    for (const prompt of prompts) {
      const filename = prompt.agentName.replace(/:/g, '-') + '.md';
      const filepath = join(promptsDir, filename);

      const content = `# System Prompt: ${prompt.agentName}

**Generated**: ${prompt.metadata.generatedAt}
**Version**: ${prompt.metadata.version}
**Domain**: ${prompt.metadata.domainId}

---

${prompt.systemPrompt}
`;

      // writeFileSync(filepath, content);
    }
  }
}

/**
 * Factory function
 */
export function createDomainAgentPromptEngineer(domainPath: string): DomainAgentPromptEngineer {
  return new DomainAgentPromptEngineer(domainPath);
}
