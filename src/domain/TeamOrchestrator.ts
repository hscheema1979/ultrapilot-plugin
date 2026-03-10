/**
 * Team Orchestrator - Spawns and manages ultra-teams
 *
 * This module provides team spawning and coordination capabilities using the ultra-team skill.
 */

import { Task } from './TaskQueue.js';
import { EventEmitter } from 'events';

/**
 * Team status
 */
export type TeamStatus = 'starting' | 'running' | 'reviewing' | 'completed' | 'failed' | 'cancelled';

/**
 * Team configuration
 */
export interface TeamConfig {
  teamId: string;
  task: Task;
  workerCount: number;
  agentType?: string; // Type of agents to spawn
  focus?: string; // Team focus area
}

/**
 * Team execution state
 */
export interface TeamExecution {
  teamId: string;
  status: TeamStatus;
  task: Task;
  workers: number;
  startedAt?: Date;
  completedAt?: Date;
  progress: number; // 0-100
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  };
  checkpoints: {
    timestamp: Date;
    status: TeamStatus;
    progress: number;
    message?: string;
  }[];
}

/**
 * Team orchestration configuration
 */
export interface TeamOrchestratorConfig {
  maxConcurrentTeams: number;
  maxWorkersPerTeam: number;
  teamCheckIntervalMs: number;
  teamTimeoutMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TeamOrchestratorConfig = {
  maxConcurrentTeams: 5,
  maxWorkersPerTeam: 5,
  teamCheckIntervalMs: 10000, // Check every 10 seconds
  teamTimeoutMs: 60 * 60 * 1000 // 1 hour timeout
};

/**
 * Team Orchestrator - Manages ultra-team lifecycle
 */
export class TeamOrchestrator extends EventEmitter {
  private config: TeamOrchestratorConfig;
  private activeTeams: Map<string, TeamExecution>;
  private teamHistory: Map<string, TeamExecution>;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config?: Partial<TeamOrchestratorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeTeams = new Map();
    this.teamHistory = new Map();
  }

