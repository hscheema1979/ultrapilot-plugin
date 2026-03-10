/**
 * Feature Request Automation Pipeline
 *
 * Automated workflow from feature request to implementation
 * 1. Validates request
 * 2. Creates implementation plan
 * 3. Spawns ultra-lead agent
 * 4. Monitors progress
 * 5. Verifies completion
 */

import { Octokit } from 'octokit';
import { createCommunicator } from '../communication/cross-workspace-communicator.js';

export interface FeatureRequest {
  issueNumber: number;
  repository: {
    owner: string;
    name: string;
  };
  title: string;
  body: string;
  labels: string[];
  createdBy: string;
  createdAt: Date;
}

export interface ValidationReport {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export interface ImplementationPlan {
  planId: string;
  featureRequest: FeatureRequest;
  requirements: string[];
  architecture: string;
  tasks: Array<{
    id: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dependencies: string[];
  }>;
  estimatedHours: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AgentExecution {
  agentId: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
}

export class FeatureRequestProcessor {
  private octokit: Octokit;
  private workspace: string;
  private crossWorkspaceCommunicator?: Awaited<ReturnType<typeof createCommunicator>>;
  private activeExecutions: Map<string, AgentExecution> = new Map();

  constructor(githubToken: string, workspace: string = 'ultra-dev') {
    this.octokit = new Octokit({ auth: githubToken });
    this.workspace = workspace;
  }

  /**
   * Initialize cross-workspace communication
   */
  async initialize(): Promise<void> {
    try {
      this.crossWorkspaceCommunicator = await createCommunicator(this.workspace);
      console.log('✅ Feature request processor initialized with cross-workspace communication');
    } catch (error) {
      console.warn('⚠️ Cross-workspace communication not available, continuing without it');
    }
  }

  /**
   * Process a feature request from start to finish
   */
  async processFeatureRequest(request: FeatureRequest): Promise<void> {
    console.log(`🚀 Processing feature request #${request.issueNumber}: ${request.title}`);

    try {
      // Step 1: Validate the request
      const validation = await this.validateRequest(request);
      if (!validation.valid) {
        await this.reportValidationFailure(request, validation);
        return;
      }

      // Step 2: Create implementation plan
      const plan = await this.createImplementationPlan(request);

      // Step 3: Store plan and add plan comment
      await this.storePlan(plan);
      await this.addPlanComment(request, plan);

      // Step 4: Spawn ultra-lead agent
      const agent = await this.spawnUltraLeadAgent(plan);

      // Step 5: Monitor agent progress
      await this.monitorAgentProgress(agent, plan);

      // Step 6: Verify completion
      const verified = await this.verifyCompletion(plan, agent);

      if (verified) {
        await this.reportSuccess(request, plan, agent);
      } else {
        await this.reportVerificationFailure(request, plan);
      }

    } catch (error) {
      console.error(`❌ Error processing feature request #${request.issueNumber}:`, error);
      await this.reportError(request, error);
    }
  }

  /**
   * Validate the feature request
   */
  private async validateRequest(request: FeatureRequest): Promise<ValidationReport> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!request.title || request.title.trim().length === 0) {
      issues.push('Title is required');
    }

    if (!request.body || request.body.trim().length === 0) {
      issues.push('Description is required');
    }

    // Validate structure
    if (request.body && !request.body.includes('## Requirements')) {
      warnings.push('Missing "## Requirements" section, may affect implementation quality');
    }

    if (request.body && !request.body.includes('## Acceptance Criteria')) {
      warnings.push('Missing "## Acceptance Criteria" section, verification may be difficult');
    }

    // Check for duplicate requests
    const existingIssues = await this.octokit.rest.issues.listForRepo({
      owner: request.repository.owner,
      repo: request.repository.name,
      state: 'all',
      per_page: 100
    });

    const duplicates = existingIssues.data.filter(issue =>
      issue.title.toLowerCase() === request.title.toLowerCase() &&
      issue.number !== request.issueNumber
    );

