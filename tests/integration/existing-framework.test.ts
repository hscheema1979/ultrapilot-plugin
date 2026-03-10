/**
 * Test: Verify existing Ultra-Lead implementation works
 *
 * This tests what EXISTS, not what we planned to build.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UltraLead } from '../src/domain/UltraLead';
import { ConnectionPool } from '../src/agent-comms/ConnectionPool';
import { AgentMessageBus } from '../src/agent-comms/AgentMessageBus';

describe('UltraLead - EXISTING IMPLEMENTATION', () => {
  let ultraLead: UltraLead;
  let messageBus: AgentMessageBus;

  beforeEach(async () => {
    // Use existing implementations
    ConnectionPool.resetForTest(':memory:');

    // Initialize AgentMessageBus with signing enabled
    messageBus = new AgentMessageBus({
      enableSigning: true,
      signingKey: Buffer.from('test-key-for-hmac-signing'),
    });

    // Create UltraLead instance
    ultraLead = new UltraLead({
      owner: 'test-owner',
      messageBus,
    });
  });

  it('should instantiate UltraLead', () => {
    expect(ultraLead).toBeDefined();
    expect(ultraLead instanceof UltraLead).toBe(true);
  });

  it('should receive work request', async () => {
    const workRequest = {
      id: 'test-001',
      title: 'Test work request',
      description: 'Test description',
      tasks: [],
      priority: 'medium' as const,
      createdAt: new Date(),
    };

    const result = await ultraLead.receiveWorkRequest(workRequest);

    expect(result).toBeDefined();
    expect(result.tasks).toBeDefined();
    expect(result.totalEstimatedHours).toBeDefined();
  });

  it('should break down work into tasks', async () => {
    const workRequest = {
      id: 'test-002',
      title: 'Build REST API',
      description: 'Create endpoints for task management',
      tasks: [],
      priority: 'high' as const,
      createdAt: new Date(),
    };

    const result = await ultraLead.receiveWorkRequest(workRequest);

    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.totalEstimatedHours).toBeGreaterThan(0);
  });
});
