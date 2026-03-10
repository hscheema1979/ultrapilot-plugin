/**
 * GitHubAgentOrchestrator
 *
 * Manages parallel agent execution with file ownership using GitHub as coordination backend.
 *
 * Key Features:
 * - File ownership registry (prevents conflicts)
 * - Parallel agent coordination with concurrency limits
 * - In-memory caching with 30-second TTL
 * - Batch operations with 5-second async persistence
 * - Agent spawning with timeout and retry
 */

import { GitHubService } from './github-service.js';
import { GitHubStateAdapter } from './github-state-adapter.js';
import { GitHubTaskQueueAdapter, Task } from './github-task-queue-adapter.js';

export interface AgentResult {
  agentId: string;
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

export interface FileOwnershipMap {
  [filePath: string]: string; // filePath -> agentId
}

interface OwnershipCache {
  data: FileOwnershipMap;
  timestamp: number;
  pendingChanges: Set<string>;
}

interface ActiveAgent {
  id: string;
  taskId: string;
  startTime: number;
  timeout: number;
}

export interface OrchestratorConfig {
  maxParallel?: number;
  agentTimeout?: number;
  maxRetries?: number;
  cacheTTL?: number; // milliseconds
  batchPersistInterval?: number; // milliseconds
  ownershipIssueTitle?: string;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  maxParallel: 3,
  agentTimeout: 300000, // 5 minutes
  maxRetries: 3,
  cacheTTL: 30000, // 30 seconds
  batchPersistInterval: 5000, // 5 seconds
  ownershipIssueTitle: 'ultrapilot-file-ownership'
};

/**
 * Orchestrator for parallel agent execution with file ownership tracking
 */
export class GitHubAgentOrchestrator {
  private github: GitHubService;
  private state: GitHubStateAdapter;
  private queue: GitHubTaskQueueAdapter;
  private config: Required<OrchestratorConfig>;

  // In-memory cache with TTL
  private ownershipCache: OwnershipCache;
  private cacheTimer?: NodeJS.Timeout;

  // Batch persistence
  private persistTimer?: NodeJS.Timeout;
  private persistScheduled: boolean = false;

  // Active agent tracking
  private activeAgents: Map<string, ActiveAgent> = new Map();

  // Ownership issue number
  private ownershipIssueNumber: number | null = null;

  constructor(
    github: GitHubService,
    state: GitHubStateAdapter,
    queue: GitHubTaskQueueAdapter,
    config: OrchestratorConfig = {}
  ) {
    this.github = github;
    this.state = state;
    this.queue = queue;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.ownershipCache = {
      data: {},
      timestamp: 0,
      pendingChanges: new Set()
    };

    this.initializeOwnershipIssue();
    this.startCacheExpiration();
    this.startBatchPersistence();
  }

  /**
   * Initialize or load the file ownership issue
   */
  private async initializeOwnershipIssue(): Promise<void> {
    try {
      // Try to find existing issue
      const issues = await this.github.searchIssues(
        `repo:${this.github.getOwner()}/${this.github.getRepo()} ${this.config.ownershipIssueTitle}`
      );

      if (issues.length > 0) {
        this.ownershipIssueNumber = issues[0].number;
        await this.loadOwnershipFromGitHub();
      } else {
        // Create new issue
        const issue = await this.github.createIssue(
          this.config.ownershipIssueTitle,
          this.formatOwnershipIssueBody({})
        );
        this.ownershipIssueNumber = issue.number;
      }
    } catch (error) {
      console.error('[Orchestrator] Failed to initialize ownership issue:', error);
    }
  }

  /**
   * Load ownership data from GitHub issue
   */
  private async loadOwnershipFromGitHub(): Promise<void> {
    if (!this.ownershipIssueNumber) return;

    try {
      const issue = await this.github.getIssue(this.ownershipIssueNumber);
      const ownership = this.parseOwnershipIssueBody(issue.body);

      this.ownershipCache = {
        data: ownership,
        timestamp: Date.now(),
        pendingChanges: new Set()
      };
    } catch (error) {
      console.error('[Orchestrator] Failed to load ownership:', error);
    }
  }

