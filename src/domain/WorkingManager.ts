/**
 * Working Manager - Ultra Loop's capability to execute tasks AND manage teams
 *
 * This module implements the "Working Manager" pattern where Ultra Loop can:
 * - Execute tasks individually (small tasks)
 * - Spawn and manage ultra-teams (medium/large tasks)
 * - Coordinate multiple teams in parallel (huge tasks)
 *
 * Based on the consulting firm model:
 * - Small firms: Ultra Loop does everything themselves
 * - Midsize firms: Ultra Loop does some work, manages team for rest
 * - Large firms: Ultra Loop coordinates multiple teams, does critical work
 */

import { Task, TaskPriority } from './TaskQueue.js';
import { EventEmitter } from 'events';
import { TaskExecutor, createTaskExecutor } from './TaskExecutor.js';
import { TeamOrchestrator, createTeamOrchestrator } from './TeamOrchestrator.js';

/**
 * Task complexity classification
 */
export enum TaskComplexity {
  SMALL = 'small',           // 1-4 hours: Do it myself
  MEDIUM = 'medium',         // 1-3 days: Do parts + spawn team
  LARGE = 'large',           // 1-2 weeks: Spawn multiple teams
  HUGE = 'huge'              // 3+ weeks: Spawn many teams, coordinate
}

/**
 * Task size estimate result
 */
export interface TaskSizeEstimate {
  complexity: TaskComplexity;
  estimatedHours: number;
  recommendedWorkers: number;
  recommendedTeams: number;
  reasoning: string;
}

/**
 * Execution strategy
 */
export interface ExecutionStrategy {
  executeMyself: boolean;
  spawnTeam: boolean;
  spawnMultipleTeams: boolean;
  workerCount: number;
  teamCount: number;
  approach: string;
}

/**
 * Team coordination state
 */
export interface TeamCoordination {
  teamId: string;
  workers: number;
  taskIds: string[];
  status: 'starting' | 'running' | 'reviewing' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Working Manager configuration
 */
export interface WorkingManagerConfig {
  maxConcurrentTeams: number;
  maxWorkersPerTeam: number;
  preferIndividualExecutionUnderHours: number;
  preferTeamExecutionOverHours: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WorkingManagerConfig = {
  maxConcurrentTeams: 5,
  maxWorkersPerTeam: 5,
  preferIndividualExecutionUnderHours: 4,  // Tasks < 4 hours: do myself
  preferTeamExecutionOverHours: 8,        // Tasks > 8 hours: spawn team
};

/**
 * Working Manager - Implements the working manager pattern
 */
export class WorkingManager extends EventEmitter {
  private config: WorkingManagerConfig;
  private activeTeams: Map<string, TeamCoordination>;
  private executionHistory: Map<string, TaskSizeEstimate[]>;
  private taskExecutor: TaskExecutor;
  private teamOrchestrator: TeamOrchestrator;

  constructor(config?: Partial<WorkingManagerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeTeams = new Map();
    this.executionHistory = new Map();

    // Initialize task executor and team orchestrator
    this.taskExecutor = createTaskExecutor();
    this.teamOrchestrator = createTeamOrchestrator({
      maxConcurrentTeams: config?.maxConcurrentTeams || 5,
      maxWorkersPerTeam: config?.maxWorkersPerTeam || 5
    });

    // Forward team orchestrator events
    this.teamOrchestrator.on('teamSpawned', (data) => this.emit('teamSpawned', data));
    this.teamOrchestrator.on('teamCompleted', (data) => this.emit('teamCompleted', data));
    this.teamOrchestrator.on('teamProgress', (data) => this.emit('teamProgress', data));
  }

