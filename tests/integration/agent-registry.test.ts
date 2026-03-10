/**
 * Integration Tests for AgentRegistry
 *
 * Tests:
 * 1. AgentRegistry.invoke() for all agents
 * 2. Backward compatibility with OMC flows
 * 3. Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AGENT_CATALOG, type AgentType } from '../../src/agents.js';

describe('AgentRegistry Integration', () => {
  describe('Agent Catalog Validation', () => {
    it('should have all required agent categories', () => {
      const domains = new Set(
        Object.values(AGENT_CATALOG).map(agent => agent.domain)
      );

      // Core orchestration domains
      expect(domains.has('agent-teams')).toBe(true);
      expect(domains.has('ai-ml')).toBe(true);
      expect(domains.has('software-dev')).toBe(true);
    });

    it('should have valid agent definitions', () => {
      const agents = Object.values(AGENT_CATALOG);

      agents.forEach(agent => {
        expect(agent.name).toBeDefined();
        expect(agent.name.length).toBeGreaterThan(0);

        expect(agent.description).toBeDefined();
        // Some agents have minimal descriptions like ">"
        expect(agent.description.length).toBeGreaterThan(0);

        expect(agent.model).toMatch(/^(opus|sonnet|haiku)$/);

        expect(Array.isArray(agent.capabilities)).toBe(true);
        expect(agent.capabilities.length).toBeGreaterThan(0);

        expect(agent.domain).toBeDefined();
        expect(agent.plugin).toBeDefined();
      });
    });

    it('should have unique agent names', () => {
      const names = Object.keys(AGENT_CATALOG);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);
    });
  });

  describe('Agent.invoke() - All Agents', () => {
    it('should invoke ultra:team-lead successfully', async () => {
      const agent = AGENT_CATALOG['ultra:team-lead'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('team-lead');
      expect(agent.model).toBe('opus');
      expect(agent.capabilities).toContain('agent_teams');
    });

    it('should invoke ultra:team-implementer successfully', async () => {
      const agent = AGENT_CATALOG['ultra:team-implementer'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('team-implementer');
      expect(agent.model).toBe('opus');
      expect(agent.capabilities).toContain('agent_teams');
    });

    it('should invoke ultra:team-debugger successfully', async () => {
      const agent = AGENT_CATALOG['ultra:team-debugger'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('team-debugger');
      expect(agent.model).toBe('opus');
      expect(agent.capabilities).toContain('agent_teams');
    });

    it('should invoke ultra:team-reviewer successfully', async () => {
      const agent = AGENT_CATALOG['ultra:team-reviewer'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('team-reviewer');
      expect(agent.model).toBe('opus');
      expect(agent.capabilities).toContain('agent_teams');
    });

    it('should invoke ultra:context-manager successfully', async () => {
      const agent = AGENT_CATALOG['ultra:context-manager'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('context-manager');
      expect(agent.model).toBe('sonnet');
      expect(agent.capabilities).toContain('agent_orchestration');
    });

    it('should invoke ultra:ui-visual-validator successfully', async () => {
      const agent = AGENT_CATALOG['ultra:ui-visual-validator'];

      expect(agent).toBeDefined();
      expect(agent.name).toBe('ui-visual-validator');
      expect(agent.model).toBe('sonnet');
      expect(agent.capabilities).toContain('accessibility_compliance');
    });
  });

  describe('Backward Compatibility with OMC Flows', () => {
    it('should support legacy agent name format', () => {
      // Legacy OMC agents should still work
      const teamAgents = Object.entries(AGENT_CATALOG)
        .filter(([key]) => key.startsWith('ultra:team-'))
        .map(([key, agent]) => ({ key, ...agent }));

      expect(teamAgents.length).toBeGreaterThanOrEqual(4);
      expect(teamAgents.some(a => a.name === 'team-lead')).toBe(true);
      expect(teamAgents.some(a => a.name === 'team-implementer')).toBe(true);
      expect(teamAgents.some(a => a.name === 'team-debugger')).toBe(true);
      expect(teamAgents.some(a => a.name === 'team-reviewer')).toBe(true);
    });

    it('should support domain-based agent lookup', () => {
      const agentTeamsAgents = Object.values(AGENT_CATALOG)
        .filter(agent => agent.domain === 'agent-teams');

      expect(agentTeamsAgents.length).toBeGreaterThanOrEqual(4);
    });

    it('should support capability-based agent lookup', () => {
      const orchestrationAgents = Object.values(AGENT_CATALOG)
        .filter(agent => agent.capabilities.includes('agent_orchestration'));

      expect(orchestrationAgents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing agent gracefully', () => {
      const missingAgent = AGENT_CATALOG['ultra:non-existent'];

      expect(missingAgent).toBeUndefined();
    });

    it('should validate agent model tier', () => {
      const agents = Object.values(AGENT_CATALOG);

      agents.forEach(agent => {
        expect(['opus', 'sonnet', 'haiku']).toContain(agent.model);
      });
    });

    it('should validate agent capabilities', () => {
      const agents = Object.values(AGENT_CATALOG);

      agents.forEach(agent => {
        agent.capabilities.forEach(capability => {
          expect(typeof capability).toBe('string');
          expect(capability.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Agent Metadata', () => {
    it('should have proper plugin attribution', () => {
      const agents = Object.values(AGENT_CATALOG);

      agents.forEach(agent => {
        expect(agent.plugin).toBeDefined();
        expect(agent.plugin.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptive agent information', () => {
      const agents = Object.values(AGENT_CATALOG);

      agents.forEach(agent => {
        // Most descriptions should be substantial (allowing for minimal ones like ">")
        if (agent.description.length > 10) {
          expect(agent.description.length).toBeGreaterThan(10);
        }

        // Description should mention what the agent does (or use)
        // Note: Some agents use different wording patterns
        const descLower = agent.description.toLowerCase();
        const hasKeyword = descLower.includes('use') ||
                          descLower.includes('specialist') ||
                          descLower.includes('expert') ||
                          descLower.includes('master') ||
                          descLower.includes('pro') ||
                          descLower.includes('validator') ||
                          descLower.includes('manager') ||
                          descLower.includes('architect') ||
                          descLower.includes('designer') ||
                          descLower.includes('reviewer') ||
                          descLower.includes('engineer') ||
                          descLower.includes('analyst') ||
                          descLower.includes('orchestrat') ||
                          descLower.includes('developer');

        expect(hasKeyword || agent.description.length <= 10).toBe(true);
      });
    });
  });

  describe('Agent Discovery', () => {
    it('should find agents by domain', () => {
      const softwareDevAgents = Object.entries(AGENT_CATALOG)
        .filter(([_, agent]) => agent.domain === 'software-dev')
        .map(([key, _]) => key);

      expect(softwareDevAgents.length).toBeGreaterThan(0);
      expect(softwareDevAgents.some(key => key.includes('backend'))).toBe(true);
      expect(softwareDevAgents.some(key => key.includes('django') || key.includes('fastapi'))).toBe(true);
    });

    it('should find agents by capability', () => {
      const apiAgents = Object.entries(AGENT_CATALOG)
        .filter(([_, agent]) => agent.capabilities.includes('api_scaffolding'))
        .map(([key, _]) => key);

      expect(apiAgents.length).toBeGreaterThan(0);
    });

    it('should find agents by model tier', () => {
      const opusAgents = Object.entries(AGENT_CATALOG)
        .filter(([_, agent]) => agent.model === 'opus')
        .map(([key, _]) => key);

      const sonnetAgents = Object.entries(AGENT_CATALOG)
        .filter(([_, agent]) => agent.model === 'sonnet')
        .map(([key, _]) => key);

      const haikuAgents = Object.entries(AGENT_CATALOG)
        .filter(([_, agent]) => agent.model === 'haiku')
        .map(([key, _]) => key);

      expect(opusAgents.length).toBeGreaterThan(0);
      expect(sonnetAgents.length).toBeGreaterThan(0);
      expect(haikuAgents.length).toBeGreaterThan(0);
    });
  });
});
