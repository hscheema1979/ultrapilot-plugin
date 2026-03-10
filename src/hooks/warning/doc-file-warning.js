#!/usr/bin/env node
/**
 * Doc File Warning Hook
 *
 * Warns about non-standard documentation files.
 */

import path from 'path';

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
    const filePath = String(input.tool_input?.file_path || '');

    if (!filePath) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    const normalized = filePath.replace(/\\/g, '/');
    const basename = path.basename(filePath);

    // Only check .md and .txt files
    if (!/\.(md|txt)$/i.test(filePath)) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Allowed standard doc files
    const allowedFiles = /^(README|CLAUDE|AGENTS|CONTRIBUTING|CHANGELOG|LICENSE|SKILL|MEMORY|WORKLOG|PLAN|SPEC)\.md$/i;

    // Allowed directories
    const allowedDirs = [
      /\.claude\/(commands|plans|projects)\//,
      /(^|\/)(docs|skills|\.history|memory|\.ultra)\//
    ];

    // Allowed patterns
    const allowedPatterns = /\.plan\.md$/i;
    const isPlan = /\b(plan|spec)\.md$/i.test(basename);

    if (allowedFiles.test(basename) ||
        allowedDirs.some(dir => dir.test(normalized)) ||
        allowedPatterns.test(normalized) ||
        isPlan) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Warn about non-standard doc file
    console.error('[UltraPilot Hook] WARNING: Non-standard documentation file detected');
    console.error(`[UltraPilot Hook] File: ${filePath}`);
    console.error('[UltraPilot Hook] Consider consolidating into README.md or docs/ directory');

  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
