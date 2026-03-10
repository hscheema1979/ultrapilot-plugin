/**
 * wshobson Agent Integration - Plugin Scanner
 *
 * Scans plugin directories, parses agent markdown files, builds registry.
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type {
  Plugin,
  Agent,
  Skill,
  ScannerOptions,
} from './types.js';
import {
  parseAgentFile,
  validateAgent,
  validatePlugin,
} from './schema.js';

/**
 * Scan result
 */
export interface ScanResult {
  plugins: Map<string, Plugin>;
  agents: Map<string, Agent>;
  stats: {
    pluginCount: number;
    agentCount: number;
    capabilityCount: number;
    scanDuration: number;
    errors: string[];
  };
}

/**
 * Plugin scanner class
 */
export class PluginScanner {
  private options: ScannerOptions;
  private dependencyGraph: Map<string, string[]> = new Map();
  private scannedPlugins: Set<string> = new Set();
  private errors: string[] = [];

  constructor(options: ScannerOptions) {
    this.options = {
      maxDepth: 10,
      ...options,
    };
  }

  /**
   * Scan all plugins
   */
  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    this.errors = [];
    this.scannedPlugins.clear();
    this.dependencyGraph.clear();

    const plugins = new Map<string, Plugin>();
    const agents = new Map<string, Agent>();