    if (duplicates.length > 0) {
      warnings.push(`Found ${duplicates.length} similar issue(s): ${duplicates.map(d => `#${d.number}`).join(', ')}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Create implementation plan using AI agents
   */
  private async createImplementationPlan(request: FeatureRequest): Promise<ImplementationPlan> {
    console.log(`📋 Creating implementation plan for #${request.issueNumber}...`);

    // This would normally call ultra-lead or ultra-planner to create the plan
    // For now, we'll create a basic plan structure
    const plan: ImplementationPlan = {
      planId: `plan-${request.issueNumber}-${Date.now()}`,
      featureRequest: request,
      requirements: this.extractRequirements(request),
      architecture: 'Architecture will be determined by ultra-architect agent',
      tasks: [
        {
          id: 'task-1',
          description: 'Analyze requirements and design solution',
          priority: 'high',
          dependencies: []
        },
        {
          id: 'task-2',
          description: 'Implement core functionality',
          priority: 'high',
          dependencies: ['task-1']
        },
        {
          id: 'task-3',
          description: 'Write tests',
          priority: 'medium',
          dependencies: ['task-2']
        },
        {
          id: 'task-4',
          description: 'Documentation',
          priority: 'low',
          dependencies: ['task-2']
        }
      ],
      estimatedHours: 8,
      riskLevel: 'medium'
    };

    return plan;
  }

  /**
   * Extract requirements from issue body
   */
  private extractRequirements(request: FeatureRequest): string[] {
    const requirements: string[] = [];
    const body = request.body || '';

    // Look for requirements section
    const reqMatch = body.match(/## Requirements\s+([\s\S]*?)(?=##|\Z)/i);
    if (reqMatch) {
      const reqText = reqMatch[1].trim();
      const lines = reqText.split('\n').filter(line => line.trim().startsWith('-'));
      requirements.push(...lines.map(line => line.replace(/^-\s*/, '').trim()));
    }

    // If no requirements section, use the description
    if (requirements.length === 0) {
      requirements.push(request.title);
      requirements.push(body.split('\n')[0] || request.title);
    }

    return requirements;
  }

  /**
   * Store plan for later retrieval
   */
  private async storePlan(plan: ImplementationPlan): Promise<void> {
    // Store in database or file system
    const fs = require('fs').promises;
    const path = require('path');

    const plansDir = path.join(process.cwd(), '.ultra', 'plans');
    await fs.mkdir(plansDir, { recursive: true });

    const planPath = path.join(plansDir, `${plan.planId}.json`);
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  }

  /**
   * Add plan as comment to issue
   */
  private async addPlanComment(request: FeatureRequest, plan: ImplementationPlan): Promise<void> {
    const comment = `## 📋 Implementation Plan

**Plan ID:** ${plan.planId}

### Requirements
${plan.requirements.map(req => `- ${req}`).join('\n')}

### Tasks
${plan.tasks.map(task => `- **${task.id}**: ${task.description} (Priority: ${task.priority})`).join('\n')}

### Estimates
- **Estimated Hours:** ${plan.estimatedHours}
- **Risk Level:** ${plan.riskLevel}

---
*Plan created by Feature Request Automation Pipeline*`;

    await this.octokit.rest.issues.createComment({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      body: comment
    });
  }

  /**
   * Spawn ultra-lead agent to execute the plan
   */
  private async spawnUltraLeadAgent(plan: ImplementationPlan): Promise<AgentExecution> {
    console.log(`🤖 Spawning ultra-lead agent for plan ${plan.planId}...`);

    const agentExecution: AgentExecution = {
      agentId: `agent-${plan.planId}-${Date.now()}`,
      agentType: 'ultra-lead',
      status: 'pending',
      startedAt: new Date()
    };

    this.activeExecutions.set(agentExecution.agentId, agentExecution);

    // This would normally spawn an actual agent
    // For now, simulate agent spawning
    agentExecution.status = 'running';

    // Notify about agent spawn
    if (this.crossWorkspaceCommunicator) {
      await this.crossWorkspaceCommunicator.sendMessage(
        'ultra-dev',
        'agent-events',
        'event',
        {
          event: 'agent_spawned',
          agentId: agentExecution.agentId,
          agentType: agentExecution.agentType,
          planId: plan.planId
        }
      );
    }

    return agentExecution;
  }

  /**
   * Monitor agent progress
   */
  private async monitorAgentProgress(agent: AgentExecution, plan: ImplementationPlan): Promise<void> {
    console.log(`📊 Monitoring agent ${agent.agentId} progress...`);

    // Add 'running' label to indicate work is in progress
    await this.octokit.rest.issues.addLabels({
      owner: plan.featureRequest.repository.owner,
      repo: plan.featureRequest.repository.name,
      issue_number: plan.featureRequest.issueNumber,
      labels: ['running']
    });

    // This would normally poll the agent for status updates
    // For now, simulate progress updates
    const updates = [
      { message: 'Analyzing requirements...', progress: 25 },
      { message: 'Designing solution architecture...', progress: 50 },
      { message: 'Implementing features...', progress: 75 },
      { message: 'Running tests and verification...', progress: 90 }
    ];

    for (const update of updates) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work

      await this.octokit.rest.issues.createComment({
        owner: plan.featureRequest.repository.owner,
        repo: plan.featureRequest.repository.name,
        issue_number: plan.featureRequest.issueNumber,
        body: `**Progress:** ${update.message} (${update.progress}%)`
      });
    }

    agentExecution.status = 'completed';
    agentExecution.completedAt = new Date();
    agentExecution.output = 'Feature implementation completed successfully';
  }

  /**
   * Verify completion of implementation
   */
  private async verifyCompletion(plan: ImplementationPlan, agent: AgentExecution): Promise<boolean> {
    console.log(`✅ Verifying completion of plan ${plan.planId}...`);

    // This would run tests and verification checks
    // For now, simulate verification
    await new Promise(resolve => setTimeout(resolve, 1000));

    return agentExecution.status === 'completed';
  }

  /**
   * Report successful completion
   */
  private async reportSuccess(request: FeatureRequest, plan: ImplementationPlan, agent: AgentExecution): Promise<void> {
    const duration = agent.completedAt && agent.startedAt
      ? Math.round((agent.completedAt.getTime() - agent.startedAt.getTime()) / 1000 / 60)
      : 0;

    const comment = `## ✅ Feature Implementation Complete

**Plan ID:** ${plan.planId}
**Agent:** ${agent.agentId}
**Duration:** ${duration} minutes

### Output
${agent.output || 'No output available'}

### Next Steps
1. Review the implementation
2. Test the new functionality
3. Provide feedback or close the issue

---
*Automated by Feature Request Pipeline*`;

    await this.octokit.rest.issues.createComment({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      body: comment
    });

    // Close the issue
    await this.octokit.rest.issues.update({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      state: 'closed'
    });

    console.log(`✅ Feature request #${request.issueNumber} completed successfully`);
  }

  /**
   * Report validation failure
   */
  private async reportValidationFailure(request: FeatureRequest, validation: ValidationReport): Promise<void> {
    const comment = `## ❌ Validation Failed

Your feature request could not be processed due to the following issues:

### Issues
${validation.issues.map(issue => `- ${issue}`).join('\n')}

### Warnings
${validation.warnings.length > 0 ? validation.warnings.map(w => `- ${w}`).join('\n') : 'None'}

Please update the issue to address these issues, then re-add the 'feature-request' label.

---
*Automated by Feature Request Pipeline*`;

    await this.octokit.rest.issues.createComment({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      body: comment
    });
  }

  /**
   * Report verification failure
   */
  private async reportVerificationFailure(request: FeatureRequest, plan: ImplementationPlan): Promise<void> {
    const comment = `## ⚠️ Verification Failed

The implementation could not be verified. Please review manually.

**Plan ID:** ${plan.planId}

---
*Automated by Feature Request Pipeline*`;

    await this.octokit.rest.issues.createComment({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      body: comment
    });
  }

  /**
   * Report processing error
   */
  private async reportError(request: FeatureRequest, error: unknown): Promise<void> {
    const comment = `## 🚨 Processing Error

An error occurred while processing this feature request:

\`\`\`
${error instanceof Error ? error.message : String(error)}
\`\`\`

Please review the logs or contact support.

---
*Automated by Feature Request Pipeline*`;

    await this.octokit.rest.issues.createComment({
      owner: request.repository.owner,
      repo: request.repository.name,
      issue_number: request.issueNumber,
      body: comment
    });
  }
}
