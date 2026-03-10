/**
 * wshobson Agent Adapter
 *
 * Converts between UnifiedAgent (metadata) and WshobsonAgentDefinition (executable)
 * Handles validation and security checks
 */

import { UnifiedAgent, WshobsonAgentDefinition, ValidationResultExtended } from '../types/wshobson-types.js';
import { parseModelTier } from '../utils/model-tier-parser.js';
import { PromptSanitizer } from '../security/PromptSanitizer.js';

/**
 * Capability whitelist - will be created in P2-T002
 * For now, define inline to avoid circular dependency
 */
const ALLOWED_CAPABILITIES = new Set([
  'read_file',
  'list_files',
  'analyze_code',
  'search_code',
  'search_web',
  'git_status',
  'git_diff',
  'git_log',
  'run_tests',
  'analyze_test_results',
  'generate_docs'
]);

function validateCapabilities(capabilities: string[]): { allowed: boolean; rejected: string[] } {
  const rejected = capabilities.filter(cap => !ALLOWED_CAPABILITIES.has(cap));
  return {
    allowed: rejected.length === 0,
    rejected
  };
}

export class WshobsonAgentAdapter {
  /**
   * Convert UnifiedAgent (metadata) to WshobsonAgentDefinition (executable)
   * FIXED: Made async to await PromptSanitizer
   */
  async toAgentDefinition(unified: UnifiedAgent): Promise<WshobsonAgentDefinition> {
    // FIXED: Await async sanitizeAgentPrompt
    const sanitized = await PromptSanitizer.sanitizeAgentPrompt(unified.description);
    const sanitizedDescription = sanitized.sanitized;

    return {
      name: unified.name,
      description: sanitizedDescription,
      systemPrompt: sanitizedDescription,
      model: unified.model,
      tier: unified.model,
      capabilities: unified.capabilities,
      plugin: unified.plugin || 'unknown',
      domain: unified.domain || 'general'
    };
  }

  /**
   * Convert WshobsonAgentDefinition to UnifiedAgent
   */
  toUnifiedAgent(definition: WshobsonAgentDefinition): UnifiedAgent {
    const modelTier = parseModelTier(
      definition.model || 'inherit',
      definition.tier
    );

    return {
      id: `wshobson:${definition.name}`,
      name: definition.name,
      description: definition.description || definition.systemPrompt,
      model: modelTier,
      source: 'wshobson',
      plugin: definition.plugin,
      domain: definition.domain,
      capabilities: definition.capabilities || []
    };
  }

  /**
   * Validate WshobsonAgentDefinition
   * FIXED: Made async to await PromptSanitizer
   */
  async validateDefinition(definition: WshobsonAgentDefinition): Promise<ValidationResultExtended> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!definition.name?.trim()) {
      errors.push('name is required');
    }

    if (!definition.description?.trim() && !definition.systemPrompt?.trim()) {
      errors.push('description or systemPrompt is required');
    }

    // Model tier validation
    if (!['opus', 'sonnet', 'haiku'].includes(definition.model)) {
      errors.push(`Invalid model tier: ${definition.model}`);
    }

    // Security: Check for dangerous patterns
    const content = (definition.description || '') + (definition.systemPrompt || '');

    try {
      // FIXED: Await async checkPromptSafe
      await PromptSanitizer.checkPromptSafe(content);
    } catch (error: any) {
      if (error.message && error.message.includes('Prompt injection detected')) {
        errors.push(`Security: ${error.message}`);
      } else {
        errors.push(`Security check failed: ${error.message || 'Unknown error'}`);
      }
    }

    // Capability validation
    const capabilityCheck = validateCapabilities(definition.capabilities || []);
    if (!capabilityCheck.allowed) {
      errors.push(`Disallowed capabilities: ${capabilityCheck.rejected.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
