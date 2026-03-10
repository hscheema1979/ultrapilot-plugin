#!/usr/bin/env node
/**
 * Ultrapilot HUD - Statusline CLI
 *
 * Run as: node ~/.claude/plugins/ultrapilot/cli/hud.mjs
 * Reads stdin from Claude Code and outputs formatted statusline
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

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
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function readJson(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

function getContextPercent(stdin) {
  if (!stdin?.context_window) return null;
  const { context_window, max_tokens } = stdin.context_window;
  if (!max_tokens) return null;
  return Math.round((context_window / max_tokens) * 100);
}

function formatDuration(ms) {
  if (!ms) return '?';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function renderProgressBar(percent, width = 8) {
  if (percent === null || percent === undefined) return '[????]';
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}]${percent}%`;
}

function getContextColor(percent) {
  if (percent >= 85) return 'red';
  if (percent >= 70) return 'yellow';
  return 'green';
}

async function main() {
  const home = homedir();
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude');

  // Read stdin from Claude Code
  let stdin;
  try {
    stdin = JSON.parse(readFileSync(0, 'utf8'));
  } catch (e) {
    console.log('[ULTRA] No stdin data');
    return;
  }

  const cwd = stdin.cwd || process.cwd();
  const worktreeRoot = cwd;

  // Read Ultrapilot state
  const autopilotState = readJson(join(worktreeRoot, '.ultra/state/autopilot-state.json'));
  const ralphState = readJson(join(worktreeRoot, '.ultra/state/ralph-state.json'));
  const ultraqaState = readJson(join(worktreeRoot, '.ultra/state/ultraqa-state.json'));
  const hudConfig = readJson(join(configDir, 'ultra-hud-config.json')) ||
                    readJson(join(worktreeRoot, '.ultra/hud-config.json')) ||
                    { preset: 'focused', elements: {} };

  const config = hudConfig.elements || {};
  const preset = hudConfig.preset || 'focused';

  // Build HUD components
  const components = [];

  // Ultrapilot label
  if (config.ultraLabel !== false) {
    components.push(colorize('[ULTRA]', 'bright'));
  }

  // Phase indicator
  if (autopilotState?.phase && config.phase !== false) {
    const phaseNames = {
      'expansion': 'EXP',
      'planning': 'PLAN',
      'execution': 'EXEC',
      'qa': 'QA',
      'validation': 'VAL',
      'cleanup': 'DONE'
    };
    const phaseName = phaseNames[autopilotState.phase] || autopilotState.phase.toUpperCase();
    components.push(colorize(phaseName, 'cyan'));
  }

  // Ralph iteration
  if (ralphState?.iteration && config.ralph !== false) {
    const maxIter = ralphState.maxIterations || 10;
    components.push(`ralph:${ralphState.iteration}/${maxIter}`);
  }

  // QA cycle
  if (ultraqaState?.cycle && config.qa !== false) {
    const maxCycles = ultraqaState.maxCycles || 5;
    const qaColor = ultraqaState.lastError ? 'red' : 'green';
    components.push(colorize(`qa:${ultraqaState.cycle}/${maxCycles}`, qaColor));
  }

  // Status
  if (autopilotState?.status && config.status !== false) {
    const statusColors = {
      'running': 'green',
      'paused': 'yellow',
      'completed': 'blue',
      'failed': 'red',
      'cancelled': 'dim'
    };
    const statusColor = statusColors[autopilotState.status] || 'reset';
    components.push(colorize(autopilotState.status, statusColor));
  }

  // Context usage
  const contextPercent = getContextPercent(stdin);
  if (contextPercent !== null && config.context !== false) {
    if (preset === 'full') {
      components.push(colorize(renderProgressBar(contextPercent), getContextColor(contextPercent)));
    } else {
      components.push(colorize(`ctx:${contextPercent}%`, getContextColor(contextPercent)));
    }
  }

  // Tasks
  if (autopilotState?.tasks && config.tasks !== false) {
    const total = autopilotState.tasks.total || 0;
    const completed = autopilotState.tasks.completed || 0;
    components.push(`tasks:${completed}/${total}`);
  }

  // Agents count
  if (autopilotState?.activeAgents && config.agents !== false) {
    components.push(`agents:${autopilotState.activeAgents}`);
  }

  // Background tasks
  if (autopilotState?.backgroundTasks && config.background !== false) {
    const bg = autopilotState.backgroundTasks;
    components.push(`bg:${bg.running}/${bg.total}`);
  }

  // Build output line
  let output = components.join(' ');

  // Add multi-line agent display for full preset
  if (preset === 'full' && autopilotState?.agentDetails && autopilotState.agentDetails.length > 0) {
    const maxLines = config.maxOutputLines || 4;
    const agents = autopilotState.agentDetails.slice(0, maxLines);

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const isLast = i === agents.length - 1;
      const prefix = isLast ? '└─' : '├─';

      const modelCode = agent.model === 'opus' ? 'O' : agent.model === 'sonnet' ? 's' : 'h';
      const modelColor = agent.model === 'opus' ? 'bright' : 'reset';

      const agentLine = `${prefix} ${colorize(modelCode, modelColor)} ${colorize(agent.type, 'cyan')} ${colorize(formatDuration(agent.duration), 'dim')} ${agent.description}`;
      output += '\n' + agentLine;
    }
  }

  console.log(output);
}

main().catch(console.error);
