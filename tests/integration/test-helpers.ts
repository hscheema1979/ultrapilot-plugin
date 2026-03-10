/**
 * Test Helpers for GitHub Migration Integration Tests
 *
 * Provides utilities for:
 * - Creating and managing test GitHub repositories
 * - Mocking GitHub API responses
 * - Creating test state files
 * - Setting up test fixtures
 */

import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';

/**
 * Test GitHub repository configuration
 */
export interface TestGitHubRepo {
  owner: string;
  repo: string;
  token?: string;
  testIssueNumber?: number;
}

/**
 * Test state file configuration
 */
export interface TestStateFile {
  path: string;
  content: Record<string, any>;
}

/**
 * Mock GitHub issue response
 */
export interface MockGitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
}

/**
 * Create a temporary directory for test files
 */
export async function createTestDir(basePath: string = '/tmp'): Promise<string> {
  const dirId = randomBytes(8).toString('hex');
  const testDir = join(basePath, `ultrapilot-test-${dirId}`);

  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Clean up test directory
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true, force: true });
  }
}

/**
 * Create test state files in the specified directory
 */
export async function createTestStateFiles(
  stateDir: string,
  states: Array<{ name: string; content: Record<string, any> }>
): Promise<string[]> {
  const createdPaths: string[] = [];

  for (const state of states) {
    const statePath = join(stateDir, `${state.name}.json`);
    await writeFile(statePath, JSON.stringify(state.content, null, 2), 'utf-8');
    createdPaths.push(statePath);
  }

  return createdPaths;
}

/**
 * Create a sample autopilot state file
 */
export function createSampleAutopilotState(): Record<string, any> {
  return {
    phase: 'execution',
    status: 'running',
    currentAgent: 'ultra:executor',
    startTime: new Date().toISOString(),
    context: {
      task: 'Build a REST API',
      workspace: '/test/workspace'
    },
    metrics: {
      tasksCompleted: 5,
      tasksTotal: 12,
      iterations: 2
    }
  };
}

/**
 * Create a sample ralph state file
 */
export function createSampleRalphState(): Record<string, any> {
  return {
    loopIteration: 3,
    maxIterations: 10,
    currentAttempt: 1,
    lastError: null,
    loopType: 'persistent',
    startTime: new Date().toISOString(),
    completedSteps: ['init', 'analyze', 'plan'],
    pendingSteps: ['execute', 'verify']
  };
}

/**
 * Create a sample ultraqa state file
 */
