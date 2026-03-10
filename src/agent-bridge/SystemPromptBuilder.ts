/**
 * System Prompt Builder
 *
 * Constructs complete system prompts by combining:
 * - Agent's core behavioral instructions (from .md file)
 * - Domain-specific context
 * - Workspace context
 * - Task-specific context
 */

import {
  AgentDefinition,
  DomainContext,
  WorkspaceContext,
  TaskContext,
  InvocationContext,
  SystemPromptSections,
  PromptBuilderOptions
} from './types.js';

/**
 * Default builder options
 */
const DEFAULT_OPTIONS: PromptBuilderOptions = {
  includeDomainContext: true,
  includeWorkspaceContext: true,
  includeTaskContext: true,
  includeGuidelines: true,
  format: 'full'
};

export class SystemPromptBuilder {
  private options: PromptBuilderOptions;

  constructor(options: PromptBuilderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build complete system prompt for agent invocation
   *
   * @param definition - Loaded agent definition
   * @param context - Invocation context
   * @returns Complete system prompt string
   */
  buildSystemPrompt(
    definition: AgentDefinition,
    context: InvocationContext
  ): string {
    // Build individual sections
    const sections = this.buildSections(definition, context);

    // Combine sections based on format
    return this.combineSections(sections, this.options.format || 'full');
  }

  /**
   * Build individual prompt sections
   */
  buildSections(
    definition: AgentDefinition,
    context: InvocationContext
  ): SystemPromptSections {
    const sections: SystemPromptSections = {
      coreBehavior: definition.systemPrompt
    };

    // Add domain context if enabled
    if (this.options.includeDomainContext) {
      sections.domainContext = this.buildDomainContext(context.domain);
    }

    // Add workspace context if enabled
    if (this.options.includeWorkspaceContext) {
      sections.workspaceContext = this.buildWorkspaceContext(context.workspace);
    }

    // Add task context if enabled
    if (this.options.includeTaskContext) {
      sections.taskContext = this.buildTaskContext(context.task);
    }

    // Add guidelines if enabled
    if (this.options.includeGuidelines) {
      sections.guidelines = this.buildGuidelines(definition, context);
    }

    return sections;
  }

  /**
   * Build domain context section
   */
  private buildDomainContext(domain: DomainContext): string {
    const lines: string[] = [];

    lines.push('## Domain Context');
    lines.push('');
    lines.push(`**Domain:** ${domain.name} (${domain.type})`);
    lines.push('');
    lines.push(domain.description);
    lines.push('');

    // Add goals if present
    if (domain.goals && domain.goals.length > 0) {
      lines.push('### Domain Goals');
      lines.push('');
      domain.goals.forEach((goal, i) => {
        lines.push(`${i + 1}. ${goal}`);
      });
      lines.push('');
    }

    // Add tech stack
    lines.push('### Technology Stack');
    lines.push('');
    lines.push(`- **Language:** ${domain.stack.language}`);
    lines.push(`- **Framework:** ${domain.stack.framework}`);
    lines.push(`- **Testing:** ${domain.stack.testing}`);
    lines.push(`- **Package Manager:** ${domain.stack.packageManager}`);
    lines.push('');

    // Add available agents
    if (domain.agents && domain.agents.length > 0) {
      lines.push(`### Available Agents (${domain.agents.length})`);
      lines.push('');
      domain.agents.forEach(agent => {
        lines.push(`- ${agent}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build workspace context section
   */
  private buildWorkspaceContext(workspace: WorkspaceContext): string {
    const lines: string[] = [];

    lines.push('## Workspace');
    lines.push('');
    lines.push(`**Path:** ${workspace.path}`);
    lines.push(`**Domain ID:** ${workspace.domainId}`);
    lines.push('');

    // Add available agents
    if (workspace.availableAgents && workspace.availableAgents.length > 0) {
      lines.push(`### Active Agents (${workspace.availableAgents.length})`);
      lines.push('');
      workspace.availableAgents.forEach(agent => {
        lines.push(`- ${agent}`);
      });
      lines.push('');
    }

    // Add queue paths
    lines.push('### Queue Locations');
    lines.push('');
    lines.push(`- **Intake:** ${workspace.queuePaths.intake}`);
    lines.push(`- **In Progress:** ${workspace.queuePaths.inProgress}`);
    lines.push(`- **Review:** ${workspace.queuePaths.review}`);
    lines.push(`- **Completed:** ${workspace.queuePaths.completed}`);
    lines.push(`- **Failed:** ${workspace.queuePaths.failed}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Build task context section
   */
  private buildTaskContext(task: TaskContext): string {
    const lines: string[] = [];

    lines.push('## Current Task');
    lines.push('');
    lines.push(`**Task ID:** ${task.taskId}`);
    lines.push(`**Type:** ${task.type}`);
    lines.push(`**Priority:** ${task.priority}`);
    lines.push(`**Assigned By:** ${task.assignedBy}`);
    lines.push(`**Created:** ${task.createdAt.toISOString()}`);
    lines.push('');
    lines.push('### Task Description');
    lines.push('');
    lines.push(task.description);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Build behavioral guidelines section
   */
  private buildGuidelines(
    definition: AgentDefinition,
    context: InvocationContext
  ): string {
    const lines: string[] = [];

    lines.push('## Behavioral Guidelines');
    lines.push('');
    lines.push('### General Principles');
    lines.push('');
    lines.push('1. **Follow your specialized expertise** - You have deep knowledge in your domain');
    lines.push('2. **Consider the full context** - Use domain, workspace, and task information');
    lines.push('3. **Be thorough but concise** - Provide complete solutions without unnecessary verbosity');
    lines.push('4. **Use available tools** - You have access to: ' + definition.tools.join(', '));
    lines.push('5. **Communicate clearly** - Explain your reasoning and decisions');
    lines.push('');

    // Add file ownership guidance
    if (context.domain.routing.ownership === 'auto-assign') {
      lines.push('### File Ownership');
      lines.push('');
      lines.push('- You have specific file ownership boundaries');
      lines.push('- Only modify files within your ownership pattern');
      lines.push('- Coordinate through messages for files owned by other agents');
      lines.push('- Avoid merge conflicts by respecting ownership boundaries');
      lines.push('');
    }

    // Add quality expectations
    lines.push('### Quality Expectations');
    lines.push('');
    lines.push('- **Code Quality:** Follow best practices and design patterns');
    lines.push('- **Testing:** Consider test coverage and edge cases');
    lines.push('- **Documentation:** Document complex logic and decisions');
    lines.push('- **Performance:** Consider efficiency and scalability');
    lines.push('- **Security:** Think about security implications');
    lines.push('');

    // Add communication guidelines
    lines.push('### Communication');
    lines.push('');
    lines.push('- Report progress clearly and regularly');
    lines.push('- Escalate blockers or issues promptly');
    lines.push('- Ask for clarification when requirements are ambiguous');
    lines.push('- Provide evidence for your decisions');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Combine sections into final prompt
   */
  private combineSections(sections: SystemPromptSections, format: 'full' | 'concise' | 'minimal'): string {
    const parts: string[] = [];

    // Core behavior is always included
    parts.push(sections.coreBehavior);

    // Add sections based on format
    if (format === 'full') {
      // Include all sections
      if (sections.domainContext) {
        parts.push('---');
        parts.push(sections.domainContext);
      }
      if (sections.workspaceContext) {
        parts.push('---');
        parts.push(sections.workspaceContext);
      }
      if (sections.taskContext) {
        parts.push('---');
        parts.push(sections.taskContext);
      }
      if (sections.guidelines) {
        parts.push('---');
        parts.push(sections.guidelines);
      }
    } else if (format === 'concise') {
      // Include essential context only
      if (sections.domainContext) {
        parts.push('---');
        parts.push(this.conciseDomain(sections.domainContext));
      }
      if (sections.taskContext) {
        parts.push('---');
        parts.push(sections.taskContext);
      }
    } else if (format === 'minimal') {
      // Just core behavior and task
      if (sections.taskContext) {
        parts.push('---');
        parts.push(sections.taskContext);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Create concise version of domain context
   */
  private conciseDomain(fullContext: string): string {
    const lines: string[] = [];

    lines.push('## Quick Context');

    // Extract just the key info
    const domainMatch = fullContext.match(/\*\*Domain:\*\* ([^\n]+)/);
    if (domainMatch) {
      lines.push(`**Domain:** ${domainMatch[1]}`);
    }

    const langMatch = fullContext.match(/\*\*Language:\*\* ([^\n]+)/);
    if (langMatch) {
      lines.push(`**Stack:** ${langMatch[1]}`);
    }

    return lines.join('\n');
  }

  /**
   * Update builder options
   */
  setOptions(options: Partial<PromptBuilderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): PromptBuilderOptions {
    return { ...this.options };
  }
}
