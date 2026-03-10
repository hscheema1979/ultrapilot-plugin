/**
 * Model Tier Parser Utility
 *
 * Parses and resolves model tier specifications for wshobson agents.
 * Handles 'inherit' value and explicit opus/sonnet/haiku assignments.
 *
 * NOTE: This is NEW utility, separate from existing AgentInvoker.resolveModel()
 * to provide centralized model tier resolution for wshobson agents
 */

/**
 * Parse and resolve model tier specifications
 *
 * @param model - The model specification (e.g., 'opus', 'sonnet', 'haiku', 'inherit')
 * @param fallbackTier - Optional fallback tier for 'inherit' case
 * @returns The resolved model tier
 */
export function parseModelTier(
  model: string,
  fallbackTier?: 'opus' | 'sonnet' | 'haiku'
): 'opus' | 'sonnet' | 'haiku' {
  // Explicit tier
  if (model === 'opus' || model === 'sonnet' || model === 'haiku') {
    return model;
  }

  // Inherit from fallback
  if (model === 'inherit') {
    if (fallbackTier && ['opus', 'sonnet', 'haiku'].includes(fallbackTier)) {
      return fallbackTier;
    }
    // Default to sonnet for inherited tiers without fallback
    return 'sonnet';
  }

  // Unknown model - default to sonnet
  console.warn(`[ModelTierParser] Unknown model: ${model}, defaulting to sonnet`);
  return 'sonnet';
}

/**
 * Check if model tier is valid
 *
 * @param tier - The tier to validate
 * @returns True if the tier is valid
 */
export function isValidModelTier(tier: string): tier is 'opus' | 'sonnet' | 'haiku' {
  return ['opus', 'sonnet', 'haiku'].includes(tier);
}
