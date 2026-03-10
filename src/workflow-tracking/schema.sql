-- ============================================================================
-- UltraPilot Workflow Tracking System - Database Schema
-- ============================================================================
-- Version: 1.0
-- Date: 2026-03-03
-- Database: SQLite 3.x
-- Location: .ultra/state/workflows.db
-- ============================================================================

-- SQLite Configuration
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Table: workflows
-- Top-level workflow execution records
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration INTEGER,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
  mode TEXT NOT NULL CHECK(mode IN ('sequential', 'parallel')),
  steps_count INTEGER NOT NULL,
  completed_steps INTEGER DEFAULT 0,
  failed_steps INTEGER DEFAULT 0,
  metadata_json TEXT,
  summary_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflows_session ON workflows(session_id);
CREATE INDEX IF NOT EXISTS idx_workflows_session_status ON workflows(session_id, status);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_started ON workflows(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_duration ON workflows(duration);

-- ============================================================================
-- Table: phase_transitions
-- Phase lifecycle tracking (expansion, planning, execution, qa, validation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS phase_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  from_phase TEXT,
  to_phase TEXT NOT NULL,
  transitioned_at INTEGER NOT NULL,
  criteria_json TEXT,
  duration INTEGER,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phases_workflow ON phase_transitions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_phases_session ON phase_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_phases_timestamp ON phase_transitions(transitioned_at DESC);
CREATE INDEX IF NOT EXISTS idx_phases_workflow_time ON phase_transitions(workflow_id, transitioned_at DESC);

-- ============================================================================
-- Table: agent_executions
-- Individual agent invocation records with I/O and token tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('opus', 'sonnet', 'haiku')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  success INTEGER NOT NULL CHECK(success IN (0, 1)),
  error_message TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Composite index for timeline queries (PERFORMANCE FIX)
CREATE INDEX IF NOT EXISTS idx_executions_workflow_session_time
  ON agent_executions(workflow_id, session_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_executions_workflow ON agent_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_session ON agent_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_executions_agent ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_executions_duration ON agent_executions(duration DESC);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON agent_executions(started_at DESC);

-- ============================================================================
-- Table: decisions
-- Routing, escalation, retry, and validation decisions
-- ============================================================================
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK(decision_type IN ('routing', 'escalation', 'retry', 'fallback', 'validation')),
  decision_time INTEGER NOT NULL,
  input_context TEXT NOT NULL,
  decision TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  alternatives TEXT,
  executor_agent_id TEXT,
  confidence REAL CHECK(confidence >= 0.0 AND confidence <= 1.0),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decisions_workflow ON decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(decision_time DESC);

-- Full-text search on decisions for reasoning analysis
CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
  decision,
  reasoning,
  content=decisions,
  content_rowid=rowid
);

-- Trigger to update FTS on insert
CREATE TRIGGER IF NOT EXISTS decisions_fts_insert AFTER INSERT ON decisions BEGIN
  INSERT INTO decisions_fts(rowid, decision, reasoning)
  VALUES (new.rowid, new.decision, new.reasoning);
END;

-- ============================================================================
-- Table: communications
-- Inter-agent message tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  channel TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload_summary TEXT,
  payload_json TEXT,
  sent_at INTEGER NOT NULL,
  delivered_at INTEGER,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Composite index for communication queries (PERFORMANCE FIX)
CREATE INDEX IF NOT EXISTS idx_communications_workflow_channel_time
  ON communications(workflow_id, channel, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_communications_workflow ON communications(workflow_id);
CREATE INDEX IF NOT EXISTS idx_communications_session ON communications(session_id);
CREATE INDEX IF NOT EXISTS idx_communications_from ON communications(from_agent);
CREATE INDEX IF NOT EXISTS idx_communications_to ON communications(to_agent);
CREATE INDEX IF NOT EXISTS idx_communications_channel ON communications(channel);
CREATE INDEX IF NOT EXISTS idx_communications_timestamp ON communications(sent_at DESC);

-- ============================================================================
-- Table: performance_metrics
-- Aggregated performance data (materialized view cache)
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_metrics (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE,
  total_phases INTEGER,
  avg_phase_duration REAL,
  longest_phase TEXT,
  longest_phase_duration INTEGER,
  total_invocations INTEGER,
  unique_agents INTEGER,
  avg_invocation_duration REAL,
  total_tokens INTEGER,
  total_messages INTEGER,
  messages_per_agent REAL,
  total_decisions INTEGER,
  escalations INTEGER,
  retries INTEGER,
  overall_speedup REAL,
  parallel_efficiency REAL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_workflow ON performance_metrics(workflow_id);
CREATE INDEX IF NOT EXISTS idx_metrics_updated ON performance_metrics(updated_at DESC);

-- ============================================================================
-- Table: workflow_access_log
-- Audit trail for workflow access (deferred to v2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('query', 'export', 'delete')),
  success INTEGER NOT NULL CHECK(success IN (0, 1)),
  error TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON workflow_access_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_workflow ON workflow_access_log(workflow_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_user ON workflow_access_log(requester_id, timestamp DESC);

-- ============================================================================
-- Migration Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Insert initial version
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('1.0.0');

-- ============================================================================
-- Performance Optimization Views
-- ============================================================================

-- View: Workflow summary with latest status
CREATE VIEW IF NOT EXISTS v_workflow_summary AS
SELECT
  w.id,
  w.session_id,
  w.workflow_id,
  w.name,
  w.status,
  w.mode,
  w.started_at,
  w.ended_at,
  w.duration,
  w.steps_count,
  w.completed_steps,
  w.failed_steps,
  (w.completed_steps * 1.0 / w.steps_count) as progress_percent
FROM workflows w;

-- View: Agent performance metrics
CREATE VIEW IF NOT EXISTS v_agent_performance AS
SELECT
  agent_id,
  agent_type,
  model,
  COUNT(*) as total_invocations,
  SUM(duration) as total_duration,
  AVG(duration) as avg_duration,
  MIN(duration) as min_duration,
  MAX(duration) as max_duration,
  SUM(total_tokens) as total_tokens,
  AVG(success) as success_rate,
  COUNT(CASE WHEN success = 1 THEN 1 END) as successful_count,
  COUNT(CASE WHEN success = 0 THEN 1 END) as failed_count
FROM agent_executions
GROUP BY agent_id, agent_type, model;

-- View: Phase statistics
CREATE VIEW IF NOT EXISTS v_phase_stats AS
SELECT
  phase,
  COUNT(*) as total_transitions,
  AVG(duration) as avg_duration,
  MIN(duration) as min_duration,
  MAX(duration) as max_duration
FROM phase_transitions
WHERE duration IS NOT NULL
GROUP BY phase;

-- ============================================================================
-- End of Schema
-- ============================================================================
