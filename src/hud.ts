/**
 * Ultrapilot HUD - Statusline Renderer
 *
 * Renders the statusline display for Ultrapilot state.
 * Shows phases, iterations, QA cycles, context usage, and agent activity.
 */

import { readState, AutopilotState, RalphState, UltraqaState } from './state.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Render context usage percentage with color coding
 */
function renderContext(percent: number, preset: 'minimal' | 'focused' | 'full'): string {
  const color = percent >= 85 ? 'red' : percent >= 70 ? 'yellow' : 'green';

  if (preset === 'full') {
    const width = 8;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return colorize(`[${bar}]${percent}%`, color);
  }

  return colorize(`ctx:${percent}%`, color);
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (!ms) return '?';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * Render agent details for multi-line display
 */
function renderAgentDetails(agents: Array<{
  type: string;
  model: 'opus' | 'sonnet' | 'haiku';
  duration: number;
  description: string;
}>, maxLines: number): string[] {
  const lines: string[] = [];
  const displayAgents = agents.slice(0, maxLines);

  for (let i = 0; i < displayAgents.length; i++) {
    const agent = displayAgents[i];
    const isLast = i === displayAgents.length - 1;
    const prefix = isLast ? '└─' : '├─';

    const modelCode = agent.model === 'opus' ? 'O' : agent.model === 'sonnet' ? 's' : 'h';
    const modelColor = agent.model === 'opus' ? 'bright' : 'reset';

    lines.push(
      `${prefix} ${colorize(modelCode, modelColor)} ${colorize(agent.type, 'cyan')} ${colorize(formatDuration(agent.duration), 'dim')} ${agent.description}`
    );
  }

  return lines;
}

/**
 * Main HUD render function
 */
export interface HudConfig {
  preset: 'minimal' | 'focused' | 'full';
  elements: {
    ultraLabel?: boolean;
    phase?: boolean;
    ralph?: boolean;
    qa?: boolean;
    status?: boolean;
    context?: boolean;
    tasks?: boolean;
    agents?: boolean;
    background?: boolean;
    maxOutputLines?: number;
  };
}

export interface RenderContext {
  projectRoot: string;
  contextPercent?: number;
}

export function renderHUD(config: HudConfig, ctx: RenderContext): string {
  const components: string[] = [];
  const elements = config.elements || {};

  // Read all states with proper type annotations
  const autopilot = readState<AutopilotState>(ctx.projectRoot, 'autopilot');
  const ralph = readState<RalphState>(ctx.projectRoot, 'ralph');
  const ultraqa = readState<UltraqaState>(ctx.projectRoot, 'ultraqa');

  // Ultrapilot label
  if (elements.ultraLabel !== false) {
    components.push(colorize('[ULTRA]', 'bright'));
  }

  // Phase indicator
  if (autopilot?.phase && elements.phase !== false) {
    const phaseNames: Record<string, string> = {
      'expansion': 'EXP',
      'planning': 'PLAN',
      'execution': 'EXEC',
      'qa': 'QA',
      'validation': 'VAL',
      'cleanup': 'DONE',
      'cancelled': 'STOP',
      'completed': 'DONE'
    };
    const phaseName = phaseNames[autopilot.phase] || autopilot.phase.toUpperCase();
    components.push(colorize(phaseName, 'cyan'));
  }

  // Ralph iteration
  if (ralph?.iteration && elements.ralph !== false) {
    const maxIter = ralph.maxIterations || 10;
    components.push(`ralph:${ralph.iteration}/${maxIter}`);
  }

  // QA cycle
  if (ultraqa?.cycle && elements.qa !== false) {
    const maxCycles = ultraqa.maxCycles || 10;
    const qaColor = ultraqa.lastError ? 'red' : 'green';
    components.push(colorize(`qa:${ultraqa.cycle}/${maxCycles}`, qaColor));
  }

  // Status
  if (autopilot?.status && elements.status !== false) {
    const statusColors: Record<string, keyof typeof colors> = {
      'running': 'green',
      'paused': 'yellow',
      'completed': 'blue',
      'failed': 'red',
      'cancelled': 'dim'
    };
    const statusColor = statusColors[autopilot.status] || 'reset';
    components.push(colorize(autopilot.status, statusColor));
  }

  // Context usage
  if (ctx.contextPercent !== undefined && elements.context !== false) {
    components.push(renderContext(ctx.contextPercent, config.preset));
  }

  // Tasks
  if (autopilot?.tasks && elements.tasks !== false) {
    const total = autopilot.tasks.total || 0;
    const completed = autopilot.tasks.completed || 0;
    components.push(`tasks:${completed}/${total}`);
  }

  // Agents count
  if (autopilot?.activeAgents && elements.agents !== false) {
    components.push(`agents:${autopilot.activeAgents}`);
  }

  // Background tasks
  if (autopilot?.backgroundTasks && elements.background !== false) {
    const bg = autopilot.backgroundTasks;
    components.push(`bg:${bg.running}/${bg.total}`);
  }

  // Build main output line
  let output = components.join(' ');

  // Add multi-line agent display for full preset
  if (config.preset === 'full' && autopilot?.agentDetails && autopilot.agentDetails.length > 0) {
    const maxLines = elements.maxOutputLines || 4;
    const agentLines = renderAgentDetails(autopilot.agentDetails, maxLines);
    if (agentLines.length > 0) {
      output += '\n' + agentLines.join('\n');
    }
  }

  return output;
}

/**
 * Get default HUD config
 */
export function getDefaultHudConfig(): HudConfig {
  return {
    preset: 'focused',
    elements: {
      ultraLabel: true,
      phase: true,
      ralph: true,
      qa: true,
      status: true,
      context: true,
      tasks: true,
      agents: true,
      background: true,
      maxOutputLines: 4
    }
  };
}
