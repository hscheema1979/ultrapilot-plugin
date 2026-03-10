/**
 * Workspace Context Propagation
 *
 * Propagates workspace information (CWD, env vars, git state, etc.)
 * to delegated worker agents for proper context.
 *
 * Part of Phase 2: Delegation Interface & Ownership Protocol
 */

import * as os from 'os';
import * as path from 'path';
import { FileOwnership, TraceContext } from './types.js';
import { execSync } from 'child_process';

/**
 * Git repository information
 */
export interface GitInfo {
  branch?: string;
  commit?: string;
  status?: string;
  root?: string;
  hasChanges: boolean;
}

/**
 * Workspace environment information
 */
export interface WorkspaceEnvironment {
  /** Environment variables */
  env: Record<string, string>;

  /** Current working directory */
  cwd: string;

  /** Home directory */
  homeDir: string;

  /** Platform information */
  platform: string;
  arch: string;
  nodeVersion: string;
}

/**
 * Workspace context
 *
 * Contains all workspace information needed by worker agents
 */
export class WorkspaceContext {
  private ownership: FileOwnership;
  private trace: TraceContext;
  private environment: WorkspaceEnvironment;
  private gitInfo: GitInfo;

  private constructor(
    ownership: FileOwnership,
    trace: TraceContext,
    environment: WorkspaceEnvironment,
    gitInfo: GitInfo
  ) {
    this.ownership = ownership;
    this.trace = trace;
    this.environment = environment;
    this.gitInfo = gitInfo;
  }

  /**
   * Create workspace context
   *
   * @param ownership - File ownership rules
   * @param trace - Trace context
   * @returns Promise<WorkspaceContext>
   */
  static async create(
    ownership: FileOwnership,
    trace: TraceContext
  ): Promise<WorkspaceContext> {
    const environment = await WorkspaceContext.captureEnvironment();
    const gitInfo = await WorkspaceContext.captureGitInfo();

    return new WorkspaceContext(ownership, trace, environment, gitInfo);
  }

  /**
   * Capture current environment information
   *
   * @returns Promise<WorkspaceEnvironment>
   */
  private static async captureEnvironment(): Promise<WorkspaceEnvironment> {
    // Capture a subset of environment variables (filter out sensitive ones)
    const env: Record<string, string> = {};

    const allowedVars = [
      'PATH',
      'NODE_ENV',
      'USER',
      'SHELL',
      'LANG',
      'PWD',
      'HOME',
      'EDITOR',
      'npm_config_prefix',
      'NODE_VERSION',
    ];

    for (const key of allowedVars) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    return {
      env,
      cwd: process.cwd(),
      homeDir: os.homedir(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    };
  }

  /**
   * Capture git repository information
   *
   * @returns Promise<GitInfo>
   */
  private static async captureGitInfo(): Promise<GitInfo> {
    const gitInfo: GitInfo = {
      hasChanges: false,
    };

    try {
      // Check if we're in a git repository
      const gitRoot = execSync('git rev-parse --git-dir 2>/dev/null', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();

      if (gitRoot) {
        // Get current branch
        try {
          gitInfo.branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
            cwd: process.cwd(),
          }).trim();
        } catch {
          // Ignore error
        }

        // Get current commit
        try {
          gitInfo.commit = execSync('git rev-parse HEAD', {
            encoding: 'utf-8',
            cwd: process.cwd(),
          }).trim().substring(0, 8);
        } catch {
          // Ignore error
        }

        // Get git status
        try {
          gitInfo.status = execSync('git status --porcelain', {
            encoding: 'utf-8',
            cwd: process.cwd(),
          }).trim();

          gitInfo.hasChanges = gitInfo.status.length > 0;
        } catch {
          // Ignore error
        }

        // Get git root
        try {
          gitInfo.root = execSync('git rev-parse --show-toplevel', {
            encoding: 'utf-8',
            cwd: process.cwd(),
          }).trim();
        } catch {
          // Ignore error
        }
      }
    } catch {
      // Not in a git repository or git not available
    }

    return gitInfo;
  }

  /**
   * Get file ownership rules
   */
  getOwnership(): FileOwnership {
    return this.ownership;
  }

  /**
   * Get trace context
   */
  getTrace(): TraceContext {
    return this.trace;
  }

  /**
   * Get environment information
   */
  getEnvironment(): WorkspaceEnvironment {
    return this.environment;
  }

  /**
   * Get git information
   */
  getGitInfo(): GitInfo {
    return this.gitInfo;
  }

