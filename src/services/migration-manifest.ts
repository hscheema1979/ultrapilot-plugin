/**
 * Migration Manifest Service
 *
 * Manages migration progress tracking and rollback capabilities.
 * Features:
 * - Creates tracking issue with YAML frontmatter
 * - Calculates checksums for validation
 * - Tracks rollback point (git commit SHA)
 * - Updates progress during migration
 * - Enables rollback capability
 */

import { createHash } from 'crypto';
import { GitHubService } from './github-service';
import type { GitHubIssue } from '../../types/github-integration';

/**
 * Migration status
 */
export type MigrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';

/**
 * Task representation for migration
 */
export interface Task {
  id: string;
  title?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Migration manifest frontmatter
 */
export interface MigrationManifestFrontmatter {
  manifest_id: string;
  type: 'migration_manifest';
  status: MigrationStatus;
  started_at: string;
  completed_at: string | null;
  tasks_migrated: number;
  tasks_total: number;
  checksum: string;
  rollback_point: string;
  error?: string;
}

/**
 * Migration progress phase
 */
export interface MigrationPhase {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  tasks_count?: number;
}

/**
 * Complete manifest data
 */
export interface MigrationManifestData {
  frontmatter: MigrationManifestFrontmatter;
  phases: MigrationPhase[];
}

/**
 * Configuration for migration manifest
 */
export interface MigrationManifestConfig {
  githubService: GitHubService;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Migration Manifest Service
 *
 * Tracks migration progress in a GitHub issue with YAML frontmatter.
 * Provides rollback capability and validation checksums.
 */
export class MigrationManifest {
  private githubService: GitHubService;
  private owner: string;
  private repo: string;
  private branch: string;
  private issueNumber: number | null = null;
  private manifestData: MigrationManifestData | null = null;

  constructor(config: MigrationManifestConfig) {
    this.githubService = config.githubService;
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch;
  }

  /**
   * Create a new migration manifest
   *
   * Creates a GitHub issue to track migration progress.
   * Stores manifest with YAML frontmatter.
   */
  async create(totalTasks: number, phases: MigrationPhase[] = []): Promise<number> {
    const manifestId = `migration-${new Date().toISOString().split('T')[0]}`;
    const rollbackPoint = await this.getRollbackPoint();

    // Create initial manifest data
    this.manifestData = {
      frontmatter: {
        manifest_id: manifestId,
        type: 'migration_manifest',
        status: 'in_progress',
        started_at: new Date().toISOString(),
        completed_at: null,
        tasks_migrated: 0,
        tasks_total: totalTasks,
        checksum: '',
        rollback_point: rollbackPoint,
      },
      phases: phases.length > 0 ? phases : [
        { name: 'Phase 1: Discovery', status: 'pending' },
        { name: 'Phase 2: Migration', status: 'pending' },
        { name: 'Phase 3: Verification', status: 'pending' },
      ],
    };

    // Calculate initial checksum
    this.manifestData.frontmatter.checksum = this.calculateChecksum([]);

    // Create GitHub issue
    const issue = await this.githubService.createTask({
      title: `🔄 Migration Manifest: ${manifestId}`,
      body: this.formatManifestBody(),
      labels: ['migration', 'manifest', 'in-progress'],
    });

    this.issueNumber = issue.number;

    console.log(`[MigrationManifest] Created manifest issue #${this.issueNumber}`);
    return this.issueNumber;
  }

  /**
   * Update migration progress
   *
   * Updates the manifest with current progress.
   */
  async updateProgress(completed: number, total: number): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    this.manifestData.frontmatter.tasks_migrated = completed;
    this.manifestData.frontmatter.tasks_total = total;

    // Update status based on progress
    if (completed === 0) {
      this.manifestData.frontmatter.status = 'pending';
    } else if (completed < total) {
      this.manifestData.frontmatter.status = 'in_progress';
    } else {
      this.manifestData.frontmatter.status = 'completed';
    }

    await this.syncToGitHub();
  }

  /**
   * Update a specific phase status
   */
  async updatePhase(phaseName: string, status: MigrationPhase['status'], tasksCount?: number): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    const phase = this.manifestData.phases.find(p => p.name === phaseName);
    if (!phase) {
      throw new Error(`Phase "${phaseName}" not found`);
    }

    phase.status = status;
    if (tasksCount !== undefined) {
      phase.tasks_count = tasksCount;
    }

    await this.syncToGitHub();
  }

  /**
   * Mark migration as completed
   */
  async complete(): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    this.manifestData.frontmatter.status = 'completed';
    this.manifestData.frontmatter.completed_at = new Date().toISOString();

    await this.githubService.updateTask(this.issueNumber, {
      state: 'closed',
      labels: ['migration', 'manifest', 'completed'],
    });

