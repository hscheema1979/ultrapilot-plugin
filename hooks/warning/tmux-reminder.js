#!/usr/bin/env node
/**
 * Tmux Reminder Hook
 *
 * Warns when running long-running commands without tmux.
 * Helps prevent losing work when terminal closes.
 */

import { spawnSync } from 'child_process';

const MAX_STDIN = 1024 * 1024;
let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const cmd = String(input.tool_input?.command || '');

    // Check if already in tmux
    if (process.env.TMUX) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Long-running command patterns
    const longRunningPatterns = [
      /\b(npm|pnpm|yarn|bun)\s+(install|test)\b/,
      /\bcargo\s+(build|test)\b/,
      /\bmake\b/,
      /\bdocker\b/,
      /\b(pytest|vitest|playwright|jest)\b/,
      /\b(npx|pnpm exec|bunx)\s+(playwright|vitest|jest)\b/
    ];

    const isLongRunning = longRunningPatterns.some(pattern => pattern.test(cmd));

    if (isLongRunning && process.platform !== 'win32') {
      console.error('[UltraPilot Hook] Consider running in tmux for session persistence');
      console.error('[UltraPilot Hook] tmux new -s dev  |  tmux attach -t dev');
    }
  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
