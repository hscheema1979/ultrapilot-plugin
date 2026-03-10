/**
 * Skill Executor
 *
 * Loads skill definitions, executes workflows via agents, formats results.
 * Core execution engine for all Agentics agents.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as matter from 'gray-matter';
import { getClaudeClient } from './claude-api';
import type { AgentExecutionResult } from './types/claude';

export interface SkillDefinition {
  name: string;
  description: string;
  agent: string;
  model: 'opus' | 'sonnet' | 'haiku';
  parameters?: SkillParameter[];
  workflow?: string;
}

export interface SkillParameter {
  name: string;
  description: string;
  type: string;
  required: boolean;
  default?: any;
}

export interface ExecutionContext {
  github: {
    owner: string;
    repo: string;
    issueNumber?: number;
    prNumber?: number;
    runId?: string;
    commentId?: number;
  };
  params: Record<string, any>;
  trigger?: 'webhook' | 'command' | 'scheduled';
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: any;
  duration: number;
}

/**
 * Skill Executor - Loads and executes skill definitions
 */
export class SkillExecutor {
  private skillCache: Map<string, SkillDefinition> = new Map();

  /**
   * Load skill definition from markdown file
   */
  async loadSkill(skillName: string): Promise<SkillDefinition> {
    // Check cache first
    if (this.skillCache.has(skillName)) {
      return this.skillCache.get(skillName)!;
    }

    // Load skill file
    const skillPaths = [
      path.join(process.env.HOME!, '.claude', 'skills', `${skillName}.md`),
      path.join(process.env.HOME!, '.claude', 'plugins', 'ultrapilot', 'skills', 'ultrapilot', `${skillName}.md`),
      path.join(process.cwd(), 'skills', `${skillName}.md`)
    ];

    let skillContent: string | null = null;
    for (const skillPath of skillPaths) {
      try {
        skillContent = await fs.readFile(skillPath, 'utf-8');
        break;
      } catch {
        continue;
      }
    }

    if (!skillContent) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // Parse frontmatter
    const { data, content } = matter(skillContent);

    const skill: SkillDefinition = {
      name: data.name || skillName,
      description: data.description || '',
      agent: data.agent || 'ultra:executor',
      model: data.model || 'sonnet',
      parameters: data.parameters || [],
      workflow: content
    };

    // Cache it
    this.skillCache.set(skillName, skill);

    return skill;
  }

  /**
   * Prepare agent context from skill and execution context
   */
  prepareAgentContext(skill: SkillDefinition, execContext: ExecutionContext): any {
    return {
      agent: skill.agent,
      model: skill.model,
      instructions: skill.workflow,
      github: execContext.github,
      parameters: {
        ...execContext.params
      }
    };
  }