  /**
   * Spawn a new ultra-team
   */
  async spawnTeam(config: TeamConfig): Promise<string> {
    const { teamId, task, workerCount } = config;

    console.log(`   [TeamOrchestrator] Spawning team ${teamId}`);
    console.log(`   [TeamOrchestrator]   - Task: ${task.title}`);
    console.log(`   [TeamOrchestrator]   - Workers: ${workerCount}`);

    // Create team execution state
    const execution: TeamExecution = {
      teamId,
      status: 'starting',
      task,
      workers: workerCount,
      progress: 0,
      checkpoints: [{
        timestamp: new Date(),
        status: 'starting',
        progress: 0,
        message: 'Team spawn initiated'
      }]
    };

    this.activeTeams.set(teamId, execution);

    try {
      // TODO: Integrate with actual ultra-team skill
      //
      // Real implementation would be:
      // const result = await Skill({
      //   skill: 'ultra-team',
      //   args: JSON.stringify({
      //     task: task.id,
      //     taskTitle: task.title,
      //     taskDescription: task.description,
      //     workers: workerCount,
      //     agentType: config.agentType || 'team-implementer',
      //     focus: config.focus
      //   })
      // });
      //
      // For now, simulate team spawning

      console.log(`   [TeamOrchestrator] → Invoking ultra-team skill...`);

      // Simulate team startup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update status to running
      execution.status = 'running';
      execution.startedAt = new Date();
      execution.progress = 10;
      execution.checkpoints.push({
        timestamp: new Date(),
        status: 'running',
        progress: 10,
        message: 'Team spawned and started working'
      });

      this.emit('teamSpawned', { teamId, config, execution });
      console.log(`   [TeamOrchestrator] ✅ Team ${teamId} spawned successfully`);

      // Start monitoring this team
      this.startTeamMonitoring(teamId);

      return teamId;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   [TeamOrchestrator] ❌ Failed to spawn team ${teamId}: ${errorMsg}`);

      execution.status = 'failed';
      execution.result = {
        success: false,
        error: errorMsg
      };
      execution.checkpoints.push({
        timestamp: new Date(),
        status: 'failed',
        progress: execution.progress,
        message: errorMsg
      });

      this.emit('teamSpawnFailed', { teamId, error: errorMsg });
      throw error;
    }
  }

  /**
   * Spawn multiple teams for a large task
   */
  async spawnMultipleTeams(
    task: Task,
    teamCount: number,
    totalWorkers: number
  ): Promise<string[]> {
    console.log(`   [TeamOrchestrator] Spawning ${teamCount} teams`);
    console.log(`   [TeamOrchestrator]   - Total workers: ${totalWorkers}`);
    console.log(`   [TeamOrchestrator]   - Workers per team: ${Math.ceil(totalWorkers / teamCount)}`);

    const workersPerTeam = Math.ceil(totalWorkers / teamCount);
    const teamIds: string[] = [];
    const promises: Promise<string>[] = [];

    // Spawn all teams in parallel
    for (let i = 0; i < teamCount; i++) {
      const teamId = `team-${task.id}-${i + 1}-${Date.now()}`;
      const focus = this.getTeamFocus(i, teamCount);

      const config: TeamConfig = {
        teamId,
        task,
        workerCount: workersPerTeam,
        focus
      };

      promises.push(this.spawnTeam(config));
      teamIds.push(teamId);
    }

    // Wait for all teams to spawn
    await Promise.all(promises);

    this.emit('multipleTeamsSpawned', { task, teamCount, teamIds });
    console.log(`   [TeamOrchestrator] ✅ All ${teamCount} teams spawned`);

    return teamIds;
  }

  /**
   * Get team focus area based on team index
   */
  private getTeamFocus(teamIndex: number, totalTeams: number): string {
    const focuses = [
      'frontend',
      'backend',
      'database',
      'testing',
      'devops',
      'security'
    ];

    if (teamIndex < focuses.length) {
      return focuses[teamIndex];
    }

    return `team-${teamIndex + 1}`;
  }

  /**
   * Start monitoring a team
   */
  private startTeamMonitoring(teamId: string): void {
    // Check team status periodically
    const checkInterval = setInterval(async () => {
      const execution = this.activeTeams.get(teamId);

      if (!execution || execution.status === 'completed' || execution.status === 'failed') {
        clearInterval(checkInterval);
        return;
      }

      // TODO: Check actual team status from ultra-team skill
      // For now, simulate progress
      await this.updateTeamProgress(teamId);

    }, this.config.teamCheckIntervalMs);

    // Store interval ID for cleanup (not implemented yet)
    // execution.checkInterval = checkInterval;
  }

  /**
   * Update team progress (simulated for now)
   */
  private async updateTeamProgress(teamId: string): Promise<void> {
    const execution = this.activeTeams.get(teamId);
    if (!execution) return;

    // Simulate progress
    const progressIncrement = Math.random() * 15;
    execution.progress = Math.min(execution.progress + progressIncrement, 95);

    execution.checkpoints.push({
      timestamp: new Date(),
      status: execution.status,
      progress: execution.progress,
      message: `Work in progress: ${Math.round(execution.progress)}% complete`
    });

    // Emit progress event
    this.emit('teamProgress', { teamId, execution });

    // Check if team should complete
    if (execution.progress >= 90 && Math.random() > 0.7) {
      await this.completeTeam(teamId, true);
    }
  }

  /**
   * Mark team as completed
   */
  async completeTeam(teamId: string, success: boolean): Promise<void> {
    const execution = this.activeTeams.get(teamId);
    if (!execution) return;

    console.log(`   [TeamOrchestrator] Completing team ${teamId}...`);

    execution.status = success ? 'completed' : 'failed';
    execution.completedAt = new Date();
    execution.progress = 100;

    if (success) {
      execution.result = {
        success: true,
        output: `Team ${teamId} completed task "${execution.task.title}" successfully`,
        metadata: {
          workers: execution.workers,
          duration: execution.completedAt.getTime() - execution.startedAt!.getTime()
        }
      };
      console.log(`   [TeamOrchestrator] ✅ Team ${teamId} completed successfully`);
    } else {
      execution.result = {
        success: false,
        error: `Team ${teamId} failed to complete task`
      };
      console.log(`   [TeamOrchestrator] ❌ Team ${teamId} failed`);
    }

    execution.checkpoints.push({
      timestamp: new Date(),
      status: execution.status,
      progress: 100,
      message: success ? 'Task completed successfully' : 'Task failed'
    });

    // Move from active to history
    this.activeTeams.delete(teamId);
    this.teamHistory.set(teamId, execution);

    this.emit('teamCompleted', { teamId, execution, success });
  }

  /**
   * Get team execution status
   */
  getTeamStatus(teamId: string): TeamExecution | undefined {
    return this.activeTeams.get(teamId) || this.teamHistory.get(teamId);
  }

  /**
   * Get all active teams
   */
  getActiveTeams(): TeamExecution[] {
    return Array.from(this.activeTeams.values());
  }

  /**
   * Get team history
   */
  getTeamHistory(): TeamExecution[] {
    return Array.from(this.teamHistory.values());
  }

  /**
   * Cancel a running team
   */
  async cancelTeam(teamId: string): Promise<void> {
    const execution = this.activeTeams.get(teamId);
    if (!execution) {
      throw new Error(`Team ${teamId} not found`);
    }

    console.log(`   [TeamOrchestrator] Cancelling team ${teamId}...`);

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    execution.result = {
      success: false,
      error: 'Team cancelled by user'
    };

    execution.checkpoints.push({
      timestamp: new Date(),
      status: 'cancelled',
      progress: execution.progress,
      message: 'Team cancelled'
    });

    // Move from active to history
    this.activeTeams.delete(teamId);
    this.teamHistory.set(teamId, execution);

    this.emit('teamCancelled', { teamId, execution });
    console.log(`   [TeamOrchestrator] ✅ Team ${teamId} cancelled`);
  }

  /**
   * Get orchestration statistics
   */
  getStats(): {
    activeTeams: number;
    totalTeamsSpawned: number;
    completedTeams: number;
    failedTeams: number;
    cancelledTeams: number;
    avgTeamSize: number;
    avgCompletionTime: number;
  } {
    const history = Array.from(this.teamHistory.values());
    const completed = history.filter(t => t.status === 'completed');
    const failed = history.filter(t => t.status === 'failed');
    const cancelled = history.filter(t => t.status === 'cancelled');

    const totalWorkers = history.reduce((sum, t) => sum + t.workers, 0);
    const avgTeamSize = history.length > 0 ? totalWorkers / history.length : 0;

    const completionTimes = completed
      .filter(t => t.startedAt && t.completedAt)
      .map(t => t.completedAt!.getTime() - t.startedAt!.getTime());

    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : 0;

    return {
      activeTeams: this.activeTeams.size,
      totalTeamsSpawned: history.length,
      completedTeams: completed.length,
      failedTeams: failed.length,
      cancelledTeams: cancelled.length,
      avgTeamSize,
      avgCompletionTime
    };
  }
}

/**
 * Factory function
 */
export function createTeamOrchestrator(config?: Partial<TeamOrchestratorConfig>): TeamOrchestrator {
  return new TeamOrchestrator(config);
}
