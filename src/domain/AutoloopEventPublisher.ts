/**
 * Autoloop Event Publisher - Bridge between AutoloopDaemon and AgentMessageBus
 *
 * Publishes autoloop lifecycle events to the AgentMessageBus for:
 * - Real-time monitoring
 * - Multi-process coordination
 * - Dashboard visualization
 * - Audit trail
 */

import { AgentMessageBus, MessagePriority } from '../agent-comms/AgentMessageBus.js';
import { SessionManager } from '../session/SessionManager.js';
import { SessionRole } from '../session/SessionTypes.js';

/**
 * Autoloop event types
 */
export type AutoloopEventType =
  | 'heartbeat'
  | 'task.queued'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'agent.spawned'
  | 'cycle.complete'
  | 'routine.executed'
  | 'daemon.started'
  | 'daemon.stopped'
  | 'daemon.paused'
  | 'daemon.resumed';

/**
 * Autoloop event payload
 */
export interface AutoloopEventPayload {
  type: AutoloopEventType;
  cycleNumber?: number;
  timestamp: Date;
  workspacePath: string;
  sessionId: string;
  payload: {
    taskId?: string;
    taskTitle?: string;
    taskCategory?: string;
    agentId?: string;
    agentSkill?: string;
    result?: unknown;
    error?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Autoloop event publisher configuration
 */
export interface AutoloopEventPublisherConfig {
  workspacePath: string;
  messageBus: AgentMessageBus;
  sessionManager: SessionManager;
  enabled?: boolean;
}

/**
 * Autoloop Event Publisher
 *
 * Bridges AutoloopDaemon events to AgentMessageBus for system-wide visibility.
 */
export class AutoloopEventPublisher {
  private config: AutoloopEventPublisherConfig;
  private sessionId: string | null = null;
  private messageBus: AgentMessageBus;
  private sessionManager: SessionManager;
  private enabled: boolean;
  private eventSequence: number = 0;

  // Event channels
  private readonly CHANNEL_AUTOLOOP = 'autoloop';
  private readonly CHANNEL_AUTOLOOP_TASKS = 'autoloop.tasks';
  private readonly CHANNEL_AUTOLOOP_AGENTS = 'autoloop.agents';
  private readonly CHANNEL_AUTOLOOP_CYCLES = 'autoloop.cycles';
  private readonly CHANNEL_AUTOLOOP_ROUTINES = 'autoloop.routines';

  constructor(config: AutoloopEventPublisherConfig) {
    this.config = config;
    this.messageBus = config.messageBus;
    this.sessionManager = config.sessionManager;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Initialize event publisher (create AUTOLOOP session)
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      console.log('   [AutoloopEventPublisher] Event publishing disabled');
      return;
    }

    try {
      // Create AUTOLOOP session
      this.sessionId = await this.sessionManager.createSession({
        role: SessionRole.AUTOLOOP,
        workspacePath: this.config.workspacePath,
        metadata: {
          startTime: new Date().toISOString(),
          eventSequence: 0
        }
      });

      console.log(`   [AutoloopEventPublisher] Session created: ${this.sessionId}`);

      // Setup channel permissions for autoloop
      this.setupChannelPermissions();

    } catch (error) {
      console.error(`   [AutoloopEventPublisher] Failed to initialize: ${error}`);
      this.enabled = false;
    }
  }

  /**
   * Setup channel permissions for autoloop events
   */
  private setupChannelPermissions(): void {
    // Grant autoloop permission to publish to its channels
    // Note: AgentMessageBus needs to be configured to allow these permissions
    // For now, we'll rely on the default public channel permissions
  }

  /**
   * Publish heartbeat event (every 60s cycle)
   */
  async publishHeartbeat(cycleNumber: number, stats: {
    uptime: number;
    cyclesCompleted: number;
    tasksProcessed: number;
    routinesExecuted: number;
    errors: number;
  }): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('heartbeat', this.CHANNEL_AUTOLOOP, {
      cycleNumber,
      payload: {
        ...stats,
        metadata: {
          uptimeMs: stats.uptime,
          lastHeartbeat: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish task queued event
   */
  async publishTaskQueued(taskId: string, taskTitle: string, category: string): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('task.queued', this.CHANNEL_AUTOLOOP_TASKS, {
      payload: {
        taskId,
        taskTitle,
        taskCategory: category,
        metadata: {
          queuedAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish task started event
   */
  async publishTaskStarted(taskId: string, taskTitle: string, agentSkill: string): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('task.started', this.CHANNEL_AUTOLOOP_TASKS, {
      payload: {
        taskId,
        taskTitle,
        agentSkill,
        metadata: {
          startedAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish task completed event
   */
  async publishTaskCompleted(
    taskId: string,
    taskTitle: string,
    result: unknown,
    duration: number
  ): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('task.completed', this.CHANNEL_AUTOLOOP_TASKS, {
      payload: {
        taskId,
        taskTitle,
        result,
        duration,
        metadata: {
          completedAt: new Date().toISOString(),
          durationMs: duration
        }
      }
    });
  }

  /**
   * Publish task failed event
   */
  async publishTaskFailed(
    taskId: string,
    taskTitle: string,
    error: string,
    duration: number
  ): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('task.failed', this.CHANNEL_AUTOLOOP_TASKS, {
      payload: {
        taskId,
        taskTitle,
        error,
        duration,
        metadata: {
          failedAt: new Date().toISOString(),
          durationMs: duration
        }
      }
    }, MessagePriority.HIGH); // High priority for failures
  }

  /**
   * Publish agent spawned event
   */
  async publishAgentSpawned(agentId: string, agentSkill: string, taskId: string): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('agent.spawned', this.CHANNEL_AUTOLOOP_AGENTS, {
      payload: {
        agentId,
        agentSkill,
        taskId,
        metadata: {
          spawnedAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish cycle complete event
   */
  async publishCycleComplete(cycleResult: {
    cycleNumber: number;
    startTime: Date;
    endTime: Date;
    duration: number;
    tasksProcessed: number;
    routinesExecuted: Array<{
      name: string;
      success: boolean;
      duration: number;
    }>;
    errors: string[];
  }): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('cycle.complete', this.CHANNEL_AUTOLOOP_CYCLES, {
      cycleNumber: cycleResult.cycleNumber,
      payload: {
        ...cycleResult,
        metadata: {
          durationMs: cycleResult.duration,
          tasksCount: cycleResult.tasksProcessed,
          routinesCount: cycleResult.routinesExecuted.length,
          errorsCount: cycleResult.errors.length
        }
      }
    });
  }

  /**
   * Publish routine executed event
   */
  async publishRoutineExecuted(routineResult: {
    name: string;
    success: boolean;
    duration: number;
    output?: string;
    error?: string;
  }): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('routine.executed', this.CHANNEL_AUTOLOOP_ROUTINES, {
      payload: {
        ...routineResult,
        metadata: {
          executedAt: new Date().toISOString(),
          durationMs: routineResult.duration
        }
      }
    });
  }

  /**
   * Publish daemon started event
   */
  async publishDaemonStarted(): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('daemon.started', this.CHANNEL_AUTOLOOP, {
      payload: {
        metadata: {
          startedAt: new Date().toISOString(),
          pid: process.pid
        }
      }
    }, MessagePriority.HIGH);
  }

  /**
   * Publish daemon stopped event
   */
  async publishDaemonStopped(): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('daemon.stopped', this.CHANNEL_AUTOLOOP, {
      payload: {
        metadata: {
          stoppedAt: new Date().toISOString(),
          totalEvents: this.eventSequence
        }
      }
    }, MessagePriority.HIGH);
  }

  /**
   * Publish daemon paused event
   */
  async publishDaemonPaused(): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('daemon.paused', this.CHANNEL_AUTOLOOP, {
      payload: {
        metadata: {
          pausedAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish daemon resumed event
   */
  async publishDaemonResumed(): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    await this.publishEvent('daemon.resumed', this.CHANNEL_AUTOLOOP, {
      payload: {
        metadata: {
          resumedAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Publish event to message bus
   */
  private async publishEvent(
    type: AutoloopEventType,
    channel: string,
    data: {
      cycleNumber?: number;
      payload: AutoloopEventPayload['payload'];
    },
    priority: MessagePriority = MessagePriority.NORMAL
  ): Promise<void> {
    try {
      const event: AutoloopEventPayload = {
        type,
        cycleNumber: data.cycleNumber,
        timestamp: new Date(),
        workspacePath: this.config.workspacePath,
        sessionId: this.sessionId!,
        payload: data.payload
      };

      // Increment sequence
      this.eventSequence++;

      // Publish to message bus
      await this.messageBus.publish(
        'autoloop-daemon',
        channel,
        {
          type: `autoloop.${type}`,
          payload: event,
          correlationId: `autoloop-${this.eventSequence}`
        },
        { priority }
      );

      // Update session activity
      if (this.sessionId) {
        this.sessionManager.updateActivity(this.sessionId);
      }

    } catch (error) {
      console.error(`   [AutoloopEventPublisher] Failed to publish event: ${error}`);
    }
  }

  /**
   * Shutdown event publisher
   */
  async shutdown(): Promise<void> {
    if (!this.enabled || !this.sessionId) return;

    try {
      // Publish daemon stopped event
      await this.publishDaemonStopped();

      // Stop session
      await this.sessionManager.stopSession(this.sessionId);

      console.log(`   [AutoloopEventPublisher] Session stopped: ${this.sessionId}`);

    } catch (error) {
      console.error(`   [AutoloopEventPublisher] Shutdown error: ${error}`);
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.eventSequence;
  }
}

/**
 * Factory function to create autoloop event publisher
 */
export function createAutoloopEventPublisher(
  config: AutoloopEventPublisherConfig
): AutoloopEventPublisher {
  return new AutoloopEventPublisher(config);
}
