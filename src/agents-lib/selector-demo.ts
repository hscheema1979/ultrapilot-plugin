/**
 * Agent Selector Demo
 *
 * Demonstrates the intelligent agent selection system.
 */

import { AgentSelector } from './selector.js';
import { InMemoryAgentRepository } from './repositories/in-memory.js';
import type { Agent } from './types.js';

/**
 * Demo: Show how the selector analyzes tasks and selects agents
 */
export async function demoAgentSelector() {
  console.log('\n=== Agent Selector Demo ===\n');

  // Initialize repository
  const repository = new InMemoryAgentRepository();

  // For demo purposes, we'll create a test repository with sample agents
  // In production, this would scan actual plugin directories
  await createDemoRepository(repository);

  const selector = new AgentSelector(repository);

  // Test 1: Simple API task
  console.log('Test 1: Simple API task');
  console.log('Task: "Create a simple REST API for user management"');
  const selection1 = await selector.selectAgent(
    'Create a simple REST API for user management',
    { fallbackChain: true, maxAgents: 3 }
  );

  console.log(`Selected: ${selection1.agent.name}`);
  console.log(`Confidence: ${(selection1.confidence * 100).toFixed(1)}%`);
  console.log(`Reasoning: ${selection1.reasoning}`);
  console.log(`Fallback chain: ${selection1.fallbackChain.map(a => a.name).join(', ') || 'none'}`);
  console.log(`Alternatives: ${selection1.alternatives.map(a => a.name).join(', ') || 'none'}`);
  console.log(`Task analysis:`, selection1.taskAnalysis);
  console.log();

  // Test 2: Frontend task
  console.log('Test 2: Frontend task');
  console.log('Task: "Build a responsive React component with TypeScript"');
  const selection2 = await selector.selectAgent(
    'Build a responsive React component with TypeScript'
  );

  console.log(`Selected: ${selection2.agent.name}`);
  console.log(`Confidence: ${(selection2.confidence * 100).toFixed(1)}%`);
  console.log(`Reasoning: ${selection2.reasoning}`);
  console.log();

  // Test 3: Complex architecture task
  console.log('Test 3: Complex architecture task');
  console.log('Task: "Design a comprehensive distributed microservices architecture"');
  const selection3 = await selector.selectAgent(
    'Design a comprehensive distributed microservices architecture'
  );

  console.log(`Selected: ${selection3.agent.name}`);
  console.log(`Confidence: ${(selection3.confidence * 100).toFixed(1)}%`);
  console.log(`Reasoning: ${selection3.reasoning}`);
  console.log(`Complexity penalty: ${(selection1.confidence - selection3.confidence > 0 ? 'Yes' : 'No')}`);
  console.log();

  // Test 4: Testing task
  console.log('Test 4: Testing task');
  console.log('Task: "Write integration tests for the authentication service"');
  const selection4 = await selector.selectAgent(
    'Write integration tests for the authentication service'
  );

  console.log(`Selected: ${selection4.agent.name}`);
  console.log(`Confidence: ${(selection4.confidence * 100).toFixed(1)}%`);
  console.log(`Reasoning: ${selection4.reasoning}`);
  console.log();

  // Test 5: Get multiple candidates
  console.log('Test 5: Get top candidates without selecting');
  console.log('Task: "Create an API with authentication"');
  const candidates = await selector.getCandidates('Create an API with authentication', 5);

  console.log('Top candidates:');
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`  ${i + 1}. ${c.agent.name} - confidence: ${(c.confidence * 100).toFixed(1)}%`);
    console.log(`     Capability: ${(c.capabilityScore * 100).toFixed(0)}%, ` +
                `Success: ${(c.successRateScore * 100).toFixed(0)}%, ` +
                `Category: ${(c.categoryScore * 100).toFixed(0)}%, ` +
                `Status: ${(c.statusScore * 100).toFixed(0)}%`);
  }
  console.log();

  // Test 6: Task analysis only
  console.log('Test 6: Task analysis examples');
  const tasks = [
    'Fix a simple bug in the login form',
    'Create a comprehensive ETL pipeline for data migration',
    'Deploy the application to Kubernetes with CI/CD',
    'Write documentation for the REST API',
  ];

  for (const task of tasks) {
    const analysis = selector.analyzeTask(task);
    console.log(`Task: "${task}"`);
    console.log(`  Capabilities: ${analysis.capabilities.join(', ')}`);
    console.log(`  Category: ${analysis.category || 'none'}`);
    console.log(`  Complexity: ${analysis.complexity}`);
    console.log(`  Key phrases: ${analysis.keyPhrases.join(', ')}`);
    console.log();
  }

  console.log('=== Demo Complete ===\n');
}

/**
 * Create a demo repository with sample agents
 */
