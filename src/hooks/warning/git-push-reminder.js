#!/usr/bin/env node
/**
 * Git Push Reminder Hook
 *
 * Warns before git push to review changes.
 */

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

    if (/\bgit\s+push\b/.test(cmd)) {
      console.error('[UltraPilot Hook] Review changes before push...');
      console.error('[UltraPilot Hook] Continuing with push');
    }
  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
