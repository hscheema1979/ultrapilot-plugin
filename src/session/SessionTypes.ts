/**
 * Session Types - Multi-session coordination for UltraPilot framework
 */

/**
 * Session roles
 */
export enum SessionRole {
  ULTRAPILOT = 'ultrapilot',   // On-demand execution (Phases 0-1)
  ULTRA_LEAD = 'ultra-lead',     // Persistent mode (Phases 2-5)
  AUTOLOOP = 'autoloop',         // Background daemon (60s heartbeat)
  USER = 'user'                  // Interactive user session
}

/**
 * Session status
 */
export enum SessionStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Session state
 */
export interface Session {
  session_id: string;
  role: SessionRole;
  workspace_path: string;
  status: SessionStatus;
  current_phase?: number;
  active_agents: string[];
  created_at: Date;
  last_activity: Date;
  metadata: Record<string, unknown>;
}

/**
 * Session creation options
 */
export interface SessionOptions {
  role: SessionRole;
  workspacePath: string;
  metadata?: Record<string, unknown>;
}

/**
 * Session filter for queries
 */
export interface SessionFilter {
  role?: SessionRole;
  workspacePath?: string;
  status?: SessionStatus;
  olderThan?: Date;
}

/**
 * Lock for multi-process coordination
 */
export interface Lock {
  resource: string;
  owner_session_id: string;
  acquired_at: Date;
  expires_at: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Coordination protocol for multi-process coordination
 */
export interface CoordinationProtocol {
  acquireLock(resource: string, sessionId: string, timeoutMs: number): Promise<boolean>;
  releaseLock(resource: string, sessionId: string): Promise<void>;
  renewLock(resource: string, sessionId: string): Promise<boolean>;
  getLockOwner(resource: string): Promise<string | null>;

  // Leader election
  electLeader(candidates: string[]): Promise<string>;
  isLeader(sessionId: string): boolean;
  resignLeadership(sessionId: string): Promise<void>;
  transferLeadership(fromSession: string, toSession: string): Promise<boolean>;

  // Heartbeat monitoring
  broadcastHeartbeat(sessionId: string): void;
  checkHeartbeat(sessionId: string): boolean;
}

/**
 * Lock types for advanced coordination
 */
export enum LockType {
  EXCLUSIVE = 'exclusive',    // Write lock (single holder)
  SHARED = 'shared',           // Read lock (multiple holders)
  REENTRANT = 'reentrant'      // Reentrant lock (same holder can acquire multiple times)
}

/**
 * Lock state for tracking
 */
export interface LockState {
  resource: string;
  type: LockType;
  owner: string;
  acquireCount: number;        // For reentrant locks
  holders: string[];           // For shared locks (multiple readers)
  waitQueue: string[];         // Processes waiting for lock
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Distributed state entry
 */
export interface DistributedStateEntry {
  key: string;
  value: string;
  version: number;
  updatedBy: string;
  updatedAt: number;
}

/**
 * State update result
 */
export interface StateUpdateResult {
  success: boolean;
  version: number;
  conflict: boolean;
  resolved: boolean;
}

/**
 * Conflict resolution strategy
 */
export enum ConflictResolution {
  LAST_WRITE_WINS = 'last_write_wins',
  FIRST_WRITE_WINS = 'first_write_wins',
  HIGHEST_VERSION = 'highest_version',
  MANUAL = 'manual'
}

/**
 * Process information for registry
 */
export interface ProcessInfo {
  processId: string;
  pid: number;
  role: string;
  status: 'alive' | 'suspected' | 'dead';
  lastHeartbeat: number;
  startedAt: number;
  metadata: Record<string, unknown>;
}

/**
 * Barrier state for synchronization
 */
export interface BarrierState {
  id: string;
  name: string;
  expected: number;
  arrived: string[];
  createdAt: number;
  expiresAt: number | null;
  released: boolean;
}

/**
 * Latch state for one-time synchronization
 */
export interface LatchState {
  id: string;
  name: string;
  count: number;
  completed: boolean;
  createdAt: number;
}

/**
 * Semaphore state for resource counting
 */
export interface SemaphoreState {
  id: string;
  name: string;
  permits: number;
  available: number;
  holders: string[];  // Current holders with permits
  waitQueue: Array<{ processId: string; permits: number }>;
  createdAt: number;
}

/**
 * Event state for signaling
 */
export interface EventState {
  id: string;
  name: string;
  signaled: boolean;
  autoReset: boolean;
  waitingProcesses: string[];
  createdAt: number;
}
