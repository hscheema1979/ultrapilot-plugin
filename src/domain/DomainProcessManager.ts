/**
 * Domain Process Manager
 *
 * Manages autoloop and ultra-lead processes at the domain level.
 * Uses tmux or pm2 for proper process isolation and management.
 *
 * Each domain gets:
 * - Autoloop daemon (persistent heartbeat)
 * - Ultra-lead agent (domain manager via Claude Code CLI)
 * - Managed in tmux sessions or pm2 processes
 *
 * Example:
 *   ultra-dev domain:
 *   - tmux session: ultra-dev-autoloop
 *   - tmux session: ultra-dev-lead
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

export interface ProcessConfig {
  domainPath: string;
  domainName: string;
  domainId: string;
  processManager: 'tmux' | 'pm2' | 'none';
}

export interface ProcessStatus {
  name: string;
  type: 'autoloop' | 'ultra-lead';
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
  uptime?: number;
  lastCheck: string;
}

/**
 * Domain Process Manager class
 */
export class DomainProcessManager {
  private config: ProcessConfig;
  private domainStatePath: string;

  constructor(config: ProcessConfig) {
    this.config = config;
    this.domainStatePath = join(config.domainPath, '.ultra', 'state');
  }

  /**
   * Start domain processes (autoloop + ultra-lead)
   */
  async startDomain(): Promise<void> {
    console.log(`🚀 Starting domain: ${this.config.domainName}`);
    console.log(`   Path: ${this.config.domainPath}`);
    console.log(`   Manager: ${this.config.processManager}`);

    if (this.config.processManager === 'tmux') {
      await this.startWithTmux();
    } else if (this.config.processManager === 'pm2') {
      await this.startWithPm2();
    } else {
      await this.startStandalone();
    }

    console.log(`✅ Domain ${this.config.domainName} started`);
  }

  /**
   * Stop domain processes
   */
  async stopDomain(): Promise<void> {
    console.log(`🛑 Stopping domain: ${this.config.domainName}`);

    if (this.config.processManager === 'tmux') {
      await this.stopWithTmux();
    } else if (this.config.processManager === 'pm2') {
      await this.stopWithPm2();
    } else {
      await this.stopStandalone();
    }

    console.log(`✅ Domain ${this.config.domainName} stopped`);
  }

  /**
   * Get status of domain processes
   */
  getStatus(): ProcessStatus[] {
    const status: ProcessStatus[] = [];

    // Check autoloop
    const autoloopState = this.readAutoloopState();
    status.push({
      name: `${this.config.domainName}-autoloop`,
      type: 'autoloop',
      status: autoloopState?.enabled ? 'running' : 'stopped',
      pid: autoloopState?.pid,
      lastCheck: new Date().toISOString()
    });

    // Check ultra-lead
    const leadState = this.readLeadState();
    status.push({
      name: `${this.config.domainName}-lead`,
      type: 'ultra-lead',
      status: leadState?.active ? 'running' : 'stopped',
      pid: leadState?.pid,
      lastCheck: new Date().toISOString()
    });

    return status;
  }

  /**
   * Start with tmux session management
   */
  private async startWithTmux(): Promise<void> {
    const sessionPrefix = this.config.domainName;

    // 1. Start autoloop in tmux session
    const autoloopSession = `${sessionPrefix}-autoloop`;
    await this.createTmuxSession(autoloopSession, 'node dist/agents/autoloop.js');

    // 2. Start ultra-lead in tmux session (via Claude Code CLI)
    const leadSession = `${sessionPrefix}-lead`;
    await this.createUltraLeadSession(leadSession);

    // 3. Save process info
    this.saveProcessInfo({
      autoloopSession,
      leadSession,
      manager: 'tmux'
    });

    console.log(`   Autoloop: tmux session ${autoloopSession}`);
    console.log(`   Ultra-Lead: tmux session ${leadSession}`);
  }

  /**
   * Create tmux session with command
   */
  private async createTmuxSession(sessionName: string, command: string): Promise<void> {
    // Kill existing session if present
    await this.execCommand(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);

    // Create new session
    const sessionPath = join(this.config.domainPath, '.ultra');
    await this.execCommand(
      `tmux new-session -d -s ${sessionName} -c "${sessionPath}" -n ultra ${command}`
    );
  }

  /**
   * Create ultra-lead tmux session (spawns Claude Code CLI)
   */
  private async createUltraLeadSession(sessionName: string): Promise<void> {
    // Kill existing session
    await this.execCommand(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);

    // Create session that will run ultra-lead via CLI
    const sessionPath = join(this.config.domainPath, '.ultra');
    const startScript = join(this.config.domainPath, '.ultra', 'start-lead.sh');

    // Create startup script
    const leadScript = `#!/bin/bash
cd "${this.config.domainPath}"
claude-code agent ultra:team-lead \\
  --domain="${this.config.domainPath}" \\
  --mode=persistent \\
  --routine=domain-health-check
`;

    writeFileSync(startScript, leadScript, { mode: 0o755 });

    // Start tmux session
    await this.execCommand(
      `tmux new-session -d -s ${sessionName} -c "${sessionPath}" -n lead ${startScript}`
    );
  }

  /**
   * Stop with tmux
   */
  private async stopWithTmux(): Promise<void> {
    const processInfo = this.readProcessInfo();
    if (processInfo?.manager !== 'tmux') {
      console.warn('⚠️  Domain not managed by tmux');
      return;
    }

    // Kill tmux sessions
    await this.execCommand(`tmux kill-session -t ${processInfo.autoloopSession} 2>/dev/null || true`);
    await this.execCommand(`tmux kill-session -t ${processInfo.leadSession} 2>/dev/null || true`);

    // Clean up process info
    unlinkSync(join(this.domainStatePath, 'process-info.json'));
  }