  /**
   * Analyze task and determine execution strategy
   */
  analyzeTask(task: Task): ExecutionStrategy {
    const size = this.estimateTaskSize(task);

    // Determine strategy based on complexity
    switch (size.complexity) {
      case TaskComplexity.SMALL:
        return {
          executeMyself: true,
          spawnTeam: false,
          spawnMultipleTeams: false,
          workerCount: 0,
          teamCount: 0,
          approach: `Task estimated at ${size.estimatedHours}h - I'll execute it myself`
        };

      case TaskComplexity.MEDIUM:
        return {
          executeMyself: true,
          spawnTeam: true,
          spawnMultipleTeams: false,
          workerCount: size.recommendedWorkers,
          teamCount: 1,
          approach: `Task estimated at ${size.estimatedHours}h - I'll oversee execution and spawn ${size.recommendedWorkers} workers`
        };

      case TaskComplexity.LARGE:
        return {
          executeMyself: false,  // Focus on coordination
          spawnTeam: true,
          spawnMultipleTeams: true,
          workerCount: size.recommendedWorkers,
          teamCount: size.recommendedTeams,
          approach: `Task estimated at ${size.estimatedHours}h - Spawning ${size.recommendedTeams} teams with ${size.recommendedWorkers} total workers`
        };

      case TaskComplexity.HUGE:
        return {
          executeMyself: true,  // Still do critical/architecture work
          spawnTeam: true,
          spawnMultipleTeams: true,
          workerCount: size.recommendedWorkers,
          teamCount: size.recommendedTeams,
          approach: `Task estimated at ${size.estimatedHours}h - Coordinating ${size.recommendedTeams} teams, doing critical work myself`
        };

      default:
        return {
          executeMyself: true,
          spawnTeam: false,
          spawnMultipleTeams: false,
          workerCount: 0,
          teamCount: 0,
          approach: 'Default: executing task myself'
        };
    }
  }

  /**
   * Estimate task size based on task properties
   */
  private estimateTaskSize(task: Task): TaskSizeEstimate {
    let estimatedHours = 0;
    let complexity = TaskComplexity.SMALL;
    let reasoning = '';

    // Factor 1: Description length (rough estimate of complexity)
    const wordCount = task.description.split(/\s+/).length;
    if (wordCount > 500) {
      estimatedHours += 8;
      reasoning += 'Long description suggests complexity; ';
    } else if (wordCount > 200) {
      estimatedHours += 4;
      reasoning += 'Medium description length; ';
    } else {
      estimatedHours += 1;
      reasoning += 'Brief description; ';
    }

    // Factor 2: Priority (higher priority often = more complex)
    if (task.priority === TaskPriority.CRITICAL) {
      estimatedHours += 4;
      reasoning += 'Critical priority adds complexity; ';
    } else if (task.priority === TaskPriority.HIGH) {
      estimatedHours += 2;
      reasoning += 'High priority; ';
    }

    // Factor 3: Dependencies (more dependencies = more coordination)
    if (task.dependencies && task.dependencies.length > 0) {
      estimatedHours += task.dependencies.length * 0.5;
      reasoning += `${task.dependencies.length} dependencies add coordination; `;
    }

    // Factor 4: Tags indicate domain complexity
    if (task.tags) {
      const complexTags = ['security', 'database', 'architecture', 'migration', 'integration'];
      const foundComplexTags = task.tags.filter(tag => complexTags.some(ct => tag.toLowerCase().includes(ct)));
      if (foundComplexTags.length > 0) {
        estimatedHours += foundComplexTags.length * 3;
        reasoning += `Complex domains: ${foundComplexTags.join(', ')}; `;
      }
    }

    // Factor 5: Metadata hints
    if (task.metadata) {
      if (task.metadata.subtasks) {
        const subtaskCount = Array.isArray(task.metadata.subtasks) ? task.metadata.subtasks.length : 1;
        estimatedHours += subtaskCount * 2;
        reasoning += `${subtaskCount} subtasks; `;
      }
      if (task.metadata.estimatedHours) {
        estimatedHours = Math.max(estimatedHours, task.metadata.estimatedHours as number);
        reasoning += 'User provided estimate used; ';
      }
    }

    // Determine complexity classification
    if (estimatedHours <= 4) {
      complexity = TaskComplexity.SMALL;
      reasoning += `→ SMALL (${estimatedHours.toFixed(1)}h)`;
    } else if (estimatedHours <= 24) {
      complexity = TaskComplexity.MEDIUM;
      reasoning += `→ MEDIUM (${estimatedHours.toFixed(1)}h)`;
    } else if (estimatedHours <= 80) {
      complexity = TaskComplexity.LARGE;
      reasoning += `→ LARGE (${estimatedHours.toFixed(1)}h)`;
    } else {
      complexity = TaskComplexity.HUGE;
      reasoning += `→ HUGE (${estimatedHours.toFixed(1)}h)`;
    }

    // Calculate recommended workers and teams
    let recommendedWorkers = 0;
    let recommendedTeams = 0;

    switch (complexity) {
      case TaskComplexity.SMALL:
        recommendedWorkers = 0;  // Just me
        recommendedTeams = 0;
        break;

      case TaskComplexity.MEDIUM:
        recommendedWorkers = Math.min(5, Math.ceil(estimatedHours / 8));
        recommendedTeams = 1;
        break;

      case TaskComplexity.LARGE:
        recommendedWorkers = Math.min(15, Math.ceil(estimatedHours / 6));
        recommendedTeams = Math.ceil(recommendedWorkers / 5);
        break;

      case TaskComplexity.HUGE:
        recommendedWorkers = Math.min(30, Math.ceil(estimatedHours / 5));
        recommendedTeams = Math.ceil(recommendedWorkers / 5);
        break;
    }

    return {
      complexity,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      recommendedWorkers,
      recommendedTeams,
      reasoning
    };
  }