export function createSampleUltraQAState(): Record<string, any> {
  return {
    cycle: 2,
    maxCycles: 5,
    phase: 'fixing',
    lastBuildStatus: 'failed',
    testResults: {
      passing: 42,
      failing: 3,
      skipped: 2
    },
    errors: [
      {
        test: 'should authenticate users',
        error: 'Expected 200 but got 401',
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Create a sample validation state file
 */
export function createSampleValidationState(): Record<string, any> {
  return {
    reviewers: ['security', 'quality', 'code'],
    status: 'in_progress',
    completedReviews: ['security'],
    pendingReviews: ['quality', 'code'],
    findings: {
      security: {
        status: 'approved',
        issues: []
      },
      quality: {
        status: 'pending',
        issues: []
      },
      code: {
        status: 'pending',
        issues: []
      }
    }
  };
}

/**
 * Create a sample task queue state
 */
export function createSampleTaskQueueState(): Record<string, any> {
  return {
    queueName: 'intake',
    taskCount: 3,
    tasks: [
      {
        id: 'TASK-1',
        title: 'Implement authentication',
        priority: 'high',
        size: 'lg',
        created_at: new Date().toISOString()
      },
      {
        id: 'TASK-2',
        title: 'Create database schema',
        priority: 'critical',
        size: 'xl',
        created_at: new Date().toISOString()
      },
      {
        id: 'TASK-3',
        title: 'Write unit tests',
        priority: 'medium',
        size: 'md',
        created_at: new Date().toISOString()
      }
    ]
  };
}

/**
 * Create a sample migration progress state
 */
export function createSampleMigrationProgress(): Record<string, any> {
  return {
    phase: 'execution',
    step: 5,
    totalSteps: 12,
    status: 'in_progress',
    startedAt: new Date(Date.now() - 300000).toISOString(),
    completedSteps: [
      'backup',
      'migrate_autopilot',
      'migrate_ralph',
      'migrate_ultraqa',
      'migrate_validation'
    ],
    rollbackPoints: [
      {
        step: 'backup',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        backupPath: '/test/backup'
      }
    ],
    errors: []
  };
}

/**
 * Create mock GitHub issue response
 */
export function createMockIssue(overrides: Partial<MockGitHubIssue> = {}): MockGitHubIssue {
  return {
    number: 1,
    title: 'Test Issue',
    body: '---\nstate_id: st_test_123\ntype: autopilot_state\nupdated_at: 2026-03-04T12:00:00Z\nversion: 1\n---\n\nTest content',
    state: 'open',
    labels: [
      { name: 'test', color: 'ededed' }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create mock GitHub API response for issues list
 */
export function createMockIssuesResponse(count: number = 5): MockGitHubIssue[] {
  return Array.from({ length: count }, (_, i) => createMockIssue({
    number: i + 1,
    title: `Test Issue ${i + 1}`,
    body: `---\nstate_id: st_test_${i + 1}\ntype: autopilot_state\nupdated_at: ${new Date().toISOString()}\nversion: 1\n---\n\nTest content ${i + 1}`
  }));
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> {
  const {
    timeout = 5000,
    interval = 100,
    message = 'Condition not met within timeout'
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(message);
}

/**
 * Delay for a specified duration
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random test ID
 */
export function generateTestId(): string {
  return `test_${randomBytes(8).toString('hex')}`;
}

/**
 * Create a test GitHub repository configuration
 */
export function createTestGitHubConfig(overrides: Partial<TestGitHubRepo> = {}): TestGitHubRepo {
  return {
    owner: 'test-owner',
    repo: `test-repo-${randomBytes(4).toString('hex')}`,
    token: process.env.GITHUB_TOKEN || 'test-token',
    ...overrides
  };
}

/**
 * Read and parse a JSON file
 */
export async function readJSONFile<T = any>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Write a JSON file
 */
export async function writeJSONFile(filePath: string, data: any): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Create a mock GitHub service (for unit testing)
 */
export class MockGitHubService {
  private issues: Map<number, MockGitHubIssue> = new Map();
  private issueCounter = 1;

  constructor() {
    // Initialize with some test issues
    const mockIssues = createMockIssuesResponse(3);
    mockIssues.forEach(issue => {
      this.issues.set(issue.number, issue);
    });
    this.issueCounter = 4;
  }

  async getTask(issueNumber: number): Promise<MockGitHubIssue | null> {
    return this.issues.get(issueNumber) || null;
  }

  async createTask(data: { title: string; body?: string; labels?: string[] }): Promise<MockGitHubIssue> {
    const issue: MockGitHubIssue = {
      number: this.issueCounter++,
      title: data.title,
      body: data.body || '',
      state: 'open',
      labels: (data.labels || []).map(label => ({ name: label, color: 'ededed' })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.issues.set(issue.number, issue);
    return issue;
  }

  async updateTask(issueNumber: number, data: { body?: string }): Promise<MockGitHubIssue> {
    const issue = this.issues.get(issueNumber);
    if (!issue) {
      throw new Error(`Issue ${issueNumber} not found`);
    }

    const updated: MockGitHubIssue = {
      ...issue,
      ...data,
      updated_at: new Date().toISOString()
    };

    this.issues.set(issueNumber, updated);
    return updated;
  }

  async getIssue(issueNumber: number): Promise<MockGitHubIssue | null> {
    return this.getTask(issueNumber);
  }

  async createIssue(title: string, body: string): Promise<MockGitHubIssue> {
    return this.createTask({ title, body });
  }

  async updateIssue(issueNumber: number, data: { body?: string }): Promise<MockGitHubIssue> {
    return this.updateTask(issueNumber, data);
  }

  async searchIssues(query: string): Promise<MockGitHubIssue[]> {
    // Simple mock search - return all issues
    return Array.from(this.issues.values());
  }

  async addLabel(issueNumber: number, label: string): Promise<void> {
    const issue = this.issues.get(issueNumber);
    if (issue) {
      issue.labels.push({ name: label, color: 'ededed' });
    }
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    const issue = this.issues.get(issueNumber);
    if (issue) {
      issue.labels = issue.labels.filter(l => l.name !== label);
    }
  }

  getOwner(): string {
    return 'test-owner';
  }

  getRepo(): string {
    return 'test-repo';
  }

  async graphql(query: string, variables: Record<string, any>): Promise<any> {
    // Mock GraphQL response
    return {
      repository: {
        issues: {
          nodes: Array.from(this.issues.values())
        }
      }
    };
  }

  // Helper methods for testing

  getIssueCount(): number {
    return this.issues.size;
  }

  clearIssues(): void {
    this.issues.clear();
    this.issueCounter = 1;
  }

  getIssues(): MockGitHubIssue[] {
    return Array.from(this.issues.values());
  }
}

/**
 * Test fixture manager
 */
export class TestFixtureManager {
  private testDir: string | null = null;
  private mockGitHub: MockGitHubService | null = null;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  async setup(): Promise<void> {
    // Create test directory
    this.testDir = await createTestDir();
    this.cleanupCallbacks.push(() => cleanupTestDir(this.testDir!));

    // Create mock GitHub service
    this.mockGitHub = new MockGitHubService();
  }

  async teardown(): Promise<void> {
    // Run all cleanup callbacks
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }

    this.cleanupCallbacks = [];
    this.testDir = null;
    this.mockGitHub = null;
  }

  getTestDir(): string {
    if (!this.testDir) {
      throw new Error('Test fixture not initialized. Call setup() first.');
    }
    return this.testDir;
  }

  getMockGitHub(): MockGitHubService {
    if (!this.mockGitHub) {
      throw new Error('Test fixture not initialized. Call setup() first.');
    }
    return this.mockGitHub;
  }

  addCleanupCallback(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }
}

/**
 * Assertions helpers for test validation
 */
export class TestAssertions {
  static assertStateObject(state: any): void {
    expect(state).toHaveProperty('state_id');
    expect(state).toHaveProperty('type');
    expect(state).toHaveProperty('updated_at');
    expect(state).toHaveProperty('version');
    expect(state).toHaveProperty('data');
  }

  static assertIssueHasState(issue: MockGitHubIssue): void {
    expect(issue.body).toBeDefined();
    expect(issue.body).toMatch(/^---\n/);
    expect(issue.body).toMatch(/\n---\n/);
  }

  static assertYamlFrontmatter(body: string): void {
    const match = body.match(/^---\n([\s\S]*?)\n---/);
    expect(match).toBeTruthy();
    expect(match).toHaveLength(2);
  }

  static assertQueueLabel(label: string): void {
    expect(label).toMatch(/^queue:/);
  }

  static assertAgentLabel(label: string): void {
    expect(label).toMatch(/^ultra:/);
  }
}