async function createDemoRepository(repository: InMemoryAgentRepository): Promise<void> {
  // In production, this would call repository.initialize(pluginsDir)
  // For demo, we'll manually inject sample agents

  const sampleAgents: Agent[] = [
    {
      name: 'backend-developer',
      plugin: 'core',
      path: '/plugins/core/backend-developer.md',
      description: 'Expert in backend development, APIs, and databases',
      capabilities: [
        { name: 'api', hierarchy: ['backend', 'api'], confidence: 0.95 },
        { name: 'rest-api', hierarchy: ['backend', 'api', 'rest'], confidence: 0.9 },
        { name: 'database', hierarchy: ['backend', 'database'], confidence: 0.85 },
        { name: 'authentication', hierarchy: ['backend', 'security', 'auth'], confidence: 0.8 },
      ],
      category: 'backend',
      examples: [
        'Create a REST API for user management',
        'Implement authentication with JWT',
        'Design database schema for e-commerce',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 30, // 30 minutes ago
      successRate: 0.95,
    },
    {
      name: 'frontend-developer',
      plugin: 'core',
      path: '/plugins/core/frontend-developer.md',
      description: 'Expert in frontend development, UI/UX, and modern frameworks',
      capabilities: [
        { name: 'ui', hierarchy: ['frontend', 'ui'], confidence: 0.95 },
        { name: 'react', hierarchy: ['frontend', 'framework', 'react'], confidence: 0.9 },
        { name: 'css', hierarchy: ['frontend', 'styling', 'css'], confidence: 0.85 },
        { name: 'responsive', hierarchy: ['frontend', 'ui', 'responsive'], confidence: 0.8 },
      ],
      category: 'frontend',
      examples: [
        'Build a responsive React component',
        'Implement dark mode with CSS',
        'Create accessible UI components',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 60, // 1 hour ago
      successRate: 0.9,
    },
    {
      name: 'fullstack-developer',
      plugin: 'core',
      path: '/plugins/core/fullstack-developer.md',
      description: 'Full-stack developer capable of handling both frontend and backend tasks',
      capabilities: [
        { name: 'api', hierarchy: ['backend', 'api'], confidence: 0.7 },
        { name: 'ui', hierarchy: ['frontend', 'ui'], confidence: 0.7 },
        { name: 'database', hierarchy: ['backend', 'database'], confidence: 0.6 },
        { name: 'react', hierarchy: ['frontend', 'framework', 'react'], confidence: 0.65 },
      ],
      category: 'backend',
      examples: [
        'Build a full-stack CRUD application',
        'Create API and integrate with frontend',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 120, // 2 hours ago
      successRate: 0.75,
    },
    {
      name: 'qa-engineer',
      plugin: 'core',
      path: '/plugins/core/qa-engineer.md',
      description: 'Quality assurance engineer specializing in testing',
      capabilities: [
        { name: 'testing', hierarchy: ['testing'], confidence: 0.95 },
        { name: 'unit-test', hierarchy: ['testing', 'unit'], confidence: 0.9 },
        { name: 'integration-test', hierarchy: ['testing', 'integration'], confidence: 0.85 },
        { name: 'e2e-testing', hierarchy: ['testing', 'e2e'], confidence: 0.8 },
      ],
      category: 'testing',
      examples: [
        'Write unit tests for business logic',
        'Create integration test suite',
        'Set up E2E testing pipeline',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 45, // 45 minutes ago
      successRate: 0.92,
    },
    {
      name: 'devops-engineer',
      plugin: 'core',
      path: '/plugins/core/devops-engineer.md',
      description: 'DevOps engineer specializing in deployment and infrastructure',
      capabilities: [
        { name: 'deployment', hierarchy: ['devops', 'deployment'], confidence: 0.95 },
        { name: 'docker', hierarchy: ['devops', 'containerization', 'docker'], confidence: 0.9 },
        { name: 'kubernetes', hierarchy: ['devops', 'orchestration', 'kubernetes'], confidence: 0.85 },
        { name: 'ci-cd', hierarchy: ['devops', 'ci-cd'], confidence: 0.9 },
      ],
      category: 'devops',
      examples: [
        'Deploy application to production',
        'Set up CI/CD pipeline',
        'Configure Kubernetes cluster',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 90, // 1.5 hours ago
      successRate: 0.88,
    },
    {
      name: 'technical-writer',
      plugin: 'core',
      path: '/plugins/core/technical-writer.md',
      description: 'Technical writer for documentation',
      capabilities: [
        { name: 'documentation', hierarchy: ['documentation'], confidence: 0.95 },
        { name: 'api-documentation', hierarchy: ['documentation', 'api'], confidence: 0.9 },
        { name: 'writing', hierarchy: ['documentation', 'writing'], confidence: 0.85 },
      ],
      category: 'documentation',
      examples: [
        'Write API documentation',
        'Create user guide',
        'Document architecture decisions',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 180, // 3 hours ago
      successRate: 0.9,
    },
    {
      name: 'system-architect',
      plugin: 'core',
      path: '/plugins/core/system-architect.md',
      description: 'System architect for complex system design',
      capabilities: [
        { name: 'architecture', hierarchy: ['architecture'], confidence: 0.95 },
        { name: 'system-design', hierarchy: ['architecture', 'system'], confidence: 0.9 },
        { name: 'design-patterns', hierarchy: ['architecture', 'patterns'], confidence: 0.85 },
      ],
      category: 'architecture',
      examples: [
        'Design distributed system architecture',
        'Plan microservices migration',
        'Define system integration patterns',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 150, // 2.5 hours ago
      successRate: 0.85,
    },
    {
      name: 'security-specialist',
      plugin: 'core',
      path: '/plugins/core/security-specialist.md',
      description: 'Security specialist for authentication and vulnerability assessment',
      capabilities: [
        { name: 'security', hierarchy: ['security'], confidence: 0.95 },
        { name: 'authentication', hierarchy: ['security', 'auth'], confidence: 0.9 },
        { name: 'vulnerability', hierarchy: ['security', 'vulnerability'], confidence: 0.85 },
      ],
      category: 'security',
      examples: [
        'Implement authentication system',
        'Conduct security audit',
        'Fix security vulnerabilities',
      ],
      metadata: {
        frontmatter: {},
        content: '',
      },
      status: 'idle',
      lastUsed: Date.now() - 1000 * 60 * 200, // 3.3 hours ago
      successRate: 0.87,
    },
  ];

  // Manually inject agents into the repository
  // Note: This is a workaround for demo purposes
  // In production, use repository.initialize(pluginsDir)
  for (const agent of sampleAgents) {
    await repository.save(agent);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demoAgentSelector().catch(console.error);
}
