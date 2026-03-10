/**
 * UltraLeadClient Demo / Test File
 *
 * This file demonstrates how to use UltraLeadClient to:
 * 1. Subscribe to plan creation events
 * 2. Monitor plan file changes
 * 3. Execute Phases 2-5 workflow
 * 4. Create ULTRA_LEAD sessions
 * 5. Report progress via AgentMessageBus
 */

import { UltraLeadClient, createUltraLeadClient } from './UltraLeadClient.js';
import { AgentMessageBus } from '../agent-comms/AgentMessageBus.js';
import { PlanEvent } from './UltraLeadClient.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Demo: Basic UltraLeadClient usage
 */
async function demoBasicUsage() {
  console.log('\n========================================');
  console.log('UltraLeadClient Demo: Basic Usage');
  console.log('========================================\n');

  // Create client instance
  const client = createUltraLeadClient({
    workspacePath: process.cwd(),
    planPath: path.join(process.cwd(), '.ultra', 'plan-final.md'),
    autoStart: true,
    enableFileWatcher: true
  });

  console.log('Client created and started');
  console.log('Waiting for plan events...\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nStopping client...');
    await client.stop();
    process.exit(0);
  });
}

/**
 * Demo: Publish a plan creation event
 */
async function demoPublishPlanEvent() {
  console.log('\n========================================');
  console.log('UltraLeadClient Demo: Publish Plan Event');
  console.log('========================================\n');

  // Create message bus to publish events
  const messageBus = new AgentMessageBus();

  // Create and start client
  const client = createUltraLeadClient({
    workspacePath: process.cwd(),
    autoStart: true
  });

  // Wait a bit for client to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Publish a plan creation event
  const planEvent: PlanEvent = {
    planId: 'plan-demo-' + Date.now(),
    planPath: path.join(process.cwd(), '.ultra', 'plan-final.md'),
    workspacePath: process.cwd(),
    timestamp: new Date(),
    phases: [
      {
        phaseNumber: 2,
        name: 'Planning',
        tasks: [
          {
            taskId: 'task-2-1',
            title: 'Create implementation plan',
            description: 'Break down requirements into implementation tasks',
            agentType: 'planner',
            priority: 'high',
            estimatedHours: 2
          }
        ]
      },
      {
        phaseNumber: 3,
        name: 'Execution',
        tasks: [
          {
            taskId: 'task-3-1',
            title: 'Implement core features',
            description: 'Implement the main functionality',
            agentType: 'executor',
            priority: 'high',
            estimatedHours: 4
          }
        ]
      }
    ]
  };

  console.log('Publishing plan.created event...');
  await messageBus.publish(
    'system',
    'plan.created',
    {
      type: 'plan.created',
      payload: planEvent
    }
  );

  console.log('Event published! Client should now process the plan.\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nStopping...');
    await client.stop();
    await messageBus.close();
    process.exit(0);
  });
}

/**
 * Demo: Create a sample plan file
 */