  /**
   * Parse ownership data from issue body
   */
  private parseOwnershipIssueBody(body: string): FileOwnershipMap {
    try {
      // Extract YAML frontmatter
      const match = body.match(/^---\n([\s\S]+?)\n---/);
      if (!match) return {};

      const yaml = match[1];
      const lines = yaml.split('\n');
      const ownership: FileOwnershipMap = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes(':')) {
          const [path, agentId] = trimmed.split(':').map(s => s.trim());
          if (path && agentId) {
            ownership[path] = agentId;
          }
        }
      }

      return ownership;
    } catch (error) {
      console.error('[Orchestrator] Failed to parse ownership:', error);
      return {};
    }
  }

  /**
   * Format ownership data as issue body
   */
  private formatOwnershipIssueBody(ownership: FileOwnershipMap): string {
    const lines = ['---', 'type: file_ownership', 'version: 1', '---'];

    for (const [path, agentId] of Object.entries(ownership)) {
      lines.push(`${path}: ${agentId}`);
    }

    return lines.join('\n');
  }

  /**
   * Start cache expiration timer
   */
  private startCacheExpiration(): void {
    this.cacheTimer = setInterval(async () => {
      const age = Date.now() - this.ownershipCache.timestamp;
      if (age > this.config.cacheTTL && Object.keys(this.ownershipCache.data).length > 0) {
        console.log('[Orchestrator] Cache expired, reloading from GitHub');
        await this.loadOwnershipFromGitHub();
      }
    }, this.config.cacheTTL);
  }

  /**
   * Start batch persistence timer
   */
  private startBatchPersistence(): void {
    this.persistTimer = setInterval(async () => {
      if (this.persistScheduled) {
        await this.persistOwnershipToGitHub();
        this.persistScheduled = false;
      }
    }, this.config.batchPersistInterval);
  }

  /**
   * Persist ownership data to GitHub (batched)
   */
  private async persistOwnershipToGitHub(): Promise<void> {
    if (!this.ownershipIssueNumber || this.ownershipCache.pendingChanges.size === 0) {
      return;
    }

    try {
      const body = this.formatOwnershipIssueBody(this.ownershipCache.data);
      await this.github.updateIssue(this.ownershipIssueNumber, {
        body
      });

      this.ownershipCache.pendingChanges.clear();
      this.ownershipCache.timestamp = Date.now();

      console.log('[Orchestrator] Ownership persisted to GitHub');
    } catch (error) {
      console.error('[Orchestrator] Failed to persist ownership:', error);
    }
  }

  /**
   * Schedule a persistence operation
   */
  private schedulePersistence(): void {
    this.persistScheduled = true;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    const age = Date.now() - this.ownershipCache.timestamp;
    return age < this.config.cacheTTL;
  }

  /**
   * Claim a file for an agent
   */
  async claimFile(agentId: string, filePath: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Ensure cache is fresh
      if (!this.isCacheValid()) {
        await this.loadOwnershipFromGitHub();
      }

      // Check if file is already owned
      const currentOwner = this.ownershipCache.data[filePath];
      if (currentOwner && currentOwner !== agentId) {
        console.log(`[Orchestrator] File ${filePath} already owned by ${currentOwner}`);
        return false;
      }

      // Claim the file
      this.ownershipCache.data[filePath] = agentId;
      this.ownershipCache.pendingChanges.add(filePath);
      this.schedulePersistence();

      const duration = Date.now() - startTime;
      console.log(`[Orchestrator] File ${filePath} claimed by ${agentId} (${duration}ms)`);

      return true;
    } catch (claimError) {
      console.error('[Orchestrator] Failed to claim file:', claimError);
      return false;
    }
  }

  /**
   * Release a file from agent ownership
   */
  async releaseFile(agentId: string, filePath: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Ensure cache is fresh
      if (!this.isCacheValid()) {
        await this.loadOwnershipFromGitHub();
      }

      // Only release if owned by this agent
      const currentOwner = this.ownershipCache.data[filePath];
      if (currentOwner === agentId) {
        delete this.ownershipCache.data[filePath];
        this.ownershipCache.pendingChanges.add(filePath);
        this.schedulePersistence();
      }

      const duration = Date.now() - startTime;
      console.log(`[Orchestrator] File ${filePath} released by ${agentId} (${duration}ms)`);
    } catch (error) {
      console.error('[Orchestrator] Failed to release file:', error);
    }
  }

  /**
   * Get the current owner of a file
   */
  async getOwner(filePath: string): Promise<string | null> {
    try {
      // Ensure cache is fresh
      if (!this.isCacheValid()) {
        await this.loadOwnershipFromGitHub();
      }

      return this.ownershipCache.data[filePath] || null;
    } catch (error) {
      console.error('[Orchestrator] Failed to get owner:', error);
      return null;
    }
  }

  /**
   * Batch claim multiple files
   */
  async claimFiles(agentId: string, filePaths: string[]): Promise<{ [path: string]: boolean }> {
    const results: { [path: string]: boolean } = {};

    for (const path of filePaths) {
      results[path] = await this.claimFile(agentId, path);
    }

    return results;
  }

  /**
   * Batch release multiple files
   */
  async releaseFiles(agentId: string, filePaths: string[]): Promise<void> {
    for (const path of filePaths) {
      await this.releaseFile(agentId, path);
    }
  }

  /**
   * Get all files owned by an agent
   */
  async getAgentFiles(agentId: string): Promise<string[]> {
    try {
      // Ensure cache is fresh
      if (!this.isCacheValid()) {
        await this.loadOwnershipFromGitHub();
      }

      return Object.entries(this.ownershipCache.data)
        .filter(([_, owner]) => owner === agentId)
        .map(([path]) => path);
    } catch (error) {
      console.error('[Orchestrator] Failed to get agent files:', error);
      return [];
    }
  }

  /**
   * Spawn an agent to execute a task
   */
  async spawnAgent(agentType: string, task: Task): Promise<AgentResult> {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`[Orchestrator] Spawning ${agentType} agent for task ${task.id}`);

    let lastError: Error | null = null;

    // Retry logic
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Track active agent
        const activeAgent: ActiveAgent = {
          id: agentId,
          taskId: task.id,
          startTime: Date.now(),
          timeout: this.config.agentTimeout
        };
        this.activeAgents.set(agentId, activeAgent);

        // Claim files for this task
        if (task.files && task.files.length > 0) {
          const claimResults = await this.claimFiles(agentId, task.files);
          const failedClaims = Object.entries(claimResults)
            .filter(([_, claimed]) => !claimed)
            .map(([path]) => path);

          if (failedClaims.length > 0) {
            throw new Error(`Failed to claim files: ${failedClaims.join(', ')}`);
          }
        }

        // Execute the task using Agent tool
        // NOTE: In actual implementation, this would use the Agent tool
        // For now, we'll simulate with a direct execution
        const result = await this.executeAgentWork(agentType, task, agentId);

        // Release files
        if (task.files && task.files.length > 0) {
          await this.releaseFiles(agentId, task.files);
        }

        const duration = Date.now() - startTime;

        return {
          agentId,
          taskId: task.id,
          success: true,
          output: result,
          duration
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`[Orchestrator] Agent attempt ${attempt} failed:`, error);

        // Release files on failure
        if (task.files && task.files.length > 0) {
          await this.releaseFiles(agentId, task.files);
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      } finally {
        this.activeAgents.delete(agentId);
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    return {
      agentId,
      taskId: task.id,
      success: false,
      error: lastError?.message || 'Unknown error',
      duration
    };
  }

  /**
   * Execute agent work (placeholder for Agent tool integration)
   *
   * NOTE: This method should be replaced with actual Agent tool calls
   * when available in the Claude Code environment.
   */
  private async executeAgentWork(agentType: string, task: Task, agentId: string): Promise<string> {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return mock result
    return `Task ${task.id} completed by ${agentType} agent (${agentId})`;
  }

  /**
   * Coordinate parallel execution of multiple tasks
   */
  async coordinateParallel(tasks: Task[], maxParallel?: number): Promise<AgentResult[]> {
    const concurrency = maxParallel || this.config.maxParallel;
    const results: AgentResult[] = [];
    const active = new Map<string, Promise<AgentResult>>();

    console.log(`[Orchestrator] Coordinating ${tasks.length} tasks with max ${concurrency} parallel`);

    for (const task of tasks) {
      // Wait if we have maxParallel active agents
      while (active.size >= concurrency) {
        const completed = await Promise.race(active.values());
        results.push(completed);

        // Remove completed from active
        for (const [taskId, promise] of active.entries()) {
          if (promise === (await Promise.race([promise, Promise.resolve(null)]))) {
            active.delete(taskId);
            break;
          }
        }
      }

      // Spawn agent for task
      const promise = this.spawnAgent(task.agent || 'executor', task);
      active.set(task.id, promise);
    }

    // Wait for all remaining agents
    const remainingResults = await Promise.all(active.values());
    results.push(...remainingResults);

    console.log(`[Orchestrator] Completed ${results.length} tasks`);
    console.log(`[Orchestrator] Success: ${results.filter(r => r.success).length}, Failed: ${results.filter(r => !r.success).length}`);

    return results;
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): ActiveAgent[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Get current ownership state
   */
  async getOwnershipState(): Promise<FileOwnershipMap> {
    if (!this.isCacheValid()) {
      await this.loadOwnershipFromGitHub();
    }
    return { ...this.ownershipCache.data };
  }

  /**
   * Force immediate persistence
   */
  async forcePersistence(): Promise<void> {
    await this.persistOwnershipToGitHub();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.cacheTimer) {
      clearInterval(this.cacheTimer);
    }

    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }

    // Force final persistence
    await this.forcePersistence();

    console.log('[Orchestrator] Cleanup complete');
  }

  /**
   * Reset ownership state (clear all claims)
   */
  async resetOwnership(): Promise<void> {
    this.ownershipCache.data = {};
    this.ownershipCache.pendingChanges.clear();
    await this.forcePersistence();
    console.log('[Orchestrator] Ownership reset');
  }

  /**
   * Transfer file ownership between agents
   */
  async transferFile(fromAgentId: string, toAgentId: string, filePath: string): Promise<boolean> {
    try {
      const currentOwner = await this.getOwner(filePath);

      if (currentOwner !== fromAgentId) {
        console.log(`[Orchestrator] Cannot transfer: file owned by ${currentOwner}, not ${fromAgentId}`);
        return false;
      }

      // Release from old agent
      await this.releaseFile(fromAgentId, filePath);

      // Claim by new agent
      const claimed = await this.claimFile(toAgentId, filePath);

      if (claimed) {
        console.log(`[Orchestrator] Transferred ${filePath} from ${fromAgentId} to ${toAgentId}`);
      }

      return claimed;
    } catch (error) {
      console.error('[Orchestrator] Failed to transfer file:', error);
      return false;
    }
  }

  /**
   * Get ownership statistics
   */
  async getOwnershipStats(): Promise<{
    totalFiles: number;
    agentCounts: { [agentId: string]: number };
    pendingChanges: number;
  }> {
    if (!this.isCacheValid()) {
      await this.loadOwnershipFromGitHub();
    }

    const agentCounts: { [agentId: string]: number } = {};

    for (const owner of Object.values(this.ownershipCache.data)) {
      agentCounts[owner] = (agentCounts[owner] || 0) + 1;
    }

    return {
      totalFiles: Object.keys(this.ownershipCache.data).length,
      agentCounts,
      pendingChanges: this.ownershipCache.pendingChanges.size
    };
  }
}
