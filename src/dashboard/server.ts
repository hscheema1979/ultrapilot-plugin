/**
 * Mission Control Dashboard Server
 *
 * Real-time monitoring dashboard for UltraPilot operations.
 * Provides REST API + WebSocket for live updates.
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, readFileSync, watch } from 'fs';
import type { DashboardMetrics, TaskQueueStatus, AgentStatus, HealthIndicator } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private updateInterval?: NodeJS.Timeout;
  private readonly PORT = process.env.DASHBOARD_PORT || 3000;
  private readonly ULTRA_DIR = join(process.cwd(), '.ultra');

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupFileWatchers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(join(__dirname, 'public')));
  }

  private setupRoutes(): void {
    // API: Metrics
    this.app.get('/api/metrics', (_req, res) => {
      const metrics = this.collectMetrics();
      res.json(metrics);
    });

    // API: Task queues
    this.app.get('/api/queues', (_req, res) => {
      const queues = this.getTaskQueues();
      res.json(queues);
    });

    // API: Agent status
    this.app.get('/api/agents', (_req, res) => {
      const agents = this.getAgentStatus();
      res.json(agents);
    });

    // API: Health indicators
    this.app.get('/api/health', (_req, res) => {
      const health = this.getHealthIndicators();
      res.json(health);
    });

    // API: Autoloop status
    this.app.get('/api/autoloop', (_req, res) => {
      const autoloop = this.getAutoloopStatus();
      res.json(autoloop);
    });

    // SPA fallback
    this.app.get('*', (_req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      // Send initial data
      this.sendUpdate(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  private setupFileWatchers(): void {
    const watchPath = join(this.ULTRA_DIR, 'state');
    if (existsSync(watchPath)) {
      watch(watchPath, () => {
        this.broadcastUpdate();
      });
    }
  }

  private collectMetrics(): DashboardMetrics {
    const queues = this.getTaskQueues();
    const agents = this.getAgentStatus();

    const totalTasks = Object.values(queues).reduce((sum, q) => sum + q.count, 0);
    const activeAgents = agents.filter(a => a.status === 'active').length;

    return {
      timestamp: Date.now(),
      tasks: {
        total: totalTasks,
        intake: queues.intake?.count || 0,
        inProgress: queues['in-progress']?.count || 0,
        review: queues.review?.count || 0,
        completed: queues.completed?.count || 0,
        failed: queues.failed?.count || 0,
      },
      agents: {
        total: agents.length,
        active: activeAgents,
        idle: agents.filter(a => a.status === 'idle').length,
        failed: agents.filter(a => a.status === 'failed').length,
      },
      performance: {
        avgTaskDuration: this.calculateAvgTaskDuration(),
        queueDepth: totalTasks,
        throughput: this.calculateThroughput(),
      },
    };
  }

  private getTaskQueues(): Record<string, TaskQueueStatus> {
    const queuesDir = join(this.ULTRA_DIR, 'queues');
    const queues: Record<string, TaskQueueStatus> = {
      intake: { count: 0, priority: 'high' },
      'in-progress': { count: 0, priority: 'medium' },
      review: { count: 0, priority: 'medium' },
      completed: { count: 0, priority: 'low' },
      failed: { count: 0, priority: 'urgent' },
    };

    if (!existsSync(queuesDir)) {
      return queues;
    }

    // Count tasks in each queue file
    for (const queueName of Object.keys(queues)) {
      const queueFile = join(queuesDir, `${queueName}.json`);
      if (existsSync(queueFile)) {
        try {
          const data = JSON.parse(readFileSync(queueFile, 'utf-8'));
          queues[queueName].count = Array.isArray(data) ? data.length : 0;
        } catch {
          queues[queueName].count = 0;
        }
      }
    }

    return queues;
  }

  private getAgentStatus(): AgentStatus[] {
    // Return mock agent status for now
    // In production, this would query the actual agent registry
    return [
      { id: 'ultra:executor', status: 'active', currentTask: 'Build feature X', uptime: 3600 },
      { id: 'ultra:debugger', status: 'idle', currentTask: null, uptime: 0 },
      { id: 'ultra:test-engineer', status: 'active', currentTask: 'Running tests', uptime: 1800 },
      { id: 'ultra:code-reviewer', status: 'idle', currentTask: null, uptime: 0 },
    ];
  }

  private getHealthIndicators(): HealthIndicator[] {
    const health: HealthIndicator[] = [
      {
        name: 'System',
        status: 'healthy',
        details: {
          cpu: '45%',
          memory: '2.1GB / 8GB',
          disk: '45GB / 100GB',
        },
      },
      {
        name: 'Domain',
        status: 'healthy',
        details: {
          activeQueues: 5,
          agentUtilization: '75%',
        },
      },
      {
        name: 'Autoloop',
        status: this.getAutoloopHealth(),
        details: this.getAutoloopDetails(),
      },
    ];

    return health;
  }

  private getAutoloopStatus(): any {
    const autoloopFile = join(this.ULTRA_DIR, 'state', 'heartbeat.json');
    if (!existsSync(autoloopFile)) {
      return { status: 'stopped', lastBeat: null };
    }

    try {
      const data = JSON.parse(readFileSync(autoloopFile, 'utf-8'));
      return {
        status: data.running ? 'running' : 'stopped',
        lastBeat: data.lastBeat,
        cycleCount: data.cycleCount || 0,
      };
    } catch {
      return { status: 'error', lastBeat: null };
    }
  }

  private getAutoloopHealth(): 'healthy' | 'warning' | 'critical' {
    const status = this.getAutoloopStatus();
    if (status.status === 'running') {
      const lastBeat = status.lastBeat;
      if (lastBeat && Date.now() - lastBeat < 120000) {
        return 'healthy';
      }
      return 'warning';
    }
    return 'critical';
  }

  private getAutoloopDetails(): Record<string, any> {
    const status = this.getAutoloopStatus();
    return {
      status: status.status,
      lastBeat: status.lastBeat ? new Date(status.lastBeat).toISOString() : 'N/A',
      cycleCount: status.cycleCount || 0,
    };
  }

  private calculateAvgTaskDuration(): number {
    // Mock calculation - in production, analyze completed tasks
    return 5.2; // minutes
  }

  private calculateThroughput(): number {
    // Mock calculation - in production, analyze task completion rate
    return 12.5; // tasks per hour
  }

  private sendUpdate(ws?: WebSocket): void {
    const data = {
      metrics: this.collectMetrics(),
      queues: this.getTaskQueues(),
      agents: this.getAgentStatus(),
      health: this.getHealthIndicators(),
      autoloop: this.getAutoloopStatus(),
    };

    const message = JSON.stringify(data);

    if (ws) {
      ws.send(message);
    } else {
      this.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  private broadcastUpdate(): void {
    this.sendUpdate();
  }

  public start(): void {
    this.server.listen(this.PORT, () => {
      console.log(`\n🚀 Mission Control Dashboard running at http://localhost:${this.PORT}`);
      console.log(`📊 Real-time metrics enabled via WebSocket\n`);
    });

    // Broadcast updates every 5 seconds
    this.updateInterval = setInterval(() => {
      this.broadcastUpdate();
    }, 5000);
  }

  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.wss.close();
    this.server.close();
  }
}