  /**
   * Execute task myself (individual execution)
   * This is where Ultra Loop does the work directly
   */
  async executeTaskMyself(task: Task): Promise<Task['result']> {
    console.log(`   [WorkingManager] Executing task myself: ${task.title}`);

    try {
      // Use TaskExecutor to execute with appropriate agent
      const result = await this.taskExecutor.executeTask(task);

      console.log(`   [WorkingManager] ✅ Task completed successfully`);
      this.emit('taskExecuted', { taskId: task.id, result });

      return result;

    } catch (error) {
      const result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executedBy: 'ultra-loop',
          executionMethod: 'individual',
          executionTime: Date.now()
        }
      };

      console.error(`   [WorkingManager] ❌ Task failed: ${result.error}`);
      this.emit('taskFailed', { taskId: task.id, result });

      return result;
    }
  }

  /**
   * Spawn ultra-team for task execution
   */
  async spawnUltraTeam(task: Task, workerCount: number): Promise<string> {
    const teamId = `team-${task.id}-${Date.now()}`;

    console.log(`   [WorkingManager] Spawning ultra-team ${teamId}`);
    console.log(`   [WorkingManager]   - Task: ${task.title}`);
    console.log(`   [WorkingManager]   - Workers: ${workerCount}`);

    try {
      // Use TeamOrchestrator to spawn team
      await this.teamOrchestrator.spawnTeam({
        teamId,
        task,
        workerCount
      });

      // Track coordination locally
      const coordination: TeamCoordination = {
        teamId,
        workers: workerCount,
        taskIds: [task.id],
        status: 'running',
        startedAt: new Date()
      };

      this.activeTeams.set(teamId, coordination);

      console.log(`   [WorkingManager] ✅ Team ${teamId} spawned successfully`);

      return teamId;

    } catch (error) {
      console.error(`   [WorkingManager] ❌ Failed to spawn team: ${error}`);
      throw error;
    }
  }

  /**
   * Spawn multiple ultra-teams for large tasks
   */
  async spawnMultipleTeams(task: Task, teamCount: number, totalWorkers: number): Promise<string[]> {
    console.log(`   [WorkingManager] Spawning ${teamCount} teams with ${totalWorkers} total workers`);

    // Use TeamOrchestrator to spawn multiple teams
    const teamIds = await this.teamOrchestrator.spawnMultipleTeams(task, teamCount, totalWorkers);

    // Track all teams locally
    for (const teamId of teamIds) {
      const workersPerTeam = Math.ceil(totalWorkers / teamCount);
      const coordination: TeamCoordination = {
        teamId,
        workers: workersPerTeam,
        taskIds: [task.id],
        status: 'running',
        startedAt: new Date()
      };
      this.activeTeams.set(teamId, coordination);
    }

    console.log(`   [WorkingManager] ✅ All ${teamCount} teams spawned`);
    this.emit('multipleTeamsSpawned', { task, teamCount, teamIds });

    return teamIds;
  }

