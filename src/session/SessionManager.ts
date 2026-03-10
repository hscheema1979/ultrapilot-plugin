/**
 * Session Manager - High-level session management API
 *
 * Coordinates session lifecycle, multi-process coordination,
 * and activity tracking for UltraPilot framework.
 */

import { randomUUID } from 'crypto';
import { Session, SessionRole, SessionStatus, SessionOptions } from './SessionTypes.js';
import { SessionStore } from './SessionStore.js';
import { CoordinationProtocol } from './CoordinationProtocol.js';

/**
 * Session Manager
 */
export class SessionManager {
  private store: SessionStore;
  private coordination: CoordinationProtocol;
  private activityIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.store = new SessionStore();
    this.coordination = new CoordinationProtocol();
  }

  /**
   * Create a new session
   *
   * @param options - Session options
   * @returns Session ID
   */
  async createSession(options: SessionOptions): Promise<string> {
    // Acquire lock for session creation
    const lockKey = `session:create:${options.workspacePath}:${options.role}`;
    const lockAcquired = await this.coordination.acquireLock(lockKey, 'session-manager', 5000);

    if (!lockAcquired) {
      throw new Error(`Failed to acquire lock for session creation: ${options.role} in ${options.workspacePath}`);
    }

    try {
      // Create session
      const sessionId = this.store.createSession(options);

      // Start activity tracking
      this.startActivityTracking(sessionId);

      return sessionId;
    } finally {
      // Always release lock
      await this.coordination.releaseLock(lockKey, 'session-manager');
    }
  }

  /**
   * Resume existing session
   *
   * @param sessionId - Session ID to resume
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = this.store.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === SessionStatus.STOPPED) {
      throw new Error(`Cannot resume stopped session: ${sessionId}`);
    }

    // Update status to running
    this.store.updateSession(sessionId, {
      status: SessionStatus.RUNNING,
      current_phase: session.current_phase || 0
    });

    // Restart activity tracking
    this.startActivityTracking(sessionId);
  }

  /**
   * Stop session
   *
   * @param sessionId - Session ID to stop
   */
  async stopSession(sessionId: string): Promise<void> {
    // Stop activity tracking
    this.stopActivityTracking(sessionId);

    // Update status
    this.store.updateSession(sessionId, {
      status: SessionStatus.STOPPED
    });

    // Release all locks held by this session
    await this.releaseAllLocks(sessionId);
  }

  /**
   * Get session
   *
   * @param sessionId - Session ID
   * @returns Session or null
   */
  getSession(sessionId: string): Session | null {
    return this.store.getSession(sessionId);
  }

  /**
   * Get session by role and workspace
   *
   * @param role - Session role
   * @param workspacePath - Workspace path
   * @returns Session or null
   */
  getSessionByRole(role: SessionRole, workspacePath: string): Session | null {
    return this.store.getSessionByRole(role, workspacePath);
  }

  /**
   * List all sessions
   *
   * @param workspacePath - Optional workspace filter
   * @returns Array of sessions
   */
  listSessions(workspacePath?: string): Session[] {
    return this.store.listSessions(
      workspacePath ? { workspacePath } : undefined
    );
  }

  /**
   * Update activity timestamp
   *
   * @param sessionId - Session ID
   */
  updateActivity(sessionId: string): void {
    this.store.updateActivity(sessionId);
    this.coordination.broadcastHeartbeat(sessionId);
  }

  /**
   * Set current phase for session
   *
   * @param sessionId - Session ID
   * @param phase - Phase number
   */
  setCurrentPhase(sessionId: string, phase: number): void {
    this.store.updateSession(sessionId, {
      current_phase: phase,
      status: SessionStatus.RUNNING
    });
    this.updateActivity(sessionId);
  }

  /**
   * Get current phase for session
   *
   * @param sessionId - Session ID
   * @returns Current phase number or null
   */
  getCurrentPhase(sessionId: string): number | null {
    const session = this.store.getSession(sessionId);
    return session?.current_phase || null;
  }

  /**
   * Add agent to session
   *
   * @param sessionId - Session ID
   * @param agentId - Agent ID
   */
  addAgent(sessionId: string, agentId: string): void {
    const session = this.store.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const agents = session.active_agents.includes(agentId)
      ? session.active_agents
      : [...session.active_agents, agentId];

    this.store.updateSession(sessionId, {
      active_agents: agents
    });
  }

  /**
   * Remove agent from session
   *
   * @param sessionId - Session ID
   * @param agentId - Agent ID
   */
  removeAgent(sessionId: string, agentId: string): void {
    const session = this.store.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const agents = session.active_agents.filter(a => a !== agentId);

    this.store.updateSession(sessionId, {
      active_agents: agents
    });
  }

  /**
   * Cleanup inactive sessions
   *
   * @param olderThanHours - Remove sessions inactive longer than this
   * @returns Number of sessions cleaned up
   */
  cleanupInactive(olderThanHours: number = 24): number {
    return this.store.cleanupInactive(olderThanHours);
  }

  /**
   * Start activity tracking for session
   *
   * @param sessionId - Session ID
   */
  private startActivityTracking(sessionId: string): void {
    // Clear existing interval if any
    this.stopActivityTracking(sessionId);

    // Update activity every 30 seconds
    const interval = setInterval(() => {
      this.updateActivity(sessionId);
    }, 30000);

    this.activityIntervals.set(sessionId, interval);
  }

  /**
   * Stop activity tracking for session
   *
   * @param sessionId - Session ID
   */
  private stopActivityTracking(sessionId: string): void {
    const interval = this.activityIntervals.get(sessionId);

    if (interval) {
      clearInterval(interval);
      this.activityIntervals.delete(sessionId);
    }
  }

  /**
   * Release all locks held by session
   *
   * @param sessionId - Session ID
   */
  private async releaseAllLocks(sessionId: string): Promise<void> {
    const db = (this.coordination as any).pool.getWriter();

    // Get all locks owned by this session
    const locks = db.prepare('SELECT resource FROM locks WHERE owner_session_id = ?').all(sessionId);

    // Release each lock
    for (const lock of locks) {
      await this.coordination.releaseLock(lock.resource, sessionId);
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    // Clear all activity tracking intervals
    for (const [sessionId, interval] of this.activityIntervals) {
      clearInterval(interval);
    }
    this.activityIntervals.clear();
  }
}
