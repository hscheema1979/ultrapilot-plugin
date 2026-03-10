/**
 * Runtime Tool Execution Guard
 *
 * Enforces sandbox restrictions at tool call boundary
 * Intercepts and filters disallowed tool uses
 */

import type { Tool } from '@anthropic-ai/sdk/message-lists.js';
import { RestrictedAgentContext } from './external-agent-sandbox.js';

/**
 * Runtime tool execution guard
 * Enforces sandbox restrictions at tool call boundary
 */
export class ToolExecutionGuard {
  private context: RestrictedAgentContext;

  constructor(context: RestrictedAgentContext) {
    this.context = context;
  }

  /**
   * Intercept tool use and validate before execution
   *
   * @param toolUse - Tool use block from Claude API response
   * @returns Object indicating if tool use is allowed
   */
  interceptToolUse(toolUse: any): { allowed: boolean; reason?: string } {
    const toolName = toolUse.name;

    const validation = this.context.validateToolUsage(toolName);

    if (!validation.allowed) {
      console.warn(`[ToolExecutionGuard] Blocked tool use: ${toolName} - ${validation.reason}`);
    }

    return validation;
  }

  /**
   * Apply guard to Claude API response
   * Filters out disallowed tool_use blocks
   *
   * @param response - Response from Claude API
   * @returns Filtered response with only allowed tool uses
   */
  filterToolUses(response: any): any {
    if (!response.content) {
      return response;
    }

    const filteredContent = response.content.filter((block: any) => {
      if (block.type === 'tool_use') {
        const validation = this.interceptToolUse(block);
        return validation.allowed;
      }
      return true;
    });

    return {
      ...response,
      content: filteredContent
    };
  }
}