  /**
   * Coordinate multiple teams working on a task
   */
  async coordinateTeams(task: Task, teamIds: string[]): Promise<void> {
    console.log(`   [WorkingManager] Coordinating ${teamIds.length} teams for task: ${task.title}`);

    // Update coordination status
    for (const teamId of teamIds) {
      const coordination = this.activeTeams.get(teamId);
      if (coordination) {
        coordination.status = 'running';
      }
    }

    this.emit('teamsCoordinated', { task, teamIds });

    // Monitor teams until they complete
    await this.monitorTeams(task, teamIds);
  }

  /**
   * Monitor multiple teams until completion
   */
  private async monitorTeams(task: Task, teamIds: string[]): Promise<void> {
    console.log(`   [WorkingManager] Monitoring ${teamIds.length} teams...`);

    const checkInterval = 10000; // Check every 10 seconds
    const maxWaitTime = 60 * 60 * 1000; // Max 1 hour
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Check status of all teams
      const teamStatuses = teamIds.map(teamId =>
        this.teamOrchestrator.getTeamStatus(teamId)
      );

      const completedTeams = teamStatuses.filter(t => t && t.status === 'completed');
      const failedTeams = teamStatuses.filter(t => t && t.status === 'failed');
      const activeTeams = teamStatuses.filter(t => t && (t.status === 'running' || t.status === 'starting'));

      // Log progress
      console.log(`   [WorkingManager] Progress: ${completedTeams.length}/${teamIds.length} teams completed`);

      // Check if all teams are done
      if (completedTeams.length + failedTeams.length === teamIds.length) {
        console.log(`   [WorkingManager] ✅ All teams finished`);
        console.log(`   [WorkingManager]    - Completed: ${completedTeams.length}`);
        console.log(`   [WorkingManager]    - Failed: ${failedTeams.length}`);

        // Update local coordination status
        for (const teamId of teamIds) {
          const status = this.teamOrchestrator.getTeamStatus(teamId);
          const coordination = this.activeTeams.get(teamId);
          if (coordination && status) {
            coordination.status = status.status as any;
            if (status.completedAt) {
              coordination.completedAt = status.completedAt;
            }
          }
        }

        break;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Aggregate results from all teams
    const results = this.aggregateTeamResults(task, teamIds);
    this.emit('teamsResultsAggregated', { task, teamIds, results });
  }

  /**
   * Aggregate results from multiple teams
   */
  private aggregateTeamResults(task: Task, teamIds: string[]) {
    const teamResults = teamIds.map(teamId => {
      const status = this.teamOrchestrator.getTeamStatus(teamId);
      return {
        teamId,
        status: status?.status,
        result: status?.result
      };
    });

    const completedCount = teamResults.filter(r => r.status === 'completed').length;
    const failedCount = teamResults.filter(r => r.status === 'failed').length;

    return {
      totalTeams: teamIds.length,
      completedTeams: completedCount,
      failedTeams: failedCount,
      successRate: completedCount / teamIds.length,
      results: teamResults
    };
  }

  /**
   * Get status of all active teams
   */
  getActiveTeams(): TeamCoordination[] {
    return Array.from(this.activeTeams.values());
  }

  /**
   * Get status of specific team
   */
  getTeamStatus(teamId: string): TeamCoordination | undefined {
    return this.activeTeams.get(teamId);
  }

  /**
   * Mark team as completed
   */
  markTeamCompleted(teamId: string, success: boolean): void {
    const coordination = this.activeTeams.get(teamId);
    if (coordination) {
      coordination.status = success ? 'completed' : 'failed';
      coordination.completedAt = new Date();
      this.emit('teamCompleted', { teamId, coordination, success });
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    totalTeamsSpawned: number;
    activeTeams: number;
    avgTeamSize: number;
    teamOrchestratorStats: ReturnType<TeamOrchestrator['getStats']>;
  } {
    const teams = Array.from(this.activeTeams.values());
    const totalWorkers = teams.reduce((sum, t) => sum + t.workers, 0);

    return {
      totalExecutions: 0,  // TODO: Track executions
      totalTeamsSpawned: teams.length,
      activeTeams: teams.filter(t => t.status === 'running').length,
      avgTeamSize: teams.length > 0 ? totalWorkers / teams.length : 0,
      teamOrchestratorStats: this.teamOrchestrator.getStats()
    };
  }
}

/**
 * Factory function
 */
export function createWorkingManager(config?: Partial<WorkingManagerConfig>): WorkingManager {
  return new WorkingManager(config);
}
