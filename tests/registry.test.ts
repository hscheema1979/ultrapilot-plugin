/**
 * Tests for AgentRegistry
 *
 * Tests the agent mapping, invocation, and registry management functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry, AgentMapping, InvocationOptions } from '../src/registry.js';
import { AGENT_CATALOG } from '../src/agents.js';

describe('AgentRegistry', () => {
  beforeEach(() => {
    // Reset registry before each test
    AgentRegistry.reset();
  });

  afterEach(() => {
    // Reinitialize for clean state
    AgentRegistry.initialize();
  });

  describe('Initialization', () => {
    it('should initialize on first access', () => {
      AgentRegistry.reset();
      expect(AgentRegistry['initialized']).toBe(false);

      AgentRegistry.getRegisteredAgents();
      expect(AgentRegistry['initialized']).toBe(true);
    });

    it('should not re-initialize if already initialized', () => {
      AgentRegistry.initialize();
      const firstCallMappings = AgentRegistry['mappings'];

      AgentRegistry.initialize();
      const secondCallMappings = AgentRegistry['mappings'];

      expect(firstCallMappings).toBe(secondCallMappings);
    });
  });

  describe('Agent Mapping Coverage', () => {
    it('should have mappings for all agents in the catalog', () => {
      const coverage = AgentRegistry.validateCoverage();

      expect(coverage.valid).toBe(true);
      expect(coverage.unmapped).toHaveLength(0);
      expect(coverage.total).toBeGreaterThan(0);
      expect(coverage.mapped).toBe(coverage.total);
    });

    it('should include all expected core orchestration agents', () => {
      const coreAgents = [
        'ultra:analyst',
        'ultra:architect',
        'ultra:planner',
        'ultra:critic'
      ];

      coreAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
        const mapping = AgentRegistry.getMapping(agent);
        expect(mapping).not.toBeNull();
        expect(mapping?.model).toBe('opus');
      });
    });

    it('should include all implementation agents with correct models', () => {
      expect(AgentRegistry.isRegistered('ultra:executor')).toBe(true);
      expect(AgentRegistry.getMapping('ultra:executor')?.model).toBe('sonnet');

      expect(AgentRegistry.isRegistered('ultra:executor-low')).toBe(true);
      expect(AgentRegistry.getMapping('ultra:executor-low')?.model).toBe('haiku');

      expect(AgentRegistry.isRegistered('ultra:executor-high')).toBe(true);
      expect(AgentRegistry.getMapping('ultra:executor-high')?.model).toBe('opus');
    });

    it('should include all quality and testing agents', () => {
      const qualityAgents = [
        'ultra:test-engineer',
        'ultra:verifier'
      ];

      qualityAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
        expect(AgentRegistry.getMapping(agent)?.model).toBe('sonnet');
      });
    });

    it('should include all review agents', () => {
      const reviewAgents = [
        'ultra:security-reviewer',
        'ultra:quality-reviewer',
        'ultra:code-reviewer'
      ];

      reviewAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
      });

      // Check specific mappings
      expect(AgentRegistry.getMapping('ultra:security-reviewer')?.mapsTo).toBe('ultra-security-review');
      expect(AgentRegistry.getMapping('ultra:code-reviewer')?.mapsTo).toBe('ultra-code-review');
    });

    it('should include all debugging agents', () => {
      const debuggingAgents = [
        'ultra:debugger',
        'ultra:scientist'
      ];

      debuggingAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
        expect(AgentRegistry.getMapping(agent)?.model).toBe('sonnet');
      });

      expect(AgentRegistry.getMapping('ultra:debugger')?.mapsTo).toBe('ultra-debugging');
    });

    it('should include all support agents', () => {
      const supportAgents = [
        'ultra:build-fixer',
        'ultra:designer',
        'ultra:writer',
        'ultra:document-specialist'
      ];

      supportAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
      });

      expect(AgentRegistry.getMapping('ultra:writer')?.model).toBe('haiku');
    });

    it('should include all team workflow agents', () => {
      const teamAgents = [
        'ultra:team-lead',
        'ultra:team-implementer',
        'ultra:team-reviewer',
        'ultra:team-debugger'
      ];

      teamAgents.forEach(agent => {
        expect(AgentRegistry.isRegistered(agent)).toBe(true);
      });

      expect(AgentRegistry.getMapping('ultra:team-lead')?.model).toBe('opus');
    });
  });

  describe('Mapping Structure', () => {
    it('should have valid mapping structure for all agents', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      agents.forEach(agentType => {
        const mapping = AgentRegistry.getMapping(agentType);
        expect(mapping).toBeDefined();
        expect(mapping?.mapsTo).toBeDefined();
        expect(typeof mapping?.mapsTo).toBe('string');
        expect(mapping?.model).toBeDefined();
        expect(['opus', 'sonnet', 'haiku']).toContain(mapping?.model);
      });
    });

    it('should map to existing skills or general-purpose', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      agents.forEach(agentType => {
        const mapping = AgentRegistry.getMapping(agentType);
        // Either maps to a specialized ultra skill or general-purpose
        expect(
          mapping?.mapsTo.startsWith('ultra-') ||
          mapping?.mapsTo === 'general-purpose'
        ).toBe(true);
      });
    });
  });

  describe('Agent Invocation', () => {
    it('should return valid invocation spec for known agents', () => {
      const invocation = AgentRegistry.invoke('ultra:analyst', 'Analyze this code');

      expect(invocation).not.toBeNull();
      expect(invocation?.skill).toBeDefined();
      expect(invocation?.model).toBeDefined();
      expect(invocation?.input).toBeDefined();
      expect(typeof invocation?.input).toBe('string');
    });

    it('should include system prompt in invocation when defined', () => {
      const invocation = AgentRegistry.invoke('ultra:architect', 'Design a system');

      expect(invocation?.input).toContain('System Instructions');
      expect(invocation?.input).toContain('System Architect');
    });

    it('should include context when provided in options', () => {
      const options: InvocationOptions = {
        context: 'Working on a Node.js API project',
        verbose: true
      };

      const invocation = AgentRegistry.invoke('ultra:planner', 'Create a plan', options);

      expect(invocation?.input).toContain('Context');
      expect(invocation?.input).toContain('Node.js API');
    });

    it('should return null for unknown agent types', () => {
      const invocation = AgentRegistry.invoke('unknown:agent', 'Do something');

      expect(invocation).toBeNull();
    });

    it('should use correct model tier from mapping', () => {
      const haikuInvocation = AgentRegistry.invoke('ultra:writer', 'Write docs');
      expect(haikuInvocation?.model).toBe('haiku');

      const sonnetInvocation = AgentRegistry.invoke('ultra:executor', 'Implement feature');
      expect(sonnetInvocation?.model).toBe('sonnet');

      const opusInvocation = AgentRegistry.invoke('ultra:analyst', 'Analyze requirements');
      expect(opusInvocation?.model).toBe('opus');
    });

    it('should map specialized agents to their skills', () => {
      const securityInvocation = AgentRegistry.invoke('ultra:security-reviewer', 'Review security');
      expect(securityInvocation?.skill).toBe('ultra-security-review');

      const debugInvocation = AgentRegistry.invoke('ultra:debugger', 'Debug this issue');
      expect(debugInvocation?.skill).toBe('ultra-debugging');

      const codeReviewInvocation = AgentRegistry.invoke('ultra:code-reviewer', 'Review code');
      expect(codeReviewInvocation?.skill).toBe('ultra-code-review');
    });

    it('should map general agents to general-purpose skill', () => {
      const agents = [
        'ultra:analyst',
        'ultra:architect',
        'ultra:planner',
        'ultra:critic',
        'ultra:executor'
      ];

      agents.forEach(agent => {
        const invocation = AgentRegistry.invoke(agent, 'Test task');
        expect(invocation?.skill).toBe('general-purpose');
      });
    });
  });

  describe('Agent Queries', () => {
    it('should return all registered agents', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      expect(agents).toBeInstanceOf(Array);
      expect(agents.length).toBeGreaterThan(20);
      expect(agents).toContain('ultra:analyst');
      expect(agents).toContain('ultra:executor');
    });

    it('should filter agents by model tier', () => {
      const opusAgents = AgentRegistry.getAgentsByModel('opus');
      const sonnetAgents = AgentRegistry.getAgentsByModel('sonnet');
      const haikuAgents = AgentRegistry.getAgentsByModel('haiku');

      expect(opusAgents.length).toBeGreaterThan(0);
      expect(sonnetAgents.length).toBeGreaterThan(0);
      expect(haikuAgents.length).toBeGreaterThan(0);

      // Verify all returned are correct model
      opusAgents.forEach(agent => {
        expect(AgentRegistry.getMapping(agent)?.model).toBe('opus');
      });

      sonnetAgents.forEach(agent => {
        expect(AgentRegistry.getMapping(agent)?.model).toBe('sonnet');
      });

      haikuAgents.forEach(agent => {
        expect(AgentRegistry.getMapping(agent)?.model).toBe('haiku');
      });
    });

    it('should group agents by category', () => {
      const byCategory = AgentRegistry.getAgentsByCategory();

      expect(byCategory.orchestration).toBeDefined();
      expect(byCategory.implementation).toBeDefined();
      expect(byCategory.quality).toBeDefined();
      expect(byCategory.review).toBeDefined();
      expect(byCategory.debugging).toBeDefined();
      expect(byCategory.support).toBeDefined();
      expect(byCategory.team).toBeDefined();

      // Check some specific assignments
      expect(byCategory.orchestration).toContain('ultra:analyst');
      expect(byCategory.implementation).toContain('ultra:executor');
      expect(byCategory.quality).toContain('ultra:test-engineer');
      expect(byCategory.review).toContain('ultra:security-reviewer');
    });

    it('should get agent info from catalog', () => {
      const info = AgentRegistry.getAgentInfo('ultra:analyst');

      expect(info).not.toBeNull();
      expect(info?.name).toBe('Requirements Analyst');
      expect(info?.model).toBe('opus');
      expect(info?.capabilities).toContain('requirements-analysis');
    });

    it('should return null for unknown agent info', () => {
      const info = AgentRegistry.getAgentInfo('unknown:agent');
      expect(info).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate registry statistics', () => {
      const stats = AgentRegistry.getStats();

      expect(stats.totalAgents).toBeGreaterThan(0);
      expect(stats.byModel).toBeDefined();
      expect(stats.bySkill).toBeDefined();

      // Check model counts sum to total
      const totalByModel = Object.values(stats.byModel).reduce((a, b) => a + b, 0);
      expect(totalByModel).toBe(stats.totalAgents);

      // Check skill counts sum to total
      const totalBySkill = Object.values(stats.bySkill).reduce((a, b) => a + b, 0);
      expect(totalBySkill).toBe(stats.totalAgents);
    });

    it('should track opus agents correctly', () => {
      const stats = AgentRegistry.getStats();

      expect(stats.byModel.opus).toBeGreaterThan(0);
      expect(stats.byModel.opus).toBeLessThan(stats.totalAgents);
    });

    it('should track sonnet agents correctly', () => {
      const stats = AgentRegistry.getStats();

      expect(stats.byModel.sonnet).toBeGreaterThan(0);
    });

    it('should track haiku agents correctly', () => {
      const stats = AgentRegistry.getStats();

      expect(stats.byModel.haiku).toBeGreaterThan(0);
    });

    it('should track skill usage', () => {
      const stats = AgentRegistry.getStats();

      expect(stats.bySkill['general-purpose']).toBeGreaterThan(0);
      expect(stats.bySkill['ultra-security-review']).toBe(1);
      expect(stats.bySkill['ultra-debugging']).toBe(1);
      expect(stats.bySkill['ultra-code-review']).toBe(1);
    });
  });

  describe('Validation', () => {
    it('should validate complete coverage', () => {
      const validation = AgentRegistry.validateCoverage();

      expect(validation.valid).toBe(true);
      expect(validation.unmapped).toHaveLength(0);
      expect(validation.mapped).toBe(validation.total);
    });

    it('should report catalog size', () => {
      const validation = AgentRegistry.validateCoverage();

      expect(validation.total).toBe(Object.keys(AGENT_CATALOG).length);
    });
  });

  describe('Integration with Agent Catalog', () => {
    it('should have consistent model tiers with catalog', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      agents.forEach(agentType => {
        const catalogInfo = AGENT_CATALOG[agentType];
        const mapping = AgentRegistry.getMapping(agentType);

        expect(catalogInfo).toBeDefined();
        expect(mapping).toBeDefined();
        expect(catalogInfo?.model).toBe(mapping?.model);
      });
    });

    it('should provide descriptions for all agents', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      agents.forEach(agentType => {
        const info = AgentRegistry.getAgentInfo(agentType);
        expect(info?.description).toBeDefined();
        expect(info?.description.length).toBeGreaterThan(0);
      });
    });

    it('should include capabilities for all agents', () => {
      const agents = AgentRegistry.getRegisteredAgents();

      agents.forEach(agentType => {
        const info = AgentRegistry.getAgentInfo(agentType);
        expect(info?.capabilities).toBeDefined();
        expect(info?.capabilities.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle reset and re-initialization', () => {
      const agents1 = AgentRegistry.getRegisteredAgents();
      AgentRegistry.reset();
      const agents2 = AgentRegistry.getRegisteredAgents();

      expect(agents1).toEqual(agents2);
    });

    it('should handle empty task string', () => {
      const invocation = AgentRegistry.invoke('ultra:executor', '');

      expect(invocation).not.toBeNull();
      expect(invocation?.input).toBeDefined();
    });

    it('should handle very long task strings', () => {
      const longTask = 'Implement '.repeat(1000) + 'feature';
      const invocation = AgentRegistry.invoke('ultra:executor', longTask);

      expect(invocation).not.toBeNull();
      expect(invocation?.input).toContain(longTask);
    });

    it('should handle special characters in task', () => {
      const specialTask = 'Fix: "bug" with \n newlines and \t tabs';
      const invocation = AgentRegistry.invoke('ultra:debugger', specialTask);

      expect(invocation).not.toBeNull();
    });

    it('should handle invocation options with all fields', () => {
      const options: InvocationOptions = {
        context: 'Test context',
        params: { key: 'value' },
        verbose: true,
        cwd: '/test/path'
      };

      const invocation = AgentRegistry.invoke('ultra:analyst', 'Task', options);

      expect(invocation).not.toBeNull();
      expect(invocation?.input).toContain('Test context');
    });
  });

  describe('Specific Agent Behaviors', () => {
    it('should configure ultra:analyst with opus and analysis focus', () => {
      const mapping = AgentRegistry.getMapping('ultra:analyst');
      const invocation = AgentRegistry.invoke('ultra:analyst', 'Analyze requirements');

      expect(mapping?.model).toBe('opus');
      expect(invocation?.input).toContain('Requirements Analyst');
      expect(invocation?.input).toContain('Extract');
    });

    it('should configure ultra:architect with opus and design focus', () => {
      const mapping = AgentRegistry.getMapping('ultra:architect');
      const invocation = AgentRegistry.invoke('ultra:architect', 'Design system');

      expect(mapping?.model).toBe('opus');
      expect(invocation?.input).toContain('System Architect');
      expect(invocation?.input).toContain('architecture');
    });

    it('should configure ultra:planner with opus and planning focus', () => {
      const mapping = AgentRegistry.getMapping('ultra:planner');
      const invocation = AgentRegistry.invoke('ultra:planner', 'Create plan');

      expect(mapping?.model).toBe('opus');
      expect(invocation?.input).toContain('Implementation Planner');
      expect(invocation?.input).toContain('Break down');
    });

    it('should configure ultra:critic with opus and validation focus', () => {
      const mapping = AgentRegistry.getMapping('ultra:critic');
      const invocation = AgentRegistry.invoke('ultra:critic', 'Review plan');

      expect(mapping?.model).toBe('opus');
      expect(invocation?.input).toContain('Plan Critic');
      expect(invocation?.input).toContain('Validate');
    });

    it('should configure ultra:executor-low with haiku for simple tasks', () => {
      const mapping = AgentRegistry.getMapping('ultra:executor-low');
      const invocation = AgentRegistry.invoke('ultra:executor-low', 'Fix typo');

      expect(mapping?.model).toBe('haiku');
      expect(invocation?.input).toContain('Quick Implementation');
      expect(invocation?.input).toContain('simple');
    });

    it('should configure ultra:team-lead with opus for orchestration', () => {
      const mapping = AgentRegistry.getMapping('ultra:team-lead');
      const invocation = AgentRegistry.invoke('ultra:team-lead', 'Orchestrate team');

      expect(mapping?.model).toBe('opus');
      expect(invocation?.input).toContain('Team Lead');
      expect(invocation?.input).toContain('parallel');
    });

    it('should configure ultra:team-implementer with sonnet and ownership focus', () => {
      const mapping = AgentRegistry.getMapping('ultra:team-implementer');
      const invocation = AgentRegistry.invoke('ultra:team-implementer', 'Implement feature');

      expect(mapping?.model).toBe('sonnet');
      expect(invocation?.input).toContain('file ownership');
      expect(invocation?.input).toContain('boundaries');
    });
  });
});
