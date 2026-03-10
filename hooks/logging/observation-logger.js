#!/usr/bin/env node
/**
 * Observation Logger Hook
 *
 * Logs tool usage for continuous learning.
 * Runs asynchronously in background.
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

    // Log tool usage ( lightweight, just tool name)
    const toolName = input.tool_name || 'unknown';
    const timestamp = new Date().toISOString();

    // Write to ultra observation log
    const fs = require('fs');
    const path = require('path');
    const obsDir = path.join(process.env.HOME, '.ultra', 'observations');

    try {
      if (!fs.existsSync(obsDir)) {
        fs.mkdirSync(obsDir, { recursive: true });
      }

      const obsFile = path.join(obsDir, `tool-usage-${new Date().toISOString().split('T')[0]}.jsonl`);
      const logEntry = JSON.stringify({
        timestamp,
        tool: toolName,
        type: 'pre-tool-use'
      }) + '\n';

      fs.appendFileSync(obsFile, logEntry);
    } catch (e) {
      // Ignore logging errors - don't break the hook
    }

  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
