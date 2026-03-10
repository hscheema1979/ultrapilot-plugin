/**
 * GitHubTaskQueueAdapter
 *
 * Manages task queues using GitHub issues and labels.
 * Queues are represented as labels on issues.
 */

import { GitHubService } from './github-service';
import { GitHubAppAuthManager } from './github-app-auth';
import { Task, TaskStatus, TaskPriority } from '../domain/TaskQueue';

export type QueueName = 'intake' | 'active' | 'review' | 'done' | 'failed' | 'blocked';

/**
 * Extended Task interface with GitHub-specific properties
 */
export interface GitHubTask extends Task {
  issueNumber?: number;
  queue?: QueueName;
}

export interface QueueMetadata {
  task_id: string;
  enqueued_at: string;
  queue: QueueName;
  priority?: TaskPriority;
  agent?: string;
}

/**
 * Adapter for managing task queues via GitHub issues
 */
export class GitHubTaskQueueAdapter {
  private service: GitHubService;
  private owner: string;
  private repo: string;
  private labelPrefix = 'queue:';

  constructor(owner: string, repo: string, authManager?: GitHubAppAuthManager) {
    this.owner = owner;
    this.repo = repo;

    // Create auth manager if not provided
    const auth = authManager || GitHubAppAuthManager.fromEnv(`${owner}/${repo}`);

    // Create minimal config
    const config = {
      owner,
      repo,
      cacheMaxAge: 300000,
    };

    this.service = new GitHubService(config as any, auth);
  }

  /**
   * Get the full queue label name
   */
  private getQueueLabel(queue: string): string {
    return `${this.labelPrefix}${queue}`;
  }

  /**
   * Parse queue metadata from issue body
   */
  private parseMetadata(body: string): QueueMetadata | null {
    const match = body.match(/---\n([\s\S]*?)\n---/);
    if (!match) return null;

    try {
      const yaml = match[1];
      const metadata: QueueMetadata = {
        task_id: this.extractYamlField(yaml, 'task_id') || '',
        enqueued_at: this.extractYamlField(yaml, 'enqueued_at') || new Date().toISOString(),
        queue: this.extractYamlField(yaml, 'queue') as QueueName || 'intake',
      };

      const priority = this.extractYamlField(yaml, 'priority');
      if (priority) {
        // Convert string priority to TaskPriority enum
        const priorityMap: Record<string, TaskPriority> = {
          '1': TaskPriority.LOW,
          'low': TaskPriority.LOW,
          '5': TaskPriority.NORMAL,
          'normal': TaskPriority.NORMAL,
          '8': TaskPriority.HIGH,
          'high': TaskPriority.HIGH,
          '10': TaskPriority.CRITICAL,
          'critical': TaskPriority.CRITICAL,
        };
        metadata.priority = priorityMap[priority.toLowerCase()] || TaskPriority.NORMAL;
      }

      const agent = this.extractYamlField(yaml, 'agent');
      if (agent) metadata.agent = agent;

      return metadata;
    } catch {
      return null;
    }
  }

