#!/usr/bin/env node
/**
 * TODO/FIXME Warning Hook
 *
 * Warns when adding TODO or FIXME comments to code.
 * Prevents incomplete implementations from slipping through.
 */

import fs from 'fs';

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
    const newString = input.tool_input?.new_string || '';

    if (!newString) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Check for TODO/FIXME patterns
    const todoPatterns = [
      /\bTODO\b/i,
      /\bFIXME\b/i,
      /\bHACK\b/i,
      /\bXXX\b/i,
      /\bNOTE\b.*implement/i,
      /\bNOT IMPLEMENTED\b/i
    ];

    const hasTodo = todoPatterns.some(pattern => pattern.test(newString));

    if (hasTodo) {
      // Count occurrences
      const todoCount = (newString.match(/TODO|FIXME|HACK|XXX/gi) || []).length;

      console.error(`[UltraPilot Hook] ⚠️  ${todoCount} TODO/FIXME comment(s) added`);
      console.error('[UltraPilot Hook] Incomplete implementations should NOT be committed');
      console.error('[UltraPilot Hook] Either:');
      console.error('[UltraPilot Hook]   1. Implement the feature now, or');
      console.error('[UltraPilot Hook]   2. Create a GitHub issue to track the TODO');
      console.error('[UltraPilot Hook] Do NOT commit incomplete code with TODOs');
    }

  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
