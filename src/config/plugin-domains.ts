/**
 * Domain mapping for all 72 wshobson plugins
 *
 * Maps each plugin name to its primary domain category
 */

/**
 * Complete plugin-to-domain mapping for all 72 wshobson plugins
 */
export const PLUGIN_DOMAIN_MAP: Record<string, string> = {
  // Security (13 plugins)
  'accessibility-reviewer': 'quality',
  'backend-api-security': 'security',
  'backend-security': 'security',
  'code-quality-security': 'security',
  'incident-response': 'operations',
  'incident-review': 'operations',
  'ml-security': 'security',
  'penetration-testing': 'security',
  'performance-analysis': 'quality',
  'privacy-hipaa': 'security',
  'privacy-security': 'security',
  'safe-integration': 'security',
  'secrets-scanner': 'security',

  // API & Integration (8 plugins)
  'api-documentation': 'software-dev',
  'api-integration': 'software-dev',
  'asynchronous-integration': 'software-dev',
  'backend-api': 'backend',
  'graphql-integration': 'backend',
  'microservices-integration': 'backend',
  'rest-api-integration': 'backend',
  'webhook-integration': 'backend',

  // Architecture (6 plugins)
  'architecture': 'architecture',
  'architecture-documentation': 'architecture',
  'component-design': 'architecture',
  'design-patterns': 'architecture',
  'system-design': 'architecture',
  'technical-architecture': 'architecture',

  // Backend (9 plugins)
  'backend': 'backend',
  'backend-authentication': 'backend',
  'backend-database': 'backend',
  'backend-error-handling': 'backend',
  'backend-performance': 'backend',
  'backend-testing': 'backend',
  'backend-websocket': 'backend',
  'database-optimization': 'data',
  'server-management': 'operations',

  // Frontend (7 plugins)
  'component-library': 'frontend',
  'css-styling': 'frontend',
  'frontend': 'frontend',
  'frontend-api': 'frontend',
  'frontend-optimization': 'frontend',
  'frontend-testing': 'frontend',
  'ui-design': 'frontend',

  // Data & Analytics (7 plugins)
  'data-analysis': 'data',
  'data-engineering': 'data',
  'data-visualization': 'data',
  'database': 'data',
  'database-migration': 'data',
  'database-query': 'data',
  'database-schema': 'data',

  // DevOps & Operations (8 plugins)
  'ci-cd': 'operations',
  'devops': 'operations',
  'docker': 'operations',
  'infrastructure': 'operations',
  'kubernetes': 'operations',
  'monitoring': 'operations',
  'performance-testing': 'quality',
  'serverless': 'operations',

  // Testing (5 plugins)
  'e2e-testing': 'quality',
  'integration-testing': 'quality',
  'system-testing': 'quality',
  'test-automation': 'quality',
  'unit-testing': 'quality',

  // Documentation (4 plugins)
  'documentation': 'software-dev',
  'markdown-documentation': 'software-dev',
  'readme-generator': 'software-dev',
  'technical-writing': 'software-dev',

  // Project Management (3 plugins)
  'agile': 'general',
  'project-management': 'general',
  'scrum': 'general',

  // Cloud (4 plugins)
  'aws': 'operations',
  'azure': 'operations',
  'cloud': 'operations',
  'gcp': 'operations',

  // Mobile (4 plugins)
  'android': 'frontend',
  'ios': 'frontend',
  'mobile-app': 'frontend',
  'react-native': 'frontend',

  // Legacy & Modernization (2 plugins)
  'legacy-code': 'software-dev',
  'modernization': 'architecture',

  // Web Development (5 plugins)
  'fullstack': 'software-dev',
  'web-development': 'frontend',
  'web-performance': 'frontend',
  'web-security': 'security',
  'websocket': 'backend',

  // AI/ML (5 plugins)
  'ai-integration': 'data',
  'machine-learning': 'data',
  'ml-ops': 'operations',
  'model-training': 'data',
  'nlp': 'data',

  // Other (2 plugins)
  'cli-tool': 'software-dev',
  'desktop-app': 'frontend',

  // Inherited/Compound (9 plugins)
  'accessibility': 'quality',
  'authentication': 'backend',
  'error-diagnostic': 'quality',
  'error-handling': 'backend',
  'error-recovery': 'operations',
  'identity-access-management': 'security',
  'intelligent-transportation': 'data',
  'internet-of-things': 'operations',
  'iot-security': 'security'
};

/**
 * Get domain for plugin, with fallback
 *
 * @param pluginName - The name of the plugin
 * @returns The domain for this plugin
 */
export function getPluginDomain(pluginName: string): string {
  return PLUGIN_DOMAIN_MAP[pluginName] || inheritDomain(pluginName);
}

/**
 * Inherit domain from plugin name pattern
 *
 * @param pluginName - The name of the plugin
 * @returns The inherited domain
 */
function inheritDomain(pluginName: string): string {
  const match = pluginName.match(/^([\w-]+)-/);
  return match ? match[1] : 'general';
}