  /**
   * Extract a field value from YAML string
   */
  private extractYamlField(yaml: string, field: string): string | null {
    const regex = new RegExp(`^${field}:\\s*(.+)$`, 'm');
    const match = yaml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Create YAML frontmatter for task
   */
  private createMetadata(task: Task, queue: QueueName): string {
    const metadata: QueueMetadata = {
      task_id: task.id,
      enqueued_at: new Date().toISOString(),
      queue,
    };

    if (task.priority) metadata.priority = task.priority;
    if (task.assignedAgent) metadata.agent = task.assignedAgent;

    const yaml = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return `---\n${yaml}\n---\n\n`;
  }

  /**
   * Convert GitHub issue to Task
   */
  private issueToTask(issue: any): GitHubTask {
    const metadata = this.parseMetadata(issue.body || '');
    const queueLabel = issue.labels?.find((l: any) => l.name?.startsWith(this.labelPrefix));
    const queue = queueLabel?.name?.replace(this.labelPrefix, '') || 'intake';

    return {
      id: metadata?.task_id || issue.title.match(/\[([A-Z]+-\d+)\]/)?.[1] || issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      status: this.mapQueueToStatus(queue as QueueName),
      priority: metadata?.priority || TaskPriority.NORMAL,
      assignedAgent: metadata?.agent as any,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
      issueNumber: issue.number,
      queue: queue as QueueName,
      retryCount: 0,
      maxRetries: 3,
    };
  }

  /**
   * Map queue name to task status
   */
  private mapQueueToStatus(queue: QueueName): TaskStatus {
    const statusMap: Record<QueueName, TaskStatus> = {
      'intake': TaskStatus.INTAKE,
      'active': TaskStatus.IN_PROGRESS,
      'review': TaskStatus.REVIEW,
      'done': TaskStatus.COMPLETED,
      'failed': TaskStatus.FAILED,
      'blocked': TaskStatus.INTAKE,
    };
    return statusMap[queue] || TaskStatus.INTAKE;
  }

  /**
   * Enqueue a task by creating an issue with queue label
   */
  async enqueue(queue: QueueName, task: GitHubTask): Promise<number> {
    const label = this.getQueueLabel(queue);
    const body = this.createMetadata(task, queue) + (task.description || '');

    const issue = await this.service.createTask({
      title: task.title,
      body,
      labels: [label, task.assignedAgent || ''].filter(Boolean),
      assignees: [],
    });

    return issue.number;
  }

  /**
   * Dequeue the oldest task from a queue
   * Returns task and removes queue label from issue
   */
  async dequeue(queue: string): Promise<GitHubTask | null> {
    const label = this.getQueueLabel(queue);
    const tasks = await this.getTasksByLabel(label);

    if (tasks.length === 0) {
      return null;
    }

    // FIFO: Get oldest task (first in array, sorted by created date)
    const oldestTask = tasks[0];
    const issueNumber = oldestTask.issueNumber;

    if (!issueNumber) {
      return null;
    }

    // Remove queue label from issue
    await this.service.removeLabel(issueNumber, label);

    return oldestTask;
  }

  /**
   * Move a task from one queue to another
   */
  async moveToQueue(issueNumber: number, fromQueue: string, toQueue: string): Promise<void> {
    const fromLabel = this.getQueueLabel(fromQueue);
    const toLabel = this.getQueueLabel(toQueue);

    // Remove old queue label
    await this.service.removeLabel(issueNumber, fromLabel);

    // Add new queue label
    await this.service.addLabel(issueNumber, toLabel);

    // Update frontmatter if possible
    try {
      const issue = await this.service.getTask(issueNumber);
      if (issue) {
        const metadata = this.parseMetadata(issue.body || '');
        const task = this.issueToTask(issue);

        const newBody = this.createMetadata(task, toQueue as QueueName) + issue.body?.replace(/---\n[\s\S]*?\n---\n\n/, '') || '';

        await this.service.updateTask(issueNumber, { body: newBody });
      }
    } catch {
      // If update fails, at least the labels are updated
    }
  }

  /**
   * Get the number of tasks in a queue
   */
  async getQueueSize(queue: string): Promise<number> {
    const label = this.getQueueLabel(queue);
    const tasks = await this.getTasksByLabel(label);
    return tasks.length;
  }

  /**
   * Peek at all tasks in a queue without removing them
   */
  async peek(queue: string): Promise<GitHubTask[]> {
    const label = this.getQueueLabel(queue);
    return this.getTasksByLabel(label);
  }

  /**
   * Get all tasks in a queue (alias for peek)
   */
  async getByQueue(queue: string): Promise<GitHubTask[]> {
    return this.peek(queue);
  }

  /**
   * Get tasks assigned to a specific agent
   */
  async getByAgent(agentLabel: string): Promise<GitHubTask[]> {
    // Use GraphQL to get issues with agent label
    const query = `
      query($owner: String!, $repo: String!, $label: String!) {
        repository(owner: $owner, name: $repo) {
          issues(labels: [$label], first: 100, states: [OPEN]) {
            nodes {
              number
              title
              body
              created_at
              updated_at
              labels(first: 20) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.service.graphql(query, {
        owner: this.owner,
        repo: this.repo,
        label: agentLabel,
      });

      const issues = response.repository?.issues?.nodes || [];
      return issues.map((issue: any) => this.issueToTask(issue));
    } catch {
      return [];
    }
  }

  /**
   * Get tasks by label using GraphQL (efficient)
   */
  private async getTasksByLabel(label: string): Promise<GitHubTask[]> {
    const query = `
      query($owner: String!, $repo: String!, $label: String!) {
        repository(owner: $owner, name: $repo) {
          issues(labels: [$label], first: 100, states: [OPEN], orderBy: {field: CREATED_AT, direction: ASC}) {
            nodes {
              number
              title
              body
              created_at
              updated_at
              labels(first: 20) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.service.graphql(query, {
        owner: this.owner,
        repo: this.repo,
        label,
      });

      const issues = response.repository?.issues?.nodes || [];
      return issues.map((issue: any) => this.issueToTask(issue));
    } catch {
      return [];
    }
  }

  /**
   * Get all tasks across all queues
   */
  async getAllTasks(): Promise<GitHubTask[]> {
    const allTasks: GitHubTask[] = [];
    const queues: QueueName[] = ['intake', 'active', 'review', 'done', 'failed', 'blocked'];

    for (const queue of queues) {
      const tasks = await this.getByQueue(queue);
      allTasks.push(...tasks);
    }

    return allTasks;
  }

  /**
   * Get a task by issue number
   */
  async getByIssueNumber(issueNumber: number): Promise<GitHubTask | null> {
    try {
      const issue = await this.service.getTask(issueNumber);
      if (!issue) return null;
      return this.issueToTask(issue);
    } catch {
      return null;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<Record<QueueName, number>> {
    const stats: Record<QueueName, number> = {
      intake: 0,
      active: 0,
      review: 0,
      done: 0,
      failed: 0,
      blocked: 0,
    };

    const queues: QueueName[] = ['intake', 'active', 'review', 'done', 'failed', 'blocked'];

    for (const queue of queues) {
      stats[queue] = await this.getQueueSize(queue);
    }

    return stats;
  }

  /**
   * Create all queue labels if they don't exist
   */
  async initializeQueues(): Promise<void> {
    const queues: QueueName[] = ['intake', 'active', 'review', 'done', 'failed', 'blocked'];
    const colors: Record<QueueName, string> = {
      intake: 'ededed',
      active: 'fbca04',
      review: '0052cc',
      done: '2ea44f',
      failed: 'd73a4a',
      blocked: 'e99695',
    };

    for (const queue of queues) {
      const label = this.getQueueLabel(queue);
      try {
        await this.service.createLabel(label, queue.charAt(0).toUpperCase() + queue.slice(1), colors[queue]);
      } catch {
        // Label might already exist, ignore error
      }
    }
  }
}
