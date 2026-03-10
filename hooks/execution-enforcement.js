#!/usr/bin/env node
/**
 * UltraPilot Execution Enforcement Hook
 *
 * Ensures all code modifications (Edit, Write) go through UltraPilot or UltraWork orchestration.
 * This prevents accidental direct tool usage that bypasses the orchestration layer.
 *
 * Pattern: Based on everything-claude-code PreToolUse hooks
 * - Exit code 0: Allow operation (pass through stdin)
 * - Exit code 2: BLOCK operation
 * - stderr: Show error message
 *
 * Environment variables:
 * - ULTRA_EXECUTION_MODE: Set to "ultrapilot" or "ultrawork" by orchestrator skills
 * - ULTRA_EXECUTION_OVERRIDE: Set to "true" for emergency direct edits
 */

import fs from 'fs';
import path from 'path';

const MAX_STDIN = 1024 * 1024;

// State file to track execution mode
const STATE_FILE = path.join(process.env.HOME, '.ultra', '.execution-mode');

function getExecutionMode() {
  // Check environment variable first (set by orchestrator skills)
  if (process.env.ULTRA_EXECUTION_MODE) {
    return process.env.ULTRA_EXECUTION_MODE;
  }

  // Fallback: Check state file
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Mode is valid if set within last 60 minutes
      if (state.mode && state.timestamp) {
        const age = Date.now() - state.timestamp;
        if (age < 60 * 60 * 1000) { // 1 hour
          return state.mode;
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }

  return null;
}

function isOverrideEnabled() {
  return process.env.ULTRA_EXECUTION_OVERRIDE === 'true';
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    const remaining = MAX_STDIN - raw.length;
    raw += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const toolName = String(input.tool_name || '');

    // Only enforce on write operations
    const isWriteOperation = ['Edit', 'Write', 'MultiEdit'].includes(toolName);

    if (!isWriteOperation) {
      // Read-only operations are always allowed
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Check for emergency override
    if (isOverrideEnabled()) {
      console.error('[UltraPilot] ⚠️  EXECUTION OVERRIDE ACTIVE - Direct write allowed');
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Check if we're in an authorized execution mode
    const mode = getExecutionMode();

    if (!mode) {
      console.error('[UltraPilot] ❌ BLOCKED: Code modifications require orchestration');
      console.error('[UltraPilot] Use /ultrapilot or /ultra-ultrawork for code changes');
      console.error('[UltraPilot] Emergency override: ULTRA_EXECUTION_OVERRIDE=true');
      process.exit(2);
      return;
    }

    // Verify the mode is valid
    if (!['ultrapilot', 'ultrawork'].includes(mode)) {
      console.error(`[UltraPilot] ❌ BLOCKED: Invalid execution mode: ${mode}`);
      console.error('[UltraPilot] Valid modes: ultrapilot, ultrawork');
      process.exit(2);
      return;
    }

    // Authorized write operation
    process.stdout.write(raw);
    process.exit(0);

  } catch (e) {
    // Parse errors - pass through to avoid breaking everything
    process.stdout.write(raw);
    process.exit(0);
  }
});
