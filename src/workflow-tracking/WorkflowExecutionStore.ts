/**
 * UltraPilot Workflow Tracking System - Workflow Execution Store
 *
 * SQLite-based persistence layer for workflow execution data.
 * Implements async batch writes for minimal performance overhead.
 *
 * @version 1.0
 * @date 2026-03-03
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Types
import {
  WorkflowRecord,
  PhaseRecord,
  AgentExecutionRecord,
  CommunicationRecord,
  DecisionRecord
} from './types.js';

/**
 * Store Configuration
 */
export interface WorkflowExecutionStoreConfig {
  dbPath?: string;
  enableWAL?: boolean;
  cacheSize?: number;
  flushInterval?: number;
  maxBufferSize?: number;
}

/**
 * Workflow Execution Store
 *
 * Persists all workflow execution data with async batch writes.
 */
export class WorkflowExecutionStore {
  private db: Database.Database;
  private config: Required<WorkflowExecutionStoreConfig>;

  // Async write buffer
  private writeBuffer: Map<string, any[]> = new Map();
  private flushTimer?: NodeJS.Timeout;
  private isFlushing: boolean = false;

  // Prepared statements cache
  private statements: Map<string, Database.Statement> = new Map();

  constructor(config: WorkflowExecutionStoreConfig = {}) {
    this.config = {
      dbPath: config.dbPath || '.ultra/state/workflows.db',
      enableWAL: config.enableWAL ?? true,
      cacheSize: config.cacheSize ?? 64000,
      flushInterval: config.flushInterval ?? 50,
      maxBufferSize: config.maxBufferSize ?? 100
    };

    this.db = this.initializeDatabase();
    this.prepareStatements();
    this.startFlushTimer();
  }

  /**
   * Initialize SQLite database
   */
  private initializeDatabase(): Database.Database {
    const dbPath = path.resolve(this.config.dbPath);
    const dir = path.dirname(dbPath);

    // Ensure directory exists
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Open database
    const db = new Database(dbPath);

    // Set secure permissions
    fsSync.chmodSync(dbPath, 0o600);

    // Load schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fsSync.existsSync(schemaPath)) {
      const schema = fsSync.readFileSync(schemaPath, 'utf8');
      db.exec(schema);
    } else {
      console.warn('[WorkflowExecutionStore] Schema file not found, creating tables inline');
      this.createSchemaInline(db);
    }

