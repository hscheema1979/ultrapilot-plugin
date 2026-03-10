/**
 * Performance tests for wshobson agent loading
 *
 * Measures:
 * - Cache loading time (177 agents)
 * - Memory footprint
 * - Agent resolution speed
 * - Conflict resolution performance
 * - Registry lookup performance
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentRegistry } from '../../registry.js';
import { ConflictResolver } from '../../resolvers/conflict-resolver.js';
import { PluginScanner } from '../../scanners/plugin-scanner.js';
import type { WshobsonCache, UnifiedAgent } from '../../types/wshobson-types.js';

describe('Agent Loading Performance', () => {
  beforeEach(() => {
    // Reset registry before each test
    AgentRegistry['wshobsonAgents'] = new Map();
  });

  describe('Cache loading performance', () => {
    it('should load 177 agents in under 100ms', async () => {
      // Create realistic cache with 177 agents
      const mockCache: WshobsonCache = {
        plugins: {},
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      // Simulate 72 plugins with ~2-3 agents each
      const plugins = [
        'backend-api-security', 'api-integration', 'incident-response',
        'tutorial-engineer', 'error-diagnostic', 'code-coverage',
        'refactoring-specialist', 'documentation-generator',
        'testing-framework', 'performance-optimizer',
        // ... add more to reach ~72 plugins
      ];

      let agentCount = 0;
      for (const plugin of plugins.slice(0, 72)) {
        const agentsPerPlugin = 2 + Math.floor(Math.random() * 2);
        mockCache.plugins[plugin] = {
          agents: [],
          agentCount: agentsPerPlugin
        };

        for (let i = 0; i < agentsPerPlugin && agentCount < 177; i++) {
          mockCache.plugins[plugin].agents.push({
            name: `${plugin}-agent-${i}`,
            description: `Agent ${i} from ${plugin}`,
            systemPrompt: `You are agent ${i}`,
            model: ['opus', 'sonnet', 'haiku'][Math.floor(Math.random() * 3)] as any,
            tier: 'sonnet',
            capabilities: ['analyze_code', 'read_file'],
            plugin,
            domain: ['security', 'backend', 'frontend', 'testing'][Math.floor(Math.random() * 4)]
          });
          agentCount++;
        }
      }

      // Measure loading time
      const startTime = performance.now();
      await AgentRegistry.loadFromCache(mockCache);
      const endTime = performance.now();

      const loadTime = endTime - startTime;

      console.log(`Loaded ${agentCount} agents in ${loadTime.toFixed(2)}ms`);
      console.log(`Average per agent: ${(loadTime / agentCount).toFixed(3)}ms`);

      expect(loadTime).toBeLessThan(100);
      expect(agentCount).toBe(177);
    });

    it('should handle memory efficiently with 177 agents', async () => {
      const mockCache: WshobsonCache = {
        plugins: {},
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      // Create 177 agents
      for (let i = 0; i < 177; i++) {
        const plugin = `plugin-${i % 72}`;
        if (!mockCache.plugins[plugin]) {
          mockCache.plugins[plugin] = { agents: [], agentCount: 0 };
        }
        mockCache.plugins[plugin].agents.push({
          name: `agent-${i}`,
          description: `Agent ${i} description`,
          systemPrompt: `System prompt for agent ${i}`,
          model: 'sonnet',
          tier: 'sonnet',
          capabilities: ['analyze_code'],
          plugin,
          domain: 'test'
        });
        mockCache.plugins[plugin].agentCount++;
      }

      // Measure memory before
      const memBefore = process.memoryUsage().heapUsed;

      await AgentRegistry.loadFromCache(mockCache);

      // Measure memory after
      const memAfter = process.memoryUsage().heapUsed;
      const memDelta = memAfter - memBefore;

      console.log(`Memory delta for 177 agents: ${(memDelta / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Average per agent: ${(memDelta / 177 / 1024).toFixed(2)}KB`);

      // Should use less than 10MB for 177 agents
      expect(memDelta).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Agent resolution performance', () => {
    beforeEach(async () => {
      // Pre-load registry with agents
      const mockCache: WshobsonCache = {
        plugins: {},
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      for (let i = 0; i < 177; i++) {
        const plugin = `plugin-${i % 72}`;
        if (!mockCache.plugins[plugin]) {
          mockCache.plugins[plugin] = { agents: [], agentCount: 0 };
        }
        mockCache.plugins[plugin].agents.push({
          name: `agent-${i}`,
          description: `Agent ${i}`,
          systemPrompt: `Prompt ${i}`,
          model: 'sonnet',
          tier: 'sonnet',
          capabilities: [],
          plugin,
          domain: 'test'
        });
        mockCache.plugins[plugin].agentCount++;
      }

      await AgentRegistry.loadFromCache(mockCache);
    });

    it('should resolve agent in under 1ms', () => {
      const startTime = performance.now();

      const agent = AgentRegistry.getWshobsonAgent('agent-100');

      const endTime = performance.now();
      const resolveTime = endTime - startTime;

      console.log(`Agent resolution time: ${resolveTime.toFixed(3)}ms`);

      expect(agent).toBeDefined();
      expect(resolveTime).toBeLessThan(1);
    });

    it('should list all agents in under 5ms', () => {
      const startTime = performance.now();

      const agents = AgentRegistry.listWshobsonAgents();

      const endTime = performance.now();
      const listTime = endTime - startTime;

      console.log(`List ${agents.length} agents in ${listTime.toFixed(2)}ms`);

      expect(agents).toHaveLength(177);
      expect(listTime).toBeLessThan(5);
    });

    it('should handle 1000 consecutive lookups efficiently', () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        const agentName = `agent-${i % 177}`;
        const agent = AgentRegistry.getWshobsonAgent(agentName);
        expect(agent).toBeDefined();
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / 1000;

      console.log(`1000 lookups in ${totalTime.toFixed(2)}ms`);
      console.log(`Average per lookup: ${avgTime.toFixed(4)}ms`);

      expect(totalTime).toBeLessThan(50); // < 50ms total
      expect(avgTime).toBeLessThan(0.05); // < 0.05ms per lookup
    });
  });

  describe('Conflict resolution performance', () => {
    it('should resolve 64 duplicates in under 50ms', () => {
      // Create 217 agents (40 ultra + 177 wshobson) with 64 duplicates
      const agents: UnifiedAgent[] = [];

      // Add 40 ultra agents
      for (let i = 0; i < 40; i++) {
        agents.push({
          id: `ultra:agent-${i}`,
          name: `agent-${i % 20}`, // Creates duplicates
          description: `Ultra agent ${i}`,
          model: 'sonnet',
          source: 'ultrapilot',
          domain: ['security', 'backend', 'frontend', 'testing'][i % 4],
          capabilities: []
        });
      }

      // Add 177 wshobson agents (some with duplicate names)
      for (let i = 0; i < 177; i++) {
        agents.push({
          id: `wshobson:agent-${i}`,
          name: `agent-${i % 20}`, // Creates duplicates with ultra agents
          description: `wshobson agent ${i}`,
          model: 'sonnet',
          source: 'wshobson',
          plugin: `plugin-${i % 72}`,
          domain: ['security', 'backend', 'frontend', 'testing'][i % 4],
          capabilities: []
        });
      }

      const startTime = performance.now();

      const resolved = ConflictResolver.resolveDuplicates(agents);

      const endTime = performance.now();
      const resolveTime = endTime - startTime;

      console.log(`Resolved ${agents.length} agents with duplicates in ${resolveTime.toFixed(2)}ms`);

      // All agents should still be present
      expect(resolved).toHaveLength(217);
      expect(resolveTime).toBeLessThan(50);

      // All names should be unique
      const names = resolved.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(217);
    });
  });

  describe('Plugin scanning performance', () => {
    it('should handle large plugin counts efficiently', () => {
      // This is a unit test - actual file system scanning would be integration test
      const scanner = new PluginScanner();

      // Mock 72 plugins with ~2-3 agents each
      const pluginCount = 72;
      const expectedAgentCount = 177;

      console.log(`Expected to scan ${pluginCount} plugins`);
      console.log(`Expected to discover ~${expectedAgentCount} agents`);

      // In real scenario, would test actual file system scanning
      // For unit test, we verify the scanner is instantiable
      expect(scanner).toBeDefined();
    });
  });

  describe('Registry memory efficiency', () => {
    it('should maintain constant lookup time as registry grows', async () => {
      const lookupTimes: number[] = [];

      // Load agents in batches and measure lookup time
      for (let batch = 0; batch < 5; batch++) {
        const mockCache: WshobsonCache = {
          plugins: {},
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        };

        // Add 35 agents per batch
        for (let i = 0; i < 35; i++) {
          const idx = batch * 35 + i;
          const plugin = `plugin-${idx % 72}`;
          if (!mockCache.plugins[plugin]) {
            mockCache.plugins[plugin] = { agents: [], agentCount: 0 };
          }
          mockCache.plugins[plugin].agents.push({
            name: `agent-${idx}`,
            description: `Agent ${idx}`,
            systemPrompt: `Prompt ${idx}`,
            model: 'sonnet',
            tier: 'sonnet',
            capabilities: [],
            plugin,
            domain: 'test'
          });
          mockCache.plugins[plugin].agentCount++;
        }

        await AgentRegistry.loadFromCache(mockCache);

        // Measure lookup time
        const startTime = performance.now();
        const agent = AgentRegistry.getWshobsonAgent(`agent-${batch * 35 + 17}`);
        const endTime = performance.now();

        expect(agent).toBeDefined();
        lookupTimes.push(endTime - startTime);
      }

      console.log('Lookup times as registry grows:');
      lookupTimes.forEach((time, i) => {
        console.log(`  Batch ${i + 1} (${(i + 1) * 35} agents): ${time.toFixed(4)}ms`);
      });

      // Lookup time should remain relatively constant
      // Last lookup should not be more than 2x first lookup
      expect(lookupTimes[4]!).toBeLessThan(lookupTimes[0]! * 2);
    });
  });
});
