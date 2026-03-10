/**
 * Integration test for wshobson catalog import
 *
 * Verifies:
 * - WSHOBSON_CATALOG is properly imported
 * - Agents are discoverable via AgentRegistry
 * - Agent definitions have correct structure
 * - Total agent count matches expectation
 */

import { describe, it, expect } from '@jest/globals';
import { AgentRegistry } from '../../registry.js';
import { WSHOBSON_CATALOG } from '../../wshobson-catalog.js';

describe('wshobson Catalog Integration', () => {
  it('should have 173 wshobson agents', () => {
    const count = Object.keys(WSHOBSON_CATALOG).length;
    expect(count).toBe(173);
  });

  it('should have all agents with wshobson: prefix', () => {
    for (const agentKey of Object.keys(WSHOBSON_CATALOG)) {
      expect(agentKey).toMatch(/^wshobson:/);
    }
  });

  it('should have valid agent definitions', () => {
    for (const [key, agent] of Object.entries(WSHOBSON_CATALOG)) {
      expect(agent.name).toBeDefined();
      expect(agent.name).toBeTruthy();

      expect(agent.description).toBeDefined();
      expect(agent.description).toBeTruthy();

      expect(agent.model).toBeDefined();
      expect(['opus', 'sonnet', 'haiku', 'inherit']).toContain(agent.model);

      expect(agent.capabilities).toBeDefined();
      expect(Array.isArray(agent.capabilities)).toBe(true);
    }
  });

  it('should provide merged catalog via AgentRegistry', () => {
    const merged = AgentRegistry.getMergedCatalog();

    // Should contain both ultra and wshobson agents
    expect(merged['ultra:analyst']).toBeDefined();
    expect(merged['wshobson:backend-security-coder']).toBeDefined();
  });

  it('should check agent existence correctly', () => {
    expect(AgentRegistry.agentExists('wshobson:backend-security-coder')).toBe(true);
    expect(AgentRegistry.agentExists('wshobson:non-existent')).toBe(false);
    expect(AgentRegistry.agentExists('ultra:analyst')).toBe(true);
  });

  it('should get agent definitions from merged catalog', () => {
    const wshobsonAgent = AgentRegistry.getAgentDefinition('wshobson:backend-security-coder');
    expect(wshobsonAgent).toBeDefined();
    expect(wshobsonAgent!.name).toBe('Backend Security Coder');
    expect(wshobsonAgent!.model).toBe('sonnet');

    const ultraAgent = AgentRegistry.getAgentDefinition('ultra:analyst');
    expect(ultraAgent).toBeDefined();
    expect(ultraAgent!.name).toBe('Requirements Analyst');
  });

  it('should have security agents', () => {
    const securityAgents = Object.keys(WSHOBSON_CATALOG).filter(key =>
      key.includes('security') || key.includes('auditor')
    );

    expect(securityAgents.length).toBeGreaterThan(5);
    expect(securityAgents).toContain('wshobson:backend-security-coder');
    expect(securityAgents).toContain('wshobson:security-auditor');
  });

  it('should have backend development agents', () => {
    const backendAgents = Object.keys(WSHOBSON_CATALOG).filter(key =>
      key.includes('backend') || key.includes('api') || key.includes('database')
    );

    expect(backendAgents.length).toBeGreaterThan(10);
  });

  it('should have language specialists', () => {
    const languageAgents = Object.keys(WSHOBSON_CATALOG).filter(key =>
      key.includes('-pro') || key.includes('python') || key.includes('javascript')
    );

    expect(languageAgents.length).toBeGreaterThan(15);
  });

  it('should have team coordination agents', () => {
    expect(WSHOBSON_CATALOG['wshobson:team-lead']).toBeDefined();
    expect(WSHOBSON_CATALOG['wshobson:team-implementer']).toBeDefined();
    expect(WSHOBSON_CATALOG['wshobson:team-reviewer']).toBeDefined();
    expect(WSHOBSON_CATALOG['wshobson:team-debugger']).toBeDefined();
  });

  it('should provide comprehensive coverage across domains', () => {
    const domains = {
      security: 0,
      backend: 0,
      frontend: 0,
      devops: 0,
      testing: 0,
      data: 0,
      architecture: 0
    };

    for (const key of Object.keys(WSHOBSON_CATALOG)) {
      if (key.includes('security') || key.includes('auditor')) domains.security++;
      if (key.includes('backend') || key.includes('api') || key.includes('database')) domains.backend++;
      if (key.includes('frontend') || key.includes('mobile') || key.includes('ui')) domains.frontend++;
      if (key.includes('cloud') || key.includes('kubernetes') || key.includes('devops')) domains.devops++;
      if (key.includes('test')) domains.testing++;
      if (key.includes('data') || key.includes('ml') || key.includes('ai')) domains.data++;
      if (key.includes('architect') || key.includes('c4') || key.includes('design')) domains.architecture++;
    }

    // Verify good coverage across all domains
    expect(domains.security).toBeGreaterThan(10);
    expect(domains.backend).toBeGreaterThan(20);
    expect(domains.frontend).toBeGreaterThan(10);
    expect(domains.devops).toBeGreaterThan(15);
    expect(domains.testing).toBeGreaterThan(5);
    expect(domains.data).toBeGreaterThan(10);
    expect(domains.architecture).toBeGreaterThan(5);
  });
});
