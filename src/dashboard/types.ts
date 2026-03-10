/**
 * Dashboard Type Definitions
 */

export interface DashboardMetrics {
  timestamp: number;
  tasks: {
    total: number;
    intake: number;
    inProgress: number;
    review: number;
    completed: number;
    failed: number;
  };
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  performance: {
    avgTaskDuration: number;
    queueDepth: number;
    throughput: number;
  };
}

export interface TaskQueueStatus {
  count: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface AgentStatus {
  id: string;
  status: 'active' | 'idle' | 'failed';
  currentTask: string | null;
  uptime: number; // seconds
}

export interface HealthIndicator {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  details: Record<string, any>;
}

export interface DashboardUpdate {
  metrics: DashboardMetrics;
  queues: Record<string, TaskQueueStatus>;
  agents: AgentStatus[];
  health: HealthIndicator[];
  autoloop: AutoloopStatus;
}

export interface AutoloopStatus {
  status: 'running' | 'stopped' | 'error';
  lastBeat: number | null;
  cycleCount: number;
}
