/**
 * Ultrapilot State Management
 *
 * Handles all state persistence for Ultrapilot modes.
 * State is stored in .ultra/state/{mode}-state.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface UltrapilotState {
  active: boolean;
  timestamp: string;
  sessionId?: string;
}

export interface AutopilotState extends UltrapilotState {
  phase: 'expansion' | 'planning' | 'execution' | 'qa' | 'validation' | 'cleanup' | 'cancelled' | 'completed';
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  specPath?: string;
  planPath?: string;
  tasks: {
    total: number;
    completed: number;
    pending: number;
  };
  activeAgents?: number;
  backgroundTasks?: {
    running: number;
    total: number;
  };
  agentDetails?: Array<{
    type: string;
    model: 'opus' | 'sonnet' | 'haiku';
    duration: number;
    description: string;
  }>;
}

export interface RalphState extends UltrapilotState {
  iteration: number;
  maxIterations: number;
  linkedTo?: 'autopilot' | 'ultrawork' | 'team';
  errorHistory?: Array<{
    iteration: number;
    error: string;
    timestamp: string;
  }>;
}

export interface UltraqaState extends UltrapilotState {
  cycle: number;
  maxCycles: number;
  lastError?: string;
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface ValidationState extends UltrapilotState {
  round: number;
  maxRounds: number;
  reviewers: {
    security?: 'pending' | 'approved' | 'rejected';
    quality?: 'pending' | 'approved' | 'rejected';
    architecture?: 'pending' | 'approved' | 'rejected';
    code?: 'pending' | 'approved' | 'rejected';
  };
  findings?: Array<{
    reviewer: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    location?: string;
  }>;
}

/**
 * Domain Expert Review for Phase 1.5 Detailed Planning
 */
export interface DomainExpertReview {
  domain: string;
  reviewer: string; // Agent ID (e.g., 'ultra:frontend-expert')
  status: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED';
  cycle: number;
  criticalIssues: number;
  recommendations: number;
  findings?: string;
  ioContractValidations?: IOContractValidation[];
  reviewedAt?: string;
}

/**
 * I/O Contract between domains
 */
export interface IOContract {
  id: string;
  name: string;
  domains: string[]; // ['frontend', 'backend']
  description: string;
  contract: string; // TypeScript interface or schema
  status: 'VALID' | 'NEEDS_CLARIFICATION' | 'BROKEN';
  validatedIn?: string; // Cycle where validated
  issue?: string;
  suggestedFix?: string;
}

/**
 * I/O Contract Validation from domain expert
 */
export interface IOContractValidation {
  contractId: string;
  status: 'VALID' | 'NEEDS_CLARIFICATION' | 'BROKEN';
  issue?: string;
  suggestedFix?: string;
}

/**
 * Issue found during review
 */
export interface Issue {
  id: string;
  domain: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'FIXED' | 'WONTFIX';
  fixedIn?: string; // Plan version where fixed
  createdAt?: string;
}

/**
 * Phase 1.5 Detailed Planning State
 */
export interface DetailedPlanningState extends UltrapilotState {
  phase: '1.5';
  cycle: number;
  maxCycles: number;
  status: 'draft' | 'review' | 'revised' | 're-review' | 'approved' | 'escalated';
  currentPlan: string; // Path to current plan draft
  planVersion: number; // 1, 2, 3...
  reviews: DomainExpertReview[];
  ioContracts: IOContract[];
  criticalIssues: Issue[];
  highIssues: Issue[];
  mediumIssues: Issue[];
  lowIssues: Issue[];
  feedback?: string; // Aggregated feedback
  startedAt: string;
  completedAt?: string;
}

/**
 * Get the state directory for a project
 */