async function demoCreateSamplePlan() {
  console.log('\n========================================');
  console.log('UltraLeadClient Demo: Create Sample Plan');
  console.log('========================================\n');

  const planPath = path.join(process.cwd(), '.ultra', 'plan-final.md');

  const samplePlan = `# Operational Plan - Sample Project

## Metadata
- Plan ID: plan-sample-${Date.now()}
- Version: 1.0
- Created: ${new Date().toISOString()}
- Workspace: ${process.cwd()}

## Phase 2: Planning

### Tasks
- [ ] Create implementation tasks: Break down requirements into actionable tasks
- [ ] Define file ownership: Assign files to agents to prevent conflicts
- [ ] Set up testing strategy: Define test approach and coverage goals

## Phase 3: Execution

### Tasks
- [ ] Implement core functionality: Build the main features
- [ ] Write unit tests: Ensure code quality with comprehensive tests
- [ ] Integrate components: Connect all modules together

## Phase 4: Quality Assurance

### Tasks
- [ ] Run test suite: Execute all tests and verify results
- [ ] Performance review: Check for performance bottlenecks
- [ ] Security audit: Review code for security vulnerabilities

## Phase 5: Validation

### Tasks
- [ ] Final review: Comprehensive code review
- [ ] Documentation: Update project documentation
- [ ] Deployment prep: Prepare for production deployment
`;

  // Ensure .ultra directory exists
  const ultraDir = path.join(process.cwd(), '.ultra');
  try {
    await fs.mkdir(ultraDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  // Write plan file
  await fs.writeFile(planPath, samplePlan, 'utf-8');

  console.log(`Sample plan created at: ${planPath}`);
  console.log('You can now run the basic demo to test file watching.\n');
}

/**
 * Demo: Monitor progress
 */
async function demoMonitorProgress() {
  console.log('\n========================================');
  console.log('UltraLeadClient Demo: Monitor Progress');
  console.log('========================================\n');

  const client = createUltraLeadClient({
    workspacePath: process.cwd(),
    autoStart: true
  });

  // Listen to progress events
  client.on('progress', (progress) => {
    console.log('\n[Progress Update]');
    console.log(`  Phase: ${progress.phase} - ${progress.phaseName}`);
    console.log(`  Status: ${progress.status}`);
    console.log(`  Tasks: ${progress.tasksCompleted}/${progress.totalTasks}`);
    if (progress.message) {
      console.log(`  Message: ${progress.message}`);
    }
  });

  // Listen to task completion
  client.on('taskCompleted', (task) => {
    console.log(`\n[Task Completed] ${task.title}`);
  });

  // Listen to workflow completion
  client.on('workflowCompleted', (result) => {
    console.log('\n========================================');
    console.log('Workflow Completed!');
    console.log('========================================');
    console.log(`Success: ${result.success}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`Steps: ${result.steps.length}`);
  });

  console.log('Monitoring progress...\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nStopping...');
    await client.stop();
    process.exit(0);
  });
}

/**
 * Demo: Get statistics
 */
async function demoGetStats() {
  console.log('\n========================================');
  console.log('UltraLeadClient Demo: Get Statistics');
  console.log('========================================\n');

  const client = createUltraLeadClient({
    workspacePath: process.cwd(),
    autoStart: true
  });

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Get statistics
  const stats = client.getStats();

  console.log('\n[UltraLeadClient Statistics]');
  console.log(`  Running: ${stats.isRunning}`);
  console.log(`  Monitoring: ${stats.isMonitoring}`);
  console.log(`  Session ID: ${stats.sessionId || 'None'}`);
  console.log(`  Current Phase: ${stats.currentPhase}`);
  console.log(`  Tasks: ${stats.tasksCompleted}/${stats.totalTasks}`);
  console.log(`  Queue Stats:`);
  console.log(`    Intake: ${stats.queueStats.intake}`);
  console.log(`    In Progress: ${stats.queueStats.inProgress}`);
  console.log(`    Completed: ${stats.queueStats.completed}`);

  await client.stop();
}

/**
 * Main: Run demo based on command line argument
 */
async function main() {
  const args = process.argv.slice(2);
  const demo = args[0] || 'basic';

  switch (demo) {
    case 'basic':
      await demoBasicUsage();
      break;
    case 'publish':
      await demoPublishPlanEvent();
      break;
    case 'create-plan':
      await demoCreateSamplePlan();
      break;
    case 'monitor':
      await demoMonitorProgress();
      break;
    case 'stats':
      await demoGetStats();
      break;
    default:
      console.log(`\nUnknown demo: ${demo}`);
      console.log('\nAvailable demos:');
      console.log('  basic       - Basic usage with file watching');
      console.log('  publish     - Publish a plan creation event');
      console.log('  create-plan - Create a sample plan file');
      console.log('  monitor     - Monitor progress events');
      console.log('  stats       - Get client statistics');
      console.log('\nUsage: ts-node UltraLeadClient.demo.ts [demo-name]');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  demoBasicUsage,
  demoPublishPlanEvent,
  demoCreateSamplePlan,
  demoMonitorProgress,
  demoGetStats
};