  /**
   * Start with pm2 process management
   */
  private async startWithPm2(): Promise<void> {
    const domainName = this.config.domainName;

    // 1. Start autoloop with pm2
    const autoloopConfig = {
      name: `${domainName}-autoloop`,
      script: 'dist/agents/autoloop.js',
      cwd: this.config.domainPath,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        DOMAIN_PATH: this.config.domainPath,
        DOMAIN_NAME: domainName
      }
    };

    await this.execCommand(`pm2 start ${JSON.stringify(autoloopConfig)} --json > /tmp/pm2-start-${domainName}.json`);

    // 2. Start ultra-lead with pm2
    const leadConfig = {
      name: `${domainName}-lead`,
      script: 'claude-code',
      args: `agent ultra:team-lead --domain="${this.config.domainPath}" --mode=persistent`,
      cwd: this.config.domainPath,
      watch: false,
      autorestart: true,
      max_restarts: 5,
      env: {
        DOMAIN_PATH: this.config.domainPath,
        DOMAIN_NAME: domainName
      }
    };

    await this.execCommand(`pm2 start ${JSON.stringify(leadConfig)} --json >> /tmp/pm2-start-${domainName}.json`);

    // Save process info
    this.saveProcessInfo({
      autoloopName: `${domainName}-autoloop`,
      leadName: `${domainName}-lead`,
      manager: 'pm2'
    });

    console.log(`   Autoloop: pm2 process ${domainName}-autoloop`);
    console.log(`   Ultra-Lead: pm2 process ${domainName}-lead`);
  }

  /**
   * Stop with pm2
   */
  private async stopWithPm2(): Promise<void> {
    const processInfo = this.readProcessInfo();
    if (processInfo?.manager !== 'pm2') {
      console.warn('⚠️  Domain not managed by pm2');
      return;
    }

    // Stop pm2 processes
    await this.execCommand(`pm2 stop ${processInfo.autoloopName} 2>/dev/null || true`);
    await this.execCommand(`pm2 stop ${processInfo.leadName} 2>/dev/null || true`);
    await this.execCommand(`pm2 delete ${processInfo.autoloopName} 2>/dev/null || true`);
    await this.execCommand(`pm2 delete ${processInfo.leadName} 2>/dev/null || true`);

    // Clean up
    unlinkSync(join(this.domainStatePath, 'process-info.json'));
  }

  /**
   * Start standalone (background processes)
   */
  private async startStandalone(): Promise<void> {
    // Spawn autoloop
    const autoloopPath = join(this.config.domainPath, 'dist/agents/autoloop.js');
    const autoloopProcess = spawn('node', [autoloopPath], {
      cwd: this.config.domainPath,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        DOMAIN_PATH: this.config.domainPath,
        DOMAIN_NAME: this.config.domainName
      }
    });
    autoloopProcess.unref();

    // Spawn ultra-lead (will need CLI invocation)
    const leadProcess = spawn('claude-code', [
      'agent', 'ultra:team-lead',
      '--domain', this.config.domainPath,
      '--mode', 'persistent'
    ], {
      cwd: this.config.domainPath,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        DOMAIN_PATH: this.config.domainPath,
        DOMAIN_NAME: this.config.domainName
      }
    });
    leadProcess.unref();

    // Save PIDs
    this.saveProcessInfo({
      autoloopPid: autoloopProcess.pid,
      leadPid: leadProcess.pid,
      manager: 'none'
    });

    console.log(`   Autoloop: PID ${autoloopProcess.pid}`);
    console.log(`   Ultra-Lead: PID ${leadProcess.pid}`);
  }

  /**
   * Stop standalone
   */
  private async stopStandalone(): Promise<void> {
    const processInfo = this.readProcessInfo();
    if (processInfo?.manager !== 'none') {
      console.warn('⚠️  Domain not managed standalone');
      return;
    }

    // Kill processes
    if (processInfo.autoloopPid) {
      process.kill(processInfo.autoloopPid, 'SIGTERM');
    }
    if (processInfo.leadPid) {
      process.kill(processInfo.leadPid, 'SIGTERM');
    }

    // Clean up
    unlinkSync(join(this.domainStatePath, 'process-info.json'));
  }

  /**
   * Read autoloop state
   */
  private readAutoloopState() {
    const statePath = join(this.domainStatePath, 'autoloop.json');
    if (!existsSync(statePath)) return null;

    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Read ultra-lead state
   */
  private readLeadState() {
    const statePath = join(this.domainStatePath, 'ultra-lead.json');
    if (!existsSync(statePath)) return null;

    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Save process info
   */
  private saveProcessInfo(info: any): void {
    const infoPath = join(this.domainStatePath, 'process-info.json');
    writeFileSync(infoPath, JSON.stringify(info, null, 2));
  }

  /**
   * Read process info
   */
  private readProcessInfo(): any {
    const infoPath = join(this.domainStatePath, 'process-info.json');
    if (!existsSync(infoPath)) return null;

    try {
      return JSON.parse(readFileSync(infoPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Execute shell command
   */
  private execCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: this.config.domainPath,
        stdio: 'ignore'
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

/**
 * Factory function to create domain process manager
 */
export function createDomainProcessManager(config: ProcessConfig): DomainProcessManager {
  return new DomainProcessManager(config);
}

/**
 * List all running domains
 */
export function listRunningDomains(rootPath: string): string[] {
  // Scan for .ultra directories with running autoloop state
  // This is a simplified version - would scan filesystem in real implementation
  return [];
}