export function getStateDir(projectRoot: string): string {
  const stateDir = join(projectRoot, '.ultra', 'state');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

/**
 * Read state for a specific mode
 */
export function readState<T extends UltrapilotState>(
  projectRoot: string,
  mode: 'autopilot' | 'ralph' | 'ultraqa' | 'validation' | 'detailedPlanning'
): T | null {
  const stateFile = join(getStateDir(projectRoot), `${mode}-state.json`);
  if (!existsSync(stateFile)) {
    return null;
  }

  try {
    const data = readFileSync(stateFile, 'utf8');
    return JSON.parse(data) as T;
  } catch (e) {
    console.error(`Failed to read ${mode} state:`, e);
    return null;
  }
}

/**
 * Write state for a specific mode
 */
export function writeState<T extends UltrapilotState>(
  projectRoot: string,
  mode: 'autopilot' | 'ralph' | 'ultraqa' | 'validation' | 'detailedPlanning',
  state: T
): void {
  const stateDir = getStateDir(projectRoot);
  const stateFile = join(stateDir, `${mode}-state.json`);

  state.timestamp = new Date().toISOString();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Clear state for a specific mode
 */
export function clearState(
  projectRoot: string,
  mode: 'autopilot' | 'ralph' | 'ultraqa' | 'validation' | 'detailedPlanning'
): void {
  const stateFile = join(getStateDir(projectRoot), `${mode}-state.json`);
  if (existsSync(stateFile)) {
    // unlinkSync(stateFile);
  }
}

/**
 * Initialize autopilot state
 */
export function initAutopilotState(projectRoot: string): AutopilotState {
  return {
    active: true,
    timestamp: new Date().toISOString(),
    phase: 'expansion',
    status: 'running',
    tasks: {
      total: 0,
      completed: 0,
      pending: 0
    },
    activeAgents: 0,
    backgroundTasks: {
      running: 0,
      total: 0
    }
  };
}

/**
 * Initialize ralph state
 */
export function initRalphState(projectRoot: string, maxIterations: number = 10): RalphState {
  return {
    active: true,
    timestamp: new Date().toISOString(),
    iteration: 1,
    maxIterations,
    errorHistory: []
  };
}

/**
 * Initialize ultraqa state
 */
export function initUltraqaState(projectRoot: string, maxCycles: number = 10): UltraqaState {
  return {
    active: true,
    timestamp: new Date().toISOString(),
    cycle: 1,
    maxCycles,
    testResults: {
      passed: 0,
      failed: 0,
      skipped: 0
    }
  };
}

/**
 * Initialize validation state
 */
export function initValidationState(projectRoot: string, maxRounds: number = 10): ValidationState {
  return {
    active: true,
    timestamp: new Date().toISOString(),
    round: 1,
    maxRounds,
    reviewers: {
      security: 'pending',
      quality: 'pending',
      architecture: 'pending',
      code: 'pending'
    },
    findings: []
  };
}

/**
 * Initialize detailed planning state (Phase 1.5)
 */
export function initDetailedPlanningState(projectRoot: string, maxCycles: number = 10): DetailedPlanningState {
  return {
    active: true,
    timestamp: new Date().toISOString(),
    phase: '1.5',
    cycle: 1,
    maxCycles,
    status: 'draft',
    currentPlan: '.ultra/detailed-plan-draft-v1.md',
    planVersion: 1,
    reviews: [],
    ioContracts: [],
    criticalIssues: [],
    highIssues: [],
    mediumIssues: [],
    lowIssues: [],
    startedAt: new Date().toISOString()
  };
}

/**
 * Check if any mode is active
 */
export function isAnyModeActive(projectRoot: string): boolean {
  const modes = ['autopilot', 'ralph', 'ultraqa', 'validation', 'detailedPlanning'] as const;
  for (const mode of modes) {
    const state = readState(projectRoot, mode);
    if (state?.active) {
      return true;
    }
  }
  return false;
}

/**
 * Get active modes
 */
export function getActiveModes(projectRoot: string): string[] {
  const modes = ['autopilot', 'ralph', 'ultraqa', 'validation', 'detailedPlanning'] as const;
  return modes.filter(mode => {
    const state = readState(projectRoot, mode);
    return state?.active === true;
  });
}
