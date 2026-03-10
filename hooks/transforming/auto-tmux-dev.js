#!/usr/bin/env node
/**
 * Auto-Tmux Dev Hook
 *
 * Automatically runs dev servers in tmux/cmd (non-blocking).
 * macOS/Linux: tmux
 * Windows: cmd window
 */

import path from 'path';
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
    const cmd = input.tool_input?.command || '';

    // Detect dev server commands
    const devServerRegex = /(npm run dev\b|pnpm( run)? dev\b|yarn dev\b|bun run dev\b)/;

    if (devServerRegex.test(cmd)) {
      // Get session name from current directory
      const rawName = path.basename(process.cwd());
      const sessionName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'dev';

      if (process.platform === 'win32') {
        // Windows: open in new cmd window
        const escapedCmd = cmd.replace(/"/g, '""');
        input.tool_input.command = `start "DevServer-${sessionName}" cmd /k "${escapedCmd}"`;
      } else {
        // Unix: Check tmux is available
        const tmuxCheck = spawnSync('which', ['tmux'], { encoding: 'utf8' });
        if (tmuxCheck.status === 0) {
          // Escape single quotes for shell safety
          const escapedCmd = cmd.replace(/'/g, "'\\''");

          // Build transformed command
          const transformedCmd = `SESSION="${sessionName}"; tmux kill-session -t "$SESSION" 2>/dev/null || true; tmux new-session -d -s "$SESSION" '${escapedCmd}' && echo "[UltraPilot Hook] Dev server started in tmux session '${sessionName}'. View logs: tmux capture-pane -t ${sessionName} -p -S -100"`;

          input.tool_input.command = transformedCmd;
        }
        // else: tmux not found, pass through
      }
    }

    process.stdout.write(JSON.stringify(input));
  } catch (e) {
    // Invalid input - pass through
    process.stdout.write(raw);
  }

  process.exit(0);
});