  /**
   * Execute a skill
   *
   * This is a simplified version - in production, this would:
   * 1. Invoke the agent via Claude API
   * 2. Stream responses back
   * 3. Handle errors and retries
   * 4. Cache results
   */
  async executeSkill(skillName: string, execContext: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[SkillExecutor] Executing skill: ${skillName}`);

      // 1. Load skill definition
      const skill = await this.loadSkill(skillName);
      console.log(`[SkillExecutor] Loaded skill: ${skill.name} (agent: ${skill.agent})`);

      // 2. Validate parameters
      if (skill.parameters) {
        for (const param of skill.parameters) {
          if (param.required && !execContext.params[param.name]) {
            throw new Error(`Missing required parameter: ${param.name}`);
          }
        }
      }

      // 3. Prepare agent context
      const agentContext = this.prepareAgentContext(skill, execContext);
      console.log(`[SkillExecutor] Agent context prepared`);

      // 4. Execute via Task tool (placeholder - actual implementation would call Claude)
      const output = await this.invokeAgent(skill.agent, agentContext);
      console.log(`[SkillExecutor] Agent execution complete`);

      // 5. Format result
      const result: ExecutionResult = {
        success: true,
        output,
        duration: Date.now() - startTime
      };

      console.log(`[SkillExecutor] Skill execution complete in ${result.duration}ms`);

      return result;

    } catch (error) {
      console.error(`[SkillExecutor] Skill execution failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Invoke agent via Claude API
   *
   * Executes the agent using Claude Messages API with:
   * - Model tier selection (opus/sonnet/haiku)
   * - Token usage tracking
   * - Error handling with retries
   * - Rate limit handling
   */
  private async invokeAgent(agentType: string, context: any): Promise<string> {
    try {
      const { instructions, github, parameters } = context;

      // Build comprehensive prompt for the agent
      const prompt = this.buildAgentPrompt(agentType, instructions, github, parameters);

      // Extract model tier from agent type (e.g., "ultra:executor" -> "sonnet")
      const modelTier = this.extractModelTier(agentType);

      // Get Claude API client
      const claudeClient = getClaudeClient();

      // Execute via Claude API
      const result: AgentExecutionResult = await claudeClient.execute(
        prompt,
        modelTier,
        {
          maxTokens: 4096,
          temperature: 0.7
        }
      );

      // Check if execution was successful
      if (!result.success) {
        throw new Error(`Agent execution failed: ${result.error}`);
      }

      // Log token usage
      console.log(`[SkillExecutor] Token usage:`, {
        input: result.tokens.input,
        output: result.tokens.output,
        total: result.tokens.total,
        cost: this.estimateCost(result.tokens)
      });

      return result.output;

    } catch (error) {
      console.error(`[SkillExecutor] Agent invocation failed:`, error);
      throw error;
    }
  }

  /**
   * Build comprehensive prompt for agent execution
   */
  private buildAgentPrompt(
    agentType: string,
    instructions: string | undefined,
    github: any,
    parameters: Record<string, any>
  ): string {
    const parts: string[] = [];

    // Agent role and context
    parts.push(`# Agent Role\n`);
    parts.push(`You are ${agentType}, a specialized agent.\n`);

    // GitHub context
    if (github) {
      parts.push(`# GitHub Context\n`);
      parts.push(`- Repository: ${github.owner}/${github.repo}\n`);

      if (github.issueNumber) {
        parts.push(`- Issue: #${github.issueNumber}\n`);
      }

      if (github.prNumber) {
        parts.push(`- Pull Request: #${github.prNumber}\n`);
      }

      if (github.runId) {
        parts.push(`- Workflow Run: ${github.runId}\n`);
      }

      parts.push(`\n`);
    }

    // Parameters
    if (parameters && Object.keys(parameters).length > 0) {
      parts.push(`# Parameters\n`);
      parts.push(JSON.stringify(parameters, null, 2));
      parts.push(`\n\n`);
    }

    // Instructions/workflow
    if (instructions) {
      parts.push(`# Instructions\n`);
      parts.push(instructions);
      parts.push(`\n`);
    }

    // Execution guidance
    parts.push(`# Execution Guidelines\n`);
    parts.push(`1. Analyze the context and parameters carefully\n`);
    parts.push(`2. Follow the instructions precisely\n`);
    parts.push(`3. Provide clear, actionable output\n`);
    parts.push(`4. If you need more information, state what's missing\n`);

    return parts.join('');
  }

  /**
   * Extract model tier from agent type
   */
  private extractModelTier(agentType: string): 'opus' | 'sonnet' | 'haiku' {
    // Map agent types to model tiers
    const opusAgents = [
      'ultra:analyst',
      'ultra:architect',
      'ultra:planner',
      'ultra:critic',
      'ultra:code-reviewer'
    ];

    const haikuAgents = [
      'ultra:executor-low',
      'ultra:writer'
    ];

    // Default to sonnet for most agents
    if (opusAgents.some(a => agentType.includes(a))) {
      return 'opus';
    }

    if (haikuAgents.some(a => agentType.includes(a))) {
      return 'haiku';
    }

    return 'sonnet';
  }

  /**
   * Estimate token cost (USD)
   */
  private estimateCost(tokens: { input: number; output: number }): number {
    // Claude 3.5 Sonnet pricing (as of 2025)
    const inputCostPer1M = 3.0;  // $3 per million input tokens
    const outputCostPer1M = 15.0; // $15 per million output tokens

    const inputCost = (tokens.input / 1_000_000) * inputCostPer1M;
    const outputCost = (tokens.output / 1_000_000) * outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Clear skill cache
   */
  clearCache(): void {
    this.skillCache.clear();
  }
}

// Singleton instance
export const skillExecutor = new SkillExecutor();
