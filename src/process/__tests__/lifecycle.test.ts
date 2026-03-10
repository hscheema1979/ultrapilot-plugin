/**
 * Process Lifecycle Management Tests
 *
 * Comprehensive test suite for process spawning, monitoring,
 * graceful shutdown, and IPC communication.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager, ProcessSpawner, IPCChannel } from '../index.js';
import { ProcessConfig, ProcessRole, ProcessStatus } from '../types.js';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Process Lifecycle Management', () => {
  let processManager: ProcessManager;
  let tempDir: string;

  beforeEach(async () => {
    processManager = new ProcessManager();
    tempDir = await mkdtemp(join(tmpdir(), 'ultrapilot-test-'));
  });

  afterEach(async () => {
    await processManager.shutdownAll({ timeout: 5000, forceKill: true });
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Process Spawning', () => {
    it('should spawn a simple process', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'console.log("test"); setTimeout(() => process.exit(0), 1000);'],
        cwd: tempDir
      };

      const handle = await processManager.spawn(config);

      expect(handle).toBeDefined();
      expect(handle.pid).toBeGreaterThan(0);
      expect(handle.role).toBe('custom');
      expect(handle.status).toBe('running');
    });

    it('should spawn process with environment variables', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'console.log(process.env.TEST_VAR); process.exit(0);'],
        env: {
          TEST_VAR: 'test-value'
        }
      };

      const handle = await processManager.spawn(config);

      expect(handle.metadata?.env?.TEST_VAR).toBe('test-value');
    });

    it('should spawn detached daemon process', async () => {
      const config: ProcessConfig = {
        role: 'autoloop',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);'],
        detached: true
      };

      const handle = await processManager.spawn(config);

      expect(handle).toBeDefined();
      expect(handle.metadata?.detached).toBe(true);
    });

    it('should spawn process with IPC enabled', async () => {
      const config: ProcessConfig = {
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'process.on("message", (msg) => console.log(JSON.stringify(msg)));'],
        metadata: {
          enableIPC: true
        }
      };

      const handle = await processManager.spawn(config, { ipc: true });

      expect(handle.ipc).toBeDefined();
      if (handle.ipc) {
        expect(handle.ipc.isConnected()).toBe(true);
      }
    });

    it('should fail to spawn invalid command', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: '/nonexistent/command',
        args: []
      };

      await expect(processManager.spawn(config)).rejects.toThrow();
    });

    it('should spawn multiple processes in parallel', async () => {
      const configs: ProcessConfig[] = Array.from({ length: 3 }, (_, i) => ({
        role: 'worker',
        command: process.execPath,
        args: ['-e', `console.log(${i}); setTimeout(() => process.exit(0), 1000);`],
        metadata: { workerIndex: i }
      }));

      const handles = await Promise.all(
        configs.map(config => processManager.spawn(config))
      );

      expect(handles).toHaveLength(3);
      expect(handles.every(h => h.pid > 0)).toBe(true);
    });
  });

  describe('Process Monitoring', () => {
    it('should monitor process health via heartbeat', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);'],
        healthCheck: {
          type: 'heartbeat',
          interval: 1000,
          timeout: 500,
          threshold: 3
        }
      };

      const handle = await processManager.spawn(config);

      // Wait a bit for health checks
      await new Promise(resolve => setTimeout(resolve, 2000));

      const metrics = processManager.getMetrics(handle.pid);
      expect(metrics).toBeDefined();
    });

    it('should detect process crash', async () => {
      let crashDetected = false;

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'process.exit(1);'],
        healthCheck: {
          type: 'heartbeat',
          interval: 500,
          timeout: 200,
          threshold: 2
        }
      };

      processManager.on('crash', () => {
        crashDetected = true;
      });

      const handle = await processManager.spawn(config);

      // Wait for crash detection
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(crashDetected).toBe(true);
      expect(handle.status).toBe('crashed');
    });

    it('should collect process metrics', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);'],
        healthCheck: {
          type: 'heartbeat',
          interval: 1000,
          timeout: 500,
          threshold: 3
        }
      };

      const handle = await processManager.spawn(config);

      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 3000));

      const metrics = processManager.getMetrics(handle.pid);
      expect(metrics).toBeDefined();
      expect(metrics!.pid).toBe(handle.pid);
      expect(metrics!.uptime).toBeGreaterThan(0);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown process gracefully', async () => {
      let shutdownStarted = false;
      let shutdownComplete = false;

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      const handle = await processManager.spawn(config);

      await processManager.shutdown(handle, {
        timeout: 5000,
        onShutdownStart: () => {
          shutdownStarted = true;
        },
        onShutdownComplete: () => {
          shutdownComplete = true;
        }
      });

      expect(shutdownStarted).toBe(true);
      expect(shutdownComplete).toBe(true);
      expect(handle.status).toBe('stopping');
    });

    it('should force kill after timeout', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);']
      };

      const handle = await processManager.spawn(config);

      await processManager.shutdown(handle, {
        timeout: 1000,
        forceKill: true
      });

      // Process should be killed after timeout
      await new Promise(resolve => setTimeout(resolve, 1500));

      const exists = await checkProcessExists(handle.pid);
      expect(exists).toBe(false);
    });

    it('should shutdown all processes', async () => {
      const configs: ProcessConfig[] = Array.from({ length: 3 }, () => ({
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      }));

      const handles = await Promise.all(
        configs.map(config => processManager.spawn(config))
      );

      await processManager.shutdownAll({ timeout: 5000 });

      expect(processManager.getCount()).toBe(0);
    });
  });

  describe('Auto-Restart', () => {
    it('should auto-restart crashed process', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setTimeout(() => process.exit(1), 500);'],
        autoRestart: true,
        maxRestarts: 2,
        restartBackoff: 1.5,
        healthCheck: {
          type: 'heartbeat',
          interval: 1000,
          timeout: 500,
          threshold: 2
        }
      };

      const originalHandle = await processManager.spawn(config);

      // Wait for crash and restart
      await new Promise(resolve => setTimeout(resolve, 3000));

      const processes = processManager.getByRole('custom');
      expect(processes.length).toBeGreaterThan(0);

      const restartedProcess = processes.find(p => p.pid !== originalHandle.pid);
      expect(restartedProcess).toBeDefined();
      expect(restartedProcess!.restartCount).toBeGreaterThan(0);
    });

    it('should respect max restart limit', async () => {
      let restartLimitExceeded = false;

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setTimeout(() => process.exit(1), 500);'],
        autoRestart: true,
        maxRestarts: 1,
        restartBackoff: 1.5,
        healthCheck: {
          type: 'heartbeat',
          interval: 1000,
          timeout: 500,
          threshold: 2
        }
      };

      processManager.on('restart-limit-exceeded', () => {
        restartLimitExceeded = true;
      });

      await processManager.spawn(config);

      // Wait for crash and restart attempts
      await new Promise(resolve => setTimeout(resolve, 5000));

      expect(restartLimitExceeded).toBe(true);
    });
  });

  describe('IPC Communication', () => {
    it('should send IPC message to process', async () => {
      const config: ProcessConfig = {
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'process.on("message", (msg) => { console.log("received:", msg); }); setInterval(() => {}, 1000);'],
        metadata: {
          enableIPC: true
        }
      };

      const handle = await processManager.spawn(config, { ipc: true });

      expect(handle.ipc).toBeDefined();

      if (handle.ipc) {
        await handle.ipc.send({
          type: 'event',
          payload: { test: 'data' },
          timestamp: new Date()
        });

        // Message sent successfully
        expect(true).toBe(true);
      }
    });

    it('should create IPC message router', async () => {
      const router = processManager.getIPCRouter();
      expect(router).toBeDefined();
      expect(router.getAllChannels()).toHaveLength(0);
    });
  });

  describe('Process Queries', () => {
    it('should list all processes', async () => {
      const config1: ProcessConfig = {
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      const config2: ProcessConfig = {
        role: 'monitor',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      await processManager.spawn(config1);
      await processManager.spawn(config2);

      const processes = processManager.list();
      expect(processes).toHaveLength(2);
    });

    it('should get process by PID', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      const handle = await processManager.spawn(config);
      const retrieved = processManager.get(handle.pid);

      expect(retrieved).toBeDefined();
      expect(retrieved!.pid).toBe(handle.pid);
    });

    it('should get processes by role', async () => {
      const config1: ProcessConfig = {
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      const config2: ProcessConfig = {
        role: 'worker',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      await processManager.spawn(config1);
      await processManager.spawn(config2);

      const workers = processManager.getByRole('worker');
      expect(workers).toHaveLength(2);
    });

    it('should count processes by status', async () => {
      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      await processManager.spawn(config);

      const runningCount = processManager.getCountByStatus('running');
      expect(runningCount).toBeGreaterThan(0);
    });
  });

  describe('Lifecycle Events', () => {
    it('should emit spawn event', async () => {
      let spawnEmitted = false;

      processManager.on('spawn', (data) => {
        spawnEmitted = true;
        expect(data.handle).toBeDefined();
        expect(data.eventType).toBe('spawn');
      });

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      await processManager.spawn(config);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(spawnEmitted).toBe(true);
    });

    it('should emit crash event', async () => {
      let crashEmitted = false;

      processManager.on('crash', (data) => {
        crashEmitted = true;
        expect(data.handle).toBeDefined();
        expect(data.eventType).toBe('crash');
      });

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'process.exit(1);'],
        healthCheck: {
          type: 'heartbeat',
          interval: 500,
          timeout: 200,
          threshold: 2
        }
      };

      await processManager.spawn(config);
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(crashEmitted).toBe(true);
    });

    it('should emit shutdown event', async () => {
      let shutdownEmitted = false;

      processManager.on('shutdown', (data) => {
        shutdownEmitted = true;
        expect(data.handle).toBeDefined();
        expect(data.eventType).toBe('shutdown');
      });

      const config: ProcessConfig = {
        role: 'custom',
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);']
      };

      const handle = await processManager.spawn(config);
      await processManager.shutdown(handle);

      expect(shutdownEmitted).toBe(true);
    });
  });
});

/**
 * Helper function to check if process exists
 */