    return db;
  }

  /**
   * Create schema inline (fallback)
   */
  private createSchemaInline(db: Database.Database): void {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration INTEGER,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        steps_count INTEGER NOT NULL,
        completed_steps INTEGER DEFAULT 0,
        failed_steps INTEGER DEFAULT 0,
        metadata_json TEXT,
        summary_json TEXT
      );

      CREATE TABLE IF NOT EXISTS phase_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        from_phase TEXT,
        to_phase TEXT NOT NULL,
        transitioned_at INTEGER NOT NULL,
        criteria_json TEXT,
        duration INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        model TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        input_text TEXT NOT NULL,
        output_text TEXT,
        success INTEGER NOT NULL,
        error_message TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        decision_time INTEGER NOT NULL,
        input_context TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        alternatives TEXT,
        executor_agent_id TEXT,
        confidence REAL
      );

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
        delivered_at INTEGER
      );
    `);
  }

  /**
   * Prepare common statements for performance
   */
  private prepareStatements(): void {
    // Workflow operations
    this.statements.set('insertWorkflow', this.db.prepare(`
      INSERT OR REPLACE INTO workflows
      (id, session_id, workflow_id, name, started_at, status, mode, steps_count, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.statements.set('updateWorkflow', this.db.prepare(`
      UPDATE workflows
      SET ended_at = ?, duration = ?, status = ?, completed_steps = ?, failed_steps = ?, summary_json = ?, updated_at = ?
      WHERE id = ?
    `));

    this.statements.set('getWorkflow', this.db.prepare(`
      SELECT * FROM workflows WHERE id = ?
    `));

    // Phase operations
    this.statements.set('insertPhase', this.db.prepare(`
      INSERT INTO phase_transitions
      (workflow_id, session_id, phase, from_phase, to_phase, transitioned_at, criteria_json, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.statements.set('getPhases', this.db.prepare(`
      SELECT * FROM phase_transitions WHERE workflow_id = ? ORDER BY transitioned_at ASC
    `));

    // Agent execution operations
    this.statements.set('insertExecution', this.db.prepare(`
      INSERT INTO agent_executions
      (workflow_id, session_id, step_id, agent_id, agent_type, model, started_at, ended_at, duration,
       input_text, output_text, success, error_message, input_tokens, output_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.statements.set('getExecutions', this.db.prepare(`
      SELECT * FROM agent_executions
      WHERE workflow_id = ?
      ORDER BY started_at ASC
      LIMIT ?
    `));

    // Communication operations
    this.statements.set('insertCommunication', this.db.prepare(`
      INSERT INTO communications
      (workflow_id, session_id, message_id, from_agent, to_agent, channel, message_type, payload_summary, payload_json, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.statements.set('getCommunications', this.db.prepare(`
      SELECT * FROM communications WHERE workflow_id = ? ORDER BY sent_at ASC
    `));

    // Decision operations
    this.statements.set('insertDecision', this.db.prepare(`
      INSERT INTO decisions
      (workflow_id, session_id, decision_type, decision_time, input_context, decision, reasoning, alternatives, executor_agent_id, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.statements.set('getDecisions', this.db.prepare(`
      SELECT * FROM decisions WHERE workflow_id = ? ORDER BY decision_time ASC
    `));
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('[WorkflowExecutionStore] Flush error:', err);
      });
    }, this.config.flushInterval);
  }

  /**
   * Create a new workflow record
   */
  async createWorkflow(workflow: WorkflowRecord): Promise<void> {
    this.queueWrite('workflows', {
      stmt: 'insertWorkflow',
      params: [
        workflow.id,
        workflow.sessionId,
        workflow.workflowId,
        workflow.name,
        workflow.startedAt.getTime(),
        workflow.status,
        workflow.mode,
        workflow.stepsCount,
        workflow.metadata ? JSON.stringify(workflow.metadata) : null
      ]
    });
  }

  /**
   * Update workflow status
   */
  async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowRecord>
  ): Promise<void> {
    this.queueWrite('workflows', {
      stmt: 'updateWorkflow',
      params: [
        updates.endedAt?.getTime(),
        updates.duration,
        updates.status,
        updates.completedSteps,
        updates.failedSteps,
        updates.summary ? JSON.stringify(updates.summary) : null,
        Date.now(),
        workflowId
      ]
    });
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<WorkflowRecord | null> {
    const row = this.statements.get('getWorkflow')!.get(workflowId);
    if (!row) return null;

    return this.mapWorkflowRow(row);
  }

  /**
   * Record phase transition
   */
  async recordPhase(phase: PhaseRecord): Promise<void> {
    this.queueWrite('phases', {
      stmt: 'insertPhase',
      params: [
        phase.workflowId,
        phase.sessionId,
        phase.phase,
        phase.fromPhase || null,
        phase.toPhase,
        phase.transitionedAt.getTime(),
        phase.criteria ? JSON.stringify(phase.criteria) : null,
        phase.duration || null
      ]
    });
  }

  /**
   * Get phases for workflow
   */
  async getPhases(workflowId: string): Promise<PhaseRecord[]> {
    const rows = this.statements.get('getPhases')!.all(workflowId);
    return rows.map(row => this.mapPhaseRow(row));
  }

  /**
   * Record agent execution
   */
  async recordExecution(execution: AgentExecutionRecord): Promise<void> {
    this.queueWrite('executions', {
      stmt: 'insertExecution',
      params: [
        execution.workflowId,
        execution.sessionId,
        execution.stepId,
        execution.agentId,
        execution.agentType,
        execution.model,
        execution.startedAt.getTime(),
        execution.endedAt.getTime(),
        execution.duration,
        execution.inputText,
        execution.outputText || null,
        execution.success ? 1 : 0,
        execution.errorMessage || null,
        execution.inputTokens || 0,
        execution.outputTokens || 0,
        execution.totalTokens || 0
      ]
    });
  }

  /**
   * Get agent executions for workflow
   */
  async getExecutions(workflowId: string, limit: number = 1000): Promise<AgentExecutionRecord[]> {
    const rows = this.statements.get('getExecutions')!.all(workflowId, limit);
    return rows.map(row => this.mapExecutionRow(row));
  }

  /**
   * Record communication
   */
  async recordCommunication(comm: CommunicationRecord): Promise<void> {
    this.queueWrite('communications', {
      stmt: 'insertCommunication',
      params: [
        comm.workflowId,
        comm.sessionId,
        comm.messageId,
        comm.fromAgent,
        comm.toAgent || null,
        comm.channel,
        comm.messageType,
        comm.payloadSummary || null,
        comm.payloadJson || null,
        comm.sentAt.getTime()
      ]
    });
  }

  /**
   * Get communications for workflow
   */
  async getCommunications(workflowId: string): Promise<CommunicationRecord[]> {
    const rows = this.statements.get('getCommunications')!.all(workflowId);
    return rows.map(row => this.mapCommunicationRow(row));
  }

  /**
   * Record decision
   */
  async recordDecision(decision: DecisionRecord): Promise<void> {
    this.queueWrite('decisions', {
      stmt: 'insertDecision',
      params: [
        decision.workflowId,
        decision.sessionId,
        decision.decisionType,
        decision.decisionTime.getTime(),
        decision.inputContext,
        decision.decision,
        decision.reasoning,
        decision.alternatives ? JSON.stringify(decision.alternatives) : null,
        decision.executorAgentId || null,
        decision.confidence || null
      ]
    });
  }

  /**
   * Get decisions for workflow
   */
  async getDecisions(workflowId: string): Promise<DecisionRecord[]> {
    const rows = this.statements.get('getDecisions')!.all(workflowId);
    return rows.map(row => this.mapDecisionRow(row));
  }

  /**
   * Queue write for async batch processing
   */
  private queueWrite(table: string, write: { stmt: string; params: any[] }): void {
    if (!this.writeBuffer.has(table)) {
      this.writeBuffer.set(table, []);
    }

    this.writeBuffer.get(table)!.push(write);

    // Flush if buffer full
    const totalBufferSize = Array.from(this.writeBuffer.values())
      .reduce((sum, arr) => sum + arr.length, 0);

    if (totalBufferSize >= this.config.maxBufferSize) {
      this.flush().catch(err => {
        console.error('[WorkflowExecutionStore] Flush error:', err);
      });
    }
  }

  /**
   * Flush all buffered writes
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.writeBuffer.size === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      // Use transaction for batch insert
      const transaction = this.db.transaction(() => {
        for (const [table, writes] of this.writeBuffer.entries()) {
          for (const write of writes) {
            const stmt = this.statements.get(write.stmt);
            if (stmt) {
              stmt.run(...write.params);
            }
          }
        }
      });

      transaction();

      // Clear buffer after successful flush
      this.writeBuffer.clear();

    } catch (error) {
      console.error('[WorkflowExecutionStore] Flush failed:', error);
      throw error;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Map database row to WorkflowRecord
   */
  private mapWorkflowRow(row: any): WorkflowRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      workflowId: row.workflow_id,
      name: row.name,
      status: row.status,
      mode: row.mode,
      stepsCount: row.steps_count,
      completedSteps: row.completed_steps,
      failedSteps: row.failed_steps,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      duration: row.duration,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      summary: row.summary_json ? JSON.parse(row.summary_json) : undefined
    };
  }

  /**
   * Map database row to PhaseRecord
   */
  private mapPhaseRow(row: any): PhaseRecord {
    return {
      workflowId: row.workflow_id,
      sessionId: row.session_id,
      phase: row.phase,
      fromPhase: row.from_phase,
      toPhase: row.to_phase,
      transitionedAt: new Date(row.transitioned_at),
      criteria: row.criteria_json ? JSON.parse(row.criteria_json) : undefined,
      duration: row.duration
    };
  }

  /**
   * Map database row to AgentExecutionRecord
   */
  private mapExecutionRow(row: any): AgentExecutionRecord {
    return {
      workflowId: row.workflow_id,
      sessionId: row.session_id,
      stepId: row.step_id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      model: row.model,
      startedAt: new Date(row.started_at),
      endedAt: new Date(row.ended_at),
      duration: row.duration,
      inputText: row.input_text,
      outputText: row.output_text,
      success: row.success === 1,
      errorMessage: row.error_message,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens
    };
  }

  /**
   * Map database row to CommunicationRecord
   */
  private mapCommunicationRow(row: any): CommunicationRecord {
    return {
      workflowId: row.workflow_id,
      sessionId: row.session_id,
      messageId: row.message_id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      channel: row.channel,
      messageType: row.message_type,
      payloadSummary: row.payload_summary,
      payloadJson: row.payload_json,
      sentAt: new Date(row.sent_at),
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : undefined
    };
  }

  /**
   * Map database row to DecisionRecord
   */
  private mapDecisionRow(row: any): DecisionRecord {
    return {
      workflowId: row.workflow_id,
      sessionId: row.session_id,
      decisionType: row.decision_type,
      decisionTime: new Date(row.decision_time),
      inputContext: row.input_context,
      decision: row.decision,
      reasoning: row.reasoning,
      alternatives: row.alternatives ? JSON.parse(row.alternatives) : undefined,
      executorAgentId: row.executor_agent_id,
      confidence: row.confidence
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Final flush before closing
    this.flush().then(() => {
      this.db.close();
    }).catch(err => {
      console.error('[WorkflowExecutionStore] Final flush failed:', err);
      this.db.close();
    });
  }
}
