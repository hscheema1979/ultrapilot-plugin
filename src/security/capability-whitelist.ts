/**
 * Capability Whitelist for wshobson Agents
 *
 * Defines allowed capabilities for agent security
 * Validates agent capabilities during registration
 */

/**
 * Allowed capabilities for wshobson agents
 * READ-ONLY and SAFE operations only
 */
export const ALLOWED_CAPABILITIES = new Set([
  // File operations (READ-ONLY)
  'read_file',
  'list_files',

  // Code operations (SAFE)
  'analyze_code',
  'search_code',

  // Search operations
  'search_web',

  // Git operations (READ-ONLY)
  'git_status',
  'git_diff',
  'git_log',

  // Testing operations
  'run_tests',
  'analyze_test_results',

  // Documentation (returns string, doesn't write files)
  'generate_docs'
]);

/**
 * Check if agent capabilities are allowed
 * POLICY: REJECT agents with disallowed capabilities
 *
 * @param capabilities - Array of capabilities to validate
 * @param agentName - Name of the agent (for logging)
 * @returns Object with allowed status and list of rejected capabilities
 */
export function validateCapabilities(
  capabilities: string[],
  agentName: string = 'unknown'
): { allowed: boolean; rejected: string[] } {
  const rejected = capabilities.filter(cap => !ALLOWED_CAPABILITIES.has(cap));

  // Log rejected agents
  if (rejected.length > 0) {
    console.warn(`[Security] Agent '${agentName}' has disallowed capabilities:`, rejected);
  }

  return {
    allowed: rejected.length === 0,
    rejected
  };
}

/**
 * Audit log for capability usage
 */
export class CapabilityAuditLogger {
  private static logs: Array<{
    agent: string;
    capability: string;
    timestamp: string;
    allowed: boolean;
  }> = [];

  /**
   * Log capability usage
   */
  static log(agentName: string, capability: string, allowed: boolean): void {
    this.logs.push({
      agent: agentName,
      capability,
      timestamp: new Date().toISOString(),
      allowed
    });

    console.log(`[CapabilityAudit] ${agentName} -> ${capability} (${allowed ? 'ALLOWED' : 'REJECTED'})`);
  }

  /**
   * Get all audit logs
   */
  static getLogs() {
    return [...this.logs];
  }

  /**
   * Clear audit logs
   */
  static clear() {
    this.logs = [];
  }
}
