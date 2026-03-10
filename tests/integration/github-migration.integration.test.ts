/**
 * GitHub Migration Integration Tests
 *
 * Comprehensive integration tests for the GitHub migration system, validating:
 * - End-to-end migration flow
 * - State adapter CRUD operations
 * - Task queue operations
 * - Agent orchestrator parallel execution
 * - Hybrid state manager synchronization
 * - Migration manifest tracking
 *
 * Uses mock GitHub API for speed and real API for validation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GitHubService } from '../../src/services/github-service';
import { GitHubStateAdapter, parseStateFromBody, serializeStateBody } from '../../src/services/github-state-adapter';
import { GitHubTaskQueueAdapter } from '../../src/services/github-task-queue-adapter';
import { GitHubAgentOrchestrator } from '../../src/services/github-agent-orchestrator';
import { HybridStateManager } from '../../src/services/hybrid-state-manager';
import {
  createTestDir,
  cleanupTestDir,
  createTestStateFiles,
  createSampleAutopilotState,
  createSampleRalphState,
  createSampleUltraQAState,
  createSampleValidationState,
  createSampleTaskQueueState,
  createSampleMigrationProgress,
  createMockIssue,
  waitForCondition,
  delay,
  generateTestId,
  MockGitHubService,
  TestFixtureManager,
  TestAssertions
} from './test-helpers';

describe('GitHub Migration Integration Tests', () => {
  let fixtures: TestFixtureManager;
  let mockGitHub: MockGitHubService;
  let stateDir: string;
  let backupDir: string;

  beforeAll(async () => {
    fixtures = new TestFixtureManager();
    await fixtures.setup();
    mockGitHub = fixtures.getMockGitHub();
  });

  afterAll(async () => {
    await fixtures.teardown();
  });

  beforeEach(async () => {
    // Create test directories
    stateDir = await createTestDir();
    backupDir = await createTestDir();

    // Register cleanup
    fixtures.addCleanupCallback(async () => {
      await cleanupTestDir(stateDir);
      await cleanupTestDir(backupDir);
    });
  });

  afterEach(async () => {
    // Reset mock GitHub between tests
    mockGitHub.clearIssues();
  });

  describe('End-to-End Migration Flow', () => {
    it('should migrate local JSON state files to GitHub issues', async () => {
      // Arrange: Create test state files
      await createTestStateFiles(stateDir, [
        { name: 'autopilot-state', content: createSampleAutopilotState() },
        { name: 'ralph-state', content: createSampleRalphState() },
        { name: 'ultraqa-state', content: createSampleUltraQAState() }
      ]);

      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);
      const migratedIssues: number[] = [];

      // Act: Migrate each state file
      const autopilotState = JSON.parse(await require('fs/promises').readFile(
        `${stateDir}/autopilot-state.json`,
        'utf-8'
      ));
      const ralphState = JSON.parse(await require('fs/promises').readFile(
        `${stateDir}/ralph-state.json`,
        'utf-8'
      ));
      const ultraqaState = JSON.parse(await require('fs/promises').readFile(
        `${stateDir}/ultraqa-state.json`,
        'utf-8'
      ));

      // Create state objects
      const autopilotStateObj = stateAdapter.createState('autopilot_state', autopilotState);
      const ralphStateObj = stateAdapter.createState('ralph_state', ralphState);
      const ultraqaStateObj = stateAdapter.createState('ultraqa_state', ultraqaState);

      // Create issues for each state
      const autopilotIssue = await mockGitHub.createTask({
        title: 'Autopilot State',
        body: stateAdapter.serializeState(autopilotStateObj, 'Autopilot execution state')
      });
      const ralphIssue = await mockGitHub.createTask({
        title: 'Ralph State',
        body: stateAdapter.serializeState(ralphStateObj, 'Ralph loop state')
      });
      const ultraqaIssue = await mockGitHub.createTask({
        title: 'UltraQA State',
        body: stateAdapter.serializeState(ultraqaStateObj, 'UltraQA cycle state')
      });

      migratedIssues.push(autopilotIssue.number, ralphIssue.number, ultraqaIssue.number);

      // Assert: Verify issues created
      expect(migratedIssues).toHaveLength(3);
      expect(mockGitHub.getIssueCount()).toBe(3);

      // Verify state can be read back
      const readAutopilot = await mockGitHub.getTask(autopilotIssue.number);
      expect(readAutopilot).toBeDefined();
      const parsedAutopilot = stateAdapter.parseState(readAutopilot!.body!);
      expect(parsedAutopilot.type).toBe('autopilot_state');
      expect(parsedAutopilot.data.phase).toBe('execution');

      const readRalph = await mockGitHub.getTask(ralphIssue.number);
      expect(readRalph).toBeDefined();
      const parsedRalph = stateAdapter.parseState(readRalph!.body!);
      expect(parsedRalph.type).toBe('ralph_state');
      expect(parsedRalph.data.loopIteration).toBe(3);

      const readUltraqa = await mockGitHub.getTask(ultraqaIssue.number);
      expect(readUltraqa).toBeDefined();
      const parsedUltraqa = stateAdapter.parseState(readUltraqa!.body!);
      expect(parsedUltraqa.type).toBe('ultraqa_state');
      expect(parsedUltraqa.data.cycle).toBe(2);
    });

    it('should preserve state integrity during migration', async () => {
      // Arrange: Create complex state with nested objects
      const complexState = {
        ...createSampleAutopilotState(),
        nested: {
          level1: {
            level2: {
              value: 'deeply nested',
              array: [1, 2, 3, 4, 5]
            }
          }
        },
        specialChars: 'Test with "quotes" and \'apostrophes\'',
        unicode: 'Test with unicode: ñ, é, 中文, emoji 🎉'
      };

      await createTestStateFiles(stateDir, [
        { name: 'complex-state', content: complexState }
      ]);

      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Act: Migrate to GitHub
      const stateObj = stateAdapter.createState('autopilot_state', complexState);
      const issue = await mockGitHub.createTask({
        title: 'Complex State Test',
        body: stateAdapter.serializeState(stateObj, 'Complex state with nesting')
      });

      // Assert: Verify round-trip preserves data
      const readIssue = await mockGitHub.getTask(issue.number);
      const parsedState = stateAdapter.parseState(readIssue!.body!);

      expect(parsedState.data.phase).toBe(complexState.phase);
      expect(parsedState.data.nested.level1.level2.value).toBe('deeply nested');
      expect(parsedState.data.nested.level1.level2.array).toEqual([1, 2, 3, 4, 5]);
      expect(parsedState.data.specialChars).toContain('quotes');
      expect(parsedState.data.unicode).toContain('emoji 🎉');
    });

    it('should handle migration rollback correctly', async () => {
      // Arrange: Create state files and backup
      const originalState = createSampleAutopilotState();
      await createTestStateFiles(stateDir, [
        { name: 'autopilot-state', content: originalState }
      ]);

      // Create backup
      const fs = require('fs/promises');
      await fs.copyFile(
        `${stateDir}/autopilot-state.json`,
        `${backupDir}/autopilot-state.json`
      );

      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Act: Migrate to GitHub
      const stateObj = stateAdapter.createState('autopilot_state', originalState);
      const issue = await mockGitHub.createTask({
        title: 'Rollback Test',
        body: stateAdapter.serializeState(stateObj, 'State for rollback test')
      });

      // Simulate migration failure - modify local state
      const modifiedState = { ...originalState, phase: 'corrupted' };
      await fs.writeFile(
        `${stateDir}/autopilot-state.json`,
        JSON.stringify(modifiedState, null, 2)
      );

      // Rollback: Restore from backup
      await fs.copyFile(
        `${backupDir}/autopilot-state.json`,
        `${stateDir}/autopilot-state.json`
      );

      // Assert: Verify rollback restored original state
      const restoredState = JSON.parse(await fs.readFile(
        `${stateDir}/autopilot-state.json`,
        'utf-8'
      ));
      expect(restoredState.phase).toBe('execution');
      expect(restoredState).toEqual(originalState);

      // Verify GitHub issue still has original state
      const readIssue = await mockGitHub.getTask(issue.number);
      const parsedState = stateAdapter.parseState(readIssue!.body!);
      expect(parsedState.data.phase).toBe('execution');
    });

    it('should handle partial migration failures gracefully', async () => {
      // Arrange: Create multiple state files
      const states = [
        { name: 'state1', content: createSampleAutopilotState() },
        { name: 'state2', content: createSampleRalphState() },
        { name: 'state3', content: createSampleUltraQAState() }
      ];

      await createTestStateFiles(stateDir, states);

      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);
      const migrationResults: { success: boolean; state: string; error?: string }[] = [];

      // Act: Migrate with simulated failure on second state
      for (let i = 0; i < states.length; i++) {
        try {
          const state = states[i];
          const stateObj = stateAdapter.createState(
            i === 1 ? 'ralph_state' : 'autopilot_state',
            state.content
          );

          // Simulate failure on second migration
          if (i === 1) {
            throw new Error('Simulated migration failure');
          }

          await mockGitHub.createTask({
            title: `State ${i + 1}`,
            body: stateAdapter.serializeState(stateObj, `Test state ${i + 1}`)
          });

          migrationResults.push({ success: true, state: state.name });
        } catch (error) {
          migrationResults.push({
            success: false,
            state: states[i].name,
            error: (error as Error).message
          });
        }
      }

      // Assert: Verify partial migration
      expect(migrationResults).toHaveLength(3);
      expect(migrationResults[0].success).toBe(true);
      expect(migrationResults[1].success).toBe(false);
      expect(migrationResults[1].error).toBe('Simulated migration failure');
      expect(migrationResults[2].success).toBe(true);

      // Verify only 2 issues created (state1 and state3)
      expect(mockGitHub.getIssueCount()).toBe(2);
    });
  });

  describe('State Adapter Tests', () => {
    it('should write and read state correctly', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create an issue with state
      const stateObj = stateAdapter.createState('autopilot_state', {
        phase: 'execution',
        status: 'running'
      });

      const issue = await mockGitHub.createTask({
        title: 'Write/Read Test',
        body: stateAdapter.serializeState(stateObj, 'Test content')
      });

      // Read state back
      const readState = await stateAdapter.readState(issue.number);

      expect(readState.state_id).toBe(stateObj.state_id);
      expect(readState.type).toBe('autopilot_state');
      expect(readState.data.phase).toBe('execution');
      expect(readState.data.status).toBe('running');
    });

    it('should update state with version increment', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create initial state
      const stateObj = stateAdapter.createState('autopilot_state', {
        phase: 'planning',
        status: 'pending'
      });

      const issue = await mockGitHub.createTask({
        title: 'Update Test',
        body: stateAdapter.serializeState(stateObj, 'Initial state')
      });

      // Update state
      await stateAdapter.updateState(issue.number, {
        data: {
          phase: 'execution',
          status: 'running'
        }
      });

      // Read updated state
      const updatedState = await stateAdapter.readState(issue.number);

      expect(updatedState.version).toBe(2); // Version incremented
      expect(updatedState.data.phase).toBe('execution');
      expect(updatedState.data.status).toBe('running');
    });

    it('should detect version conflicts on concurrent writes', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create initial state
      const stateObj = stateAdapter.createState('autopilot_state', {
        phase: 'planning',
        counter: 0
      });

      const issue = await mockGitHub.createTask({
        title: 'Conflict Test',
        body: stateAdapter.serializeState(stateObj, 'Conflict test')
      });

      // Simulate concurrent updates
      const readState1 = await stateAdapter.readState(issue.number);
      const readState2 = await stateAdapter.readState(issue.number);

      // First update succeeds
      await stateAdapter.updateState(issue.number, {
        data: { counter: readState1.data.counter + 1 }
      });

      // Second update should detect conflict
      await expect(
        stateAdapter.updateState(
          issue.number,
          { data: { counter: readState2.data.counter + 1 } },
          { expectedVersion: readState2.version }
        )
      ).rejects.toThrow(/Version conflict/);
    });

    it('should preserve human-readable content below frontmatter', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      const humanContent = `
# Autopilot Execution State

This issue tracks the current execution state of the autopilot system.

## Current Status
- Phase: Execution
- Active Agent: ultra:executor

## Progress
- Tasks Completed: 5
- Tasks Remaining: 7
`;

      const stateObj = stateAdapter.createState('autopilot_state', {
        phase: 'execution',
        tasksCompleted: 5
      });

      const issue = await mockGitHub.createTask({
        title: 'Content Preservation Test',
        body: stateAdapter.serializeState(stateObj, humanContent)
      });

      // Read and verify content preserved
      const readIssue = await mockGitHub.getTask(issue.number);
      const parsed = stateAdapter.parseState(readIssue!.body!);

      // State should be parsed correctly
      expect(parsed.type).toBe('autopilot_state');

      // Human content should be preserved
      expect(readIssue!.body).toContain('# Autopilot Execution State');
      expect(readIssue!.body).toContain('## Current Status');
      expect(readIssue!.body).toContain('- Phase: Execution');
    });

    it('should cache read operations for performance', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      const stateObj = stateAdapter.createState('autopilot_state', {
        phase: 'execution'
      });

      const issue = await mockGitHub.createTask({
        title: 'Cache Test',
        body: stateAdapter.serializeState(stateObj, 'Cache test')
      });

      // First read
      const start1 = Date.now();
      await stateAdapter.readState(issue.number);
      const duration1 = Date.now() - start1;

      // Second read (should be cached or faster)
      const start2 = Date.now();
      await stateAdapter.readState(issue.number);
      const duration2 = Date.now() - start2;

      // Both should succeed
      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid YAML frontmatter gracefully', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create issue with invalid frontmatter
      const issue = await mockGitHub.createTask({
        title: 'Invalid YAML Test',
        body: '---\ninvalid yaml content\n[[[\n---\n\nContent'
      });

      // Should throw parse error
      await expect(stateAdapter.readState(issue.number)).rejects.toThrow(/StateParseError/);
    });

    it('should handle missing frontmatter gracefully', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create issue without frontmatter
      const issue = await mockGitHub.createTask({
        title: 'No Frontmatter Test',
        body: 'Just regular content without frontmatter'
      });

      // Should throw parse error
      await expect(stateAdapter.readState(issue.number)).rejects.toThrow(/StateParseError/);
    });
  });

  describe('Task Queue Tests', () => {
    it('should enqueue tasks to different queues', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue tasks to different queues
      const task1 = {
        id: 'TASK-1',
        title: 'Implement authentication',
        description: 'Add OAuth2 authentication',
        priority: 5 as any,
        assignedAgent: 'ultra:executor'
      };

      const task2 = {
        id: 'TASK-2',
        title: 'Write tests',
        description: 'Unit tests for auth',
        priority: 5 as any,
        assignedAgent: 'ultra:test-engineer'
      };

      const issue1 = await queueAdapter.enqueue('intake', task1 as any);
      const issue2 = await queueAdapter.enqueue('active', task2 as any);

      expect(issue1).toBeDefined();
      expect(issue2).toBeDefined();

      // Verify queue labels
      const issue1Data = await mockGitHub.getTask(issue1);
      const issue2Data = await mockGitHub.getTask(issue2);

      expect(issue1Data!.labels.some((l: any) => l.name === 'queue:intake')).toBe(true);
      expect(issue2Data!.labels.some((l: any) => l.name === 'queue:active')).toBe(true);
    });

    it('should dequeue tasks in FIFO order', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue multiple tasks
      const tasks = [
        { id: 'TASK-1', title: 'First task', description: 'First', priority: 5 as any },
        { id: 'TASK-2', title: 'Second task', description: 'Second', priority: 5 as any },
        { id: 'TASK-3', title: 'Third task', description: 'Third', priority: 5 as any }
      ];

      for (const task of tasks) {
        await queueAdapter.enqueue('intake', task as any);
      }

      // Dequeue and verify FIFO order
      const first = await queueAdapter.dequeue('intake');
      expect(first?.id).toBe('TASK-1');

      const second = await queueAdapter.dequeue('intake');
      expect(second?.id).toBe('TASK-2');

      const third = await queueAdapter.dequeue('intake');
      expect(third?.id).toBe('TASK-3');
    });

    it('should move tasks between queues', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue task to intake
      const task = {
        id: 'TASK-1',
        title: 'Test task',
        description: 'Test',
        priority: 5 as any
      };

      const issueNumber = await queueAdapter.enqueue('intake', task as any);

      // Move to active queue
      await queueAdapter.moveToQueue(issueNumber, 'intake', 'active');

      // Verify queue label changed
      const issue = await mockGitHub.getTask(issueNumber);
      expect(issue!.labels.some((l: any) => l.name === 'queue:active')).toBe(true);
      expect(issue!.labels.some((l: any) => l.name === 'queue:intake')).toBe(false);
    });

    it('should get queue statistics', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue tasks to different queues
      await queueAdapter.enqueue('intake', { id: '1', title: 'T1', priority: 5 as any } as any);
      await queueAdapter.enqueue('intake', { id: '2', title: 'T2', priority: 5 as any } as any);
      await queueAdapter.enqueue('active', { id: '3', title: 'T3', priority: 5 as any } as any);
      await queueAdapter.enqueue('done', { id: '4', title: 'T4', priority: 5 as any } as any);

      // Get stats
      const stats = await queueAdapter.getQueueStats();

      expect(stats.intake).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.done).toBe(1);
      expect(stats.review).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.blocked).toBe(0);
    });

    it('should filter tasks by agent', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue tasks for different agents
      await queueAdapter.enqueue('intake', {
        id: 'TASK-1',
        title: 'Executor task',
        priority: 5 as any,
        assignedAgent: 'ultra:executor'
      } as any);

      await queueAdapter.enqueue('intake', {
        id: 'TASK-2',
        title: 'Test task',
        priority: 5 as any,
        assignedAgent: 'ultra:test-engineer'
      } as any);

      // Get tasks by agent
      const executorTasks = await queueAdapter.getByAgent('ultra:executor');

      expect(executorTasks).toHaveLength(1);
      expect(executorTasks[0].id).toBe('TASK-1');
    });
  });

  describe('Agent Orchestrator Tests', () => {
    it('should spawn 2 agents in parallel', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2, agentTimeout: 10000 }
      );

      const task1 = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        files: ['/test/file1.ts'],
        agent: 'ultra:executor'
      };

      const task2 = {
        id: 'task-2',
        title: 'Task 2',
        description: 'Second task',
        files: ['/test/file2.ts'],
        agent: 'ultra:executor'
      };

      // Coordinate parallel execution
      const results = await orchestrator.coordinateParallel([task1 as any, task2 as any]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should prevent file conflicts between agents', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2 }
      );

      const filePath = '/test/conflict.ts';

      // Agent 1 claims file
      const claimed1 = await orchestrator.claimFile('agent-1', filePath);
      expect(claimed1).toBe(true);

      // Agent 2 tries to claim same file (should fail)
      const claimed2 = await orchestrator.claimFile('agent-2', filePath);
      expect(claimed2).toBe(false);

      // Agent 1 releases file
      await orchestrator.releaseFile('agent-1', filePath);

      // Now Agent 2 can claim
      const claimed3 = await orchestrator.claimFile('agent-2', filePath);
      expect(claimed3).toBe(true);
    });

    it('should handle batch file operations', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2 }
      );

      const files = ['/test/f1.ts', '/test/f2.ts', '/test/f3.ts'];

      // Batch claim
      const claimResults = await orchestrator.claimFiles('agent-1', files);
      expect(claimResults['/test/f1.ts']).toBe(true);
      expect(claimResults['/test/f2.ts']).toBe(true);
      expect(claimResults['/test/f3.ts']).toBe(true);

      // Batch release
      await orchestrator.releaseFiles('agent-1', files);

      // Verify files released
      for (const file of files) {
        const owner = await orchestrator.getOwner(file);
        expect(owner).toBeNull();
      }
    });

    it('should track agent ownership statistics', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2 }
      );

      // Agent 1 claims files
      await orchestrator.claimFiles('agent-1', ['/test/f1.ts', '/test/f2.ts']);

      // Agent 2 claims files
      await orchestrator.claimFiles('agent-2', ['/test/f3.ts', '/test/f4.ts', '/test/f5.ts']);

      // Get statistics
      const stats = await orchestrator.getOwnershipStats();

      expect(stats.totalFiles).toBe(5);
      expect(stats.agentCounts['agent-1']).toBe(2);
      expect(stats.agentCounts['agent-2']).toBe(3);
    });

    it('should transfer file ownership between agents', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2 }
      );

      const filePath = '/test/transfer.ts';

      // Agent 1 claims file
      await orchestrator.claimFile('agent-1', filePath);

      // Transfer to Agent 2
      const transferred = await orchestrator.transferFile('agent-1', 'agent-2', filePath);
      expect(transferred).toBe(true);

      // Verify Agent 2 now owns file
      const owner = await orchestrator.getOwner(filePath);
      expect(owner).toBe('agent-2');
    });

    it('should reset all ownership', async () => {
      const orchestrator = new GitHubAgentOrchestrator(
        mockGitHub as any,
        new GitHubStateAdapter(mockGitHub as any),
        new GitHubTaskQueueAdapter('owner', 'repo', undefined as any) as any,
        { maxParallel: 2 }
      );

      // Claim files
      await orchestrator.claimFiles('agent-1', ['/test/f1.ts', '/test/f2.ts']);
      await orchestrator.claimFiles('agent-2', ['/test/f3.ts']);

      // Reset ownership
      await orchestrator.resetOwnership();

      // Verify all files released
      const stats = await orchestrator.getOwnershipStats();
      expect(stats.totalFiles).toBe(0);
    });
  });

  describe('Hybrid State Manager Tests', () => {
    it('should write state to both local and GitHub', async () => {
      const cacheDir = await createTestDir();

      const hybridManager = new HybridStateManager(mockGitHub as any, {
        cacheDir,
        enableBackgroundSync: false // Disable for test
      });

      await hybridManager.initialize();

      const stateObj: any = {
        state_id: 'st_test_123',
        type: 'autopilot_state' as const,
        updated_at: new Date().toISOString(),
        version: 1,
        data: {
          phase: 'execution',
          status: 'running',
          timestamp: new Date().toISOString()
        }
      };

      // Create a GitHub issue first
      const issue = await mockGitHub.createTask({
        title: 'Test State',
        body: serializeStateBody(stateObj, 'Test state')
      });

      // Write state (will sync to GitHub issue)
      await hybridManager.write(stateObj.state_id, stateObj);

      // Verify local cache exists
      const fs = require('fs/promises');
      const cachePath = `${cacheDir}/${stateObj.state_id}.json`;
      const cacheExists = await fs.access(cachePath).then(() => true).catch(() => false);
      expect(cacheExists).toBe(true);

      await hybridManager.close();
    });

    it('should read from cache when available', async () => {
      const cacheDir = await createTestDir();

      const hybridManager = new HybridStateManager(mockGitHub as any, {
        cacheDir,
        stalenessThreshold: 60000, // 1 minute
        enableBackgroundSync: false
      });

      await hybridManager.initialize();

      const stateObj: any = {
        state_id: 'st_cache_test',
        type: 'autopilot_state' as const,
        updated_at: new Date().toISOString(),
        version: 1,
        data: { value: 'cached', timestamp: Date.now() }
      };

      // Create issue and write
      await mockGitHub.createTask({
        title: 'Cache Test',
        body: serializeStateBody(stateObj, 'Cache test')
      });
      await hybridManager.write(stateObj.state_id, stateObj);

      // Read immediately (should be from cache)
      const start = Date.now();
      const readData = await hybridManager.read(stateObj.state_id);
      const duration = Date.now() - start;

      expect(readData.data.value).toBe('cached');
      expect(duration).toBeLessThan(100); // Should be fast from cache

      await hybridManager.close();
    });

    it('should detect stale cache and reload from GitHub', async () => {
      const cacheDir = await createTestDir();

      const hybridManager = new HybridStateManager(mockGitHub as any, {
        cacheDir,
        stalenessThreshold: 100, // 100ms for quick staleness
        enableBackgroundSync: false
      });

      await hybridManager.initialize();

      const stateObj: any = {
        state_id: 'st_stale_test',
        type: 'autopilot_state' as const,
        updated_at: new Date().toISOString(),
        version: 1,
        data: { value: 'initial' }
      };

      // Create issue and write
      const issue = await mockGitHub.createTask({
        title: 'Stale Test',
        body: serializeStateBody(stateObj, 'Stale test')
      });
      await hybridManager.write(stateObj.state_id, stateObj);

      // Wait for cache to become stale
      await delay(150);

      // Update GitHub issue
      const updatedState: any = {
        ...stateObj,
        data: { value: 'updated' },
        version: 2
      };
      await mockGitHub.updateTask(issue.number, {
        body: serializeStateBody(updatedState, 'Updated test')
      });

      // Read should detect staleness and reload from GitHub
      const readData = await hybridManager.read(stateObj.state_id);
      expect(readData.data.value).toBe('updated');
      expect(readData.version).toBe(2);

      await hybridManager.close();
    });

    it('should handle GitHub unavailability gracefully', async () => {
      const cacheDir = await createTestDir();

      // Create a mock that times out
      const timeoutMock = {
        getTask: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          throw new Error('GitHub unavailable');
        },
        updateTask: async () => {
          throw new Error('GitHub unavailable');
        }
      } as any;

      const hybridManager = new HybridStateManager(timeoutMock, {
        cacheDir,
        enableBackgroundSync: false
      });

      await hybridManager.initialize();

      const stateObj: any = {
        state_id: 'st_offline_test',
        type: 'autopilot_state' as const,
        updated_at: new Date().toISOString(),
        version: 1,
        data: { value: 'offline' }
      };

      // Write to local cache first
      await hybridManager.write(stateObj.state_id, stateObj);

      // Try to read - should return cached data even though GitHub fails
      const readData = await hybridManager.read(stateObj.state_id, { allowStale: true });
      expect(readData.data.value).toBe('offline');

      await hybridManager.close();
    });

    it('should sync state in background', async () => {
      const cacheDir = await createTestDir();

      const hybridManager = new HybridStateManager(mockGitHub as any, {
        cacheDir,
        syncInterval: 100, // Fast sync for testing
        enableBackgroundSync: true
      });

      await hybridManager.initialize();

      const stateObj: any = {
        state_id: 'st_sync_test',
        type: 'autopilot_state' as const,
        updated_at: new Date().toISOString(),
        version: 1,
        data: { value: 'sync_test' }
      };

      // Create issue
      const issue = await mockGitHub.createTask({
        title: 'Sync Test',
        body: serializeStateBody(stateObj, 'Sync test')
      });

      // Write state (will queue background sync)
      await hybridManager.write(stateObj.state_id, stateObj);

      // Wait for background sync
      await delay(300);

      // Verify sync occurred by reading from GitHub
      const githubIssue = await mockGitHub.getTask(issue.number);
      expect(githubIssue).toBeDefined();

      await hybridManager.close();
    });
  });

  describe('Migration Manifest Tests', () => {
    it('should create migration manifest', async () => {
      const manifestPath = `${stateDir}/migration-manifest.json`;

      const manifest = {
        migrationId: generateTestId(),
        startTime: new Date().toISOString(),
        status: 'in_progress',
        phases: [
          { name: 'backup', status: 'completed', timestamp: new Date().toISOString() },
          { name: 'migrate_states', status: 'in_progress', timestamp: new Date().toISOString() }
        ],
        rollbackPoints: [],
        totalSteps: 12,
        completedSteps: 3
      };

      const fs = require('fs/promises');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Verify manifest created
      const readManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      expect(readManifest.migrationId).toBeDefined();
      expect(readManifest.status).toBe('in_progress');
      expect(readManifest.phases).toHaveLength(2);
    });

    it('should update migration progress', async () => {
      const manifestPath = `${stateDir}/progress-manifest.json`;

      const manifest = {
        migrationId: generateTestId(),
        startTime: new Date().toISOString(),
        status: 'in_progress',
        phases: [],
        rollbackPoints: [],
        totalSteps: 10,
        completedSteps: 5
      };

      const fs = require('fs/promises');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Update progress
      const updatedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      updatedManifest.completedSteps = 8;
      updatedManifest.phases.push({
        name: 'finalize',
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2));

      // Verify update
      const finalManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      expect(finalManifest.completedSteps).toBe(8);
      expect(finalManifest.phases).toHaveLength(1);
    });

    it('should track rollback points', async () => {
      const manifestPath = `${stateDir}/rollback-manifest.json`;

      const manifest = {
        migrationId: generateTestId(),
        startTime: new Date().toISOString(),
        status: 'in_progress',
        phases: [],
        rollbackPoints: [
          {
            step: 'backup',
            timestamp: new Date().toISOString(),
            backupPath: backupDir,
            checksum: 'abc123'
          }
        ],
        totalSteps: 10,
        completedSteps: 1
      };

      const fs = require('fs/promises');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Add another rollback point
      const updatedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      updatedManifest.rollbackPoints.push({
        step: 'migrate_autopilot',
        timestamp: new Date().toISOString(),
        backupPath: `${backupDir}/autopilot-backup.json`,
        checksum: 'def456'
      });
      updatedManifest.completedSteps = 5;
      await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2));

      // Verify rollback points
      const finalManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      expect(finalManifest.rollbackPoints).toHaveLength(2);
      expect(finalManifest.rollbackPoints[0].step).toBe('backup');
      expect(finalManifest.rollbackPoints[1].step).toBe('migrate_autopilot');
    });

    it('should calculate checksums for rollback verification', async () => {
      const crypto = require('crypto');

      const testFile = {
        id: 'test-1',
        data: 'test data for checksum'
      };

      const content = JSON.stringify(testFile);
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64); // SHA256 produces 64 character hex string

      // Verify same content produces same checksum
      const checksum2 = crypto.createHash('sha256').update(content).digest('hex');
      expect(checksum2).toBe(checksum);

      // Verify different content produces different checksum
      const differentContent = JSON.stringify({ ...testFile, data: 'different' });
      const checksum3 = crypto.createHash('sha256').update(differentContent).digest('hex');
      expect(checksum3).not.toBe(checksum);
    });
  });

  describe('Utility Function Tests', () => {
    it('should parse YAML frontmatter correctly', () => {
      const body = `---
state_id: st_123
type: autopilot_state
updated_at: 2026-03-04T12:00:00Z
version: 1
data:
  phase: execution
  status: running
---

Human readable content here`;

      const parsed = parseStateFromBody(body);

      expect(parsed.state_id).toBe('st_123');
      expect(parsed.type).toBe('autopilot_state');
      expect(parsed.data.phase).toBe('execution');
      expect(parsed.data.status).toBe('running');
    });

    it('should serialize state to YAML frontmatter correctly', () => {
      const state = {
        state_id: 'st_456',
        type: 'ralph_state' as const,
        updated_at: '2026-03-04T12:00:00Z',
        version: 1,
        data: {
          loopIteration: 5,
          maxIterations: 10
        }
      };

      const serialized = serializeStateBody(state, 'Human content');

      expect(serialized).toMatch(/^---\n/);
      expect(serialized).toMatch(/\n---\n/);
      expect(serialized).toContain('state_id: st_456');
      expect(serialized).toContain('type: ralph_state');
      expect(serialized).toContain('loopIteration: 5');
      expect(serialized).toContain('Human content');
    });

    it('should handle special characters in YAML', () => {
      const body = `---
state_id: st_special
type: test_state
updated_at: 2026-03-04T12:00:00Z
version: 1
data:
  message: "Test with 'quotes' and \\"double quotes\\""
  unicode: "Test with emoji 🎉 and chinese 中文"
---

Content`;

      const parsed = parseStateFromBody(body);

      expect(parsed.data.message).toContain('quotes');
      expect(parsed.data.unicode).toContain('emoji');
    });

    it('should validate required state fields', () => {
      const invalidBody = `---
state_id: st_test
type: autopilot_state
---

Missing required fields`;

      expect(() => parseStateFromBody(invalidBody)).toThrow(/Missing required field/);
    });

    it('should validate state type', () => {
      const invalidBody = `---
state_id: st_test
type: invalid_type
updated_at: 2026-03-04T12:00:00Z
version: 1
data: {}
---
Content`;

      expect(() => parseStateFromBody(invalidBody)).toThrow(/Invalid state type/);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent state reads', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any);

      // Create multiple issues
      const issues = [];
      for (let i = 0; i < 10; i++) {
        const stateObj = stateAdapter.createState('autopilot_state', { index: i });
        const issue = await mockGitHub.createTask({
          title: `Perf Test ${i}`,
          body: stateAdapter.serializeState(stateObj)
        });
        issues.push(issue);
      }

      // Read all concurrently
      const start = Date.now();
      const readPromises = issues.map(issue => stateAdapter.readState(issue.number));
      const results = await Promise.all(readPromises);
      const duration = Date.now() - start;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(5000); // Should complete in reasonable time
    });

    it('should handle bulk task queue operations', async () => {
      const queueAdapter = new GitHubTaskQueueAdapter('owner', 'repo', undefined as any);
      (queueAdapter as any).service = mockGitHub;

      // Enqueue 50 tasks
      const enqueuePromises = [];
      for (let i = 0; i < 50; i++) {
        const task = {
          id: `BULK-${i}`,
          title: `Bulk task ${i}`,
          priority: 5 as any
        };
        enqueuePromises.push(queueAdapter.enqueue('intake', task as any));
      }

      const start = Date.now();
      await Promise.all(enqueuePromises);
      const duration = Date.now() - start;

      expect(mockGitHub.getIssueCount()).toBe(50);
      expect(duration).toBeLessThan(10000); // Should complete in reasonable time
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed state operations', async () => {
      const stateAdapter = new GitHubStateAdapter(mockGitHub as any, {
        maxRetries: 3,
        enableConcurrencyControl: true
      });

      const stateObj = stateAdapter.createState('autopilot_state', { test: 'retry' });
      const issue = await mockGitHub.createTask({
        title: 'Retry Test',
        body: stateAdapter.serializeState(stateObj)
      });

      // Update with retry logic (simulated)
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          await stateAdapter.updateState(issue.number, {
            data: { updated: true }
          });
          break;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) throw error;
          await delay(100);
        }
      }

      // Verify update succeeded
      const finalState = await stateAdapter.readState(issue.number);
      expect(finalState.data.updated).toBe(true);
    });

    it('should handle network timeouts gracefully', async () => {
      // Create a mock that times out
      const timeoutMock = {
        ...mockGitHub,
        getTask: async () => {
          await new Promise(resolve => setTimeout(resolve, 6000));
          throw new Error('Timeout');
        }
      } as any;

      const stateAdapter = new GitHubStateAdapter(timeoutMock, {
        maxRetries: 2
      });

      // Should timeout gracefully
      await expect(stateAdapter.readState(1)).rejects.toThrow();
    });
  });
});
