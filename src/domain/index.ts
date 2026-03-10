/**
 * Domain Agency Integration for UltraPilot
 *
 * This module provides integration between UltraPilot agents and the domain-agency framework,
 * enabling:
 * - Task queue management (intake, in-progress, review, completed, failed)
 * - File ownership tracking for conflict prevention
 * - Agent bridging between UltraPilot and domain operations
 * - Integration with RoutineScheduler, ConflictResolver, and TieredAutonomy
 *
 * @module domain
 */

// Export DomainManager as the main entry point
export {
  DomainManager,
  createDomainManager,
  type DomainManagerConfig,
  type DomainManagerStats
} from './DomainManager.js';

// Export TaskQueue and related types
export {
  TaskQueue,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type AgentType,
  type QueueStats,
  type TaskQueueConfig
} from './TaskQueue.js';

// Export FileOwnershipManager and related types
export {
  FileOwnershipManager,
  type FileOwnership,
  type OwnershipStatus,
  type FileConflict,
  type FileOwnershipConfig
} from './FileOwnership.js';

// Export AgentBridge and related types
export {
  AgentBridge,
  getAgentCapabilities,
  getCapability,
  type UltraPilotAgentType,
  type AgentCapability,
  type AgentBridgeConfig
} from './AgentBridge.js';

// Export DomainInitializer and related types
export {
  DomainInitializer,
  createDomainInitializer,
  type DomainConfig,
  type DomainInitOptions,
  type DomainValidation
} from './DomainInitializer.js';

// Export AutoloopDaemon and related types
export {
  AutoloopDaemon,
  createAutoloopDaemon,
  runAutoloopDaemon,
  type AutoloopConfig,
  type AutoloopState,
  type HeartbeatState
} from './AutoloopDaemon.js';

// Export WorkingManager and related types
export {
  WorkingManager,
  createWorkingManager,
  type TaskComplexity,
  type TaskSizeEstimate,
  type ExecutionStrategy,
  type TeamCoordination,
  type WorkingManagerConfig
} from './WorkingManager.js';

// Export TaskExecutor and related types
export {
  TaskExecutor,
  createTaskExecutor,
  type TaskExecutionResult,
  type TaskExecutorConfig
} from './TaskExecutor.js';

// Export TeamOrchestrator and related types
export {
  TeamOrchestrator,
  createTeamOrchestrator,
  type TeamStatus,
  type TeamConfig,
  type TeamExecution,
  type TeamOrchestratorConfig
} from './TeamOrchestrator.js';

// Export UltraLead and related types
export {
  UltraLead,
  createUltraLead,
  type OwnerGoals,
  type DomainSize,
  type DomainHealth,
  type WorkRequest,
  type TaskBreakdown,
  type UltraLeadConfig
} from './UltraLead.js';

// Export DomainProcessManager and related types
export {
  DomainProcessManager,
  createDomainProcessManager,
  listRunningDomains,
  type ProcessConfig,
  type ProcessStatus
} from './DomainProcessManager.js';

// Export DomainAgentPromptEngineer and related types
export {
  DomainAgentPromptEngineer,
  createDomainAgentPromptEngineer,
  type AgentPromptConfig,
  type GeneratedPrompt
} from './DomainAgentPromptEngineer.js';

// Export PlanWatcher and related types
export {
  PlanWatcher,
  createPlanWatcher,
  type PlanParseResult,
  type PlanTask,
  type PlanPhase,
  type PlanWatcherConfig,
  type PlanWatcherEvents,
  PlanTaskStatus,
  PlanTaskPriority
} from './PlanWatcher.js';

/**
 * Ultra-Lead Workflow Orchestration (Task 2.1c)
 *
 * Complete workflow orchestration system for executing Phases 2-5:
 * - Phase 2: Queue-Based Task Processing
 * - Phase 3: QA Cycles (UltraQA)
 * - Phase 4: Multi-Perspective Validation
 * - Phase 5: Evidence-Based Verification
 */

// Export PhaseExecutor
export {
  PhaseExecutor,
  createPhaseExecutor,
  type PhaseDefinition,
  type PhaseState,
  type PhaseResult,
  type PhaseExecutorConfig
} from './PhaseExecutor.js';

// Export QACoordinator
export {
  QACoordinator,
  createQACoordinator,
  detectFundamentalIssues,
  type QAStep,
  type QAStepResult,
  type QACycleResult,
  type QAConfig,
  type QAReport
} from './QACoordinator.js';

// Export ValidationCoordinator
export {
  ValidationCoordinator,
  createValidationCoordinator,
  type ReviewerType,
  type ReviewDecision,
  type ReviewResult,
  type ValidationResult,
  type ValidationConfig
} from './ValidationCoordinator.js';

// Export VerificationEngine
export {
  VerificationEngine,
  createVerificationEngine,
  type AcceptanceCriterion,
  type TestEvidence,
  type EvidenceCollection,
  type VerificationResult,
  type CompletionReport as OrchestratorCompletionReport,
  type VerificationConfig
} from './VerificationEngine.js';

// Export UltraLeadWorkflowOrchestrator (Main orchestration engine)
export {
  UltraLeadWorkflowOrchestrator,
  createUltraLeadWorkflowOrchestrator,
  type OperationalPlan as OrchestratorOperationalPlan,
  type WorkflowExecutionState,
  type WorkflowExecutionResult,
  type OrchestratorConfig,
  type CompletionReport
} from './UltraLeadWorkflowOrchestrator.js';

/**
 * Default export - DomainManager class
 */
export { DomainManager as default } from './DomainManager.js';