    try {
      // Find all plugin directories
      const pluginDirs = await this.findPluginDirectories();

      if (this.options.onProgress) {
        this.options.onProgress('Discovering plugins', 0, pluginDirs.length);
      }

      // Scan each plugin
      for (let i = 0; i < pluginDirs.length; i++) {
        const pluginDir = pluginDirs[i];

        if (this.options.onProgress) {
          this.options.onProgress('Scanning plugins', i + 1, pluginDirs.length);
        }

        try {
          const plugin = await this.scanPlugin(pluginDir);
          if (plugin) {
            plugins.set(plugin.name, plugin);

            // Index agents
            for (const agent of plugin.agents) {
              agents.set(agent.name, agent);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to scan plugin ${pluginDir}: ${error}`;
          this.errors.push(errorMsg);
          console.warn(errorMsg);
        }
      }

      // Build dependency graph and detect cycles
      await this.buildDependencyGraph(plugins);
      this.detectCircularDependencies();

    } catch (error) {
      this.errors.push(`Scan failed: ${error}`);
      throw error;
    }

    const scanDuration = Date.now() - startTime;

    // Count unique capabilities
    const capabilities = new Set<string>();
    for (const agent of agents.values()) {
      for (const cap of agent.capabilities) {
        capabilities.add(cap.name);
        capabilities.add(cap.hierarchy.join('::'));
      }
    }

    return {
      plugins,
      agents,
      stats: {
        pluginCount: plugins.size,
        agentCount: agents.size,
        capabilityCount: capabilities.size,
        scanDuration,
        errors: this.errors,
      },
    };
  }

  /**
   * Find all plugin directories
   */
  private async findPluginDirectories(): Promise<string[]> {
    const pluginsPath = this.options.pluginsPath;
    const entries = await fs.readdir(pluginsPath, { withFileTypes: true });

    const pluginDirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(pluginsPath, entry.name);

        // Check if it has agents/ or skills/ directory
        const hasAgents = await this.directoryExists(path.join(pluginPath, 'agents'));
        const hasSkills = await this.directoryExists(path.join(pluginPath, 'skills'));

        if (hasAgents || hasSkills) {
          pluginDirs.push(pluginPath);
        }
      }
    }

    return pluginDirs.sort();
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Scan a single plugin
   */
  private async scanPlugin(pluginPath: string): Promise<Plugin | null> {
    const pluginName = path.basename(pluginPath);

    // Scan agents
    const agents = await this.scanAgents(pluginPath, pluginName);

    // Scan skills
    const skills = await this.scanSkills(pluginPath, pluginName);

    if (agents.length === 0 && skills.length === 0) {
      return null;
    }

    const plugin: Plugin = {
      name: pluginName,
      path: pluginPath,
      agents,
      skills,
      agentCount: agents.length,
      skillCount: skills.length,
    };

    // Validate plugin structure
    const validation = validatePlugin(plugin);
    if (!validation.success) {
      this.errors.push(`Invalid plugin structure for ${pluginName}: ${validation.error}`);
      return null;
    }

    return plugin;
  }

  /**
   * Scan all agents in a plugin
   */
  private async scanAgents(pluginPath: string, pluginName: string): Promise<Agent[]> {
    const agentsDir = path.join(pluginPath, 'agents');
    const agents: Agent[] = [];

    if (!(await this.directoryExists(agentsDir))) {
      return agents;
    }

    // Find all .md files
    const agentFiles = await glob(path.join(agentsDir, '*.md'));

    for (const agentFile of agentFiles) {
      try {
        const agent = await this.scanAgent(agentFile, pluginName);
        if (agent) {
          agents.push(agent);
        }
      } catch (error) {
        this.errors.push(`Failed to scan agent ${agentFile}: ${error}`);
      }
    }

    return agents;
  }

  /**
   * Scan a single agent
   */
  private async scanAgent(agentPath: string, pluginName: string): Promise<Agent | null> {
    const content = await fs.readFile(agentPath, 'utf-8');
    const parsed = parseAgentFile(agentPath, content);

    if (!parsed) {
      return null;
    }

    const agentName = path.basename(agentPath, '.md');

    const agent: Agent = {
      name: agentName,
      plugin: pluginName,
      path: agentPath,
      description: String(parsed.frontmatter.description),
      capabilities: parsed.capabilities as any,
      category: String(parsed.frontmatter.category || 'general'),
      examples: (parsed.frontmatter.examples as string[]) || [],
      metadata: {
        frontmatter: parsed.frontmatter,
        content: parsed.content,
      },
      status: 'idle',
      lastUsed: 0,
      successRate: 1.0,
    };

    // Validate agent structure
    const validation = validateAgent(agent);
    if (!validation.success) {
      this.errors.push(`Invalid agent structure for ${agentName}: ${validation.error}`);
      return null;
    }

    return agent;
  }

  /**
   * Scan all skills in a plugin
   */
  private async scanSkills(pluginPath: string, pluginName: string): Promise<Skill[]> {
    const skillsDir = path.join(pluginPath, 'skills');
    const skills: Skill[] = [];

    if (!(await this.directoryExists(skillsDir))) {
      return skills;
    }

    // Find all .md files
    const skillFiles = await glob(path.join(skillsDir, '*.md'));

    for (const skillFile of skillFiles) {
      try {
        const skill = await this.scanSkill(skillFile, pluginName);
        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        this.errors.push(`Failed to scan skill ${skillFile}: ${error}`);
      }
    }

    return skills;
  }

  /**
   * Scan a single skill
   */
  private async scanSkill(skillPath: string, pluginName: string): Promise<Skill | null> {
    try {
      const content = await fs.readFile(skillPath, 'utf-8');

      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
      if (!frontmatterMatch) {
        return null;
      }

      const yaml = require('js-yaml');
      const frontmatter = yaml.load(frontmatterMatch[1]);

      const skillName = path.basename(skillPath, '.md');

      return {
        name: skillName,
        plugin: pluginName,
        path: skillPath,
        description: frontmatter.description || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Build dependency graph from agents
   * Detects which agents depend on others (via "after", "complements", "enables" fields)
   */
  private async buildDependencyGraph(plugins: Map<string, Plugin>): Promise<void> {
    for (const plugin of plugins.values()) {
      for (const agent of plugin.agents) {
        const dependencies = this.extractDependencies(agent);
        this.dependencyGraph.set(agent.name, dependencies);
      }
    }
  }

  /**
   * Extract agent dependencies from metadata
   */
  private extractDependencies(agent: Agent): string[] {
    const dependencies: string[] = [];

    // Check "after" field in content
    const afterMatch = agent.metadata.content.match(/\*\*After\*\*:\s*(.+)$/m);
    if (afterMatch) {
      const afterList = afterMatch[1].split(',').map((s) => s.trim());
      dependencies.push(...afterList);
    }

    // Check for "complements" field
    const complementsMatch = agent.metadata.content.match(/\*\*Complements\*\*:\s*(.+)$/m);
    if (complementsMatch) {
      const complementsList = complementsMatch[1].split(',').map((s) => s.trim());
      dependencies.push(...complementsList);
    }

    return dependencies;
  }

  /**
   * Detect circular dependencies in the dependency graph
   */
  private detectCircularDependencies(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const detectCycle = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dependencies = this.dependencyGraph.get(node) || [];

      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          detectCycle(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          cycles.push(cycle);
        }
      }

      recursionStack.delete(node);
    };

    for (const agent of this.dependencyGraph.keys()) {
      if (!visited.has(agent)) {
        detectCycle(agent, []);
      }
    }

    // Report cycles
    for (const cycle of cycles) {
      const msg = `Circular dependency detected: ${cycle.join(' -> ')}`;
      this.errors.push(msg);
      console.warn(msg);
    }
  }
}

export default PluginScanner;
