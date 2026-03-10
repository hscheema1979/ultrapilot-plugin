/**
 * Restricted Agent Context for External (wshobson) Agents
 *
 * Sandboxes execution to prevent privilege escalation
 * Filters tools and enforces runtime restrictions
 */

import type { Tool } from '@anthropic-ai/sdk/message-lists.js';

/**
 * RESTRICTED context for external (wshobson) agents
 * SECURITY: write_file REMOVED from default allowed tools
 */
export class RestrictedAgentContext {
  private allowedTools: Set<string>;
  private maxTokens: number;
  private maxToolCalls: number;
  private enableNetwork: boolean;

  constructor(config: {
    allowedTools?: string[];
    maxTokens?: number;
    maxToolCalls?: number;
    enableNetwork?: boolean;
  }) {
    this.allowedTools = new Set(config.allowedTools || this.getDefaultAllowedTools());
    this.maxTokens = config.maxTokens || 4096;
    this.maxToolCalls = config.maxToolCalls || 10;
    this.enableNetwork = config.enableNetwork || false;
  }

  /**
   * Filter tools to only allowed ones
   */
  filterTools(tools: Tool[]): Tool[] {
    return tools.filter(tool => this.allowedTools.has(tool.name));
  }

  /**
   * Validate tool usage at runtime
   */
  validateToolUsage(toolName: string): { allowed: boolean; reason?: string } {
    if (!this.isToolAllowed(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is not in the allowed list for external agents`
      };
    }

    return { allowed: true };
  }

  private isToolAllowed(toolName: string): boolean {
    return this.allowedTools.has(toolName);
  }

  /**
   * Get execution context with quotas
   */
  getExecutionContext() {
    return {
      maxTokens: this.maxTokens,
      maxToolCalls: this.maxToolCalls,
      enableNetwork: this.enableNetwork,
      restricted: true
    };
  }

  /**
   * DEFAULT ALLOWED TOOLS (READ-ONLY)
   * SECURITY: NO write_file
   */
  private getDefaultAllowedTools(): string[] {
    return [
      'read_file',
      'list_files',
      'glob',
      'grep',
      'git_status',
      'git_diff',
      'git_log'
    ];
  }
}