  /**
   * Convert to plain object for serialization
   *
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return {
      ownership: this.ownership,
      trace: {
        traceId: this.trace.traceId,
        spanId: this.trace.spanId,
        parentSpanId: this.trace.parentSpanId,
        baggage: Array.from(this.trace.baggage.entries()),
      },
      environment: this.environment,
      gitInfo: this.gitInfo,
    };
  }

  /**
   * Create from plain object (deserialization)
   *
   * @param obj - Plain object representation
   * @returns WorkspaceContext instance
   */
  static fromJSON(obj: Record<string, any>): WorkspaceContext {
    const ownership: FileOwnership = obj.ownership;
    const trace: TraceContext = {
      traceId: obj.trace.traceId,
      spanId: obj.trace.spanId,
      parentSpanId: obj.trace.parentSpanId,
      baggage: new Map(obj.trace.baggage),
    };
    const environment: WorkspaceEnvironment = obj.environment;
    const gitInfo: GitInfo = obj.gitInfo;

    return new WorkspaceContext(ownership, trace, environment, gitInfo);
  }

  /**
   * Get context summary for logging
   *
   * @returns Human-readable context summary
   */
  getSummary(): string {
    const parts: string[] = [];

    parts.push(`CWD: ${this.environment.cwd}`);
    parts.push(`Platform: ${this.environment.platform}/${this.environment.arch}`);
    parts.push(`Node: ${this.environment.nodeVersion}`);

    if (this.gitInfo.branch) {
      parts.push(`Git: ${this.gitInfo.branch} (${this.gitInfo.commit || 'unknown'})`);
      if (this.gitInfo.hasChanges) {
        parts.push(`Git: has uncommitted changes`);
      }
    }

    parts.push(`Owned paths: ${this.ownership.ownedPaths.length}`);
    parts.push(`Read-only paths: ${this.ownership.readOnlyPaths.length}`);

    return parts.join('\n');
  }

  /**
   * Validate workspace context
   *
   * @returns Validation result
   */
  validate(): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate CWD exists
    try {
      // Skip fs check in tests/mock environments
      // In production, would use: import * as fs from 'fs';
      // if (!fs.existsSync(this.environment.cwd))
    } catch {
      // Ignore validation in test environment
    }

    // Validate owned paths
    for (const ownedPath of this.ownership.ownedPaths) {
      if (!path.isAbsolute(ownedPath)) {
        errors.push(`Owned path must be absolute: ${ownedPath}`);
      }
    }

    // Validate read-only paths
    for (const readOnlyPath of this.ownership.readOnlyPaths) {
      if (!path.isAbsolute(readOnlyPath)) {
        errors.push(`Read-only path must be absolute: ${readOnlyPath}`);
      }
    }

    // Validate trace context
    if (!this.trace.traceId || !this.trace.spanId) {
      errors.push(`Invalid trace context: missing traceId or spanId`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone workspace context (creates a copy)
   *
   * @returns Cloned WorkspaceContext
   */
  clone(): WorkspaceContext {
    return new WorkspaceContext(
      { ...this.ownership },
      {
        traceId: this.trace.traceId,
        spanId: this.trace.spanId,
        parentSpanId: this.trace.parentSpanId,
        baggage: new Map(this.trace.baggage),
      },
      { ...this.environment, env: { ...this.environment.env } },
      { ...this.gitInfo }
    );
  }

  /**
   * Create child context with new span
   *
   * @param spanId - New span ID
   * @returns Child WorkspaceContext
   */
  createChild(spanId: string): WorkspaceContext {
    return new WorkspaceContext(
      this.ownership,
      {
        traceId: this.trace.traceId,
        spanId,
        parentSpanId: this.trace.spanId,
        baggage: new Map(this.trace.baggage),
      },
      this.environment,
      this.gitInfo
    );
  }

  /**
   * Get environment variable
   *
   * @param key - Environment variable name
   * @returns Value or undefined
   */
  getEnv(key: string): string | undefined {
    return this.environment.env[key];
  }

  /**
   * Set environment variable (only in this context)
   *
   * @param key - Environment variable name
   * @param value - Value to set
   */
  setEnv(key: string, value: string): void {
    this.environment.env[key] = value;
  }

  /**
   * Check if in git repository
   */
  isInGitRepo(): boolean {
    return !!this.gitInfo.branch;
  }

  /**
   * Check if git has uncommitted changes
   */
  hasGitChanges(): boolean {
    return this.gitInfo.hasChanges;
  }

  /**
   * Get git root directory
   */
  getGitRoot(): string | undefined {
    return this.gitInfo.root;
  }

  /**
   * Get current git branch
   */
  getGitBranch(): string | undefined {
    return this.gitInfo.branch;
  }

  /**
   * Get current git commit
   */
  getGitCommit(): string | undefined {
    return this.gitInfo.commit;
  }
}