async function checkProcessExists(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

describe('Process Spawner', () => {
  let spawner: ProcessSpawner;

  beforeEach(() => {
    spawner = new ProcessSpawner();
  });

  it('should validate correct config', () => {
    const config: ProcessConfig = {
      role: 'custom',
      command: process.execPath,
      args: ['-e', 'console.log("test");']
    };

    expect(spawner.validateConfig(config)).toBe(true);
  });

  it('should reject invalid config', () => {
    const config: ProcessConfig = {
      role: 'custom',
      command: '',
      args: []
    };

    expect(spawner.validateConfig(config)).toBe(false);
  });

  it('should check process existence', () => {
    expect(spawner.exists(process.pid)).toBe(true);
    expect(spawner.exists(999999)).toBe(false);
  });
});

describe('IPC Channel', () => {
  it('should create IPC channel for parent', () => {
    const channel = IPCChannel.createForParent('custom');
    expect(channel).toBeDefined();
    expect(channel.getRole()).toBe('custom');
    expect(channel.isConnected()).toBe(true);
  });

  it('should handle message subscription', () => {
    const channel = IPCChannel.createForParent('custom');
    let messageReceived = false;

    channel.subscribe('test', () => {
      messageReceived = true;
    });

    channel.emit('test', {});

    expect(messageReceived).toBe(true);
  });

  it('should unsubscribe from messages', () => {
    const channel = IPCChannel.createForParent('custom');
    let messageReceived = false;

    const handler = () => {
      messageReceived = true;
    };

    channel.subscribe('test', handler);
    channel.unsubscribe('test', handler);
    channel.emit('test', {});

    expect(messageReceived).toBe(false);
  });
});
