/**
 * Integration tests for wshobson agent integration
 *
 * Tests complete workflows:
 * - Plugin scanning → Cache loading → Registry population
 * - Agent resolution (wshobson: prefix)
 * - Agent orchestration with sandboxing
 * - End-to-end agent execution
 * - Conflict resolution across duplicate agent names
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentRegistry } from '../../registry.js';
import { PluginScanner } from '../../scanners/plugin-scanner.js';
import { ConflictResolver } from '../../resolvers/conflict-resolver.js';
import { AgentOrchestrator } from '../../agent-orchestration/AgentOrchestrator.js';
import { AgentBridge } from '../../agent-bridge/index.js';
import { AgentStateStore } from '../../agent-state/AgentStateStore.js';
import { AgentMessageBus } from '../../agent-comms/AgentMessageBus.js';
import { WshobsonAgentAdapter } from '../../adapters/wshobson-adapter.js';
import type { WshobsonCache, UnifiedAgent } from '../../types/wshobson-types.js';

describe('wshobson Integration', () => {
  let orchestrator: AgentOrchestrator;
  let bridge: AgentBridge;
  let stateStore: AgentStateStore;
  let messageBus: AgentMessageBus;

  beforeEach(() => {
    // Reset registry
    AgentRegistry['wshobsonAgents'] = new Map();

    // Setup orchestration components
    stateStore = new AgentStateStore();
    messageBus = new AgentMessageBus();
    bridge = new AgentBridge();
    orchestrator = new AgentOrchestrator(bridge, stateStore, messageBus);
  });

  afterEach(() => {
    // Cleanup
    AgentRegistry['wshobsonAgents'] = new Map();
  });

  describe('Cache loading and registry population', () => {
    it('should load agents from cache structure into registry', async () => {
      const mockCache: WshobsonCache = {
        plugins: {
          'backend-api-security': {
            agents: [
              {
                name: 'backend-security-reviewer',
                description: 'Expert in backend API security',
                systemPrompt: 'You are a backend security expert',
                model: 'sonnet',
                tier: 'sonnet',
                capabilities: ['analyze_code', 'search_code', 'read_file'],
                plugin: 'backend-api-security',
                domain: 'security'
              }
            ],
            agentCount: 1
          }
        },
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      await AgentRegistry.loadFromCache(mockCache);

      const agent = AgentRegistry.getWshobsonAgent('backend-security-reviewer');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('backend-security-reviewer');
      expect(agent?.plugin).toBe('backend-api-security');
    });

    it('should list all wshobson agents after cache load', async () => {
      const mockCache: WshobsonCache = {
        plugins: {
          'backend-api-security': {
            agents: [
              {
                name: 'security-auditor',
                description: 'Security auditor',
                systemPrompt: 'You audit security',
                model: 'sonnet',
                tier: 'sonnet',
                capabilities: ['analyze_code'],
                plugin: 'backend-api-security',
                domain: 'security'
              }
            ],
            agentCount: 1
          },
          'api-integration': {
            agents: [
              {
                name: 'api-expert',
                description: 'API integration expert',
                systemPrompt: 'You are an API expert',
                model: 'opus',
                tier: 'opus',
                capabilities: ['analyze_code', 'search_code'],
                plugin: 'api-integration',
                domain: 'backend'
              }
            ],
            agentCount: 1
          }
        },
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      await AgentRegistry.loadFromCache(mockCache);

      const agents = AgentRegistry.listWshobsonAgents();
      expect(agents).toHaveLength(2);
      expect(agents.some(a => a.name === 'security-auditor')).toBe(true);
      expect(agents.some(a => a.name === 'api-expert')).toBe(true);
    });
  });

  describe('Agent resolution with wshobson prefix', () => {
    beforeEach(async () => {
      const mockCache: WshobsonCache = {
        plugins: {
          'test-plugin': {
            agents: [
              {
                name: 'test-agent',
                description: 'Test agent',
                systemPrompt: 'Test prompt',
                model: 'sonnet',
                tier: 'sonnet',
                capabilities: [],
                plugin: 'test-plugin',
                domain: 'test'
              }
            ],
            agentCount: 1
          }
        },
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      await AgentRegistry.loadFromCache(mockCache);
    });

    it('should resolve wshobson: prefixed agent ID', async () => {
      const result = await AgentOrchestrator['resolveAgent']?.('wshobson:test-agent');

      expect(result).toBeDefined();
      expect(result?.source).toBe('wshobson');
      expect(result?.name).toBe('test-agent');
    });

    it('should return null for non-existent wshobson agent', async () => {
      const result = await AgentOrchestrator['resolveAgent']?.('wshobson:non-existent');

      expect(result).toBeNull();
    });
  });

  describe('Conflict resolution', () => {
    it('should resolve duplicate agent names using domain priority', () => {
      const agents: UnifiedAgent[] = [
        {
          id: 'wshobson:code-reviewer-1',
          name: 'code-reviewer',
          description: 'Security code reviewer',
          model: 'sonnet',
          source: 'wshobson',
          plugin: 'backend-api-security',
          domain: 'security',
          capabilities: ['analyze_code']
        },
        {
          id: 'ultra:code-reviewer-2',
          name: 'code-reviewer',
          description: 'Quality code reviewer',
          model: 'sonnet',
          source: 'ultrapilot',
          domain: 'quality',
          capabilities: ['analyze_code']
        }
      ];

      const resolved = ConflictResolver.resolveDuplicates(agents);

      expect(resolved).toHaveLength(2);

      // Check that both agents have namespace suffixes
      const securityReviewer = resolved.find(a => a.name.includes('security'));
      const qualityReviewer = resolved.find(a => a.name.includes('quality'));

      expect(securityReviewer).toBeDefined();
      expect(qualityReviewer).toBeDefined();
    });

    it('should handle multiple duplicate pairs', () => {
      const agents: UnifiedAgent[] = [
        { id: '1', name: 'agent', description: 'A', model: 'sonnet', source: 'wshobson', domain: 'security', capabilities: [] },
        { id: '2', name: 'agent', description: 'B', model: 'sonnet', source: 'wshobson', domain: 'quality', capabilities: [] },
        { id: '3', name: 'tester', description: 'C', model: 'sonnet', source: 'wshobson', domain: 'security', capabilities: [] },
        { id: '4', name: 'tester', description: 'D', model: 'sonnet', source: 'wshobson', domain: 'quality', capabilities: [] }
      ];

      const resolved = ConflictResolver.resolveDuplicates(agents);

      expect(resolved).toHaveLength(4);

      // All should have unique names
      const names = resolved.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(4);
    });
  });

  describe('Adapter conversion integration', () => {
    it('should convert from cache to executable definition', async () => {
      const unified: UnifiedAgent = {
        id: 'wshobson:test-agent',
        name: 'test-agent',
        description: 'Test description',
        model: 'opus',
        source: 'wshobson',
        plugin: 'test-plugin',
        domain: 'test',
        capabilities: ['analyze_code', 'search_code']
      };

      const adapter = new WshobsonAgentAdapter();
      const definition = await adapter.toAgentDefinition(unified);

      expect(definition.name).toBe('test-agent');
      expect(definition.description).toBe('Test description');
      expect(definition.systemPrompt).toBe('Test description');
      expect(definition.model).toBe('opus');
      expect(definition.tier).toBe('opus');
      expect(definition.capabilities).toEqual(['analyze_code', 'search_code']);
      expect(definition.plugin).toBe('test-plugin');
      expect(definition.domain).toBe('test');
    });

    it('should round-trip conversion (definition → unified → definition)', async () => {
      const originalDefinition = {
        name: 'round-trip-agent',
        description: 'Round trip test',
        systemPrompt: 'System prompt',
        model: 'sonnet' as const,
        tier: 'sonnet' as const,
        capabilities: ['read_file'],
        plugin: 'test',
        domain: 'test'
      };

      const adapter = new WshobsonAgentAdapter();

      // Convert to unified
      const unified = adapter.toUnifiedAgent(originalDefinition);

      // Convert back to definition
      const roundTripDefinition = await adapter.toAgentDefinition(unified);

      expect(roundTripDefinition.name).toBe(originalDefinition.name);
      expect(roundTripDefinition.model).toBe(originalDefinition.model);
      expect(roundTripDefinition.tier).toBe(originalDefinition.tier);
      expect(roundTripDefinition.capabilities).toEqual(originalDefinition.capabilities);
    });
  });

  describe('End-to-end agent execution flow', () => {
    it('should execute wshobson agent through orchestrator', async () => {
      // Register test agent
      const testAgent: UnifiedAgent = {
        id: 'wshobson:e2e-test-agent',
        name: 'e2e-test-agent',
        description: 'End-to-end test agent',
        model: 'haiku',
        source: 'wshobson',
        plugin: 'test',
        domain: 'test',
        capabilities: []
      };

      AgentRegistry.registerWshobsonAgent(testAgent);

      // Execute through orchestrator
      const result = await orchestrator.spawnAgent(
        'wshobson:e2e-test-agent',
        'Test task',
        { domain: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('wshobson:e2e-test-agent');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should record invocation in state store', async () => {
      const testAgent: UnifiedAgent = {
        id: 'wshobson:state-test-agent',
        name: 'state-test-agent',
        description: 'State test agent',
        model: 'haiku',
        source: 'wshobson',
        plugin: 'test',
        domain: 'test',
        capabilities: []
      };

      AgentRegistry.registerWshobsonAgent(testAgent);

      await orchestrator.spawnAgent(
        'wshobson:state-test-agent',
        'State test task',
        { domain: 'test' }
      );

      const state = await stateStore.get('wshobson:state-test-agent');
      expect(state).toBeDefined();
      expect(state?.completedTasks).toContain('State test task');
    });
  });

  describe('Security enforcement integration', () => {
    it('should reject agent with disallowed capabilities', async () => {
      const maliciousAgent: UnifiedAgent = {
        id: 'wshobson:malicious-agent',
        name: 'malicious-agent',
        description: 'Agent with disallowed capabilities',
        model: 'sonnet',
        source: 'wshobson',
        plugin: 'test',
        domain: 'test',
        capabilities: ['write_file', 'execute_command'] // Disallowed
      };

      AgentRegistry.registerWshobsonAgent(maliciousAgent);

      const result = await orchestrator.spawnAgent(
        'wshobson:malicious-agent',
        'Malicious task',
        { domain: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disallowed capabilities');
    });

    it('should allow agent with whitelisted capabilities', async () => {
      const safeAgent: UnifiedAgent = {
        id: 'wshobson:safe-agent',
        name: 'safe-agent',
        description: 'Safe agent with read-only capabilities',
        model: 'haiku',
        source: 'wshobson',
        plugin: 'test',
        domain: 'test',
        capabilities: ['read_file', 'list_files', 'analyze_code']
      };

      AgentRegistry.registerWshobsonAgent(safeAgent);

      const result = await orchestrator.spawnAgent(
        'wshobson:safe-agent',
        'Safe task',
        { domain: 'test' }
      );

      expect(result.success).toBe(true);
    });
  });
});
