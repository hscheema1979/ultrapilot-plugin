/**
 * wshobson Agent Integration - Zod Validation Schemas
 *
 * Defines all Zod schemas for validating agent metadata and structures.
 * Part of Phase 1: Abstracted Registry & Plugin Discovery
 */

import { z } from 'zod';

/**
 * Agent frontmatter schema (extracted from .md files)
 */
export const AgentFrontmatterSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  description: z.string().min(1, "Description is required"),
  model: z.string().optional().default('inherit'),
  category: z.string().optional(),
  capabilities: z.array(z.string()).optional().default([]),
  examples: z.array(z.string()).optional().default([]),
} as Record<string, z.ZodTypeAny>);

/**
 * Capability schema with hierarchy
 */
export const CapabilitySchema = z.object({
  name: z.string().min(1),
  hierarchy: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
} as Record<string, z.ZodTypeAny>);

/**
 * Agent schema
 */
export const AgentSchema = z.object({
  name: z.string().min(1),
  plugin: z.string().min(1),
  path: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(CapabilitySchema),
  category: z.string().default('general'),
  examples: z.array(z.string()).default([]),
  metadata: z.object({
    frontmatter: z.record(z.any()),
    content: z.string(),
  } as Record<string, z.ZodTypeAny>),
  status: z.enum(['idle', 'working', 'failed']).default('idle'),
  lastUsed: z.number().default(0),
  successRate: z.number().min(0).max(1).default(1.0),
} as Record<string, z.ZodTypeAny>);

/**
 * Skill schema
 */
export const SkillSchema = z.object({
  name: z.string().min(1),
  plugin: z.string().min(1),
  path: z.string().min(1),
  description: z.string(),
} as Record<string, z.ZodTypeAny>);

/**
 * Plugin schema
 */
export const PluginSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  agents: z.array(AgentSchema),
  skills: z.array(SkillSchema).default([]),
  agentCount: z.number().min(0),
  skillCount: z.number().min(0),
});

/**
 * Circuit breaker state schema
 */
export const CircuitBreakerStateSchema = z.record(
  z.object({
    state: z.enum(['closed', 'open', 'half-open']),
    failureCount: z.number().min(0),
    lastFailureTime: z.number(),
    nextAttemptTime: z.number(),
    successCount: z.number().min(0),
  })
);

/**
 * Registry cache schema
 */
export const RegistryCacheSchema = z.object({
  plugins: z.record(z.string(), PluginSchema),
  agents: z.record(z.string(), AgentSchema),
  capabilities: z.record(
    z.array(
      z.object({
        agent: AgentSchema,
        score: z.number(),
        lastUsed: z.number(),
      })
    )
  ),
  circuitBreaker: CircuitBreakerStateSchema,
  metadata: z.object({
    scanTime: z.number(),
    pluginCount: z.number().min(0),
    agentCount: z.number().min(0),
    capabilityCount: z.number().min(0),
    version: z.string(),
  }),
});

/**
 * File ownership schema
 */
export const FileOwnershipSchema = z.object({
  ownedPaths: z.array(z.string()).default([]),
  readOnlyPaths: z.array(z.string()).default([]),
  transferOnCompletion: z.boolean().default(false),
});

/**
 * Trace context schema
 */
export const TraceContextSchema = z.object({
  traceId: z.string().uuid(),
  spanId: z.string().uuid(),
  parentSpanId: z.string().uuid().optional(),
  baggage: z.record(z.string()),
});

/**
 * Registry stats schema
 */
export const RegistryStatsSchema = z.object({
  pluginCount: z.number().min(0),
  agentCount: z.number().min(0),
  capabilityCount: z.number().min(0),
  cacheHitRate: z.number().min(0).max(1),
  lastScanTime: z.number(),
  scanDuration: z.number().min(0),
});

/**
 * Parsed agent file content schema
 */
export const ParsedAgentFileSchema = z.object({
  frontmatter: AgentFrontmatterSchema,
  content: z.string(),
  capabilities: z.array(CapabilitySchema),
});

/**
 * Validation helper functions
 */

/**
 * Validate agent frontmatter
 */
export function validateAgentFrontmatter(data: unknown) {
  return AgentFrontmatterSchema.safeParse(data);
}

/**
 * Validate agent object
 */
export function validateAgent(data: unknown) {
  return AgentSchema.safeParse(data);
}

/**
 * Validate capability object
 */
export function validateCapability(data: unknown) {
  return CapabilitySchema.safeParse(data);
}

/**
 * Validate plugin object
 */
export function validatePlugin(data: unknown) {
  return PluginSchema.safeParse(data);
}

/**
 * Validate registry cache
 */
export function validateRegistryCache(data: unknown) {
  return RegistryCacheSchema.safeParse(data);
}

/**
 * Extract capabilities from agent content
 * Parses the Capabilities section to build structured capability objects
 */
export function extractCapabilitiesFromContent(
  content: string,
  baseCapabilities: string[] = []
): z.infer<typeof CapabilitySchema>[] {
  const capabilities: z.infer<typeof CapabilitySchema>[] = [];

  // Add frontmatter capabilities
  for (const cap of baseCapabilities) {
    capabilities.push({
      name: cap,
      hierarchy: [cap],
      confidence: 0.8, // Default confidence for explicitly declared capabilities
    });
  }

  // Parse Capabilities section from content
  const capabilitiesSection = content.match(/## Capabilities\n([\s\S]+?)(?=\n##|$)/);
  if (capabilitiesSection) {
    const sectionContent = capabilitiesSection[1];
    const subsections = sectionContent.split(/\n### /);

    for (const subsection of subsections) {
      const lines = subsection.trim().split('\n');
      if (lines.length === 0) continue;

      // Get subsection title as category
      const category = lines[0].replace(/\*\*/g, '').trim().toLowerCase();

      // Extract bullet points as capabilities
      for (const line of lines.slice(1)) {
        const match = line.match(/^\-\s+\*\*(.+?)\*\*:\s*(.+)$/);
        if (match) {
          const name = match[1].trim().toLowerCase().replace(/\s+/g, '-');
          const description = match[2].trim();

          capabilities.push({
            name,
            hierarchy: [category, name],
            confidence: 0.9, // Higher confidence for detailed capabilities
          });
        }
      }
    }
  }

  return capabilities;
}

/**
 * Parse agent markdown file
 * Extracts frontmatter and content, validates structure
 */
export function parseAgentFile(
  filePath: string,
  content: string
): z.infer<typeof ParsedAgentFileSchema> | null {
  try {
    // Extract frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      console.warn(`No frontmatter found in ${filePath}`);
      return null;
    }

    // Parse YAML frontmatter
    const yaml = require('js-yaml');
    const frontmatter = yaml.load(frontmatterMatch[1]);

    // Validate frontmatter
    const frontmatterValidation = validateAgentFrontmatter(frontmatter);
    if (!frontmatterValidation.success) {
      console.warn(`Invalid frontmatter in ${filePath}:`, frontmatterValidation.error);
      return null;
    }

    const validatedFrontmatter = frontmatterValidation.data;
    const bodyContent = content.slice(frontmatterMatch[0].length).trim();

    // Extract capabilities
    const baseCapabilities = (validatedFrontmatter.capabilities as string[]) || [];
    const capabilities = extractCapabilitiesFromContent(
      bodyContent,
      baseCapabilities
    );

    return {
      frontmatter: validatedFrontmatter,
      content: bodyContent,
      capabilities,
    };
  } catch (error) {
    console.warn(`Error parsing ${filePath}:`, error);
    return null;
  }
}