    await this.syncToGitHub();
    console.log(`[MigrationManifest] Migration completed! Issue #${this.issueNumber}`);
  }

  /**
   * Mark migration as failed
   */
  async fail(error: Error): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    this.manifestData.frontmatter.status = 'failed';
    this.manifestData.frontmatter.error = error.message;

    await this.githubService.updateTask(this.issueNumber, {
      labels: ['migration', 'manifest', 'failed'],
    });

    await this.syncToGitHub();
    console.error(`[MigrationManifest] Migration failed: ${error.message}`);
  }

  /**
   * Mark migration as rolled back
   */
  async markRolledBack(): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    this.manifestData.frontmatter.status = 'rolled_back';
    this.manifestData.frontmatter.completed_at = new Date().toISOString();

    await this.githubService.updateTask(this.issueNumber, {
      labels: ['migration', 'manifest', 'rolled-back'],
    });

    await this.syncToGitHub();
    console.log(`[MigrationManifest] Migration rolled back! Issue #${this.issueNumber}`);
  }

  /**
   * Get the rollback point (git commit SHA)
   */
  async getRollbackPoint(): Promise<string> {
    // Get current git commit SHA
    const { execSync } = await import('child_process');
    try {
      const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      return `${this.branch}@sha{${sha}}`;
    } catch (error) {
      console.warn('[MigrationManifest] Could not get git SHA, using timestamp');
      return `${this.branch}@${Date.now()}`;
    }
  }

  /**
   * Calculate checksum of task IDs for validation
   */
  calculateChecksum(tasks: Task[]): string {
    const taskIds = tasks.map(t => t.id).sort();
    const data = taskIds.join(',');
    return createHash('sha256').update(data).digest('hex').substring(0, 12);
  }

  /**
   * Validate tasks against checksum
   */
  async validateTasks(tasks: Task[]): Promise<boolean> {
    if (!this.manifestData) {
      throw new Error('Manifest not loaded');
    }

    const calculatedChecksum = this.calculateChecksum(tasks);
    return calculatedChecksum === this.manifestData.frontmatter.checksum;
  }

  /**
   * Rollback to the previous state
   *
   * Resets to the git commit SHA stored in the manifest.
   */
  async rollback(): Promise<void> {
    if (!this.manifestData || !this.issueNumber) {
      throw new Error('Manifest not created. Call create() first.');
    }

    const rollbackPoint = this.manifestData.frontmatter.rollback_point;
    const shaMatch = rollbackPoint.match(/sha\{([^}]+)\}/);

    if (!shaMatch) {
      // If we don't have a SHA (e.g., using timestamp fallback), we can't rollback
      throw new Error(
        `Cannot rollback: rollback point does not contain git SHA. ` +
        `Rollback point format: ${rollbackPoint}. ` +
        `Rollback requires a git commit SHA.`
      );
    }

    const sha = shaMatch[1];

    // Rollback git state
    const { execSync } = await import('child_process');
    try {
      console.log(`[MigrationManifest] Rolling back to commit ${sha}`);

      // Reset to rollback point
      execSync(`git reset --hard ${sha}`, { encoding: 'utf-8' });

      console.log(`[MigrationManifest] Rollback complete`);
    } catch (error) {
      throw new Error(`Rollback failed: ${(error as Error).message}`);
    }
  }

  /**
   * Load existing manifest from GitHub issue
   */
  async load(issueNumber: number): Promise<void> {
    const issue = await this.githubService.getTask(issueNumber);
    this.issueNumber = issueNumber;
    this.manifestData = this.parseManifestBody(issue.body || '');

    console.log(`[MigrationManifest] Loaded manifest #${issueNumber}`);
  }

  /**
   * Get current manifest data
   */
  getData(): MigrationManifestData | null {
    return this.manifestData;
  }

  /**
   * Get issue number
   */
  getIssueNumber(): number | null {
    return this.issueNumber;
  }

  /**
   * Add a comment to the manifest issue
   */
  async addComment(message: string): Promise<void> {
    if (!this.issueNumber) {
      throw new Error('Manifest not created');
    }

    await this.githubService.createComment(this.issueNumber, { body: message });
  }

  /**
   * Sync manifest data to GitHub issue
   */
  private async syncToGitHub(): Promise<void> {
    if (!this.issueNumber) {
      throw new Error('Manifest not created');
    }

    await this.githubService.updateTask(this.issueNumber, {
      body: this.formatManifestBody(),
    });
  }

  /**
   * Format manifest data as issue body with YAML frontmatter
   */
  private formatManifestBody(): string {
    if (!this.manifestData) {
      return '';
    }

    const { frontmatter, phases } = this.manifestData;

    // Build YAML frontmatter
    const yaml = [
      '---',
      `manifest_id: ${frontmatter.manifest_id}`,
      `type: ${frontmatter.type}`,
      `status: ${frontmatter.status}`,
      `started_at: ${frontmatter.started_at}`,
      `completed_at: ${frontmatter.completed_at || 'null'}`,
      `tasks_migrated: ${frontmatter.tasks_migrated}`,
      `tasks_total: ${frontmatter.tasks_total}`,
      `checksum: ${frontmatter.checksum}`,
      `rollback_point: ${frontmatter.rollback_point}`,
      frontmatter.error ? `error: ${frontmatter.error}` : '',
      '---',
      '',
      '# Migration Progress',
      '',
    ].filter(Boolean).join('\n');

    // Build phases list
    const phasesList = phases.map(phase => {
      const icon = this.getPhaseIcon(phase.status);
      const taskCount = phase.tasks_count !== undefined ? ` (${phase.tasks_count} tasks)` : '';
      return `- ${phase.name}${taskCount} ${icon}`;
    }).join('\n');

    // Build statistics
    const progress = frontmatter.tasks_total > 0
      ? Math.round((frontmatter.tasks_migrated / frontmatter.tasks_total) * 100)
      : 0;

    const stats = [
      '',
      '## Statistics',
      '',
      `- **Progress**: ${progress}% (${frontmatter.tasks_migrated}/${frontmatter.tasks_total} tasks)`,
      `- **Status**: ${frontmatter.status}`,
      `- **Started**: ${new Date(frontmatter.started_at).toLocaleString()}`,
      frontmatter.completed_at ? `- **Completed**: ${new Date(frontmatter.completed_at).toLocaleString()}` : '',
      `- **Rollback Point**: \`${frontmatter.rollback_point}\``,
      '',
    ].filter(Boolean).join('\n');

    // Build usage instructions
    const instructions = [
      '## Rollback',
      '',
      'To rollback to the pre-migration state:',
      '```bash',
      `git reset --hard ${frontmatter.rollback_point.match(/sha\{([^}]+)\}/)?.[1] || 'HEAD'}`,
      '```',
      '',
    ].join('\n');

    return yaml + phasesList + stats + instructions;
  }

  /**
   * Parse manifest body and extract frontmatter and phases
   */
  private parseManifestBody(body: string): MigrationManifestData {
    // Extract YAML frontmatter (compatible with ES2022)
    const startMarker = '---\n';
    const endMarker = '\n---';
    const startIndex = body.indexOf(startMarker);
    const endIndex = body.indexOf(endMarker, startIndex + startMarker.length);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Invalid manifest format: missing frontmatter');
    }

    const yaml = body.substring(startIndex + startMarker.length, endIndex);
    const frontmatter = this.parseYamlFrontmatter(yaml);

    // Extract phases from the rest of the body
    const phases: MigrationPhase[] = [];
    // Calculate where phases section starts (after the frontmatter end marker)
    const phasesStartIndex = endIndex + endMarker.length;
    const phaseLines = body.substring(phasesStartIndex).split('\n');

    for (const line of phaseLines) {
      const phaseMatch = line.match(/- (.*?):\s*(\[(.*?)\])?\s*(\((\d+) tasks\))?/);
      if (phaseMatch) {
        const name = phaseMatch[1].trim();
        const statusText = phaseMatch[3] || 'pending';
        const tasksCount = phaseMatch[5] ? parseInt(phaseMatch[5], 10) : undefined;

        phases.push({
          name,
          status: this.parsePhaseStatus(statusText),
          tasks_count: tasksCount,
        });
      }
    }

    return { frontmatter, phases };
  }

  /**
   * Parse YAML frontmatter into object
   */
  private parseYamlFrontmatter(yaml: string): MigrationManifestFrontmatter {
    const lines = yaml.split('\n');
    const data: any = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2];

        // Parse values
        if (value === 'null') {
          data[key] = null;
        } else if (!isNaN(Number(value))) {
          data[key] = Number(value);
        } else {
          data[key] = value;
        }
      }
    }

    return data as MigrationManifestFrontmatter;
  }

  /**
   * Parse phase status from text
   */
  private parsePhaseStatus(text: string): MigrationPhase['status'] {
    const statusMap: Record<string, MigrationPhase['status']> = {
      '✅': 'completed',
      '🔄': 'in_progress',
      '⏳': 'pending',
      '❌': 'failed',
    };

    return statusMap[text] || 'pending';
  }

  /**
   * Get icon for phase status
   */
  private getPhaseIcon(status: MigrationPhase['status']): string {
    const iconMap: Record<MigrationPhase['status'], string> = {
      completed: '✅',
      in_progress: '🔄',
      pending: '⏳',
      failed: '❌',
    };

    return iconMap[status] || '⏳';
  }
}

/**
 * Factory function to create MigrationManifest instance
 */
export async function createMigrationManifest(
  config: MigrationManifestConfig
): Promise<MigrationManifest> {
  const manifest = new MigrationManifest(config);
  return manifest;
}
